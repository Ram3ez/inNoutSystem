'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const GradientBackground: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <div className="relative min-h-screen w-full bg-background flex flex-col font-sans">
      {/* Subtle Institutional Border/Pattern */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-primary" />
      <div className="absolute top-0 left-0 w-1.5 h-full bg-primary/5" />

      <div className="relative z-10 flex-1 flex flex-col">{children}</div>
    </div>
  );
};
