"use client";

/**
 * AuditLogsPage - System Observability Dashboard
 * 
 * This page provides a high-performance, responsive interface for administrators to 
 * monitor system transactions, security events, and administrative overrides.
 * 
 * Features:
 * - Dual-View Architecture: High-density Table for desktop, Card List for mobile.
 * - Severity Filtering: Real-time filtering by High/Medium/Low priority levels.
 * - Interactive Modals: Detailed transaction inspection including raw JSON metadata.
 * - Search: Instant contains-matching across action types, messages, and users.
 */

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Activity,
  Search,
  Filter,
  ChevronDown,
  Calendar,
  AlertCircle,
  ShieldCheck,
  User,
  Clock,
  RefreshCw,
  Database,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { tablesDB, Query } from "@/lib/appwrite";
import { GradientBackground } from "@/components/GradientBackground";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { Navigation } from "@/components/Navigation";
import { useRouter } from "next/navigation";
import { DB_ID, COLLECTIONS, formatToISTFull } from "@/lib/constants";

/**
 * AUDIT LOGS — SYSTEM OBSERVABILITY PORTAL
 *
 * Provides institutional administrators with a transparent, searchable
 * history of all database transactions and critical system events.
 */

export default function AuditLogsPage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [limit, setLimit] = useState(50);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!user || !isAdmin) {
        router.push("/");
      } else {
        fetchLogs();
      }
    }
  }, [authLoading, limit, levelFilter]); // Stabilized dependencies

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const queries = [Query.orderDesc("$createdAt"), Query.limit(limit)];

      // Note: We filter by level server-side for performance
      if (levelFilter !== "all") {
        queries.push(Query.equal("level", levelFilter));
      }

      const response = await tablesDB.listRows({
        databaseId: DB_ID,
        tableId: COLLECTIONS.AUDIT_LOGS,
        queries,
      });

      setLogs(response.rows);
    } catch (err) {
      console.error("Failed to fetch logs", err);
    } finally {
      setIsLoading(false);
    }
  };

  // Client-side filtering for search query (action, message, user)
  const filteredLogs = logs.filter(
    (log) =>
      (log.action || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.message || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.user_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (log.user_id || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  if (authLoading || (user && !isAdmin)) {
    return (
      <GradientBackground>
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator />
        </div>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <Navigation />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-38 pb-12">
        <header className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4 text-left">
            <button
              onClick={() => router.push("/")}
              className="p-2 hover:bg-primary/10 rounded-full transition-colors text-primary"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-primary tracking-tight uppercase">
                Audit Logs
              </h1>
              <p className="text-primary/40 text-[10px] font-bold uppercase tracking-widest">
                Centralized System Transaction History
              </p>
            </div>
          </div>
          <button
            onClick={fetchLogs}
            className="flex items-center justify-center space-x-2 px-8 py-4 bg-secondary text-white rounded-3xl hover:bg-secondary/90 transition-all shadow-lg shadow-secondary/20 active:scale-[0.98]"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
            <span className="text-xs font-black uppercase tracking-widest">
              Refresh Logs
            </span>
          </button>
        </header>

        {/* 
          Filter Controls - Responsive Flexbox Layout
          Centered on mobile, left-aligned on desktop with auto-growing search.
        */}
        <div className="flex flex-col md:flex-row items-center gap-4 mb-8">
          <div className="relative group w-full md:flex-1">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-primary/40 group-focus-within:text-secondary transition-colors"
              size={20}
            />
            <input
              type="text"
              placeholder="Search logs by action, message, or user..."
              className="w-full bg-surface/50 backdrop-blur-md border border-primary/10 rounded-3xl py-4 pl-12 pr-4 text-primary focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary transition-all font-medium shadow-sm uppercase text-xs tracking-wider placeholder:text-primary/20"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex justify-center w-full md:w-auto">
            <div className="flex space-x-3 overflow-x-auto no-scrollbar py-2 px-1">
              {["all", "high", "medium", "low"].map((level) => (
                <button
                  key={level}
                  onClick={() => setLevelFilter(level)}
                  className={`w-20 h-10 flex-shrink-0 flex items-center justify-center rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                    levelFilter === level
                      ? "bg-secondary text-white border-secondary shadow-lg shadow-secondary/20"
                      : "bg-surface text-primary/40 border-primary/10 hover:border-secondary/40 shadow-sm"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Log Viewer Container */}
        <div className="bg-surface border border-primary/10 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-primary/5">
          {isLoading ? (
            <div className="p-24 flex flex-col items-center justify-center space-y-6">
              <LoadingIndicator size="sm" />
              <p className="text-primary/40 font-bold uppercase text-[10px] tracking-widest animate-pulse">
                Syncing logs from Appwrite...
              </p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-24 text-center space-y-4">
              <div className="w-16 h-16 bg-primary/5 rounded-3xl flex items-center justify-center mx-auto mb-4">
                <Database size={32} className="text-primary/20" />
              </div>
              <p className="font-bold uppercase tracking-widest text-sm text-primary/40">
                No transactions found matching your criteria
              </p>
            </div>
          ) : (
            <>
              {/* 
                Desktop View (High-Density Table)
                Uses fixed-column widths to prevent horizontal scrolling on dashboard containers.
              */}
              <div className="hidden lg:block overflow-hidden border border-primary/5 rounded-[2.5rem] shadow-xl bg-surface/50">
                <table className="w-full border-collapse table-fixed">
                  <thead>
                    <tr className="border-b border-primary/5 bg-primary/[0.02]">
                      <th className="w-[200px] px-6 py-6 text-left text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Timestamp (IST)</th>
                      <th className="w-[120px] px-6 py-6 text-left text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Severity</th>
                      <th className="w-[180px] px-6 py-6 text-left text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Event Type</th>
                      <th className="w-[220px] px-6 py-6 text-left text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Origin User</th>
                      <th className="px-6 py-6 text-left text-[10px] font-black text-primary/40 uppercase tracking-[0.2em]">Transaction Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-primary/5">
                    {filteredLogs.map((log, idx) => (
                      <motion.tr
                        key={log.$id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.01 }}
                        onClick={() => setSelectedLog(log)}
                        className="hover:bg-primary/[0.02] transition-colors group cursor-pointer"
                      >
                        <td className="px-6 py-6">
                          <div className="flex items-center space-x-2 text-primary/60">
                            <Clock size={14} className="text-secondary/50" />
                            <span className="text-[10px] font-bold">{formatToISTFull(log.$createdAt || log.timestamp)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                            log.level === "high" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                            log.level === "medium" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                            "bg-blue-500/10 text-blue-500 border-blue-500/20"
                          }`}>{log.level}</span>
                        </td>
                        <td className="px-6 py-6 overflow-hidden">
                          <span className="block truncate px-3 py-1.5 bg-primary/5 rounded-lg text-[9px] font-black text-primary/70 uppercase tracking-widest border border-primary/5" title={log.action}>{log.action}</span>
                        </td>
                        <td className="px-6 py-6">
                          <div className="flex items-center space-x-3">
                            <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center border border-primary/5"><User size={14} className="text-primary/30" /></div>
                            <div className="truncate"><p className="text-[10px] font-black uppercase truncate">{log.user_name}</p><p className="text-[9px] font-bold text-primary/30 truncate uppercase">{log.user_id}</p></div>
                          </div>
                        </td>
                        <td className="px-6 py-6">
                          <p className="text-xs text-primary/70 font-bold uppercase truncate">{log.message}</p>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 
                Mobile/Compact View (Cleaner Divider List) 
                Eliminates horizontal scrolling by stacking details into vertical cards with subtle dividers.
              */}
              <div className="lg:hidden border border-primary/5 rounded-[2.5rem] overflow-hidden bg-surface/30 divide-y divide-primary/5">
                {filteredLogs.map((log, idx) => (
                  <motion.div
                    key={log.$id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => setSelectedLog(log)}
                    className="p-6 hover:bg-primary/[0.02] active:bg-primary/[0.05] transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                        log.level === "high" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                        log.level === "medium" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                        "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      }`}>{log.level}</span>
                      <div className="flex items-center space-x-2 text-primary/30">
                        <Clock size={12} />
                        <span className="text-[9px] font-bold">{formatToISTFull(log.$createdAt || log.timestamp)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between items-start gap-4">
                      <div className="space-y-3 flex-1">
                        <div className="inline-block px-3 py-1.5 bg-primary/5 rounded-lg text-[10px] font-black text-secondary uppercase tracking-widest border border-primary/5">{log.action}</div>
                        <p className="text-xs text-primary/80 font-bold leading-relaxed">{log.message}</p>
                        <div className="flex items-center space-x-3 text-primary/40 pt-2">
                          <User size={14} className="text-primary/20" />
                          <p className="text-[10px] font-bold uppercase truncate">{log.user_name} • {log.user_id}</p>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-primary/10 mt-1" />
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedLog && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedLog(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-md"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="relative w-full max-w-2xl bg-surface border border-primary/10 rounded-[2.5rem] overflow-hidden shadow-2xl"
              >
                <div className="p-8 border-b border-primary/5 flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
                      selectedLog.level === "high" ? "bg-red-500/10 border-red-500/20 text-red-500" :
                      selectedLog.level === "medium" ? "bg-amber-500/10 border-amber-500/20 text-amber-500" :
                      "bg-blue-500/10 border-blue-500/20 text-blue-500"
                    }`}>
                      <Activity size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-primary uppercase tracking-tight">Transaction Details</h3>
                      <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">{selectedLog.$id}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSelectedLog(null)}
                    className="w-10 h-10 rounded-full bg-primary/5 flex items-center justify-center text-primary/40 hover:bg-primary/10 transition-colors"
                  >
                    <ArrowLeft size={20} />
                  </button>
                </div>
                
                <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto no-scrollbar">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-primary/20 uppercase tracking-[0.2em]">Timestamp (IST)</p>
                      <p className="text-sm font-bold text-primary">{formatToISTFull(selectedLog.$createdAt || selectedLog.timestamp)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-primary/20 uppercase tracking-[0.2em]">Event Type</p>
                      <p className="text-sm font-black text-secondary uppercase">{selectedLog.action}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-primary/20 uppercase tracking-[0.2em]">Origin User</p>
                      <p className="text-sm font-bold text-primary">{selectedLog.user_name}</p>
                      <p className="text-[10px] font-bold text-primary/40 tracking-widest">{selectedLog.user_id}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-primary/20 uppercase tracking-[0.2em]">Log Severity</p>
                      <span className={`inline-block px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                        selectedLog.level === "high" ? "bg-red-500/10 text-red-500 border-red-500/20" :
                        selectedLog.level === "medium" ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                        "bg-blue-500/10 text-blue-500 border-blue-500/20"
                      }`}>
                        {selectedLog.level}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-primary/20 uppercase tracking-[0.2em]">Activity Message</p>
                    <div className="p-6 bg-primary/[0.03] rounded-3xl border border-primary/5">
                      <p className="text-sm font-bold text-primary/80 leading-relaxed uppercase tracking-tight">
                        {selectedLog.message}
                      </p>
                    </div>
                  </div>

                  {selectedLog.metadata && (
                    <div className="space-y-3">
                      <p className="text-[10px] font-black text-primary/20 uppercase tracking-[0.2em]">Extended Metadata</p>
                      <div className="p-6 bg-primary/[0.02] rounded-3xl border border-primary/5 overflow-hidden">
                        <pre className="text-xs text-primary/40 font-mono whitespace-pre-wrap leading-relaxed break-all">
                          {typeof selectedLog.metadata === "string"
                            ? selectedLog.metadata
                            : JSON.stringify(selectedLog.metadata, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Pagination/Limit Controls */}
        <footer className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center space-x-3 px-6 py-3 bg-secondary/10 rounded-2xl border border-secondary/20">
            <ShieldCheck size={16} className="text-secondary" />
            <p className="text-secondary/80 text-[10px] font-black uppercase tracking-widest">
              Authenticated Session: Institutional Admin
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-black text-primary/30 uppercase tracking-widest mr-2">
              Rows per view:
            </span>
            {[50, 100, 250, 500].map((val) => (
              <button
                key={val}
                onClick={() => setLimit(val)}
                className={`w-14 h-10 flex items-center justify-center rounded-xl text-[10px] font-black border transition-all ${
                  limit === val
                    ? "bg-secondary text-white border-secondary shadow-lg shadow-secondary/20"
                    : "bg-surface text-primary/40 border-primary/10 hover:border-secondary/40 shadow-sm"
                }`}
              >
                {val}
              </button>
            ))}
          </div>
        </footer>
      </main>
    </GradientBackground>
  );
}
