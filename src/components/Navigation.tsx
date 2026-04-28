'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { LogOut, Home, Settings, User } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const Navigation: React.FC = () => {
    const { user, logout } = useAuth();
    const pathname = usePathname();

    if (!user) return null;

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 bg-background/40 backdrop-blur-md border-b border-white/5 px-4 sm:px-6 py-3 sm:py-4">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
                <Link href="/" className="flex items-center space-x-3 group">
                    <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center group-hover:rotate-12 transition-transform">
                        <Home size={18} className="text-white" />
                    </div>
                    <span className="font-bold tracking-tight text-white/90 text-sm sm:text-base">HOSTEL.SYS</span>
                </Link>

                <div className="flex items-center space-x-3 sm:space-x-6">
                    <div className="hidden sm:flex items-center space-x-2 text-white/60 text-sm font-medium mr-4">
                        <User size={14} />
                        <span>{user.name}</span>
                    </div>
                    
                    <button 
                        onClick={logout}
                        className="p-2 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-all"
                    >
                        <LogOut size={20} />
                    </button>
                </div>
            </div>
        </nav>
    );
};
