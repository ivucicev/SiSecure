import React, { useState, useEffect } from 'react';
import { useSiSecure } from '../SiSecureContext';
import { motion, AnimatePresence } from 'motion/react';
import { X, ArrowLeft, Shield, Lock, Database, HardDrive, Trash2, Download, Upload, Copy, User, Settings, Check, AlertTriangle, Eye, EyeOff, Radio, Skull } from 'lucide-react';
import { db } from '../lib/db';
import { cn } from '../lib/utils';
import CryptoJS from 'crypto-js';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const {
    profile,
    settings,
    updateProfile,
    updateSettings,
    enableVaultPin,
    disableVaultPin,
    enableBiometricLock,
    disableBiometricLock,
    lightNuke,
    fullNuke,
    destroyIdentity
  } = useSiSecure();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(profile?.displayName || '');
  const [purgeConfirm, setPurgeConfirm] = useState<'light' | 'full' | null>(null);
  const [destroyConfirmOpen, setDestroyConfirmOpen] = useState(false);
  const [destroyConfirmText, setDestroyConfirmText] = useState('');
  const [keyCopied, setKeyCopied] = useState(false);
  const [showPeerFields, setShowPeerFields] = useState(false);
  const [showTurnFields, setShowTurnFields] = useState(false);
  const [storageUsage, setStorageUsage] = useState<number | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((estimate) => {
      if (typeof estimate.usage === 'number') setStorageUsage(estimate.usage);
    });
  }, []);

  // Any OTHER method still active means the data stays encrypted either way
  // — only the very last remaining method disables real at-rest protection.
  const otherLockMethodActive = (excluding: 'pin' | 'biometric') => {
    if (excluding === 'pin') return !!(settings?.biometricLock && settings?.biometricPrfSupported);
    return !!settings?.pinEnabled;
  };

  const [pinSetupMode, setPinSetupMode] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinBusy, setPinBusy] = useState(false);

  const handleSetPin = async () => {
    if (newPin.length < 4) { setPinError('PIN must be at least 4 digits.'); return; }
    if (newPin !== confirmPin) { setPinError('PINs do not match.'); return; }
    setPinBusy(true);
    try {
      await enableVaultPin(newPin);
      setPinSetupMode(false);
      setNewPin('');
      setConfirmPin('');
      setPinError('');
    } finally {
      setPinBusy(false);
    }
  };

  const handleDisablePin = async () => {
    const message = otherLockMethodActive('pin')
      ? 'Disable PIN lock? Biometric unlock stays active and your data stays encrypted exactly as it is now.'
      : "Disable PIN lock? Your identity, sessions, and messages will be re-encrypted back to a device-only key — nothing is lost, but the PIN will no longer be required to open the app.";
    if (!confirm(message)) return;
    setPinBusy(true);
    try {
      await disableVaultPin();
    } finally {
      setPinBusy(false);
    }
  };

  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState('');
  const [bioInfo, setBioInfo] = useState('');

  const handleEnableBiometric = async () => {
    if (!profile || !settings) return;
    setBioBusy(true);
    setBioError('');
    setBioInfo('');
    try {
      const { prfSupported } = await enableBiometricLock();
      setBioInfo(
        prfSupported
          ? 'Real encryption enabled — your device biometric now protects your data at rest, same as a PIN.'
          : 'This device only supports a presence check, not key derivation — biometric now gates opening the app, but does not encrypt data at rest. Add a PIN for real at-rest protection.'
      );
    } catch (err) {
      setBioError(
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Cancelled.'
          : err instanceof Error && err.message.includes('platform authenticator')
            ? 'No Face ID, Touch ID, or Windows Hello available on this device/browser.'
            : 'Could not register — try again.'
      );
    } finally {
      setBioBusy(false);
    }
  };

  const handleDisableBiometric = async () => {
    if (!settings) return;
    const message = otherLockMethodActive('biometric')
      ? 'Disable biometric unlock? PIN lock stays active and your data stays encrypted exactly as it is now.'
      : settings.biometricPrfSupported
        ? 'Disable biometric unlock? Your identity, sessions, and messages will be re-encrypted back to a device-only key — nothing is lost, but biometric will no longer be required to open the app.'
        : 'Disable biometric unlock?';
    if (!confirm(message)) return;
    setBioBusy(true);
    try {
      await disableBiometricLock();
    } finally {
      setBioBusy(false);
    }
  };

  const [passwordModal, setPasswordModal] = useState<{
    type: 'export' | 'import';
    isOpen: boolean;
    data?: any;
  }>({ type: 'export', isOpen: false });
  
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const initExport = async () => {
    setPasswordModal({ type: 'export', isOpen: true });
    setPassword('');
    setError('');
  };

  const executeExport = async () => {
    if (!password) {
      setError('Password required for encryption');
      return;
    }

    const contacts = await db.contacts.toArray();
    const messages = await db.messages.toArray();
    const profileData = await db.profile.toArray();
    const groups = await db.groups.toArray();
    
    const exportData = {
      version: '2.0',
      timestamp: Date.now(),
      data: {
        contacts,
        messages,
        profile: profileData,
        groups
      }
    };

    const encryptedData = CryptoJS.AES.encrypt(JSON.stringify(exportData), password).toString();
    
    const finalPayload = {
      encrypted: true,
      payload: encryptedData,
      hint: 'SiSecure AES-256 Protected'
    };

    const blob = new Blob([JSON.stringify(finalPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sisecure_secure_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setPasswordModal({ ...passwordModal, isOpen: false });
  };

  const initImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const rawData = JSON.parse(event.target?.result as string);
          if (rawData.encrypted && rawData.payload) {
            setPasswordModal({ type: 'import', isOpen: true, data: rawData.payload });
            setPassword('');
            setError('');
          } else if (rawData.data) {
            // Legacy / unencrypted import
            if (confirm('Unencrypted backup detected. Importing data will MERGE with existing records. Continue?')) {
              await processImport(rawData);
            }
          } else {
            alert('Invalid backup format');
          }
        } catch (err) {
          alert('Failed to parse backup file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const executeImport = async () => {
    if (!password) {
      setError('Password required for decryption');
      return;
    }

    try {
      const bytes = CryptoJS.AES.decrypt(passwordModal.data, password);
      const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
      
      if (!decryptedString) {
        throw new Error('Incorrect password');
      }

      const importData = JSON.parse(decryptedString);
      await processImport(importData);
      setPasswordModal({ ...passwordModal, isOpen: false });
    } catch (err) {
      setError('Decryption failed. Check your password.');
    }
  };

  const processImport = async (importData: any) => {
    if (importData.data) {
      await db.contacts.bulkPut(importData.data.contacts || []);
      await db.messages.bulkPut(importData.data.messages || []);
      if (importData.data.groups) {
        await db.groups.bulkPut(importData.data.groups);
      }
      alert('Import successful');
      window.location.reload();
    }
  };

  const handleLightNuke = async () => {
    await lightNuke();
    window.location.reload();
  };

  const handleFullNuke = async () => {
    await fullNuke();
    window.location.reload();
  };

  const handleDestroyIdentity = async () => {
    await destroyIdentity();
    window.location.reload();
  };

  const saveProfile = async () => {
    if (newName.trim()) {
      await updateProfile({ displayName: newName.trim() });
      setEditingName(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col md:items-center md:justify-center md:p-4 bg-[#0A0A0A] md:bg-[#050505]/95 md:backdrop-blur-xl">
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="w-full h-full md:h-auto md:max-w-2xl bg-[#0A0A0A] border-0 md:border md:border-white/5 rounded-none md:rounded-[2.5rem] overflow-hidden flex flex-col md:max-h-[90vh] shadow-2xl"
      >
        <div className="p-6 sm:p-8 pt-[max(1.5rem,env(safe-area-inset-top))] md:pt-8 flex items-center justify-between border-b border-white/5 shrink-0">
          <h3 className="text-xl font-bold flex items-center gap-3 min-w-0">
            <button onClick={onClose} className="p-2 -ml-2 hover:bg-white/5 rounded-full text-zinc-400 transition-colors md:hidden">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="p-2.5 bg-blue-500/10 rounded-xl hidden sm:flex">
              <Settings className="w-5 h-5 text-blue-500" />
            </div>
            <span className="truncate">System Control Center</span>
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-zinc-500 transition-colors hidden md:block">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-12">
          {/* Identity Section */}
          <section className="space-y-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Secure Identity</h4>
            <div className="bg-zinc-900/30 p-6 rounded-3xl flex items-center gap-6 border border-white/5 relative group">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-zinc-800 to-zinc-900 flex items-center justify-center border border-white/5 shadow-xl shrink-0">
                <Shield className="w-8 h-8 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                {editingName ? (
                  <div className="flex gap-2">
                    <input 
                      autoFocus
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && saveProfile()}
                      className="bg-zinc-800 border-none rounded-lg px-3 py-1 text-zinc-100 text-sm focus:ring-1 focus:ring-blue-500 w-full"
                    />
                    <button onClick={saveProfile} className="p-1 bg-blue-600 rounded-lg text-white">
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-lg text-zinc-100 truncate">{profile?.displayName}</p>
                    <button onClick={() => setEditingName(true)} className="p-1 hover:bg-white/5 rounded text-zinc-600 hover:text-zinc-400">
                      <User className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                <code className="block text-xs text-zinc-300 font-mono break-all mt-1.5 select-all">{profile?.publicKey}</code>
              </div>
              <button
                onClick={async () => {
                  if (!profile?.publicKey) return;
                  await navigator.clipboard.writeText(profile.publicKey);
                  setKeyCopied(true);
                  setTimeout(() => setKeyCopied(false), 1800);
                }}
                title="Copy public key"
                className="p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl text-zinc-400 hover:text-blue-400 border border-white/5 transition-all shrink-0"
              >
                {keyCopied ? <Check className="w-5 h-5 text-blue-500" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </section>

          {/* Privacy Section */}
          <section className="space-y-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Privacy Architecture</h4>
            <div className="bg-zinc-900/10 rounded-[2rem] border border-white/5 overflow-hidden">
              <ToggleRow 
                label="Stealth Mode" 
                desc="Prevent your profile from appearing in the P2P pulse network of others." 
                on={settings?.stealthMode || false}
                onChange={(val) => updateSettings({ stealthMode: val })}
              />
              <div className="h-px bg-white/5 mx-6" />
              <ToggleRow 
                label="Auto-Pruning Engine" 
                desc="Automatically erase old messages to maintain true local ephemeral privacy." 
                on={settings?.autoPrune || false}
                onChange={(val) => updateSettings({ autoPrune: val })}
              />
              {settings?.autoPrune && (
                <div className="px-6 pb-6 pt-2">
                  <div className="bg-zinc-900/50 p-4 rounded-2xl flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Retention Period</span>
                    <select 
                      value={settings.pruneRetentionDays}
                      onChange={(e) => updateSettings({ pruneRetentionDays: parseInt(e.target.value) })}
                      className="bg-transparent text-sm font-bold text-blue-500 outline-none cursor-pointer"
                    >
                      <option value="1">24 Hours</option>
                      <option value="3">3 Days</option>
                      <option value="7">7 Days</option>
                      <option value="30">30 Days</option>
                    </select>
                  </div>
                </div>
              )}
              <div className="h-px bg-white/5 mx-6" />
              <ToggleRow
                label="Auto-Nuke on Inactivity"
                desc="If you don't open the app for a while, automatically light-nuke then full-nuke local data."
                on={settings?.autoNukeEnabled || false}
                onChange={(val) => updateSettings({ autoNukeEnabled: val })}
              />
              {settings?.autoNukeEnabled && (
                <div className="px-6 pb-6 pt-2 space-y-3">
                  <div className="bg-zinc-900/50 p-4 rounded-2xl flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Light nuke after</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={settings.autoNukeLightDays ?? 3}
                        onChange={(e) => updateSettings({ autoNukeLightDays: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-14 bg-zinc-800 border-none rounded-lg px-2 py-1 text-sm font-bold text-amber-500 outline-none text-right"
                      />
                      <span className="text-[10px] text-zinc-500 uppercase">days</span>
                    </div>
                  </div>
                  <div className="bg-zinc-900/50 p-4 rounded-2xl flex items-center justify-between">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Full nuke after</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        value={settings.autoNukeFullDays ?? 7}
                        onChange={(e) => updateSettings({ autoNukeFullDays: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-14 bg-zinc-800 border-none rounded-lg px-2 py-1 text-sm font-bold text-red-500 outline-none text-right"
                      />
                      <span className="text-[10px] text-zinc-500 uppercase">days</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="h-px bg-white/5 mx-6" />
              <ToggleRow
                label="Biometric Barrier"
                desc="Lock the application access behind your device authentication flow (Face ID, Touch ID, or Windows Hello)."
                on={settings?.biometricLock || false}
                onChange={(val) => {
                  if (val) {
                    handleEnableBiometric();
                  } else {
                    handleDisableBiometric();
                  }
                }}
              />
              {(bioBusy || bioError || bioInfo) && (
                <div className="px-6 pb-6 pt-2 space-y-2">
                  {bioBusy && <p className="text-zinc-500 text-xs text-center">Follow the prompt from your device…</p>}
                  {bioError && <p className="text-red-500 text-xs text-center">{bioError}</p>}
                  {bioInfo && <p className="text-blue-400 text-xs text-center leading-relaxed">{bioInfo}</p>}
                </div>
              )}
              <div className="h-px bg-white/5 mx-6" />
              <ToggleRow
                label="PIN Lock & Vault Encryption"
                desc="Require a PIN to open the app. Your identity, sessions, and message history are encrypted at rest with a key derived from it — without the PIN, none of it is readable, including by anyone with direct access to this device's storage."
                on={settings?.pinEnabled || false}
                onChange={(val) => {
                  if (val) {
                    setPinSetupMode(true);
                  } else {
                    handleDisablePin();
                  }
                }}
              />
              {pinSetupMode && (
                <div className="px-6 pb-6 pt-2 space-y-3">
                  <input
                    type="password"
                    inputMode="numeric"
                    autoFocus
                    placeholder="New PIN (min. 4 digits)"
                    value={newPin}
                    onChange={(e) => { setNewPin(e.target.value); setPinError(''); }}
                    className="w-full h-12 bg-zinc-900/50 border border-white/5 rounded-2xl px-4 text-sm text-center tracking-widest focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-zinc-700 placeholder:tracking-normal"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    placeholder="Confirm PIN"
                    value={confirmPin}
                    onChange={(e) => { setConfirmPin(e.target.value); setPinError(''); }}
                    onKeyDown={(e) => e.key === 'Enter' && handleSetPin()}
                    className="w-full h-12 bg-zinc-900/50 border border-white/5 rounded-2xl px-4 text-sm text-center tracking-widest focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-zinc-700 placeholder:tracking-normal"
                  />
                  {pinError && <p className="text-red-500 text-xs text-center">{pinError}</p>}
                  <div className="flex gap-3">
                    <button
                      onClick={() => { setPinSetupMode(false); setNewPin(''); setConfirmPin(''); setPinError(''); }}
                      className="flex-1 h-11 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-bold uppercase transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSetPin}
                      disabled={pinBusy}
                      className="flex-1 h-11 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase transition-all"
                    >
                      {pinBusy ? 'Encrypting...' : 'Set PIN'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Network Relay Section */}
          <section className="space-y-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Network Relay</h4>
            <div className="bg-zinc-900/10 rounded-[2rem] border border-white/5 overflow-hidden">
              <ToggleRow
                label="Custom Signaling Server"
                desc="Use your own PeerServer instead of the public PeerJS cloud broker. Both sides of a conversation must point at the same server to find each other."
                on={showPeerFields || !!settings?.customPeerHost}
                onChange={(val) => {
                  setShowPeerFields(val);
                  if (!val) {
                    updateSettings({ customPeerHost: undefined, customPeerPort: undefined, customPeerPath: undefined, customPeerSecure: undefined });
                  }
                }}
              />
              {(showPeerFields || !!settings?.customPeerHost) && (
                <div className="px-6 pb-6 pt-2 space-y-3">
                  <input
                    placeholder="Host (e.g. peer.example.com)"
                    value={settings?.customPeerHost || ''}
                    onChange={(e) => updateSettings({ customPeerHost: e.target.value })}
                    className="w-full h-11 bg-zinc-900/50 border border-white/5 rounded-xl px-4 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-zinc-700"
                  />
                  <div className="flex gap-3">
                    <input
                      placeholder="Port (443)"
                      type="number"
                      value={settings?.customPeerPort ?? ''}
                      onChange={(e) => updateSettings({ customPeerPort: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-28 h-11 bg-zinc-900/50 border border-white/5 rounded-xl px-4 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-zinc-700"
                    />
                    <input
                      placeholder="Path (/)"
                      value={settings?.customPeerPath || ''}
                      onChange={(e) => updateSettings({ customPeerPath: e.target.value })}
                      className="flex-1 h-11 bg-zinc-900/50 border border-white/5 rounded-xl px-4 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-zinc-700"
                    />
                  </div>
                  <label className="flex items-center gap-2 text-[11px] text-zinc-500 font-medium pl-1">
                    <input
                      type="checkbox"
                      checked={settings?.customPeerSecure ?? true}
                      onChange={(e) => updateSettings({ customPeerSecure: e.target.checked })}
                      className="accent-blue-600"
                    />
                    Use TLS (wss/https)
                  </label>
                </div>
              )}
              <div className="h-px bg-white/5 mx-6" />
              <ToggleRow
                label="Custom TURN Server"
                desc="PeerJS ships with STUN only by default — two peers both behind a symmetric NAT can never connect without a TURN relay. Add your own (e.g. coturn, Twilio, Metered)."
                on={showTurnFields || !!settings?.customTurnUrls}
                onChange={(val) => {
                  setShowTurnFields(val);
                  if (!val) {
                    updateSettings({ customTurnUrls: undefined, customTurnUsername: undefined, customTurnCredential: undefined });
                  }
                }}
              />
              {(showTurnFields || !!settings?.customTurnUrls) && (
                <div className="px-6 pb-6 pt-2 space-y-3">
                  <input
                    placeholder="turn:host:3478 (comma-separate for multiple)"
                    value={settings?.customTurnUrls || ''}
                    onChange={(e) => updateSettings({ customTurnUrls: e.target.value })}
                    className="w-full h-11 bg-zinc-900/50 border border-white/5 rounded-xl px-4 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-zinc-700"
                  />
                  <div className="flex gap-3">
                    <input
                      placeholder="Username"
                      value={settings?.customTurnUsername || ''}
                      onChange={(e) => updateSettings({ customTurnUsername: e.target.value })}
                      className="flex-1 h-11 bg-zinc-900/50 border border-white/5 rounded-xl px-4 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-zinc-700"
                    />
                    <input
                      placeholder="Credential"
                      type="password"
                      value={settings?.customTurnCredential || ''}
                      onChange={(e) => updateSettings({ customTurnCredential: e.target.value })}
                      className="flex-1 h-11 bg-zinc-900/50 border border-white/5 rounded-xl px-4 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 placeholder:text-zinc-700"
                    />
                  </div>
                </div>
              )}
              <div className="px-6 pb-6 pt-1">
                <p className="text-[10px] text-zinc-600 leading-relaxed flex items-start gap-2">
                  <Radio className="w-3 h-3 mt-0.5 shrink-0" />
                  Takes effect next time a connection is (re)established — not the current session.
                </p>
              </div>
            </div>
          </section>

          {/* Storage Section */}
          <section className="space-y-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Data Sovereignty</h4>
            <div className="grid grid-cols-1 gap-6">
              <div className="p-8 bg-zinc-900/20 border border-white/5 rounded-[2rem] space-y-6">
                <div className="flex items-center gap-3 text-zinc-200">
                  <Database className="w-5 h-5 text-blue-500/60" />
                  <span className="font-bold text-sm uppercase tracking-tight">Vault Backup</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                  Export all local encrypted chats and contact keys into a portable .json archive. No data ever leaves this device.
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={initExport}
                    className="flex-1 h-12 bg-blue-600 hover:bg-blue-500 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-900/10"
                  >
                    <Download className="w-4 h-4" /> Export
                  </button>
                  <button
                    onClick={initImport}
                    className="flex-1 h-12 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-zinc-300 flex items-center justify-center gap-2 transition-all"
                  >
                    <Upload className="w-4 h-4" /> Import
                  </button>
                </div>
              </div>

              <div className="p-8 bg-zinc-900/20 border border-white/5 rounded-[2rem] space-y-6">
                <div className="flex items-center justify-between text-zinc-200">
                  <div className="flex items-center gap-3">
                    <HardDrive className="w-5 h-5 text-zinc-500" />
                    <span className="font-bold text-sm uppercase tracking-tight">Local Storage</span>
                  </div>
                  {storageUsage !== null && (
                    <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest">{formatBytes(storageUsage)}</span>
                  )}
                </div>
                {purgeConfirm ? (
                  <div className="space-y-3">
                    <p className={cn(
                      "text-[10px] font-bold uppercase text-center flex items-center justify-center gap-2",
                      purgeConfirm === 'light' ? "text-amber-500" : "text-red-500"
                    )}>
                      <AlertTriangle className="w-3 h-3" />
                      {purgeConfirm === 'light'
                        ? 'Erase all messages? Contacts stay.'
                        : 'Erase contacts, groups & messages?'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={purgeConfirm === 'light' ? handleLightNuke : handleFullNuke}
                        className={cn(
                          "flex-1 h-10 text-white rounded-xl text-[10px] font-bold uppercase",
                          purgeConfirm === 'light' ? "bg-amber-600" : "bg-red-600"
                        )}
                      >
                        Confirm {purgeConfirm === 'light' ? 'Light' : 'Full'} Nuke
                      </button>
                      <button onClick={() => setPurgeConfirm(null)} className="flex-1 h-10 bg-zinc-800 text-zinc-400 rounded-xl text-[10px] font-bold uppercase">CANCEL</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setPurgeConfirm('light')}
                      className="flex-1 h-12 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-2xl text-amber-500 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                      title="Deletes messages only. Contacts are kept."
                    >
                      <Trash2 className="w-4 h-4" /> Light Nuke
                    </button>
                    <button
                      onClick={() => setPurgeConfirm('full')}
                      className="flex-1 h-12 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-2xl text-red-500 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                      title="Deletes messages, contacts & groups. Identity is kept."
                    >
                      <Trash2 className="w-4 h-4" /> Full Nuke
                    </button>
                  </div>
                )}
              </div>

              <div className="p-8 bg-red-950/10 border border-red-500/10 rounded-[2rem] space-y-6">
                <div className="flex items-center gap-3 text-zinc-200">
                  <Skull className="w-5 h-5 text-red-500/60" />
                  <span className="font-bold text-sm uppercase tracking-tight">Factory Reset</span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                  Permanently destroys your identity along with everything else — keys, contacts, messages, settings. Unlike Full Nuke, there is no going back to this profile: contacts would see you as a stranger if you ever create a new one. Cannot be undone.
                </p>
                {destroyConfirmOpen ? (
                  <div className="space-y-3">
                    <p className="text-[10px] text-red-500 font-bold uppercase text-center">Type DESTROY to confirm</p>
                    <input
                      autoFocus
                      value={destroyConfirmText}
                      onChange={(e) => setDestroyConfirmText(e.target.value)}
                      placeholder="DESTROY"
                      className="w-full h-11 bg-zinc-900/50 border border-red-500/20 rounded-xl px-4 text-sm text-center text-zinc-200 tracking-widest focus:outline-none focus:ring-1 focus:ring-red-500/50 placeholder:text-zinc-700"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleDestroyIdentity}
                        disabled={destroyConfirmText !== 'DESTROY'}
                        className="flex-1 h-10 bg-red-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl text-[10px] font-bold uppercase transition-all"
                      >
                        Confirm Destroy
                      </button>
                      <button
                        onClick={() => { setDestroyConfirmOpen(false); setDestroyConfirmText(''); }}
                        className="flex-1 h-10 bg-zinc-800 text-zinc-400 rounded-xl text-[10px] font-bold uppercase"
                      >
                        CANCEL
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setDestroyConfirmOpen(true)}
                    className="w-full h-12 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-2xl text-red-500 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                  >
                    <Skull className="w-4 h-4" /> Destroy Identity
                  </button>
                )}
              </div>
            </div>
          </section>
        </div>
      </motion.div>

      {/* Password Modal */}
      <AnimatePresence>
        {passwordModal.isOpen && (
          <div className="fixed inset-0 z-[60] flex justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0A0A0A] border border-white/5 p-8 rounded-[2.5rem] max-w-sm w-full my-auto shadow-2xl space-y-6"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold flex items-center gap-3 text-blue-500">
                  <Lock className="w-5 h-5" />
                  {passwordModal.type === 'export' ? 'Secure Export' : 'Authorize Import'}
                </h3>
                <button onClick={() => setPasswordModal({ ...passwordModal, isOpen: false })} className="text-zinc-500 hover:text-zinc-300">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
                  {passwordModal.type === 'export' 
                    ? 'Establish a secondary encryption key for this backup. You will need this password to restore your data on any node.' 
                    : 'This backup is hardware-encrypted. Provide the secondary key to initialize the decryption sequence.'}
                </p>
                
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Security Key..."
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (passwordModal.type === 'export' ? executeExport() : executeImport())}
                    className="w-full bg-black/40 border border-white/5 rounded-2xl py-4 px-6 text-sm focus:ring-1 focus:ring-blue-500 text-zinc-200 placeholder:text-zinc-700 pr-12"
                    autoFocus
                  />
                  <button 
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                
                {error && (
                  <p className="text-red-500 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> {error}
                  </p>
                )}
              </div>

              <button
                onClick={passwordModal.type === 'export' ? executeExport : executeImport}
                className="w-full h-14 bg-blue-600 hover:bg-blue-500 rounded-2xl text-xs font-bold uppercase tracking-widest text-white transition-all shadow-lg shadow-blue-900/20"
              >
                {passwordModal.type === 'export' ? 'Initialize Export' : 'Verify & Decrypt'}
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

function ToggleRow({ label, desc, on, onChange }: { label: string, desc: string, on: boolean, onChange: (val: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-8 group">
      <div className="space-y-1">
        <p className="text-sm font-bold text-zinc-100 group-hover:text-blue-400 transition-colors">{label}</p>
        <p className="text-[11px] text-zinc-500 leading-relaxed max-w-sm font-medium">{desc}</p>
      </div>
      <button 
        onClick={() => onChange(!on)}
        className={cn(
          "w-14 h-7 rounded-full p-1 transition-all flex items-center relative",
          on ? "bg-blue-600" : "bg-zinc-800"
        )}
      >
        <div className={cn(
          "w-5 h-5 rounded-full bg-white transition-all shadow-xl",
          on ? "translate-x-7" : "translate-x-0"
        )} />
      </button>
    </div>
  );
}
