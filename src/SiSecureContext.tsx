import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import { db, type UserProfile, type Contact, type Message, type AppSettings, type Group } from './lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateId } from './lib/utils';
import { initOlm, Olm } from './lib/olm';
import {
  encryptField,
  decryptField,
  setupPinLegacy,
  wrapMasterKeyWithPin,
  wrapMasterKeyWithPrf,
  generateMasterKey,
  adoptVaultKey,
  getCurrentVaultKeyBytes,
  lockVault,
  getVaultPickleKeyMaterial
} from './lib/vault';
import { isPlatformAuthenticatorAvailable, registerBiometric, getPrfOutput } from './lib/webauthn';
import {
  loadOrCreateOlmAccount,
  claimOneTimeKeyForHello,
  encryptToContact,
  decryptFromContact,
  ensureOutboundGroupSession,
  rotateOutboundGroupSession,
  encryptGroupMessage,
  decryptGroupMessage,
  ingestGroupKey,
  repickleAllSessions
} from './lib/crypto';

type OlmAccount = InstanceType<typeof Olm.Account>;

// At-rest encryption (src/lib/vault.ts) is separate from, and layered on
// top of, the P2P wire encryption (Double Ratchet) messages already went
// through in transit — this is about what sits in Dexie afterward, not
// about the connection. No-ops (returns the value unchanged) when no PIN
// is set, so this is safe to call unconditionally on every read/write.
async function encryptMessageForStorage(message: Message): Promise<Message> {
  return {
    ...message,
    content: await encryptField(message.content),
    mediaUrl: message.mediaUrl != null ? await encryptField(message.mediaUrl) : undefined
  };
}

async function decryptMessageForDisplay(message: Message): Promise<Message> {
  return {
    ...message,
    content: await decryptField(message.content),
    mediaUrl: message.mediaUrl != null ? await decryptField(message.mediaUrl) : undefined
  };
}

interface SiSecureContextType {
  profile: UserProfile | undefined;
  settings: AppSettings | undefined;
  contacts: Contact[];
  groups: Group[];
  messages: Message[];
  isLoading: boolean;
  createProfile: (name: string) => Promise<void>;
  typingStatus: { [publicKey: string]: boolean };
  sendTypingSignal: (recipientPublicKey: string, isTyping: boolean) => void;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  updateSettings: (data: Partial<AppSettings>) => Promise<void>;
  enableVaultPin: (pin: string) => Promise<void>;
  disableVaultPin: () => Promise<void>;
  enableBiometricLock: () => Promise<{ prfSupported: boolean }>;
  disableBiometricLock: () => Promise<void>;
  addContact: (contact: Omit<Contact, 'id' | 'addedAt' | 'lastSeen' | 'isOnline'>) => Promise<string>;
  acceptContact: (contactId: string) => Promise<void>;
  declineContact: (contactId: string) => Promise<void>;
  verifyContact: (contactId: string) => Promise<void>;
  connectToContact: (targetPublicKey: string) => void;
  sendMessage: (recipientPublicKey: string, content: string, type?: Message['type'], mediaUrl?: string, isGroup?: boolean) => Promise<void>;
  createGroup: (name: string, members: string[]) => Promise<string>;
  addMemberToGroup: (groupId: string, memberPublicKey: string) => Promise<void>;
  forwardMessage: (messageId: string, recipientPublicKeys: string[]) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  reactToMessage: (messageId: string, emoji: string) => Promise<void>;
  markAsRead: (messageId: string) => Promise<void>;
  lightNuke: () => Promise<void>;
  fullNuke: () => Promise<void>;
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => void;
}

const SiSecureContext = createContext<SiSecureContextType | undefined>(undefined);

