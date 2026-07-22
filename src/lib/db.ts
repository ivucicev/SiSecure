import Dexie, { type Table } from 'dexie';

export interface Contact {
  id: string; // Public key hash
  displayName: string;
  publicKey: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen?: number;
  addedAt: number;
  // Olm identity, learned from this contact's HELLO — used to bootstrap the
  // pairwise Double Ratchet session, unrelated to the `publicKey` routing id above.
  olmIdentityKey?: string;
  olmOneTimeKey?: { keyId: string; key: string };
  // 'accepted' when you deliberately added them (QR/manual) or approved an
  // inbound request; 'pending' when someone connected to you first and you
  // haven't reviewed them yet — anyone with your public key can otherwise
  // silently add themselves as a contact. Absent on contacts created before
  // this field existed, treated as 'accepted' for backward compatibility.
  status?: 'pending' | 'accepted';
  // Set once you've compared the safety number with this contact out-of-band
  // and confirmed it matches — mitigates a compromised signaling broker
  // redirecting the initial connection before the Double Ratchet handshake.
  verified?: boolean;
}

export interface Message {
  id: string;
  senderPublicKey: string; // Changed from senderId
  recipientPublicKey: string; // Changed from recipientId
  groupId?: string; // Optional group ID
  content: string;
  type: 'text' | 'image' | 'video' | 'voice' | 'file';
  status: 'sending' | 'sent' | 'delivered' | 'read';
  timestamp: number;
  mediaUrl?: string; 
  mediaSize?: number;
  duration?: number;
  reactions?: { [emoji: string]: string[] }; // emoji -> list of publicKeys
  // Publickeys still owed this message. Set to the full target list on first
  // send; each successful transmit removes that target. status only becomes
  // 'sent' once this is empty — for groups, one member being online must not
  // stop retries to the ones who are still offline.
  pendingTargets?: string[];
}

export interface Group {
  id: string;
  name: string;
  avatar?: string;
  members: string[]; // list of publicKeys
  createdBy: string; // creator's publicKey
  createdAt: number;
}

export interface UserProfile {
  id: string;
  displayName: string;
  publicKey: string;
  privateKey: string;
  avatar?: string;
  createdAt: number;
  // Olm identity account (Double Ratchet), separate from the fake publicKey/privateKey
  // above (which remain the PeerJS routing id).
  olmAccountPickle?: string;
  olmCurve25519Key?: string;
  olmEd25519Key?: string;
  olmHandedOutOtkIds?: string[];
}

// One canonical pairwise Double Ratchet session per contact.
export interface OlmSessionRecord {
  contactPublicKey: string;
  pickle: string;
  // Whether *we* created this session via create_outbound (vs create_inbound from
  // their prekey message) — used to break ties deterministically if both sides
  // independently start a session with each other at the same time ("glare").
  initiatedByMe: boolean;
  updatedAt: number;
}

// My own outbound Megolm session for a group (used when I send into it).
export interface MegolmOutboundRecord {
  groupId: string;
  pickle: string;
  updatedAt: number;
}

// One inbound Megolm session per (group, sender) — needed to decrypt that sender's messages.
export interface MegolmInboundRecord {
  id: string; // `${groupId}:${senderPublicKey}`
  groupId: string;
  senderPublicKey: string;
  pickle: string;
  updatedAt: number;
}

export interface AppSettings {
  id: string;
  autoPrune: boolean;
  pruneRetentionDays: number;
  stealthMode: boolean;
  // Gates app access behind a WebAuthn platform authenticator (Face ID / Touch
  // ID / Windows Hello) — see src/lib/webauthn.ts and src/lib/vault.ts.
  // biometricCredentialId is the registered credential's id (base64url);
  // biometricLock is only ever true when a credential is actually registered.
  // biometricPrfSupported records whether THIS authenticator supports the
  // `prf` extension (real key derivation) vs presence-only verification —
  // decided once at registration time, since it can vary by device/browser.
  // biometricWrappedKey is the vault master key, AES-GCM-wrapped under a key
  // derived from this credential's prf output (present only when
  // biometricPrfSupported is true).
  biometricLock: boolean;
  biometricCredentialId?: string;
  biometricPrfSupported?: boolean;
  biometricWrappedKey?: string;
  theme: 'dark' | 'light' | 'amoled';
  // Inactivity-triggered nuke — checked once at startup against `lastActiveAt`.
  lastActiveAt?: number;
  autoNukeEnabled?: boolean;
  autoNukeLightDays?: number;
  autoNukeFullDays?: number;
  // App-lock PIN — gates both unlocking the app and deriving the real
  // Olm pickle key / message-content encryption key (src/lib/vault.ts).
  // Legacy format (PIN was/is the only method ever enabled): pinVerifier is
  // a ciphertext of a known constant, and the PBKDF2(pin) output IS the
  // vault key directly. Current format (PIN added alongside, or after,
  // biometric): pinWrappedKey is the vault master key AES-GCM-wrapped under
  // a PBKDF2(pin)-derived key. The PIN itself is never stored either way.
  pinEnabled?: boolean;
  pinSalt?: string;
  pinVerifier?: string;
  pinWrappedKey?: string;
  // Bring-your-own PeerServer (signaling broker) — overrides PeerJS's default
  // cloud broker (0.peerjs.com). Unset/empty falls back to the default.
  customPeerHost?: string;
  customPeerPort?: number;
  customPeerPath?: string;
  customPeerSecure?: boolean;
  // Bring-your-own TURN — PeerJS ships with STUN only by default, which fails
  // to connect two peers that are both behind a symmetric NAT. urls may be a
  // comma-separated list (e.g. "turn:host:3478,turns:host:5349").
  customTurnUrls?: string;
  customTurnUsername?: string;
  customTurnCredential?: string;
}

export class SiSecureDatabase extends Dexie {
  contacts!: Table<Contact>;
  messages!: Table<Message>;
  profile!: Table<UserProfile>;
  settings!: Table<AppSettings>;
  groups!: Table<Group>;
  olmSessions!: Table<OlmSessionRecord>;
  megolmOutboundSessions!: Table<MegolmOutboundRecord>;
  megolmInboundSessions!: Table<MegolmInboundRecord>;

  constructor() {
    super('SiSecureDB');
    this.version(5).stores({
      contacts: 'id, &publicKey, isOnline',
      messages: 'id, senderPublicKey, recipientPublicKey, groupId, timestamp, status',
      profile: 'id',
      settings: 'id',
      groups: 'id, *members'
    });
    this.version(6).stores({
      olmSessions: 'contactPublicKey',
      megolmOutboundSessions: 'groupId',
      megolmInboundSessions: 'id, groupId, senderPublicKey'
    });
  }
}

export const db = new SiSecureDatabase();
