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
  CheckCircle2,
  Mail,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { databases, tablesDB, fetchAllRows, Query, ID } from "@/lib/appwrite";
import { DB_ID, COLLECTIONS, API_SECRET } from "@/lib/constants";
import { GradientBackground } from "@/components/GradientBackground";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { Navigation } from "@/components/Navigation";
import { useRouter } from "next/navigation";
import { useLoading } from "@/context/LoadingContext";
import { logTransaction } from "@/lib/auditLogger";

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
  parent_name?: string;
  parent_phone?: number | string;
  parent_email?: string;
  exit_date_time?: string;
  in_date_time?: string;
  mail_sent?: boolean;
  is_extended?: boolean;
}

export default function FacultyDashboard() {
  const {
    user,
    isLoading: authLoading,
    isFaculty,
    isRegistrationRequired,
    staffData,
  } = useAuth();
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [activeLeaves, setActiveLeaves] = useState<LeaveRequest[]>([]);
  const [overdueLeaves, setOverdueLeaves] = useState<LeaveRequest[]>([]);
  const [parentRequests, setParentRequests] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"pending" | "active" | "parents" | "overdue">(
    "pending",
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isActioning, setIsActioning] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRequests, setExpandedRequests] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, viewMode]);
  const [revealedPhones, setRevealedPhones] = useState<Record<string, boolean>>(
    {},
  );
  const [isSendingEmail, setIsSendingEmail] = useState<Record<string, boolean>>(
    {},
  );
  const [notification, setNotification] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const router = useRouter();
  const { startLoading } = useLoading();

  useEffect(() => {
    if (!authLoading && (!isFaculty || isRegistrationRequired)) {
      router.push("/");
    } else if (user) {
      fetchRequests();
    }
  }, [authLoading, isFaculty, isRegistrationRequired, user]);

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

  const handleEmailParent = async (req: LeaveRequest) => {
    if (!req.parent_email) return;

    setIsSendingEmail((prev) => ({ ...prev, [req.$id]: true }));
    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Secret": API_SECRET,
        },
        body: JSON.stringify({
          parentEmail: req.parent_email,
          parentName: req.parent_name,
          studentName: req.student_name,
          reason: req.reason,
          place: req.place_of_visit,
          dates: `${parseSafeDate(req.proposed_exit_date)} to ${parseSafeDate(req.proposed_in_date)}`,
          advisorName: user?.name,
          advisorEmail: user?.email,
          advisorPhone: staffData?.phone_no || "",
        }),
      });

      const data = await response.json();
      if (data.success) {
        setNotification({
          message: "Email sent to parent successfully via Direct SMTP!",
          type: "success",
        });
        try {
          // Update the Leave row in the Appwrite database
          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLLECTIONS.LEAVE,
            rowId: req.$id,
            data: {
              mail_sent: true,
            },
          });

          // Update local component state
          setRequests(prev => prev.map(r => r.$id === req.$id ? { ...r, mail_sent: true } : r));
          setActiveLeaves(prev => prev.map(r => r.$id === req.$id ? { ...r, mail_sent: true } : r));
        } catch (dbErr) {
          console.error("Failed to update mail_sent in DB:", dbErr);
        }
      } else {
        setNotification({
          message:
            data.error || data.message || "Failed to send email to parent.",
          type: "error",
        });
      }
    } catch (err: any) {
      console.error("Error calling send-email API:", err);
      setNotification({
        message: "An unexpected error occurred while sending email.",
        type: "error",
      });
    } finally {
      setIsSendingEmail((prev) => ({ ...prev, [req.$id]: false }));
      // Automatically dismiss the notification after 5 seconds
      setTimeout(() => setNotification(null), 5000);
    }
  };

  const fetchRequests = async () => {
    if (!user?.email) return;
    setIsLoading(true);
    try {
      // Fetch all relevant data concurrently to minimize network waterfalls.
      // - Pending leaves waiting for faculty approval
      // - Active leaves (already approved)
      // - Students waiting for parent contact verification
      // - Faculty assignments matching the current logged-in user
      const [
        pendingRows,
        activeRows,
        allPendingStudents,
        myFacultyAssignments,
      ] = await Promise.all([
        fetchAllRows(DB_ID, COLLECTIONS.LEAVE, [
          Query.equal("status", "pending_faculty"),
        ]),
        fetchAllRows(DB_ID, COLLECTIONS.LEAVE, [
          Query.equal("status", "approved"),
        ]),
        fetchAllRows(DB_ID, COLLECTIONS.STUDENTS, [
          Query.equal("parent_verification_status", "pending_approval"),
        ]),
        fetchAllRows(DB_ID, COLLECTIONS.FACULTY, [
          Query.equal("email", user.email),
        ]),
      ]);

      // Filters leave requests to only show those where the current faculty
      // is listed as an approver in the comma/space separated `faculty_id` string.
      const isMyRequest = (req: any) => {
        if (!req.faculty_id) return false;
        const approvers = req.faculty_id
          .split(/[ ,]+/)
          .map((e: string) => e.toLowerCase().trim());
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

      const myPending = await filterExpired(pendingRows.filter(isMyRequest));
      const myActive = await filterExpired(activeRows.filter(isMyRequest));

      const enrichDocs = async (docs: any[]) => {
        const rollNos = Array.from(new Set(docs.map((r: any) => r.roll_no)));
        const studentMap = new Map<string, any>();

        if (rollNos.length > 0) {
          for (let i = 0; i < rollNos.length; i += 100) {
            const batch = rollNos.slice(i, i + 100);
            const students = await fetchAllRows<any>(
              DB_ID,
              COLLECTIONS.STUDENTS,
              [Query.equal("$id", batch)],
            );
            students.forEach((s) => studentMap.set(s.$id, s));
          }
        }

        return docs.map((doc) => {
          const leaveDoc = doc as unknown as LeaveRequest;
          const student = studentMap.get(leaveDoc.roll_no);
          return {
            ...leaveDoc,
            student_name: student?.name || "Unknown",
            student_phone: student?.phone_no,
            parent_name: student?.parent_name,
            parent_phone: student?.parent_phone,
            parent_email: student?.parent_email,
          } as LeaveRequest;
        });
      };

      const enrichedPending = await enrichDocs(myPending);

      const nowTime = new Date();
      const enrichedActiveAndOverdue = await enrichDocs(
        myActive.filter((d: any) => d.exit_date_time && !d.in_date_time),
      );

      const overdue = enrichedActiveAndOverdue.filter((d: any) => {
        if (d.proposed_in_date) {
          return new Date(d.proposed_in_date) < nowTime;
        }
        return false;
      });

      const normalActive = enrichedActiveAndOverdue.filter((d: any) => {
        if (d.proposed_in_date) {
          return new Date(d.proposed_in_date) >= nowTime;
        }
        return true;
      });

      const myStudents = allPendingStudents.filter((student: any) => {
        return myFacultyAssignments.some(
          (f: any) =>
            f.department === student.department &&
            f.year === parseInt(student.year),
        );
      });

      setRequests(enrichedPending);
      setActiveLeaves(normalActive);
      setOverdueLeaves(overdue);
      setParentRequests(myStudents);
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
        /*
        await databases.updateDocument({
          databaseId: DB_ID,
          collectionId: COLLECTIONS.LEAVE,
          documentId: requestId,
          data: {
            status: "approved",
            faculty_approval: true,
          }
        });
        */
        await tablesDB.updateRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.LEAVE,
          rowId: requestId,
          data: {
            status: "approved",
            faculty_approval: true,
          },
        });
      } else {
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

        archiveData.status = "rejected_faculty";
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
          data: archiveData,
        });
        await tablesDB.deleteRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.LEAVE,
          rowId: requestId,
        });
      }

      // Remove from local list
      setRequests((prev) => prev.filter((r) => r.$id !== requestId));

      await logTransaction({
        action: `LEAVE_${action.toUpperCase()}_FACULTY`,
        message: `Faculty Advisor ${user?.name} ${action}d leave for student ${request.roll_no}.`,
        userId: request.roll_no,
        metadata: { requestId, action },
        level: "medium"
      });
    } catch (error) {
      console.error("Action failed:", error);
      setNotification({ message: "Failed to process request. Please try again.", type: "error" });
      setTimeout(() => setNotification(null), 5000);
    } finally {
      setIsActioning(null);
    }
  };

  const handleParentAction = async (
    studentId: string,
    action: "approve" | "reject",
  ) => {
    setIsActioning(studentId);
    try {
      const student = parentRequests.find((s) => s.$id === studentId);
      if (!student) return;

      if (action === "approve") {
        await tablesDB.updateRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.STUDENTS,
          rowId: studentId,
          data: {
            parent_name: student.pending_parent_name,
            parent_phone: student.pending_parent_phone,
            parent_email: student.pending_parent_email,
            parent_verification_status: "verified",
          },
        });
      } else {
        await tablesDB.updateRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.STUDENTS,
          rowId: studentId,
          data: {
            parent_verification_status: "rejected",
          },
        });
      }

      setParentRequests((prev) => prev.filter((s) => s.$id !== studentId));

      await logTransaction({
        action: `PARENT_DETAIL_${action.toUpperCase()}_FACULTY`,
        message: `Faculty Advisor ${user?.name} ${action}d parent details for student ${studentId}.`,
        userId: studentId,
        metadata: { studentId, action },
        level: "medium"
      });
    } catch (error) {
      console.error("Failed to approve/reject parent details:", error);
      setNotification({ message: "Failed to process action. Please try again.", type: "error" });
      setTimeout(() => setNotification(null), 5000);
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

  const currentList =
    viewMode === "parents"
      ? parentRequests
      : viewMode === "pending"
        ? requests
        : viewMode === "overdue"
          ? overdueLeaves
          : activeLeaves;

  const filteredRequests = currentList.filter(
    (r) =>
      (r.roll_no || r.$id || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (r.student_name || r.name || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()),
  );

  const itemsPerPage = 5;
  const totalPages = Math.ceil(filteredRequests.length / itemsPerPage);
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  return (
    <GradientBackground>
      <Navigation />

      {/* Sleek, Non-Blocking Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-24 right-6 z-50 p-4 rounded-2xl border backdrop-blur-xl shadow-2xl flex items-center gap-3 min-w-[320px] max-w-md ${
              notification.type === "success"
                ? "bg-green-500/10 border-green-500/30 text-green-400 shadow-green-500/5"
                : "bg-red-500/10 border-red-500/30 text-red-400 shadow-red-500/5"
            }`}
          >
            <div
              className={`p-2 rounded-xl ${notification.type === "success" ? "bg-green-500/20" : "bg-red-500/20"}`}
            >
              {notification.type === "success" ? (
                <CheckCircle2 size={18} />
              ) : (
                <XCircle size={18} />
              )}
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-foreground/90">
                {notification.message}
              </p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="p-1 rounded-full text-foreground/40 hover:text-foreground hover:bg-white/10 transition-colors"
            >
              <XCircle size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full px-4 sm:px-8 xl:px-12 pt-36 sm:pt-40 pb-24 flex-1 flex flex-col">
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
              <p className="text-primary font-black text-[10px] tracking-[0.3em] uppercase flex items-center gap-2">
                <UserCheck size={12} />
                Faculty Portal
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
              <p className="text-primary/60 text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Action Required
              </p>
              <p className="text-4xl sm:text-5xl font-black text-foreground">
                {requests.length + parentRequests.length}
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
                Sync Data
              </span>
            </div>
          </motion.div>
        </div>

        {/* View Toggle */}
        <div className="flex bg-surface/40 backdrop-blur-xl border border-primary/10 rounded-full p-1 mb-8 relative">
          <button
            onClick={() => setViewMode("pending")}
            className={`flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-full transition-all relative z-10 flex items-center justify-center gap-2 ${
              viewMode === "pending"
                ? "text-background"
                : "text-primary/60 hover:text-primary"
            }`}
          >
            Pending
            {requests.length > 0 && (
              <span className={`min-w-[1.1rem] h-4 px-1.5 rounded-full flex items-center justify-center text-[8px] font-bold leading-none ${viewMode === "pending" ? "bg-background text-primary" : "bg-primary text-background"}`}>
                {requests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewMode("active")}
            className={`flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-full transition-all relative z-10 ${
              viewMode === "active"
                ? "text-background"
                : "text-primary/60 hover:text-primary"
            }`}
          >
            Active
          </button>
          <button
            onClick={() => setViewMode("parents")}
            className={`flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-full transition-all relative z-10 flex items-center justify-center gap-2 ${
              viewMode === "parents"
                ? "text-background"
                : "text-primary/60 hover:text-primary"
            }`}
          >
            Parents
            {parentRequests.length > 0 && (
              <span className={`min-w-[1.1rem] h-4 px-1.5 rounded-full flex items-center justify-center text-[8px] font-bold leading-none ${viewMode === "parents" ? "bg-background text-primary" : "bg-primary text-background"}`}>
                {parentRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setViewMode("overdue")}
            className={`flex-1 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest rounded-full transition-all relative z-10 ${
              viewMode === "overdue"
                ? "text-background"
                : "text-primary/60 hover:text-primary"
            }`}
          >
            Overdue
          </button>
          <motion.div
            layout
            className="absolute top-1 bottom-1 w-[calc(25%-4px)] bg-primary rounded-full z-0"
            animate={{
              left:
                viewMode === "pending"
                  ? "4px"
                  : viewMode === "active"
                    ? "calc(25% + 1px)"
                    : viewMode === "parents"
                      ? "calc(50% + 1px)"
                      : "calc(75% + 1px)",
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
            className="w-full bg-surface/40 backdrop-blur-xl border border-primary/10 rounded-full pl-16 pr-6 py-5 sm:py-6 text-sm text-foreground focus:outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/5 transition-all placeholder:text-primary/50 font-bold shadow-lg shadow-black/5"
          />
        </motion.div>

        {/* Queue */}
        <div className="space-y-6 flex-1">
          <AnimatePresence mode="popLayout">
            {paginatedRequests.length > 0 ? (
              paginatedRequests.map((req, idx) => {
                if (viewMode === "parents") {
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
                      className="bg-surface/80 backdrop-blur-md border border-primary/10 rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-8 relative overflow-hidden group hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 transition-all duration-300"
                    >
                      <div className="flex flex-col md:flex-row justify-between gap-6">
                        <div className="flex gap-4">
                          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center text-primary font-black text-lg border border-primary/10 shadow-inner shrink-0">
                            {req.name?.[0] || "S"}
                          </div>
                          <div>
                            <h3 className="text-foreground font-black text-lg sm:text-xl">
                              {req.name || "Student"}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-primary/60 text-[10px] sm:text-xs font-black tracking-widest uppercase">
                                {req.$id}
                              </p>
                              <span className="text-[9px] font-bold text-secondary uppercase tracking-widest bg-secondary/10 px-2.5 py-0.5 rounded-full border border-secondary/20">
                                {req.course} • {req.department}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Status Label */}
                        <div className="self-start">
                          <div className="bg-secondary/10 border border-secondary/20 text-secondary flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest">
                            <Clock size={12} />
                            Pending Approval
                          </div>
                        </div>
                      </div>

                      {/* Parent details grid */}
                      <div className="mt-6 border-t border-primary/10 pt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Current/Previous Data */}
                        <div className="p-4 bg-primary/[0.02] border border-primary/5 rounded-2xl space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-primary/40">
                            Current Parent Details
                          </p>
                          {req.parent_name ? (
                            <div className="space-y-1">
                              <p className="text-sm font-bold text-primary/80 uppercase">
                                {req.parent_name}
                              </p>
                              <p className="text-xs text-primary/60">
                                {req.parent_phone}
                              </p>
                              <p className="text-xs text-primary/60">
                                {req.parent_email}
                              </p>
                            </div>
                          ) : (
                            <p className="text-xs text-primary/50 font-bold italic">
                              No existing details found
                            </p>
                          )}
                        </div>

                        {/* Proposed New Details */}
                        <div className="p-4 bg-primary/5 border border-primary/10 rounded-2xl space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-secondary/60">
                            Proposed Changes
                          </p>
                          <div className="space-y-1">
                            <p className="text-sm font-black text-primary uppercase">
                              {req.pending_parent_name}
                            </p>
                            <p className="text-xs font-bold text-primary/70">
                              {req.pending_parent_phone}
                            </p>
                            <p className="text-xs font-bold text-primary/70">
                              {req.pending_parent_email}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="mt-6 flex flex-wrap gap-4 pt-4 border-t border-primary/5">
                        <button
                          disabled={isActioning === req.$id}
                          onClick={() => handleParentAction(req.$id, "approve")}
                          className="flex-1 min-w-[140px] h-12 sm:h-14 bg-primary text-background rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isActioning === req.$id ? (
                            <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <CheckCircle2 size={16} />
                              <span>Approve Details</span>
                            </>
                          )}
                        </button>
                        <button
                          disabled={isActioning === req.$id}
                          onClick={() => handleParentAction(req.$id, "reject")}
                          className="flex-1 min-w-[140px] h-12 sm:h-14 bg-surface hover:bg-error/5 border border-primary/10 hover:border-error/20 text-primary hover:text-error rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isActioning === req.$id ? (
                            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <XCircle size={16} />
                              <span>Reject Changes</span>
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  );
                }

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
                          <div className="flex items-center gap-2">
                            {req.is_extended && (
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 text-secondary text-[9px] sm:text-[10px] font-black uppercase tracking-widest">
                                <Clock size={12} />
                                Extended
                              </div>
                            )}
                            <div
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[9px] sm:text-[10px] font-black uppercase tracking-widest ${
                                viewMode === "pending"
                                  ? "bg-primary/5 border-primary/10 text-primary"
                                  : "bg-green-500/10 border-green-500/20 text-green-500"
                              }`}
                            >
                              {viewMode === "pending"
                                ? "Pending Faculty Review"
                                : req.faculty_approval
                                  ? "Approved by You & Out"
                                  : "Approved (Not Required) & Out"}
                            </div>
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
                                      {req.is_extended && (
                                        <p className="text-[9px] text-secondary font-black tracking-wider uppercase mt-1">
                                          Extended by student
                                        </p>
                                      )}
                                    </div>
                                    <div className="hidden sm:flex p-2.5 bg-primary/10 rounded-xl text-primary border border-primary/10">
                                      <RefreshCw size={16} />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Parent Details Block */}
                            <div className="bg-primary/5 border border-primary/10 p-5 sm:p-6 rounded-2xl sm:rounded-3xl space-y-4 relative z-10">
                              <p className="text-[10px] text-primary/60 uppercase font-black tracking-widest flex items-center gap-2">
                                Parent / Guardian Contact Details
                              </p>
                              {req.parent_name ? (
                                <div className="space-y-3">
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-black text-primary uppercase">
                                        {req.parent_name}
                                      </p>
                                      <p className="text-xs font-bold text-primary/60">
                                        {req.parent_phone} • {req.parent_email}
                                      </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <a
                                        href={`tel:${req.parent_phone}`}
                                        className="px-4 py-2 bg-secondary text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                      >
                                        <Phone size={12} />
                                        Call Parent
                                      </a>
                                      <button
                                        disabled={isSendingEmail[req.$id] || req.mail_sent}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleEmailParent(req);
                                        }}
                                        className="px-4 py-2 bg-primary text-background disabled:bg-gray-400/20 disabled:text-gray-500/60 disabled:border disabled:border-gray-500/10 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:cursor-not-allowed disabled:hover:scale-100"
                                      >
                                        <Mail size={12} />
                                        {isSendingEmail[req.$id] ? "Sending..." : (req.mail_sent ? "Email Sent" : "Email Parent")}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs font-bold text-primary/50 italic">
                                  No parent details are registered for this
                                  student
                                </p>
                              )}
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
                                    onClick={() =>
                                      handleAction(req.$id, "approve")
                                    }
                                    className="flex-[2] py-4 rounded-2xl bg-success border border-success text-background text-[10px] font-black uppercase tracking-[0.2em] hover:opacity-90 hover:shadow-lg hover:shadow-success/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 grow disabled:opacity-50 disabled:hover:scale-100"
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
              <div className="h-64 flex flex-col items-center justify-center text-primary/40 space-y-4">
                <ClipboardCheck size={48} strokeWidth={1} />
                <p className="text-xs font-black uppercase tracking-widest">
                  Your queue is empty
                </p>
              </div>
            )}
          </AnimatePresence>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-8 bg-surface/40 backdrop-blur-md border border-primary/10 rounded-full p-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                className="px-6 py-3 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-primary hover:text-background disabled:opacity-50 transition-all cursor-pointer"
              >
                Previous
              </button>
              <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                className="px-6 py-3 bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest rounded-full hover:bg-primary hover:text-background disabled:opacity-50 transition-all cursor-pointer"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </GradientBackground>
  );
}
