import React, { useState } from 'react';
import { useSiSecure } from '../SiSecureContext';
import { motion } from 'motion/react';
import { X, Users, UserPlus, Check, Search, ShieldCheck, ShieldAlert, Zap } from 'lucide-react';
import { cn } from '../lib/utils';
import { Group } from '../lib/db';

export function GroupInfoModal({ group, onClose }: { group: Group, onClose: () => void }) {
  const { contacts, addMemberToGroup, profile } = useSiSecure();
  const [isAddingInGroup, setIsAddingInGroup] = useState(false);
  const [search, setSearch] = useState('');

  const members = group.members;
  const nonMembers = contacts.filter(c => !members.includes(c.publicKey));
  const filteredContacts = nonMembers.filter(c => 
    c.displayName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[60] flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-sm my-auto bg-[#0A0A0A] border border-white/10 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">{group.name}</h3>
              <p className="text-[10px] text-zinc-500 font-mono tracking-widest uppercase">Alliance Manifest</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
          {!isAddingInGroup ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 block">Members ({members.length})</label>
                <button 
                  onClick={() => setIsAddingInGroup(true)}
                  className="text-[10px] font-bold text-blue-500 hover:text-blue-400 uppercase tracking-widest flex items-center gap-1"
                >
                  <UserPlus className="w-3 h-3" /> Add Agent
                </button>
              </div>
              <div className="space-y-2">
                {members.map(pubKey => {
                  const contact = contacts.find(c => c.publicKey === pubKey);
                  const isCreator = group.createdBy === pubKey;
                  const isCurrent = profile?.publicKey === pubKey;

                  return (
                    <div key={pubKey} className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/50 border border-white/[0.02]">
                      <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">
                        {contact?.displayName.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold truncate text-zinc-200">
                            {isCurrent ? 'You' : (contact?.displayName || 'Unknown Agent')}
                          </span>
                          {isCreator && (
                            <span title="Alliance Founder">
                              <ShieldAlert className="w-3 h-3 text-red-500" />
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-zinc-600 font-mono truncate">{pubKey}</p>
                      </div>
                      {contact?.isOnline && (
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 block">Deploy New Agents</label>
                <button 
                  onClick={() => setIsAddingInGroup(false)}
                  className="text-[10px] font-bold text-zinc-500 hover:text-zinc-400 uppercase tracking-widest"
                >
                  Cancel
                </button>
              </div>
              <div className="relative">
                <Search className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-600 w-4 h-4" />
                <input 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Query database..."
                  className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 pl-12 pr-6 text-sm text-zinc-200 placeholder:text-zinc-700"
                />
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {filteredContacts.map(contact => (
                  <button 
                    key={contact.publicKey}
                    onClick={() => {
                      addMemberToGroup(group.id, contact.publicKey);
                      setIsAddingInGroup(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/5 text-zinc-500 hover:border-blue-500/30 hover:bg-blue-500/5 transition-all group"
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold group-hover:bg-blue-500/20 group-hover:text-blue-500">
                      {contact.displayName.charAt(0)}
                    </div>
                    <span className="text-sm font-bold truncate flex-1 text-left group-hover:text-blue-400">{contact.displayName}</span>
                    <Zap className="w-4 h-4 opacity-0 group-hover:opacity-100 text-blue-500" />
                  </button>
                ))}
                {filteredContacts.length === 0 && (
                  <p className="text-center py-8 text-xs text-zinc-600 font-mono italic">No compatible agents found</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 bg-black/40 border-t border-white/5 text-center">
          <p className="text-[9px] text-zinc-700 font-mono uppercase tracking-[0.2em]">Secure Node Propagation Active</p>
        </div>
      </motion.div>
    </div>
  );
}
