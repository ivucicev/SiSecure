import React, { useState, useEffect, createContext, useContext } from 'react';
import { db, type UserProfile, type Contact, type Message, type AppSettings, type Group } from './lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateId } from './lib/utils';

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
  addContact: (contact: Omit<Contact, 'id' | 'addedAt' | 'lastSeen' | 'isOnline'>) => Promise<string>;
  sendMessage: (recipientPublicKey: string, content: string, type?: Message['type'], mediaUrl?: string, isGroup?: boolean) => Promise<void>;
  createGroup: (name: string, members: string[]) => Promise<string>;
  forwardMessage: (messageId: string, recipientPublicKeys: string[]) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
  reactToMessage: (messageId: string, emoji: string) => Promise<void>;
  markAsRead: (messageId: string) => Promise<void>;
  currentChatId: string | null;
  setCurrentChatId: (id: string | null) => void;
}

const SiSecureContext = createContext<SiSecureContextType | undefined>(undefined);

export const SiSecureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(true);
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
    if (isGroup) {
      return await db.messages.where('groupId').equals(currentChatId).sortBy('timestamp');
    }

    const allMsgs = await db.messages
      .where('senderPublicKey').equals(currentChatId)
      .or('recipientPublicKey').equals(currentChatId)
      .sortBy('timestamp');
      
    return allMsgs.filter(m => !m.groupId);
  }
  , [currentChatId, profile?.publicKey]) || [];

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
          theme: 'dark'
        });
      }
    }
  }, [profiles, settingsArray]);

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

  // Sync / Pulse Logic
  useEffect(() => {
    if (!profile) return;

    const channel = new BroadcastChannel('sisecure_p2p');
    
    // Broadcast presence on mount
    if (!settings?.stealthMode) {
      channel.postMessage({
        type: 'P2P_PRESENCE',
        senderProfile: {
          id: profile.id,
          displayName: profile.displayName,
          publicKey: profile.publicKey
        }
      });
    }

    const handleP2PMessage = async (event: MessageEvent) => {
      const { type, payload, senderProfile } = event.data;

      if (!senderProfile || !profile) return;

      const upsertContact = async () => {
        if (senderProfile.publicKey === profile.publicKey) return;
        
        const existing = await db.contacts.get({ publicKey: senderProfile.publicKey });
        if (!existing) {
          await db.contacts.add({
            id: generateId(),
            displayName: senderProfile.displayName,
            publicKey: senderProfile.publicKey,
            isOnline: true,
            addedAt: Date.now(),
            lastSeen: Date.now()
          });
        } else {
          await db.contacts.update(existing.id, { isOnline: true, lastSeen: Date.now() });
        }
      };

      if (type === 'P2P_PRESENCE') {
        await upsertContact();
        if (!settings?.stealthMode) {
          channel.postMessage({
            type: 'P2P_PRESENCE_ACK',
            targetPublicKey: senderProfile.publicKey,
            senderProfile: {
              id: profile.id,
              displayName: profile.displayName,
              publicKey: profile.publicKey
            }
          });
        }
      }

      if (type === 'P2P_PRESENCE_ACK' && event.data.targetPublicKey === profile.publicKey) {
        await upsertContact();
      }

      if (type === 'P2P_HANDSHAKE') {
        if (payload.targetPublicKey === profile.publicKey) {
          await upsertContact();
        }
      }

      if (type === 'P2P_MSG') {
        if (payload.recipientPublicKey === profile.publicKey || (payload.groupId && (await db.groups.get(payload.groupId)))) {
          // If it's a group message, we check if we are in the group
          if (payload.groupId) {
            const group = await db.groups.get(payload.groupId);
            if (!group || !group.members.includes(profile.publicKey)) return;
          }

          await db.messages.put({
            ...payload,
            status: 'delivered'
          });
          
          await upsertContact();

          channel.postMessage({
            type: 'P2P_RECEIPT',
            payload: { messageId: payload.id, status: 'delivered' },
            targetPublicKey: senderProfile.publicKey,
            senderProfile: { publicKey: profile.publicKey }
          });
        }
      }

      if (type === 'P2P_GROUP_INVITE' && payload.targetPublicKey === profile.publicKey) {
        // Automatically join for now or show notification
        await db.groups.put(payload.group);
        await upsertContact();
      }

      if (type === 'P2P_GROUP_UPDATE' && payload.targetPublicKey === profile.publicKey) {
        await db.groups.update(payload.groupId, { members: payload.members });
      }

      if (type === 'P2P_RECEIPT' && event.data.targetPublicKey === profile.publicKey) {
        await db.messages.update(payload.messageId, { status: payload.status });
      }

      if (type === 'P2P_DELETE' && event.data.targetPublicKey === profile.publicKey) {
        await db.messages.delete(payload.messageId);
      }

      if (type === 'P2P_REACTION' && event.data.targetPublicKey === profile.publicKey) {
        const msg = await db.messages.get(payload.messageId);
        if (msg) {
          const reactions = msg.reactions || {};
          const users = reactions[payload.emoji] || [];
          const index = users.indexOf(senderProfile.publicKey);
          
          if (index > -1) {
            users.splice(index, 1);
          } else {
            users.push(senderProfile.publicKey);
          }
          
          if (users.length === 0) {
            delete reactions[payload.emoji];
          } else {
            reactions[payload.emoji] = users;
          }
          
          await db.messages.update(payload.messageId, { reactions });
        }
      }

      if (type === 'P2P_READ' && event.data.targetPublicKey === profile.publicKey) {
        await db.messages.update(payload.messageId, { status: 'read' });
        
        // Also send receipt back
        channel.postMessage({
          type: 'P2P_RECEIPT',
          payload: { messageId: payload.messageId, status: 'read' },
          targetPublicKey: senderProfile.publicKey,
          senderProfile: { publicKey: profile.publicKey }
        });
      }

      if (type === 'P2P_TYPING' && event.data.targetPublicKey === profile.publicKey) {
        setTypingStatus(prev => ({ ...prev, [senderProfile.publicKey]: payload.isTyping }));
      }
    };

    channel.onmessage = handleP2PMessage;

    // Handshake to discover peers and push missed messages
    const sendHandshake = () => {
      if (!profile) return;
      channel.postMessage({
        type: 'P2P_HANDSHAKE',
        senderPublicKey: profile.publicKey
      });
    };

    const handshakeHandler = async (event: any) => {
      if (!profile) return;
      const { type, senderPublicKey, payload, targetPublicKey } = event.data;

      if (type === 'P2P_HANDSHAKE' && senderPublicKey !== profile.publicKey) {
        // Mark as online in DB
        const contact = await db.contacts.where('publicKey').equals(senderPublicKey).first();
        if (contact) {
          await db.contacts.update(contact.id, { isOnline: true, lastSeen: Date.now() });
        }

        const pending = await db.messages
          .where('recipientPublicKey').equals(senderPublicKey)
          .and(m => m.status === 'sent')
          .toArray();
        pending.forEach(msg => broadcastMessage(msg, false));

        channel.postMessage({
          type: 'P2P_ALIVE',
          targetPublicKey: senderPublicKey,
          senderPublicKey: profile.publicKey
        });
      }

      if (type === 'P2P_ALIVE' && targetPublicKey === profile.publicKey) {
        // Mark as online in DB
        const contact = await db.contacts.where('publicKey').equals(senderPublicKey).first();
        if (contact) {
          await db.contacts.update(contact.id, { isOnline: true, lastSeen: Date.now() });
        }

        const pending = await db.messages
          .where('recipientPublicKey').equals(senderPublicKey)
          .and(m => m.status === 'sent')
          .toArray();
        pending.forEach(msg => broadcastMessage(msg, false));
      }

      if (type === 'P2P_MSG' && targetPublicKey === profile.publicKey) {
        channel.postMessage({
          type: 'P2P_ACK',
          payload: { messageId: payload.id },
          targetPublicKey: event.data.senderProfile.publicKey,
          senderPublicKey: profile.publicKey
        });
      }

      if (type === 'P2P_ACK' && targetPublicKey === profile.publicKey) {
        await db.messages.update(payload.messageId, { status: 'delivered' });
      }
    };

    channel.addEventListener('message', handshakeHandler);
    sendHandshake();

    const interval = setInterval(sendHandshake, 10000);

    return () => {
      channel.removeEventListener('message', handshakeHandler);
      channel.close();
      clearInterval(interval);
    };
  }, [profile, settings?.stealthMode]);

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

  const addContact = async (contact: Omit<Contact, 'id' | 'addedAt' | 'lastSeen' | 'isOnline'>) => {
    const id = generateId();
    await db.contacts.add({
      ...contact,
      id,
      addedAt: Date.now(),
      lastSeen: Date.now(),
      isOnline: false
    });
    return id;
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
    
    await db.messages.add(message);
    broadcastMessage(message, isGroup);
  };

  const broadcastMessage = async (message: Message, isGroup: boolean) => {
    if (!profile) return;
    const channel = new BroadcastChannel('sisecure_p2p');
    
    if (isGroup) {
      const group = await db.groups.get(message.groupId!);
      if (group) {
        group.members.forEach(memberPubKey => {
          if (memberPubKey !== profile.publicKey) {
            channel.postMessage({
              type: 'P2P_MSG',
              payload: message,
              targetPublicKey: memberPubKey,
              senderProfile: {
                id: profile.id,
                displayName: profile.displayName,
                publicKey: profile.publicKey
              }
            });
          }
        });
      }
    } else {
      channel.postMessage({
        type: 'P2P_MSG',
        payload: message,
        targetPublicKey: message.recipientPublicKey,
        senderProfile: {
          id: profile.id,
          displayName: profile.displayName,
          publicKey: profile.publicKey
        }
      });
    }

    setTimeout(async () => {
      const msg = await db.messages.get(message.id);
      if (msg && msg.status === 'sending') {
        await db.messages.update(message.id, { status: 'sent' });
      }
    }, 200);
    
    channel.close();
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
    
    const channel = new BroadcastChannel('sisecure_p2p');
    members.forEach(memberPubKey => {
      channel.postMessage({
        type: 'P2P_GROUP_INVITE',
        payload: { group, targetPublicKey: memberPubKey },
        senderProfile: {
          id: profile.id,
          displayName: profile.displayName,
          publicKey: profile.publicKey
        }
      });
    });
    channel.close();
    
    return id;
  };

  const addMemberToGroup = async (groupId: string, memberPublicKey: string) => {
    if (!profile) return;
    const group = await db.groups.get(groupId);
    if (!group) return;

    const updatedMembers = Array.from(new Set([...group.members, memberPublicKey]));
    await db.groups.update(groupId, { members: updatedMembers });

    const channel = new BroadcastChannel('sisecure_p2p');
    // Notify the new member
    channel.postMessage({
      type: 'P2P_GROUP_INVITE',
      payload: { group: { ...group, members: updatedMembers }, targetPublicKey: memberPublicKey },
      senderProfile: {
        id: profile.id,
        displayName: profile.displayName,
        publicKey: profile.publicKey
      }
    });

    // Notify existing members about the new member (optional but good for sync)
    updatedMembers.filter(m => m !== memberPublicKey && m !== profile.publicKey).forEach(m => {
      channel.postMessage({
        type: 'P2P_GROUP_UPDATE',
        payload: { groupId, members: updatedMembers },
        targetPublicKey: m,
        senderProfile: { publicKey: profile.publicKey }
      });
    });

    channel.close();
  };

  const sendTypingSignal = (recipientPublicKey: string, isTyping: boolean) => {
    if (!profile) return;
    const channel = new BroadcastChannel('sisecure_p2p');
    channel.postMessage({
      type: 'P2P_TYPING',
      payload: { isTyping },
      targetPublicKey: recipientPublicKey,
      senderProfile: { publicKey: profile.publicKey }
    });
    channel.close();
  };

  const forwardMessage = async (messageId: string, recipientPublicKeys: string[]) => {
    const msg = await db.messages.get(messageId);
    if (!msg || !profile) return;

    for (const pubKey of recipientPublicKeys) {
      await sendMessage(pubKey, msg.content, msg.type, msg.mediaUrl);
    }
  };

  const deleteMessage = async (messageId: string) => {
    const msg = await db.messages.get(messageId);
    if (!msg || !profile) return;
    
    await db.messages.delete(messageId);
    
    const channel = new BroadcastChannel('sisecure_p2p');
    channel.postMessage({
      type: 'P2P_DELETE',
      payload: { messageId },
      targetPublicKey: msg.recipientPublicKey === profile.publicKey ? msg.senderPublicKey : msg.recipientPublicKey,
      senderProfile: { publicKey: profile.publicKey }
    });
    channel.close();
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

    const channel = new BroadcastChannel('sisecure_p2p');
    channel.postMessage({
      type: 'P2P_REACTION',
      payload: { messageId, emoji },
      targetPublicKey: msg.recipientPublicKey === profile.publicKey ? msg.senderPublicKey : msg.recipientPublicKey,
      senderProfile: { publicKey: profile.publicKey }
    });
    channel.close();
  };

  const markAsRead = async (messageId: string) => {
    const msg = await db.messages.get(messageId);
    if (!msg || !profile || msg.status === 'read' || msg.senderPublicKey === profile.publicKey) return;

    await db.messages.update(messageId, { status: 'read' });

    const channel = new BroadcastChannel('sisecure_p2p');
    channel.postMessage({
      type: 'P2P_READ',
      payload: { messageId },
      targetPublicKey: msg.senderPublicKey,
      senderProfile: { publicKey: profile.publicKey }
    });
    channel.close();
  };

  return (
    <SiSecureContext.Provider value={{
      profile,
      settings,
      contacts,
      groups,
      messages,
      isLoading,
      createProfile,
      typingStatus,
      sendTypingSignal,
      updateProfile,
      updateSettings,
      addContact,
      sendMessage,
      createGroup,
      addMemberToGroup,
      forwardMessage,
      deleteMessage,
      reactToMessage,
      markAsRead,
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
