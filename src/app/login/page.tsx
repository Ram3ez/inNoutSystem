'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Building2, LogIn } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { GradientBackground } from '@/components/GradientBackground';

export default function LoginPage() {
    const { loginWithGoogle, isLoading } = useAuth();

    return (
        <GradientBackground>
            <div className="flex-1 flex items-center justify-center p-6">
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="w-full max-w-md text-center"
                >
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2, duration: 0.5 }}
                        className="mb-6 flex justify-center"
                    >
                        <img src="/logo.png" alt="Logo" className="w-32 h-32 object-contain" />
                    </motion.div>

                    <motion.h1 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3, duration: 0.5 }}
                        className="text-2xl font-bold tracking-[0.2em] text-primary mb-12 uppercase"
                    >
                        NITPY HOSTELS
                    </motion.h1>

                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.5, duration: 0.5 }}
                    >
                        <button
                            onClick={loginWithGoogle}
                            disabled={isLoading}
                            className="group relative w-full h-14 bg-primary text-white rounded-xl flex items-center justify-center transition-all hover:bg-primary/95 active:scale-95 disabled:opacity-50 disabled:pointer-events-none overflow-hidden shadow-lg shadow-primary/20"
                        >
                            {isLoading ? (
                                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <div className="flex items-center space-x-3">
                                    <LogIn size={20} className="text-foreground" />
                                    <span className="text-white font-bold tracking-wider text-sm uppercase">
                                        Continue with Google
                                    </span>
                                </div>
                            )}
                        </button>
                    </motion.div>

                    <p className="mt-8 text-primary/40 text-xs font-bold tracking-[0.3em] uppercase">
                        Administrative Console Access
                    </p>
                </motion.div>
            </div>
        </GradientBackground>
    );
}

