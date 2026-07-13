import React, { useState } from 'react';
import { useSiSecure } from '../SiSecureContext';
import { motion, AnimatePresence } from 'motion/react';
import { X, Shield, Lock, Database, HardDrive, Trash2, Download, Upload, LogOut, Key, User, Settings, Check, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { db } from '../lib/db';
import { cn } from '../lib/utils';
import CryptoJS from 'crypto-js';

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const { profile, settings, updateProfile, updateSettings, lightNuke, fullNuke } = useSiSecure();
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(profile?.displayName || '');
  const [purgeConfirm, setPurgeConfirm] = useState<'light' | 'full' | null>(null);
  
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

  const saveProfile = async () => {
    if (newName.trim()) {
      await updateProfile({ displayName: newName.trim() });
      setEditingName(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#050505]/95 backdrop-blur-xl">
      <motion.div 
        initial={{ y: 20, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="w-full max-w-2xl bg-[#0A0A0A] border border-white/5 rounded-[2.5rem] overflow-hidden flex flex-col max-h-[90vh] shadow-2xl"
      >
        <div className="p-8 flex items-center justify-between border-b border-white/5">
          <h3 className="text-xl font-bold flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 rounded-xl">
              <Settings className="w-5 h-5 text-blue-500" />
            </div>
            System Control Center
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-zinc-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-12">
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
                <code className="text-[10px] text-zinc-600 font-mono break-all line-clamp-1 italic mt-1">{profile?.publicKey}</code>
              </div>
              <button className="p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl text-zinc-500 border border-white/5 transition-all hidden group-hover:block absolute right-6">
                <Key className="w-5 h-5" />
              </button>
            </div>
          </section>

          {/* Storage Section */}
          <section className="space-y-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Data Sovereignty</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <div className="flex items-center gap-3 text-zinc-200">
                  <HardDrive className="w-5 h-5 text-zinc-500" />
                  <span className="font-bold text-sm uppercase tracking-tight">Local Storage</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-[10px] text-zinc-600 font-bold tracking-widest uppercase">
                    <span>DATABASE VOLUME</span>
                    <span className="text-blue-500">OPTIMIZED</span>
                  </div>
                  <div className="w-full h-1.5 bg-zinc-800/50 rounded-full overflow-hidden">
                    <div className="w-[12%] h-full bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]" />
                  </div>
                </div>
                {purgeConfirm ? (
                  <div className="space-y-3">
                    <p className="text-[10px] text-red-500 font-bold uppercase text-center flex items-center justify-center gap-2">
                      <AlertTriangle className="w-3 h-3" />
                      {purgeConfirm === 'light'
                        ? 'Erase all messages? Contacts stay.'
                        : 'Erase contacts, groups & messages?'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={purgeConfirm === 'light' ? handleLightNuke : handleFullNuke}
                        className="flex-1 h-10 bg-red-600 text-white rounded-xl text-[10px] font-bold uppercase"
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
                      className="flex-1 h-12 bg-zinc-900 hover:bg-amber-500/10 border border-white/5 hover:border-amber-500/20 rounded-2xl text-zinc-500 hover:text-amber-500 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                      title="Deletes messages only. Contacts are kept."
                    >
                      <Trash2 className="w-4 h-4" /> Light Nuke
                    </button>
                    <button
                      onClick={() => setPurgeConfirm('full')}
                      className="flex-1 h-12 bg-zinc-900 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 rounded-2xl text-zinc-500 hover:text-red-500 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                      title="Deletes messages, contacts & groups. Identity is kept."
                    >
                      <Trash2 className="w-4 h-4" /> Full Nuke
                    </button>
                  </div>
                )}
              </div>
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
                desc="Lock the application access behind your device authentication flow." 
                on={settings?.biometricLock || false}
                onChange={(val) => updateSettings({ biometricLock: val })}
              />
            </div>
          </section>
        </div>

        <div className="p-8 bg-[#050505] border-t border-zinc-800/40 flex items-center justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-[10px] text-zinc-600 font-mono tracking-tighter">NODE_ID // {profile?.id.toUpperCase()}</p>
            <p className="text-[9px] text-zinc-700 font-mono tracking-widest uppercase">CRYPTO_ENGINE // V1.2-STABLE</p>
          </div>
          <button className="h-12 px-6 bg-zinc-900/50 hover:bg-red-500/10 rounded-2xl text-zinc-500 hover:text-red-500 transition-all text-[10px] font-bold uppercase tracking-widest flex items-center gap-3 border border-white/5">
            <LogOut className="w-4 h-4" /> Disconnect Node
          </button>
        </div>
      </motion.div>

      {/* Password Modal */}
      <AnimatePresence>
        {passwordModal.isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#0A0A0A] border border-white/5 p-8 rounded-[2.5rem] max-w-sm w-full shadow-2xl space-y-6"
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
