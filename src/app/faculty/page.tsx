"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardCheck,
  Clock,
  XCircle,
  Calendar,
  RefreshCw,
  UserCheck,
  ChevronLeft,
  Search,
  Phone,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { databases, Query, ID } from "@/lib/appwrite";
import { DB_ID, COLLECTIONS } from "@/lib/constants";
import { GradientBackground } from "@/components/GradientBackground";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useRouter } from "next/navigation";

interface LeaveRequest {
  $id: string;
  roll_no: string;
  reason: string;
  place_of_visit?: string;
  proposed_exit_date: string;
  proposed_in_date: string;
  status: string;
  caretaker_id: string;
  faculty_id: string;
  requires_faculty: boolean;
  student_name?: string;
  student_phone?: number;
  exit_date_time?: string;
  in_date_time?: string;
}

export default function FacultyDashboard() {
  const { user, isLoading: authLoading, isFaculty } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [activeLeaves, setActiveLeaves] = useState<LeaveRequest[]>([]);
  const [viewMode, setViewMode] = useState<"pending" | "active">("pending");
  const [isLoading, setIsLoading] = useState(true);
  const [isActioning, setIsActioning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedRequests, setExpandedRequests] = useState<
    Record<string, boolean>
  >({});
  const [revealedPhones, setRevealedPhones] = useState<Record<string, boolean>>(
    {},
  );

  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !isFaculty) {
      router.push("/");
    } else if (user) {
      fetchRequests();
    }
  }, [authLoading, isFaculty, user]);

  const parseSafeDate = (dateString: string) => {
    if (!dateString) return "Invalid Date";
    try {
      let date = new Date(dateString);
      if (isNaN(date.getTime())) {
        const cleanedDateString = dateString.replace(/\.$/, "");
        date = new Date(cleanedDateString);
      }
      if (isNaN(date.getTime())) return "Invalid Date";
      return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "Invalid Date";
    }
  };

  const fetchRequests = async () => {
    if (!user?.email) return;
    setIsLoading(true);
    try {
      const [pendingRes, activeRes] = await Promise.all([
        databases.listDocuments(DB_ID, COLLECTIONS.LEAVE, [
          Query.equal("status", "pending_faculty"),
          Query.equal("faculty_id", user.email),
        ]),
        databases.listDocuments(DB_ID, COLLECTIONS.LEAVE, [
          Query.equal("status", "approved"),
          Query.equal("faculty_id", user.email),
        ]),
      ]);

      const enrichDocs = async (docs: any[]) => {
        return Promise.all(
          docs.map(async (doc) => {
            const leaveDoc = doc as unknown as LeaveRequest;
            try {
              const student = await databases.getDocument(
                DB_ID,
                COLLECTIONS.STUDENTS,
                leaveDoc.roll_no,
              );
              return {
                ...leaveDoc,
                student_name: student.name,
                student_phone: student.phone_no,
              } as LeaveRequest;
            } catch {
              return leaveDoc;
            }
          }),
        );
      };

      const enrichedPending = await enrichDocs(pendingRes.documents);
      const enrichedActive = await enrichDocs(
        activeRes.documents.filter((d) => d.exit_date_time && !d.in_date_time),
      );

      setRequests(enrichedPending);
      setActiveLeaves(enrichedActive);
    } catch (error) {
      console.error("Failed to fetch requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async (
    requestId: string,
    action: "approve" | "reject",
  ) => {
    setIsActioning(requestId);
    try {
      const request = requests.find((r) => r.$id === requestId);
      if (!request) return;

      if (action === "approve") {
        await databases.updateDocument(DB_ID, COLLECTIONS.LEAVE, requestId, {
          status: "approved",
          faculty_approval: true,
        });
      } else {
        const {
          $id,
          $collectionId,
          $databaseId,
          $createdAt,
          $updatedAt,
          $permissions,
          student_name,
          student_phone,
          ...archiveData
        } = request as any;

        archiveData.status = "rejected_faculty";
        archiveData.faculty_approval = false;

        await databases.createDocument(
          DB_ID,
          COLLECTIONS.LEAVE_ARCHIVE,
          ID.unique(),
          archiveData,
        );
        await databases.deleteDocument(DB_ID, COLLECTIONS.LEAVE, requestId);
      }

      // Remove from local list
      setRequests((prev) => prev.filter((r) => r.$id !== requestId));
    } catch (error) {
      console.error("Action failed:", error);
      alert("Failed to process request. Please try again.");
    } finally {
      setIsActioning(null);
    }
  };

  const toggleExpand = (requestId: string) => {
    setExpandedRequests((prev) => ({
      ...prev,
      [requestId]: !prev[requestId],
    }));
  };

  if (authLoading || isLoading) return <LoadingIndicator />;

  const currentList = viewMode === "pending" ? requests : activeLeaves;

  const filteredRequests = currentList.filter(
    (r) =>
      r.roll_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.student_name?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <GradientBackground>
      <div className="w-full max-w-4xl mx-auto px-6 pt-8 sm:pt-12 pb-24 flex-1 flex flex-col">
        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-8"
        >
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-2 text-primary/60 hover:text-primary transition-colors text-xs font-black uppercase tracking-widest w-fit group"
          >
            <div className="p-1.5 rounded-full bg-primary/5 group-hover:bg-primary/10 transition-colors">
              <ChevronLeft
                size={16}
                className="group-hover:-translate-x-0.5 transition-transform"
              />
            </div>
            Back to Dashboard
          </button>
        </motion.div>

        {/* Header */}
        <header className="mb-12 relative">
          <div className="absolute -top-20 -left-20 w-64 h-64 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-between items-end relative z-10"
          >
            <div className="space-y-2">
              <p className="text-primary font-black text-[10px] tracking-[0.3em] uppercase flex items-center gap-2">
                <UserCheck size={12} />
                Warden Portal
              </p>
              <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight">
                Welcome,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/60">
                  {user?.name?.split(" ")[0]}
                </span>
              </h1>
            </div>
            <div className="hidden sm:flex px-4 py-2.5 rounded-2xl border items-center gap-2 shadow-lg backdrop-blur-md border-primary/20 bg-primary/10 text-primary shadow-primary/5">
              <UserCheck size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Faculty Advisor
              </span>
            </div>
          </motion.div>
        </header>

        {/* Stats / Summary */}
        <div className="grid grid-cols-2 gap-4 mb-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-surface/40 backdrop-blur-xl border border-primary/10 p-6 sm:p-8 rounded-[2.5rem] relative overflow-hidden group"
          >
            <div className="absolute top-0 right-0 p-6 opacity-10 transition-opacity group-hover:opacity-20">
              <ClipboardCheck size={48} className="text-primary" />
            </div>
            <div className="relative z-10">
              <p className="text-primary/40 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Action Required
              </p>
              <p className="text-4xl sm:text-5xl font-black text-foreground">
                {requests.length}
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-surface/40 backdrop-blur-xl border border-primary/10 p-6 sm:p-8 rounded-[2.5rem] flex items-center justify-center relative overflow-hidden group cursor-pointer hover:bg-primary/5 transition-all"
            onClick={fetchRequests}
          >
            <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-all pointer-events-none" />
            <div className="flex flex-col items-center gap-3 relative z-10">
              <div className="p-4 rounded-2xl bg-primary/10 text-primary group-hover:rotate-180 transition-transform duration-500">
                <RefreshCw size={20} />
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-primary/60 group-hover:text-primary transition-colors">
                Sync Data
              </span>
            </div>
          </motion.div>
        </div>

        {/* View Toggle */}
        <div className="flex bg-surface/40 backdrop-blur-xl border border-primary/10 rounded-full p-1 mb-8 relative">
          <button
            onClick={() => setViewMode("pending")}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-full transition-all relative z-10 ${
              viewMode === "pending"
                ? "text-background"
                : "text-primary/60 hover:text-primary"
            }`}
          >
            Pending Approvals
          </button>
          <button
            onClick={() => setViewMode("active")}
            className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-full transition-all relative z-10 ${
              viewMode === "active"
                ? "text-background"
                : "text-primary/60 hover:text-primary"
            }`}
          >
            Active Leaves (Out)
          </button>
          <motion.div
            layout
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-primary rounded-full z-0"
            animate={{
              left: viewMode === "pending" ? "4px" : "calc(50% + 2px)",
            }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative mb-12 group"
        >
          <Search
            className="absolute left-6 top-1/2 -translate-y-1/2 text-primary/30 group-focus-within:text-primary transition-colors"
            size={20}
          />
          <input
            type="text"
            placeholder="Search by student name or roll number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface/40 backdrop-blur-xl border border-primary/10 rounded-full pl-16 pr-6 py-5 sm:py-6 text-sm text-foreground focus:outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-primary/30 font-bold shadow-lg shadow-black/5"
          />
        </motion.div>

        {/* Queue */}
        <div className="space-y-6 flex-1">
          <AnimatePresence mode="popLayout">
            {filteredRequests.length > 0 ? (
              filteredRequests.map((req, idx) => {
                return (
                  <motion.div
                    key={req.$id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                    transition={{
                      delay: idx * 0.05,
                      type: "spring",
                      stiffness: 300,
                      damping: 25,
                    }}
                    className="bg-surface/80 backdrop-blur-md border border-primary/10 rounded-[2.5rem] sm:rounded-[3rem] relative overflow-hidden group hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-300"
                  >
                    <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-bl-[100px] pointer-events-none" />

                    {/* Student Header - Always Visible & Clickable */}
                    <div
                      className="p-6 sm:p-8 cursor-pointer relative z-10 flex justify-between items-start"
                      onClick={() => toggleExpand(req.$id)}
                    >
                      <div className="flex gap-4">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-black text-lg border border-primary/10 shadow-inner shrink-0">
                          {req.student_name?.[0] || "S"}
                        </div>
                        <div>
                          <h3 className="text-foreground font-black text-lg sm:text-xl">
                            {req.student_name || "Student"}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-primary/60 text-[10px] sm:text-xs font-black tracking-widest uppercase">
                              {req.roll_no}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[9px] sm:text-[10px] font-black uppercase tracking-widest ${
                            viewMode === "pending"
                              ? "bg-primary/5 border-primary/10 text-primary"
                              : "bg-green-500/10 border-green-500/20 text-green-500"
                          }`}
                        >
                          <Clock size={12} />{" "}
                          {viewMode === "pending"
                            ? "Pending Faculty Review"
                            : "Approved & Currently Out"}
                        </div>
                        <p className="text-[9px] text-primary/40 font-black tracking-widest uppercase">
                          {expandedRequests[req.$id]
                            ? "Click to collapse"
                            : "Click to view details"}
                        </p>
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedRequests[req.$id] && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-6 sm:px-8 sm:pb-8 space-y-6">
                            {/* Reason & Place */}
                            <div className="bg-primary/5 border border-primary/10 p-5 sm:p-6 rounded-2xl sm:rounded-3xl relative overflow-hidden relative z-10">
                              <div className="absolute top-0 right-0 p-4 opacity-5">
                                <ClipboardCheck size={40} />
                              </div>
                              <p className="text-[10px] text-primary/50 uppercase font-black tracking-widest mb-2 flex items-center gap-2">
                                Reason for Leave
                              </p>
                              <p className="text-sm sm:text-base text-foreground/80 leading-relaxed font-medium italic relative z-10">
                                "{req.reason}"
                              </p>
                            </div>

                            {req.place_of_visit && (
                              <div className="bg-primary/5 border border-primary/10 p-5 sm:p-6 rounded-2xl sm:rounded-3xl flex items-center gap-4 relative z-10">
                                <div className="p-3 bg-primary/10 rounded-xl text-primary border border-primary/10 shrink-0">
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="18"
                                    height="18"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                </div>
                                <div>
                                  <p className="text-[10px] text-primary/50 uppercase font-black tracking-widest mb-1">
                                    Place of Visit
                                  </p>
                                  <p className="text-sm text-foreground font-bold">
                                    {req.place_of_visit}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Dates Section */}
                            <div className="bg-background/50 rounded-3xl p-5 sm:p-6 border border-primary/5 relative z-10">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                <div className="flex items-center justify-between sm:justify-start sm:gap-6">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-primary/10 rounded-xl text-primary border border-primary/10">
                                      <Calendar size={16} />
                                    </div>
                                    <div>
                                      <p className="text-[8px] sm:text-[9px] font-black text-primary/40 uppercase tracking-widest">
                                        Departure
                                      </p>
                                      <p className="text-xs sm:text-sm text-foreground font-bold">
                                        {parseSafeDate(req.proposed_exit_date)}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-primary/20 font-black px-2 sm:px-0">
                                    →
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-right sm:text-left">
                                      <p className="text-[8px] sm:text-[9px] font-black text-primary/40 uppercase tracking-widest">
                                        Return
                                      </p>
                                      <p className="text-xs sm:text-sm text-foreground font-bold">
                                        {parseSafeDate(req.proposed_in_date)}
                                      </p>
                                    </div>
                                    <div className="hidden sm:flex p-2.5 bg-primary/10 rounded-xl text-primary border border-primary/10">
                                      <RefreshCw size={16} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-2 relative z-10">
                              {req.student_phone &&
                                (revealedPhones[req.$id] ? (
                                  <a
                                    href={`tel:${req.student_phone}`}
                                    className="flex-[1.5] py-4 rounded-2xl bg-surface border border-primary/20 text-primary text-[10px] font-black uppercase tracking-[0.1em] hover:bg-primary/5 hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                  >
                                    <Phone size={14} />
                                    {req.student_phone} (Call)
                                  </a>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setRevealedPhones((prev) => ({
                                        ...prev,
                                        [req.$id]: true,
                                      }));
                                    }}
                                    className="flex-1 py-4 rounded-2xl bg-surface border border-primary/10 text-primary/60 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-primary/5 hover:text-primary transition-all flex items-center justify-center gap-2"
                                  >
                                    <Phone size={14} />
                                    Show Number
                                  </button>
                                ))}
                              {viewMode === "pending" ? (
                                <>
                                  <button
                                    disabled={isActioning === req.$id}
                                    onClick={() =>
                                      handleAction(req.$id, "reject")
                                    }
                                    className="flex-1 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
                                  >
                                    {isActioning === req.$id ? (
                                      <RefreshCw
                                        size={14}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <XCircle size={14} />
                                    )}
                                    Reject
                                  </button>

                                  <button
                                    disabled={isActioning === req.$id}
                                    onClick={() =>
                                      handleAction(req.$id, "approve")
                                    }
                                    className="flex-[2] py-4 rounded-2xl bg-primary border border-primary text-background text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 grow disabled:opacity-50 disabled:hover:scale-100"
                                  >
                                    {isActioning === req.$id ? (
                                      <RefreshCw
                                        size={14}
                                        className="animate-spin"
                                      />
                                    ) : (
                                      <UserCheck size={14} />
                                    )}
                                    Approve Leave
                                  </button>
                                </>
                              ) : (
                                <div className="flex-1 py-4 rounded-2xl bg-primary/5 border border-primary/10 text-primary text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2">
                                  <Clock size={14} />
                                  Departed at:{" "}
                                  {parseSafeDate(req.exit_date_time || "")}
                                </div>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-primary/20 space-y-4">
                <ClipboardCheck size={48} strokeWidth={1} />
                <p className="text-xs font-black uppercase tracking-widest">
                  Your queue is empty
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </GradientBackground>
  );
}


