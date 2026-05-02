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
import { databases, tablesDB, fetchAllRows, Query, ID } from "@/lib/appwrite";
import { DB_ID, COLLECTIONS, API_SECRET } from "@/lib/constants";
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
  const [extendingLeaveId, setExtendingLeaveId] = useState<string | null>(null);
  const [newReturnDate, setNewReturnDate] = useState<string>("");
  const [isExtendingLoading, setIsExtendingLoading] = useState<boolean>(false);
  const [extensionStatus, setExtensionStatus] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;

    if (!user || isAdmin || isKiosk) {
      router.push("/");
      return;
    }

    const profileId = user.email ? user.email.split("@")[0].toUpperCase() : "";
    const isStudent = /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}$/.test(profileId);
    if (!isStudent) {
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
      const activeLeaves = await fetchAllRows(DB_ID, COLLECTIONS.LEAVE, [
        Query.equal("roll_no", studentData.$id)
      ]);

      const now = new Date();
      const oneDayInMs = 24 * 60 * 60 * 1000;
      const unexpiredLeaves: any[] = [];

      for (const req of activeLeaves as any[]) {
        if (!req.exit_date_time && req.proposed_in_date) {
          const proposedIn = new Date(req.proposed_in_date);
          if (now.getTime() - proposedIn.getTime() > oneDayInMs) {
            try {
              const { $id, $createdAt, $updatedAt, $databaseId, $collectionId, $permissions, ...cleanData } = req;
              await tablesDB.createRow({
                databaseId: DB_ID,
                tableId: COLLECTIONS.LEAVE_ARCHIVE,
                rowId: ID.unique(),
                data: {
                  ...cleanData,
                  status: "expired",
                  mail_sent: req.mail_sent ?? false,
                  faculty_approval: req.faculty_approval ?? false,
                  caretaker_approval: req.caretaker_approval ?? false,
                  is_extended: req.is_extended ?? false,
                  caretaker_id: req.caretaker_id || "N/A",
                  faculty_id: req.faculty_id || "N/A",
                }
              });
              await tablesDB.deleteRow({
                databaseId: DB_ID,
                tableId: COLLECTIONS.LEAVE,
                rowId: req.$id,
              });
            } catch (err) {
              console.error("Auto-archiving leave failed", err);
            }
            continue;
          }
        }
        unexpiredLeaves.push(req);
      }

      const allLeaves = [...unexpiredLeaves];
      allLeaves.sort(
        (a: any, b: any) =>
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

  const handleExtendLeave = async (leave: any) => {
    if (!newReturnDate) return;
    setIsExtendingLoading(true);
    setExtensionStatus("Extending leave...");
    try {
      await tablesDB.updateRow({
        databaseId: DB_ID,
        tableId: COLLECTIONS.LEAVE,
        rowId: leave.$id,
        data: {
          proposed_in_date: newReturnDate,
          is_extended: true,
        },
      });

      setLeaves((prev) =>
        prev.map((l) =>
          l.$id === leave.$id
            ? { ...l, proposed_in_date: newReturnDate, is_extended: true }
            : l
        )
      );

      const facultyEmails = leave.faculty_id
        ? leave.faculty_id.split(/[ ,]+/).map((e: string) => e.trim()).filter(Boolean)
        : [];

      if (facultyEmails.length > 0) {
        setExtensionStatus("Notifying advisors...");
      }

      for (const fEmail of facultyEmails) {
        try {
          await fetch("/api/send-email", {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "X-API-Secret": API_SECRET
            },
            body: JSON.stringify({
              type: "extension",
              advisorEmail: fEmail,
              studentName: studentData?.name || user?.name || "Unknown",
              studentRollNo: studentData?.$id || "N/A",
              studentEmail: user?.email || "N/A",
              studentPhone: studentData?.phone_no || "N/A",
              newInDate: parseSafeDate(newReturnDate),
            }),
          });
        } catch (emailErr) {
          console.error("Failed to send extension email to advisor", emailErr);
        }
      }

      setExtensionStatus("Leave extended successfully!");
      setTimeout(() => {
        setExtendingLeaveId(null);
        setNewReturnDate("");
        setExtensionStatus(null);
      }, 2000);
    } catch (err: any) {
      console.error("Failed to extend leave:", err);
      setExtensionStatus(err.message || "An error occurred while extending the leave");
    } finally {
      setIsExtendingLoading(false);
    }
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
      return date.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
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

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 pt-32 sm:pt-40 pb-12">
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
                              timeZone: "Asia/Kolkata",
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

                          {!leave.in_date_time && (
                            <div className="border border-primary/10 rounded-2xl p-4 bg-primary/5 space-y-3 mt-4">
                              <p className="text-[10px] font-black uppercase tracking-widest text-primary/60">
                                Extend Leave Feature
                              </p>
                              {extendingLeaveId === leave.$id ? (
                                <div className="space-y-3 animate-fadeIn">
                                  <div>
                                    <label className="text-[9px] font-bold text-primary/40 uppercase tracking-widest block mb-1">
                                      New Return Date & Time
                                    </label>
                                    <input
                                      type="datetime-local"
                                      value={newReturnDate}
                                      onChange={(e) => setNewReturnDate(e.target.value)}
                                      className="w-full bg-background border border-primary/10 rounded-xl h-11 px-4 text-xs font-bold text-primary focus:border-secondary transition-all"
                                    />
                                  </div>
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleExtendLeave(leave)}
                                      disabled={isExtendingLoading || !newReturnDate}
                                      className="flex-1 bg-primary text-background h-11 rounded-xl text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                      {extensionStatus || "Confirm Extension"}
                                    </button>
                                    <button
                                      onClick={() => {
                                        setExtendingLeaveId(null);
                                        setNewReturnDate("");
                                      }}
                                      disabled={isExtendingLoading}
                                      className="px-4 border border-primary/10 text-primary/60 h-11 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 active:scale-[0.98] transition-all"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setExtendingLeaveId(leave.$id);
                                    const currDate = new Date(leave.proposed_in_date);
                                    currDate.setDate(currDate.getDate() + 1);
                                    setNewReturnDate(currDate.toISOString().slice(0, 16));
                                  }}
                                  className="w-full h-11 border border-secondary/40 hover:bg-secondary/5 text-secondary rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all hover:scale-[0.99]"
                                >
                                  + Extend Return Date
                                </button>
                              )}
                              {leave.is_extended && (
                                <p className="text-[9px] text-secondary font-bold uppercase tracking-wider italic text-center pt-1">
                                  * This leave was extended previously.
                                </p>
                              )}
                            </div>
                          )}
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
