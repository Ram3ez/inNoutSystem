'use client';

/**
 * Loading Indicator Component
 * Displays a styled, animated spinner and text to indicate background activity.
 * Now integrated with LoadingContext to show real-time progress if available.
 */

import React from 'react';
import { motion } from 'framer-motion';
import { useLoading } from '@/context/LoadingContext';

interface LoadingIndicatorProps {
    size?: 'sm' | 'md' | 'lg';
    status?: string;
    progress?: number;
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ 
    size = 'md', 
    status: propStatus, 
    progress: propProgress 
}) => {
    // Attempt to use context values if props aren't explicitly provided
    const context = useLoading();
    const status = propStatus !== undefined ? propStatus : (context?.loadingStatus || "Loading Data");
    const progress = propProgress !== undefined ? propProgress : (context?.loadingProgress || 0);
    const isLoading = context?.isLoading ?? true;

    const sizeMap = {
        sm: 'w-6 h-6 border-2',
        md: 'w-12 h-12 border-4',
        lg: 'w-16 h-16 border-4'
    };

    return (
        <div className="flex flex-col items-center justify-center space-y-6">
            <div className={`relative ${sizeMap[size].split(' ').slice(0,2).join(' ')}`}>
                <motion.div 
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className={`absolute inset-0 ${sizeMap[size].split(' ').slice(2).join(' ')} border-primary/10 border-t-secondary rounded-full shadow-inner`}
                />
                {progress > 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[8px] font-black text-secondary">{Math.round(progress)}%</span>
                    </div>
                )}
            </div>
            
            {size !== 'sm' && (
                <div className="text-center space-y-2">
                    <motion.p 
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="text-primary/60 text-[10px] tracking-[0.2em] uppercase font-black"
                    >
                        {status}
                    </motion.p>
                    
                    {progress > 0 && (
                        <div className="w-32 h-1 bg-primary/5 rounded-full overflow-hidden border border-primary/5 mx-auto">
                            <motion.div 
                                className="h-full bg-secondary shadow-[0_0_8px_rgba(var(--secondary),0.4)]"
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ type: "spring", stiffness: 50, damping: 20 }}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
