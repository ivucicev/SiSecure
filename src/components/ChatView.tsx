import React, { useState, useRef, useEffect, useMemo, Suspense, lazy } from 'react';
import { useSiSecure } from '../SiSecureContext';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  ArrowLeft, 
  Image as ImageIcon, 
  Mic, 
  Paperclip, 
  Smile, 
  Check, 
  CheckCheck,
  MoreVertical,
  Shield,
  Trash2,
  Lock,
  Clock,
  Play,
  Pause,
  Film,
  X,
  Search,
  MessageCircle,
  ThumbsUp,
  Heart,
  Laugh,
  AlertCircle,
  Forward,
  UserPlus,
  Users,
  Boxes,
  Zap,
  Bell
} from 'lucide-react';
import { cn, formatTime } from '../lib/utils';
import { Message } from '../lib/db';
const GroupInfoModal = lazy(() => import('./GroupInfoModal').then(m => ({ default: m.GroupInfoModal })));
const WakeUpInfoModal = lazy(() => import('./WakeUpInfoModal').then(m => ({ default: m.WakeUpInfoModal })));

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export function ChatView() {
  const { 
    currentChatId, 
    setCurrentChatId, 
    contacts, 
    messages, 
    sendMessage, 
    forwardMessage,
    deleteMessage,
    reactToMessage,
    markAsRead,
    typingStatus,
    sendTypingSignal,
    profile,
    groups,
    addMemberToGroup
  } = useSiSecure();
  
  const [input, setInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [forwardingId, setForwardingId] = useState<string | null>(null);
  const [isGroupInfoOpen, setIsGroupInfoOpen] = useState(false);
  const [isWakeUpInfoOpen, setIsWakeUpInfoOpen] = useState(false);
  const [isReactionMenuId, setIsReactionMenuId] = useState<string | null>(null);
  const [selectedForwardingContacts, setSelectedForwardingContacts] = useState<string[]>([]);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recordingCancelledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const contact = contacts.find(c => c.publicKey === currentChatId);
  const group = groups.find(g => g.id === currentChatId);

  // Whoever we'd be sending to right now is unreachable — this is exactly the
  // moment Wake Up (not yet implemented) is meant for, so surface it here
  // rather than as an always-present, ambiguous toolbar icon.
  const recipientOffline = group
    ? !group.members.some(m => m !== profile?.publicKey && contacts.find(c => c.publicKey === m)?.isOnline)
    : !!contact && !contact.isOnline;

  const filteredMessages = useMemo(() => {
    if (!searchQuery) return messages;
    return messages.filter(m => m.content.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [messages, searchQuery]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredMessages]);

  // Composer grows with content up to a cap, then scrolls internally.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  // Mark unseen messages as read
  useEffect(() => {
    if (!profile || !currentChatId) return;
    const unreadMessages = messages.filter(m => 
      m.senderPublicKey === currentChatId && 
      m.status !== 'read'
    );
    
    unreadMessages.forEach(m => markAsRead(m.id));
  }, [messages, currentChatId, profile, markAsRead]);

  if (!contact && !group) return null;

  const handleSend = () => {
    if (input.trim() && (contact || group)) {
      sendMessage(currentChatId!, input.trim(), 'text', undefined, !!group);
      setInput('');

      // Stop typing signal
      if (isTypingRef.current && contact) {
        isTypingRef.current = false;
        sendTypingSignal(contact.publicKey, false);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);

    if (contact) {
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        sendTypingSignal(contact.publicKey, true);
      }

      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false;
        sendTypingSignal(contact.publicKey, false);
      }, 2000);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());

        if (recordingCancelledRef.current) {
          audioChunksRef.current = [];
          return;
        }

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          if (currentChatId) {
            sendMessage(currentChatId, 'Voice message', 'voice', reader.result as string, !!group);
          }
        };
        reader.readAsDataURL(audioBlob);
      };

      mediaRecorder.start();
      recordingCancelledRef.current = false;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Mic access denied", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      recordingCancelledRef.current = false;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      recordingCancelledRef.current = true;
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const readAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  // Full-resolution phone camera photos (often several MB, sometimes HEIC on
  // iOS) are unreliable to send as-is: they can exceed libolm's safe payload
  // size and Chromium/Firefox can't even render HEIC in an <img> tag.
  // createImageBitmap decodes whatever the source format is (Safari can read
  // HEIC) and canvas re-encoding always outputs plain JPEG, downscaled to a
  // sane chat-photo size. Falls back to the raw file if any of that fails,
  // so sending never silently blocks.
  const compressImage = async (file: File, maxDim = 1920, quality = 0.82): Promise<string> => {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      let { width, height } = bitmap;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no-2d-context');
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      return canvas.toDataURL('image/jpeg', quality);
    } catch (err) {
      console.error('[SiSecure] Image compression failed, sending original file', err);
      return readAsDataURL(file);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file || !currentChatId) return;

    const type = file.type.startsWith('image/') ? 'image' : 'video';
    const dataUrl = type === 'image' ? await compressImage(file) : await readAsDataURL(file);
    sendMessage(currentChatId, `${type.charAt(0).toUpperCase() + type.slice(1)} attachment`, type as any, dataUrl, !!group);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0A0A0A]/50 relative">
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileSelect} 
        className="hidden" 
        accept="image/*,video/*"
      />

      <AnimatePresence>
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#121212] border border-white/10 p-6 rounded-3xl max-w-xs w-full my-auto shadow-2xl"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-12 h-12 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold">Delete Message?</h3>
                <p className="text-sm text-zinc-500">This will remove the message from your device and attempt to remove it from the recipient's.</p>
                <div className="flex gap-3 w-full">
                  <button 
                    onClick={() => {
                      deleteMessage(deleteConfirmId);
                      setDeleteConfirmId(null);
                    }}
                    className="flex-1 h-11 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold uppercase transition-all"
                  >
                    Delete
                  </button>
                  <button 
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 h-11 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold uppercase transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {forwardingId && (
          <div className="fixed inset-0 z-50 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto bg-black/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0A0A0A] border border-white/5 p-8 rounded-[2.5rem] max-w-sm w-full my-auto shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Forward className="w-5 h-5 text-blue-500" />
                  Forward To
                </h3>
                <button onClick={() => { setForwardingId(null); setSelectedForwardingContacts([]); }} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {contacts.map(c => (
                  <button 
                    key={c.publicKey}
                    onClick={() => {
                      setSelectedForwardingContacts(prev => 
                        prev.includes(c.publicKey) ? prev.filter(p => p !== c.publicKey) : [...prev, c.publicKey]
                      );
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-2xl border transition-all",
                      selectedForwardingContacts.includes(c.publicKey) 
                        ? "bg-blue-600/10 border-blue-600/30 text-blue-400" 
                        : "bg-zinc-900/50 border-white/5 text-zinc-500 hover:border-white/10"
                    )}
                  >
                    <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold">
                      {c.displayName.charAt(0)}
                    </div>
                    <span className="text-sm font-bold truncate flex-1 text-left">{c.displayName}</span>
                    {selectedForwardingContacts.includes(c.publicKey) && <Check className="w-4 h-4" />}
                  </button>
                ))}
              </div>

              <button 
                onClick={async () => {
                  if (forwardingId && selectedForwardingContacts.length > 0) {
                    await forwardMessage(forwardingId, selectedForwardingContacts);
                    setForwardingId(null);
                    setSelectedForwardingContacts([]);
                  }
                }}
                disabled={selectedForwardingContacts.length === 0}
                className="w-full h-14 bg-blue-600 disabled:opacity-50 disabled:bg-zinc-800 rounded-2xl text-xs font-bold uppercase tracking-widest text-white transition-all shadow-lg shadow-blue-900/20"
              >
                Forward Message
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Suspense fallback={null}>
        <AnimatePresence>
          {isGroupInfoOpen && group && (
            <GroupInfoModal
              group={group}
              onClose={() => setIsGroupInfoOpen(false)}
            />
          )}
        </AnimatePresence>

        <AnimatePresence>
          {isWakeUpInfoOpen && (
            <WakeUpInfoModal onClose={() => setIsWakeUpInfoOpen(false)} />
          )}
        </AnimatePresence>
      </Suspense>

      {/* Header */}
      <header className="shrink-0 min-h-20 pt-[max(3.5rem,env(safe-area-inset-top))] border-b border-zinc-800/60 flex items-center justify-between px-4 sm:px-8 bg-[#0A0A0A]/80 backdrop-blur-md">
        <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
          <button 
            onClick={() => setCurrentChatId(null)}
            className="p-2 hover:bg-white/5 rounded-full md:hidden text-zinc-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          {!isSearching ? (
            <>
              <div className="relative shrink-0">
                <div className="w-11 h-11 rounded-full bg-zinc-800/50 border border-white/5 flex items-center justify-center overflow-hidden">
                  {contact ? (
                    contact.avatar ? <img src={contact.avatar} alt="" className="w-full h-full object-cover" /> : <span className="text-lg font-medium text-zinc-400">{contact.displayName.charAt(0)}</span>
                  ) : (
                    <Boxes className="w-5 h-5 text-purple-400" />
                  )}
                </div>
                {contact?.isOnline && (
                  <div className="absolute -bottom-1 -right-1 p-1 bg-green-500 rounded-full border-4 border-[#0A0A0A]" />
                )}
              </div>
              <div className="truncate">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-zinc-100 truncate">{contact?.displayName || group?.name}</h3>
                  <span className={cn(
                    "shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-tighter",
                    group ? "bg-purple-500/10 text-purple-500 border-purple-500/20" : "bg-blue-500/10 text-blue-500 border-blue-500/20"
                  )}>
                    {group ? 'Peer Group' : 'Verified'}
                  </span>
                </div>
                {contact && typingStatus[contact.publicKey] ? (
                  <p className="text-[10px] text-blue-500 animate-pulse font-bold uppercase tracking-widest">Typing encrypted reply...</p>
                ) : (
                  <p className="text-[10px] text-zinc-500 font-mono tracking-tighter uppercase truncate">
                    {group ? `${group.members.length} Agents Connected` : 'Direct P2P Link Established'}
                  </p>
                )}
              </div>
            </>
          ) : (
            <motion.div 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex-1 flex items-center bg-zinc-900/50 rounded-xl px-4 py-2 border border-white/5"
            >
              <Search className="w-4 h-4 text-zinc-500 mr-2" />
              <input 
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search messages..."
                className="bg-transparent border-none outline-none text-sm w-full text-zinc-200 placeholder:text-zinc-600"
              />
              <button onClick={() => { setIsSearching(false); setSearchQuery(''); }} className="p-1 hover:bg-white/5 rounded-md text-zinc-500">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2 ml-2 sm:ml-4 shrink-0">
          {group && (
            <button
              onClick={() => setIsGroupInfoOpen(true)}
              className="p-2.5 bg-purple-500/10 hover:bg-purple-500/20 rounded-xl text-purple-400 transition-colors flex items-center gap-2 sm:px-4 group"
            >
              <UserPlus className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase tracking-widest hidden lg:block">Invite Agent</span>
            </button>
          )}
          <button
            onClick={() => setIsSearching(!isSearching)}
            className={cn(
              "p-2.5 hover:bg-white/5 rounded-xl transition-colors",
              isSearching ? "text-blue-500 bg-blue-500/10" : "text-zinc-500"
            )}
          >
            <Search className="w-5 h-5" />
          </button>
          {/* Not yet wired to anything — dropped on mobile so the contact
              name isn't squeezed down to a couple of characters. */}
          <button className="hidden sm:block p-2.5 hover:bg-white/5 rounded-xl text-zinc-500 transition-colors">
            <Shield className="w-5 h-5" />
          </button>
          <button className="hidden sm:block p-2.5 hover:bg-white/5 rounded-xl text-zinc-500 transition-colors">
            <MoreVertical className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Message Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-8 space-y-6 scroll-smooth"
      >
        <div className="flex justify-center my-6">
          <div className="glass px-4 py-1.5 rounded-full flex items-center gap-2">
            <Lock className="w-3 h-3 text-zinc-500" />
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">End-to-End Encrypted</span>
          </div>
        </div>

        {searchQuery && filteredMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-500 space-y-4">
            <div className="p-4 bg-zinc-900/50 rounded-full">
              <MessageCircle className="w-8 h-8 opacity-20" />
            </div>
            <p className="text-sm font-medium tracking-tight">No messages matching "{searchQuery}"</p>
          </div>
        )}

        {filteredMessages.map((msg, idx) => {
          const isMe = msg.senderPublicKey === profile?.publicKey;
          const sender = contacts.find(c => c.publicKey === msg.senderPublicKey);
          
          return (
            <motion.div
              layout
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              key={msg.id}
              className={cn(
                "flex items-end gap-2 sm:gap-3 max-w-[88%] sm:max-w-[80%] md:max-w-[70%] group relative min-w-0",
                isMe ? "ml-auto flex-row-reverse" : "mr-auto"
              )}
            >
              {!isMe && (
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex-shrink-0 mb-1 border border-white/5 flex items-center justify-center overflow-hidden">
                  {sender?.avatar ? (
                    <img src={sender.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-zinc-500 font-bold uppercase">{sender?.displayName.charAt(0) || '?'}</span>
                  )}
                </div>
              )}

              <div className={cn(
                "flex flex-col space-y-1.5 min-w-0",
                isMe ? "items-end" : "items-start"
              )}>
                {group && !isMe && (
                  <div className="flex items-center gap-1.5 mb-1 px-1">
                    <Zap className="w-2.5 h-2.5 text-purple-500 fill-purple-500/20" />
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">{sender?.displayName || 'Unknown Agent'}</span>
                  </div>
                )}
                <div className="relative group/content min-w-0 max-w-full">
                  <div className={cn(
                    "overflow-hidden rounded-2xl text-sm leading-relaxed",
                    isMe 
                      ? "bg-blue-600 text-white rounded-br-none shadow-lg shadow-blue-900/10" 
                      : "bg-zinc-800/80 text-zinc-100 border border-white/5 rounded-bl-none backdrop-blur-sm"
                  )}>
                    <MessageContent message={msg} isMe={isMe} />
                  </div>

                  {/* Reaction Button (Overlay) */}
                  <div className={cn(
                    "absolute top-0 opacity-0 group-hover/content:opacity-100 transition-all duration-200 z-10 flex gap-1",
                    isMe ? "right-full mr-2" : "left-full ml-2"
                  )}>
                    <div className="bg-zinc-900 border border-white/10 rounded-full px-2 py-1 flex items-center gap-1.5 shadow-xl">
                      {REACTION_EMOJIS.slice(0, 3).map(emoji => (
                        <button 
                          key={emoji}
                          onClick={() => reactToMessage(msg.id, emoji)}
                          className="hover:scale-125 transition-transform p-0.5"
                        >
                          {emoji}
                        </button>
                      ))}
                      <div className="w-px h-3 bg-white/10 mx-0.5" />
                      {isMe && (
                        <button 
                          onClick={() => setDeleteConfirmId(msg.id)}
                          className="p-1 hover:text-red-500 transition-colors text-zinc-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button 
                        onClick={() => setForwardingId(msg.id)}
                        className="p-1 hover:text-blue-500 transition-colors text-zinc-500"
                      >
                        <Forward className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Reactions Display */}
                {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                  <div className={cn(
                    "flex flex-wrap gap-1 mt-1",
                    isMe ? "justify-end" : "justify-start"
                  )}>
                    {Object.entries(msg.reactions).map(([emoji, users]) => {
                      const uList = users as string[];
                      return (
                        <button 
                          key={emoji}
                          onClick={() => reactToMessage(msg.id, emoji)}
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] flex items-center gap-1.5 border transition-all",
                            uList.includes(profile?.publicKey || '') 
                              ? "bg-blue-500/10 border-blue-500/20 text-blue-400" 
                              : "bg-zinc-900/80 border-white/5 text-zinc-400"
                          )}
                        >
                          <span>{emoji}</span>
                          <span className="font-bold opacity-70">{uList.length}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-2 px-1">
                  <span className="text-[9px] text-zinc-600 font-mono tracking-wider">
                    {formatTime(msg.timestamp)}
                  </span>
                  {isMe && (
                    <div className="flex items-center gap-1">
                      {msg.status === 'sending' && (
                        <motion.div 
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="flex items-center gap-1 text-zinc-600"
                        >
                          <Clock className="w-2.5 h-2.5 animate-spin duration-[3000ms]" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Broadcasting</span>
                        </motion.div>
                      )}
                      {msg.status === 'sent' && (
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="flex items-center gap-1 text-zinc-500 animate-pulse"
                        >
                          <Check className="w-3 h-3" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">In Transit (Waiting for Peer)</span>
                        </motion.div>
                      )}
                      {msg.status === 'delivered' && (
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="flex items-center gap-1 text-zinc-400"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Landed on Node</span>
                        </motion.div>
                      )}
                      {msg.status === 'read' && (
                        <motion.div 
                          initial={{ scale: 0.8, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="flex items-center gap-1 text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.4)]"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span className="text-[8px] font-bold uppercase tracking-tighter">Decrypted & Read</span>
                        </motion.div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Input Area — a plain flex sibling after the scrollable message
          list, not nested inside it. A prior attempt made this sticky
          *inside* the scroll container on the theory that sticky tracks
          the visible viewport better than height math on iOS — true when
          scrolled, but sticky only pins once you scroll past an element's
          natural position. On a short conversation the message list never
          needs to scroll, so the composer just sat at its natural
          position right after the last message — nowhere near the bottom
          of the screen, leaving a large empty gap below it. flex-1 on the
          message list above always fills the available height regardless
          of content length, so a composer placed after it as a normal
          sibling is always at the visual bottom — no scroll-dependence,
          no edge case for short chats. */}
      <div className="p-3 sm:p-6 bg-[#0A0A0A] border-t border-zinc-800/60">
        <AnimatePresence>
          {isRecording && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute inset-x-6 bottom-32 glass rounded-2xl p-4 flex items-center justify-between z-20"
            >
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                <span className="font-mono text-sm">Recording: {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelRecording}
                  title="Cancel — discard without sending"
                  className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Cancel
                </button>
                <button
                  onClick={stopRecording}
                  className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest"
                >
                  Send
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-4xl mx-auto flex items-end gap-2 sm:gap-4">
          <div className="flex-1 relative flex items-end">
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = 'image/*';
                  fileInputRef.current.click();
                }
              }}
              className="absolute left-3 sm:left-4 bottom-2.5 text-zinc-500 hover:text-blue-500 transition-colors"
            >
              <ImageIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.accept = 'video/*,image/*';
                  fileInputRef.current.click();
                }
              }}
              className="absolute left-10 sm:left-12 bottom-2.5 text-zinc-500 hover:text-blue-500 transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isRecording ? "Recording..." : "Message..."}
              disabled={isRecording}
              className="w-full max-h-[120px] overflow-y-auto resize-none bg-zinc-900/50 border-none rounded-2xl py-3 pl-20 sm:pl-22 pr-10 sm:pr-12 text-sm leading-relaxed focus:ring-1 focus:ring-blue-500 text-zinc-300 placeholder:text-zinc-600 transition-all font-light"
            />
            <button className="absolute right-3 sm:right-4 bottom-2.5 text-zinc-500 hover:text-blue-500 transition-colors">
              <Smile className="w-5 h-5" />
            </button>
          </div>

          {recipientOffline && (
            <button
              onClick={() => setIsWakeUpInfoOpen(true)}
              title={`${group ? 'No one in this group is' : `${contact?.displayName} is`} offline right now — tap to Wake Up`}
              className="w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-500 transition-all"
            >
              <Bell className="w-5 h-5" />
            </button>
          )}

          {input.trim() ? (
            <button
              onClick={handleSend}
              className="w-12 h-12 shrink-0 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-900/20 transition-all"
            >
              <Send className="w-5 h-5 rotate-45 -translate-y-0.5" />
            </button>
          ) : (
            <button
              onClick={startRecording}
              className={cn(
                "w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition-all bg-zinc-800 text-zinc-400 hover:text-blue-500",
                isRecording && "bg-blue-600 text-white animate-pulse"
              )}
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageContent({ message, isMe }: { message: Message, isMe: boolean }) {
  if (message.type === 'text') {
    return <div className="px-4 py-3 break-words whitespace-pre-wrap [overflow-wrap:anywhere]">{message.content}</div>;
  }

  if (message.type === 'image') {
    return (
      <div className="p-1">
        <img src={message.mediaUrl} alt="" className="rounded-xl max-w-full h-auto max-h-[300px] object-cover" />
      </div>
    );
  }

  if (message.type === 'video') {
    return (
      <div className="p-1 relative group">
        <video src={message.mediaUrl} className="rounded-xl max-w-full h-auto max-h-[300px]" controls />
      </div>
    );
  }

  if (message.type === 'voice') {
    return <VoicePlayer url={message.mediaUrl || ''} isMe={isMe} />;
  }

  return null;
}

function VoicePlayer({ url, isMe }: { url: string, isMe: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className="px-4 py-3 flex items-center gap-3 sm:gap-4 w-[min(240px,60vw)]">
      <audio 
        src={url} 
        ref={audioRef} 
        onEnded={() => setIsPlaying(false)}
        className="hidden"
      />
      <button 
        onClick={togglePlay}
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all",
          isMe ? "bg-white text-blue-600" : "bg-blue-600 text-white"
        )}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current translate-x-0.5" />}
      </button>
      
      <div className="flex-1 flex items-center gap-1 h-6">
        {[2, 4, 6, 3, 5, 2, 6, 4, 3, 5, 2, 4, 2].map((h, i) => (
          <div 
            key={i} 
            className={cn(
              "w-0.5 rounded-full transition-all",
              isPlaying ? "bg-current animate-pulse" : "bg-current/30"
            )}
            style={{ height: `${h * 4}px` }}
          />
        ))}
      </div>
      <span className="text-[10px] font-mono opacity-60">0:12</span>
    </div>
  );
}
