"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
/**
 * Global Loading Context
 * Manages a centralized loading state to provide visual feedback during
 * client-side navigation and long-running operations.
 */

interface LoadingContextType {
  isLoading: boolean;
  loadingStatus: string;
  loadingProgress: number;
  startLoading: (status?: string) => void;
  updateProgress: (progress: number, status?: string) => void;
  stopLoading: () => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

/**
 * LoadingProvider
 * 
 * This provider wraps the application to provide a unified loading feedback mechanism.
 * It combines route-change detection with a manual progress API.
 * 
 * KEY FEATURES:
 * 1. Auto-Reset: Monitors Next.js router state (pathname/searchParams) to automatically 
 *    dismiss the loader once a navigation is completed.
 * 2. Real-time Progress: Allows any component to report a specific 0-100% completion 
 *    status (useful for large downloads like AI models).
 * 3. Indeterminate Mode: If no progress is provided, it shows a smooth looping animation.
 */
export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Automatic Navigation Tracking
   * When the pathname or search parameters change, we assume the new page has mounted 
   * and the intended navigation is finished. We reset all states here.
   */
  useEffect(() => {
    setIsLoading(false);
    setLoadingStatus("");
    setLoadingProgress(0);
  }, [pathname, searchParams]);

  /**
   * startLoading
   * @param status - Optional text to display below the progress bar.
   */
  const startLoading = (status: string = "") => {
    setIsLoading(true);
    setLoadingStatus(status);
    setLoadingProgress(0);
  };

  /**
   * updateProgress
   * @param progress - Numeric percentage (0-100).
   * @param status - Optional status text update.
   */
  const updateProgress = (progress: number, status?: string) => {
    setLoadingProgress(progress);
    if (status) setLoadingStatus(status);
  };

  /**
   * stopLoading
   * Manually dismiss the loader.
   */
  const stopLoading = () => {
    setIsLoading(false);
    setLoadingStatus("");
    setLoadingProgress(0);
  };

  return (
    <LoadingContext.Provider value={{ isLoading, loadingStatus, loadingProgress, startLoading, updateProgress, stopLoading }}>
      {children}
      {/* 
          AESTHETIC GLOBAL PROGRESS BAR
          Positioned at the very top of the viewport with a high z-index.
          Uses Framer Motion for smooth width transitions.
      */}
      {isLoading && (
        <div className="fixed top-0 left-0 right-0 z-[9999] h-1.5 overflow-hidden pointer-events-none bg-background/20 backdrop-blur-sm">
          <div 
            className={`h-full bg-secondary transition-all duration-300 ease-out ${loadingProgress === 0 ? 'animate-progress' : ''}`} 
            style={{ width: loadingProgress > 0 ? `${loadingProgress}%` : '100%' }}
          />
          
          {/* 
              FLOATING STATUS OVERLAY
              Appears if specific status text is provided. 
              Useful for background tasks like AI model initialization.
          */}
          {loadingStatus && (
            <div className="fixed top-12 right-6 px-4 py-2 bg-surface/80 backdrop-blur-md border border-primary/10 rounded-full shadow-lg pointer-events-auto">
              <p className="text-[10px] font-black tracking-[0.2em] uppercase text-primary flex items-center gap-3">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                {loadingStatus}
                {loadingProgress > 0 && <span className="text-secondary ml-1">{Math.round(loadingProgress)}%</span>}
              </p>
            </div>
          )}
        </div>
      )}
    </LoadingContext.Provider>
  );
};


export const useLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error("useLoading must be used within a LoadingProvider");
  }
  return context;
};
