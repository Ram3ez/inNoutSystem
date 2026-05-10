"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
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
import { DB_ID, COLLECTIONS, BIOMETRIC_THRESHOLDS } from "@/lib/constants";
import { GradientBackground } from "@/components/GradientBackground";
import { Navigation } from "@/components/Navigation";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useRouter } from "next/navigation";
import { useLoading } from "@/context/LoadingContext";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { databases, tablesDB, fetchAllRows, Query } from "@/lib/appwrite";
import { ID } from "appwrite";
import { generateAugmentations } from "@/lib/augmentFace";
import {
  uploadEmbeddings,
  loadFaceCache,
  isUserRegisteredFor,
} from "@/lib/faceCache";
import {
  getLandmarker,
  isLandmarkerLoaded,
  getLandmarkerSync,
} from "@/lib/aiEngine";
import { initGhostFace, getGhostFaceDescriptor } from "@/lib/ghostfaceEngine";
import { initEdgeFace, getEdgeFaceDescriptor as getEdgeFaceDescriptorFn } from "@/lib/edgefaceEngine";



// Target number of embeddings to collect for a high-accuracy profile
const TARGET_EMBEDDINGS = 8;

/**
 * RegisterFacePage
 * 
 * A comprehensive biometric enrollment interface that allows staff to register 
 * student faces into the system. It supports three different AI models:
 * - EdgeFace (Lightweight, Recommended)
 * - GhostFaceNet (High-Precision)
 * 
 * WORKFLOW:
 * 1. Student Selection: Search for students without registered biometric profiles.
 * 2. AI Warming: Downloads and initializes ONNX models via Web Workers.
 * 3. Multi-Angle Enrollment: Collects 8 distinct facial embeddings from different 
 *    angles (Straight, Left, Right, Up, Down) to ensure robust recognition.
 * 4. DB Commit: Normalizes and uploads high-dimensional vectors to Appwrite TablesDB.
 */
