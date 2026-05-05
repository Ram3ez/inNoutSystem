"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Send,
  Calendar,
  AlignLeft,
  CheckCircle2,
  AlertCircle,
  MapPin,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { databases, tablesDB, fetchAllRows, ID } from "@/lib/appwrite";
import { Query } from "appwrite";
import { GradientBackground } from "@/components/GradientBackground";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { DB_ID, COLLECTIONS } from "@/lib/constants";

export default function LeavePage() {
  const { user, studentData, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [reason, setReason] = useState("");
  const [placeOfVisit, setPlaceOfVisit] = useState("");
  const [exitDate, setExitDate] = useState("");
  const [inDate, setInDate] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [requiresFaculty, setRequiresFaculty] = useState(false);
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [holidaysList, setHolidaysList] = useState<any[]>([]);

  const [caretakerEmail, setCaretakerEmail] = useState("");
  const [facultyEmail, setFacultyEmail] = useState("");
  const [isAssignmentsLoading, setIsAssignmentsLoading] = useState(true);

  React.useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/login");
      return;
    }
    const profileId = user.email ? user.email.split("@")[0].toUpperCase() : "";
    const isStudent = /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}$/.test(profileId);
    if (!isStudent) {
      router.push("/");
    }
  }, [authLoading, user, router]);

  // Load holidays independently as soon as the page loads
  React.useEffect(() => {
    const loadHolidays = async () => {
      try {
        const hResp = await fetchAllRows<any>(DB_ID, COLLECTIONS.HOLIDAYS);
        setHolidaysList(hResp);
      } catch (err) {
        console.error("Failed to load holidays list:", err);
      }
    };
    loadHolidays();
  }, []);

  // Dynamic Approver Lookup from Database
  React.useEffect(() => {
    const fetchAssignments = async () => {
      if (!studentData?.$id) return;

      try {
        const COLL_CARETAKER = COLLECTIONS.CARETAKER;
        const COLL_FACULTY = COLLECTIONS.FACULTY;

        // Fetch Caretaker
        /*
        const cResp = await databases.listDocuments(DB_ID, COLL_CARETAKER, [
          Query.equal("gender", studentData.gender),
          Query.equal("year", parseInt(studentData.year)),
          Query.limit(1),
        ]);
        */
        const cResp = await tablesDB.listRows({
          databaseId: DB_ID,
          tableId: COLL_CARETAKER,
          queries: [
            Query.equal("gender", studentData.gender),
            Query.equal("year", parseInt(studentData.year)),
            Query.limit(1),
          ]
        });
        if (cResp.rows[0]) setCaretakerEmail(cResp.rows[0].email);

        // Fetch Faculty (Shared for B.Tech/M.Tech)
        /*
        const fResp = await databases.listDocuments(DB_ID, COLL_FACULTY, [
          Query.equal("department", studentData.department),
          Query.equal("year", parseInt(studentData.year)),
          Query.limit(1),
        ]);
        */
        const fResp = await tablesDB.listRows({
          databaseId: DB_ID,
          tableId: COLL_FACULTY,
          queries: [
            Query.equal("department", studentData.department),
            Query.equal("year", parseInt(studentData.year)),
            Query.limit(1),
          ]
        });
        if (fResp.rows[0]) setFacultyEmail(fResp.rows[0].email);
      } catch (err) {
        console.error("Failed to load staff assignments:", err);
      } finally {
        setIsAssignmentsLoading(false);
      }
    };

    fetchAssignments();
  }, [studentData]);

  // Auto-detect working days whenever dates change
  React.useEffect(() => {
    if (!exitDate || !inDate || isManualOverride) return;

    const start = new Date(exitDate);
    const end = new Date(inDate);

    // Normalize both to start of day to completely eliminate any time-of-day offsets
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    let hasWorkingDay = false;

    const tempDate = new Date(start);
    while (tempDate <= end) {
      const day = tempDate.getDay();
      const y = tempDate.getFullYear();
      const m = String(tempDate.getMonth() + 1).padStart(2, "0");
      const d = String(tempDate.getDate()).padStart(2, "0");
      const dateStr = `${y}-${m}-${d}`;

      const isGazetted = holidaysList.some(
        (h) => h.date && h.date.trim() === dateStr && h.type === "GAZETTED"
      );

      if (day !== 0 && day !== 6 && !isGazetted) {
        hasWorkingDay = true;
        break;
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }
    setRequiresFaculty(hasWorkingDay);
  }, [exitDate, inDate, isManualOverride, holidaysList]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentData?.$id) return;

    setIsSubmitting(true);
    setError(null);

    if (!reason.trim()) {
      setError("Please state your reason for leave.");
      setIsSubmitting(false);
      return;
    }

    if (!placeOfVisit.trim()) {
      setError("Place of visit is required.");
      setIsSubmitting(false);
      return;
    }

    const departure = new Date(exitDate);
    const returnDate = new Date(inDate);

    if (returnDate <= departure) {
      setError("Return date must be after the departure date.");
      setIsSubmitting(false);
      return;
    }

    try {
      // Check for existing active leave
      const existingLeaves = await fetchAllRows(DB_ID, COLLECTIONS.LEAVE, [
        Query.equal("roll_no", studentData.$id),
        Query.limit(1)
      ]);

      if (existingLeaves.length > 0) {
        setError("You already have an active leave request. You cannot apply for a new one until your current leave is completed or archived.");
        setIsSubmitting(false);
        return;
      }

      // Use dynamically fetched emails with safety fallbacks
      const finalCaretakerId =
        caretakerEmail || "general_caretaker@nitpy.ac.in";
      const finalFacultyId = facultyEmail || "general_faculty@nitpy.ac.in";

      /*
      await databases.createDocument({
        databaseId: DB_ID,
        collectionId: COLLECTIONS.LEAVE,
        documentId: ID.unique(),
        data: {
          roll_no: studentData.$id,
          reason: reason,
          place_of_visit: placeOfVisit,
          proposed_exit_date: departure.toISOString(),
          proposed_in_date: returnDate.toISOString(),
          status: "pending_caretaker",
          caretaker_id: finalCaretakerId,
          faculty_id: finalFacultyId,
          requires_faculty: requiresFaculty,
          caretaker_approval: false,
          faculty_approval: false,
        }
      });
      */
      await tablesDB.createRow({
        databaseId: DB_ID,
        tableId: COLLECTIONS.LEAVE,
        rowId: ID.unique(),
        data: {
          roll_no: studentData.$id,
          reason: reason,
          place_of_visit: placeOfVisit,
          proposed_exit_date: departure.toISOString(),
          proposed_in_date: returnDate.toISOString(),
          status: "pending_caretaker",
          caretaker_id: finalCaretakerId,
          faculty_id: finalFacultyId,
          requires_faculty: requiresFaculty,
          caretaker_approval: false,
          faculty_approval: false,
        }
      });

      setIsSuccess(true);
      setTimeout(() => router.push("/"), 2500);
    } catch (err: any) {
      console.error("Leave application failed:", err);
      setError(err.message || "Failed to submit leave request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <GradientBackground>
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator />
        </div>
      </GradientBackground>
    );
  }

  if (isSuccess) {
    return (
      <GradientBackground>
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-24 h-24 bg-secondary/10 rounded-full flex items-center justify-center text-secondary mb-8 border border-secondary/20"
          >
            <CheckCircle2 size={48} />
          </motion.div>
          <h1 className="text-3xl font-black text-primary uppercase tracking-tight mb-2">
            Request Submitted
          </h1>
          <p className="text-primary/60 font-bold uppercase tracking-widest text-xs">
            Your leave application has been sent for approval.
          </p>
        </div>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <main className="flex-1 max-w-2xl lg:max-w-7xl mx-auto w-full px-4 sm:px-10 lg:px-20 pt-32 sm:pt-40 pb-12">
        <header className="mb-12">
          <div className="flex items-center space-x-4 mb-6">
            <Link
              href="/"
              className="p-2 hover:bg-primary/5 rounded-full transition-all text-primary/40 hover:text-primary"
            >
              <ArrowLeft size={24} />
            </Link>
            <div>
              <p className="text-secondary font-bold tracking-[0.2em] text-[10px] uppercase mb-1">
                Outing & Leave
              </p>
              <h1 className="text-3xl font-bold text-primary tracking-tight uppercase">
                Apply for Leave
              </h1>
            </div>
          </div>
        </header>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={handleSubmit}
          className="space-y-6 sm:space-y-8 bg-surface border border-primary/5 p-5 sm:p-10 lg:p-16 rounded-[2rem] sm:rounded-[3rem] shadow-2xl relative overflow-hidden"
        >
          {/* Student Info - Responsive Stacking */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-primary/60 uppercase tracking-widest ml-1">
                Roll Number
              </label>
              <div className="h-14 bg-primary/[0.02] border border-primary/5 rounded-2xl flex items-center px-6 text-primary/60 font-bold uppercase overflow-hidden">
                <span className="truncate">{studentData?.$id}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-primary/70 uppercase tracking-widest ml-1">
                Full Name
              </label>
              <div className="h-14 bg-primary/[0.02] border border-primary/5 rounded-2xl flex items-center px-6 text-primary/60 font-bold uppercase overflow-hidden">
                <span className="truncate">{studentData?.name}</span>
              </div>
            </div>
          </div>

          {/* Reason - Full Width */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-primary/60 uppercase tracking-widest ml-1">
              Reason for Leave
            </label>
            <div className="relative">
              <AlignLeft
                className="absolute left-5 top-5 text-primary/20"
                size={18}
              />
              <textarea
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State your reason for leave..."
                className="w-full min-h-[140px] bg-primary/[0.03] border border-primary/10 rounded-[2rem] pl-14 pr-6 py-5 text-primary font-bold placeholder:text-primary/60 focus:outline-none focus:border-secondary transition-all resize-none leading-relaxed"
              />
            </div>
          </div>

          {/* Place of Visit */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-primary/60 uppercase tracking-widest ml-1">
              Place of Visit
            </label>
            <div className="relative group">
              <MapPin
                className="absolute left-5 top-1/2 -translate-y-1/2 text-primary/20 group-focus-within:text-secondary transition-colors"
                size={18}
              />
              <input
                required
                type="text"
                value={placeOfVisit}
                onChange={(e) => setPlaceOfVisit(e.target.value)}
                placeholder="e.g. Home — Chennai, Tamil Nadu"
                className="w-full h-14 bg-primary/[0.03] border border-primary/10 rounded-2xl pl-14 pr-6 text-primary font-bold placeholder:text-primary/60 focus:outline-none focus:border-secondary transition-all"
              />
            </div>
          </div>

          {/* Dates - Grid Spacing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-primary/60 uppercase tracking-widest ml-1">
                Departure Date
              </label>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-primary/20 group-focus-within:text-secondary transition-colors">
                  <Calendar size={18} />
                </div>
                <input
                  type="datetime-local"
                  required
                  value={exitDate}
                  onChange={(e) => setExitDate(e.target.value)}
                  className="w-full h-14 bg-primary/[0.03] border border-primary/10 rounded-2xl pl-14 pr-4 text-primary font-bold focus:outline-none focus:border-secondary transition-all appearance-none select-none text-xs sm:text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-primary/60 uppercase tracking-widest ml-1">
                Return Date
              </label>
              <div className="relative group">
                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-primary/20 group-focus-within:text-secondary transition-colors">
                  <Calendar size={18} />
                </div>
                <input
                  type="datetime-local"
                  required
                  value={inDate}
                  onChange={(e) => setInDate(e.target.value)}
                  min={exitDate}
                  className="w-full h-14 bg-primary/[0.03] border border-primary/10 rounded-2xl pl-14 pr-4 text-primary font-bold focus:outline-none focus:border-secondary transition-all appearance-none select-none text-xs sm:text-sm"
                />
              </div>
            </div>
          </div>

          {/* Faculty Approval Toggle */}
          <div className="bg-primary/5 border border-primary/10 rounded-2xl p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest mb-1">
                  Approval Workflow
                </p>
                <h3 className="text-sm font-black text-primary uppercase tracking-tight">
                  Faculty Advisor Approval?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsManualOverride(true);
                  setRequiresFaculty(!requiresFaculty);
                }}
                className={`w-14 h-8 rounded-full transition-all relative ${requiresFaculty ? "bg-secondary shadow-lg shadow-secondary/20" : "bg-primary/10"}`}
              >
                <motion.div
                  animate={{ x: requiresFaculty ? 28 : 4 }}
                  className="absolute top-1 w-6 h-6 bg-white rounded-full shadow-sm"
                />
              </button>
            </div>
            <p className="text-[9px] font-bold text-primary/60 uppercase leading-relaxed tracking-wider">
              {requiresFaculty
                ? "This leave falls on an institute working day. Faculty Advisor sign-off is usually required."
                : "This leave appears to be during holidays/weekends. Faculty sign-off may not be needed."}
            </p>
          </div>

          {error && (
            <div className="p-4 bg-error/10 border border-error/20 rounded-2xl flex items-center space-x-3 text-error">
              <AlertCircle size={18} />
              <p className="text-xs font-bold uppercase tracking-tight">
                {error}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-16 bg-secondary text-white rounded-2xl font-black uppercase tracking-[0.2em] shadow-lg shadow-secondary/20 hover:shadow-secondary/40 active:scale-[0.98] transition-all flex items-center justify-center space-x-3 disabled:opacity-50 disabled:grayscale"
          >
            {isSubmitting ? (
              <LoadingIndicator size="sm" />
            ) : (
              <>
                <span>Submit Request</span>
                <Send size={20} />
              </>
            )}
          </button>
        </motion.form>

        <p className="mt-8 text-center text-primary/60 text-[10px] font-bold uppercase tracking-widest px-8">
          Note: All leave requests are subject to approval by the caretaker and
          faculty. You will be notified once a decision is made.
        </p>
      </main>
    </GradientBackground>
  );
}

