import { db, type Contact, type OlmSessionRecord } from './db';
import { Olm, pickleKeyFor } from './olm';

type OlmAccount = InstanceType<typeof Olm.Account>;
type OlmSession = InstanceType<typeof Olm.Session>;

const OTK_TOP_UP_THRESHOLD = 5;
const OTK_GENERATE_BATCH = 20;

// libolm's WASM build can trap (RangeError deep inside the WASM heap, which
// then corrupts the whole Olm instance for the rest of the page session) when
// create_inbound() has to establish a brand-new session directly from a large
// first message — confirmed failing around ~2MB, so this stays well clear of
// that with margin. An already-established session's ordinary decrypt() has
// no such issue at any size tested. Photos/videos/files are always well over
// this; ordinary text never is.
const LARGE_PAYLOAD_THRESHOLD = 32 * 1024;

// ---------------------------------------------------------------------------
// Per-key serialization. Every session type below does an async
// load-mutate-persist cycle (unpickle from IndexedDB, encrypt/decrypt —
// which advances the ratchet — then pickle + save). If two calls for the
// *same* session overlap (e.g. two messages sent back-to-back before the
// first one's persist finishes), both would load the same stale state,
// advance independently, and desync — the receiver decrypts the first fine
// then fails the second, exactly the "key not yet received" symptom this
// fixes. withLock forces overlapping calls for the same key to run strictly
// one after another.
// ---------------------------------------------------------------------------

const locks = new Map<string, Promise<unknown>>();

function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prior = locks.get(key) ?? Promise.resolve();
  const run = prior.then(fn, fn);
  locks.set(key, run.then(() => undefined, () => undefined));
  return run;
}

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
  return withLock(`account-otk:${profileId}`, async () => {
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
  });
}

// ---------------------------------------------------------------------------
// Pairwise sessions (Double Ratchet)
// ---------------------------------------------------------------------------

// Live session objects, cached in memory once loaded so repeated
// encrypt/decrypt calls for the same contact reuse the same instance instead
// of re-unpickling (potentially stale) bytes from IndexedDB each time.
const pairwiseCache = new Map<string, { session: OlmSession; initiatedByMe: boolean }>();

async function loadPairwiseSession(
  profileId: string,
  contactPublicKey: string
): Promise<{ session: OlmSession; initiatedByMe: boolean } | undefined> {
  const cached = pairwiseCache.get(contactPublicKey);
  if (cached) return cached;

  const record = await db.olmSessions.get(contactPublicKey);
  if (!record) return undefined;

  const session = new Olm.Session();
  session.unpickle(pickleKeyFor(profileId), record.pickle);
  const entry = { session, initiatedByMe: record.initiatedByMe };
  pairwiseCache.set(contactPublicKey, entry);
  return entry;
}

async function savePairwiseSession(
  profileId: string,
  contactPublicKey: string,
  session: OlmSession,
  initiatedByMe: boolean
): Promise<void> {
  pairwiseCache.set(contactPublicKey, { session, initiatedByMe });

  const record: OlmSessionRecord = {
    contactPublicKey,
    pickle: session.pickle(pickleKeyFor(profileId)),
    initiatedByMe,
    updatedAt: Date.now()
  };
  await db.olmSessions.put(record);
}

