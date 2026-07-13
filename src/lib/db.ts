import Dexie, { type Table } from 'dexie';

export interface Contact {
  id: string; // Public key hash
  displayName: string;
  publicKey: string;
  avatar?: string;
  isOnline: boolean;
  lastSeen?: number;
  addedAt: number;
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
}

export interface AppSettings {
  id: string;
  autoPrune: boolean;
  pruneRetentionDays: number;
  stealthMode: boolean;
  biometricLock: boolean;
  theme: 'dark' | 'light' | 'amoled';
}

export class SiSecureDatabase extends Dexie {
  contacts!: Table<Contact>;
  messages!: Table<Message>;
  profile!: Table<UserProfile>;
  settings!: Table<AppSettings>;
  groups!: Table<Group>;

  constructor() {
    super('SiSecureDB');
    this.version(5).stores({
      contacts: 'id, &publicKey, isOnline',
      messages: 'id, senderPublicKey, recipientPublicKey, groupId, timestamp, status',
      profile: 'id',
      settings: 'id',
      groups: 'id, *members'
    });
  }
}

export const db = new SiSecureDatabase();
