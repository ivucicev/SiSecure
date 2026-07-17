import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Fingerprint, RotateCcw } from 'lucide-react';
import { verifyBiometric } from '../lib/webauthn';

interface BiometricUnlockScreenProps {
  credentialId: string;
  onUnlock: () => void;
}

// Rendered before the PIN gate (if any) and before SiSecureProvider mounts —
// same reasoning as UnlockScreen: nothing about the app should be visible
// until this resolves. Prompts automatically on mount so the platform's
// native Face ID / Touch ID / Windows Hello sheet appears immediately
// instead of waiting for an extra tap.
export function BiometricUnlockScreen({ credentialId, onUnlock }: BiometricUnlockScreenProps) {
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);

  const attempt = async () => {
    setChecking(true);
    setFailed(false);
    const ok = await verifyBiometric(credentialId);
    setChecking(false);
    if (ok) onUnlock();
    else setFailed(true);
  };

  useEffect(() => {
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full flex items-center justify-center p-6 bg-obsidian-950 text-zinc-100">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8"
      >
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-xl shadow-blue-900/40 text-white">
            <Fingerprint className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">
              {checking ? 'Verifying…' : failed ? 'Verification failed' : 'Confirm your identity'}
            </h1>
            <p className="text-zinc-500 text-sm">
              {checking
                ? 'Follow the prompt from your device.'
                : failed
                  ? 'Cancelled, timed out, or the biometric did not match.'
                  : 'Unlocks your local identity and messages.'}
            </p>
          </div>
        </div>

        {failed && (
          <button
            onClick={attempt}
            className="w-full h-14 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all"
          >
            <RotateCcw className="w-5 h-5" />
            Try again
          </button>
        )}
      </motion.div>
    </div>
  );
}
