"use client";

import React from "react";
import { motion } from "framer-motion";
import { Building2, LogIn } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLoading } from "@/context/LoadingContext";
import { GradientBackground } from "@/components/GradientBackground";


import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Login Page
 * Provides a secure entry point for students and staff using Google OAuth.
 * Features a modern institutional design with glassmorphism and global loading integration.
 */
export default function LoginPage() {
  const { loginWithGoogle, isLoading, user } = useAuth();
  // Global loading state to provide visual feedback during auth handshake
  const { startLoading } = useLoading();
  const router = useRouter();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (user && !isLoading) {
      router.push("/");
    }
  }, [user, isLoading, router]);

  return (
    <GradientBackground>
      {/* 
          Main container for the login card. 
          The hydration fix involved removing 'relative' and 'overflow-hidden' 
          from this level to ensure SSR-Client parity.
      */}
      <div className="flex-1 flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-md text-center"
        >

          <div className="bg-background/60 backdrop-blur-2xl border border-primary/10 rounded-[2.5rem] p-8 sm:p-12 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] text-center">
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="mb-10 flex justify-center"
            >
              <div className="p-4 bg-primary/5 rounded-3xl">
                <img
                  src="/logo.webp"
                  alt="NITPY Logo"
                  className="w-20 h-20 sm:w-24 sm:h-24 object-contain"
                />
              </div>
            </motion.div>

            <div className="space-y-3 mb-10">
              <motion.h1
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-3xl sm:text-4xl font-black tracking-tight text-primary uppercase"
              >
                Digital Portal
              </motion.h1>
              <div className="h-1 w-12 bg-primary/20 mx-auto rounded-full" />
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-primary/60 text-xs sm:text-sm font-medium tracking-wide"
              >
                National Institute of Technology Puducherry
              </motion.p>
            </div>

            {/* Navigation & Action Section */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="space-y-6"
            >
              <div className="space-y-3">
                <button
                  onClick={() => {
                    startLoading(); // Trigger global progress bar
                    loginWithGoogle();
                  }}
                  disabled={isLoading}
                  className="group relative w-full h-16 bg-primary text-background rounded-2xl flex items-center justify-center transition-all hover:bg-primary/95 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none shadow-xl shadow-primary/20 overflow-hidden"
                >
                  {isLoading ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <div className="flex items-center space-x-3">
                      <LogIn size={20} className="text-background" />
                      <span className="text-background font-bold tracking-widest text-sm uppercase">
                        Continue with Google
                      </span>
                    </div>
                  )}
                </button>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="text-[10px] text-primary/40 font-medium tracking-wide"
                >
                  Access restricted to <span className="text-primary/60 font-bold italic">@nitpy.ac.in</span> accounts
                </motion.p>
              </div>

              <div className="flex items-center justify-center space-x-4 pt-4">
                <div className="h-[1px] flex-1 bg-primary/10" />
                <p className="text-primary/30 text-[10px] font-bold tracking-[0.2em] uppercase whitespace-nowrap">
                  Secure Access
                </p>
                <div className="h-[1px] flex-1 bg-primary/10" />
              </div>
            </motion.div>
          </div>

          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            transition={{ delay: 0.8 }}
            className="text-center mt-8 text-[9px] font-black tracking-[0.4em] uppercase text-primary pointer-events-none select-none"
          >
            Official Institutional Resource
          </motion.p>
        </motion.div>
      </div>
    </GradientBackground>

  );
}