export const SiSecureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [olmReady, setOlmReady] = useState(false);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null); // This is now the contact's publicKey

  const [typingStatus, setTypingStatus] = useState<{ [key: string]: boolean }>({});

  const profiles = useLiveQuery(() => db.profile.toArray());
  const profile = profiles?.length ? profiles[0] : (profiles ? null : undefined);

  const settingsArray = useLiveQuery(() => db.settings.toArray());
  const settings = settingsArray?.length ? settingsArray[0] : (settingsArray ? null : undefined);

  const contacts = useLiveQuery(() => db.contacts.toArray()) || [];
  const groups = useLiveQuery(() => db.groups.toArray()) || [];

  const messages = useLiveQuery(async () => {
    if (!profile || !currentChatId) return [];

    const isGroup = await db.groups.get(currentChatId);
    const rows = isGroup
      ? await db.messages.where('groupId').equals(currentChatId).sortBy('timestamp')
      : (await db.messages
          .where('senderPublicKey').equals(currentChatId)
          .or('recipientPublicKey').equals(currentChatId)
          .sortBy('timestamp')).filter(m => !m.groupId);

    return Promise.all(rows.map(decryptMessageForDisplay));
  }
  , [currentChatId, profile?.publicKey]) || [];

  // Refs so long-lived Peer/connection handlers always see the latest profile/settings
  // without needing to tear down and recreate live WebRTC connections on every change.
  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const pendingConnectRef = useRef<Map<string, Promise<DataConnection>>>(new Map());
  const profileRef = useRef<UserProfile | null | undefined>(profile);
  const settingsRef = useRef<AppSettings | null | undefined>(settings);
  const olmAccountRef = useRef<OlmAccount | null>(null);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const helloWaitersRef = useRef<Map<string, Array<() => void>>>(new Map());

  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    initOlm().then(() => setOlmReady(true)).catch((err) => {
      console.error('[SiSecure] Olm init failed', err);
    });
  }, []);

  useEffect(() => {
    if (profiles !== undefined && settingsArray !== undefined) {
      setIsLoading(false);

      if (settingsArray.length === 0 && profiles.length > 0) {
        db.settings.add({
          id: 'default',
          autoPrune: true,
          pruneRetentionDays: 7,
          stealthMode: false,
          biometricLock: false,
          theme: 'dark',
          lastActiveAt: Date.now(),
          autoNukeEnabled: false,
          autoNukeLightDays: 3,
          autoNukeFullDays: 7
        });
      }
    }
  }, [profiles, settingsArray]);

  // Inactivity-triggered nuke: runs once per app load, after settings first
  // resolve. Silent by design — the user configured this ahead of time, so
  // there's no confirmation prompt to show.
  useEffect(() => {
    if (!settings) return;

    (async () => {
      const now = Date.now();

      if (settings.autoNukeEnabled && settings.lastActiveAt) {
        const daysSince = (now - settings.lastActiveAt) / (24 * 60 * 60 * 1000);
        const fullDays = settings.autoNukeFullDays ?? 7;
        const lightDays = settings.autoNukeLightDays ?? 3;

        if (daysSince >= fullDays) {
          await fullNuke();
        } else if (daysSince >= lightDays) {
          await lightNuke();
        }
      }

      await db.settings.update(settings.id, { lastActiveAt: now });
    })();
  }, [settings?.id]);

  useEffect(() => {
    if (settings?.autoPrune) {
      const pruneOldMessages = async () => {
        const threshold = Date.now() - (settings.pruneRetentionDays * 24 * 60 * 60 * 1000);
        const oldMessagesCount = await db.messages.where('timestamp').below(threshold).count();
        if (oldMessagesCount > 0) {
          await db.messages.where('timestamp').below(threshold).delete();
        }
      };

      pruneOldMessages();
      const interval = setInterval(pruneOldMessages, 1000 * 60 * 60);
      return () => clearInterval(interval);
    }
  }, [settings?.autoPrune, settings?.pruneRetentionDays]);

  const markContactOnline = async (publicKey: string) => {
    const existing = await db.contacts.where('publicKey').equals(publicKey).first();
    if (existing) {
      await db.contacts.update(existing.id, { isOnline: true, lastSeen: Date.now() });
    }
  };

  const markContactOffline = async (publicKey: string) => {
    const existing = await db.contacts.where('publicKey').equals(publicKey).first();
    if (existing) {
      await db.contacts.update(existing.id, { isOnline: false, lastSeen: Date.now() });
    }
  };

  const resolveHelloWaiters = (publicKey: string) => {
    const waiters = helloWaitersRef.current.get(publicKey);
    if (waiters) {
      waiters.forEach(resolve => resolve());
      helloWaitersRef.current.delete(publicKey);
    }
  };

  // Bounded wait for a contact's Olm identity key to arrive via their HELLO —
  // required before we can encrypt anything to them. Never falls back to sending
  // plaintext; callers must skip the send on timeout and let the retry loop
  // pick it up once the key is known.
  const waitForIdentityKey = async (targetPublicKey: string, timeoutMs = 5000): Promise<string | undefined> => {
    const existing = await db.contacts.get({ publicKey: targetPublicKey });
    if (existing?.olmIdentityKey) return existing.olmIdentityKey;

    await new Promise<void>((resolve) => {
      const list = helloWaitersRef.current.get(targetPublicKey) || [];
      list.push(resolve);
      helloWaitersRef.current.set(targetPublicKey, list);

      setTimeout(() => {
        const stillWaiting = helloWaitersRef.current.get(targetPublicKey);
        if (stillWaiting) {
          const idx = stillWaiting.indexOf(resolve);
          if (idx > -1) stillWaiting.splice(idx, 1);
          if (stillWaiting.length === 0) helloWaitersRef.current.delete(targetPublicKey);
        }
        resolve();
      }, timeoutMs);
    });

    const after = await db.contacts.get({ publicKey: targetPublicKey });
    return after?.olmIdentityKey;
  };

  const upsertContact = async (
    publicKey: string,
    displayName?: string,
    olm?: { identityKey: string; oneTimeKey?: { keyId: string; key: string } }
  ) => {
    if (!profileRef.current || publicKey === profileRef.current.publicKey) return;

    const olmFields = olm
      ? { olmIdentityKey: olm.identityKey, ...(olm.oneTimeKey ? { olmOneTimeKey: olm.oneTimeKey } : {}) }
      : {};

    const existing = await db.contacts.get({ publicKey });
    if (!existing) {
      // upsertContact only ever runs for contacts *we* didn't deliberately
      // add ourselves (that path is addContact, below, which marks
      // 'accepted' immediately) — someone connecting to us and sending a
      // HELLO, or a group invite from someone not already a contact.
      // Anyone with our public key can otherwise silently add themselves;
      // 'pending' keeps them out of the visible contact list / chat until
      // we explicitly review and accept them.
      await db.contacts.add({
        id: generateId(),
        displayName: displayName || publicKey.slice(0, 12),
        publicKey,
        isOnline: true,
        addedAt: Date.now(),
        lastSeen: Date.now(),
        status: 'pending',
        ...olmFields
      });
    } else {
      await db.contacts.update(existing.id, { isOnline: true, lastSeen: Date.now(), ...olmFields });
    }
  };

  const sendHello = async (conn: DataConnection) => {
    const p = profileRef.current;
    const account = olmAccountRef.current;
    if (!p || !account) return;

    try {
      const identityKeys = JSON.parse(account.identity_keys()) as { curve25519: string; ed25519: string };
      const oneTimeKey = await claimOneTimeKeyForHello(p.id, account);

      conn.send({
        type: 'HELLO',
        senderProfile: { id: p.id, displayName: p.displayName, publicKey: p.publicKey },
        olm: { identityKey: identityKeys.curve25519, oneTimeKey }
      });
    } catch {
      // Connection likely closed mid-flight; ignore.
    }
  };

  // Sends my current Megolm session key for a group to each member, individually
  // encrypted through that member's own pairwise Olm session (same pattern Matrix
  // uses to distribute room keys).
  const distributeGroupKey = (groupId: string, members: string[], sessionKey: string) => {
    const account = olmAccountRef.current;
    const myProfile = profileRef.current;
    if (!account || !myProfile) return;

    members.filter(m => m !== myProfile.publicKey).forEach(async (m) => {
      try {
        const conn = await getOrCreateConnection(m);
        const identityKey = await waitForIdentityKey(m);
        if (!identityKey) return;
        const contact = await db.contacts.get({ publicKey: m });
        if (!contact) return;

        // Group key payloads are always small (well under LARGE_PAYLOAD_THRESHOLD),
        // so this never returns more than one cipher.
        const [cipher] = await encryptToContact(myProfile.id, account, contact, JSON.stringify({ sessionKey }));
        conn.send({ type: 'P2P_GROUP_KEY', payload: { groupId, cipher } });
      } catch {
        // Member offline; they'll get the key on a future rotation/reconnect.
      }
    });
  };

  // Lazily creates my outbound Megolm session for a group the first time I need
  // it (e.g. the first message I send into it), and distributes it only if it
  // was actually just created.
  const ensureAndMaybeDistributeGroupKey = async (groupId: string, members: string[]) => {
    const myProfile = profileRef.current;
    if (!olmAccountRef.current || !myProfile) return;

    const { sessionKey, isNew } = await ensureOutboundGroupSession(groupId, myProfile.id);
    if (isNew) distributeGroupKey(groupId, members, sessionKey);
  };

  // Forces a fresh Megolm session (e.g. membership changed) and redistributes.
  const rotateAndRedistributeGroupKey = async (groupId: string, members: string[]) => {
    const myProfile = profileRef.current;
    if (!olmAccountRef.current || !myProfile) return;

    const sessionKey = await rotateOutboundGroupSession(groupId, myProfile.id);
    distributeGroupKey(groupId, members, sessionKey);
  };

  const handleIncomingData = async (remotePublicKey: string, data: any) => {
    const { type, payload } = data || {};
    if (!type) return;

    if (type === 'HELLO') {
      await upsertContact(remotePublicKey, data.senderProfile?.displayName, data.olm);
      resolveHelloWaiters(remotePublicKey);
      return;
    }

    if (type === 'P2P_SESSION_INIT') {
      // Establish-only message from encryptToContact's large-first-message
      // split (see LARGE_PAYLOAD_THRESHOLD) — decrypt just to create the
      // session so the real P2P_MSG right behind it can use the ordinary
      // (large-payload-safe) decrypt path instead of create_inbound. Content
      // is always empty; nothing to store.
      const myProfile = profileRef.current;
      const account = olmAccountRef.current;
      if (account && myProfile) {
        try {
          await decryptFromContact(myProfile.id, myProfile.publicKey, account, remotePublicKey, payload.olmType, payload.body);
        } catch (err) {
          console.error('[SiSecure] Session-init decrypt failed', err);
        }
      }
      return;
    }

    if (type === 'P2P_MSG') {
      const message = payload as Message;
      const myProfile = profileRef.current;
      const account = olmAccountRef.current;

      let decrypted: { content: string; mediaUrl?: string } = {
        content: '[Encrypted message — key not yet received]'
      };

      if (message.groupId) {
        const group = await db.groups.get(message.groupId);
        if (!group || !myProfile || !group.members.includes(myProfile.publicKey)) return;

        try {
          const plaintext = await decryptGroupMessage(message.groupId, remotePublicKey, message.content, myProfile.id);
          decrypted = JSON.parse(plaintext);
        } catch (err) {
          console.error('[SiSecure] Group decrypt failed', err);
        }
      } else if (account && myProfile) {
        try {
          const cipher = JSON.parse(message.content) as { olmType: 0 | 1; body: string };
          const plaintext = await decryptFromContact(myProfile.id, myProfile.publicKey, account, remotePublicKey, cipher.olmType, cipher.body);
          decrypted = JSON.parse(plaintext);
        } catch (err) {
          console.error('[SiSecure] Decrypt failed', err);
        }
      }

      await db.messages.put(await encryptMessageForStorage({ ...message, ...decrypted, status: 'delivered' }));
      await upsertContact(remotePublicKey);

      const conn = connectionsRef.current.get(remotePublicKey);
      conn?.send({ type: 'P2P_RECEIPT', payload: { messageId: message.id, status: 'delivered' } });
      return;
    }

    if (type === 'P2P_GROUP_KEY') {
      const myProfile = profileRef.current;
      const account = olmAccountRef.current;
      if (!account || !myProfile) return;

      try {
        const cipher = payload.cipher as { olmType: 0 | 1; body: string };
        const plaintext = await decryptFromContact(myProfile.id, myProfile.publicKey, account, remotePublicKey, cipher.olmType, cipher.body);
        const { sessionKey } = JSON.parse(plaintext) as { sessionKey: string };
        await ingestGroupKey(payload.groupId, remotePublicKey, sessionKey, myProfile.id);
      } catch (err) {
        console.error('[SiSecure] Failed to ingest group key', err);
      }
      return;
    }

    if (type === 'P2P_GROUP_INVITE') {
      await db.groups.put(payload.group);
      await upsertContact(remotePublicKey);
      return;
    }

    if (type === 'P2P_GROUP_UPDATE') {
      await db.groups.update(payload.groupId, { members: payload.members });

      const hasOutbound = await db.megolmOutboundSessions.get(payload.groupId);
      if (hasOutbound) {
        rotateAndRedistributeGroupKey(payload.groupId, payload.members);
      }
      return;
    }

    if (type === 'P2P_RECEIPT') {
      await db.messages.update(payload.messageId, { status: payload.status });
      return;
    }

    if (type === 'P2P_DELETE') {
      await db.messages.delete(payload.messageId);
      return;
    }

    if (type === 'P2P_REACTION') {
      const msg = await db.messages.get(payload.messageId);
      if (msg) {
        const reactions = msg.reactions || {};
        const users = reactions[payload.emoji] || [];
        const index = users.indexOf(remotePublicKey);

        if (index > -1) {
          users.splice(index, 1);
        } else {
          users.push(remotePublicKey);
        }

        if (users.length === 0) {
          delete reactions[payload.emoji];
        } else {
          reactions[payload.emoji] = users;
        }

        await db.messages.update(payload.messageId, { reactions });
      }
      return;
    }

    if (type === 'P2P_READ') {
      await db.messages.update(payload.messageId, { status: 'read' });

      const conn = connectionsRef.current.get(remotePublicKey);
      conn?.send({ type: 'P2P_RECEIPT', payload: { messageId: payload.messageId, status: 'read' } });
      return;
    }

    if (type === 'P2P_TYPING') {
      setTypingStatus(prev => ({ ...prev, [remotePublicKey]: payload.isTyping }));
    }
  };

  const wireConnection = (conn: DataConnection) => {
    conn.on('data', (data) => { handleIncomingData(conn.peer, data); });

    const onCloseOrError = () => {
      if (connectionsRef.current.get(conn.peer) === conn) {
        connectionsRef.current.delete(conn.peer);
      }
      markContactOffline(conn.peer);
    };

    conn.on('close', onCloseOrError);
    conn.on('error', onCloseOrError);
  };

  // Re-sends anything this specific peer is still owed the moment they come
  // back online — works for both 1:1 and group messages, since pendingTargets
  // tracks real per-member delivery state rather than the message's single
  // recipientPublicKey (which is blank for groups).
  const flushPendingMessages = async (targetPublicKey: string) => {
    const conn = connectionsRef.current.get(targetPublicKey);
    if (!conn || !conn.open) return;

    const pending = await db.messages
      .where('status').equals('sending')
      .and(m => (m.pendingTargets || []).includes(targetPublicKey))
      .toArray();

    // broadcastMessage builds the actual P2P wire payload from
    // message.content — it needs the real plaintext, not whatever's
    // sitting at rest in Dexie.
    for (const stored of pending) {
      const msg = await decryptMessageForDisplay(stored);
      broadcastMessage(msg, !!msg.groupId);
    }
  };

  const onConnectionReady = (conn: DataConnection) => {
    connectionsRef.current.set(conn.peer, conn);
    markContactOnline(conn.peer);
    sendHello(conn);
    flushPendingMessages(conn.peer);
  };

  const handlePeerError = (err: any) => {
    console.error('[SiSecure] Peer error:', err);
    if (err?.type === 'peer-unavailable') {
      const match = /peer\s+([^\s.]+)/i.exec(err.message || '');
      const targetId = match?.[1];
      if (targetId) pendingConnectRef.current.delete(targetId);
    }
  };

  const getOrCreateConnection = (targetPublicKey: string): Promise<DataConnection> => {
    const peer = peerRef.current;
    const myProfile = profileRef.current;
    if (!peer || peer.destroyed || !myProfile) return Promise.reject(new Error('peer-not-ready'));
    if (targetPublicKey === myProfile.publicKey) return Promise.reject(new Error('self-connect'));

    const existing = connectionsRef.current.get(targetPublicKey);
    if (existing && existing.open) return Promise.resolve(existing);

    const pending = pendingConnectRef.current.get(targetPublicKey);
    if (pending) return pending;

    const promise = new Promise<DataConnection>((resolve, reject) => {
      const conn = peer.connect(targetPublicKey, {
        reliable: true,
        // 'binary' (PeerJS default) — NOT 'json'. json serialization has no
        // chunking support, so any payload bigger than a single DataChannel
        // message (base64 photos/videos routinely are) fails outright.
        // binary mode transparently chunks + reassembles large payloads,
        // still delivers plain JS objects to 'data' handlers either way.
        serialization: 'binary',
        metadata: {
          senderProfile: { id: myProfile.id, displayName: myProfile.displayName, publicKey: myProfile.publicKey }
        }
      });

      const timer = setTimeout(() => {
        pendingConnectRef.current.delete(targetPublicKey);
        reject(new Error('connect-timeout'));
      }, 9000);

      wireConnection(conn);

      conn.on('open', () => {
        clearTimeout(timer);
        pendingConnectRef.current.delete(targetPublicKey);
        onConnectionReady(conn);
        resolve(conn);
      });

      conn.on('error', (err) => {
        clearTimeout(timer);
        pendingConnectRef.current.delete(targetPublicKey);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
    });

    pendingConnectRef.current.set(targetPublicKey, promise);
    return promise;
  };

  const attemptConnectAllContacts = async () => {
    const allContacts = await db.contacts.toArray();
    allContacts.forEach(c => {
      const existing = connectionsRef.current.get(c.publicKey);
      if (!existing || !existing.open) {
        getOrCreateConnection(c.publicKey).catch(() => {});
      }
    });
  };

  // Re-attempts locally-authored messages still stuck at 'sending' — this is
  // what self-heals sends that were skipped because a contact's identity key
  // hadn't arrived yet (see waitForIdentityKey), once it eventually does.
  const retryStuckSends = async () => {
    const myProfile = profileRef.current;
    if (!myProfile) return;

    const stuck = await db.messages
      .where('status').equals('sending')
      .and(m => m.senderPublicKey === myProfile.publicKey)
      .toArray();

    for (const stored of stuck) {
      const msg = await decryptMessageForDisplay(stored);
      broadcastMessage(msg, !!msg.groupId);
    }
  };

  // Real WebRTC transport: one Peer per identity, signaled via PeerJS's public
  // cloud broker (SDP/ICE only — message content never touches it). Waits for
  // the local Olm account to load before creating the Peer, so identity/one-time
  // keys are always ready by the time any connection can open.
  useEffect(() => {
    if (!profile?.publicKey || !profile?.id || !olmReady) return;

    let cancelled = false;

    (async () => {
      const account = await loadOrCreateOlmAccount(profile.id);
      if (cancelled) return;
      olmAccountRef.current = account;

      const peer = new Peer(profile.publicKey);
      peerRef.current = peer;

      peer.on('open', () => {
        attemptConnectAllContacts();
      });

      peer.on('connection', (conn) => {
        wireConnection(conn);
        conn.on('open', () => onConnectionReady(conn));
      });

      peer.on('error', (err) => handlePeerError(err));

      peer.on('disconnected', () => {
        if (!peer.destroyed) peer.reconnect();
      });

      retryIntervalRef.current = setInterval(() => {
        attemptConnectAllContacts();
        retryStuckSends();
      }, 10000);
    })();

    return () => {
      cancelled = true;
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
        retryIntervalRef.current = null;
      }
      connectionsRef.current.forEach(c => { try { c.close(); } catch { /* ignore */ } });
      connectionsRef.current.clear();
      pendingConnectRef.current.clear();
      if (peerRef.current) {
        peerRef.current.destroy();
        peerRef.current = null;
      }
      olmAccountRef.current = null;
    };
  }, [profile?.publicKey, profile?.id, olmReady]);

  const createProfile = async (name: string) => {
    const id = generateId();
    await db.profile.add({
      id,
      displayName: name,
      publicKey: `pub_${id}`,
      privateKey: `priv_${id}`,
      createdAt: Date.now()
    });
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (profile) {
      await db.profile.update(profile.id, data);
    }
  };

  const updateSettings = async (data: Partial<AppSettings>) => {
    if (settings) {
      await db.settings.update(settings.id, data);
    }
  };

  // Turning a lock method on/off potentially has to re-pickle every stored
  // Olm/Megolm session under a new key (see repickleAllSessions) and
  // re-encrypt every message row — pickles aren't portable across keys the
  // way, say, re-hashing a password would be, this *is* the re-encryption.
  // But that full pass is only needed the FIRST time any method is enabled
  // (generating the one random vault master key data actually gets
  // encrypted under) or the LAST time one is disabled (reverting back to
  // plaintext + the static fallback pickle key). Adding a SECOND method
  // alongside an already-active one just wraps the existing in-memory
  // master key under the new method's derived key — cheap, no data touched,
  // see src/lib/vault.ts's module comment for the full key model.
  const enableVaultPin = async (pin: string) => {
    if (!profile) return;
    const existingMasterKey = getCurrentVaultKeyBytes();
    if (existingMasterKey) {
      // Second method: biometric is already unlocked this session. Wrap the
      // SAME master key under the new PIN — no re-encryption needed.
      const { pinSalt, pinWrappedKey } = await wrapMasterKeyWithPin(pin, existingMasterKey);
      await db.settings.update(settings!.id, {
        pinEnabled: true,
        pinSalt,
        pinWrappedKey,
        pinVerifier: undefined
      });
      return;
    }

    // First method: legacy direct-derivation path, full re-encryption pass.
    const oldKey = getVaultPickleKeyMaterial(profile.id);
    const { pinSalt, pinVerifier } = await setupPinLegacy(pin);
    const newKey = getVaultPickleKeyMaterial(profile.id);

    await repickleAllSessions(profile.id, oldKey, newKey);

    const allMessages = await db.messages.toArray();
    for (const m of allMessages) {
      await db.messages.put(await encryptMessageForStorage(m));
    }

    await db.settings.update(settings!.id, { pinEnabled: true, pinSalt, pinVerifier });
  };

  const disableVaultPin = async () => {
    if (!profile || !settings?.pinEnabled) return;

    const otherMethodStillActive = settings.biometricLock && settings.biometricPrfSupported && settings.biometricWrappedKey;
    if (otherMethodStillActive) {
      // Biometric still holds a valid wrapped copy of the same master key —
      // just drop PIN's copy, nothing about the vault key or the data changes.
      await db.settings.update(settings.id, {
        pinEnabled: false,
        pinSalt: undefined,
        pinVerifier: undefined,
        pinWrappedKey: undefined
      });
      return;
    }

    // Last (or only) method: full reversal back to plaintext + static key.
    const oldKey = getVaultPickleKeyMaterial(profile.id);

    // Must decrypt while the key we're about to discard still works.
    const allMessages = await db.messages.toArray();
    for (const m of allMessages) {
      await db.messages.put(await decryptMessageForDisplay(m));
    }

    lockVault();
    const newKey = getVaultPickleKeyMaterial(profile.id);
    await repickleAllSessions(profile.id, oldKey, newKey);

    await db.settings.update(settings.id, {
      pinEnabled: false,
      pinSalt: undefined,
      pinVerifier: undefined,
      pinWrappedKey: undefined
    });
  };

  // Registers a platform-authenticator credential and, when it supports the
  // `prf` WebAuthn extension, wires it into the same vault master key PIN
  // uses (see src/lib/vault.ts) — either wrapping the key already unlocked
  // by an active PIN this session, or generating a fresh one and running the
  // same one-time re-encryption pass enableVaultPin's first-method path
  // does. When the authenticator doesn't support prf, this falls back to a
  // presence-only gate (App.tsx's LockGate) with no effect on encryption —
  // callers should tell the user which tier they got.
  const enableBiometricLock = async (): Promise<{ prfSupported: boolean }> => {
    if (!profile) return { prfSupported: false };
    if (!(await isPlatformAuthenticatorAvailable())) {
      throw new Error('No platform authenticator (Face ID / Touch ID / Windows Hello) available.');
    }

    const { credentialId, prfSupported } = await registerBiometric(profile.id, profile.displayName);

    if (!prfSupported) {
      await db.settings.update(settings!.id, {
        biometricLock: true,
        biometricCredentialId: credentialId,
        biometricPrfSupported: false,
        biometricWrappedKey: undefined
      });
      return { prfSupported: false };
    }

    const prfOutput = await getPrfOutput(credentialId);
    if (!prfOutput) {
      // Registered fine but couldn't retrieve a prf output right away —
      // degrade to presence-only rather than fail the whole setup.
      await db.settings.update(settings!.id, {
        biometricLock: true,
        biometricCredentialId: credentialId,
        biometricPrfSupported: false,
        biometricWrappedKey: undefined
      });
      return { prfSupported: false };
    }

    const existingMasterKey = getCurrentVaultKeyBytes();
    if (existingMasterKey) {
      // Second method: PIN is already unlocked this session. Wrap the SAME
      // master key — no re-encryption needed.
      const biometricWrappedKey = await wrapMasterKeyWithPrf(prfOutput, existingMasterKey);
      await db.settings.update(settings!.id, {
        biometricLock: true,
        biometricCredentialId: credentialId,
        biometricPrfSupported: true,
        biometricWrappedKey
      });
      return { prfSupported: true };
    }

    // First method: fresh master key, full re-encryption pass.
    const oldKey = getVaultPickleKeyMaterial(profile.id);
    const masterKey = generateMasterKey();
    const biometricWrappedKey = await wrapMasterKeyWithPrf(prfOutput, masterKey);
    await adoptVaultKey(masterKey);
    const newKey = getVaultPickleKeyMaterial(profile.id);

    await repickleAllSessions(profile.id, oldKey, newKey);

    const allMessages = await db.messages.toArray();
    for (const m of allMessages) {
      await db.messages.put(await encryptMessageForStorage(m));
    }

    await db.settings.update(settings!.id, {
      biometricLock: true,
      biometricCredentialId: credentialId,
      biometricPrfSupported: true,
      biometricWrappedKey
    });
    return { prfSupported: true };
  };

  const disableBiometricLock = async () => {
    if (!profile || !settings?.biometricLock) return;

    const wasRealEncryption = settings.biometricPrfSupported && settings.biometricWrappedKey;
    const otherMethodStillActive = settings.pinEnabled;

    if (!wasRealEncryption || otherMethodStillActive) {
      // Either this was only ever a presence gate (nothing to reverse), or
      // PIN still holds a valid wrapped copy of the same master key.
      await db.settings.update(settings.id, {
        biometricLock: false,
        biometricCredentialId: undefined,
        biometricPrfSupported: undefined,
        biometricWrappedKey: undefined
      });
      return;
    }

    // Last (or only) method, and it was real encryption: full reversal.
    const oldKey = getVaultPickleKeyMaterial(profile.id);
    const allMessages = await db.messages.toArray();
    for (const m of allMessages) {
      await db.messages.put(await decryptMessageForDisplay(m));
    }

    lockVault();
    const newKey = getVaultPickleKeyMaterial(profile.id);
    await repickleAllSessions(profile.id, oldKey, newKey);

    await db.settings.update(settings.id, {
      biometricLock: false,
      biometricCredentialId: undefined,
      biometricPrfSupported: undefined,
      biometricWrappedKey: undefined
    });
  };

  // Messages only — contacts, groups, profile, and crypto sessions untouched,
  // conversations keep working normally afterward.
  const lightNuke = async () => {
    await db.messages.clear();
  };

  // Everything except identity — contacts, messages, groups, and all Olm/Megolm
  // session state. `profile`/`settings` survive, so re-onboarding isn't needed,
  // but every contact has to be added again (their session state is gone too).
  const fullNuke = async () => {
    await db.messages.clear();
    await db.contacts.clear();
    await db.groups.clear();
    await db.olmSessions.clear();
    await db.megolmOutboundSessions.clear();
    await db.megolmInboundSessions.clear();
  };

  const addContact = async (contact: Omit<Contact, 'id' | 'addedAt' | 'lastSeen' | 'isOnline'>) => {
    const id = generateId();
    await db.contacts.add({
      ...contact,
      id,
      addedAt: Date.now(),
      lastSeen: Date.now(),
      isOnline: false,
      // A deliberate action (scanned their QR / typed their key) — trusted
      // immediately, unlike a contact that appears because someone else
      // connected to us first (see upsertContact).
      status: 'accepted'
    });
    return id;
  };

  const acceptContact = async (contactId: string) => {
    await db.contacts.update(contactId, { status: 'accepted' });
  };

  const declineContact = async (contactId: string) => {
    await db.contacts.delete(contactId);
  };

  const verifyContact = async (contactId: string) => {
    await db.contacts.update(contactId, { verified: true });
  };

  const connectToContact = (targetPublicKey: string) => {
    getOrCreateConnection(targetPublicKey).catch(() => {});
  };

  const sendMessage = async (recipientPublicKey: string, content: string, type: Message['type'] = 'text', mediaUrl?: string, isGroup: boolean = false) => {
    if (!profile) return;

    const message: Message = {
      id: generateId(),
      senderPublicKey: profile.publicKey,
      recipientPublicKey: isGroup ? '' : recipientPublicKey,
      groupId: isGroup ? recipientPublicKey : undefined,
      content,
      type,
      status: 'sending',
      timestamp: Date.now(),
      mediaUrl
    };

    // `message` itself stays plaintext — broadcastMessage below still needs
    // it to build the actual P2P wire payload (a separate encryption layer,
    // the Double Ratchet session, from this at-rest one). Only the copy
    // written to Dexie is encrypted.
    await db.messages.add(await encryptMessageForStorage(message));
    broadcastMessage(message, isGroup);
  };

  // Encrypts and sends `message` to every target still owed it. For 1:1 this
  // is the pairwise Double Ratchet session with the recipient; for groups
  // it's the shared Megolm session, lazily created on first send. The wire
  // copy's content is ciphertext and mediaUrl is stripped — the
  // locally-stored message row (used for our own chat history) keeps the
  // original plaintext untouched.
  //
  // Per-target delivery is tracked via `pendingTargets` rather than a single
  // success flag: a group message where only some members are online must
  // stay 'sending' (and keep being retried) for the ones who are offline,
  // not flip to 'sent' just because somebody happened to be reachable.
  const broadcastMessage = async (message: Message, isGroup: boolean) => {
    if (!profile) return;
    const account = olmAccountRef.current;
    if (!account) return; // Olm not ready yet; stays 'sending', retried later.

    const plaintext = JSON.stringify({ content: message.content, mediaUrl: message.mediaUrl });

    let allTargets: string[];
    let groupCiphertext: string | undefined;

    if (isGroup) {
      const group = await db.groups.get(message.groupId!);
      allTargets = group?.members.filter(m => m !== profile.publicKey) ?? [];
      if (!group || allTargets.length === 0) return;

      await ensureAndMaybeDistributeGroupKey(message.groupId!, group.members);
      try {
        groupCiphertext = await encryptGroupMessage(message.groupId!, profile.id, plaintext);
      } catch {
        return; // No outbound session yet; will retry.
      }
    } else {
      allTargets = [message.recipientPublicKey];
    }

    const current = await db.messages.get(message.id);
    const outstanding = current?.pendingTargets ?? allTargets;
    const targetsToSend = allTargets.filter(t => outstanding.includes(t));
    if (targetsToSend.length === 0) return;

    const stillPending = new Set(targetsToSend);

    await Promise.all(targetsToSend.map(async (target) => {
      try {
        const conn = await getOrCreateConnection(target);

        let wireContent: string;
        if (isGroup) {
          wireContent = groupCiphertext!;
        } else {
          const identityKey = await waitForIdentityKey(target);
          if (!identityKey) return; // Their identity key never arrived in time; skip, retry later.
          const contact = await db.contacts.get({ publicKey: target });
          if (!contact) return;

          // encryptToContact returns 2 ciphers when this is a brand-new session's
          // first message and it's large (e.g. a photo) — libolm can't safely
          // establish a session directly from a large first message on the
          // receiving end. Send the small establish-only cipher first, over the
          // same connection, so their session exists before the real content
          // arrives.
          const ciphers = await encryptToContact(profile.id, account, contact, plaintext);
          for (const establishCipher of ciphers.slice(0, -1)) {
            conn.send({ type: 'P2P_SESSION_INIT', payload: establishCipher });
          }
          wireContent = JSON.stringify(ciphers[ciphers.length - 1]);
        }

        const wireMessage: Message = { ...message, content: wireContent, mediaUrl: undefined };
        const wirePayload = { type: 'P2P_MSG', payload: wireMessage };

        if ((import.meta as any).env?.DEV) {
          console.log('[SiSecure P2P out]', target, wirePayload);
        }

        conn.send(wirePayload);
        stillPending.delete(target);
      } catch {
        // Peer offline / send failed; stays pending, retried later.
      }
    }));

    await db.messages.update(message.id, {
      pendingTargets: Array.from(stillPending),
      status: stillPending.size === 0 ? 'sent' : 'sending'
    });
  };

  const createGroup = async (name: string, members: string[]) => {
    if (!profile) return '';
    const id = generateId();
    const group: Group = {
      id,
      name,
      members: [...members, profile.publicKey],
      createdBy: profile.publicKey,
      createdAt: Date.now()
    };

    await db.groups.add(group);
    ensureAndMaybeDistributeGroupKey(id, group.members);

    members.forEach(memberPubKey => {
      getOrCreateConnection(memberPubKey)
        .then(conn => conn.send({ type: 'P2P_GROUP_INVITE', payload: { group } }))
        .catch(() => {});
    });

    return id;
  };

  const addMemberToGroup = async (groupId: string, memberPublicKey: string) => {
    if (!profile) return;
    const group = await db.groups.get(groupId);
    if (!group) return;

    const updatedMembers = Array.from(new Set([...group.members, memberPublicKey]));
    await db.groups.update(groupId, { members: updatedMembers });

    const hasOutbound = await db.megolmOutboundSessions.get(groupId);
    if (hasOutbound) {
      rotateAndRedistributeGroupKey(groupId, updatedMembers);
    }

    getOrCreateConnection(memberPublicKey)
      .then(conn => conn.send({ type: 'P2P_GROUP_INVITE', payload: { group: { ...group, members: updatedMembers } } }))
      .catch(() => {});

    updatedMembers.filter(m => m !== memberPublicKey && m !== profile.publicKey).forEach(m => {
      getOrCreateConnection(m)
        .then(conn => conn.send({ type: 'P2P_GROUP_UPDATE', payload: { groupId, members: updatedMembers } }))
        .catch(() => {});
    });
  };

  const sendTypingSignal = (recipientPublicKey: string, isTyping: boolean) => {
    if (!profile) return;
    getOrCreateConnection(recipientPublicKey)
      .then(conn => conn.send({ type: 'P2P_TYPING', payload: { isTyping } }))
      .catch(() => {});
  };

  const forwardMessage = async (messageId: string, recipientPublicKeys: string[]) => {
    const stored = await db.messages.get(messageId);
    if (!stored || !profile) return;
    const msg = await decryptMessageForDisplay(stored);

    for (const pubKey of recipientPublicKeys) {
      await sendMessage(pubKey, msg.content, msg.type, msg.mediaUrl);
    }
  };

  const deleteMessage = async (messageId: string) => {
    const msg = await db.messages.get(messageId);
    if (!msg || !profile) return;

    await db.messages.delete(messageId);

    const target = msg.recipientPublicKey === profile.publicKey ? msg.senderPublicKey : msg.recipientPublicKey;
    getOrCreateConnection(target)
      .then(conn => conn.send({ type: 'P2P_DELETE', payload: { messageId } }))
      .catch(() => {});
  };

  const reactToMessage = async (messageId: string, emoji: string) => {
    const msg = await db.messages.get(messageId);
    if (!msg || !profile) return;

    const reactions = msg.reactions || {};
    const users = reactions[emoji] || [];
    const index = users.indexOf(profile.publicKey);

    if (index > -1) {
      users.splice(index, 1);
    } else {
      users.push(profile.publicKey);
    }

    if (users.length === 0) {
      delete reactions[emoji];
    } else {
      reactions[emoji] = users;
    }

    await db.messages.update(messageId, { reactions });

    const target = msg.recipientPublicKey === profile.publicKey ? msg.senderPublicKey : msg.recipientPublicKey;
    getOrCreateConnection(target)
      .then(conn => conn.send({ type: 'P2P_REACTION', payload: { messageId, emoji } }))
      .catch(() => {});
  };

  const markAsRead = async (messageId: string) => {
    const msg = await db.messages.get(messageId);
    if (!msg || !profile || msg.status === 'read' || msg.senderPublicKey === profile.publicKey) return;

    await db.messages.update(messageId, { status: 'read' });

    getOrCreateConnection(msg.senderPublicKey)
      .then(conn => conn.send({ type: 'P2P_READ', payload: { messageId } }))
      .catch(() => {});
  };

  return (
    <SiSecureContext.Provider value={{
      profile,
      settings,
      contacts,
      groups,
      messages,
      isLoading: isLoading || !olmReady,
      createProfile,
      typingStatus,
      sendTypingSignal,
      updateProfile,
      updateSettings,
      enableVaultPin,
      disableVaultPin,
      enableBiometricLock,
      disableBiometricLock,
      addContact,
      acceptContact,
      declineContact,
      verifyContact,
      connectToContact,
      sendMessage,
      createGroup,
      addMemberToGroup,
      forwardMessage,
      deleteMessage,
      reactToMessage,
      markAsRead,
      lightNuke,
      fullNuke,
      currentChatId,
      setCurrentChatId
    }}>
      {children}
    </SiSecureContext.Provider>
  );
};

export const useSiSecure = () => {
  const context = useContext(SiSecureContext);
  if (context === undefined) {
    throw new Error('useSiSecure must be used within a SiSecureProvider');
  }
  return context;
};
