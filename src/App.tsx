/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, Suspense, lazy } from 'react';
import { SiSecureProvider, useSiSecure } from './SiSecureContext';
import { Home } from './components/Home';
import { DebugOverlay } from './components/DebugOverlay';
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
  const [roomFromUrl, setRoomFromUrl] = useState(() => parseRoomHash(window.location.hash));
  const [entered, setEntered] = useState(false);

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

export default function App() {
  return (
    <SiSecureProvider>
      <DebugOverlay />
      <AppContent />
    </SiSecureProvider>
  );
}
