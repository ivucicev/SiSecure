import { useState } from 'react';
import { motion } from 'motion/react';
import { Lock, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { tryUnlockPin } from '../lib/vault';

interface UnlockScreenProps {
  pinSalt: string;
  pinVerifier?: string;
  pinWrappedKey?: string;
  onUnlock: () => void;
}

// Rendered *before* SiSecureProvider mounts — Olm account/session loading
// needs the vault key already in memory (see src/lib/vault.ts and
// pickleKeyFor in src/lib/olm.ts), so the app can't start initializing
// until this resolves.
export function UnlockScreen({ pinSalt, pinVerifier, pinWrappedKey, onUnlock }: UnlockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleSubmit = async () => {
    if (!pin || checking) return;
    setChecking(true);
    setError(false);
    const ok = await tryUnlockPin(pin, { pinSalt, pinVerifier, pinWrappedKey });
    setChecking(false);
    if (ok) {
      onUnlock();
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-6 bg-obsidian-950 text-zinc-100">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8"
      >
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-xl shadow-blue-900/40 text-white">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Enter your PIN</h1>
            <p className="text-zinc-500 text-sm">Unlocks your local identity and messages.</p>
          </div>
        </div>

        <div className="glass rounded-3xl p-8 space-y-5">
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => { setPin(e.target.value); setError(false); }}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="PIN"
            className={cn(
              "w-full h-14 bg-zinc-900/50 border rounded-2xl px-5 text-center text-lg tracking-[0.3em] focus:outline-none focus:ring-1 transition-all placeholder:text-zinc-700 placeholder:tracking-normal",
              error ? "border-red-500/50 focus:ring-red-500/50" : "border-white/5 focus:ring-blue-500/50"
            )}
          />
          {error && (
            <p className="text-red-500 text-xs text-center -mt-2">Incorrect PIN — try again.</p>
          )}
          <button
            disabled={!pin || checking}
            onClick={handleSubmit}
            className={cn(
              "w-full h-14 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all",
              (!pin || checking) && "opacity-50 cursor-not-allowed grayscale"
            )}
          >
            {checking ? 'Checking...' : 'Unlock'}
            {!checking && <ArrowRight className="w-5 h-5" />}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
