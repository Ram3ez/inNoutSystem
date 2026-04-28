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
import { databases, ID } from "@/lib/appwrite";
import { Query } from "appwrite";
import Link from "next/link";

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
    null,
  );
  const [isFaceValid, setIsFaceValid] = useState(false);
  const [detectionFeedback, setDetectionFeedback] =
    useState("Initializing AI...");
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);

  // Liveness & Blur states
  const [livenessScore, setLivenessScore] = useState(0);
  const [isStable, setIsStable] = useState(true);
  const lastLandmarks = useRef<any>(null);

  const webcamRef = useRef<ReactWebcam>(null);

  // Initialize MediaPipe
  useEffect(() => {
    const initLandmarker = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `/mediapipe/face_landmarker.task`,
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          outputFaceBlendshapes: true,
        });
        setFaceLandmarker(landmarker);
      } catch (err) {
        console.error("Failed to init FaceLandmarker:", err);
      }
    };
    initLandmarker();
  }, []);

  // Detection Loop
  useEffect(() => {
    let animationFrameId: number;

    const detect = async () => {
      if (
        faceLandmarker &&
        !imgSrc &&
        !isProcessing &&
        webcamRef.current?.video?.readyState === 4
      ) {
        const video = webcamRef.current.video;
        const result = faceLandmarker.detectForVideo(video, performance.now());
        processResults(result);
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

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setImgSrc(imageSrc);
      // Auto-submit after capture for outing
      setTimeout(() => {
        submitImageFromSrc(imageSrc);
      }, 500);
    }
  }, [webcamRef]);

  // Auto-capture logic
  useEffect(() => {
    let timerId: NodeJS.Timeout;
    let countdownId: NodeJS.Timeout;

    if (isFaceValid && !imgSrc && !isProcessing) {
      setCaptureCountdown(2); // Reduced to 2 seconds

      countdownId = setInterval(() => {
        setCaptureCountdown((prev) =>
          prev !== null && prev > 1 ? prev - 1 : prev,
        );
      }, 1000);

      timerId = setTimeout(() => {
        capture();
        setCaptureCountdown(null);
        setLivenessScore(0);
      }, 2000);
    } else {
      setCaptureCountdown(null);
    }

    return () => {
      if (timerId) clearTimeout(timerId);
      if (countdownId) clearInterval(countdownId);
    };
  }, [isFaceValid, imgSrc, isProcessing, capture]);

  const retake = () => {
    setImgSrc(null);
    setError(null);
    setStatusText("");
    setIsFaceValid(false);
    setLivenessScore(0);
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

  const submitImageFromSrc = async (source: string) => {
    setIsProcessing(true);
    setStatusText("Analyzing Face...");
    setError(null);

    try {
      const blob = dataURLtoBlob(source);
      const file = new File([blob], "capture.jpg", { type: "image/jpeg" });
      const formData = new FormData();
      formData.append("image", file);

      const recognizeRes = await fetch("/api/recognize", {
        method: "POST",
        body: formData,
      });

      if (!recognizeRes.ok) {
        const errorData = await recognizeRes.text();
        throw new Error(`AI Engine error: ${errorData}`);
      }

      const result = await recognizeRes.json();
      const recognitionResult = result.roll_no || result.result || "Unknown";
      handleRecognitionComplete(recognitionResult);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
      setIsProcessing(false);
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
      return;
    }

    try {
      const DB_ID = "69cb970a000853f23489";
      const COLL_STUDENTS = "student_details";
      try {
        const student = await databases.getDocument(
          DB_ID,
          COLL_STUDENTS,
          rollNumber,
        );
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
    }
  };

  const confirmAndSync = async () => {
    if (!confirmationData) return;

    const rollNumber = confirmationData.rollNo;
    setConfirmationData(null);
    setIsProcessing(true);
    setStatusText(`Syncing Data for ${rollNumber}...`);

    try {
      const DB_ID = "69cb970a000853f23489";
      const COLL_OUTING = "outing";
      const COLL_STUDENTS = "student_details";

      const searchResult = await databases.listDocuments(DB_ID, COLL_OUTING, [
        Query.equal("roll_no", rollNumber),
      ]);

      const currentTime = new Date().toISOString();
      let dbMessage = "";

      const openOuting = searchResult.documents.find((doc) => !doc.in_time);

      if (openOuting) {
        await databases.updateDocument(DB_ID, COLL_OUTING, openOuting.$id, {
          in_time: currentTime,
        });

        try {
          await databases.updateDocument(DB_ID, COLL_STUDENTS, rollNumber, {
            is_out: false,
          });
        } catch (e) {
          console.warn("Student info sync failed", e);
        }

        dbMessage = "CHECK-IN SUCCESSFUL";
      } else {
        await databases.createDocument(DB_ID, COLL_OUTING, ID.unique(), {
          roll_no: rollNumber,
          out_time: currentTime,
        });

        try {
          await databases.updateDocument(DB_ID, COLL_STUDENTS, rollNumber, {
            is_out: true,
          });
        } catch (e) {
          console.warn("Student info sync failed", e);
        }

        dbMessage = "CHECK-OUT SUCCESSFUL";
      }

      setResultDialog({
        title: "Database Synced",
        message: `${rollNumber}\n\n${dbMessage}`,
        type: "success",
      });
    } catch (err: any) {
      setError(`Database sync failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
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

  return (
    <GradientBackground>
      <Navigation />

      <main className="flex-1 max-w-2xl mx-auto w-full px-6 pt-32 pb-12 flex flex-col italic">
        <header className="mb-8 flex items-center justify-between">
          <Link
            href="/"
            className="p-2 hover:bg-white/5 rounded-full transition-all text-white/40 hover:text-white"
          >
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-xl font-bold text-white tracking-widest uppercase italic">
            {actionType} System
          </h1>
          <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center text-primary border border-primary/20">
            <ScanFace size={20} />
          </div>
        </header>

        <div className="flex-1 flex flex-col">
          <div className="relative w-full rounded-3xl overflow-hidden bg-black border border-white/5 shadow-2xl">
            {!imgSrc ? (
              <ReactWebcam
                audio={false}
                ref={webcamRef}
                mirrored={true}
                screenshotFormat="image/jpeg"
                screenshotQuality={1}
                forceScreenshotSourceSize={true}
                className="w-full h-auto block"
                videoConstraints={{
                  width: 1280,
                  height: 720,
                  facingMode: "user",
                }}
              />
            ) : (
              <img
                src={imgSrc}
                className="w-full h-auto block"
                alt="Captured"
              />
            )}

            {!imgSrc && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className={`w-56 h-72 border-4 border-dashed rounded-[6rem] flex items-center justify-center transition-all duration-300 ${isFaceValid ? "border-primary scale-105" : "border-white/20"}`}
                >
                  <div
                    className={`w-48 h-64 border-2 rounded-[5rem] transition-all ${isFaceValid ? "border-primary/40" : "border-white/5"}`}
                  />
                </div>

                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center space-y-4">
                  <AnimatePresence>
                    {captureCountdown !== null && (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1.2, opacity: 1 }}
                        exit={{ scale: 2, opacity: 0 }}
                        className="w-16 h-16 bg-primary text-white rounded-full flex items-center justify-center text-2xl font-black italic shadow-2xl"
                      >
                        {captureCountdown}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div
                    className={`px-4 py-2 rounded-full backdrop-blur-md border text-[10px] font-black uppercase tracking-widest transition-all ${isFaceValid ? "bg-primary/20 border-primary text-primary" : "bg-black/50 border-white/10 text-white/40"}`}
                  >
                    {detectionFeedback}
                  </div>
                </div>
              </div>
            )}

            <AnimatePresence>
              {isProcessing && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-background/80 backdrop-blur-md flex flex-col items-center justify-center p-8 text-center"
                >
                  <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6" />
                  <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-tight">
                    {statusText}
                  </h2>
                  <p className="text-white/40 text-sm tracking-widest uppercase italic">
                    Processing secure verification
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-12 space-y-4">
            {!imgSrc && (
              <div className="flex flex-col items-center space-y-4">
                <p className="text-white/20 text-[10px] font-black uppercase tracking-[0.3em] animate-pulse italic">
                  Hands-Free AI Guard Active
                </p>
                {!isStable && (
                  <p className="text-error font-black uppercase text-[8px] animate-bounce italic">
                    Stability Warning: Excessive Motion Blur
                  </p>
                )}
                {isFaceValid && (
                  <p className="text-primary font-black uppercase text-[8px] italic">
                    AI Alignment Secured
                  </p>
                )}
              </div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-error/10 border border-error/20 p-4 rounded-xl flex items-center space-x-3 text-error italic"
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
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background/90 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-surface p-8 rounded-3xl border border-white/10 text-center shadow-2xl"
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6 ${
                  resultDialog.type === "success"
                    ? "bg-primary/20 text-primary"
                    : "bg-error/20 text-error"
                }`}
              >
                {resultDialog.type === "success" ? (
                  <CheckCircle size={32} />
                ) : (
                  <AlertCircle size={32} />
                )}
              </div>
              <h2 className="text-2xl font-bold text-white mb-4 uppercase italic">
                {resultDialog.title}
              </h2>
              <p className="text-white/60 mb-8 whitespace-pre-wrap font-medium">
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
                className="w-full h-12 bg-white text-black rounded-xl font-bold uppercase tracking-widest transition-all hover:bg-gray-100 italic"
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
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-background/90 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-surface p-8 rounded-3xl border border-white/10 text-center shadow-2xl italic"
            >
              <div className="w-16 h-16 bg-secondary/20 rounded-full flex items-center justify-center text-secondary mx-auto mb-6">
                <ScanFace size={32} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2 uppercase tracking-tight">
                Identity Confirmation
              </h2>
              <p className="text-white/40 text-xs font-bold uppercase tracking-widest mb-6 border-b border-white/5 pb-4">
                Are you identified as:
              </p>
              <div className="mb-8">
                <p className="text-2xl font-bold text-white uppercase italic">
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
                  className="h-12 border border-white/10 text-white/60 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-white/5"
                >
                  No, Retry
                </button>
                <button
                  onClick={confirmAndSync}
                  className="h-12 bg-white text-black rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-gray-100"
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
