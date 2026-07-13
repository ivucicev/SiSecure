import React, { useState } from 'react';
import { useSiSecure } from '../SiSecureContext';
import { motion } from 'motion/react';
import { Shield, ArrowRight, User } from 'lucide-react';
import { cn } from '../lib/utils';

export function Onboarding() {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const { createProfile } = useSiSecure();

  const handleFinish = () => {
    if (name.trim()) {
      createProfile(name);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="min-h-screen flex items-center justify-center p-6 bg-obsidian-950 text-zinc-100"
    >
      <div className="w-full max-w-md space-y-12">
        <div className="text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 shadow-xl shadow-blue-900/40 text-white font-bold text-3xl">
            Si
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight">SiSecure</h1>
            <p className="text-zinc-500 text-sm tracking-wide uppercase">Local P2P Encryption</p>
          </div>
        </div>

        <div className="glass rounded-3xl p-10 space-y-8">
          {step === 1 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-8"
            >
              <div className="space-y-3">
                <h3 className="text-xl font-medium text-zinc-100">Welcome to SiSecure.</h3>
                <p className="text-zinc-400 text-sm leading-relaxed font-light">
                  No central servers. All messages and media are stored locally on your device. 
                  Privacy is not an option—it's the foundation.
                </p>
              </div>
              <button
                onClick={() => setStep(2)}
                className="w-full h-14 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 group transition-all"
              >
                Get Started
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          ) : (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-8"
            >
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Identity Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600" />
                    <input
                      autoFocus
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter a display name"
                      className="w-full h-14 bg-zinc-900/50 border border-white/5 rounded-2xl pl-12 pr-4 focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all placeholder:text-zinc-700 text-sm"
                    />
                  </div>
                </div>
                <div className="p-4 bg-blue-500/5 rounded-2xl border border-blue-500/10">
                  <p className="text-[11px] text-zinc-500 leading-relaxed italic">
                    Your name and messages never leave your device unless shared via direct peer-to-peer connection.
                  </p>
                </div>
              </div>
              <button
                disabled={!name.trim()}
                onClick={handleFinish}
                className={cn(
                  "w-full h-14 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/20",
                  !name.trim() && "opacity-50 cursor-not-allowed grayscale"
                )}
              >
                Create Profile
              </button>
            </motion.div>
          )}
        </div>

        <div className="flex justify-center gap-2">
          {[1, 2].map((i) => (
            <div 
              key={i}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                step === i ? "w-10 bg-blue-500" : "w-2 bg-zinc-800"
              )}
            />
          ))}
        </div>
      </div>
    </motion.div>
  );
}
