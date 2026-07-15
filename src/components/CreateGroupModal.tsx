import React, { useState } from 'react';
import { useSiSecure } from '../SiSecureContext';
import { motion } from 'motion/react';
import { X, Users, Check, Search, Plus, Boxes } from 'lucide-react';
import { cn } from '../lib/utils';

export function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const { contacts, createGroup, setCurrentChatId } = useSiSecure();
  const [name, setName] = useState('');
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const filteredContacts = contacts.filter(c => 
    c.displayName.toLowerCase().includes(search.toLowerCase())
  );

  const toggleContact = (publicKey: string) => {
    setSelectedContacts(prev => 
      prev.includes(publicKey) 
        ? prev.filter(k => k !== publicKey) 
        : [...prev, publicKey]
    );
  };

  const handleCreate = async () => {
    if (name.trim() && selectedContacts.length > 0) {
      const groupId = await createGroup(name.trim(), selectedContacts);
      setCurrentChatId(groupId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto bg-obsidian-950/90 backdrop-blur-md">
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-sm my-auto bg-obsidian-900 border border-white/5 rounded-[2.5rem] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-xl font-bold flex items-center gap-2">
            <Boxes className="w-5 h-5 text-purple-500" />
            New Alliance
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto">
          <div className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 block px-1">Group Details</label>
            <input 
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enigma Squad..."
              className="w-full bg-black/40 border-white/5 rounded-2xl py-4 px-6 text-sm focus:ring-1 focus:ring-blue-500 text-zinc-200 placeholder:text-zinc-600"
            />
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 block px-1">Select Agents ({selectedContacts.length})</label>
            <div className="relative">
              <Search className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-zinc-600 w-4 h-4" />
              <input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search database..."
                className="w-full bg-black/20 border-none rounded-xl py-2 pl-10 pr-4 text-xs text-zinc-400 placeholder:text-zinc-700"
              />
            </div>
            
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {filteredContacts.map(contact => (
                <button 
                  key={contact.publicKey}
                  onClick={() => toggleContact(contact.publicKey)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-2xl border transition-all",
                    selectedContacts.includes(contact.publicKey) 
                      ? "bg-blue-600/10 border-blue-600/30 text-blue-400" 
                      : "bg-white/[0.02] border-white/5 text-zinc-500 hover:border-white/10"
                  )}
                >
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">
                      {contact.displayName.charAt(0)}
                    </div>
                    {contact.isOnline && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-obsidian-900" />
                    )}
                  </div>
                  <span className="text-sm font-bold truncate flex-1 text-left">{contact.displayName}</span>
                  {selectedContacts.includes(contact.publicKey) && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 bg-black/40 border-t border-white/5">
          <button 
            onClick={handleCreate}
            disabled={!name.trim() || selectedContacts.length === 0}
            className="w-full h-14 bg-purple-600 disabled:opacity-30 disabled:grayscale rounded-2xl text-xs font-bold uppercase tracking-widest text-white transition-all shadow-lg shadow-purple-900/20 flex items-center justify-center gap-2"
          >
            Deploy Alliance <Plus className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
