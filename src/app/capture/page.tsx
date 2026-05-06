"use client";

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  Suspense,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  ScanFace,
  CheckCircle,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import ReactWebcam from "react-webcam";
import {
  FaceLandmarker,
  FilesetResolver,
  FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import { useAuth } from "@/context/AuthContext";
import { GradientBackground } from "@/components/GradientBackground";
import { Navigation } from "@/components/Navigation";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useLoading } from "@/context/LoadingContext";
import { useRouter, useSearchParams } from "next/navigation";
import { databases, tablesDB, ID } from "@/lib/appwrite";
import { Query } from "appwrite";
import { DB_ID, COLLECTIONS, BIOMETRIC_THRESHOLDS } from "@/lib/constants";
import Link from "next/link";
import {
  loadBaseFaceModels,
  loadFaceRecognitionModel,
  loadFaceApiModels,
  loadFaceCache,
  getBestMatch,
  isAIReady,
  rollingUpdateEmbedding,
} from "@/lib/faceCache";
import {
  getLandmarker,
  isLandmarkerLoaded,
  getLandmarkerSync,
} from "@/lib/aiEngine";
import * as faceapi from "face-api.js";
import { addToOfflineQueue, isSystemOnline } from "@/lib/offlineQueue";
import { initGhostFace, getGhostFaceDescriptor } from "@/lib/ghostfaceEngine";
import {
  initEdgeFace,
  getEdgeFaceDescriptor as getEdgeFaceDescriptorFn,
} from "@/lib/edgefaceEngine";

const SSD_OPTIONS = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.2 });

