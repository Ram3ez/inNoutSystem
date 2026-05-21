"use client";

/**
 * Main Dashboard Page
 * Central hub for students and staff. Provides action cards based on user roles
 * (e.g., Applying for leave, Biometric capture, Admin portal access).
 * Also handles background "warming" of AI models for improved UX.
 */

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Footprints,
  Home,
  ShieldCheck,
  ChevronRight,
  ScanFace,
  AlertCircle,
  Activity,
  UserCheck,
  QrCode,
  User,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { GradientBackground } from "@/components/GradientBackground";
import { Navigation } from "@/components/Navigation";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useLoading } from "@/context/LoadingContext";
import { useRouter } from "next/navigation";

import { fetchAllRows, Query, storage, tablesDB } from "@/lib/appwrite";
import { formatToIST, COLLECTIONS, DB_ID } from "@/lib/constants";
import { generateTOTP, generateBase32Secret, encryptSecret, decryptSecret } from "@/lib/totp";
import QRCode from "qrcode";

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
  const { startLoading } = useLoading();
  const router = useRouter();
  const profileId = user?.email ? user.email.split("@")[0].toUpperCase() : "";
  const isStudent = /^[A-Z]{2}[0-9]{2}[A-Z][0-9]{4}$/.test(profileId);
  const [outings, setOutings] = React.useState<any[]>([]);
  const [liveOutings, setLiveOutings] = React.useState<any[]>([]);
  const [isOutingsLoading, setIsOutingsLoading] = React.useState(false);

  const [isIdModalOpen, setIsIdModalOpen] = React.useState(false);
  const [totpToken, setTotpToken] = React.useState("");
  const [secondsRemaining, setSecondsRemaining] = React.useState(30);
  const [qrUrl, setQrUrl] = React.useState("");

  // TOTP & QR Code Loop + Screen Wake Lock
  React.useEffect(() => {
    if (!isIdModalOpen || !studentData) return;

    let active = true;
    let interval: NodeJS.Timeout;

    const initSecretAndToken = async () => {
      let secret = studentData.totp_secret;

      if (!secret) {
        try {
          console.log("Generating new TOTP secret for student...");
          const rawSecret = generateBase32Secret(16);
          const encryptedSecret = encryptSecret(rawSecret);
          
          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLLECTIONS.STUDENTS,
            rowId: studentData.$id,
            data: { totp_secret: encryptedSecret }
          });

          // Update local state / context
          studentData.totp_secret = encryptedSecret;
          secret = encryptedSecret;
        } catch (err) {
          console.error("Failed to generate or save TOTP secret", err);
          return;
        }
      }

      const decryptedSecret = decryptSecret(secret);

      const updateToken = async () => {
        if (!decryptedSecret || !active) return;
        try {
          const token = await generateTOTP(decryptedSecret);
          if (!active) return;
          setTotpToken(token);

          // Generate QR code
          const text = `${studentData.$id}:${token}`;
          const url = await QRCode.toDataURL(text, {
            margin: 1,
            width: 256,
            color: {
              dark: "#000000",
              light: "#FFFFFF"
            }
          });
          if (!active) return;
          setQrUrl(url);
        } catch (err) {
          console.error("Failed to generate TOTP/QR", err);
        }
      };

      // Initial update
      await updateToken();

      // Start ticker
      interval = setInterval(async () => {
        const epoch = Math.floor(Date.now() / 1000);
        const remaining = 30 - (epoch % 30);
        setSecondsRemaining(remaining);

        if (remaining === 30 || remaining === 0) {
          await updateToken();
        }
      }, 1000);
    };

    initSecretAndToken();

    // Screen Wake Lock API
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch (err) {
        console.warn("Wake lock failed", err);
      }
    };

    requestWakeLock();

    const handleVisibility = async () => {
      if (wakeLock === null && document.visibilityState === "visible") {
        await requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (wakeLock) {
        wakeLock.release().catch(err => console.error("Release lock failed", err));
      }
    };
  }, [isIdModalOpen, studentData]);

  const COLL_OUTING = "outing";

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      if (
        searchParams.has("membershipId") &&
        searchParams.has("userId") &&
        searchParams.has("secret")
      ) {
        router.push(`/accept-invite?${searchParams.toString()}`);
      }
    }
  }, []);

  React.useEffect(() => {
    if (user) {
      fetchOutings();
    }
  }, [user, studentData, isAdmin, isKiosk]);

  // Background AI Warming was removed to prevent 30MB downloads on the home page

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

  // REDIRECTION LOGIC
  // We handle navigation in a useEffect to avoid "setState during render" warnings.
  // This ensures the dashboard content is only interactive for authenticated & registered users.
  React.useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push("/login");
      } else if (isRegistrationRequired) {
        router.push("/complete-profile");
      }
    }
  }, [user, isLoading, isRegistrationRequired, router]);

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

  if (!user || isRegistrationRequired) return null;

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
              {isKiosk ? "KIOSK" : user.name || "Student"}
            </h1>
            {!isAdmin &&
              !isKiosk &&
              !isFaculty &&
              !isCaretaker &&
              studentData && (
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-3">
                  <span className="text-secondary font-black text-[10px] uppercase tracking-widest bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20">
                    {studentData.course === "b.tech"
                      ? "B.Tech"
                      : studentData.course === "m.tech"
                        ? "M.Tech"
                        : studentData.course === "bsc"
                          ? "B.Sc"
                          : studentData.course === "msc"
                            ? "M.Sc"
                            : studentData.course}
                  </span>
                  <span className="text-primary/60 font-bold text-[10px] uppercase tracking-widest bg-primary/5 px-3 py-1 rounded-full border border-primary/10">
                    {studentData.year}YR • {studentData.department}
                  </span>
                  {studentData.parent_verification_status && (
                    <span
                      className={`font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-full border ${
                        studentData.parent_verification_status ===
                        "pending_approval"
                          ? "bg-secondary/10 text-secondary border-secondary/20"
                          : studentData.parent_verification_status ===
                              "verified"
                            ? "bg-green-500/10 text-green-500 border-green-500/20"
                            : studentData.parent_verification_status ===
                                "rejected"
                              ? "bg-red-500/10 text-red-500 border-red-500/20"
                              : "bg-primary/5 text-primary/60 border-primary/10"
                      }`}
                    >
                      Parents:{" "}
                      {studentData.parent_verification_status ===
                      "pending_approval"
                        ? "Pending Approval"
                        : studentData.parent_verification_status === "verified"
                          ? "Approved"
                          : studentData.parent_verification_status ===
                              "rejected"
                            ? "Rejected"
                            : studentData.parent_verification_status}
                    </span>
                  )}
                </div>
              )}
          </motion.div>
        </header>

        {!isAdmin &&
          !isKiosk &&
          !isFaculty &&
          !isCaretaker &&
          isStudent &&
          !(
            (studentData as any)?.edgeface_registered &&
            (studentData as any)?.ghostface_registered
          ) && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-8 p-6 bg-secondary/10 border border-secondary/20 rounded-2xl flex items-center space-x-4 text-secondary"
            >
              <AlertCircle size={24} />
              <div className="flex flex-col space-y-1">
                <span className="font-bold uppercase tracking-tight text-sm sm:text-base leading-tight">
                  Missing Biometric Data — Registration for BOTH Models Required
                </span>
                <p className="text-[10px] font-bold uppercase opacity-80 leading-tight">
                  Please register on your own using the "Register Face" card
                  below. If you face any errors, contact Rameez Mohammad
                  (CS23B1053).
                </p>
              </div>
            </motion.div>
          )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
          {isKiosk && (
            <>
              <ActionCard
                title="Outing"
                subtitle="Short Duration Entry/Exit"
                icon={<Footprints className="text-secondary" size={32} />}
                delay={0.1}
                onClick={() => {
                  startLoading();
                  router.push("/capture?type=Outing");
                }}
              />
              <ActionCard
                title="Leave"
                subtitle="Long Duration Leave Entry/Exit"
                icon={<Home className="text-secondary" size={32} />}
                delay={0.12}
                onClick={() => {
                  startLoading();
                  router.push("/capture?type=Leave");
                }}
              />
              <ActionCard
                title="Register Face"
                subtitle="New Student Enrollment"
                icon={<ScanFace className="text-secondary" size={32} />}
                delay={0.15}
                onClick={() => {
                  startLoading();
                  router.push("/register");
                }}
              />
              <ActionCard
                title="Live Monitor"
                subtitle="Active Outing Tracking"
                icon={<Activity className="text-secondary" size={32} />}
                delay={0.2}
                onClick={() => {
                  startLoading();
                  router.push("/live-status");
                }}
              />
              <ActionCard
                title="Outing (QR)"
                subtitle="Scan QR for Entry/Exit"
                icon={<QrCode className="text-secondary" size={32} />}
                delay={0.22}
                onClick={() => {
                  startLoading();
                  router.push("/scan-qr?type=Outing");
                }}
              />
              <ActionCard
                title="Leave (QR)"
                subtitle="Scan QR for Leave Entry/Exit"
                icon={<QrCode className="text-secondary" size={32} />}
                delay={0.25}
                onClick={() => {
                  startLoading();
                  router.push("/scan-qr?type=Leave");
                }}
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
                onClick={() => {
                  startLoading();
                  router.push("/leave");
                }}
              />
              <ActionCard
                title="My Leaves"
                subtitle="Track Leave Approvals"
                icon={<Activity className="text-primary/20" size={32} />}
                delay={0.28}
                onClick={() => {
                  startLoading();
                  router.push("/my-leaves");
                }}
              />
              <ActionCard
                title="Settings"
                subtitle="Manage Parent Details"
                icon={<ShieldCheck className="text-primary/20" size={32} />}
                delay={0.31}
                onClick={() => {
                  startLoading();
                  router.push("/settings");
                }}
              />
              <ActionCard
                title="Register Face"
                subtitle={
                  (studentData as any)?.edgeface_registered &&
                  (studentData as any)?.ghostface_registered
                    ? "Face fully registered (Locked)"
                    : "Register Face Data"
                }
                icon={<ScanFace className="text-primary/20" size={32} />}
                delay={0.33}
                onClick={() => {
                  startLoading();
                  router.push("/register-face");
                }}
              />
              <ActionCard
                title="Show ID Card"
                subtitle="Digital ID & TOTP QR Code"
                icon={<QrCode className="text-primary/20" size={32} />}
                delay={0.35}
                onClick={() => setIsIdModalOpen(true)}
              />
            </>
          )}
          {isAdmin && (
            <>
              <ActionCard
                title="Admin Portal"
                subtitle="Administrative Console"
                icon={<ShieldCheck className="text-secondary" size={32} />}
                delay={0.3}
                onClick={() => {
                  startLoading();
                  router.push("/admin");
                }}
              />
              <ActionCard
                title="Audit Logs"
                subtitle="System Transaction History"
                icon={<Activity className="text-secondary" size={32} />}
                delay={0.32}
                onClick={() => {
                  startLoading();
                  router.push("/audit-logs");
                }}
              />
            </>
          )}
          {isCaretaker && (
            <ActionCard
              title="Caretaker Portal"
              subtitle="Leave Management Console"
              icon={<ShieldCheck className="text-secondary" size={32} />}
              delay={0.35}
              onClick={() => {
                startLoading();
                router.push("/caretaker");
              }}
            />
          )}
          {isFaculty && (
            <ActionCard
              title="Faculty Portal"
              subtitle="Leave Management Console"
              icon={<UserCheck className="text-secondary" size={32} />}
              delay={0.4}
              onClick={() => {
                startLoading();
                router.push("/faculty");
              }}
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
          {!isAdmin &&
            !isKiosk &&
            !isFaculty &&
            !isCaretaker &&
            isStudent &&
            outings.length > 0 && (
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

      <AnimatePresence>
        {isIdModalOpen && studentData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl"
            onClick={() => setIsIdModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-sm overflow-hidden bg-surface/90 border border-primary/10 rounded-[2.5rem] shadow-2xl relative flex flex-col p-6 text-center select-none"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top Bar with Close Button */}
              <div className="flex justify-between items-center mb-6">
                <span className="text-secondary font-black text-[10px] uppercase tracking-[0.2em] bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20">
                  Digital Student ID
                </span>
                <button
                  onClick={() => setIsIdModalOpen(false)}
                  className="p-2 hover:bg-primary/5 active:scale-95 rounded-full transition-all text-primary/60 hover:text-primary"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Student Photo Section */}
              <div className="flex flex-col items-center mb-6">
                <div className="relative w-32 h-32 rounded-[2rem] overflow-hidden border-2 border-secondary/30 bg-primary/5 flex items-center justify-center shadow-lg">
                  {studentData.photo ? (
                    <img
                      src={storage.getFilePreview("student_photos", studentData.photo).toString()}
                      alt={studentData.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    // Beautiful custom avatar fallback based on gender
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-secondary/15 to-primary/5 text-secondary">
                      <User size={64} className="opacity-80" />
                    </div>
                  )}
                </div>
                <h2 className="text-2xl font-bold text-primary uppercase mt-4 tracking-tight leading-tight">
                  {studentData.name}
                </h2>
                <p className="text-secondary font-mono text-sm font-semibold tracking-wider mt-1">
                  {studentData.$id}
                </p>
              </div>

              {/* Details Badges */}
              <div className="grid grid-cols-3 gap-2 mb-6">
                <div className="bg-primary/5 border border-primary/5 rounded-2xl p-2.5 flex flex-col items-center">
                  <span className="text-[9px] font-bold text-primary/40 uppercase tracking-wider mb-0.5">Course</span>
                  <span className="text-xs font-black text-primary/80 uppercase">
                    {studentData.course === "b.tech" ? "B.Tech" : studentData.course === "m.tech" ? "M.Tech" : studentData.course === "bsc" ? "B.Sc" : studentData.course === "msc" ? "M.Sc" : studentData.course}
                  </span>
                </div>
                <div className="bg-primary/5 border border-primary/5 rounded-2xl p-2.5 flex flex-col items-center">
                  <span className="text-[9px] font-bold text-primary/40 uppercase tracking-wider mb-0.5">Year</span>
                  <span className="text-xs font-black text-primary/80 uppercase">{studentData.year} Year</span>
                </div>
                <div className="bg-primary/5 border border-primary/5 rounded-2xl p-2.5 flex flex-col items-center">
                  <span className="text-[9px] font-bold text-primary/40 uppercase tracking-wider mb-0.5">Dept</span>
                  <span className="text-xs font-black text-primary/80 uppercase">{studentData.department}</span>
                </div>
              </div>

              {/* QR Code Container (Must be white for reliable scanner reading) */}
              <div className="bg-white p-5 rounded-[2rem] shadow-inner border border-primary/5 flex items-center justify-center mx-auto mb-6 relative group overflow-hidden">
                {qrUrl ? (
                  <img
                    src={qrUrl}
                    alt="Scan Me"
                    className="w-48 h-48 select-none"
                    draggable={false}
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-primary/20">
                    <LoadingIndicator size="sm" />
                  </div>
                )}
              </div>

              {/* Animated Countdown Circle & TOTP Token */}
              <div className="flex flex-col items-center space-y-4 mb-4">
                {totpToken && (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-bold text-primary/40 uppercase tracking-widest">Code:</span>
                    <span className="text-lg font-mono font-black text-secondary tracking-widest bg-secondary/10 px-3 py-1 rounded-xl">
                      {totpToken.slice(0, 3)} {totpToken.slice(3)}
                    </span>
                  </div>
                )}

                <div className="flex items-center space-x-3 text-primary/60">
                  {/* Countdown Circle */}
                  <div className="relative w-8 h-8 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                      <circle
                        cx="16"
                        cy="16"
                        r="12"
                        className="stroke-primary/10"
                        strokeWidth="3"
                        fill="transparent"
                      />
                      <circle
                        cx="16"
                        cy="16"
                        r="12"
                        className="stroke-secondary transition-all duration-1000 ease-linear"
                        strokeWidth="3"
                        fill="transparent"
                        strokeDasharray={2 * Math.PI * 12}
                        strokeDashoffset={2 * Math.PI * 12 * (1 - secondsRemaining / 30)}
                      />
                    </svg>
                    <span className="absolute text-[10px] font-bold font-mono text-primary/80">
                      {secondsRemaining}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-primary/40">
                    QR Refreshes in {secondsRemaining}s
                  </span>
                </div>
              </div>

              {/* Brightness / Warning Overlay Hint */}
              <p className="text-[9px] font-black text-secondary/80 uppercase tracking-widest border border-secondary/20 bg-secondary/5 rounded-xl py-2 px-4 inline-block mx-auto max-w-[280px]">
                ⚠️ MAXIMIZE BRIGHTNESS FOR QUICK SCANNING
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
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
          <p className="text-primary/60 text-[10px] sm:text-sm font-bold uppercase tracking-wide">
            {subtitle}
          </p>
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
