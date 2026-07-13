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
  biometricLock: boolean;
  theme: 'dark' | 'light' | 'amoled';
  // Inactivity-triggered nuke — checked once at startup against `lastActiveAt`.
  lastActiveAt?: number;
  autoNukeEnabled?: boolean;
  autoNukeLightDays?: number;
  autoNukeFullDays?: number;
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
