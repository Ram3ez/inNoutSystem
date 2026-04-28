"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaceLandmarker,
  FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  Camera,
  Upload,
  UserPlus,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  X,
  Image as ImageIcon,
  ScanFace,
  Search,
  UserCheck,
  Trash2,
} from "lucide-react";
import ReactWebcam from "react-webcam";
import { GradientBackground } from "@/components/GradientBackground";
import { Navigation } from "@/components/Navigation";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { databases } from "@/lib/appwrite";
import { Query } from "appwrite";
import { generateAugmentations } from "@/lib/augmentFace";
import { uploadEmbeddings, loadFaceApiModels, areModelsLoaded } from "@/lib/faceCache";
import { getLandmarker, isLandmarkerLoaded, getLandmarkerSync } from "@/lib/aiEngine";
import * as faceapi from "face-api.js";

const DB_ID = "69cb970a000853f23489";
const COLL_STUDENTS = "student_details";

// Target number of embeddings to collect for a high-accuracy profile
const TARGET_EMBEDDINGS = 8;

export default function RegisterFacePage() {
  const { user, isLoading: authLoading, isAdmin, isKiosk } = useAuth();
  const router = useRouter();

  const serverLog = (action: string, message: string) => {
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, message }),
    }).catch(() => {});
  };

  const [pendingStudents, setPendingStudents] = useState<any[]>([]);
  const [selectedRollNo, setSelectedRollNo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [aiLoaded, setAiLoaded] = useState(false);

  // Unified Enrollment Pipeline States
  const [collectedEmbeddings, setCollectedEmbeddings] = useState<
    Float32Array[]
  >([]);
  const [enrollmentStatus, setEnrollmentStatus] = useState<
    "idle" | "scanning" | "processing" | "done"
  >("idle");
  const [isFaceValid, setIsFaceValid] = useState(false);
  const [detectionFeedback, setDetectionFeedback] =
    useState("Initializing AI...");
  const [isStable, setIsStable] = useState(true);
  const [livenessScore, setLivenessScore] = useState(0);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(
    null,
  );

  const lastLandmarks = useRef<any>(null);
  const lastExtractionTime = useRef<number>(0);
  const collectedCountRef = useRef<number>(0); // ref so detection loop reads live value
  const extractionInterval = 500; // ms between extractions

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const webcamRef = useRef<ReactWebcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize face-api models + MediaPipe — singletons, only warm up once per session
  React.useEffect(() => {
    // If already loaded in background (e.g. from Home page), skip the await chain for instant UI
    if (areModelsLoaded() && isLandmarkerLoaded()) {
      setFaceLandmarker(getLandmarkerSync());
      setAiLoaded(true);
    } else {
      const init = async () => {
        try {
          // Both return existing promises if already loading
          await Promise.all([
            loadFaceApiModels(),
            getLandmarker()
          ]);
          setFaceLandmarker(getLandmarkerSync());
          setAiLoaded(true);
        } catch (e) {
          console.error("Failed to initialize AI engine", e);
        }
      };
      init();
    }

    if (!authLoading && (isAdmin || isKiosk)) {
      fetchPendingStudents();
    }
  }, [authLoading, isAdmin, isKiosk]);

  const fetchPendingStudents = async () => {
    try {
      const resp = await databases.listDocuments(DB_ID, COLL_STUDENTS, [
        Query.equal("faceRegistered", false),
        Query.limit(100),
      ]);
      setPendingStudents(resp.documents);
      setIsDataLoaded(true);
    } catch (err) {
      console.error("Failed to fetch pending students", err);
    }
  };

  // Detection Loop
  useEffect(() => {
    let animationFrameId: number;

    const detect = async () => {
      if (faceLandmarker && webcamRef.current?.video?.readyState === 4) {
        const video = webcamRef.current.video;
        const result = faceLandmarker.detectForVideo(video, performance.now());

        processResults(result);
      }
      animationFrameId = requestAnimationFrame(detect);
    };

    if (isCapturing) {
      detect();
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [faceLandmarker, isCapturing]);

  const processResults = async (result: FaceLandmarkerResult) => {
    if (enrollmentStatus !== "scanning") return;

    if (result.faceLandmarks.length === 0) {
      setIsFaceValid(false);
      setDetectionFeedback("Bring Face into Frame");
      return;
    }

    const landmarks = result.faceLandmarks[0];

    // --- 1. Stability & Motion Detection ---
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

      const stable = movement < 0.02;
      setIsStable(stable);
      if (!stable) {
        setDetectionFeedback("Please Hold Still...");
        lastLandmarks.current = landmarks;
        return;
      }
    }
    lastLandmarks.current = landmarks;

    // --- 2. Live Pose-Driven Guidance ---
    // We read from a ref so we always have the current count,
    // even though processResults runs in a stale rAF closure.
    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const forehead = landmarks[10];
    const chin = landmarks[152];

    const yaw =
      (nose.x - (leftEye.x + rightEye.x) / 2) / (rightEye.x - leftEye.x);
    const pitch =
      (nose.y - (leftEye.y + rightEye.y) / 2) / (chin.y - forehead.y);

    const count = collectedCountRef.current;
    const total = TARGET_EMBEDDINGS;

    // Guide the user through poses based on actual live head angle,
    // not a rigid phase counter — so it responds to what they're actually doing.
    if (count < Math.floor(total * 0.25)) {
      // Phase 1: center baseline
      setDetectionFeedback(
        Math.abs(yaw) < 0.1 && Math.abs(pitch) < 0.1
          ? "Hold Still — Capturing"
          : "Look straight at the camera",
      );
    } else if (count < Math.floor(total * 0.5)) {
      // Phase 2: want a left turn — encourage if not there yet
      setDetectionFeedback(
        yaw < -0.15
          ? "Hold Still — Capturing"
          : "Slowly turn your head left",
      );
    } else if (count < Math.floor(total * 0.75)) {
      // Phase 3: want a right turn
      setDetectionFeedback(
        yaw > 0.15
          ? "Hold Still — Capturing"
          : "Slowly turn your head right",
      );
    } else {
      // Phase 4: want a slight down-tilt (chin down) then up
      setDetectionFeedback(
        pitch > 0.1
          ? "Hold Still — Capturing"
          : "Tilt your head slightly down",
      );
    }

    // --- 3. Live Embedding Extraction ---
    const now = performance.now();
    if (now - lastExtractionTime.current > extractionInterval) {
      lastExtractionTime.current = now;
      extractEmbedding();
    }
  };

  const extractEmbedding = async () => {
    if (!webcamRef.current?.video || enrollmentStatus !== "scanning") return;

    try {
      const video = webcamRef.current.video;

      if ((faceapi as any).tf && (faceapi as any).tf.engine) {
        (faceapi as any).tf.engine().startScope();
      }

      await new Promise((r) => setTimeout(r, 50));

      const detectConfig = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 });
      const detection = await faceapi
        .detectSingleFace(video, detectConfig)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (detection) {
        const newDescriptor = detection.descriptor;

        setCollectedEmbeddings((prev) => {
          if (prev.length >= TARGET_EMBEDDINGS) return prev;

          // Diversity gate
          const DIVERSITY_THRESHOLD = 0.97;
          const isDuplicate = prev.some((existing) => {
            let dot = 0, normA = 0, normB = 0;
            for (let i = 0; i < existing.length; i++) {
              dot   += existing[i] * newDescriptor[i];
              normA += existing[i] * existing[i];
              normB += newDescriptor[i] * newDescriptor[i];
            }
            return dot / (Math.sqrt(normA) * Math.sqrt(normB)) > DIVERSITY_THRESHOLD;
          });

          if (isDuplicate) return prev;

          const next = [...prev, newDescriptor];
          collectedCountRef.current = next.length;
          if (next.length === TARGET_EMBEDDINGS) {
            setTimeout(() => handleEnrollmentComplete(next), 0);
          }
          return next;
        });

        serverLog("REGISTRATION", `Extracted Organic Embedding #${collectedCountRef.current}`);
      }

      if ((faceapi as any).tf && (faceapi as any).tf.engine) {
        (faceapi as any).tf.engine().endScope();
      }
    } catch (err) {
      console.error("Embedding extraction failed:", err);
    }
  };

  /** Adjusts brightness of a canvas by offset (e.g. +40, -40) and returns new canvas */
  const adjustBrightness = (source: HTMLCanvasElement, offset: number): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    c.width = source.width;
    c.height = source.height;
    const ctx = c.getContext("2d");
    if (!ctx) return c;
    ctx.drawImage(source, 0, 0);
    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i]   = Math.min(255, Math.max(0, imgData.data[i]   + offset));
      imgData.data[i+1] = Math.min(255, Math.max(0, imgData.data[i+1] + offset));
      imgData.data[i+2] = Math.min(255, Math.max(0, imgData.data[i+2] + offset));
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  };

  const handleEnrollmentComplete = async (embeddings: Float32Array[]) => {
    if (enrollmentStatus === "processing" || enrollmentStatus === "done") return;

    setEnrollmentStatus("processing");
    setIsSubmitting(true);
    setStatusText("Processing biometric profile...");
    setIsCapturing(false);

    try {
      if (!selectedRollNo) throw new Error("Roll Number lost during session");

      setStatusText("Generating augmented identity cluster...");
      await new Promise((r) => setTimeout(r, 100));

      // --- Brightness augmentation (runs once at completion, not in the loop) ---
      // Capture the current video frame into a canvas, then shift brightness ±40
      // and extract 2 extra descriptors to improve lighting robustness.
      let finalEmbeddings = [...embeddings];
      const video = webcamRef.current?.video;
      if (video && video.readyState === 4) {
        try {
          // Draw current frame
          const frameCanvas = document.createElement("canvas");
          frameCanvas.width = video.videoWidth;
          frameCanvas.height = video.videoHeight;
          const fCtx = frameCanvas.getContext("2d");
          if (fCtx) {
            fCtx.drawImage(video, 0, 0);

            const detectConfig = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

            // Bright + and bright - variants
            for (const offset of [40, -40]) {
              const augCanvas = adjustBrightness(frameCanvas, offset);
              const det = await faceapi
                .detectSingleFace(augCanvas, detectConfig)
                .withFaceLandmarks()
                .withFaceDescriptor();
              if (det) {
                finalEmbeddings.push(det.descriptor);
                serverLog("REGISTRATION", `Augmented embedding (brightness ${offset > 0 ? "+" : ""}${offset})`);
              }
              // Free the canvas
              augCanvas.width = 0;
              augCanvas.height = 0;
            }
            frameCanvas.width = 0;
            frameCanvas.height = 0;
          }
        } catch (augErr) {
          console.warn("Augmentation step failed (non-critical):", augErr);
        }
      }

      // Push all embeddings (organic + augmented) to Appwrite
      await uploadEmbeddings(selectedRollNo, finalEmbeddings);

      try {
        await databases.updateDocument(DB_ID, COLL_STUDENTS, selectedRollNo, {
          faceRegistered: true,
        });
      } catch (dbErr) {
        console.warn("Could not update faceRegistered status in DB", dbErr);
      }

      setEnrollmentStatus("done");
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Enrollment failed");
      setEnrollmentStatus("idle");
    } finally {
      setIsSubmitting(false);
    }
  };

  const startEnrollment = () => {
    if (!selectedRollNo) {
      setError("Please select a student first");
      return;
    }
    setError(null);
    collectedCountRef.current = 0;
    setCollectedEmbeddings([]);
    setEnrollmentStatus("scanning");
    setIsCapturing(true);
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

  if (!isAdmin && !isKiosk) {
    if (typeof window !== "undefined") router.push("/");
    return null;
  }

  if (!aiLoaded || !faceLandmarker) {
    return (
      <GradientBackground>
        <div className="flex-1 flex flex-col items-center justify-center space-y-6">
          <LoadingIndicator />
          <div className="text-secondary font-black uppercase tracking-widest text-xs animate-pulse text-center">
            <p>Warming Up Neural Engine</p>
            <p className="text-[10px] text-white/40 mt-1">
              Loading Biometric Weights (Enrollment)
            </p>
          </div>
        </div>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <Navigation />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 pt-24 sm:pt-32 pb-12">
        <header className="mb-12 flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <Link
              href="/"
              className="p-2 hover:bg-primary/5 rounded-full transition-all text-primary/40 hover:text-primary shrink-0"
            >
              <ArrowLeft size={24} />
            </Link>
            <div className="text-left">
              <p className="text-secondary font-bold tracking-[0.2em] text-[10px] sm:text-xs uppercase mb-1">
                Onboarding
              </p>
              <h1 className="text-xl sm:text-3xl font-bold text-primary tracking-tight uppercase leading-tight">
                Registration
              </h1>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-2 text-primary/40 bg-primary/5 px-4 py-2 rounded-full border border-primary/5 shadow-sm">
            <ScanFace size={18} className="text-secondary" />
            <span className="text-xs font-bold uppercase tracking-wider">
              Profile Enrollment
            </span>
          </div>
        </header>

        <form onSubmit={(e) => e.preventDefault()} className="space-y-12">
          {/* Student Selection Section */}
          <section className="bg-surface border border-primary/5 rounded-[2.5rem] p-6 sm:p-8 shadow-md">
            <div className="space-y-6">
              <div className="flex items-center space-x-3 mb-2">
                <Search size={18} className="text-secondary" />
                <h2 className="text-primary font-bold uppercase tracking-widest text-sm">
                  Identity Search
                </h2>
              </div>

              <div className="relative">
                <input
                  type="text"
                  className="w-full bg-primary/5 border border-primary/10 text-primary rounded-2xl h-14 px-6 text-sm font-bold placeholder:text-primary/20 focus:border-secondary transition-all uppercase tracking-widest"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  disabled={isCapturing || isSubmitting || success}
                  placeholder="SEARCH BY ROLL NUMBER OR NAME..."
                />

                {/* Search Dropdown */}
                <AnimatePresence>
                  {showDropdown &&
                    searchTerm &&
                    enrollmentStatus === "idle" && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute z-50 w-full mt-2 bg-surface/90 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl max-h-60 overflow-y-auto"
                      >
                        {pendingStudents
                          .filter((s) => {
                            const q = searchTerm.toLowerCase();
                            return (
                              s.$id.toLowerCase().includes(q) ||
                              (s.name && s.name.toLowerCase().includes(q))
                            );
                          })
                          .map((student) => (
                            <button
                              key={student.$id}
                              onClick={() => {
                                setSelectedRollNo(student.$id);
                                setSearchTerm(student.$id);
                                setShowDropdown(false);
                              }}
                              className="w-full px-6 py-4 flex items-center justify-between hover:bg-secondary/5 text-primary transition-all border-b border-primary/5 last:border-0"
                            >
                              <span className="font-bold tracking-widest uppercase">
                                {student.$id}
                              </span>
                              <span className="text-[10px] text-primary/40 font-bold">
                                {student.name}
                              </span>
                            </button>
                          ))}
                      </motion.div>
                    )}
                </AnimatePresence>
              </div>

              {selectedRollNo && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="mt-6 p-4 bg-secondary/5 border border-secondary/10 rounded-[1.5rem] flex flex-col sm:flex-row items-center sm:items-center justify-between group gap-4 text-center sm:text-left"
                >
                  <div className="flex flex-col sm:flex-row items-center space-y-3 sm:space-y-0 sm:space-x-4">
                    <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center text-secondary">
                      <UserCheck size={24} />
                    </div>
                    <div>
                      <p className="text-secondary text-[10px] font-bold uppercase tracking-[0.2em]">
                        Ready For Enrollment
                      </p>
                      <p className="text-primary font-bold text-lg sm:text-xl uppercase tracking-tighter leading-none">
                        {selectedRollNo}
                      </p>
                    </div>
                  </div>
                  {!isCapturing && !isSubmitting && !success && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRollNo("");
                        setSearchTerm("");
                      }}
                      className="text-primary/20 hover:text-secondary p-2 text-xs font-bold uppercase tracking-widest"
                    >
                      Clear
                    </button>
                  )}
                </motion.div>
              )}
            </div>
          </section>

          {/* Main Action Area */}
          <section className="flex flex-col items-center justify-center">
            {enrollmentStatus === "idle" && !success && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full"
              >
                <button
                  type="button"
                  onClick={startEnrollment}
                  disabled={!selectedRollNo}
                  className="group relative w-full h-24 bg-white hover:bg-slate-50 border border-primary/10 rounded-[2.5rem] flex items-center justify-between px-8 transition-all hover:border-secondary/30 disabled:opacity-30 active:scale-[0.98] shadow-md"
                >
                  <div className="flex items-center space-x-6 text-left">
                    <div className="w-12 h-12 bg-secondary/5 rounded-full flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                      <ScanFace size={24} />
                    </div>
                    <div>
                      <h3 className="text-primary font-bold uppercase text-lg tracking-tight">
                        Start Scan
                      </h3>
                      <p className="text-primary/30 text-[10px] uppercase tracking-widest font-bold">
                        Automatic Face Detection
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="text-primary/10 group-hover:text-secondary group-hover:translate-x-2 transition-all" />
                </button>
              </motion.div>
            )}

            {isSubmitting && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center space-y-8 py-20"
              >
                <div className="relative">
                  <div className="w-24 h-24 border-4 border-white/5 rounded-full" />
                  <div className="absolute inset-0 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-white font-black uppercase text-xl italic tracking-tight">
                    {statusText}
                  </h3>
                  <p className="text-white/30 text-[10px] uppercase tracking-widest font-bold">
                    Do not close the application
                  </p>
                </div>
              </motion.div>
            )}
          </section>

          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-error/10 border border-error/20 p-6 rounded-2xl flex items-center space-x-4 text-error"
            >
              <AlertCircle size={24} />
              <span className="font-semibold uppercase tracking-tight">
                {error}
              </span>
            </motion.div>
          )}
        </form>
      </main>

      {/* Live Enrollment Interface */}
      <AnimatePresence>
        {isCapturing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-background/95 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-2xl bg-surface border border-primary/10 rounded-[2rem] sm:rounded-[3rem] overflow-hidden shadow-2xl"
            >
              <div className="p-5 sm:p-8 border-b border-primary/5 flex items-center justify-between bg-primary/5">
                <div className="text-left">
                  <h2 className="text-lg sm:text-xl font-bold text-primary uppercase tracking-tight mb-1">
                    Biometric Enrollment
                  </h2>
                  <p className="text-primary/40 text-[10px] uppercase tracking-widest font-bold">
                    Student: <span className="text-secondary">{selectedRollNo}</span>
                  </p>
                </div>
                <button
                  onClick={() => setIsCapturing(false)}
                  className="p-2 sm:p-3 hover:bg-primary/5 rounded-full text-primary/40 hover:text-primary transition-all"
                >
                  <X size={20} className="sm:w-6 sm:h-6" />
                </button>
              </div>

              <div className="p-8 space-y-8">
                <div className="flex justify-center">
                  <div className="relative w-fit rounded-[2rem] overflow-hidden bg-black border border-white/5 shadow-inner">
                    <ReactWebcam
                      audio={false}
                      ref={webcamRef}
                      mirrored={true}
                      screenshotFormat="image/jpeg"
                      className="max-w-full max-h-[60vh] h-auto block translate-z-0"
                      videoConstraints={{
                        width: 1280,
                        height: 720,
                        facingMode: "user",
                      }}
                    />

                    {/* Enrollment progress overlay */}
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-6 sm:p-10">
                      {/* Top instruction prompt */}
                      <motion.div
                        key={detectionFeedback}
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-black/60 backdrop-blur-md px-4 py-2 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl border border-white/10"
                      >
                        <p className="text-secondary font-bold uppercase tracking-widest text-[9px] sm:text-[11px] text-center">
                          {detectionFeedback}
                        </p>
                      </motion.div>

                      {/* Face bounding guide */}
                      <div
                        className={`w-48 h-60 sm:w-64 sm:h-80 border-2 border-dashed rounded-[4rem] sm:rounded-[6rem] transition-all duration-500 scale-95 ${collectedEmbeddings.length > 0 ? "border-secondary" : "border-white/10"}`}
                      />

                      {/* Progress Metrics */}
                      <div className="w-full flex flex-col items-center space-y-3 sm:space-y-4">
                        <div className="w-full max-w-[160px] sm:max-w-[200px] h-1.5 bg-primary/10 rounded-full overflow-hidden border border-primary/5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${(collectedEmbeddings.length / TARGET_EMBEDDINGS) * 100}%`,
                            }}
                            className="h-full bg-secondary"
                          />
                        </div>
                        <p className="text-white/60 font-bold uppercase text-[8px] sm:text-[9px] tracking-[0.3em] font-mono">
                          Yield: {collectedEmbeddings.length} /{" "}
                          {TARGET_EMBEDDINGS}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-secondary/5 border border-secondary/10 p-4 rounded-2xl text-center">
                  <p className="text-primary/40 text-[9px] font-bold uppercase tracking-widest leading-relaxed">
                    Move your head slowly to allow the neural engine <br /> to
                    capture various organic identity angles
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Success Dialog */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-primary/20 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-surface p-8 rounded-[3rem] border border-primary/10 text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-secondary/20 rounded-full flex items-center justify-center text-secondary mx-auto mb-8 shadow-xl shadow-secondary/5">
                <CheckCircle size={40} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4 uppercase italic">
                Enrollment Complete
              </h2>
              <p className="text-white/40 mb-10 text-sm font-medium leading-relaxed italic">
                A high-accuracy profile for{" "}
                <span className="text-white font-bold">{selectedRollNo}</span>{" "}
                has been successfully committed to the cloud.
              </p>
              <button
                onClick={() => router.push("/")}
                className="w-full h-14 bg-secondary text-background rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition-all shadow-lg shadow-secondary/10 italic"
              >
                Return to Dashboard
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </GradientBackground>
  );
}
