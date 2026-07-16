import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, X, Loader2 } from 'lucide-react';
import { useSiSecure } from '../SiSecureContext';
import { computeSafetyNumber } from '../lib/safetyNumber';
import type { Contact } from '../lib/db';

export function VerifyContactModal({ contact, onClose }: { contact: Contact; onClose: () => void }) {
  const { profile, verifyContact } = useSiSecure();
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!profile?.olmCurve25519Key || !contact.olmIdentityKey) return;
    computeSafetyNumber(profile.olmCurve25519Key, contact.olmIdentityKey).then(setCode);
  }, [profile?.olmCurve25519Key, contact.olmIdentityKey]);

  const handleMarkVerified = async () => {
    await verifyContact(contact.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto bg-obsidian-950/90 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md my-auto glass rounded-[2.5rem] overflow-hidden shadow-2xl"
      >
        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl">
              <ShieldCheck className="w-5 h-5 text-blue-500" />
            </div>
            Verify {contact.displayName}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <p className="text-sm text-zinc-300 leading-relaxed">
            Compare this code with <b className="text-zinc-100">{contact.displayName}</b> through a
            separate channel — in person, a phone call, anything other than this chat. If it matches
            exactly on both ends, your connection wasn't intercepted before your encrypted session was
            established.
          </p>

          <div className="bg-zinc-900/50 border border-white/5 rounded-2xl p-6 flex items-center justify-center min-h-[80px]">
            {code ? (
              <span className="font-mono text-lg tracking-widest text-blue-400 text-center break-all">{code}</span>
            ) : (
              <div className="flex items-center gap-2 text-zinc-600 text-xs">
                <Loader2 className="w-4 h-4 animate-spin" />
                Waiting for their identity key to arrive...
              </div>
            )}
          </div>

          {contact.verified && (
            <div className="flex items-center gap-2 text-[11px] text-green-500 font-bold uppercase tracking-widest">
              <ShieldCheck className="w-3.5 h-3.5" /> Already marked verified
            </div>
          )}

          <button
            onClick={handleMarkVerified}
            disabled={!code}
            className="w-full h-14 bg-blue-600 disabled:opacity-50 disabled:bg-zinc-800 rounded-2xl text-xs font-bold uppercase tracking-widest text-white transition-all shadow-lg shadow-blue-900/20"
          >
            Codes Match — Mark Verified
          </button>
        </div>
      </motion.div>
    </div>
  );
}
