import React, { useEffect, useRef, useState } from 'react';
import Peer, { type DataConnection } from 'peerjs';
import { motion } from 'motion/react';
import { Copy, Check, LogOut, Flame, Send, Radio, Users, ShieldAlert } from 'lucide-react';
import { generateId, cn, formatTime } from '../lib/utils';
import { generateRoomKey, exportKeyToUrlSafe, importKeyFromUrlSafe, encryptText, decryptText } from '../lib/tempCrypto';
import { useSiSecure } from '../SiSecureContext';

interface TempMessage {
  id: string;
  from: string;
  content: string;
  timestamp: number;
  system?: boolean;
}

interface TempRoomViewProps {
  mode: 'host' | 'guest';
  roomId: string;
  roomKeyB64: string;
  onExit: () => void;
}

// Ephemeral, link-shared chat room. Nothing here ever touches Dexie — no
// `db.*` call exists anywhere in this file. Messages/roster live only in this
// component's React state and are gone the moment it unmounts. Encryption is
// a single shared AES-256-GCM key (src/lib/tempCrypto.ts) carried in the URL
// fragment, not the per-identity Olm Double Ratchet used elsewhere in the app
// — anyone with the full link can decrypt, by design (the link is the
// credential), see the in-room notice for the exact trade-off.
export function TempRoomView({ mode, roomId, roomKeyB64, onExit }: TempRoomViewProps) {
  const { profile } = useSiSecure();

  const [phase, setPhase] = useState<'setup' | 'connecting' | 'active' | 'closed'>('setup');
  const [username, setUsername] = useState(mode === 'host' ? (profile?.displayName || '') : '');
  const [messages, setMessages] = useState<TempMessage[]>([]);
  const [participants, setParticipants] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [closedReason, setClosedReason] = useState('');

  const peerRef = useRef<Peer | null>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map()); // host: peerId -> conn
  const usernamesRef = useRef<Map<string, string>>(new Map()); // host: peerId -> username
  const hostConnRef = useRef<DataConnection | null>(null); // guest: connection to host
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const shareUrl = `${window.location.origin}${window.location.pathname}#room=${roomId}&key=${roomKeyB64}`;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (msg: TempMessage) => setMessages(prev => [...prev, msg]);
  const addSystemMessage = (content: string) =>
    addMessage({ id: generateId(), from: 'system', content, timestamp: Date.now(), system: true });

  // ---- Host transport ----
  // Deliberately keyed off `hostSessionActive` (stable across the
  // connecting -> active transition), not raw `phase`. Depending on `phase`
  // directly re-runs this effect the instant `peer.on('open')` calls
  // `setPhase('active')`, and the cleanup destroys the just-opened peer
  // before any guest can connect to it.
  const hostSessionActive = mode === 'host' && (phase === 'connecting' || phase === 'active');
  useEffect(() => {
    if (!hostSessionActive || peerRef.current) return;
    let cancelled = false;

    (async () => {
      const key = await importKeyFromUrlSafe(roomKeyB64);
      if (cancelled) return;
      keyRef.current = key;

      const peer = new Peer(`troom_${roomId}`);
      peerRef.current = peer;

      peer.on('open', () => { if (!cancelled) setPhase('active'); });

      peer.on('connection', (conn) => {
        conn.on('data', (data) => handleHostData(conn, data));
        conn.on('close', () => handleGuestLeft(conn.peer));
        conn.on('error', () => handleGuestLeft(conn.peer));
      });

      peer.on('error', (err) => {
        console.error('[TempRoom] host peer error', err);
      });
    })();

    return () => {
      cancelled = true;
      connectionsRef.current.forEach(c => { try { c.close(); } catch { /* ignore */ } });
      connectionsRef.current.clear();
      usernamesRef.current.clear();
      if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    };
  }, [hostSessionActive, roomId, roomKeyB64]);

  const handleGuestLeft = (peerId: string) => {
    const leftName = usernamesRef.current.get(peerId);
    if (!leftName) return;
    usernamesRef.current.delete(peerId);
    connectionsRef.current.delete(peerId);
    setParticipants(Array.from(usernamesRef.current.values()));
    addSystemMessage(`${leftName} left the room`);
    broadcastToGuests({ type: 'T_PARTICIPANT_LEFT', payload: { username: leftName } });
  };

  const broadcastToGuests = (payload: any, exceptPeerId?: string) => {
    connectionsRef.current.forEach((conn, peerId) => {
      if (peerId === exceptPeerId) return;
      try { conn.send(payload); } catch { /* ignore */ }
    });
  };

  const handleHostData = async (conn: DataConnection, data: any) => {
    const { type, payload } = data || {};
    if (!type) return;
    const key = keyRef.current;
    if (!key) return;

    if (type === 'T_JOIN') {
      const joinName = String(payload?.username || 'Guest').slice(0, 40);
      usernamesRef.current.set(conn.peer, joinName);
      connectionsRef.current.set(conn.peer, conn);
      setParticipants(Array.from(usernamesRef.current.values()));

      conn.send({ type: 'T_WELCOME', payload: { participants: Array.from(usernamesRef.current.values()) } });
      broadcastToGuests({ type: 'T_PARTICIPANT_JOINED', payload: { username: joinName } }, conn.peer);
      addSystemMessage(`${joinName} joined the room`);
      return;
    }

    if (type === 'T_MSG') {
      try {
        const content = await decryptText(key, payload.iv, payload.ciphertext);
        addMessage({ id: payload.id, from: payload.from, content, timestamp: payload.timestamp });
      } catch (err) {
        console.error('[TempRoom] decrypt failed', err);
      }
      broadcastToGuests({ type: 'T_MSG', payload }, conn.peer);
    }
  };

  // ---- Guest transport ----
  // Same `sessionActive`-not-`phase` reasoning as the host effect above:
  // `T_WELCOME` flips phase to 'active' mid-flight, and depending on raw
  // `phase` here would tear down the just-opened connection to the host.
  const guestSessionActive = mode === 'guest' && (phase === 'connecting' || phase === 'active');
  useEffect(() => {
    if (!guestSessionActive || peerRef.current) return;
    let cancelled = false;

    (async () => {
      const key = await importKeyFromUrlSafe(roomKeyB64);
      if (cancelled) return;
      keyRef.current = key;

      const peer = new Peer(`tguest_${generateId()}`);
      peerRef.current = peer;

      peer.on('open', () => {
        if (cancelled) return;
        // 'binary' (PeerJS default), not 'json' — json mode can't chunk large
        // payloads, so anything sizeable (e.g. a room member's message with
        // an attachment) would fail outright.
        const conn = peer.connect(`troom_${roomId}`, { reliable: true, serialization: 'binary' });
        hostConnRef.current = conn;

        conn.on('open', () => {
          conn.send({ type: 'T_JOIN', payload: { username } });
        });
        conn.on('data', (data) => handleGuestData(data));
        conn.on('close', () => {
          setClosedReason('Connection to the room host was lost.');
          setPhase('closed');
        });
        conn.on('error', () => {
          setClosedReason('Could not reach that room. It may have already been destroyed.');
          setPhase('closed');
        });
      });

      peer.on('error', (err) => {
        console.error('[TempRoom] guest peer error', err);
        setClosedReason('Could not establish a connection.');
        setPhase('closed');
      });
    })();

    return () => {
      cancelled = true;
      hostConnRef.current = null;
      if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    };
  }, [guestSessionActive, roomId, roomKeyB64, username]);

  const handleGuestData = async (data: any) => {
    const { type, payload } = data || {};
    if (!type) return;
    const key = keyRef.current;

    if (type === 'T_WELCOME') {
      setParticipants(payload.participants || []);
      setPhase('active');
      return;
    }

    if (type === 'T_PARTICIPANT_JOINED') {
      setParticipants(prev => [...prev, payload.username]);
      addSystemMessage(`${payload.username} joined the room`);
      return;
    }

    if (type === 'T_PARTICIPANT_LEFT') {
      setParticipants(prev => prev.filter(u => u !== payload.username));
      addSystemMessage(`${payload.username} left the room`);
      return;
    }

    if (type === 'T_MSG' && key) {
      try {
        const content = await decryptText(key, payload.iv, payload.ciphertext);
        addMessage({ id: payload.id, from: payload.from, content, timestamp: payload.timestamp });
      } catch (err) {
        console.error('[TempRoom] decrypt failed', err);
      }
      return;
    }

    if (type === 'T_ROOM_CLOSED') {
      setClosedReason('The host destroyed this room.');
      setPhase('closed');
    }
  };

  // ---- Sending ----
  const handleSend = async () => {
    const key = keyRef.current;
    const text = input.trim();
    if (!key || !text) return;
    setInput('');

    const { iv, ciphertext } = await encryptText(key, text);
    const msg = { id: generateId(), from: username, iv, ciphertext, timestamp: Date.now() };

    addMessage({ id: msg.id, from: username, content: text, timestamp: msg.timestamp });

    if (mode === 'host') {
      broadcastToGuests({ type: 'T_MSG', payload: msg });
    } else {
      hostConnRef.current?.send({ type: 'T_MSG', payload: msg });
    }
  };

  // ---- Leaving / destroying ----
  const handleLeave = () => {
    if (mode === 'host') {
      broadcastToGuests({ type: 'T_ROOM_CLOSED', payload: {} });
    }
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch { /* ignore */ }
      peerRef.current = null;
    }
    onExit();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard unavailable */ }
  };

  const startConnecting = () => {
    if (!username.trim()) return;
    setPhase('connecting');
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex flex-col bg-obsidian-950 text-zinc-100"
    >
      {(phase === 'setup') && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md space-y-8">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                <Flame className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {mode === 'host' ? 'New Temp Room' : 'Join Secure Room'}
              </h1>
              <p className="text-zinc-500 text-sm leading-relaxed max-w-sm mx-auto">
                {mode === 'host'
                  ? 'A disposable, encrypted room. Nothing is stored on this device — close it and it\'s gone.'
                  : 'You\'ve been invited to an ephemeral encrypted room. Pick a name to join — no account needed.'}
              </p>
            </div>

            <div className="glass rounded-3xl p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Display name for this room</label>
                <input
                  autoFocus
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && startConnecting()}
                  placeholder="e.g. Anon"
                  className="w-full h-14 bg-zinc-900/50 border border-white/5 rounded-2xl px-5 focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-sm placeholder:text-zinc-700"
                />
              </div>
              <button
                disabled={!username.trim()}
                onClick={startConnecting}
                className={cn(
                  'w-full h-14 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-2xl transition-all',
                  !username.trim() && 'opacity-50 cursor-not-allowed grayscale'
                )}
              >
                {mode === 'host' ? 'Create Room' : 'Join Room'}
              </button>
              <button onClick={onExit} className="w-full text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {(phase === 'connecting' || phase === 'active') && (
        <>
          <div className="border-b border-zinc-800/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                  <Flame className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold flex items-center gap-2">
                    Temp Room
                    <span className={cn(
                      'text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full flex items-center gap-1',
                      phase === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-500'
                    )}>
                      <Radio className="w-2.5 h-2.5" /> {phase === 'active' ? 'Live' : 'Connecting…'}
                    </span>
                  </h2>
                  <p className="text-[10px] text-zinc-600 font-mono">ROOM_ID // {roomId}</p>
                </div>
              </div>
              <button
                onClick={handleLeave}
                className="h-10 px-4 bg-zinc-900 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 rounded-xl text-zinc-500 hover:text-red-500 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all"
              >
                <LogOut className="w-3.5 h-3.5" /> {mode === 'host' ? 'Destroy Room' : 'Leave'}
              </button>
            </div>

            {mode === 'host' && (
              <div className="flex items-center gap-2 bg-zinc-900/50 border border-white/5 rounded-xl px-4 py-3">
                <span className="flex-1 text-xs font-mono text-zinc-400 truncate">{shareUrl}</span>
                <button
                  onClick={copyLink}
                  className="shrink-0 h-8 px-3 bg-amber-600 hover:bg-amber-500 rounded-lg text-[10px] font-bold uppercase text-white flex items-center gap-1.5 transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy Link'}
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 text-[10px] text-zinc-600">
              <Users className="w-3.5 h-3.5" />
              <span>{participants.length + 1} in room{participants.length > 0 ? ` — ${[username, ...participants.filter(p => p !== username)].join(', ')}` : ` — ${username} (you)`}</span>
            </div>

            <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/10 rounded-xl px-4 py-2.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-500/70 shrink-0 mt-0.5" />
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Encrypted with a key shared only via this link — anyone holding the link can read the room. Nothing here is saved to any device; closing or destroying the room erases it for good.
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {messages.map((m) => (
              m.system ? (
                <div key={m.id} className="text-center">
                  <span className="text-[10px] text-zinc-600 uppercase tracking-widest">{m.content}</span>
                </div>
              ) : (
                <div key={m.id} className={cn('flex flex-col max-w-[75%]', m.from === username ? 'ml-auto items-end' : 'items-start')}>
                  <span className="text-[10px] text-zinc-600 mb-1 px-1">{m.from === username ? 'You' : m.from} · {formatTime(m.timestamp)}</span>
                  <div className={cn(
                    'px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                    m.from === username ? 'bg-amber-600 text-white rounded-br-md' : 'bg-zinc-900 text-zinc-200 border border-white/5 rounded-bl-md'
                  )}>
                    {m.content}
                  </div>
                </div>
              )
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-5 border-t border-zinc-800/60 flex items-center gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              disabled={phase !== 'active'}
              placeholder={phase === 'active' ? 'Write a message…' : 'Connecting…'}
              className="flex-1 h-12 bg-zinc-900/50 border border-white/5 rounded-2xl px-5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50 placeholder:text-zinc-700 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={phase !== 'active' || !input.trim()}
              className={cn(
                'w-12 h-12 rounded-2xl bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center transition-all shrink-0',
                (phase !== 'active' || !input.trim()) && 'opacity-40 cursor-not-allowed'
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </>
      )}

      {phase === 'closed' && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-sm text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-900 border border-white/5 text-zinc-600">
              <Flame className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Room Closed</h2>
              <p className="text-sm text-zinc-500">{closedReason || 'This temp room is no longer active.'}</p>
            </div>
            <button
              onClick={onExit}
              className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 border border-white/5 rounded-2xl font-semibold transition-all"
            >
              Return to SiSecure
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