function CaptureContent() {
  const {
    user,
    isLoading: authLoading,
    isRegistrationRequired,
    isAdmin,
    isKiosk,
  } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    startLoading: startGlobalLoading,
    stopLoading: stopGlobalLoading,
    updateProgress,
  } = useLoading();
  const actionType = searchParams.get("type") || "Capture";

  const serverLog = (action: string, message: string) => {
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, message }),
    }).catch(() => {});
  };

  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultDialog, setResultDialog] = useState<{
    title: string;
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [confirmationData, setConfirmationData] = useState<{
    rollNo: string;
    name?: string;
  } | null>(null);

  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(
    getLandmarkerSync(),
  );
  const [isFaceValid, setIsFaceValid] = useState(false);
  const [detectionFeedback, setDetectionFeedback] =
    useState("Initializing AI...");
  const [isScanning, setIsScanning] = useState(false);
  const [aiLoaded, setAiLoaded] = useState(isAIReady() && isLandmarkerLoaded());
  const [modelType, setModelType] = useState<
    "face-api" | "ghostface" | "edgeface"
  >("edgeface");
  const [showNotRecognized, setShowNotRecognized] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeScanFeedback, setBarcodeScanFeedback] = useState("");

  const [livenessScore, setLivenessScore] = useState(0);
  const [isStable, setIsStable] = useState(true);
  const lastLandmarks = useRef<any>(null);
  const consensusBuffer = useRef<{ rollNo: string; count: number }>({
    rollNo: "",
    count: 0,
  });
  const [lastMatchData, setLastMatchData] = useState<{
    descriptor: Float32Array;
    score: number;
    modelType: "face-api" | "ghostface" | "edgeface";
    rollNo: string;
  } | null>(null);

  const failureBuffer = useRef<number>(0);
  const lastScanTime = useRef<number>(0);
  const lastDetectTime = useRef<number>(0);
  const lastLogTime = useRef<number>(0);

  const webcamRef = useRef<ReactWebcam>(null);

  const isMounted = useRef(true);
  const lastMediaPipeResult = useRef<any>(null);

  const isIOSDevice = useRef(false);

  // Initialize face-api cache + MediaPipe — singletons, only runs once per session
  useEffect(() => {
    isMounted.current = true;
    isIOSDevice.current = /iPad|iPhone|iPod/.test(navigator.userAgent);
    // If already loaded in background (e.g. from Home page), skip the await chain for instant UI
    if (isAIReady() && isLandmarkerLoaded()) {
      setFaceLandmarker(getLandmarkerSync());
      setAiLoaded(true);
    } else {
      const init = async () => {
        try {
          startGlobalLoading("Warming AI Engines...");
          // Neural engine initialization
          await loadBaseFaceModels();

          const tf = (faceapi as any).tf;
          if (tf) {
            // Set safety flags AFTER registration to prevent "not registered" errors
            try {
              tf.env().set("WASM_HAS_SIMD_SUPPORT", false);
              tf.env().set("WASM_HAS_MULTITHREAD_SUPPORT", false);
            } catch (e) {
              console.warn(
                "[📱 MAIN] Could not set TFJS flags, continuing with defaults...",
              );
            }
          }
          await new Promise((r) => setTimeout(r, 100));
          await loadFaceCache();
          await new Promise((r) => setTimeout(r, 100));
          await getLandmarker(updateProgress);
          await new Promise((r) => setTimeout(r, 100));
          await initGhostFace(updateProgress);
          await new Promise((r) => setTimeout(r, 100));
          await initEdgeFace(updateProgress);

          if (isMounted.current) {
            setFaceLandmarker(getLandmarkerSync());
            setAiLoaded(true);
          }
        } catch (e) {
          console.error("Failed to initialize AI engine", e);
        } finally {
          stopGlobalLoading();
        }
      };
      init();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  const handleRecognitionComplete = async (rawResult: string) => {
    let rollNumber: string | null = null;

    if (rawResult.includes("(score:")) {
      const namePart = rawResult.split("(score:")[0].trim();
      if (namePart.toLowerCase() !== "unknown" && namePart !== "") {
        rollNumber = namePart;
      }
    } else if (
      rawResult.toLowerCase() !== "unknown" &&
      !rawResult.toLowerCase().includes("no face detected") &&
      !rawResult.toLowerCase().includes("not recognized") &&
      rawResult.trim() !== "" &&
      !rawResult.startsWith("{")
    ) {
      rollNumber = rawResult.trim();
    }

    if (!rollNumber) {
      setResultDialog({
        title: "Recognition Error",
        message: rawResult.toLowerCase().includes("no face detected")
          ? "No face detected. Please ensure your face is clearly visible."
          : "Face not recognized. Please ensure you are registered.",
        type: "error",
      });
      setIsProcessing(false);
      setIsScanning(false);
      return;
    }
    try {
      const COLL_STUDENTS = COLLECTIONS.STUDENTS;

      try {
        const student = (await tablesDB.getRow({
          databaseId: DB_ID,
          tableId: COLL_STUDENTS,
          rowId: rollNumber,
        })) as any;

        // Check for block status
        if (
          student.outing_blocked_until &&
          new Date() < new Date(student.outing_blocked_until)
        ) {
          const until = new Date(
            student.outing_blocked_until,
          ).toLocaleDateString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          });
          setResultDialog({
            title: "Outing Blocked",
            message: `${rollNumber}\n\n⚠️ YOUR OUTING PRIVILEGES HAVE BEEN RESTRICTED BY ADMIN.\n\nRESTRICTED UNTIL: ${until}`,
            type: "error",
          });
          setIsProcessing(false);
          setIsScanning(false);
          return;
        }

        setConfirmationData({
          rollNo: rollNumber,
          name: student.name,
        });
      } catch (e) {
        setConfirmationData({ rollNo: rollNumber });
      }
    } catch (err: any) {
      console.error("Confirmation prep failed", err);
      setConfirmationData({ rollNo: rollNumber });
    } finally {
      setIsProcessing(false);
      setIsScanning(false);
    }
  };

  const confirmAndSync = async () => {
    if (!confirmationData) return;

    const rollNumber = confirmationData.rollNo;
    setConfirmationData(null);
    setIsProcessing(true);
    setStatusText(`Syncing Data for ${rollNumber}...`);

    try {
      const COLL_OUTING = COLLECTIONS.OUTING;
      const COLL_STUDENTS = COLLECTIONS.STUDENTS;
      const COLL_ARCHIVE = COLLECTIONS.OUTING_ARCHIVE;

      if (!isSystemOnline()) {
        addToOfflineQueue(rollNumber);

        // Adaptive Rolling Update (Offline compatible) - ONLY for GhostFace & EdgeFace
        if (
          lastMatchData?.rollNo === rollNumber &&
          (lastMatchData?.modelType === "ghostface" ||
            lastMatchData?.modelType === "edgeface") &&
          lastMatchData?.score >=
            (lastMatchData?.modelType === "ghostface"
              ? BIOMETRIC_THRESHOLDS.GHOSTFACE.ADAPTIVE_UPDATE
              : BIOMETRIC_THRESHOLDS.EDGEFACE.ADAPTIVE_UPDATE)
        ) {
          rollingUpdateEmbedding(
            rollNumber,
            lastMatchData.descriptor,
            lastMatchData.modelType,
          )
            .then(() =>
              serverLog(
                "ADAPTIVE",
                `Adaptive profile update saved for ${rollNumber} (Score: ${lastMatchData.score.toFixed(2)})`,
              ),
            )
            .catch(() => {});
        }

        setResultDialog({
          title: "Offline Capture",
          message: `${rollNumber}\n\nSAVED LOCALLY (OFFLINE)\nWILL SYNC WHEN ONLINE`,
          type: "success",
        });
        return;
      }

      const currentTime = new Date().toISOString();
      let dbMessage = "";

      if (actionType === "Leave") {
        const { rows: leavesForChecks } = await tablesDB.listRows({
          databaseId: DB_ID,
          tableId: COLLECTIONS.LEAVE,
          queries: [Query.equal("roll_no", rollNumber)],
        });

        const latestLeaveForCheck = leavesForChecks.sort(
          (a: any, b: any) =>
            new Date(b.$createdAt).getTime() - new Date(a.$createdAt).getTime(),
        )[0];

        if (latestLeaveForCheck && !latestLeaveForCheck.exit_date_time) {
          const { rows: outingsForChecks } = await tablesDB.listRows({
            databaseId: DB_ID,
            tableId: COLLECTIONS.OUTING,
            queries: [Query.equal("roll_no", rollNumber)],
          });
          const activeOuting = outingsForChecks.find(
            (doc: any) => !doc.in_time,
          );

          if (activeOuting) {
            setResultDialog({
              title: "Departure Denied",
              message: `${rollNumber}\n\n⚠️ GRAVE ERROR: CURRENTLY OUT ON AN OUTING.\nCANNOT GO ON LEAVE UNTIL YOU RETURN.`,
              type: "error",
            });
            setIsProcessing(false);
            return;
          }
        }
      } else {
        const { rows: outingsForChecks } = await tablesDB.listRows({
          databaseId: DB_ID,
          tableId: COLLECTIONS.OUTING,
          queries: [Query.equal("roll_no", rollNumber)],
        });
        const activeOuting = outingsForChecks.find((doc: any) => !doc.in_time);

        if (!activeOuting) {
          const { rows: leavesForChecks } = await tablesDB.listRows({
            databaseId: DB_ID,
            tableId: COLLECTIONS.LEAVE,
            queries: [Query.equal("roll_no", rollNumber)],
          });
          const activeLeave = leavesForChecks.find(
            (doc: any) => doc.exit_date_time && !doc.in_date_time,
          );

          if (activeLeave) {
            setResultDialog({
              title: "Departure Denied",
              message: `${rollNumber}\n\n⚠️ GRAVE ERROR: CURRENTLY ON AN ACTIVE LEAVE.\nCANNOT GO FOR AN OUTING.`,
              type: "error",
            });
            setIsProcessing(false);
            return;
          }
        }
      }

      if (actionType === "Leave") {
        const COLL_LEAVE = COLLECTIONS.LEAVE;
        const { rows: documents } = await tablesDB.listRows({
          databaseId: DB_ID,
          tableId: COLL_LEAVE,
          queries: [
            Query.equal("roll_no", rollNumber),
            Query.orderDesc("$createdAt"),
            Query.limit(1),
          ],
        });

        const latestLeave = documents[0];

        if (!latestLeave) {
          setResultDialog({
            title: "Leave Denied",
            message: `${rollNumber}\n\nNO LEAVE REQUEST FOUND`,
            type: "error",
          });
          setIsProcessing(false);
          return;
        }

        if (latestLeave.exit_date_time && latestLeave.in_date_time) {
          setResultDialog({
            title: "Leave Denied",
            message: `${rollNumber}\n\nLATEST LEAVE ALREADY COMPLETED.\nPLEASE APPLY FOR NEW LEAVE.`,
            type: "error",
          });
          setIsProcessing(false);
          return;
        }

        const isCaretakerApproved = latestLeave.caretaker_approval === true;
        const isFacultyApproved = latestLeave.faculty_approval === true;
        const requiresFaculty = latestLeave.requires_faculty === true;

        const isFullyApproved = requiresFaculty
          ? isCaretakerApproved && isFacultyApproved
          : isCaretakerApproved;

        if (!isFullyApproved) {
          let msg = `${rollNumber}\n\nLEAVE NOT FULLY APPROVED.`;
          if (!isCaretakerApproved) msg += "\nPending Caretaker Approval.";
          else if (requiresFaculty && !isFacultyApproved)
            msg += "\nPending Faculty Approval.";

          setResultDialog({
            title: "Leave Denied",
            message: msg,
            type: "error",
          });
          setIsProcessing(false);
          return;
        }

        if (latestLeave.exit_date_time && !latestLeave.in_date_time) {
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
          } = latestLeave as any;

          archiveData.in_date_time = currentTime;
          archiveData.mail_sent = latestLeave.mail_sent;
          const COLL_LEAVE_ARCHIVE = COLLECTIONS.LEAVE_ARCHIVE;
          await tablesDB.createRow({
            databaseId: DB_ID,
            tableId: COLL_LEAVE_ARCHIVE,
            rowId: ID.unique(),
            data: archiveData,
          });
          await tablesDB.deleteRow({
            databaseId: DB_ID,
            tableId: COLL_LEAVE,
            rowId: latestLeave.$id,
          });
          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLL_STUDENTS,
            rowId: rollNumber,
            data: { is_on_leave: false },
          });
          dbMessage = "LEAVE RETURN SUCCESSFUL & ARCHIVED";
        } else if (!latestLeave.exit_date_time) {
          const today = new Date();
          const nowTime = new Date();
          today.setHours(0, 0, 0, 0);
          const proposed = new Date(latestLeave.proposed_exit_date);
          proposed.setHours(0, 0, 0, 0);

          if (today < proposed) {
            setResultDialog({
              title: "Departure Denied",
              message: `${rollNumber}\n\nTOO EARLY FOR DEPARTURE.\nPROPOSED DATE: ${new Date(latestLeave.proposed_exit_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}\nCURRENT DATE: ${new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`,
              type: "error",
            });
            setIsProcessing(false);
            return;
          }

          const proposedReturn = new Date(latestLeave.proposed_in_date);
          if (nowTime > proposedReturn) {
            setResultDialog({
              title: "Departure Denied",
              message: `${rollNumber}\n\nCANNOT DEPART AFTER PROPOSED RETURN DATE.\nPROPOSED RETURN: ${new Date(latestLeave.proposed_in_date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}`,
              type: "error",
            });
            setIsProcessing(false);
            return;
          }

          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLL_LEAVE,
            rowId: latestLeave.$id,
            data: { exit_date_time: currentTime },
          });
          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLL_STUDENTS,
            rowId: rollNumber,
            data: { is_on_leave: true },
          });
          dbMessage = "LEAVE DEPARTURE SUCCESSFUL";
        }
      } else {
        const { rows: documents } = await tablesDB.listRows({
          databaseId: DB_ID,
          tableId: COLL_OUTING,
          queries: [
            Query.equal("roll_no", rollNumber),
            Query.orderDesc("out_time"),
            Query.limit(1),
          ],
        });

        const openOuting = documents.find((doc) => !doc.in_time);

        if (openOuting) {
          await tablesDB.createRow({
            databaseId: DB_ID,
            tableId: COLL_ARCHIVE,
            rowId: ID.unique(),
            data: {
              roll_no: rollNumber,
              out_time: openOuting.out_time,
              in_time: currentTime,
            },
          });
          await tablesDB.deleteRow({
            databaseId: DB_ID,
            tableId: COLL_OUTING,
            rowId: openOuting.$id,
          });
          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLL_STUDENTS,
            rowId: rollNumber,
            data: { is_out: false },
          });

          dbMessage = "CHECK-IN SUCCESSFUL & ARCHIVED";
        } else {
          // Fetch student to retrieve gender
          const student = await tablesDB
            .getRow({
              databaseId: DB_ID,
              tableId: COLL_STUDENTS,
              rowId: rollNumber,
            })
            .catch(() => null);

          const gender = student?.gender
            ? student.gender.toUpperCase()
            : "MALE";
          const nowInIST = new Date(
            new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
          );
          const hours = nowInIST.getHours();
          const minutes = nowInIST.getMinutes();
          const totalMinutes = hours * 60 + minutes;

          let isDisabled = false;
          let restrictedMsg = "";

          if (gender === "FEMALE") {
            if (totalMinutes >= 1110 || totalMinutes < 180) {
              isDisabled = true;
              restrictedMsg =
                "Outing for girls is disabled starting from 6:30 PM to 3:00 AM.";
            }
          } else {
            if (totalMinutes >= 1350 || totalMinutes < 180) {
              isDisabled = true;
              restrictedMsg =
                "Outing for boys is disabled starting from 10:30 PM to 3:00 AM.";
            }
          }

          if (isDisabled) {
            setResultDialog({
              title: "Outing Disabled",
              message: `${rollNumber}\n\n⚠️ ${restrictedMsg}`,
              type: "error",
            });
            setIsProcessing(false);
            return;
          }

          await tablesDB.createRow({
            databaseId: DB_ID,
            tableId: COLL_OUTING,
            rowId: ID.unique(),
            data: {
              roll_no: rollNumber,
              out_time: currentTime,
            },
          });
          await tablesDB.updateRow({
            databaseId: DB_ID,
            tableId: COLL_STUDENTS,
            rowId: rollNumber,
            data: { is_out: true },
          });

          dbMessage = "CHECK-OUT SUCCESSFUL";
        }
      }

      // [🔄 ADAPTIVE] Rolling Update after user verification & DB success - ONLY for GhostFace & EdgeFace
      if (
        lastMatchData?.rollNo === rollNumber &&
        (lastMatchData?.modelType === "ghostface" ||
          lastMatchData?.modelType === "edgeface") &&
        lastMatchData?.score >=
          (lastMatchData?.modelType === "ghostface"
            ? BIOMETRIC_THRESHOLDS.GHOSTFACE.ADAPTIVE_UPDATE
            : BIOMETRIC_THRESHOLDS.EDGEFACE.ADAPTIVE_UPDATE)
      ) {
        rollingUpdateEmbedding(
          rollNumber,
          lastMatchData.descriptor,
          lastMatchData.modelType,
        )
          .then(() =>
            serverLog(
              "ADAPTIVE",
              `Adaptive profile update for ${rollNumber} (Score: ${lastMatchData.score.toFixed(2)})`,
            ),
          )
          .catch(() => {});
      }

      setResultDialog({
        title: "Database Synced",
        message: `${rollNumber}\n\n${dbMessage}`,
        type: "success",
      });
    } catch (err: any) {
      console.error("Sync failed", err);
      setResultDialog({
        title: "Sync Error",
        message: "Failed to update database. Please try again.",
        type: "error",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBarcodeSubmit = async (
    e?: React.FormEvent,
    directInput?: string,
  ) => {
    if (e) e.preventDefault();
    const scanned = (directInput || barcodeInput.trim()).toUpperCase();
    if (!scanned) return;

    setBarcodeInput("");
    setIsBarcodeModalOpen(false);
    setIsProcessing(true);
    setStatusText(`Verifying barcode for ${scanned}...`);

    try {
      const student = (await tablesDB.getRow({
        databaseId: DB_ID,
        tableId: COLLECTIONS.STUDENTS,
        rowId: scanned,
      })) as any;

      if (
        student.outing_blocked_until &&
        new Date() < new Date(student.outing_blocked_until)
      ) {
        const until = new Date(student.outing_blocked_until).toLocaleDateString(
          "en-IN",
          {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          },
        );
        setResultDialog({
          title: "Outing Blocked",
          message: `${scanned}\n\n⚠️ YOUR OUTING PRIVILEGES HAVE BEEN RESTRICTED BY ADMIN.\n\nRESTRICTED UNTIL: ${until}`,
          type: "error",
        });
        return;
      }

      setConfirmationData({
        rollNo: scanned,
        name: student.name,
      });
    } catch (e) {
      setConfirmationData({ rollNo: scanned });
    } finally {
      setIsProcessing(false);
    }
  };

  const processResults = (result: FaceLandmarkerResult) => {
    if (result.faceLandmarks.length === 0) {
      setIsFaceValid(false);
      setLivenessScore(0);
      setDetectionFeedback("Scanning for Face...");
      return;
    }

    const landmarks = result.faceLandmarks[0];
    const blendshapes = result.faceBlendshapes?.[0]?.categories || [];

    // --- 1. Stability & Motion: Blur Detection ---
    if (lastLandmarks.current) {
      const movement =
        landmarks.reduce((acc, curr, idx) => {
          const last = lastLandmarks.current[idx];
          if (!last) return acc;
          return (
            acc +
            Math.sqrt(
              Math.pow(curr.x - last.x, 2) + Math.pow(curr.y - last.y, 2),
            )
          );
        }, 0) / landmarks.length;

      const stable = movement < 0.05; // Increased for throttled frame rate stability
      setIsStable(stable);
      if (!stable) {
        setIsFaceValid(false);
        setDetectionFeedback("Please Hold Still");
        lastLandmarks.current = landmarks;
        return;
      }
    }
    lastLandmarks.current = landmarks;

    // --- 3. Positioning (Yaw & Pitch) ---
    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const forehead = landmarks[10];
    const chin = landmarks[152];

    const yaw =
      (nose.x - (leftEye.x + rightEye.x) / 2) / (rightEye.x - leftEye.x);
    const pitch =
      (nose.y - (leftEye.y + rightEye.y) / 2) / (chin.y - forehead.y);

    const isCentered = Math.abs(yaw) < 0.4 && Math.abs(pitch) < 0.4;

    if (!isCentered) {
      setDetectionFeedback("Look Directly at Camera");
      setIsFaceValid(false);
    } else {
      setDetectionFeedback("Hold Steady...");
      setIsFaceValid(true);

      // --- 4. AUTO-TRIGGER RECOGNITION ---
      // We only trigger if not already scanning, not processing a result,
      // and no dialogs are open.
      if (
        !isScanning &&
        !imgSrc &&
        !isProcessing &&
        !resultDialog &&
        !confirmationData
      ) {
        // iOS Stability Fix: Throttling
        // Only trigger recognition if at least 100ms has passed since the last attempt.
        // This limits recognition to ~10 FPS, preventing VRAM exhaustion.
        const now = Date.now();
        if (!lastScanTime.current || now - lastScanTime.current > 100) {
          lastScanTime.current = now;
          triggerLiveScan();
        }
      }
    }
  };

  const processLiveFrame = useCallback(
    async (videoElement: HTMLVideoElement) => {
      if (
        typeof window === "undefined" ||
        !isMounted.current ||
        document.visibilityState !== "visible"
      ) {
        setIsScanning(false);
        return;
      }

      setStatusText("Analyzing Biometrics...");
      setError(null);

      try {
        // Yield to the browser for 10ms to keep UI/Animations smooth
        await new Promise((r) => setTimeout(r, 10));
        if (!isMounted.current) return;

        // --- STABILITY GUARD: Ensure video is actually providing pixels ---
        if (!videoElement.videoWidth || !videoElement.videoHeight) {
          setIsScanning(false);
          return;
        }

        const tf = (faceapi as any).tf;
        if (tf && tf.engine) tf.engine().startScope();

        let descriptor: Float32Array;

        try {
          if (modelType === "ghostface" || modelType === "edgeface") {
            // For GhostFaceNet and EdgeFace, we use MediaPipe's high-fidelity results
            const mpResult = lastMediaPipeResult.current;

            if (
              !mpResult ||
              !mpResult.faceLandmarks ||
              mpResult.faceLandmarks.length === 0
            ) {
              // Fallback to Face-API ONLY if MediaPipe failed to cache a result
              const detection = await faceapi
                .detectSingleFace(videoElement, SSD_OPTIONS)
                .withFaceLandmarks();
              if (!detection) {
                failureBuffer.current++;
                setIsScanning(false);
                return;
              }
              descriptor =
                modelType === "ghostface"
                  ? await getGhostFaceDescriptor(
                      videoElement,
                      detection.detection.box,
                      detection.landmarks,
                      false,
                    )
                  : await getEdgeFaceDescriptorFn(
                      videoElement,
                      detection.detection.box,
                      detection.landmarks,
                      false,
                    );
            } else {
              // --- HIGH PRECISION MIGRATION ---
              const landmarks = mpResult.faceLandmarks[0];
              const box = mpResult.faceBoundingBoxes
                ? mpResult.faceBoundingBoxes[0]
                : { x: 0, y: 0, width: 0, height: 0 };

              descriptor =
                modelType === "ghostface"
                  ? await getGhostFaceDescriptor(
                      videoElement,
                      box,
                      landmarks,
                      false,
                    )
                  : await getEdgeFaceDescriptorFn(
                      videoElement,
                      box,
                      landmarks,
                      false,
                    );
            }
          } else {
            const detection = await faceapi
              .detectSingleFace(videoElement, SSD_OPTIONS)
              .withFaceLandmarks()
              .withFaceDescriptor();

            // --- STABILITY GUARD: Detect "null" or invalid boxes ---
            if (
              !detection ||
              !detection.detection ||
              !detection.detection.box ||
              detection.detection.box.width === null
            ) {
              failureBuffer.current++;
              setIsScanning(false);
              consensusBuffer.current = { rollNo: "", count: 0 };
              return;
            }
            descriptor = detection.descriptor;
          }
        } finally {
          if (tf && tf.engine) tf.engine().endScope();
        }

        if (!isMounted.current) return;

        const match = await getBestMatch(descriptor, modelType);

        // DEBUG: Verify engine output
        if (match.rollNo !== "Unknown") {
          console.log(
            `[🎯 ${modelType.toUpperCase()}] Match: ${match.rollNo} | Score: ${match.score.toFixed(4)}`,
          );
        }

        // --- TEMPORAL CONSENSUS ---
        if (match.rollNo === "Unknown") {
          consensusBuffer.current = { rollNo: "", count: 0 };
          failureBuffer.current++;

          // If we fail to recognize after 5 consecutive attempts (~0.7s of face being present)
          if (failureBuffer.current >= 5) {
            console.log(
              `[🚫 FAILURE] Threshold reached (${failureBuffer.current}). Showing Error Popup.`,
            );
            failureBuffer.current = 0;
            setIsScanning(false);
            setResultDialog({
              title: "Recognition Error",
              message:
                "Face not recognized. Please ensure you are registered and looking directly at the camera.",
              type: "error",
            });
            return;
          }

          // --- CONFLICT LOGGING (Only if Failure) ---
          // Restricted to 'Unknown' state to prevent false positives during success.
          const now = Date.now();
          if (match.conflictWith && now - lastLogTime.current > 2000) {
            lastLogTime.current = now;
            serverLog(
              "CONFLICT",
              `Identity conflict: ${match.potentialMatch} (${(match.score * 100).toFixed(1)}%) vs ${match.conflictWith} (${((match.conflictScore || 0) * 100).toFixed(1)}%). Gap too small.`,
            );
          }

          setIsScanning(false);
          setDetectionFeedback(
            `${match.potentialMatch || "Unknown"} (${(match.score * 100).toFixed(1)}%)`,
          );
          return;
        }

        // Reset failure buffer if we find any non-unknown match
        failureBuffer.current = 0;

        // Track for rolling updates
        setLastMatchData({
          descriptor,
          score: match.score,
          modelType,
          rollNo: match.rollNo,
        });

        // If we match the same person as the previous frame, increment count
        if (consensusBuffer.current.rollNo === match.rollNo) {
          consensusBuffer.current.count++;
        } else {
          consensusBuffer.current.rollNo = match.rollNo;
          consensusBuffer.current.count = 1;
        }

        // Consensus logic
        const targetConsensus = 1;

        if (consensusBuffer.current.count < targetConsensus) {
          setDetectionFeedback(
            `Verifying... ${consensusBuffer.current.count}/${targetConsensus} (${(match.score * 100).toFixed(1)}%)`,
          );
          setIsScanning(false);
          return;
        }

        // Success! Lock the identity
        serverLog(
          "RECOGNITION",
          `Confirmed: ${match.rollNo} (${(match.score * 100).toFixed(1)}%) (${targetConsensus}-frame consensus)`,
        );
        console.log(
          `[🧠 RECOGNITION] Confirmed: ${match.rollNo} (${(match.score * 100).toFixed(1)}%) (${targetConsensus}-frame)`,
        );
        const screenshot = webcamRef.current?.getScreenshot();
        if (screenshot) setImgSrc(screenshot);

        setIsProcessing(true);
        handleRecognitionComplete(match.rollNo);
      } catch (err: any) {
        console.error("[⚠️ SCAN ERROR]", err);
        setIsScanning(false);
      }
    },
    [modelType, isProcessing, isScanning, lastMatchData],
  );

  const triggerLiveScan = useCallback(() => {
    const video = webcamRef.current?.video;
    if (video && video.readyState === 4) {
      setIsScanning(true);
      setDetectionFeedback("Scanning Database...");
      processLiveFrame(video);
    }
  }, [webcamRef, processLiveFrame]);

  // Detection Loop
  useEffect(() => {
    let animationFrameId: number;

    const detect = async () => {
      const now = performance.now();
      const throttleMs = isIOSDevice.current ? 200 : 100;
      if (now - lastDetectTime.current < throttleMs) {
        animationFrameId = requestAnimationFrame(detect);
        return;
      }
      lastDetectTime.current = now;

      if (typeof window === "undefined" || !isMounted.current) return;

      // Safety: Stop if tab is hidden or a dialog is open
      if (
        document.visibilityState !== "visible" ||
        resultDialog ||
        confirmationData ||
        isBarcodeModalOpen
      ) {
        setIsScanning(false);
        return;
      }

      try {
        if (
          faceLandmarker &&
          !imgSrc &&
          !isProcessing &&
          webcamRef.current?.video?.readyState === 4
        ) {
          const video = webcamRef.current.video;

          if (video.srcObject) {
            try {
              const result = faceLandmarker.detectForVideo(
                video,
                performance.now(),
              );
              lastMediaPipeResult.current = result;
              processResults(result);
            } catch (e) {
              // MediaPipe detection skipped (stream likely closed)
            }
          }
        }
      } catch (e) {
        // Silent catch for frame drops
      }
      animationFrameId = requestAnimationFrame(detect);
    };

    detect();
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    faceLandmarker,
    imgSrc,
    isProcessing,
    resultDialog,
    confirmationData,
    modelType,
    triggerLiveScan,
    isScanning,
  ]);

  const retake = () => {
    setImgSrc(null);
    setError(null);
    setStatusText("");
    setIsFaceValid(false);
    setLivenessScore(0);
    setIsScanning(false);
    consensusBuffer.current = { rollNo: "", count: 0 };
    failureBuffer.current = 0;
  };

  const dataURLtoBlob = (dataurl: string) => {
    const arr = dataurl.split(",");
    const mime = arr[0].match(/:(.*?);/)?.[1];
    const bstr = atob(arr[arr.length - 1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  // Auto-capture logic
  useEffect(() => {
    // SECURITY: Prevent build-time or background execution
    if (
      typeof window === "undefined" ||
      !window.location.pathname.includes("/capture")
    ) {
      return;
    }

    let timerId: NodeJS.Timeout;

    if (
      isFaceValid &&
      !imgSrc &&
      !isProcessing &&
      !isScanning &&
      !confirmationData &&
      !resultDialog &&
      !isBarcodeModalOpen
    ) {
      // Snappy loop: trigger scan every 150ms for temporal consensus
      timerId = setTimeout(() => {
        triggerLiveScan();
      }, 150);
    }

    return () => {
      if (timerId) clearTimeout(timerId);
    };
  }, [
    isFaceValid,
    imgSrc,
    isProcessing,
    isScanning,
    confirmationData,
    resultDialog,
    isBarcodeModalOpen,
    triggerLiveScan,
  ]);

  if (authLoading)
    return (
      <GradientBackground>
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator />
        </div>
      </GradientBackground>
    );

  if (!user) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  if (isRegistrationRequired) {
    if (typeof window !== "undefined") router.push("/complete-profile");
    return null;
  }

  if (!isAdmin && !isKiosk) {
    if (typeof window !== "undefined") router.push("/");
    return null;
  }

  if (!aiLoaded || !faceLandmarker) {
    return (
      <GradientBackground>
        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
          <LoadingIndicator size="lg" />
        </div>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <Navigation />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-36 sm:pt-40 pb-12 flex flex-col">
        <header className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4 w-full sm:w-auto">
            <button
              onClick={() => {
                startGlobalLoading();
                router.push("/");
              }}
              className="p-2 hover:bg-primary/5 rounded-full transition-all text-primary/40 hover:text-primary shrink-0"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-base sm:text-xl font-bold text-primary tracking-[0.2em] uppercase flex-1 sm:flex-none">
              {actionType}
            </h1>
          </div>

          {/* Model Selector Toggle */}
          <div className="flex bg-primary/5 p-1 rounded-2xl border border-primary/10 shadow-inner">
            <button
              onClick={async () => {
                if (modelType === "face-api") return;
                setAiLoaded(false);
                await loadFaceRecognitionModel();
                setModelType("face-api");
                setAiLoaded(true);
              }}
              className={`px-3 sm:px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${
                modelType === "face-api"
                  ? "bg-primary text-background shadow-lg scale-105"
                  : "text-primary/40 hover:text-primary hover:bg-primary/5"
              }`}
            >
              Face-API
            </button>
            <button
              onClick={() => setModelType("ghostface")}
              className={`px-3 sm:px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${
                modelType === "ghostface"
                  ? "bg-secondary text-background shadow-lg scale-105"
                  : "text-primary/40 hover:text-primary hover:bg-primary/5"
              }`}
            >
              GhostFaceNet
            </button>
            <button
              onClick={async () => {
                if (modelType === "edgeface") return;
                setAiLoaded(false);
                await initEdgeFace();
                setModelType("edgeface");
                setAiLoaded(true);
              }}
              className={`px-3 sm:px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${
                modelType === "edgeface"
                  ? "bg-secondary text-background shadow-lg scale-105"
                  : "text-primary/40 hover:text-primary hover:bg-primary/5"
              }`}
            >
              EdgeFace
            </button>
          </div>

          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary border border-primary/10 shrink-0 hidden sm:flex">
            <ScanFace size={20} />
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center">
          <div className="relative w-full max-w-2xl rounded-3xl overflow-hidden bg-black border border-white/5 shadow-2xl aspect-[4/3] sm:aspect-video flex items-center justify-center">
            {imgSrc ? (
              <img
                src={imgSrc}
                className="w-full h-full object-cover block"
                alt="Captured"
              />
            ) : !resultDialog && !isBarcodeModalOpen ? (
              <ReactWebcam
                audio={false}
                ref={webcamRef}
                mirrored={true}
                screenshotFormat="image/jpeg"
                screenshotQuality={1}
                forceScreenshotSourceSize={true}
                className="w-full h-full object-cover block"
                videoConstraints={{
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                  facingMode: "user",
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-primary/20">
                <ScanFace size={64} className="opacity-10 mb-4 animate-pulse" />
                <p className="text-[10px] font-bold uppercase tracking-widest">
                  Scanner Paused
                </p>
              </div>
            )}

            {!imgSrc && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className={`w-40 h-52 sm:w-56 sm:h-72 border-4 border-dashed rounded-[6rem] flex items-center justify-center transition-all duration-300 ${isFaceValid ? "border-primary scale-105" : "border-white/20"}`}
                >
                  <div
                    className={`w-32 h-44 sm:w-48 sm:h-64 border-2 rounded-[5rem] transition-all ${isFaceValid ? "border-primary/40" : "border-white/5"}`}
                  />
                </div>

                <div className="absolute bottom-6 sm:bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center space-y-4">
                  <AnimatePresence>
                    {isScanning && (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.5, opacity: 0 }}
                        className="w-10 h-10 sm:w-12 sm:h-12 bg-black/50 border border-white/10 rounded-full flex items-center justify-center shadow-2xl backdrop-blur-md"
                      >
                        <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div
                    className={`px-4 py-2 rounded-full backdrop-blur-md border text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${isScanning ? "bg-primary/20 border-primary text-primary" : isFaceValid ? "bg-black/60 border-white/20 text-white" : "bg-black/40 border-white/10 text-white/60"}`}
                  >
                    {detectionFeedback}
                  </div>
                </div>
              </div>
            )}

            {/* Processing Overlay */}
            <AnimatePresence>
              {isProcessing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-surface/80 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
                >
                  <div className="w-12 h-12 sm:w-16 sm:h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />
                  <h2 className="text-lg sm:text-xl font-bold text-primary mb-2 uppercase tracking-tight">
                    {statusText}
                  </h2>
                  <p className="text-primary/40 text-[10px] sm:text-sm tracking-widest uppercase">
                    Verifying Identity
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Non-blocking "Face Not Recognized" toast */}
            <AnimatePresence>
              {showNotRecognized && (
                <motion.div
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25 }}
                  className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center space-x-2 bg-secondary text-white px-5 py-2.5 rounded-2xl shadow-2xl pointer-events-none"
                >
                  <AlertCircle size={15} className="shrink-0" />
                  <span className="text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
                    Face Not Recognized
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-8 sm:mt-12 space-y-4 w-full">
            {!imgSrc && (
              <div className="flex flex-col items-center space-y-4">
                <p className="text-primary/30 text-[10px] font-bold uppercase tracking-[0.3em] animate-pulse">
                  Biometric Security Active
                </p>
                {!isStable && (
                  <p className="text-secondary font-bold uppercase text-[8px] animate-bounce">
                    Stability Warning: Excessive Motion
                  </p>
                )}
                {isFaceValid && (
                  <p className="text-primary font-bold uppercase text-[8px]">
                    Identity Alignment Secured
                  </p>
                )}
              </div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-error/10 border border-error/20 p-4 rounded-xl flex items-center justify-center space-x-3 text-error italic mx-auto max-w-sm"
              >
                <AlertCircle size={20} />
                <span className="text-sm font-medium">{error}</span>
              </motion.div>
            )}
          </div>
        </div>
      </main>

      <AnimatePresence>
        {resultDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-primary/20 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-surface p-8 rounded-3xl border border-primary/10 text-center shadow-2xl"
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
                  resultDialog.type === "success"
                    ? "bg-success/20 text-success"
                    : "bg-error/20 text-error"
                }`}
              >
                {resultDialog.type === "success" ? (
                  <CheckCircle size={32} />
                ) : (
                  <AlertCircle size={32} />
                )}
              </div>
              <h2 className="text-xl font-bold text-foreground mb-4 uppercase">
                {resultDialog.title}
              </h2>
              <p className="text-foreground/60 mb-8 whitespace-pre-wrap font-medium">
                {resultDialog.message}
              </p>
              {resultDialog.type === "success" ? (
                <button
                  onClick={() => {
                    setResultDialog(null);
                    router.push("/");
                  }}
                  className="w-full h-12 bg-primary text-background rounded-xl font-bold uppercase tracking-widest transition-all hover:bg-primary/90"
                >
                  Done
                </button>
              ) : (
                <div className="flex flex-col space-y-4">
                  <button
                    onClick={() => {
                      setResultDialog(null);
                      retake();
                    }}
                    className="w-full h-12 bg-primary text-background rounded-xl font-bold uppercase tracking-widest transition-all hover:bg-primary/90"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => {
                      setResultDialog(null);
                      setIsBarcodeModalOpen(true);
                    }}
                    className="w-full h-12 border border-secondary text-secondary hover:bg-secondary/5 rounded-xl font-bold uppercase tracking-widest transition-all text-xs"
                  >
                    Scan Barcode instead
                  </button>
                  <button
                    onClick={() => {
                      setResultDialog(null);
                      startGlobalLoading();
                      router.push("/");
                    }}
                    className="w-full h-12 border border-primary/20 text-primary/60 hover:bg-primary/5 rounded-xl font-bold uppercase tracking-widest transition-all text-xs"
                  >
                    Go Back to Home
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmationData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-primary/30 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-surface p-8 rounded-3xl border border-primary/10 text-center shadow-2xl"
            >
              <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center text-secondary mx-auto mb-6">
                <ScanFace size={32} />
              </div>
              <h2 className="text-xl font-bold text-primary mb-2 uppercase tracking-tight">
                Identity Confirmation
              </h2>
              <p className="text-primary/40 text-[10px] font-bold uppercase tracking-widest mb-6 border-b border-primary/5 pb-4">
                Verify Identification
              </p>
              <div className="mb-8">
                <p className="text-2xl font-bold text-primary uppercase">
                  {confirmationData.rollNo}
                </p>
                {confirmationData.name && (
                  <p className="text-secondary font-semibold uppercase text-xs mt-1 tracking-widest">
                    {confirmationData.name}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <button
                  onClick={() => {
                    setRetryCount((prev) => prev + 1);
                    setConfirmationData(null);
                    retake();
                  }}
                  className="h-12 border border-primary/10 text-primary/60 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-primary/5"
                >
                  No, Retry
                </button>
                <button
                  onClick={confirmAndSync}
                  className="h-12 bg-secondary text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:brightness-110 shadow-lg shadow-secondary/20"
                >
                  Yes, Correct
                </button>
              </div>

              {retryCount >= 1 && (
                <button
                  onClick={() => {
                    setConfirmationData(null);
                    setIsBarcodeModalOpen(true);
                  }}
                  className="w-full h-12 border border-secondary text-secondary hover:bg-secondary/5 rounded-xl font-bold uppercase tracking-widest transition-all text-xs"
                >
                  Scan Barcode instead
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isBarcodeModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-primary/30 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-surface p-8 rounded-3xl border border-primary/10 text-center shadow-2xl flex flex-col justify-between"
            >
              <form onSubmit={handleBarcodeSubmit} className="space-y-6">
                <div className="w-16 h-16 bg-secondary/10 rounded-full flex items-center justify-center text-secondary mx-auto mb-2">
                  <RefreshCw
                    size={32}
                    className="animate-spin duration-[4000ms]"
                  />
                </div>
                <h2 className="text-xl font-bold text-primary uppercase tracking-tight">
                  Enter Roll Number
                </h2>
                <p className="text-primary/40 text-[10px] font-bold uppercase tracking-widest mb-4 border-b border-primary/5 pb-4">
                  Please scan your ID card with your barcode scanner or type
                  manually
                </p>

                <div className="relative">
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={(e) =>
                      setBarcodeInput(e.target.value.toUpperCase())
                    }
                    placeholder="Enter Roll Number"
                    autoFocus
                    className="w-full h-12 px-4 rounded-xl border border-primary/10 bg-black/20 text-center text-lg font-bold tracking-widest text-primary focus:outline-none focus:border-secondary transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBarcodeModalOpen(false);
                      setBarcodeInput("");
                      retake();
                    }}
                    className="h-12 border border-primary/10 text-primary/60 rounded-xl font-bold uppercase tracking-widest text-[10px] hover:bg-primary/5"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-12 bg-secondary text-white rounded-xl font-bold uppercase tracking-widest text-[10px] hover:brightness-110 shadow-lg shadow-secondary/20 transition-all"
                  >
                    Submit
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </GradientBackground>
  );
}

export default function CapturePage() {
  return (
    <Suspense
      fallback={
        <GradientBackground>
          <div className="flex-1 flex items-center justify-center">
            <LoadingIndicator />
          </div>
        </GradientBackground>
      }
    >
      <CaptureContent />
    </Suspense>
  );
}
