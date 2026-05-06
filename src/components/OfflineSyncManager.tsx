"use client";

/**
 * Offline Sync Manager
 * A background component that monitors network connectivity and triggers synchronization
 * of offline-captured data when the device returns online.
 */


import { useEffect } from "react";
import { processOfflineQueue } from "@/lib/syncService";

export function OfflineSyncManager() {
  useEffect(() => {
    // Initial check on load
    processOfflineQueue();

    const handleOnline = () => {
      console.log("System back online. Swelling sync process...");
      processOfflineQueue();
    };

    window.addEventListener("online", handleOnline);
    
    // Also poll occasionally just in case 'online' event is missed
    const interval = setInterval(() => {
      processOfflineQueue();
    }, 1000 * 60 * 5); // Every 5 minutes

    return () => {
      window.removeEventListener("online", handleOnline);
      clearInterval(interval);
    };
  }, []);

  return null;
}
