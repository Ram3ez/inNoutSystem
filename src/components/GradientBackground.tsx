'use client';

import React from 'react';
import { motion } from 'framer-motion';

export const GradientBackground: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <div className="relative min-h-screen w-full bg-background flex flex-col font-sans">
      {/* Minimal clean background */}

      <div className="relative z-10 flex-1 flex flex-col">{children}</div>
    </div>
  );
};
