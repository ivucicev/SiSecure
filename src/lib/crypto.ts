import { db, type Contact, type OlmSessionRecord } from './db';
import { Olm, pickleKeyFor } from './olm';

type OlmAccount = InstanceType<typeof Olm.Account>;
type OlmSession = InstanceType<typeof Olm.Session>;

const OTK_TOP_UP_THRESHOLD = 5;
const OTK_GENERATE_BATCH = 20;

// ---------------------------------------------------------------------------
// Account (identity)
// ---------------------------------------------------------------------------

export async function loadOrCreateOlmAccount(profileId: string): Promise<OlmAccount> {
  const profile = await db.profile.get(profileId);
  const account = new Olm.Account();

  if (profile?.olmAccountPickle) {
    account.unpickle(pickleKeyFor(profileId), profile.olmAccountPickle);
    return account;
  }

  account.create();
  account.generate_one_time_keys(OTK_GENERATE_BATCH);
  await persistAccount(profileId, account);
  return account;
}

export async function persistAccount(profileId: string, account: OlmAccount, handedOutOtkIds?: string[]): Promise<void> {
  const identityKeys = JSON.parse(account.identity_keys()) as { curve25519: string; ed25519: string };
  const pickle = account.pickle(pickleKeyFor(profileId));

  await db.profile.update(profileId, {
    olmAccountPickle: pickle,
    olmCurve25519Key: identityKeys.curve25519,
    olmEd25519Key: identityKeys.ed25519,
    ...(handedOutOtkIds ? { olmHandedOutOtkIds: handedOutOtkIds } : {})
  });
}

// Picks one not-yet-offered one-time key to send in an outgoing HELLO. Tracks
// "handed out" locally rather than calling account.mark_keys_as_published() —
// that API models a server-arbitrated prekey workflow this app doesn't have;
// using it here would mark the whole pregenerated batch published after the
// very first HELLO and starve every other contact.
export async function claimOneTimeKeyForHello(
  profileId: string,
  account: OlmAccount
): Promise<{ keyId: string; key: string } | undefined> {
  const profile = await db.profile.get(profileId);
  const handedOut = new Set(profile?.olmHandedOutOtkIds || []);

  let otks = (JSON.parse(account.one_time_keys()).curve25519 || {}) as Record<string, string>;
  let unused = Object.entries(otks).filter(([keyId]) => !handedOut.has(keyId));

  if (unused.length <= OTK_TOP_UP_THRESHOLD) {
    account.generate_one_time_keys(OTK_GENERATE_BATCH);
    otks = (JSON.parse(account.one_time_keys()).curve25519 || {}) as Record<string, string>;
    unused = Object.entries(otks).filter(([keyId]) => !handedOut.has(keyId));
  }

  const entry = unused[0];
  if (!entry) return undefined;

  const [keyId, key] = entry;
  handedOut.add(keyId);

  // Prune handed-out ids no longer present in the live key set so this list
  // doesn't grow forever.
  const liveIds = new Set(Object.keys(otks));
  const prunedHandedOut = Array.from(handedOut).filter(id => liveIds.has(id));

  await persistAccount(profileId, account, prunedHandedOut);

  return { keyId, key };
}

// ---------------------------------------------------------------------------
// Pairwise sessions (Double Ratchet)
// ---------------------------------------------------------------------------

function unpickleSession(profileId: string, pickle: string): OlmSession {
  const session = new Olm.Session();
  session.unpickle(pickleKeyFor(profileId), pickle);
  return session;
}

async function persistPairwiseSession(
  profileId: string,
  contactPublicKey: string,
  session: OlmSession,
  initiatedByMe: boolean
): Promise<void> {
  const record: OlmSessionRecord = {
    contactPublicKey,
    pickle: session.pickle(pickleKeyFor(profileId)),
    initiatedByMe,
    updatedAt: Date.now()
  };
  await db.olmSessions.put(record);
}

export async function encryptToContact(
  profileId: string,
  account: OlmAccount,
  contact: Contact,
  plaintext: string
): Promise<{ olmType: 0 | 1; body: string }> {
  const record = await db.olmSessions.get(contact.publicKey);
  let session: OlmSession;
  let initiatedByMe: boolean;

  if (record) {
    session = unpickleSession(profileId, record.pickle);
    initiatedByMe = record.initiatedByMe;
  } else {
    if (!contact.olmIdentityKey || !contact.olmOneTimeKey) {
      throw new Error('missing-identity-key');
    }
    session = new Olm.Session();
    session.create_outbound(account, contact.olmIdentityKey, contact.olmOneTimeKey.key);
    initiatedByMe = true;
  }

  const cipher = session.encrypt(plaintext);
  await persistPairwiseSession(profileId, contact.publicKey, session, initiatedByMe);

  return { olmType: cipher.type, body: cipher.body };
}

