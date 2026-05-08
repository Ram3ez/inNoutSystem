"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ClipboardCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  RefreshCw,
  ShieldCheck,
  ChevronLeft,
  Search,
  Phone,
  Check,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { databases, tablesDB, fetchAllRows, Query, ID } from "@/lib/appwrite";
import { DB_ID, COLLECTIONS } from "@/lib/constants";
import { GradientBackground } from "@/components/GradientBackground";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { Navigation } from "@/components/Navigation";
import { useRouter } from "next/navigation";
import { useLoading } from "@/context/LoadingContext";

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
  caretaker_approval: boolean;
  faculty_approval: boolean;
  student_name?: string;
  student_phone?: number;
  mail_sent?: boolean;
}

export default function CaretakerDashboard() {
  const { user, isLoading: authLoading, isCaretaker, isRegistrationRequired } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActioning, setIsActioning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Local state for working day overrides (keyed by requestId)
  const [workingDayOverrides, setWorkingDayOverrides] = useState<
    Record<string, boolean>
  >({});
  const [expandedRequests, setExpandedRequests] = useState<
    Record<string, boolean>
  >({});
  const [revealedPhones, setRevealedPhones] = useState<Record<string, boolean>>(
    {},
  );
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const router = useRouter();
  const { startLoading } = useLoading();

  useEffect(() => {
    if (!authLoading && (!isCaretaker || isRegistrationRequired)) {
      router.push("/");
    } else if (user) {
      fetchRequests();
    }
  }, [authLoading, isCaretaker, isRegistrationRequired, user]);

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

  const isWeekend = (dateString: string) => {
    if (!dateString) return false;
    let date = new Date(dateString);
    if (isNaN(date.getTime())) {
      const cleanedDateString = dateString.replace(/\.$/, "");
      date = new Date(cleanedDateString);
    }
    if (isNaN(date.getTime())) return false;
    const day = date.getDay();
    return day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
  };

  const fetchRequests = async () => {
    if (!user?.email) return;
    setIsLoading(true);
    try {
      // Fetch all pending requests for caretakers
      // We filter by email in the frontend to support multiple caretakers per assignment
      const allPending = await fetchAllRows(DB_ID, COLLECTIONS.LEAVE, [
        Query.equal("status", "pending_caretaker")
      ]);

      const isMyRequest = (req: any) => {
        if (!req.caretaker_id) return false;
        // Support exact match or space/comma separated list
        const approvers = req.caretaker_id.split(/[ ,]+/).map((e: string) => e.toLowerCase().trim());
        return approvers.includes(user.email.toLowerCase().trim());
      };

      const now = new Date();
      const oneDayInMs = 24 * 60 * 60 * 1000;

      const filterExpired = async (docs: any[]) => {
        const kept: any[] = [];
        for (const req of docs) {
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
          kept.push(req);
        }
        return kept;
      };

      const myPendingRequests = await filterExpired(allPending.filter(isMyRequest));

      // Enrich with student details using batched queries for scalability
      const rollNos = Array.from(new Set(myPendingRequests.map((r: any) => r.roll_no)));
      const studentMap = new Map<string, any>();
      
      if (rollNos.length > 0) {
        for (let i = 0; i < rollNos.length; i += 100) {
          const batch = rollNos.slice(i, i + 100);
          const students = await fetchAllRows<any>(DB_ID, COLLECTIONS.STUDENTS, [
            Query.equal("$id", batch)
          ]);
          students.forEach(s => studentMap.set(s.$id, s));
        }
      }

      const enriched = myPendingRequests.map((doc) => {
        const leaveDoc = doc as unknown as LeaveRequest;
        const student = studentMap.get(leaveDoc.roll_no);
        return {
          ...leaveDoc,
          student_name: student?.name || "Unknown",
          student_phone: student?.phone_no,
        } as LeaveRequest;
      });

      setRequests(enriched);
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
      let nextStatus = "";
      const request = requests.find((r) => r.$id === requestId);
      if (!request) return;

      if (action === "approve") {
        // Use requires_faculty from the leave request (computed by student over full date range)
        // Allow caretaker to manually override via UI toggle
        const needsFaculty =
          workingDayOverrides[requestId] !== undefined
            ? workingDayOverrides[requestId]
            : request.requires_faculty;
        nextStatus = needsFaculty ? "pending_faculty" : "approved";

        /*
        await databases.updateDocument({
          databaseId: DB_ID,
          collectionId: COLLECTIONS.LEAVE,
          documentId: requestId,
          data: {
            status: nextStatus,
            caretaker_approval: true,
            requires_faculty: needsFaculty,
            faculty_approval: false,
          },
        });
        */
        await tablesDB.updateRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.LEAVE,
          rowId: requestId,
          data: {
            status: nextStatus,
            caretaker_approval: true,
            requires_faculty: needsFaculty,
            faculty_approval: false,
          },
        });
      } else {
        nextStatus = "rejected_caretaker";

        const {
          $id,
          $tableId,
          $databaseId,
          $createdAt,
          $updatedAt,
          $permissions,
          student_name,
          student_phone,
          parent_name,
          parent_phone,
          parent_email,
          ...archiveData
        } = request as any;

        archiveData.status = nextStatus;
        archiveData.caretaker_approval = false;
        archiveData.faculty_approval = false;
        archiveData.mail_sent = request.mail_sent ?? false;

        /*
        await databases.createDocument({
          databaseId: DB_ID,
          collectionId: COLLECTIONS.LEAVE_ARCHIVE,
          documentId: ID.unique(),
          data: archiveData
        });
        await databases.deleteDocument({
          databaseId: DB_ID,
          collectionId: COLLECTIONS.LEAVE,
          documentId: requestId
        });
        */
        await tablesDB.createRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.LEAVE_ARCHIVE,
          rowId: ID.unique(),
          data: archiveData
        });
        await tablesDB.deleteRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.LEAVE,
          rowId: requestId
        });
      }

      // Remove from local list
      setRequests((prev) => prev.filter((r) => r.$id !== requestId));
    } catch (error) {
      console.error("Action failed:", error);
      setNotification({ message: "Failed to process request. Please try again.", type: "error" });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setIsActioning(null);
    }
  };

  const toggleWorkingDay = async (requestId: string, currentVal: boolean) => {
    const newVal = !currentVal;
    setWorkingDayOverrides((prev) => ({
      ...prev,
      [requestId]: newVal,
    }));

    try {
      /*
      await databases.updateDocument(DB_ID, COLLECTIONS.LEAVE, requestId, {
        requires_faculty: newVal,
        faculty_approval: false,
      });
      */
      await tablesDB.updateRow({
        databaseId: DB_ID,
        tableId: COLLECTIONS.LEAVE,
        rowId: requestId,
        data: {
          requires_faculty: newVal,
          faculty_approval: false,
        }
      });
    } catch (error) {
      console.error("Failed to update faculty requirement:", error);
    }
  };

  const toggleExpand = (requestId: string) => {
    setExpandedRequests((prev) => ({
      ...prev,
      [requestId]: !prev[requestId],
    }));
  };

  if (authLoading || isLoading) {
    return (
      <GradientBackground>
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator size="lg" />
        </div>
      </GradientBackground>
    );
  }

  const filteredRequests = requests.filter(
    (r) =>
      (r.roll_no || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.student_name || "").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <GradientBackground>
      <Navigation />
      <div className="w-full max-w-7xl mx-auto px-6 pt-36 sm:pt-40 pb-24 flex-1 flex flex-col">
        {/* Navigation */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="mb-8"
        >
          <button
            onClick={() => {
              startLoading();
              router.push("/");
            }}
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
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-between items-end relative z-10"
          >
            <div className="space-y-2">
              <p className="text-secondary font-black text-[10px] tracking-[0.3em] uppercase flex items-center gap-2">
                <ShieldCheck size={12} />
                Caretaker Portal
              </p>
              <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight">
                Welcome,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-secondary to-secondary/60">
                  {user?.name?.split(" ")[0]}
                </span>
              </h1>
            </div>
            <div className="hidden sm:flex px-4 py-2.5 rounded-2xl border items-center gap-2 shadow-lg backdrop-blur-md border-secondary/20 bg-secondary/10 text-secondary shadow-secondary/5">
              <ShieldCheck size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Hostel Caretaker
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
              <p className="text-primary/60 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
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
              <span className="text-xs font-black uppercase tracking-widest text-primary/70 group-hover:text-primary transition-colors">
                Sync Queue
              </span>
            </div>
          </motion.div>
        </div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="relative mb-12 group"
        >
          <Search
            className="absolute left-6 top-1/2 -translate-y-1/2 text-primary/30 group-focus-within:text-secondary transition-colors"
            size={20}
          />
          <input
            type="text"
            placeholder="Search by student name or roll number..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-surface/40 backdrop-blur-xl border border-primary/10 rounded-full pl-16 pr-6 py-5 sm:py-6 text-sm text-foreground focus:outline-none focus:border-secondary/40 focus:ring-4 focus:ring-secondary/5 transition-all placeholder:text-primary/50 font-bold shadow-lg shadow-black/5"
          />
        </motion.div>

        {/* Queue */}
        <div className="space-y-6 flex-1">
          <AnimatePresence mode="popLayout">
            {filteredRequests.length > 0 ? (
              filteredRequests.map((req, idx) => {
                const isWeekendDay = isWeekend(req.proposed_exit_date);
                const isWorkingDay =
                  workingDayOverrides[req.$id] ?? req.requires_faculty;

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
                    className="bg-surface/80 backdrop-blur-md border border-primary/10 rounded-[2.5rem] sm:rounded-[3rem] relative overflow-hidden group hover:border-secondary/30 hover:shadow-2xl hover:shadow-secondary/5 transition-all duration-300"
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
                            <p className="text-secondary text-[10px] sm:text-xs font-black tracking-widest uppercase">
                              {req.roll_no}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-[9px] sm:text-[10px] font-black text-primary uppercase tracking-widest">
                          <Clock size={12} /> Pending
                        </div>
                        <p className="text-[9px] text-primary/60 font-black tracking-widest uppercase">
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
                              <p className="text-[10px] text-primary/60 uppercase font-black tracking-widest mb-2 flex items-center gap-2">
                                Reason for Leave
                              </p>
                              <p className="text-sm sm:text-base text-foreground/80 leading-relaxed font-medium italic relative z-10">
                                "{req.reason}"
                              </p>
                            </div>

                            {req.place_of_visit && (
                              <div className="bg-primary/5 border border-primary/10 p-5 sm:p-6 rounded-2xl sm:rounded-3xl flex items-center gap-4 relative z-10">
                                <div className="p-3 bg-secondary/10 rounded-xl text-secondary border border-secondary/10 shrink-0">
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
                                    {req.place_of_visit}
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Dates & Working Day Toggle */}
                            <div className="bg-background/50 rounded-3xl p-5 sm:p-6 border border-primary/5 relative z-10">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                <div className="flex items-center justify-between sm:justify-start sm:gap-6">
                                  <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-secondary/10 rounded-xl text-secondary border border-secondary/10">
                                      <Calendar size={16} />
                                    </div>
                                    <div>
                                      <p className="text-[8px] sm:text-[9px] font-black text-primary/60 uppercase tracking-widest">
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
                                      <p className="text-[8px] sm:text-[9px] font-black text-primary/60 uppercase tracking-widest">
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

                                <div className="flex flex-row md:flex-row items-center justify-between md:justify-end gap-4 md:gap-3 pt-4 md:pt-0 border-t md:border-t-0 border-primary/5">
                                  <p className="text-[9px] font-black text-primary/80 uppercase tracking-widest">
                                    Working Day?
                                  </p>
                                  <button
                                    onClick={() =>
                                      toggleWorkingDay(req.$id, isWorkingDay)
                                    }
                                    className={`h-10 px-5 rounded-2xl border transition-all flex items-center gap-2 hover:scale-105 active:scale-95 ${isWorkingDay ? "border-primary/20 bg-primary/10 text-primary shadow-lg shadow-primary/5" : "border-secondary/20 bg-secondary/10 text-secondary shadow-lg shadow-secondary/5"}`}
                                  >
                                    {isWorkingDay ? (
                                      <Check size={14} />
                                    ) : (
                                      <XCircle size={14} />
                                    )}
                                    <span className="text-[10px] font-black uppercase tracking-widest">
                                      {isWorkingDay ? "Yes" : "No (Weekend)"}
                                    </span>
                                  </button>
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
                              <button
                                disabled={isActioning === req.$id}
                                onClick={() => handleAction(req.$id, "reject")}
                                className="flex-1 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:hover:scale-100"
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
                                onClick={() => handleAction(req.$id, "approve")}
                                className="flex-[2] py-4 rounded-2xl bg-success border border-success text-background text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 hover:shadow-lg hover:shadow-success/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 grow disabled:opacity-50 disabled:hover:scale-100"
                              >
                                {isActioning === req.$id ? (
                                  <RefreshCw
                                    size={14}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <CheckCircle2 size={14} />
                                )}
                                {isWorkingDay
                                  ? "Approve & Forward"
                                  : "Approve Leave"}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-primary/40 space-y-4">
                <ClipboardCheck size={48} strokeWidth={1} />
                <p className="text-xs font-black uppercase tracking-widest">
                  Your queue is empty
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
            className="fixed bottom-8 left-0 right-0 z-[100] flex justify-center px-6 pointer-events-none"
          >
            <div
              className={`
                flex items-center gap-3 px-6 py-4 rounded-2xl backdrop-blur-xl border shadow-2xl pointer-events-auto
                ${
                  notification.type === "success"
                    ? "bg-success/10 border-success/20 text-success shadow-success/10"
                    : "bg-red-500/10 border-red-500/20 text-red-500 shadow-red-500/10"
                }
              `}
            >
              {notification.type === "success" ? (
                <CheckCircle2 size={20} />
              ) : (
                <XCircle size={20} />
              )}
              <p className="text-sm font-black tracking-wide">
                {notification.message}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </GradientBackground>
  );
}
