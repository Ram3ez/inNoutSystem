'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface LoadingIndicatorProps {
    size?: 'sm' | 'md' | 'lg';
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ size = 'md' }) => {
    const sizeMap = {
        sm: 'w-6 h-6 border-2',
        md: 'w-12 h-12 border-4',
        lg: 'w-16 h-16 border-4'
    };

    return (
        <div className="flex flex-col items-center justify-center space-y-4">
            <div className={`relative ${sizeMap[size].split(' ').slice(0,2).join(' ')}`}>
                <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className={`absolute inset-0 ${sizeMap[size].split(' ').slice(2).join(' ')} border-primary/20 border-t-primary rounded-full`}
                />
            </div>
            {size !== 'sm' && (
                <motion.p 
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="text-primary/60 text-[10px] tracking-widest uppercase font-black"
                >
                    Loading Data
                </motion.p>
            )}
        </div>
    );
};
