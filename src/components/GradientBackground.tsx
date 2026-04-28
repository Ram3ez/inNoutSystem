'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const GradientBackground: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="relative min-h-screen w-full bg-background overflow-hidden flex flex-col">
            {/* Animated Blobs for Premium Feel */}
            <motion.div 
                animate={{
                    scale: [1, 1.2, 1],
                    rotate: [0, 90, 0],
                    x: [0, 50, 0],
                    y: [0, 30, 0],
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "linear"
                }}
                className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-primary/20 blur-[120px] rounded-full pointer-events-none"
            />
            <motion.div 
                animate={{
                    scale: [1, 1.3, 1],
                    rotate: [0, -90, 0],
                    x: [0, -40, 0],
                    y: [0, 60, 0],
                }}
                transition={{
                    duration: 25,
                    repeat: Infinity,
                    ease: "linear"
                }}
                className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-secondary/15 blur-[120px] rounded-full pointer-events-none"
            />
            
            <div className="relative z-10 flex-1 flex flex-col">
                {children}
            </div>
        </div>
    );
};
