"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Home,
  Calendar,
  Activity,
  ChevronDown,
  UserCheck,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { GradientBackground } from "@/components/GradientBackground";
import { Navigation } from "@/components/Navigation";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useRouter } from "next/navigation";
import { databases } from "@/lib/appwrite";
import { Query } from "appwrite";
import { DB_ID, COLLECTIONS } from "@/lib/constants";
import Link from "next/link";

export default function MyLeavesPage() {
  const {
    user,
    studentData,
    isLoading: authLoading,
    isAdmin,
    isKiosk,
  } = useAuth();
  const router = useRouter();

  const [leaves, setLeaves] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedRequests, setExpandedRequests] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (authLoading) return;

    if (!user || isAdmin || isKiosk) {
      router.push("/");
      return;
    }

    if (studentData) {
      fetchLeaves();
    }
  }, [authLoading, user, studentData, isAdmin, isKiosk]);

  const fetchLeaves = async () => {
    if (!studentData?.$id) return;
    setIsLoading(true);
    try {
      // Fetch active leaves
      const activeResponse = await databases.listDocuments(
        DB_ID,
        COLLECTIONS.LEAVE,
        [Query.equal("roll_no", studentData.$id), Query.limit(50)],
      );

      // Fetch archive separately — don't fail if archive has issues
      let archiveDocs: any[] = [];
      try {
        const archiveResponse = await databases.listDocuments(
          DB_ID,
          COLLECTIONS.LEAVE_ARCHIVE,
          [Query.equal("roll_no", studentData.$id), Query.limit(50)],
        );
        archiveDocs = archiveResponse.documents;
      } catch (archiveError) {
        console.warn(
          "Could not fetch leave archive (check permissions/index):",
          archiveError,
        );
      }

      const allLeaves = [...activeResponse.documents, ...archiveDocs];
      allLeaves.sort(
        (a, b) =>
          new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime(),
      );

      setLeaves(allLeaves);
    } catch (error) {
      console.error("Failed to fetch leaves:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedRequests((prev) => ({ ...prev, [id]: !prev[id] }));
  };

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

  if (authLoading || isLoading) {
    return (
      <GradientBackground>
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator />
        </div>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <Navigation />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 pt-24 sm:pt-32 pb-12">
        <header className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="p-2 hover:bg-primary/5 rounded-full transition-all text-primary/40 hover:text-primary shrink-0"
          >
            <ArrowLeft size={24} />
          </Link>
          <div className="text-center flex-1 mx-4">
            <h1 className="text-xl sm:text-2xl font-bold text-primary tracking-[0.2em] uppercase">
              My Leaves
            </h1>
            <p className="text-primary/60 text-[10px] font-bold uppercase tracking-widest mt-1">
              Application History & Approvals
            </p>
          </div>
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary border border-primary/10 shrink-0 shadow-inner">
            <Activity size={20} />
          </div>
        </header>

        <div className="space-y-6">
          {leaves.length === 0 ? (
            <div className="bg-surface/50 border border-primary/5 rounded-[3rem] p-12 text-center shadow-inner">
              <Home className="mx-auto text-primary/10 mb-4" size={48} />
              <p className="text-primary/40 font-bold uppercase tracking-widest text-sm">
                No Leave History Found
              </p>
            </div>
          ) : (
            leaves.map((leave, idx) => {
              const isApproved = leave.status === "approved";
              const isRejected =
                leave.status === "rejected" ||
                leave.status === "rejected_caretaker" ||
                leave.status === "rejected_faculty";
              const isPending = !isApproved && !isRejected;

              const caretakerStatusStr =
                leave.caretaker_approval === true
                  ? "Approved"
                  : leave.status === "rejected_caretaker"
                    ? "Rejected"
                    : "Pending";
              const facultyStatusStr =
                leave.faculty_approval === true
                  ? "Approved"
                  : leave.status === "rejected_faculty"
                    ? "Rejected"
                    : "Pending";

              return (
                <motion.div
                  key={leave.$id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: idx * 0.05,
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                  }}
                  className="bg-surface/80 backdrop-blur-md border border-primary/10 rounded-[2.5rem] relative overflow-hidden group hover:border-primary/20 hover:shadow-xl transition-all duration-300"
                >
                  {/* Top Bar / Header */}
                  <div
                    className="p-6 cursor-pointer relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    onClick={() => toggleExpand(leave.$id)}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 border shadow-inner ${
                          isApproved
                            ? "bg-success/10 text-success border-success/20"
                            : isRejected
                              ? "bg-red-500/10 text-red-600 border-red-500/20"
                              : "bg-secondary/10 text-secondary border-secondary/20"
                        }`}
                      >
                        {isApproved ? (
                          <CheckCircle2 size={24} />
                        ) : isRejected ? (
                          <XCircle size={24} />
                        ) : (
                          <Clock size={24} />
                        )}
                      </div>
                      <div>
                        <p className="text-foreground font-black text-base sm:text-lg">
                          {isApproved
                            ? "Approved"
                            : isRejected
                              ? "Rejected"
                              : "Pending Review"}
                        </p>
                        <p className="text-primary/60 text-[9px] sm:text-[10px] font-black tracking-widest uppercase mt-1">
                          Applied:{" "}
                          {new Date(leave.$createdAt).toLocaleDateString(
                            "en-IN",
                            {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            },
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                      <div className="flex items-center gap-2">
                        {leave.exit_date_time && !leave.in_date_time && (
                          <span className="px-3 py-1 bg-secondary/10 text-secondary border border-secondary/20 text-[9px] font-black uppercase tracking-widest rounded-full">
                            Currently Out
                          </span>
                        )}
                        {leave.exit_date_time && leave.in_date_time && (
                          <span className="px-3 py-1 bg-primary/10 text-primary border border-primary/20 text-[9px] font-black uppercase tracking-widest rounded-full">
                            Completed
                          </span>
                        )}
                      </div>
                      <ChevronDown
                        size={20}
                        className={`text-primary/60 transition-transform duration-300 ${
                          expandedRequests[leave.$id] ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </div>

                  <AnimatePresence>
                    {expandedRequests[leave.$id] && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-6 space-y-6">
                          <div className="h-px w-full bg-gradient-to-r from-transparent via-primary/10 to-transparent" />

                          {/* Reason */}
                          <div className="bg-primary/5 border border-primary/10 p-5 rounded-3xl">
                            <p className="text-[10px] text-primary/60 uppercase font-black tracking-widest mb-2">
                              Reason for Leave
                            </p>
                            <p className="text-sm text-foreground/80 leading-relaxed font-medium italic">
                              "{leave.reason}"
                            </p>
                          </div>

                          {leave.place_of_visit && (
                            <div className="bg-primary/5 border border-primary/10 p-5 rounded-3xl flex items-center gap-4">
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
                                <p className="text-[10px] text-primary/60 uppercase font-black tracking-widest mb-1">
                                  Place of Visit
                                </p>
                                <p className="text-sm text-foreground font-bold">
                                  {leave.place_of_visit}
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Dates */}
                          <div className="bg-background/50 rounded-3xl p-5 border border-primary/5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-secondary/10 rounded-xl text-secondary border border-secondary/10">
                                  <Calendar size={16} />
                                </div>
                                <div>
                                  <p className="text-[9px] font-black text-primary/60 uppercase tracking-widest">
                                    Departure
                                  </p>
                                  <p className="text-sm text-foreground font-bold">
                                    {parseSafeDate(leave.proposed_exit_date)}
                                  </p>
                                </div>
                              </div>
                              <div className="text-primary/20 font-black px-2">
                                →
                              </div>
                              <div className="flex items-center gap-3 text-right">
                                <div>
                                  <p className="text-[9px] font-black text-primary/60 uppercase tracking-widest">
                                    Return
                                  </p>
                                  <p className="text-sm text-foreground font-bold">
                                    {parseSafeDate(leave.proposed_in_date)}
                                  </p>
                                </div>
                                <div className="p-2.5 bg-primary/10 rounded-xl text-primary border border-primary/10">
                                  <Calendar size={16} />
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Detailed Approvals */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div
                              className={`p-4 rounded-2xl border flex items-center justify-between ${
                                caretakerStatusStr === "Approved"
                                  ? "bg-success/5 border-success/20"
                                  : caretakerStatusStr === "Rejected"
                                    ? "bg-red-500/5 border-red-500/20"
                                    : "bg-surface border-primary/10"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <ShieldCheck
                                  size={18}
                                  className={
                                    caretakerStatusStr === "Approved"
                                      ? "text-success"
                                      : caretakerStatusStr === "Rejected"
                                        ? "text-red-600"
                                        : "text-primary/60"
                                  }
                                />
                                <div>
                                  <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">
                                    Caretaker
                                  </p>
                                  <p
                                    className={`text-xs font-bold uppercase ${
                                      caretakerStatusStr === "Approved"
                                        ? "text-success"
                                        : caretakerStatusStr === "Rejected"
                                          ? "text-red-600"
                                          : "text-foreground"
                                    }`}
                                  >
                                    {caretakerStatusStr}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {leave.requires_faculty && (
                              <div
                                className={`p-4 rounded-2xl border flex items-center justify-between ${
                                  facultyStatusStr === "Approved"
                                    ? "bg-success/5 border-success/20"
                                    : facultyStatusStr === "Rejected"
                                      ? "bg-red-500/5 border-red-500/20"
                                      : "bg-surface border-primary/10"
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <UserCheck
                                    size={18}
                                    className={
                                      facultyStatusStr === "Approved"
                                        ? "text-success"
                                        : facultyStatusStr === "Rejected"
                                          ? "text-red-600"
                                          : "text-primary/60"
                                    }
                                  />
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">
                                      Faculty Advisor
                                    </p>
                                    <p
                                      className={`text-xs font-bold uppercase ${
                                        facultyStatusStr === "Approved"
                                          ? "text-success"
                                          : facultyStatusStr === "Rejected"
                                            ? "text-red-600"
                                            : "text-foreground"
                                      }`}
                                    >
                                      {facultyStatusStr}
                                    </p>
                                  </div>
                                </div>
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
          )}
        </div>
      </main>
    </GradientBackground>
  );
}