export default function RegisterFacePage() {
  const { user, isLoading: authLoading, isAdmin, isKiosk } = useAuth();
  const router = useRouter();
  const { startLoading: startGlobalLoading, stopLoading: stopGlobalLoading, updateProgress } = useLoading();

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
  const [aiLoaded, setAiLoaded] = useState(false);
  const [modelType, setModelType] = useState<"ghostface" | "edgeface">("edgeface");

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
  const basePose = useRef<{ yaw: number; pitch: number } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const webcamRef = useRef<ReactWebcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMounted = useRef(true);
  const lastScanTime = useRef(0);
  const isIOSDevice = useRef(false);

  // Initialize MediaPipe + selected ONNX model — singletons, only warm up once per session
  React.useEffect(() => {
    isMounted.current = true;
    isIOSDevice.current = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isLandmarkerLoaded()) {
      setFaceLandmarker(getLandmarkerSync());
      setAiLoaded(true);
    } else {
      const init = async () => {
        try {
          startGlobalLoading("Initializing AI Engines...");
          await getLandmarker(updateProgress);
          await loadFaceCache();
          const selectedInit =
            modelType === "edgeface"
              ? initEdgeFace(updateProgress)
              : initGhostFace(updateProgress);
          await selectedInit;
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

  // Search-driven student loading to prevent lag with thousands of records
  useEffect(() => {
    if (!authLoading && (isAdmin || isKiosk)) {
      const delayDebounceFn = setTimeout(() => {
        if (isMounted.current) fetchPendingStudents(searchTerm);
      }, 300); // Debounce search

      return () => clearTimeout(delayDebounceFn);
    }
  }, [searchTerm, authLoading, isAdmin, isKiosk, modelType]);

  const resetEnrollment = () => {
    setSelectedRollNo("");
    setSearchTerm("");
    setCollectedEmbeddings([]);
    collectedCountRef.current = 0;
    setEnrollmentStatus("idle");
    setIsFaceValid(false);
    setIsCapturing(false);
    setIsSubmitting(false);
    setError(null);
    setSuccess(false);
    setStatusText("");
    lastLandmarks.current = null;
  };

  const fetchPendingStudents = async (query: string = "") => {
    try {
      // Don't set loading to false here to prevent flickering while typing
      const q = query.trim().toUpperCase();

      // Use model-specific flags for filtering
      // For GhostFace migration, we also allow null/missing values if the user hasn't initialized the column
      const baseQueries =
        modelType === "ghostface"
          ? [Query.notEqual("ghostface_registered", true)]
          : [Query.notEqual("edgeface_registered", true)];

      if (!q) {
        const { rows } = await tablesDB.listRows({
          databaseId: DB_ID,
          tableId: COLLECTIONS.STUDENTS,
          queries: [
            ...baseQueries,
            Query.limit(50),
            Query.orderDesc("$createdAt"),
          ],
        });
        setPendingStudents(rows);
      } else {
        // Fetch by name and ID in parallel for maximum reliability
        const [nameResults, idResults] = await Promise.all([
          tablesDB.listRows({
            databaseId: DB_ID,
            tableId: COLLECTIONS.STUDENTS,
            queries: [
              ...baseQueries,
              Query.contains("name", query.trim()),
              Query.limit(50),
            ],
          }),
          tablesDB.listRows({
            databaseId: DB_ID,
            tableId: COLLECTIONS.STUDENTS,
            queries: [
              ...baseQueries,
              Query.contains("$id", q),
              Query.limit(50),
            ],
          }),
        ]);

        // Merge and deduplicate
        const merged = [...nameResults.rows, ...idResults.rows];
        const unique = Array.from(
          new Map(merged.map((s) => [s.$id, s])).values(),
        );

        setPendingStudents(unique);
      }
    } catch (err) {
      console.error("Failed to fetch pending students", err);
    }
  };

  const handleEnrollmentComplete = async (embeddings: Float32Array[]) => {
    if (enrollmentStatus === "processing" || enrollmentStatus === "done")
      return;

    setEnrollmentStatus("processing");
    setIsSubmitting(true);
    setStatusText("Processing biometric profile...");
    setIsCapturing(false);

    try {

      if (!selectedRollNo) throw new Error("Roll Number lost during session");

      setStatusText("Generating augmented identity cluster...");
      await new Promise((r) => setTimeout(r, 100));

      // Push all embeddings to Appwrite
      await uploadEmbeddings(selectedRollNo, embeddings, modelType);

      try {
        const regFlag =
          modelType === "ghostface"
            ? "ghostface_registered"
            : "edgeface_registered";
        await tablesDB.updateRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.STUDENTS,
          rowId: selectedRollNo,
          data: { [regFlag]: true },
        });
      } catch (dbErr) {
        console.warn("Could not update registration status in DB", dbErr);
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

  const extractEmbedding = useCallback(async () => {
    if (!webcamRef.current?.video || enrollmentStatus !== "scanning") return;
    await new Promise((r) => setTimeout(r, 10));

    try {
      const video = webcamRef.current.video;
      let descriptor: Float32Array | null = null;

      const landmarks = lastLandmarks.current;
        if (!landmarks || landmarks.length === 0) return;

        // Estimate a bounding box from landmarks for the crop
        const xs = landmarks.map((p: any) => p.x);
        const ys = landmarks.map((p: any) => p.y);
        const minX = Math.min(...xs),
          maxX = Math.max(...xs);
        const minY = Math.min(...ys),
          maxY = Math.max(...ys);

        const sw = video.videoWidth;
        const sh = video.videoHeight;

        const box = {
          x: minX * sw,
          y: minY * sh,
          width: (maxX - minX) * sw,
          height: (maxY - minY) * sh,
        };

        descriptor = modelType === "ghostface"
          ? await getGhostFaceDescriptor(video, box, landmarks, false)
          : await getEdgeFaceDescriptorFn(video, box, landmarks, false);

        let isAllZeros = true;
        for (let i = 0; i < descriptor.length; i++) {
          if (descriptor[i] !== 0) {
            isAllZeros = false;
            break;
          }
        }
        if (isAllZeros) return;

      if (!descriptor) return;
      const d = new Float32Array(descriptor); // Force-clone to raw array (prevents disposal errors)

      setCollectedEmbeddings((prev) => {
        if (prev.length >= TARGET_EMBEDDINGS) return prev;

        const DIVERSITY_THRESHOLD =
          modelType === "ghostface"
            ? BIOMETRIC_THRESHOLDS.GHOSTFACE.DIVERSITY
            : BIOMETRIC_THRESHOLDS.EDGEFACE.DIVERSITY;
        const isDuplicate = prev.slice(-2).some((existing) => {
          let dot = 0,
            normA = 0,
            normB = 0;
          for (let i = 0; i < existing.length; i++) {
            dot += existing[i] * d[i];
            normA += existing[i] * existing[i];
            normB += d[i] * d[i];
          }
          return (
            dot / (Math.sqrt(normA) * Math.sqrt(normB)) > DIVERSITY_THRESHOLD
          );
        });

        if (isDuplicate) return prev;

        const next = [...prev, d];
        collectedCountRef.current = next.length;
        serverLog(
          "REGISTRATION",
          `Extracted ${modelType} Embedding #${next.length}`,
        );

        if (next.length >= TARGET_EMBEDDINGS) {
          setTimeout(() => handleEnrollmentComplete(next), 0);
        }
        return next;
      });
    } catch (err) {
      console.error("Embedding extraction failed:", err);
    }
  }, [enrollmentStatus, modelType, handleEnrollmentComplete]);

  const processResults = useCallback(
    async (result: FaceLandmarkerResult) => {
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

        const stable = movement < 0.05;
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
      let isPoseValidForPhase = false;

      // --- Calibration: On Phase 1, lock the natural resting angle ---
      if (count === 0 && !basePose.current) {
        // We only set baseline once we are stable and roughly centered
        if (Math.abs(yaw) < 0.3 && Math.abs(pitch) < 0.3) {
          basePose.current = { yaw, pitch };
          console.log(
            `[📱 CALIBRATION] Base Pose Locked: Y:${yaw.toFixed(2)} P:${pitch.toFixed(2)}`,
          );
        }
      }

      const bp = basePose.current || { yaw: 0, pitch: 0 };
      const relYaw = yaw - bp.yaw;
      const relPitch = pitch - bp.pitch;

      // Guide the user through poses based on relative movement from their own baseline
      if (count < Math.floor(total * 0.25)) {
        // Phase 1: center baseline (looking straight)
        isPoseValidForPhase =
          Math.abs(relYaw) < 0.15 && Math.abs(relPitch) < 0.15;
        setDetectionFeedback(
          isPoseValidForPhase
            ? "HOLD STILL — CAPTURING"
            : "LOOK STRAIGHT AT CAMERA",
        );
      } else if (count < Math.floor(total * 0.5)) {
        // Phase 2: want a left turn (Swapped for Mirror Fix)
        isPoseValidForPhase = relYaw > 0.12;
        setDetectionFeedback(
          isPoseValidForPhase
            ? "HOLD STILL — CAPTURING LEFT"
            : "TURN HEAD TO THE LEFT",
        );
      } else if (count < Math.floor(total * 0.75)) {
        // Phase 3: want a right turn (Swapped for Mirror Fix)
        isPoseValidForPhase = relYaw < -0.12;
        setDetectionFeedback(
          isPoseValidForPhase
            ? "HOLD STILL — CAPTURING RIGHT"
            : "TURN HEAD TO THE RIGHT",
        );
      } else {
        // Phase 4: Down & Up tilts
        if (count < total - 1) {
          isPoseValidForPhase = relPitch > 0.08;
          setDetectionFeedback(
            isPoseValidForPhase
              ? "HOLD STILL — CAPTURING DOWN"
              : "TILT HEAD DOWN (CHIN TO CHEST)",
          );
        } else {
          isPoseValidForPhase = relPitch < -0.06;
          setDetectionFeedback(
            isPoseValidForPhase
              ? "HOLD STILL — CAPTURING UP"
              : "TILT HEAD UP (LOOK AT CEILING)",
          );
        }
      }

      // --- 3. Live Embedding Extraction ---
      const now = performance.now();
      if (
        isPoseValidForPhase &&
        now - lastExtractionTime.current > extractionInterval
      ) {
        lastExtractionTime.current = now;
        extractEmbedding();
      }
    },
    [enrollmentStatus, extractEmbedding],
  );

  /** Adjusts brightness of a canvas by offset (e.g. +40, -40) and returns new canvas */
  const adjustBrightness = (
    source: HTMLCanvasElement,
    offset: number,
  ): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    c.width = source.width;
    c.height = source.height;
    const ctx = c.getContext("2d");
    if (!ctx) return c;
    ctx.drawImage(source, 0, 0);
    const imgData = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i] = Math.min(255, Math.max(0, imgData.data[i] + offset));
      imgData.data[i + 1] = Math.min(
        255,
        Math.max(0, imgData.data[i + 1] + offset),
      );
      imgData.data[i + 2] = Math.min(
        255,
        Math.max(0, imgData.data[i + 2] + offset),
      );
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
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

  // Detection Loop
  useEffect(() => {
    let animationFrameId: number;

    const detect = async () => {
      if (!isMounted.current) return;

      const now = performance.now();
      const throttleMs = isIOSDevice.current ? 200 : 100;
      if (now - lastScanTime.current < throttleMs) {
        animationFrameId = requestAnimationFrame(detect);
        return;
      }
      lastScanTime.current = now;

      if (faceLandmarker && webcamRef.current?.video?.readyState === 4) {
        const video = webcamRef.current.video;

        // Safety check for active stream tracks
        if (video.srcObject) {
          try {
            const result = faceLandmarker.detectForVideo(
              video,
              performance.now(),
            );
            processResults(result);
          } catch (e) {
            console.warn(
              "MediaPipe detection skipped (stream likely closed)",
              e,
            );
          }
        }
      }
      animationFrameId = requestAnimationFrame(detect);
    };

    if (isCapturing) {
      detect();
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [faceLandmarker, isCapturing, processResults]);

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
          <LoadingIndicator size="lg" />
        </div>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <Navigation />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 pt-36 sm:pt-40 pb-12 relative z-10">
        <header className="mb-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <button
              onClick={() => {
                startGlobalLoading();
                router.push("/");
              }}
              className="p-2 hover:bg-primary/5 rounded-full transition-all text-primary/40 hover:text-primary shrink-0"
            >
              <ArrowLeft size={24} />
            </button>
            <div className="text-left">
              <p className="text-secondary font-bold tracking-[0.2em] text-[10px] sm:text-xs uppercase mb-1">
                Onboarding
              </p>
              <h1 className="text-xl sm:text-3xl font-bold text-primary tracking-tight uppercase leading-tight">
                Registration
              </h1>
            </div>
          </div>
          <div className="flex w-full md:w-auto items-center justify-center md:justify-end gap-6 mt-6 md:mt-0">
                        {/* Model Selector */}
            <div className="flex w-full sm:w-auto items-center justify-center bg-primary/5 p-1 rounded-2xl border border-primary/10 shadow-inner">
              <button
                type="button"
                onClick={() => setModelType("ghostface")}
                className={`flex-1 sm:flex-none flex items-center justify-center px-4 h-8 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${
                  modelType === "ghostface"
                    ? "bg-secondary text-background shadow-md"
                    : "text-primary/40 hover:text-primary hover:bg-primary/5"
                }`}
              >
                GhostFaceNet
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (modelType === "edgeface") return;
                  setAiLoaded(false);
                  await initEdgeFace();
                  setModelType("edgeface");
                  setAiLoaded(true);
                }}
                className={`flex-1 sm:flex-none flex items-center justify-center px-4 h-8 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all duration-300 ${
                  modelType === "edgeface"
                    ? "bg-secondary text-background shadow-md"
                    : "text-primary/40 hover:text-primary hover:bg-primary/5"
                }`}
              >
                EdgeFace
              </button>
            </div>

            <div className="hidden md:flex items-center space-x-2 text-primary/40 bg-primary/5 px-4 py-2 rounded-full border border-primary/5 shadow-sm">
              <ScanFace size={18} className="text-secondary" />
              <span className="text-xs font-bold uppercase tracking-wider">
                Profile Enrollment
              </span>
            </div>
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
                  className="w-full bg-primary/5 border border-primary/10 text-primary rounded-2xl h-14 px-6 text-sm font-bold placeholder:text-primary/40 focus:border-secondary transition-all uppercase tracking-widest"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowDropdown(true);
                  }}
                  onFocus={() => setShowDropdown(true)}
                  disabled={isCapturing || isSubmitting || success}
                  placeholder="SEARCH BY ROLL NUMBER OR NAME..."
                />

                <div className="mt-4 flex items-center space-x-2 bg-secondary/5 px-4 py-2 rounded-xl border border-secondary/10">
                  <ScanFace size={14} className="text-secondary" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-primary/60">
                    Showing students pending{" "}
                    <span className="text-secondary">
                      {modelType === "ghostface" ? "GhostFaceNet" : "EdgeFace"}
                    </span>{" "}
                    enrollment
                  </span>
                </div>

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
                        {pendingStudents.map((student) => (
                          <button
                            key={student.$id}
                            onClick={() => {
                              setSelectedRollNo(student.$id);
                              setSearchTerm(student.$id);
                              setShowDropdown(false);
                            }}
                            className="w-full px-6 py-4 flex items-center justify-between hover:bg-secondary/5 text-primary transition-all border-b border-primary/5 last:border-0"
                          >
                            <div className="flex flex-col text-left">
                              <span className="font-bold tracking-widest uppercase">
                                {student.$id}
                              </span>
                              {isUserRegisteredFor(student.$id, modelType) && (
                                <span className="text-[8px] text-secondary font-bold uppercase tracking-tighter">
                                  Already Registered ({modelType})
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-primary/60 font-bold text-right">
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
                      onClick={resetEnrollment}
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
                  className="group relative w-full h-24 bg-surface hover:bg-primary/5 border border-primary/10 rounded-[2.5rem] flex items-center justify-between px-8 transition-all hover:border-secondary/30 disabled:opacity-30 active:scale-[0.98] shadow-md"
                >
                  <div className="flex items-center space-x-6 text-left">
                    <div className="w-12 h-12 bg-secondary/5 rounded-full flex items-center justify-center text-secondary group-hover:scale-110 transition-transform">
                      <ScanFace size={24} />
                    </div>
                    <div>
                      <h3 className="text-primary font-bold uppercase text-lg tracking-tight">
                        Start Scan
                      </h3>
                      <p className="text-primary/60 text-[10px] uppercase tracking-widest font-bold">
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
                  <h3 className="text-foreground font-black uppercase text-xl italic tracking-tight">
                    {statusText}
                  </h3>
                  <p className="text-primary/60 text-[10px] uppercase tracking-widest font-bold">
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
                    Student:{" "}
                    <span className="text-secondary">{selectedRollNo}</span>
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
                  <div className="relative w-full max-w-xl aspect-[3/4] sm:aspect-[4/3] rounded-[2rem] overflow-hidden bg-black border border-white/5 shadow-inner">
                    <ReactWebcam
                      audio={false}
                      ref={webcamRef}
                      mirrored={true}
                      screenshotFormat="image/jpeg"
                      className="w-full h-full object-cover block"
                      videoConstraints={{
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        facingMode: "user",
                      }}
                    />

                    {/* Enrollment progress overlay */}
                    <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between">
                      {/* Top instruction prompt - Sleek Banner */}
                      <motion.div
                        key={detectionFeedback}
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="w-full bg-gradient-to-b from-black/80 to-transparent pt-4 pb-10 px-6"
                      >
                        <div className="flex flex-col items-center space-y-1">
                          <div className="flex items-center space-x-2 text-secondary animate-pulse">
                            <div className="w-1 h-1 rounded-full bg-secondary" />
                            <span className="text-[8px] font-black uppercase tracking-[0.4em]">
                              Neural Scanner
                            </span>
                          </div>
                          <p className="text-white font-black uppercase tracking-[0.15em] text-[16px] sm:text-[22px] text-center drop-shadow-lg">
                            {detectionFeedback}
                          </p>
                        </div>
                      </motion.div>

                      {/* Face bounding guide - ALWAYS CLEAR IN CENTER */}
                      <div className="relative flex-1 flex items-center justify-center w-full px-4">
                        <div
                          className={`w-36 h-44 sm:w-56 sm:h-64 border-2 border-dashed rounded-[3rem] sm:rounded-[5rem] transition-all duration-700 ${collectedEmbeddings.length > 0 ? "border-secondary/60 scale-100 bg-secondary/5" : "border-white/20 scale-95"}`}
                        />
                      </div>

                      {/* Progress Metrics - Bottom Hub */}
                      <div className="w-full bg-gradient-to-t from-black/80 to-transparent pt-10 pb-6 px-10 flex flex-col items-center space-y-3">
                        {/* Pose Stepper Dots */}
                        <div className="flex space-x-2 mb-1">
                          {Array.from({ length: TARGET_EMBEDDINGS }).map(
                            (_, i) => (
                              <div
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${i < collectedEmbeddings.length ? "bg-secondary scale-125 shadow-[0_0_10px_rgba(var(--secondary),0.5)]" : "bg-white/20"}`}
                              />
                            ),
                          )}
                        </div>

                        <div className="w-full max-w-[200px] h-1 bg-white/10 rounded-full overflow-hidden border border-white/5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${(collectedEmbeddings.length / TARGET_EMBEDDINGS) * 100}%`,
                            }}
                            className="h-full bg-secondary shadow-[0_0_15px_rgba(var(--secondary),0.6)]"
                          />
                        </div>
                        <div className="flex items-center space-x-4 opacity-50">
                          <span className="text-[7px] font-black text-white uppercase tracking-widest">
                            Vector Extraction
                          </span>
                          <span className="text-[9px] font-mono text-secondary font-bold">
                            {collectedEmbeddings.length} / {TARGET_EMBEDDINGS}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-secondary/5 border border-secondary/10 p-4 rounded-2xl text-center space-y-4">
                  <p className="text-primary/60 text-[9px] font-bold uppercase tracking-widest leading-relaxed">
                    Move your head slowly to allow the neural engine <br /> to
                    capture various organic identity angles
                  </p>

                  <button
                    onClick={resetEnrollment}
                    className="flex items-center space-x-2 mx-auto text-secondary hover:text-secondary/80 transition-colors py-2 px-4 rounded-xl hover:bg-secondary/5"
                  >
                    <X size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      Cancel Registration
                    </span>
                  </button>
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
              <h2 className="text-2xl font-bold text-foreground mb-4 uppercase italic">
                Enrollment Complete
              </h2>
              <p className="text-primary/60 mb-10 text-sm font-medium leading-relaxed italic">
                A high-accuracy profile for{" "}
                <span className="text-primary font-bold">{selectedRollNo}</span>{" "}
                has been successfully committed to the cloud.
              </p>
              <button
                onClick={() => {
                  startGlobalLoading();
                  router.push("/");
                }}
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
