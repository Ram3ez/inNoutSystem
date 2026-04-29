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
import { useRouter, useSearchParams } from "next/navigation";
import { databases, tablesDB, ID } from "@/lib/appwrite";
import { Query } from "appwrite";
import { DB_ID, COLLECTIONS } from "@/lib/constants";
import Link from "next/link";
import {
  loadFaceApiModels,
  loadFaceCache,
  getBestMatch,
  isAIReady,
} from "@/lib/faceCache";
import {
  getLandmarker,
  isLandmarkerLoaded,
  getLandmarkerSync,
} from "@/lib/aiEngine";
import * as faceapi from "face-api.js";
import { addToOfflineQueue, isSystemOnline } from "@/lib/offlineQueue";

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
    typeof window !== "undefined" ? getLandmarkerSync() : null,
  );
  const [isFaceValid, setIsFaceValid] = useState(false);
  const [detectionFeedback, setDetectionFeedback] =
    useState("Initializing AI...");
  const [isScanning, setIsScanning] = useState(false);
  const [aiLoaded, setAiLoaded] = useState(
    typeof window !== "undefined" ? isAIReady() && isLandmarkerLoaded() : false,
  );
  const [showNotRecognized, setShowNotRecognized] = useState(false);

  // Liveness & Blur states
  const [livenessScore, setLivenessScore] = useState(0);
  const [isStable, setIsStable] = useState(true);
  const lastLandmarks = useRef<any>(null);
  const consensusBuffer = useRef<{ rollNo: string; count: number }>({
    rollNo: "",
    count: 0,
  });

  const webcamRef = useRef<ReactWebcam>(null);

  const isMounted = useRef(true);

  // Initialize face-api cache + MediaPipe — singletons, only runs once per session
  useEffect(() => {
    isMounted.current = true;
    // If already loaded in background (e.g. from Home page), skip the await chain for instant UI
    if (isAIReady() && isLandmarkerLoaded()) {
      setFaceLandmarker(getLandmarkerSync());
      setAiLoaded(true);
      return;
    }

    const init = async () => {
      try {
        // These return existing promises if already loading
        await Promise.all([
          loadFaceApiModels(),
          loadFaceCache(),
          getLandmarker(),
        ]);

        if (isMounted.current) {
          setFaceLandmarker(getLandmarkerSync());
          setAiLoaded(true);
        }
      } catch (e) {
        console.error("Failed to initialize AI engine", e);
      }
    };
    init();

    return () => {
      isMounted.current = false;
    };
  }, []);

  // Detection Loop
  useEffect(() => {
    let animationFrameId: number;

    const detect = async () => {
      if (typeof window === "undefined" || !isMounted.current) return;

      // Safety: Stop if tab is hidden
      if (document.visibilityState !== "visible") {
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
  }, [faceLandmarker, imgSrc, isProcessing]);

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

      const stable = movement < 0.02; // Increased from 0.008 for better tolerance
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
    }
  };

  const triggerLiveScan = useCallback(() => {
    const video = webcamRef.current?.video;
    if (video && video.readyState === 4) {
      setIsScanning(true);
      setDetectionFeedback("Scanning Database...");
      processLiveFrame(video);
    }
  }, [webcamRef]);

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
      !confirmationData
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
    triggerLiveScan,
  ]);

  const retake = () => {
    setImgSrc(null);
    setError(null);
    setStatusText("");
    setIsFaceValid(false);
    setLivenessScore(0);
    setIsScanning(false);
    consensusBuffer.current = { rollNo: "", count: 0 };
  };

  // Helper to convert base64 to Blob without fetch
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

  const lastLogTime = useRef<number>(0);

  const processLiveFrame = async (videoElement: HTMLVideoElement) => {
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
      if ((faceapi as any).tf && (faceapi as any).tf.engine) {
        (faceapi as any).tf.engine().startScope();
      }

      // Yield to the browser for 10ms to keep UI/Animations smooth
      await new Promise((r) => setTimeout(r, 10));
      if (!isMounted.current) return;

      const detection = await faceapi
        .detectSingleFace(videoElement, SSD_OPTIONS)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!isMounted.current) return;

      if (!detection) {
        setIsScanning(false);
        consensusBuffer.current = { rollNo: "", count: 0 };
        return;
      }

      const match = getBestMatch(detection.descriptor);

      // --- TEMPORAL CONSENSUS ---
      if (match.rollNo === "Unknown") {
        consensusBuffer.current = { rollNo: "", count: 0 };

        // Throttle conflict logs to once every 2 seconds to prevent network lag
        const now = Date.now();
        if (match.conflictWith && now - lastLogTime.current > 2000) {
          lastLogTime.current = now;
          serverLog(
            "CONFLICT",
            `Identity conflict: ${match.potentialMatch} vs ${match.conflictWith}. Gap too small.`,
          );
        }

        setIsScanning(false);
        setDetectionFeedback("Match Uncertain...");
        return;
      }

      // If we match the same person as the previous frame, increment count
      if (consensusBuffer.current.rollNo === match.rollNo) {
        consensusBuffer.current.count++;
      } else {
        consensusBuffer.current.rollNo = match.rollNo;
        consensusBuffer.current.count = 1;
      }

      // Only proceed after 5 consistent matches (approx 0.7s)
      if (consensusBuffer.current.count < 2) {
        setDetectionFeedback(`Verifying... ${consensusBuffer.current.count}/5`);
        setIsScanning(false);
        return;
      }

      // Success! Lock the identity
      serverLog(
        "RECOGNITION",
        `Confirmed: ${match.rollNo} (2-frame consensus)`,
      );
      const screenshot = webcamRef.current?.getScreenshot();
      if (screenshot) setImgSrc(screenshot);

      setIsProcessing(true);
      handleRecognitionComplete(match.rollNo);
    } catch (err: any) {
      setIsScanning(false);
    } finally {
      try {
        const tf = (faceapi as any).tf;
        if (
          isMounted.current &&
          tf &&
          tf.engine &&
          tf.engine().state.numDataBuffers > 0
        ) {
          tf.engine().endScope();
        }
      } catch (e) {}
    }
  };

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
        /*
        const student = await databases.getDocument({
          databaseId: DB_ID,
          collectionId: COLL_STUDENTS,
          documentId: rollNumber,
        });
        */
        const student = await tablesDB.getRow({
          databaseId: DB_ID,
          tableId: COLL_STUDENTS,
          rowId: rollNumber,
        });
        setConfirmationData({
          rollNo: rollNumber,
          name: (student as any).name,
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

      // Check if we are offline BEFORE attempting network request
      if (!isSystemOnline()) {
        addToOfflineQueue(rollNumber);
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
        const COLL_LEAVE = COLLECTIONS.LEAVE;
        /*
        const searchResult = await databases.listDocuments({
          databaseId: DB_ID,
          collectionId: COLL_LEAVE,
          queries: [
            Query.equal("roll_no", rollNumber),
            Query.orderDesc("$createdAt"),
            Query.limit(1),
          ]
        });
        */
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

        // If the latest leave is already completed, they need to apply for a new one
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
          // Returning
          const {
            $id,
            $tableId,
            $databaseId,
            $createdAt,
            $updatedAt,
            $permissions,
            ...archiveData
          } = latestLeave as any;

          archiveData.in_date_time = currentTime;
          const COLL_LEAVE_ARCHIVE = COLLECTIONS.LEAVE_ARCHIVE;
          /*
          await databases.createDocument({
            databaseId: DB_ID,
            collectionId: COLL_LEAVE_ARCHIVE,
            documentId: ID.unique(),
            data: archiveData,
          });
          await databases.deleteDocument({
            databaseId: DB_ID,
            collectionId: COLL_LEAVE,
            documentId: latestLeave.$id
          });
          await databases.updateDocument({
            databaseId: DB_ID,
            collectionId: COLL_STUDENTS,
            documentId: rollNumber,
            data: {
              is_on_leave: false,
            }
          });
          */
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
          // Departing
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const proposed = new Date(latestLeave.proposed_exit_date);
          proposed.setHours(0, 0, 0, 0);

          if (today < proposed) {
            setResultDialog({
              title: "Departure Denied",
              message: `${rollNumber}\n\nTOO EARLY FOR DEPARTURE.\nPROPOSED DATE: ${new Date(latestLeave.proposed_exit_date).toLocaleDateString()}\nCURRENT DATE: ${new Date().toLocaleDateString()}`,
              type: "error",
            });
            setIsProcessing(false);
            return;
          }

          /*
          await databases.updateDocument({
            databaseId: DB_ID,
            collectionId: COLL_LEAVE,
            documentId: latestLeave.$id,
            data: {
              exit_date_time: currentTime,
            }
          });
          await databases.updateDocument({
            databaseId: DB_ID,
            collectionId: COLL_STUDENTS,
            documentId: rollNumber,
            data: {
              is_on_leave: true,
            }
          });
          */
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
        } else {
          setResultDialog({
            title: "Leave Denied",
            message: `${rollNumber}\n\nLATEST LEAVE ALREADY COMPLETED.\nPLEASE APPLY FOR NEW LEAVE.`,
            type: "error",
          });
          setIsProcessing(false);
          return;
        }
      } else {
        /*
        const searchResult = await databases.listDocuments({
          databaseId: DB_ID,
          collectionId: COLL_OUTING,
          queries: [
            Query.equal("roll_no", rollNumber),
            Query.orderDesc("out_time"),
            Query.limit(1),
          ]
        });
        */
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
          // 1. Move to Archive
          /*
          await databases.createDocument({
            databaseId: DB_ID,
            collectionId: COLL_ARCHIVE,
            documentId: ID.unique(),
            data: {
              roll_no: rollNumber,
              out_time: openOuting.out_time,
              in_time: currentTime,
            }
          });
          // 2. Delete from active Outings
          await databases.deleteDocument({
            databaseId: DB_ID,
            collectionId: COLL_OUTING,
            documentId: openOuting.$id
          });
          await databases.updateDocument({
            databaseId: DB_ID,
            collectionId: COLL_STUDENTS,
            documentId: rollNumber,
            data: {
              is_out: false,
            }
          });
          */
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
          /*
          await databases.createDocument({
            databaseId: DB_ID,
            collectionId: COLL_OUTING,
            documentId: ID.unique(),
            data: {
              roll_no: rollNumber,
              out_time: currentTime,
            }
          });
          await databases.updateDocument({
            databaseId: DB_ID,
            collectionId: COLL_STUDENTS,
            documentId: rollNumber,
            data: {
              is_out: true,
            }
          });
          */
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

      serverLog(
        "SYNC",
        `Database synched: Check-in/Check-out completed for ${rollNumber}`,
      );

      setResultDialog({
        title: "Database Synced",
        message: `${rollNumber}\n\n${dbMessage}`,
        type: "success",
      });
    } catch (err: any) {
      console.error("Sync failed", err);
      // Only treat as offline if it's a genuine network failure
      const isNetworkError =
        err instanceof TypeError && err.message.toLowerCase().includes("fetch");
      if (isNetworkError) {
        addToOfflineQueue(rollNumber);
        setResultDialog({
          title: "Offline Capture",
          message: `${rollNumber}\n\nNETWORK ERROR\nSAVED LOCALLY FOR SYNC`,
          type: "success",
        });
      } else {
        // Application/database error — show real error message
        setResultDialog({
          title: "Sync Error",
          message: `${rollNumber}\n\n${err?.message || "An unexpected error occurred"}`,
          type: "error",
        });
      }
    } finally {
      setIsProcessing(false);
      try {
        const tf = (faceapi as any).tf;
        if (tf && tf.engine && tf.engine().state.numDataBuffers > 0) {
          tf.engine().endScope();
        }
      } catch (e) {
        // Silently handle if scope already closed
      }
    }
  };

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
          <LoadingIndicator />
          <div className="text-secondary font-bold uppercase tracking-widest text-xs animate-pulse text-center">
            <p>Warming Up Neural Engine</p>
            <p className="text-[10px] text-primary/40 mt-1 font-bold">
              Loading Biometric Weights
            </p>
          </div>
        </div>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <Navigation />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-36 sm:pt-40 pb-12 flex flex-col">
        <header className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="p-2 hover:bg-primary/5 rounded-full transition-all text-primary/40 hover:text-primary shrink-0"
          >
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-base sm:text-xl font-bold text-primary tracking-[0.2em] uppercase text-center flex-1 mx-4">
            {actionType}
          </h1>
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary border border-primary/10 shrink-0">
            <ScanFace size={20} />
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center">
          <div className="relative w-full max-w-2xl rounded-3xl overflow-hidden bg-black border border-white/5 shadow-2xl aspect-[4/3] sm:aspect-video flex items-center justify-center">
            {!imgSrc ? (
              <ReactWebcam
                audio={false}
                ref={webcamRef}
                mirrored={true}
                screenshotFormat="image/jpeg"
                screenshotQuality={1}
                forceScreenshotSourceSize={true}
                className="w-full h-full object-cover block"
                videoConstraints={{
                  width: 1280,
                  height: 720,
                  facingMode: "user",
                }}
              />
            ) : (
              <img
                src={imgSrc}
                className="w-full h-full object-cover block"
                alt="Captured"
              />
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
              <button
                onClick={() => {
                  const type = resultDialog.type;
                  setResultDialog(null);
                  if (type === "success") {
                    router.push("/");
                  } else {
                    retake();
                  }
                }}
                className="w-full h-12 bg-primary text-background rounded-xl font-bold uppercase tracking-widest transition-all hover:bg-primary/90"
              >
                {resultDialog.type === "success" ? "Done" : "Try Again"}
              </button>
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

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => {
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
