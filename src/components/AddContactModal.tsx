import React, { useState, useEffect } from 'react';
import { useSiSecure } from '../SiSecureContext';
import { motion, AnimatePresence } from 'motion/react';
import { X, QrCode, Camera, Check, Copy, Info, Keyboard, User, Shield } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Html5Qrcode } from 'html5-qrcode';
import { generateId, cn } from '../lib/utils';

export function AddContactModal({ onClose }: { onClose: () => void }) {
  const { profile, addContact, connectToContact } = useSiSecure();
  const [view, setView] = useState<'my-qr' | 'scan' | 'manual'>('my-qr');
  const [scannedResult, setScannedResult] = useState<string | null>(null);
  const [manualName, setManualName] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [keyCopied, setKeyCopied] = useState(false);

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;
    let isMounted = true;

    const startScanner = async () => {
      if (view !== 'scan') return;

      // Wait a bit for AnimatePresence to mount the element
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const element = document.getElementById("reader");
      if (!element || !isMounted) return;

      try {
        html5QrCode = new Html5Qrcode("reader");
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            setScannedResult(decodedText);
            handleConnect(decodedText);
            html5QrCode?.stop();
          },
          () => {}
        );
      } catch (err) {
        console.error("Camera fail:", err);
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (html5QrCode) {
        html5QrCode.stop().catch(() => {});
      }
    };
  }, [view]);

  const handleConnect = async (data: string) => {
    try {
      // Mock data parsing: name|publicKey
      const [name, publicKey] = data.split('|');
      if (name && publicKey) {
        await addContact({
          id: generateId(),
          displayName: name,
          publicKey: publicKey,
          isOnline: true,
          addedAt: Date.now(),
          lastSeen: Date.now()
        });

        // Initiate a direct WebRTC connection to the new contact.
        if (profile) {
          connectToContact(publicKey);
        }

        setScannedResult('success');
        setTimeout(onClose, 1500);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const myQrData = `${profile?.displayName}|${profile?.publicKey}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-obsidian-950/90 backdrop-blur-md">
      <motion.div 
        initial={{ scale: 0.98, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md glass rounded-[2.5rem] overflow-hidden shadow-2xl"
      >
        <div className="p-6 flex items-center justify-between border-b border-white/5">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <QrCode className="w-5 h-5 text-blue-500" />
            Add Secure Contact
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-zinc-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-1.5 border-b border-white/5 flex bg-[#0A0A0A]">
          <button 
            onClick={() => setView('my-qr')}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-all rounded-2xl flex items-center justify-center gap-2",
              view === 'my-qr' ? "bg-zinc-900 text-white shadow-inner border border-white/5" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <QrCode className="w-4 h-4" /> My Code
          </button>
          <button 
            onClick={() => setView('scan')}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-all rounded-2xl flex items-center justify-center gap-2",
              view === 'scan' ? "bg-zinc-900 text-white shadow-inner border border-white/5" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Camera className="w-4 h-4" /> Scan
          </button>
          <button 
            onClick={() => setView('manual')}
            className={cn(
              "flex-1 py-3 text-sm font-medium transition-all rounded-2xl flex items-center justify-center gap-2",
              view === 'manual' ? "bg-zinc-900 text-white shadow-inner border border-white/5" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Keyboard className="w-4 h-4" /> Manual
          </button>
        </div>

        <div className="p-10">
          <AnimatePresence mode="wait">
            {view === 'my-qr' ? (
              <motion.div 
                key="my-qr"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center space-y-8"
              >
                <div className="p-4 bg-white rounded-[2rem] shadow-2xl relative group">
                  <QRCodeSVG value={myQrData} size={220} level="H" bgColor="#FFFFFF" fgColor="#000000" />
                  <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-[2rem] pointer-events-none" />
                </div>
                <div className="text-center space-y-3">
                  <p className="text-sm font-semibold text-zinc-100">{profile?.displayName}'s Identity</p>
                  <p className="text-xs text-zinc-500 max-w-[240px] leading-relaxed">
                    Have your contact scan this code to establish a physical P2P handshake.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (!profile?.publicKey) return;
                    await navigator.clipboard.writeText(profile.publicKey);
                    setKeyCopied(true);
                    setTimeout(() => setKeyCopied(false), 1800);
                  }}
                  className="flex items-center gap-2 px-6 py-3 bg-zinc-900 hover:bg-zinc-800 rounded-xl border border-white/5 text-zinc-300 transition-all select-all max-w-full"
                >
                  {keyCopied ? <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                  <span className="text-xs font-mono break-all">{keyCopied ? 'Copied' : profile?.publicKey}</span>
                </button>
              </motion.div>
            ) : view === 'scan' ? (
              <motion.div 
                key="scan"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center space-y-8"
              >
                {scannedResult === 'success' ? (
                  <div className="h-64 flex flex-col items-center justify-center space-y-6">
                    <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center shadow-[0_0_40px_rgba(59,130,246,0.4)]">
                      <Check className="w-10 h-10 text-white" />
                    </div>
                    <p className="text-blue-500 font-bold uppercase tracking-widest animate-pulse">Contact Identified</p>
                  </div>
                ) : (
                  <div className="relative w-full aspect-square max-w-[280px] rounded-[2rem] overflow-hidden border-2 border-blue-500/20 bg-zinc-950 flex items-center justify-center">
                    <div id="reader" className="w-full h-full" />
                    <div className="absolute inset-0 border-[40px] border-[#0A0A0A]/40 pointer-events-none" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 border-2 border-blue-500 border-dashed rounded-3xl animate-pulse pointer-events-none" />
                  </div>
                )}
                <div className="flex items-start gap-4 bg-zinc-900/50 p-5 rounded-2xl max-w-sm border border-white/5">
                  <Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-zinc-500 leading-relaxed uppercase tracking-tight font-medium">
                    Scanning ensures cryptographic proof of presence. All keys are exchanged via direct signaling channels without intermediaries.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="manual"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-6"
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Contact Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                      <input 
                        type="text"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        placeholder="e.g. Satoshi"
                        className="w-full h-12 bg-zinc-900/50 border border-white/5 rounded-xl pl-12 pr-4 text-sm focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-zinc-700"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Public Key / Address</label>
                    <div className="relative">
                      <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600" />
                      <input 
                        type="text"
                        value={manualKey}
                        onChange={(e) => setManualKey(e.target.value)}
                        placeholder="Paste Ed25519 public key..."
                        className="w-full h-12 bg-zinc-900/50 border border-white/5 rounded-xl pl-12 pr-4 text-sm focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-zinc-700 font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-blue-500/5 rounded-xl border border-blue-500/10 flex gap-3">
                  <Info className="w-4 h-4 text-blue-500/60 shrink-0 mt-0.5" />
                  <p className="text-[10px] text-zinc-500 leading-relaxed font-medium uppercase tracking-tight">
                    Ensure the public key is exactly as provided by your contact. Incorrect keys will result in failed encryption handshakes.
                  </p>
                </div>

                <button 
                  disabled={!manualName.trim() || !manualKey.trim() || isSubmitting}
                  onClick={async () => {
                    setIsSubmitting(true);
                    await handleConnect(`${manualName}|${manualKey}`);
                  }}
                  className={cn(
                    "w-full h-14 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 transition-all",
                    (!manualName.trim() || !manualKey.trim() || isSubmitting) && "opacity-50 grayscale cursor-not-allowed"
                  )}
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Link Contact
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
