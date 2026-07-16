import React from 'react';
import { useSiSecure } from '../SiSecureContext';
import { useLiveQuery } from 'dexie-react-hooks';
import { motion } from 'motion/react';
import { db } from '../lib/db';
import { cn, formatTime } from '../lib/utils';
import { Shield, Clock, Boxes, UserPlus, Check, X } from 'lucide-react';

export function ChatList() {
  const { contacts, groups, profile, currentChatId, setCurrentChatId, acceptContact, declineContact } = useSiSecure();

  // Absent `status` means the contact predates this field — treat as
  // already-accepted rather than silently hiding every existing contact.
  const acceptedContacts = contacts.filter(c => c.status !== 'pending');
  const pendingContacts = contacts.filter(c => c.status === 'pending');

  const unreadCounts = useLiveQuery(async () => {
    if (!profile) return {} as Record<string, number>;

    const delivered = await db.messages.where('status').equals('delivered').toArray();
    const counts: Record<string, number> = {};

    for (const m of delivered) {
      if (m.senderPublicKey === profile.publicKey) continue;
      const key = m.groupId || m.senderPublicKey;
      counts[key] = (counts[key] || 0) + 1;
    }

    return counts;
  }, [profile?.publicKey]) || {};

  if (acceptedContacts.length === 0 && groups.length === 0 && pendingContacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 mt-10">
        <div className="w-12 h-12 rounded-xl bg-white/[0.03] border border-dashed border-white/10 flex items-center justify-center mb-4">
          <Shield className="w-6 h-6 text-zinc-700" />
        </div>
        <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">No secure links yet</p>
      </div>
    );
  }

  return (
    <div className="px-3">
      {/* Contact Requests — someone connected to us with our public key but
          we haven't reviewed them yet. Not clickable into a chat; only
          Accept/Decline until resolved. */}
      {pendingContacts.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-amber-500 px-3 font-bold flex items-center gap-1.5">
            <UserPlus className="w-3 h-3" /> Contact Requests ({pendingContacts.length})
          </div>
          {pendingContacts.map((contact) => (
            <div
              key={contact.id}
              className="w-full flex items-center p-3 rounded-xl mb-1 bg-amber-500/5 border border-amber-500/10"
            >
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5 overflow-hidden shrink-0">
                <span className="text-base font-medium text-zinc-400">
                  {contact.displayName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="ml-4 flex-1 min-w-0 text-left">
                <h2 className="text-sm font-semibold truncate text-zinc-200">{contact.displayName}</h2>
                <p className="text-[10px] text-zinc-500 font-mono truncate">wants to connect</p>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  onClick={() => declineContact(contact.id)}
                  title="Decline"
                  className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-red-500/10 text-zinc-500 hover:text-red-500 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={() => acceptContact(contact.id)}
                  title="Accept"
                  className="w-8 h-8 rounded-lg bg-zinc-900 hover:bg-green-500/10 text-zinc-500 hover:text-green-500 flex items-center justify-center transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Groups Section */}
      {groups.length > 0 && (
        <div className="mb-6">
          <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-600 px-3 font-bold">Encrypted Alliances</div>
          {groups.map((group) => (
            <button
              key={group.id}
              className={cn(
                "w-full flex items-center p-3 rounded-xl transition-all mb-1 cursor-pointer",
                currentChatId === group.id 
                  ? "bg-blue-600/10 border border-blue-500/20" 
                  : "hover:bg-zinc-900/40 border border-transparent"
              )}
              onClick={() => setCurrentChatId(group.id)}
            >
              <div className="relative shrink-0">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 overflow-hidden">
                  <Boxes className="w-5 h-5 text-purple-400" />
                </div>
              </div>
              
              <div className="ml-4 flex-1 min-w-0 text-left">
                <div className="flex justify-between items-baseline mb-0.5">
                  <h2 className={cn(
                    "text-sm font-bold truncate",
                    currentChatId === group.id ? "text-blue-400" : "text-zinc-200"
                  )}>
                    {group.name}
                  </h2>
                  <span className="text-[10px] text-zinc-600 font-mono">
                    {group.members.length} Agents
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className={cn(
                    "text-[10px] truncate uppercase tracking-tighter font-mono",
                    currentChatId === group.id ? "text-blue-500/60" : "text-zinc-600"
                  )}>
                    P2P Cluster Active
                  </p>
                  {!!unreadCounts[group.id] && (
                    <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCounts[group.id]}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Direct Messages Section */}
      {acceptedContacts.length > 0 && (
      <>
      <div className="mb-2 text-[10px] uppercase tracking-widest text-zinc-600 px-3 font-bold">Direct P2P Link</div>
      {acceptedContacts.map((contact) => (
        <button
          key={contact.id}
          className={cn(
            "w-full flex items-center p-3 rounded-xl transition-all mb-1 cursor-pointer",
            currentChatId === contact.publicKey 
              ? "bg-zinc-900 border border-zinc-800" 
              : "hover:bg-zinc-900/40 border border-transparent"
          )}
          onClick={() => setCurrentChatId(contact.publicKey)}
        >
          <div className="relative shrink-0">
            <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center border border-white/5 overflow-hidden">
              {contact.avatar ? (
                <img src={contact.avatar} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-base font-medium text-zinc-400">
                  {contact.displayName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {contact.isOnline && (
              <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-[#0A0A0A] rounded-full" />
            )}
          </div>
          
          <div className="ml-4 flex-1 min-w-0 text-left">
            <div className="flex justify-between items-baseline mb-0.5">
              <h2 className={cn(
                "text-sm font-semibold truncate",
                currentChatId === contact.publicKey
                  ? "text-zinc-100"
                  : unreadCounts[contact.publicKey] ? "text-white" : "text-zinc-300"
              )}>
                {contact.displayName}
              </h2>
              <span className="text-[10px] text-zinc-500 font-mono">
                {contact.lastSeen ? formatTime(contact.lastSeen) : ''}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className={cn(
                "text-xs truncate",
                currentChatId === contact.publicKey ? "text-blue-400" : "text-zinc-500"
              )}>
                Secure Session Active
              </p>
              {!!unreadCounts[contact.publicKey] && (
                <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {unreadCounts[contact.publicKey]}
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
      </>
      )}
    </div>
  );
}
