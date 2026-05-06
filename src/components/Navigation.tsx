'use client';

/**
 * Navigation Component
 * Provides the main top navigation bar with user profile, theme toggle, and role-based links.
 */


import React from 'react';
import { motion } from 'framer-motion';
import { LogOut, Home, Settings, User, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useLoading } from '@/context/LoadingContext';
import { usePathname, useRouter } from 'next/navigation';

export const Navigation: React.FC = () => {
    const { user, logout, isFaculty, isCaretaker } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const { startLoading } = useLoading();
    const pathname = usePathname();
    const router = useRouter();

    if (!user) return null;

    /**
     * handleNav
     * Custom navigation handler that triggers the global loading bar.
     * We use buttons instead of standard Links to ensure the loader starts
     * immediately upon click, improving perceived latency.
     */
    const handleNav = (href: string) => {
        if (pathname !== href) {
            startLoading();
            router.push(href);
        }
    };

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-md border-b border-primary/10 px-4 sm:px-6 pt-8 sm:pt-10 pb-6 sm:pb-8 shadow-sm transition-colors duration-300">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <button onClick={() => handleNav('/')} className="flex items-center space-x-4 group text-left">
                    <div className="relative w-12 h-12 flex items-center justify-center mr-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo.webp" alt="NITPY Logo" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex flex-col justify-center">
                        <span className="font-black tracking-tighter text-primary text-base sm:text-3xl leading-none uppercase">NITPY</span>
                        <span className="text-[7px] sm:text-[9px] font-black text-primary/40 uppercase tracking-[0.2em] sm:tracking-[0.4em] leading-none mt-1.5 sm:mt-2">Hostel Management System</span>
                    </div>
                </button>

                <div className="flex items-center space-x-3 sm:space-x-6">
                    <div className="hidden sm:flex items-center space-x-2 text-primary/80 text-xs font-black mr-4">
                        <User size={14} className="text-secondary" />
                        <span className="uppercase tracking-[0.15em]">{user.name}</span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                        {(isFaculty || isCaretaker) && (
                            <button 
                                onClick={() => handleNav('/system')}
                                className={`p-2.5 rounded-xl transition-all ${pathname === '/system' ? 'bg-secondary/10 text-secondary' : 'text-primary/40 hover:text-primary hover:bg-primary/5'}`}
                                title="System Maintenance"
                            >
                                <Settings size={20} />
                            </button>
                        )}

                        <button 
                            onClick={toggleTheme}
                            className="p-2.5 text-primary/60 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                        >
                            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                        </button>
                        
                        <button 
                            onClick={() => {
                                startLoading();
                                logout();
                            }}
                            className="p-2.5 text-primary/40 hover:text-secondary hover:bg-secondary/5 rounded-xl transition-all"
                        >
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </nav>
    );
};

