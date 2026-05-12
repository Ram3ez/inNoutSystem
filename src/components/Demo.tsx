"use client";

import React from "react";
import { BasePage } from "@/components/BasePage";
import { motion } from "framer-motion";
import { Code, Layout, Shield, Zap } from "lucide-react";

/**
 * UI DEMO COMPONENT
 * This component serves as a reference for new developers to understand
 * the design language and the use of the BasePage wrapper.
 * 
 * Location: src/components/Demo.tsx
 */
export default function Demo() {
  const features = [
    {
      icon: <Layout className="text-blue-500" />,
      title: "Consistent Layout",
      desc: "Uses the BasePage wrapper to ensure perfect alignment and spacing across all devices.",
    },
    {
      icon: <Shield className="text-emerald-500" />,
      title: "Auto Protection",
      desc: "Built-in support for admin-only, faculty, and caretaker routes with silent redirects.",
    },
    {
      icon: <Zap className="text-amber-500" />,
      title: "Fast Development",
      desc: "Pre-configured with the site's typography and glassmorphism design language.",
    },
    {
      icon: <Code className="text-purple-500" />,
      title: "Developer Ready",
      desc: "Includes standard Lucide icons and Framer Motion animations out of the box.",
    },
  ];

  return (
    <BasePage 
      title="UI Framework Demo" 
      subtitle="Standardized Component Library"
      maxWidth="lg"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {features.map((f, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="p-8 bg-surface/40 backdrop-blur-xl border border-primary/5 rounded-3xl hover:border-primary/20 transition-all group"
          >
            <div className="w-12 h-12 bg-primary/5 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              {f.icon}
            </div>
            <h3 className="text-xl font-bold text-primary uppercase tracking-tight mb-2">
              {f.title}
            </h3>
            <p className="text-primary/40 text-sm font-bold uppercase tracking-widest leading-relaxed">
              {f.desc}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Example section with different style */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-12 p-10 bg-primary/5 rounded-[2.5rem] border border-dashed border-primary/20 flex flex-col items-center text-center"
      >
        <p className="text-primary/30 text-[10px] font-black uppercase tracking-[0.4em] mb-6">Usage Example</p>
        <div className="bg-background/80 p-4 rounded-xl border border-primary/10 w-full max-w-md text-left overflow-x-auto">
          <pre className="text-xs font-mono text-primary/60 italic leading-relaxed">
            {`import { BasePage } from "@/components/BasePage";

export default function MyNewPage() {
  return (
    <BasePage 
      title="My Page" 
      subtitle="Subtitle"
      requireAdmin={true} // Optional protection
    >
      {/* Your content here */}
    </BasePage>
  );
}`}
          </pre>
        </div>
      </motion.div>
    </BasePage>
  );
}
