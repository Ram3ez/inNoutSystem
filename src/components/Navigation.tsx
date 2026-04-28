'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LogOut, Home, Settings, User, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const Navigation: React.FC = () => {
    const { user, logout, isFaculty, isCaretaker } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const pathname = usePathname();

    if (!user) return null;

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-surface border-b border-primary/10 px-4 sm:px-6 py-3 sm:py-4 shadow-sm transition-colors duration-300 safe-top">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <Link href="/" className="flex items-center space-x-3 group">
                    <div className="relative w-10 h-10 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo.png" alt="NITPY Logo" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex flex-col leading-tight">
                        <span className="font-bold tracking-tight text-primary text-sm sm:text-lg">NITPY</span>
                        <span className="text-[10px] sm:text-[11px] font-bold text-secondary uppercase tracking-widest hidden sm:block">Hostel Management System</span>
                    </div>
                </Link>

                <div className="flex items-center space-x-3 sm:space-x-6">
                    <div className="hidden sm:flex items-center space-x-2 text-primary/70 text-sm font-bold mr-4">
                        <User size={14} className="text-secondary" />
                        <span className="uppercase tracking-wider">{user.name}</span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                        <button 
                            onClick={toggleTheme}
                            className="p-2.5 text-primary/60 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                            title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
                        >
                            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
                        </button>
                        
                        <button 
                            onClick={logout}
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