// Returns one cipher normally, or two when a brand-new session is being
// established with a large first payload: [establishCipher, realCipher].
// Callers must send establishCipher (if present) as a P2P_SESSION_INIT the
// receiver decrypts-and-discards, immediately followed by realCipher as the
// actual P2P_MSG — see LARGE_PAYLOAD_THRESHOLD for why.
export async function encryptToContact(
  profileId: string,
  account: OlmAccount,
  contact: Contact,
  plaintext: string
): Promise<Array<{ olmType: 0 | 1; body: string }>> {
  return withLock(`pairwise:${contact.publicKey}`, async () => {
    const existing = await loadPairwiseSession(profileId, contact.publicKey);
    const ciphers: Array<{ olmType: 0 | 1; body: string }> = [];
    let session: OlmSession;
    let initiatedByMe: boolean;

    if (existing) {
      session = existing.session;
      initiatedByMe = existing.initiatedByMe;
    } else {
      if (!contact.olmIdentityKey || !contact.olmOneTimeKey) {
        throw new Error('missing-identity-key');
      }
      session = new Olm.Session();
      session.create_outbound(account, contact.olmIdentityKey, contact.olmOneTimeKey.key);
      initiatedByMe = true;

      if (plaintext.length > LARGE_PAYLOAD_THRESHOLD) {
        const establish = session.encrypt('');
        ciphers.push({ olmType: establish.type, body: establish.body });
      }
    }

    const cipher = session.encrypt(plaintext);
    ciphers.push({ olmType: cipher.type, body: cipher.body });

    await savePairwiseSession(profileId, contact.publicKey, session, initiatedByMe);

    return ciphers;
  });
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
  return withLock(`pairwise:${senderPublicKey}`, async () => {
    const existing = await loadPairwiseSession(profileId, senderPublicKey);

    if (existing) {
      const { session, initiatedByMe } = existing;

      if (olmType === 1 || session.matches_inbound(body)) {
        const plaintext = session.decrypt(olmType, body);
        await savePairwiseSession(profileId, senderPublicKey, session, initiatedByMe);
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

      const keepMyExisting = initiatedByMe && myPublicKey < senderPublicKey;
      if (!keepMyExisting) {
        await savePairwiseSession(profileId, senderPublicKey, inboundSession, false);
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
    await savePairwiseSession(profileId, senderPublicKey, session, false);

    return plaintext;
  });
}

// ---------------------------------------------------------------------------
// Group sessions (Megolm) — bootstrapped by distributing the session key over
// each member's pairwise Olm session (same pattern Matrix uses for room keys).
// Same in-memory caching + per-key locking as pairwise sessions above, for
// the same reason (concurrent group messages must not race on the pickle).
// ---------------------------------------------------------------------------

const megolmOutboundCache = new Map<string, InstanceType<typeof Olm.OutboundGroupSession>>();
const megolmInboundCache = new Map<string, InstanceType<typeof Olm.InboundGroupSession>>();

export async function ensureOutboundGroupSession(
  groupId: string,
  profileId: string
): Promise<{ sessionKey: string; isNew: boolean }> {
  return withLock(`mout:${groupId}`, async () => {
    const cached = megolmOutboundCache.get(groupId);
    if (cached) return { sessionKey: cached.session_key(), isNew: false };

    const existing = await db.megolmOutboundSessions.get(groupId);
    if (existing) {
      const session = new Olm.OutboundGroupSession();
      session.unpickle(pickleKeyFor(profileId), existing.pickle);
      megolmOutboundCache.set(groupId, session);
      return { sessionKey: session.session_key(), isNew: false };
    }

    const session = new Olm.OutboundGroupSession();
    session.create();
    megolmOutboundCache.set(groupId, session);
    await db.megolmOutboundSessions.put({
      groupId,
      pickle: session.pickle(pickleKeyFor(profileId)),
      updatedAt: Date.now()
    });

    return { sessionKey: session.session_key(), isNew: true };
  });
}

export async function rotateOutboundGroupSession(groupId: string, profileId: string): Promise<string> {
  return withLock(`mout:${groupId}`, async () => {
    const session = new Olm.OutboundGroupSession();
    session.create();
    megolmOutboundCache.set(groupId, session);
    await db.megolmOutboundSessions.put({
      groupId,
      pickle: session.pickle(pickleKeyFor(profileId)),
      updatedAt: Date.now()
    });
    return session.session_key();
  });
}

export async function encryptGroupMessage(groupId: string, profileId: string, plaintext: string): Promise<string> {
  return withLock(`mout:${groupId}`, async () => {
    let session = megolmOutboundCache.get(groupId);
    if (!session) {
      const record = await db.megolmOutboundSessions.get(groupId);
      if (!record) throw new Error('no-outbound-group-session');
      session = new Olm.OutboundGroupSession();
      session.unpickle(pickleKeyFor(profileId), record.pickle);
      megolmOutboundCache.set(groupId, session);
    }

    const ciphertext = session.encrypt(plaintext);

    await db.megolmOutboundSessions.put({
      groupId,
      pickle: session.pickle(pickleKeyFor(profileId)),
      updatedAt: Date.now()
    });

    return ciphertext;
  });
}

export async function ingestGroupKey(
  groupId: string,
  senderPublicKey: string,
  sessionKey: string,
  profileId: string
): Promise<void> {
  const id = `${groupId}:${senderPublicKey}`;
  await withLock(`min:${id}`, async () => {
    const session = new Olm.InboundGroupSession();
    session.create(sessionKey);
    megolmInboundCache.set(id, session);

    await db.megolmInboundSessions.put({
      id,
      groupId,
      senderPublicKey,
      pickle: session.pickle(pickleKeyFor(profileId)),
      updatedAt: Date.now()
    });
  });
}

export async function decryptGroupMessage(
  groupId: string,
  senderPublicKey: string,
  ciphertext: string,
  profileId: string
): Promise<string> {
  const id = `${groupId}:${senderPublicKey}`;
  return withLock(`min:${id}`, async () => {
    let session = megolmInboundCache.get(id);
    if (!session) {
      const record = await db.megolmInboundSessions.get(id);
      if (!record) throw new Error('no-inbound-group-session');
      session = new Olm.InboundGroupSession();
      session.unpickle(pickleKeyFor(profileId), record.pickle);
      megolmInboundCache.set(id, session);
    }

    const result = session.decrypt(ciphertext);

    await db.megolmInboundSessions.put({
      id,
      groupId,
      senderPublicKey,
      pickle: session.pickle(pickleKeyFor(profileId)),
      updatedAt: Date.now()
    });

    return result.plaintext;
  });
}

// ---------------------------------------------------------------------------
// Re-pickling everything under a different key — used when turning the vault
// PIN on/off (src/lib/vault.ts) or changing it. Pickles aren't tied to a
// specific key the way a password-hash is; Olm's pickle()/unpickle() will
// happily unpickle with any key you unpickled it with last and re-pickle
// with any other, so this is just "decrypt everything with the old key,
// re-encrypt with the new one" applied to every stored session plus the
// account itself. Takes explicit old/new key strings rather than reading
// vault.ts's ambient state, so the caller controls exactly when each applies
// (typically: read the old key, flip the vault state, read the new key,
// then call this — see SettingsModal.tsx).
export async function repickleAllSessions(profileId: string, oldKey: string, newKey: string): Promise<void> {
  const profile = await db.profile.get(profileId);
  if (profile?.olmAccountPickle) {
    const account = new Olm.Account();
    account.unpickle(oldKey, profile.olmAccountPickle);
    await db.profile.update(profileId, { olmAccountPickle: account.pickle(newKey) });
  }

  const pairwiseRecords = await db.olmSessions.toArray();
  for (const record of pairwiseRecords) {
    const session = new Olm.Session();
    session.unpickle(oldKey, record.pickle);
    const pickle = session.pickle(newKey);
    await db.olmSessions.put({ ...record, pickle });
    const cached = pairwiseCache.get(record.contactPublicKey);
    if (cached) cached.session = session;
  }

  const outboundRecords = await db.megolmOutboundSessions.toArray();
  for (const record of outboundRecords) {
    const session = new Olm.OutboundGroupSession();
    session.unpickle(oldKey, record.pickle);
    const pickle = session.pickle(newKey);
    await db.megolmOutboundSessions.put({ ...record, pickle });
    megolmOutboundCache.set(record.groupId, session);
  }

  const inboundRecords = await db.megolmInboundSessions.toArray();
  for (const record of inboundRecords) {
    const session = new Olm.InboundGroupSession();
    session.unpickle(oldKey, record.pickle);
    const pickle = session.pickle(newKey);
    await db.megolmInboundSessions.put({ ...record, pickle });
    megolmInboundCache.set(record.id, session);
  }
}
