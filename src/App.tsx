/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, Suspense, lazy } from 'react';
import { SiSecureProvider, useSiSecure } from './SiSecureContext';
import { Home } from './components/Home';
import { UnlockScreen } from './components/UnlockScreen';
import { BiometricUnlockScreen } from './components/BiometricUnlockScreen';
import { db } from './lib/db';
import { AnimatePresence, motion } from 'motion/react';

// A returning user with a profile goes straight to Home and never needs any
// of these three — no reason to ship them in the initial bundle.
const Landing = lazy(() => import('./components/Landing').then(m => ({ default: m.Landing })));
const Onboarding = lazy(() => import('./components/Onboarding').then(m => ({ default: m.Onboarding })));
const TempRoomView = lazy(() => import('./components/TempRoomView').then(m => ({ default: m.TempRoomView })));

function parseRoomHash(hash: string): { roomId: string; key: string } | null {
  if (!hash.startsWith('#room=')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const roomId = params.get('room');
  const key = params.get('key');
  if (!roomId || !key) return null;
  return { roomId, key };
}

function Spinner() {
  return (
    <div className="h-full flex items-center justify-center bg-obsidian-950">
      <motion.div
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ repeat: Infinity, duration: 3 }}
        className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center"
      >
        <div className="w-6 h-6 rounded-full bg-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.3)]" />
      </motion.div>
    </div>
  );
}

function AppContent() {
  const { profile, isLoading } = useSiSecure();
  const [entered, setEntered] = useState(false);

  if (isLoading) {
    return <Spinner />;
  }

  return (
    <Suspense fallback={<Spinner />}>
      <AnimatePresence mode="wait">
        {profile ? (
          <Home key="home" />
        ) : entered ? (
          <Onboarding key="onboarding" initialStep={2} />
        ) : (
          <Landing key="landing" onGetStarted={() => setEntered(true)} />
        )}
      </AnimatePresence>
    </Suspense>
  );
}

// Gates mounting SiSecureProvider at all when a PIN and/or biometric lock is
// configured — Olm account/session loading needs the real vault key already
// in memory (src/lib/vault.ts) before it unpickles anything, not after.
// Checks Dexie directly rather than through context, since the context
// doesn't exist yet at this point. Biometric (a device-native presence
// check, src/lib/webauthn.ts) gates first since it's independent of the
// vault key; PIN gates second since unlocking it is what makes the vault key
// available.
function LockGate({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [pinConfig, setPinConfig] = useState<{ pinSalt: string; pinVerifier: string } | null>(null);
  const [biometricCredentialId, setBiometricCredentialId] = useState<string | null>(null);
  const [biometricPassed, setBiometricPassed] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    db.settings.get('default').then((s) => {
      if (s?.pinEnabled && s.pinSalt && s.pinVerifier) {
        setPinConfig({ pinSalt: s.pinSalt, pinVerifier: s.pinVerifier });
      }
      if (s?.biometricLock && s.biometricCredentialId) {
        setBiometricCredentialId(s.biometricCredentialId);
      }
      setChecked(true);
    });
  }, []);

  if (!checked) return <Spinner />;
  if (biometricCredentialId && !biometricPassed) {
    return <BiometricUnlockScreen credentialId={biometricCredentialId} onUnlock={() => setBiometricPassed(true)} />;
  }
  if (pinConfig && !unlocked) {
    return <UnlockScreen pinSalt={pinConfig.pinSalt} pinVerifier={pinConfig.pinVerifier} onUnlock={() => setUnlocked(true)} />;
  }
  return <>{children}</>;
}

export default function App() {
  // Temp-room guest links deliberately bypass the lock entirely — joining
  // an ephemeral shared room needs no local identity at all, and a random
  // guest opening someone else's shared link should never be asked for
  // the device owner's PIN.
  const [roomFromUrl, setRoomFromUrl] = useState(() => parseRoomHash(window.location.hash));

  if (roomFromUrl) {
    return (
      <Suspense fallback={<Spinner />}>
        <TempRoomView
          mode="guest"
          roomId={roomFromUrl.roomId}
          roomKeyB64={roomFromUrl.key}
          onExit={() => {
            window.location.hash = '';
            setRoomFromUrl(null);
          }}
        />
      </Suspense>
    );
  }

  return (
    <LockGate>
      <SiSecureProvider>
        <AppContent />
      </SiSecureProvider>
    </LockGate>
  );
}
