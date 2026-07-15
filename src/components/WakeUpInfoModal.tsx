import React from 'react';
import { motion } from 'motion/react';
import { Bell, X, ServerOff, Radio, ShieldAlert } from 'lucide-react';

export function WakeUpInfoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto bg-obsidian-950/90 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md my-auto glass rounded-[2.5rem] overflow-hidden shadow-2xl"
      >
        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 rounded-xl">
              <Bell className="w-5 h-5 text-amber-500" />
            </div>
            Wake Up
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-8 space-y-6">
          <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest bg-amber-500/10 text-amber-500 border border-amber-500/20">
            Coming Soon — Not Yet Active
          </span>

          <p className="text-sm text-zinc-300 leading-relaxed">
            A P2P connection only delivers messages while both of you have the app open at the same time.
            If you go offline before they come back, nothing is running anywhere to tell them you tried —
            your message just waits. <b className="text-zinc-100">Wake Up</b> will fix that: a one-tap ping
            that prompts them to open SiSecure, even if their browser is fully closed. No message content,
            nothing added to your chat history — just a nudge.
          </p>

          <div className="space-y-4">
            <div className="flex items-start gap-4 bg-zinc-900/50 p-5 rounded-2xl border border-white/5">
              <Radio className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                <span className="text-zinc-300 font-semibold">How it works:</span> browsers can only wake a
                fully-closed app via the OS/browser's own Push service (Web Push). There's no way around
                that for any app, P2P or not — it's how push notifications work everywhere.
              </p>
            </div>

            <div className="flex items-start gap-4 bg-amber-500/5 p-5 rounded-2xl border border-amber-500/10">
              <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                <span className="text-zinc-300 font-semibold">Honest trade-off:</span> this requires a small
                relay server whose only job is forwarding an opaque wake ping — it never sees message content,
                but it does see your push subscription and roughly when you're pinged. That's a deliberate,
                disclosed exception to SiSecure's zero-server design, and it will be opt-in only.
              </p>
            </div>

            <div className="flex items-start gap-4 bg-zinc-900/50 p-5 rounded-2xl border border-white/5">
              <ServerOff className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Everything else in SiSecure stays exactly as it is today: no message server, no contact
                directory, direct encrypted P2P transport. This is the one narrow, opt-in exception.
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
