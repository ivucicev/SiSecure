/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { SiSecureProvider, useSiSecure } from './SiSecureContext';
import { Onboarding } from './components/Onboarding';
import { Home } from './components/Home';
import { TempRoomView } from './components/TempRoomView';
import { AnimatePresence, motion } from 'motion/react';

function parseRoomHash(hash: string): { roomId: string; key: string } | null {
  if (!hash.startsWith('#room=')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const roomId = params.get('room');
  const key = params.get('key');
  if (!roomId || !key) return null;
  return { roomId, key };
}

function AppContent() {
  const { profile, isLoading } = useSiSecure();
  const [roomFromUrl, setRoomFromUrl] = useState(() => parseRoomHash(window.location.hash));

  if (roomFromUrl) {
    return (
      <TempRoomView
        mode="guest"
        roomId={roomFromUrl.roomId}
        roomKeyB64={roomFromUrl.key}
        onExit={() => {
          window.location.hash = '';
          setRoomFromUrl(null);
        }}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-obsidian-950">
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

  return (
    <AnimatePresence mode="wait">
      {!profile ? (
        <Onboarding key="onboarding" />
      ) : (
        <Home key="home" />
      )}
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <SiSecureProvider>
      <AppContent />
    </SiSecureProvider>
  );
}
