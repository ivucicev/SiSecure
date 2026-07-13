import React, { useState } from 'react';
import { useSiSecure } from '../SiSecureContext';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus,
  Settings,
  Search,
  QrCode,
  ShieldCheck,
  MessageSquare,
  MoreVertical,
  LogOut,
  Boxes,
  Flame
} from 'lucide-react';
import { ChatList } from './ChatList';
import { ChatView } from './ChatView';
import { AddContactModal } from './AddContactModal';
import { SettingsModal } from './SettingsModal';
import { CreateGroupModal } from './CreateGroupModal';
import { TempRoomView } from './TempRoomView';
import { generateId, cn } from '../lib/utils';
import { generateRoomKey, exportKeyToUrlSafe } from '../lib/tempCrypto';

export function Home() {
  const { profile, currentChatId, setCurrentChatId } = useSiSecure();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [hostingRoom, setHostingRoom] = useState<{ roomId: string; roomKeyB64: string } | null>(null);

  const startTempRoom = async () => {
    const key = await generateRoomKey();
    const roomKeyB64 = await exportKeyToUrlSafe(key);
    setHostingRoom({ roomId: generateId(), roomKeyB64 });
  };

  if (hostingRoom) {
    return (
      <TempRoomView
        mode="host"
        roomId={hostingRoom.roomId}
        roomKeyB64={hostingRoom.roomKeyB64}
        onExit={() => setHostingRoom(null)}
      />
    );
  }

  return (
    <div className="flex h-screen bg-obsidian-950 overflow-hidden text-zinc-100">
      {/* Sidebar - Contacts */}
      <div className={cn(
        "w-full md:w-80 lg:w-[320px] border-r border-zinc-800/60 flex flex-col bg-obsidian-950 transition-all",
        currentChatId && "hidden md:flex"
      )}>
        {/* Sidebar Header */}
        <div className="p-6 pb-2 flex flex-col space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight">Messages</h1>
            <div className="flex gap-2">
              <button
                onClick={startTempRoom}
                className="p-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition-colors"
                title="New Temp Room"
              >
                <Flame className="w-5 h-5" />
              </button>
              <button
                onClick={() => setIsCreateGroupOpen(true)}
                className="p-2 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 transition-colors"
                title="Create Alliance"
              >
                <Boxes className="w-5 h-5" />
              </button>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="p-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 transition-colors"
                title="Add Contact"
              >
                <Plus className="w-5 h-5 text-white" />
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-zinc-500 w-4 h-4" />
            <input 
              type="text" 
              placeholder="Search locally..." 
              className="w-full bg-zinc-900/50 border-none rounded-xl py-2 pl-10 pr-4 text-sm focus:ring-1 focus:ring-blue-500 text-zinc-300 placeholder:text-zinc-600 transition-all"
            />
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto pt-4">
          <ChatList />
        </div>

        {/* Profile Footer */}
        <div className="p-4 border-t border-zinc-800/40 bg-zinc-900/10">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center border border-white/5 font-bold text-zinc-400">
              {profile?.displayName.charAt(0)}
            </div>
            <div className="flex-1 text-left">
              <h2 className="font-bold text-sm leading-tight group-hover:text-white transition-colors">{profile?.displayName}</h2>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <p className="text-[10px] text-zinc-500 font-mono">ID: {profile?.id.substring(0, 8)}</p>
              </div>
            </div>
            <Settings className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Main Content - Chat View */}
      <div className={cn(
        "flex-1 flex flex-col bg-zinc-900/5",
        !currentChatId && "hidden md:flex"
      )}>
        <AnimatePresence mode="wait">
          {currentChatId ? (
            <ChatView key={currentChatId} />
          ) : (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex-1 flex flex-col items-center justify-center p-8 text-center"
            >
              <div className="w-24 h-24 rounded-[2rem] bg-obsidian-900 border border-white/5 flex items-center justify-center mb-6 shadow-2xl">
                <MessageSquare className="w-10 h-10 text-slate-800" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Private Secure Chamber</h3>
              <p className="text-slate-500 max-w-xs text-sm leading-relaxed">
                Select a contact or scan a QR code to start an end-to-end encrypted P2P session.
              </p>
              <div className="mt-8 flex items-center gap-3">
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="px-6 py-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/10 text-sm font-medium transition-all"
                >
                  Scan New Contact
                </button>
                <button
                  onClick={startTempRoom}
                  className="px-6 py-3 bg-amber-500/10 hover:bg-amber-500/20 rounded-2xl border border-amber-500/20 text-amber-400 text-sm font-medium transition-all flex items-center gap-2"
                >
                  <Flame className="w-4 h-4" /> New Temp Room
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      {isAddModalOpen && <AddContactModal onClose={() => setIsAddModalOpen(false)} />}
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      {isCreateGroupOpen && <CreateGroupModal onClose={() => setIsCreateGroupOpen(false)} />}
    </div>
  );
}