// Resolves session "glare" (both sides independently create_outbound to each other
// at the same moment) deterministically, without any extra communication: the
// lower publicKey's self-initiated session wins and stays canonical on both ends —
// see OlmSessionRecord.initiatedByMe.
export async function decryptFromContact(
  profileId: string,
  myPublicKey: string,
  account: OlmAccount,
  senderPublicKey: string,
  olmType: 0 | 1,
  body: string
): Promise<string> {
  const record = await db.olmSessions.get(senderPublicKey);

  if (record) {
    const session = unpickleSession(profileId, record.pickle);

    if (olmType === 1 || session.matches_inbound(body)) {
      const plaintext = session.decrypt(olmType, body);
      await persistPairwiseSession(profileId, senderPublicKey, session, record.initiatedByMe);
      return plaintext;
    }

    // Genuine glare: this PreKey message doesn't belong to our existing session.
    // Must still decrypt it with a fresh inbound session to read it, then decide
    // which session survives as canonical going forward.
    const inboundSession = new Olm.Session();
    inboundSession.create_inbound(account, body);
    const plaintext = inboundSession.decrypt(olmType, body);
    account.remove_one_time_keys(inboundSession);
    await persistAccount(profileId, account);

    const keepMyExisting = record.initiatedByMe && myPublicKey < senderPublicKey;
    if (!keepMyExisting) {
      await persistPairwiseSession(profileId, senderPublicKey, inboundSession, false);
    }

    return plaintext;
  }

  if (olmType !== 0) {
    throw new Error('no-session-for-ratchet-message');
  }

  const session = new Olm.Session();
  session.create_inbound(account, body);
  const plaintext = session.decrypt(olmType, body);
  account.remove_one_time_keys(session);
  await persistAccount(profileId, account);
  await persistPairwiseSession(profileId, senderPublicKey, session, false);

  return plaintext;
}

// ---------------------------------------------------------------------------
// Group sessions (Megolm) — bootstrapped by distributing the session key over
// each member's pairwise Olm session (same pattern Matrix uses for room keys).
// ---------------------------------------------------------------------------

export async function ensureOutboundGroupSession(
  groupId: string,
  profileId: string
): Promise<{ sessionKey: string; isNew: boolean }> {
  const existing = await db.megolmOutboundSessions.get(groupId);
  if (existing) {
    const session = new Olm.OutboundGroupSession();
    session.unpickle(pickleKeyFor(profileId), existing.pickle);
    return { sessionKey: session.session_key(), isNew: false };
  }

  const session = new Olm.OutboundGroupSession();
  session.create();
  await db.megolmOutboundSessions.put({
    groupId,
    pickle: session.pickle(pickleKeyFor(profileId)),
    updatedAt: Date.now()
  });

  return { sessionKey: session.session_key(), isNew: true };
}

export async function rotateOutboundGroupSession(groupId: string, profileId: string): Promise<string> {
  const session = new Olm.OutboundGroupSession();
  session.create();
  await db.megolmOutboundSessions.put({
    groupId,
    pickle: session.pickle(pickleKeyFor(profileId)),
    updatedAt: Date.now()
  });
  return session.session_key();
}

export async function encryptGroupMessage(groupId: string, profileId: string, plaintext: string): Promise<string> {
  const record = await db.megolmOutboundSessions.get(groupId);
  if (!record) throw new Error('no-outbound-group-session');

  const session = new Olm.OutboundGroupSession();
  session.unpickle(pickleKeyFor(profileId), record.pickle);
  const ciphertext = session.encrypt(plaintext);

  await db.megolmOutboundSessions.put({
    groupId,
    pickle: session.pickle(pickleKeyFor(profileId)),
    updatedAt: Date.now()
  });

  return ciphertext;
}

export async function ingestGroupKey(
  groupId: string,
  senderPublicKey: string,
  sessionKey: string,
  profileId: string
): Promise<void> {
  const session = new Olm.InboundGroupSession();
  session.create(sessionKey);

  await db.megolmInboundSessions.put({
    id: `${groupId}:${senderPublicKey}`,
    groupId,
    senderPublicKey,
    pickle: session.pickle(pickleKeyFor(profileId)),
    updatedAt: Date.now()
  });
}

export async function decryptGroupMessage(
  groupId: string,
  senderPublicKey: string,
  ciphertext: string,
  profileId: string
): Promise<string> {
  const id = `${groupId}:${senderPublicKey}`;
  const record = await db.megolmInboundSessions.get(id);
  if (!record) throw new Error('no-inbound-group-session');

  const session = new Olm.InboundGroupSession();
  session.unpickle(pickleKeyFor(profileId), record.pickle);
  const result = session.decrypt(ciphertext);

  await db.megolmInboundSessions.put({
    id,
    groupId,
    senderPublicKey,
    pickle: session.pickle(pickleKeyFor(profileId)),
    updatedAt: Date.now()
  });

  return result.plaintext;
}
