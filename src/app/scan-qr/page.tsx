"use client";

import React, { useEffect, useState, useRef, Suspense } from "react";
import { BasePage } from "@/components/BasePage";
import { useAuth } from "@/context/AuthContext";
import { tablesDB, ID } from "@/lib/appwrite";
import { Query } from "appwrite";
import { DB_ID, COLLECTIONS } from "@/lib/constants";
import { useRouter, useSearchParams } from "next/navigation";
import { getStudentMetadata, loadStudentMetadataOnly } from "@/lib/faceCache";
import { verifyTOTP, decryptSecret } from "@/lib/totp";
import { addToOfflineQueue, isSystemOnline } from "@/lib/offlineQueue";
import { logTransaction } from "@/lib/auditLogger";
import { motion, AnimatePresence } from "framer-motion";
import { storage } from "@/lib/appwrite";
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Camera,
  RefreshCw,
  Zap,
  ZapOff,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

function ScanQrContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const actionType = searchParams.get("type") || "Outing"; // "Outing" or "Leave"

  const [statusText, setStatusText] = useState("Initializing camera...");
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [cameraAccess, setCameraAccess] = useState<boolean | null>(null);
  const [systemOnline, setSystemOnline] = useState(true);
  const [scannedStudentPhoto, setScannedStudentPhoto] = useState<string | null>(null);

  const [resultDialog, setResultDialog] = useState<{
    title: string;
    message: string;
    type: "success" | "error";
  } | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef(false);
  const isPausedRef = useRef(false);

  // Load and cache student metadata on mount
  useEffect(() => {
    const initMetadata = async () => {
      try {
        setStatusText("Loading kiosk database...");
        await loadStudentMetadataOnly();
        setStatusText("Scanner active. Align QR code.");
      } catch (err) {
        console.error("Failed to initialize student metadata:", err);
        setStatusText("Failed to initialize kiosk database.");
      }
    };
    initMetadata();
  }, []);

  // Sync connectivity state
  useEffect(() => {
    setSystemOnline(isSystemOnline());
    const handleOnline = () => setSystemOnline(true);
    const handleOffline = () => setSystemOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Web Audio synthesizer chime/beep feedback
  const playAudio = (type: "success" | "error") => {
    if (typeof window === "undefined") return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === "success") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();

        osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
        osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5

        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.stop(ctx.currentTime + 0.5);
      } else {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        osc.start();

        gain.gain.setValueAtTime(0, ctx.currentTime + 0.15);
        osc.frequency.setValueAtTime(120, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + 0.2);

        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45);
        osc.stop(ctx.currentTime + 0.45);
      }
    } catch (err) {
      console.warn("Sound feedback failed:", err);
    }
  };

  const resumeScanning = async () => {
    try {
      if (html5QrCodeRef.current && isPausedRef.current) {
        await html5QrCodeRef.current.resume();
        isPausedRef.current = false;
        setStatusText("Scanner active. Align QR code.");
        isProcessingRef.current = false;
      }
    } catch (err) {
      console.error("Failed to resume scanner:", err);
    }
  };

  const showSuccess = (message: string, name?: string) => {
    playAudio("success");
    setResultDialog({
      title: "Scan Success",
      message: `${name ? name + "\n\n" : ""}${message}`,
      type: "success",
    });

    setTimeout(() => {
      setResultDialog(null);
      resumeScanning();
    }, 3000);
  };

  const showError = (message: string) => {
    playAudio("error");
    setResultDialog({
      title: "Verification Error",
      message: message,
      type: "error",
    });

    setTimeout(() => {
      setResultDialog(null);
      resumeScanning();
    }, 4000);
  };

  const handleScanSuccess = async (decodedText: string) => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setStatusText("Verifying token...");

    // Pause scanning while verifying
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        await html5QrCodeRef.current.pause(true);
        isPausedRef.current = true;
      }
    } catch (err) {
      console.warn("Failed to pause scanner feed:", err);
    }

    const parts = decodedText.split(":");
    if (parts.length !== 2) {
      showError("Invalid QR Code structure. Re-generate ID on student device.");
      return;
    }

    const [rollNo, token] = parts;
    const cleanRollNo = rollNo.trim().toUpperCase();

    try {
      // Step 1: Retrieve student secret and details from local metadata cache
      const student = await getStudentMetadata(cleanRollNo);
      if (!student) {
        showError(`Student detail for ${cleanRollNo} not found in Kiosk database.\nPlease connect Kiosk online to sync cache.`);
        return;
      }

      setScannedStudentPhoto(student.photo || null);

      // Step 2: Verify TOTP secret with drift tolerance
      if (!student.totp_secret) {
        showError("Student has not activated TOTP.\nAsk them to open 'Show ID' on their dashboard once.");
        return;
      }

      const rawSecret = decryptSecret(student.totp_secret);
      const isTokenValid = await verifyTOTP(rawSecret, token, 1);
      if (!isTokenValid) {
        showError("Invalid or expired identification code.\nAsk student to refresh their ID.");
        return;
      }

      // Step 3: Check admin blocks
      if (
        student.outing_blocked_until &&
        new Date() < new Date(student.outing_blocked_until)
      ) {
        const until = new Date(student.outing_blocked_until).toLocaleDateString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        });
        showError(`OUTING PRIVILEGES BLOCKED UNTIL: ${until}`);
        return;
      }

      // Step 4: Perform transactional mutations
      if (!isSystemOnline()) {
        addToOfflineQueue(cleanRollNo);
        await logTransaction({
          action: "OFFLINE_CAPTURE",
          message: `Student ${cleanRollNo} verified offline via QR (${actionType}).`,
          userId: cleanRollNo,
          level: "low",
        });
        showSuccess(`Offline Verification Success!\nSaved locally for ${cleanRollNo}.`, student.name);
        return;
      }

      const currentTime = new Date().toISOString();
      let dbMessage = "";

      if (actionType === "Leave") {
        // --- LEAVE TRANSACTIONS ---
        const { rows: leaves } = await tablesDB.listRows({
          databaseId: DB_ID,
          tableId: COLLECTIONS.LEAVE,
          queries: [Query.equal("roll_no", cleanRollNo), Query.orderDesc("$createdAt")],
        });

        const activeLeave = leaves.find((doc: any) => doc.exit_date_time && !doc.in_date_time);

        if (activeLeave) {
          // --- LEAVE RETURN ---
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
          } = activeLeave as any;

          archiveData.in_date_time = currentTime;
          archiveData.mail_sent = activeLeave.mail_sent;

          await tablesDB.createRow({
            databaseId: DB_ID,
            tableId: COLLECTIONS.LEAVE_ARCHIVE,
            rowId: ID.unique(),
            data: archiveData,
          });
          await tablesDB.deleteRow({
            databaseId: DB_ID,
            tableId: COLLECTIONS.LEAVE,
            rowId: activeLeave.$id,
          });
          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLLECTIONS.STUDENTS,
            rowId: cleanRollNo,
            data: { is_on_leave: false },
          });

          dbMessage = "LEAVE RETURN REGISTERED";
          await logTransaction({
            action: "LEAVE_RETURN",
            message: `Student ${cleanRollNo} returned from leave (Verified via QR).`,
            userId: cleanRollNo,
            metadata: { leaveId: activeLeave.$id },
          });
        } else {
          // --- LEAVE DEPARTURE ---
          const { rows: outings } = await tablesDB.listRows({
            databaseId: DB_ID,
            tableId: COLLECTIONS.OUTING,
            queries: [Query.equal("roll_no", cleanRollNo)],
          });
          const activeOuting = outings.find((doc: any) => !doc.in_time);

          if (activeOuting) {
            showError("Departure Denied:\nCurrently checked-out on an outing.");
            return;
          }

          const now = new Date();
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const validLeave = leaves.find((l: any) => {
            if (l.exit_date_time) return false;

            const isCaretakerApproved = l.caretaker_approval === true;
            const isFacultyApproved = l.faculty_approval === true;
            const requiresFaculty = l.requires_faculty === true;
            const isFullyApproved = requiresFaculty
              ? isCaretakerApproved && isFacultyApproved
              : isCaretakerApproved;

            if (!isFullyApproved) return false;

            const proposedExit = new Date(l.proposed_exit_date);
            proposedExit.setHours(0, 0, 0, 0);
            const proposedIn = new Date(l.proposed_in_date);

            return today >= proposedExit && now <= proposedIn;
          });

          if (validLeave) {
            await tablesDB.updateRow({
              databaseId: DB_ID,
              tableId: COLLECTIONS.LEAVE,
              rowId: validLeave.$id,
              data: { exit_date_time: currentTime },
            });
            await tablesDB.updateRow({
              databaseId: DB_ID,
              tableId: COLLECTIONS.STUDENTS,
              rowId: cleanRollNo,
              data: { is_on_leave: true },
            });

            dbMessage = "LEAVE DEPARTURE REGISTERED";
            await logTransaction({
              action: "LEAVE_EXIT",
              message: `Student ${cleanRollNo} departed on leave (Verified via QR).`,
              userId: cleanRollNo,
              metadata: { leaveId: validLeave.$id },
            });
          } else {
            const upcomingLeave = leaves.find(
              (l) => !l.exit_date_time && (l.caretaker_approval || l.faculty_approval)
            );
            let errorMsg = "NO VALID APPROVED LEAVE FOR TODAY";

            if (upcomingLeave) {
              const isCaretakerApproved = upcomingLeave.caretaker_approval === true;
              const isFacultyApproved = upcomingLeave.faculty_approval === true;
              const requiresFaculty = upcomingLeave.requires_faculty === true;
              const isFullyApproved = requiresFaculty
                ? isCaretakerApproved && isFacultyApproved
                : isCaretakerApproved;

              if (!isFullyApproved) {
                errorMsg = "LEAVE NOT FULLY APPROVED.";
                if (!isCaretakerApproved) errorMsg += "\nPending Caretaker Approval.";
                else if (requiresFaculty && !isFacultyApproved)
                  errorMsg += "\nPending Faculty Approval.";
              } else {
                const proposedExit = new Date(upcomingLeave.proposed_exit_date);
                proposedExit.setHours(0, 0, 0, 0);
                const proposedIn = new Date(upcomingLeave.proposed_in_date);

                if (today < proposedExit) {
                  errorMsg = `TOO EARLY FOR DEPARTURE.\nPROPOSED DATE: ${new Date(upcomingLeave.proposed_exit_date).toLocaleDateString("en-IN")}`;
                } else if (now > proposedIn) {
                  errorMsg = `PROPOSED RETURN PASSED.\nPROPOSED RETURN: ${new Date(upcomingLeave.proposed_in_date).toLocaleDateString("en-IN")}`;
                }
              }
            }
            showError(errorMsg);
            return;
          }
        }
      } else {
        // --- OUTING TRANSACTIONS ---
        const { rows: outings } = await tablesDB.listRows({
          databaseId: DB_ID,
          tableId: COLLECTIONS.OUTING,
          queries: [
            Query.equal("roll_no", cleanRollNo),
            Query.orderDesc("out_time"),
            Query.limit(1),
          ],
        });

        const openOuting = outings.find((doc) => !doc.in_time);

        if (openOuting) {
          // --- OUTING CHECK-IN ---
          await tablesDB.createRow({
            databaseId: DB_ID,
            tableId: COLLECTIONS.OUTING_ARCHIVE,
            rowId: ID.unique(),
            data: {
              roll_no: cleanRollNo,
              out_time: openOuting.out_time,
              in_time: currentTime,
            },
          });
          await tablesDB.deleteRow({
            databaseId: DB_ID,
            tableId: COLLECTIONS.OUTING,
            rowId: openOuting.$id,
          });
          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLLECTIONS.STUDENTS,
            rowId: cleanRollNo,
            data: { is_out: false },
          });

          dbMessage = "OUTING CHECK-IN SUCCESSFUL";
          await logTransaction({
            action: "OUTING_ENTRY",
            message: `Student ${cleanRollNo} checked in from outing (Verified via QR).`,
            userId: cleanRollNo,
            metadata: { outingId: openOuting.$id },
          });
        } else {
          // --- OUTING CHECK-OUT ---
          const { rows: leaves } = await tablesDB.listRows({
            databaseId: DB_ID,
            tableId: COLLECTIONS.LEAVE,
            queries: [Query.equal("roll_no", cleanRollNo)],
          });
          const activeLeave = leaves.find((doc: any) => doc.exit_date_time && !doc.in_date_time);

          if (activeLeave) {
            showError("Departure Denied:\nCurrently checked-out on active leave.");
            return;
          }

          const gender = student.gender ? student.gender.toUpperCase() : "MALE";
          const nowInIST = new Date(
            new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
          );
          const totalMinutes = nowInIST.getHours() * 60 + nowInIST.getMinutes();

          let isDisabled = false;
          let restrictedMsg = "";

          if (gender === "FEMALE") {
            if (totalMinutes >= 1110 || totalMinutes < 180) {
              isDisabled = true;
              restrictedMsg = "Outing for girls is disabled starting from 6:30 PM to 3:00 AM.";
            }
          } else {
            if (totalMinutes >= 1350 || totalMinutes < 180) {
              isDisabled = true;
              restrictedMsg = "Outing for boys is disabled starting from 10:30 PM to 3:00 AM.";
            }
          }

          if (isDisabled) {
            showError(restrictedMsg);
            return;
          }

          await tablesDB.createRow({
            databaseId: DB_ID,
            tableId: COLLECTIONS.OUTING,
            rowId: ID.unique(),
            data: {
              roll_no: cleanRollNo,
              out_time: currentTime,
            },
          });
          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLLECTIONS.STUDENTS,
            rowId: cleanRollNo,
            data: { is_out: true },
          });

          dbMessage = "OUTING CHECK-OUT SUCCESSFUL";
          await logTransaction({
            action: "OUTING_EXIT",
            message: `Student ${cleanRollNo} checked out for outing (Verified via QR).`,
            userId: cleanRollNo,
          });
        }
      }

      showSuccess(dbMessage, student.name);
    } catch (err: any) {
      console.error("QR validation failure:", err);
      showError(err.message || "Failed to submit verification check.");
    }
  };

  // Setup html5-qrcode loop client-side
  useEffect(() => {
    let scanner: Html5Qrcode | null = null;
    let isActive = true;

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");

        const container = document.getElementById("qr-reader");
        if (!container || !isActive) return;

        scanner = new Html5Qrcode("qr-reader");
        html5QrCodeRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: (width, height) => {
              const size = Math.min(width, height) * 0.75;
              return { width: size, height: size };
            },
          },
          (decodedText) => {
            handleScanSuccess(decodedText);
          },
          () => {
            // Keep scan failures quiet
          }
        );

        const capabilities = scanner.getRunningTrackCapabilities();
        setHasTorch(!!(capabilities as any)?.torch);
        setCameraAccess(true);
        setStatusText("Scanner active. Align QR code.");
      } catch (err: any) {
        console.error("Scanner start error:", err);
        setCameraAccess(false);
        setError(err.message || "Unable to acquire camera access. Check settings.");
      }
    };

    // Brief delay to ensure browser layout settles
    const timeout = setTimeout(startScanner, 200);

    return () => {
      isActive = false;
      clearTimeout(timeout);
      if (scanner && scanner.isScanning) {
        scanner.stop().catch((e) => console.warn("Failed to stop scanner on destroy:", e));
      }
    };
  }, [actionType]);

  const toggleTorch = async () => {
    if (!html5QrCodeRef.current || !html5QrCodeRef.current.isScanning) return;
    try {
      const nextTorch = !torchOn;
      await html5QrCodeRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any],
      });
      setTorchOn(nextTorch);
    } catch (err) {
      console.warn("Torch override failed:", err);
    }
  };

  return (
    <BasePage
      title={`${actionType} (QR)`}
      subtitle="Kiosk Verification Portal"
      requireKiosk={true}
      maxWidth="md"
    >
      <div className="flex flex-col items-center space-y-8 max-w-md mx-auto w-full select-none">
        
        {/* Status indicator banner */}
        <div className="flex items-center justify-between w-full px-4 py-3 bg-surface/40 border border-primary/5 rounded-2xl backdrop-blur-md">
          <div className="flex items-center space-x-2">
            <div className={`w-2.5 h-2.5 rounded-full ${systemOnline ? "bg-green-500 animate-pulse" : "bg-orange-500 animate-ping"}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">
              Kiosk: {systemOnline ? "Online" : "Offline Mode"}
            </span>
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-secondary bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20">
            {actionType} Mode
          </span>
        </div>

        {/* Camera Scanner View */}
        <div className="w-full aspect-square bg-black/40 border-2 border-primary/10 rounded-[3rem] overflow-hidden relative shadow-2xl flex items-center justify-center group">
          {cameraAccess === null && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4 bg-black/40 z-20">
              <RefreshCw className="text-secondary animate-spin" size={32} />
              <p className="text-[10px] font-bold text-primary/50 uppercase tracking-widest">Activating Device Camera...</p>
            </div>
          )}

          {cameraAccess === false && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-4 bg-black/40 z-20">
              <Camera className="text-red-500 animate-bounce" size={40} />
              <h3 className="text-lg font-black text-primary uppercase">Camera Unreachable</h3>
              <p className="text-[10px] text-primary/60 font-bold uppercase leading-relaxed max-w-[280px]">
                {error || "Ensure camera permissions are allowed in this browser and system settings."}
              </p>
            </div>
          )}

          {/* Scanner element container */}
          <div id="qr-reader" className="w-full h-full object-cover" />

          {/* Scanning frame indicators */}
          {cameraAccess && (
            <>
              {/* Animated laser scanning line */}
              <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-secondary to-transparent blur-sm laser-line pointer-events-none z-10" />

              {/* Scanning crosshairs */}
              <div className="absolute inset-[15%] border-2 border-dashed border-white/20 rounded-[2rem] pointer-events-none flex items-center justify-center">
                <div className="w-8 h-8 absolute top-0 left-0 border-t-4 border-l-4 border-secondary rounded-tl-2xl" />
                <div className="w-8 h-8 absolute top-0 right-0 border-t-4 border-r-4 border-secondary rounded-tr-2xl" />
                <div className="w-8 h-8 absolute bottom-0 left-0 border-b-4 border-l-4 border-secondary rounded-bl-2xl" />
                <div className="w-8 h-8 absolute bottom-0 right-0 border-b-4 border-r-4 border-secondary rounded-br-2xl" />
              </div>
            </>
          )}
        </div>

        {/* Action Controls / Instructions */}
        <div className="w-full flex flex-col items-center space-y-4">
          <p className="text-center text-xs font-bold text-primary/50 uppercase tracking-wider leading-relaxed">
            {statusText}
          </p>

          {hasTorch && cameraAccess && (
            <button
              onClick={toggleTorch}
              className={`flex items-center space-x-3 px-6 h-12 rounded-2xl border font-bold uppercase tracking-widest text-[10px] transition-all hover:scale-105 active:scale-95 shadow-md ${
                torchOn
                  ? "bg-secondary/15 text-secondary border-secondary/30"
                  : "bg-primary/5 text-primary/60 border-primary/10 hover:text-primary"
              }`}
            >
              {torchOn ? <ZapOff size={16} /> : <Zap size={16} />}
              <span>{torchOn ? "Turn Flash Off" : "Turn Flash On"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation & result Modal dialogs */}
      <AnimatePresence>
        {resultDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
              onClick={() => {
                setResultDialog(null);
                resumeScanning();
              }}
            />
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="relative bg-surface border border-primary/10 w-full max-w-sm rounded-[2.5rem] p-8 text-center overflow-hidden shadow-2xl z-10"
            >
              {resultDialog.type === "success" ? (
                <div className="space-y-6">
                  <div className="w-20 h-20 bg-green-500/10 text-green-500 rounded-full flex items-center justify-center mx-auto border border-green-500/20">
                    <CheckCircle2 size={40} className="animate-bounce" />
                  </div>

                  {scannedStudentPhoto && (
                    <div className="relative w-28 h-28 rounded-[1.5rem] overflow-hidden border-2 border-green-500/20 bg-primary/5 mx-auto shadow-md">
                      <img
                        src={storage.getFilePreview("student_photos", scannedStudentPhoto).toString()}
                        alt="Verified Student"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-primary uppercase tracking-tight leading-none">
                      {resultDialog.title}
                    </h2>
                    <p className="text-primary/60 text-xs font-bold uppercase tracking-wider whitespace-pre-line leading-relaxed">
                      {resultDialog.message}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="w-20 h-20 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto border border-red-500/20">
                    <XCircle size={40} className="animate-pulse" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-primary uppercase tracking-tight leading-none">
                      {resultDialog.title}
                    </h2>
                    <p className="text-primary/60 text-xs font-bold uppercase tracking-wider whitespace-pre-line leading-relaxed">
                      {resultDialog.message}
                    </p>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setResultDialog(null);
                  resumeScanning();
                }}
                className="mt-6 w-full h-12 border border-primary/10 hover:bg-primary/5 text-primary/60 rounded-2xl font-bold uppercase tracking-widest text-[10px] transition-all"
              >
                Close & Resume
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        @keyframes laser {
          0% { top: 15%; }
          50% { top: 85%; }
          100% { top: 15%; }
        }
        .laser-line {
          animation: laser 3s infinite ease-in-out;
        }
        /* Hide html5-qrcode's default styling and controls since we manage custom video overlay */
        #qr-reader video {
          object-cover: cover;
          width: 100% !important;
          height: 100% !important;
          border-radius: 3rem;
        }
        #qr-reader__scan_region {
          border: none !important;
          width: 100% !important;
          height: 100% !important;
        }
        #qr-reader__dashboard {
          display: none !important;
        }
      `}</style>
    </BasePage>
  );
}

export default function ScanQrPage() {
  return (
    <Suspense
      fallback={
        <BasePage title="Scan QR Code" subtitle="Syncing components..." requireKiosk={true}>
          <div className="flex-1 flex items-center justify-center min-h-[300px]">
            <RefreshCw className="text-secondary animate-spin" size={32} />
          </div>
        </BasePage>
      }
    >
      <ScanQrContent />
    </Suspense>
  );
}
