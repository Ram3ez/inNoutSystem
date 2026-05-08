'use client';

import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  ShieldAlert, 
  Database, 
  Cpu, 
  Network, 
  ArrowLeft,
  CheckCircle2,
  HardDrive,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { GradientBackground } from '@/components/GradientBackground';
import { purgeAndFullSync, isCacheLoaded, areModelsLoaded } from '@/lib/faceCache';

/**
 * SYSTEM HEALTH & MAINTENANCE PORTAL
 * 
 * Provides administrative diagnostics and cache orchestration tools.
 * Features:
 * 1. Forced Synchronization: Purges local IndexedDB and triggers a full biometric fetch.
 * 2. Hardware Diagnostics: Monitors JS Heap usage and platform metadata.
 * 3. Network Heartbeat: Live monitoring of connectivity status.
 * 4. Cache Verification: Checks integrity of persistent biometric descriptors and AI models.
 */
export default function SystemPage() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [sysInfo, setSysInfo] = useState({
    userAgent: '',
    platform: '',
    online: true,
    memory: 'Unknown'
  });
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    setSysInfo({
      userAgent: navigator.userAgent,
      platform: (navigator as any).platform || 'Unknown',
      online: navigator.onLine,
      memory: (performance as any).memory ? `${Math.round((performance as any).memory.usedJSHeapSize / 1048576)} MB` : 'N/A'
    });

    const handleOnline = () => setSysInfo(prev => ({ ...prev, online: true }));
    const handleOffline = () => setSysInfo(prev => ({ ...prev, online: false }));

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleForceSync = async () => {
    if (!confirm("Are you sure? This will wipe the local cache and re-download 3,000+ student profiles. Use this only if the system is out of sync.")) return;
    
    setIsSyncing(true);
    try {
      await purgeAndFullSync((msg) => {
        setSyncStatus(msg);
      });
    } catch (e) {
      console.error(e);
      setNotification({ message: "Sync failed. Check console.", type: "error" });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <GradientBackground>
      <div className="flex-1 flex flex-col p-6 overflow-auto">
        <header className="mb-10 flex items-center justify-between max-w-4xl mx-auto w-full">
          <div className="flex items-center space-x-4">
            <Link 
              href="/"
              className="p-3 bg-primary/5 hover:bg-primary/10 rounded-2xl text-primary transition-all"
            >
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-2xl font-black text-primary uppercase tracking-tighter italic">System Maintenance</h1>
              <p className="text-[10px] font-bold text-primary/40 uppercase tracking-[0.3em]">Kiosk & Identity Diagnostics</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 px-4 py-2 bg-secondary/10 rounded-full border border-secondary/20">
            <div className={`w-2 h-2 rounded-full animate-pulse ${sysInfo.online ? 'bg-secondary' : 'bg-error'}`} />
            <span className="text-[10px] font-black text-secondary uppercase tracking-widest">{sysInfo.online ? 'Cloud Online' : 'Offline Mode'}</span>
          </div>
        </header>

        <main className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
          {/* Biometric Sync Card */}
          <section className="bg-surface/40 backdrop-blur-md rounded-[2.5rem] border border-primary/10 p-8 flex flex-col shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none group-hover:scale-110 transition-transform duration-700">
               <Database size={120} className="text-secondary" />
            </div>
            
            <div className="flex items-center space-x-4 mb-8">
              <div className="w-14 h-14 bg-secondary/10 rounded-2xl flex items-center justify-center text-secondary shadow-lg shadow-secondary/5">
                <RefreshCw className={`${isSyncing ? 'animate-spin' : ''}`} size={24} />
              </div>
              <div>
                <h2 className="text-lg font-black text-primary uppercase italic tracking-tight">Biometric Engine</h2>
                <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">Local Identity Cache</p>
              </div>
            </div>

            <div className="space-y-4 mb-10 flex-1">
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/5">
                <div className="flex items-center space-x-3 text-primary/60">
                  <Cpu size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">Models Loaded</span>
                </div>
                {areModelsLoaded() ? (
                  <CheckCircle2 size={16} className="text-secondary" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-primary/20" />
                )}
              </div>
              <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/5">
                <div className="flex items-center space-x-3 text-primary/60">
                  <HardDrive size={16} />
                  <span className="text-[10px] font-black uppercase tracking-widest">IndexedDB Status</span>
                </div>
                {isCacheLoaded() ? (
                  <CheckCircle2 size={16} className="text-secondary" />
                ) : (
                  <span className="text-[10px] font-bold text-primary/30 uppercase italic">Empty</span>
                )}
              </div>
            </div>

            <button
              onClick={handleForceSync}
              disabled={isSyncing}
              className={`w-full h-16 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center space-x-3 transition-all shadow-xl ${
                isSyncing 
                ? 'bg-primary/5 text-primary/40 cursor-not-allowed' 
                : 'bg-primary text-background hover:brightness-110 shadow-primary/20'
              }`}
            >
              {isSyncing ? (
                <>
                  <RefreshCw size={20} className="animate-spin" />
                  <span>Syncing identities...</span>
                </>
              ) : (
                <>
                  <ShieldAlert size={20} />
                  <span>Force Biometric Sync</span>
                </>
              )}
            </button>
            
            <AnimatePresence>
              {isSyncing && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-6 p-4 bg-secondary/5 rounded-xl border border-secondary/10 text-center"
                >
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-[0.2em] animate-pulse">
                    {syncStatus}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Diagnostics Card */}
          <section className="bg-surface/40 backdrop-blur-md rounded-[2.5rem] border border-primary/10 p-8 flex flex-col shadow-2xl">
            <div className="flex items-center space-x-4 mb-8">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary shadow-lg shadow-primary/5">
                <Activity size={24} />
              </div>
              <div>
                <h2 className="text-lg font-black text-primary uppercase italic tracking-tight">Kiosk Diagnostics</h2>
                <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">Runtime Environment</p>
              </div>
            </div>

            <div className="space-y-3">
              {[
                { label: 'OS/Platform', value: sysInfo.platform, icon: Cpu },
                { label: 'Connectivity', value: sysInfo.online ? 'Stable' : 'Offline', icon: Network },
                { label: 'JS Heap Memory', value: sysInfo.memory, icon: HardDrive },
                { label: 'App Version', value: 'v1.9.0-TablesDB', icon: CheckCircle2 },
              ].map((item, idx) => (
                <div key={idx} className="p-4 bg-primary/5 rounded-2xl border border-primary/5 flex items-center justify-between">
                  <div className="flex items-center space-x-3 text-primary/40">
                    <item.icon size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
                  </div>
                  <span className="text-[10px] font-bold text-primary tracking-tight">{item.value}</span>
                </div>
              ))}
            </div>

            <div className="mt-10 p-6 bg-primary/5 rounded-2xl border border-primary/10 flex-1">
              <p className="text-[10px] text-primary/40 font-bold uppercase tracking-widest mb-2 italic">User Agent</p>
              <p className="text-[9px] text-primary/60 leading-relaxed font-medium break-all font-mono">
                {sysInfo.userAgent}
              </p>
            </div>
          </section>
        </main>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className="fixed bottom-8 left-0 right-0 z-[200] flex justify-center px-6 pointer-events-none"
          >
            <div
              className={`
                flex items-center gap-3 px-6 py-4 rounded-2xl backdrop-blur-xl border shadow-2xl pointer-events-auto
                ${
                  notification.type === "success"
                    ? "bg-success/10 border-success/20 text-success shadow-success/10"
                    : "bg-red-500/10 border-red-500/20 text-red-500 shadow-red-500/10"
                }
              `}
            >
              {notification.type === "success" ? (
                <CheckCircle2 size={20} />
              ) : (
                <ShieldAlert size={20} />
              )}
              <p className="text-sm font-black tracking-wide">
                {notification.message}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GradientBackground>
  );
}
