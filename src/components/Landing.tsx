import { useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ShieldCheck,
  QrCode,
  Lock,
  Radio,
  Users,
  HardDrive,
  Timer,
  Flame,
  Github,
  Bell,
  Server,
  Coffee,
} from 'lucide-react';
import { TempRoomView } from './TempRoomView';
import { generateId } from '../lib/utils';
import { generateRoomKey, exportKeyToUrlSafe } from '../lib/tempCrypto';

interface LandingProps {
  onGetStarted: () => void;
}

const FEATURES = [
  { icon: ShieldCheck, title: 'Local identity', body: 'A keypair generated on-device at signup. No phone number, no email, no account server.' },
  { icon: QrCode, title: 'Physical verification', body: 'Add contacts by scanning a QR code or entering a public key — no central lookup.' },
  { icon: Lock, title: 'Real Double Ratchet', body: 'Every conversation runs its own Olm session, the same crypto library Matrix/Element use.' },
  { icon: Radio, title: 'Direct P2P transport', body: 'Messages travel over WebRTC, peer to peer. A signaling broker helps you connect — it never sees content.' },
  { icon: Users, title: 'Encrypted groups', body: 'Megolm group sessions with automatic key rotation as membership changes.' },
  { icon: HardDrive, title: 'Local data sovereignty', body: 'Everything lives in your browser. Encrypted export/import to move to a new device.' },
  { icon: Server, title: 'Bring your own relay', body: "Point at your own signaling server and TURN relay in Settings. Both sides need the same signaling server to find each other; STUN/TURN can differ per device." },
];

const STEPS = [
  'A local keypair is generated on-device — that\'s your entire identity.',
  'Scan a contact\'s QR code (or enter their key) to open a direct WebRTC connection.',
  'The moment it opens, a Double Ratchet session bootstraps with zero extra round trips.',
  'Every message is encrypted before it ever leaves your device.',
];

export function Landing({ onGetStarted }: LandingProps) {
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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="h-full overflow-y-auto bg-obsidian-950 text-zinc-100"
    >
      {/* Header */}
      <div className="flex items-center justify-end gap-3 px-6 pt-6 max-w-5xl mx-auto">
        <a
          href="https://github.com/ivucicev/SiSecure"
          target="_blank"
          rel="noopener noreferrer"
          className="h-10 px-4 flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-sm font-medium rounded-xl transition-all"
        >
          <Github className="w-4 h-4" /> GitHub
        </a>
        <a
          href="https://buymeacoffee.com/ivucicev"
          target="_blank"
          rel="noopener noreferrer"
          className="h-10 px-4 flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-black text-sm font-semibold rounded-xl transition-all"
        >
          <Coffee className="w-4 h-4" /> Buy me a coffee
        </a>
      </div>

      {/* Hero */}
      <div className="max-w-3xl mx-auto px-6 pt-24 pb-16 text-center space-y-8">
        <img src="/icon-512.png" alt="SiSecure" className="w-16 h-16 rounded-2xl shadow-xl shadow-blue-900/40 mx-auto" />
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight">SiSecure</h1>
          <p className="text-zinc-400 text-lg leading-relaxed max-w-xl mx-auto font-light">
            A pure peer-to-peer messenger with real end-to-end encryption. No server ever sees
            your messages, contacts, or metadata.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            onClick={onGetStarted}
            className="w-full sm:w-auto h-14 px-8 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 group transition-all"
          >
            Get Started
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          <button
            onClick={startTempRoom}
            className="w-full sm:w-auto h-14 px-8 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all"
          >
            <Flame className="w-5 h-5" /> Start a Temp Room — no account
          </button>
        </div>
      </div>

      {/* Features */}
      <div className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="glass rounded-2xl p-6 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                <Icon className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="max-w-3xl mx-auto px-6 pb-20">
        <h2 className="text-xl font-semibold text-center mb-8">How it works</h2>
        <div className="space-y-4">
          {STEPS.map((step, i) => (
            <div key={i} className="flex items-start gap-4 glass rounded-2xl p-5">
              <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                {i + 1}
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed pt-1">{step}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Roadmap */}
      <div className="max-w-3xl mx-auto px-6 pb-24">
        <div className="glass rounded-2xl p-6 flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Bell className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              Wake Up <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">Roadmap</span>
            </h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              A one-tap ping that prompts an offline peer to open SiSecure, with no message
              content ever attached. Not yet functional — see the README for the full,
              disclosed trade-off.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800/60 py-8 text-center">
        <p className="text-[10px] text-zinc-700 flex items-center justify-center gap-1.5">
          <Timer className="w-3 h-3" /> Zero server · Zero metadata · Local-first, always
        </p>
      </div>
    </motion.div>
  );
}
