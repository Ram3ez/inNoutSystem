"use client";

/**
 * Offline Sync Manager
 * A background component that monitors network connectivity and triggers synchronization
 * of offline-captured data when the device returns online.
 * Now also displays a persistent red badge when the system is offline.
 */

import { useEffect, useState } from "react";
import { processOfflineQueue } from "@/lib/syncService";
import { WifiOff, AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function OfflineSyncManager() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine);

    // Initial check on load
    processOfflineQueue();

    const handleOnline = () => {
      console.log("System back online. Starting sync process...");
      setIsOnline(true);
      processOfflineQueue();
    };

    const handleOffline = () => {
      console.warn("System is offline. Queuing local transactions...");
      setIsOnline(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    
    // Also poll occasionally just in case 'online' event is missed
    const interval = setInterval(() => {
      processOfflineQueue();
    }, 1000 * 60 * 5); // Every 5 minutes

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearInterval(interval);
    };
  }, []);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[9999] flex justify-center pointer-events-none p-4"
        >
          <div className="bg-red-500 text-white px-6 py-3 rounded-2xl shadow-2xl shadow-red-500/40 flex items-center space-x-3 border border-white/20 backdrop-blur-md pointer-events-auto">
            <div className="relative">
              <WifiOff size={20} className="animate-pulse" />
              <AlertTriangle 
                size={10} 
                className="absolute -top-1 -right-1 text-white bg-red-600 rounded-full" 
              />
            </div>
            <div className="flex flex-col">
              <span className="text-[11px] font-black uppercase tracking-widest leading-none">Offline Mode</span>
              <span className="text-[9px] font-bold opacity-80 uppercase tracking-wider">Sync pending restoration</span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
