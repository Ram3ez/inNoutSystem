"use client";

/**
 * Main Dashboard Page
 * Central hub for students and staff. Provides action cards based on user roles
 * (e.g., Applying for leave, Biometric capture, Admin portal access).
 * Also handles background "warming" of AI models for improved UX.
 */


import React from "react";
import { motion } from "framer-motion";
import {
  Footprints,
  Home,
  ShieldCheck,
  ChevronRight,
  ScanFace,
  AlertCircle,
  CheckCircle2,
  Activity,
  UserCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { GradientBackground } from "@/components/GradientBackground";
import { Navigation } from "@/components/Navigation";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useRouter } from "next/navigation";
import { databases, tablesDB, fetchAllRows, Query } from "@/lib/appwrite";
import { format } from "date-fns";
import { formatToIST } from "@/lib/constants";
import { loadFaceApiModels, loadFaceCache } from "@/lib/faceCache";
import { getLandmarker } from "@/lib/aiEngine";

export default function Dashboard() {
  const {
    user,
    isLoading,
    isRegistrationRequired,
    isAdmin,
    isKiosk,
    isFaculty,
    isCaretaker,
    studentData,
  } = useAuth();
  const router = useRouter();
  const profileId = user?.email ? user.email.split("@")[0].toUpperCase() : "";
  const isStudent = /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}$/.test(profileId);
  const [outings, setOutings] = React.useState<any[]>([]);
  const [liveOutings, setLiveOutings] = React.useState<any[]>([]);
  const [isOutingsLoading, setIsOutingsLoading] = React.useState(false);

  const DB_ID = "69cb970a000853f23489";
  const COLL_OUTING = "outing";

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      if (searchParams.has('membershipId') && searchParams.has('userId') && searchParams.has('secret')) {
        router.push(`/accept-invite?${searchParams.toString()}`);
      }
    }
  }, []);

  React.useEffect(() => {
    if (user) {
      fetchOutings();
    }
  }, [user, studentData, isAdmin, isKiosk]);

  // Background "Warming" for Kiosk/Admin
  React.useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    if (typeof window !== "undefined" && (isAdmin || isKiosk)) {
      const startSync = async () => {
        try {
          // 1. Start the face cache / sync IMMEDIATELY
          await loadFaceCache();
          
          // 2. Wait 2 seconds before doing heavy AI GPU warming
          // to keep the dashboard initial load buttery smooth.
          timeoutId = setTimeout(async () => {
             await Promise.all([
               loadFaceApiModels(),
               getLandmarker(),
             ]);
          }, 2000);
        } catch (e) {
          console.warn("[🧠 ENGINE] Background warming/sync failed", e);
        }
      };
      startSync();
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isAdmin, isKiosk]);

  const fetchOutings = async () => {
    setIsOutingsLoading(true);
    try {
      if (isAdmin || isKiosk) {
        // Fetch ALL students who are currently out (no in_time)
        const allOutings = await fetchAllRows(DB_ID, COLL_OUTING, [
          Query.isNull("in_time"),
          Query.orderDesc("out_time"),
        ]);
        setLiveOutings(allOutings);
      } else {
        // Fetch personal history for student
        const rollNo = studentData?.$id;
        if (!rollNo) return;

        const history = await fetchAllRows(DB_ID, COLL_OUTING, [
          Query.equal("roll_no", rollNo),
          Query.isNull("in_time"),
          Query.orderDesc("out_time"),
        ]);
        setOutings(history);
      }
    } catch (err) {
      console.error("Failed to fetch outings", err);
    } finally {
      setIsOutingsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <GradientBackground>
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator />
        </div>
      </GradientBackground>
    );
  }

  if (!user) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  if (isRegistrationRequired) {
    if (typeof window !== "undefined") router.push("/complete-profile");
    return null;
  }

  return (
    <GradientBackground>
      <Navigation />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-36 sm:pt-40 pb-12">
        <header className="mb-8 sm:mb-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-1 text-center sm:text-left"
          >
            {!isKiosk && (
              <p className="text-secondary font-bold tracking-[0.2em] text-[10px] sm:text-xs uppercase">
                Welcome back
              </p>
            )}
            <h1 className="text-2xl sm:text-4xl font-bold text-primary tracking-tight leading-tight uppercase">
              {isKiosk ? "KIOSK" : (user.name || "Student")}
            </h1>
            {!isAdmin && !isKiosk && !isFaculty && !isCaretaker && studentData && (
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                <span className="text-secondary font-black text-[10px] uppercase tracking-widest bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20">
                  {studentData.course === 'b.tech' ? 'B.Tech' : 
                   studentData.course === 'm.tech' ? 'M.Tech' : 
                   studentData.course === 'bsc' ? 'B.Sc' : 
                   studentData.course === 'msc' ? 'M.Sc' : 
                   studentData.course}
                </span>
                <span className="text-primary/60 font-bold text-[10px] uppercase tracking-widest bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
                  {studentData.year}YR • {studentData.department}
                </span>
                {studentData.parent_verification_status && (
                  <span className={`font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-full border ${
                    studentData.parent_verification_status === 'pending_approval' 
                      ? 'bg-secondary/10 text-secondary border-secondary/20' 
                      : studentData.parent_verification_status === 'verified' 
                      ? 'bg-green-500/10 text-green-500 border-green-500/20' 
                      : studentData.parent_verification_status === 'rejected' 
                      ? 'bg-red-500/10 text-red-500 border-red-500/20' 
                      : 'bg-primary/5 text-primary/60 border-primary/10'
                  }`}>
                    Parents: {
                      studentData.parent_verification_status === 'pending_approval' ? 'Pending Approval' :
                      studentData.parent_verification_status === 'verified' ? 'Approved' :
                      studentData.parent_verification_status === 'rejected' ? 'Rejected' :
                      studentData.parent_verification_status
                    }
                  </span>
                )}
              </div>
            )}
          </motion.div>
        </header>

        {!isAdmin && !isKiosk && !isFaculty && !isCaretaker && isStudent && !((studentData as any)?.edgeface_registered || (studentData as any)?.ghostface_registered) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 bg-secondary/10 border border-secondary/20 rounded-2xl flex items-center space-x-4 text-secondary"
          >
            <AlertCircle size={24} />
            <span className="font-bold uppercase tracking-tight text-sm sm:text-base leading-tight">
              Missing Facial Data — Please Visit a Kiosk for Enrollment
            </span>
          </motion.div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {(isAdmin || isKiosk) && (
            <>
              <ActionCard
                title="Outing"
                subtitle="Short Duration Entry/Exit"
                icon={<Footprints className="text-secondary" size={32} />}
                delay={0.1}
                onClick={() => router.push("/capture?type=Outing")}
              />
              <ActionCard
                title="Leave"
                subtitle="Long Duration Leave Entry/Exit"
                icon={<Home className="text-secondary" size={32} />}
                delay={0.12}
                onClick={() => router.push("/capture?type=Leave")}
              />
              <ActionCard
                title="Register Face"
                subtitle="New Student Enrollment"
                icon={<ScanFace className="text-secondary" size={32} />}
                delay={0.15}
                onClick={() => router.push("/register")}
              />
              <ActionCard
                title="Live Monitor"
                subtitle="Active Outing Tracking"
                icon={<Activity className="text-secondary" size={32} />}
                delay={0.2}
                onClick={() => router.push("/live-status")}
              />
            </>
          )}
          {!isAdmin && !isKiosk && !isFaculty && !isCaretaker && isStudent && (
            <>
              <ActionCard
                title="Apply for Leave"
                subtitle="Academic or Personal Leave"
                icon={<Home className="text-primary/20" size={32} />}
                delay={0.25}
                onClick={() => router.push("/leave")}
              />
              <ActionCard
                title="My Leaves"
                subtitle="Track Leave Approvals"
                icon={<Activity className="text-primary/20" size={32} />}
                delay={0.28}
                onClick={() => router.push("/my-leaves")}
              />
              <ActionCard
                title="Settings"
                subtitle="Manage Parent Details"
                icon={<ShieldCheck className="text-primary/20" size={32} />}
                delay={0.31}
                onClick={() => router.push("/settings")}
              />
              <ActionCard
                title="Register Face"
                subtitle={
                  (studentData as any)?.edgeface_registered && (studentData as any)?.ghostface_registered
                    ? "Face fully registered (Locked)"
                    : "Register Face Data"
                }
                icon={<ScanFace className="text-primary/20" size={32} />}
                delay={0.33}
                onClick={() => router.push("/register-face")}
              />
            </>
          )}
          {isAdmin && (
            <ActionCard
              title="Admin Portal"
              subtitle="Administrative Console"
              icon={<ShieldCheck className="text-secondary" size={32} />}
              delay={0.3}
              onClick={() => router.push("/admin")}
            />
          )}
          {isCaretaker && (
            <ActionCard
              title="Caretaker Portal"
              subtitle="Leave Management Console"
              icon={<ShieldCheck className="text-secondary" size={32} />}
              delay={0.35}
              onClick={() => router.push("/caretaker")}
            />
          )}
          {isFaculty && (
            <ActionCard
              title="Faculty Portal"
              subtitle="Leave Management Console"
              icon={<UserCheck className="text-secondary" size={32} />}
              delay={0.4}
              onClick={() => router.push("/faculty")}
            />
          )}
        </div>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="space-y-6"
        >
          {/* Personal History for Students */}
          {!isAdmin && !isKiosk && !isFaculty && !isCaretaker && isStudent && outings.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-primary uppercase tracking-widest">
                  Current Outing Status
                </h2>
                <div className="h-px flex-1 bg-primary/5 mx-6" />
                <Footprints className="text-primary/20" size={20} />
              </div>

              {isOutingsLoading ? (
                <div className="flex justify-center p-12 bg-surface rounded-3xl border border-primary/5 shadow-sm">
                  <LoadingIndicator size="sm" />
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {outings.map((outing, idx) => (
                    <motion.div
                      key={outing.$id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * idx }}
                      className="bg-surface hover:bg-primary/5 border border-primary/5 p-4 sm:p-6 rounded-3xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all group shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-center space-x-4 w-full sm:w-auto">
                        <div
                          className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${outing.in_time ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"}`}
                        >
                          <ScanFace size={24} />
                        </div>
                        <div className="flex-1">
                          <p className="text-primary font-bold uppercase text-sm tracking-tight">
                            {outing.in_time
                              ? "Completed Outing"
                              : "Currently Out"}
                          </p>
                          <p className="text-primary/60 text-[9px] font-bold uppercase tracking-widest leading-none mt-1">
                            ID: {outing.$id.slice(-8)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-4 sm:gap-12">
                        <div className="space-y-1">
                          <p className="text-[10px] text-primary/60 font-bold uppercase tracking-widest">
                            Exit
                          </p>
                          <p className="text-primary/80 font-bold text-sm">
                            {formatToIST(outing.out_time)}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] text-primary/60 font-bold uppercase tracking-widest">
                            Entry
                          </p>
                          {outing.in_time ? (
                            <p className="text-primary/80 font-bold text-sm">
                              {formatToIST(outing.in_time)}
                            </p>
                          ) : (
                            <div className="flex items-center space-x-2 text-secondary">
                              <AlertCircle size={14} />
                              <p className="font-bold text-xs uppercase tracking-tighter">
                                Still Out
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          )}
        </motion.section>
      </main>
    </GradientBackground>
  );
}

function ActionCard({
  title,
  subtitle,
  icon,
  delay,
  onClick,
  disabled = false,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  delay: number;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      onClick={onClick}
      disabled={disabled}
      className={`group relative border border-primary/5 p-6 sm:p-8 rounded-[2.5rem] text-left overflow-hidden transition-all ${
        disabled
          ? "bg-primary/[0.02] opacity-40 cursor-not-allowed grayscale"
          : "bg-surface hover:bg-primary/5 hover:scale-[1.01] active:scale-[0.99] hover:shadow-lg border-primary/10 shadow-md"
      }`}
    >
      <div className="relative z-10 flex flex-col h-full justify-between space-y-4 sm:space-y-8">
        <div className="p-3 sm:p-4 bg-primary/5 rounded-2xl w-fit shadow-inner">
          {icon}
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-primary mb-1 uppercase leading-none">
            {title}
          </h2>
          <p className="text-primary/60 text-[10px] sm:text-sm font-bold uppercase tracking-wide">{subtitle}</p>
        </div>
      </div>

      {/* Decoration */}
      <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="text-secondary" size={24} />
      </div>
      <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-secondary/5 rounded-full blur-3xl group-hover:bg-secondary/10 transition-all pointer-events-none" />
    </motion.button>
  );
}

