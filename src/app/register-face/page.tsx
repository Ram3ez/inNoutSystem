"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  ScanFace,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import ReactWebcam from "react-webcam";
import { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { useAuth } from "@/context/AuthContext";
import { GradientBackground } from "@/components/GradientBackground";
import { Navigation } from "@/components/Navigation";
import { LoadingIndicator } from "@/components/LoadingIndicator";
import { useRouter } from "next/navigation";
import { tablesDB } from "@/lib/appwrite";
import { DB_ID, COLLECTIONS, BIOMETRIC_THRESHOLDS } from "@/lib/constants";
import { loadFaceApiModels, loadFaceCache, areModelsLoaded, uploadEmbeddings } from "@/lib/faceCache";
import {
  getLandmarker,
  getLandmarkerSync,
  isLandmarkerLoaded,
} from "@/lib/aiEngine";
import { initGhostFace, getGhostFaceDescriptor } from "@/lib/ghostfaceEngine";
import {
  initEdgeFace,
  getEdgeFaceDescriptor as getEdgeFaceDescriptorFn,
} from "@/lib/edgefaceEngine";
import * as faceapi from "face-api.js";

const TARGET_EMBEDDINGS = 8;

export default function StudentRegisterFace() {
  const {
    user,
    studentData,
    isLoading: authLoading,
    isAdmin,
    isKiosk,
  } = useAuth();
  const router = useRouter();

  const serverLog = (action: string, message: string) => {
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, message }),
    }).catch(() => {});
  };

  const [aiLoaded, setAiLoaded] = useState(false);
  const [modelType, setModelType] = useState<"ghostface" | "edgeface">(
    "edgeface",
  );

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
  const collectedCountRef = useRef<number>(0);
  const extractionInterval = 500;
  const basePose = useRef<{ yaw: number; pitch: number } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const webcamRef = useRef<ReactWebcam>(null);
  const isMounted = useRef(true);
  const lastScanTime = useRef(0);
  const isIOSDevice = useRef(false);

  // Initialize MediaPipe + specific singletons
  useEffect(() => {
    isMounted.current = true;
    isIOSDevice.current = /iPad|iPhone|iPod/.test(navigator.userAgent);

    if (isLandmarkerLoaded()) {
      setFaceLandmarker(getLandmarkerSync());
      setAiLoaded(true);
    } else {
      const init = async () => {
        try {
          // Regular users don't need the heavy face database (Face Cache) or Face-API
          // They only need Landmarks, GhostFace, and EdgeFace for registration.
          const promises: Promise<any>[] = [
            getLandmarker(),
            initGhostFace(),
            initEdgeFace(),
          ];

          if (isAdmin || isKiosk) {
            promises.push(loadFaceCache());
            promises.push(loadFaceApiModels());
          }

          await Promise.all(promises);

          if (isMounted.current) {
            setFaceLandmarker(getLandmarkerSync());
            setAiLoaded(true);
          }
        } catch (e) {
          console.error("Failed to initialize AI engine", e);
        }
      };
      init();
    }

    return () => {
      isMounted.current = false;
    };
  }, []);

  const resetEnrollment = () => {
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
    basePose.current = null;
  };

  const handleEnrollmentComplete = async (embeddings: Float32Array[]) => {
    if (enrollmentStatus === "processing" || enrollmentStatus === "done")
      return;

    setEnrollmentStatus("processing");
    setIsSubmitting(true);
    setStatusText("Processing biometric profile...");
    setIsCapturing(false);

    try {
      if ((faceapi as any).tf && (faceapi as any).tf.engine) {
        (faceapi as any).tf.engine().startScope();
      }

      if (!studentData?.$id) throw new Error("Student ID lost during session");

      setStatusText("Generating your organic identity cluster...");
      await new Promise((r) => setTimeout(r, 100));

      // Direct upload
      await uploadEmbeddings(studentData.$id, embeddings, modelType);

      try {
        const updateData: any = {
          [modelType === "ghostface"
            ? "ghostface_registered"
            : "edgeface_registered"]: true,
        };

        const currentOther =
          modelType === "ghostface"
            ? (studentData as any)?.edgeface_registered
            : (studentData as any)?.ghostface_registered;

        if (currentOther) {
          updateData.faceRegistered = true;
        }

        await tablesDB.updateRow({
          databaseId: DB_ID,
          tableId: COLLECTIONS.STUDENTS,
          rowId: studentData.$id,
          data: updateData,
        });

        // Mutate context to match immediately
        if (studentData) {
          Object.assign(studentData, updateData);
        }
      } catch (dbErr) {
        console.warn("Could not update status in student record", dbErr);
      }

      setEnrollmentStatus("done");
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "Face registration failed");
      setEnrollmentStatus("idle");
    } finally {
      setIsSubmitting(false);
      if ((faceapi as any).tf && (faceapi as any).tf.engine) {
        (faceapi as any).tf.engine().endScope();
      }
    }
  };

  const extractEmbedding = useCallback(async () => {
    if (!webcamRef.current?.video || enrollmentStatus !== "scanning") return;
    await new Promise((r) => setTimeout(r, 10));

    const tf = (faceapi as any).tf;
    if (tf && tf.engine) tf.engine().startScope();

    try {
      const video = webcamRef.current.video;
      let descriptor: Float32Array | null = null;

      const landmarks = lastLandmarks.current;
      if (!landmarks || landmarks.length === 0) return;

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

      descriptor =
        modelType === "ghostface"
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
      const d = new Float32Array(descriptor);

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
          "STUDENT_REGISTRATION",
          `Extracted Embedding #${next.length}`,
        );

        if (next.length >= TARGET_EMBEDDINGS) {
          setTimeout(() => handleEnrollmentComplete(next), 0);
        }
        return next;
      });
    } catch (err) {
      console.error("Extraction error:", err);
    } finally {
      try {
        if (tf && tf.engine) {
          tf.engine().endScope();
        }
      } catch (e) {}
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

      // Stability
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

      // Pose Detection
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

      if (count === 0 && !basePose.current) {
        if (Math.abs(yaw) < 0.3 && Math.abs(pitch) < 0.3) {
          basePose.current = { yaw, pitch };
        }
      }

      const bp = basePose.current || { yaw: 0, pitch: 0 };
      const relYaw = yaw - bp.yaw;
      const relPitch = pitch - bp.pitch;

      if (count < Math.floor(total * 0.25)) {
        isPoseValidForPhase =
          Math.abs(relYaw) < 0.15 && Math.abs(relPitch) < 0.15;
        setDetectionFeedback(
          isPoseValidForPhase
            ? "HOLD STILL — CAPTURING"
            : "LOOK STRAIGHT AT CAMERA",
        );
      } else if (count < Math.floor(total * 0.5)) {
        isPoseValidForPhase = relYaw > 0.22;
        setDetectionFeedback(
          isPoseValidForPhase
            ? "HOLD STILL — CAPTURING LEFT"
            : "TURN HEAD TO THE LEFT",
        );
      } else if (count < Math.floor(total * 0.75)) {
        isPoseValidForPhase = relYaw < -0.22;
        setDetectionFeedback(
          isPoseValidForPhase
            ? "HOLD STILL — CAPTURING RIGHT"
            : "TURN HEAD TO THE RIGHT",
        );
      } else {
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
        if (video.srcObject) {
          try {
            const result = faceLandmarker.detectForVideo(
              video,
              performance.now(),
            );
            processResults(result);
          } catch (e) {
            console.warn("MediaPipe detection skipped", e);
          }
        }
      }

      if (enrollmentStatus === "scanning") {
        animationFrameId = requestAnimationFrame(detect);
      }
    };

    if (enrollmentStatus === "scanning") {
      animationFrameId = requestAnimationFrame(detect);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [enrollmentStatus, faceLandmarker, processResults]);

  const startEnrollment = () => {
    setError(null);
    collectedCountRef.current = 0;
    setCollectedEmbeddings([]);
    setEnrollmentStatus("scanning");
    setIsCapturing(true);
  };

  if (authLoading) {
    return (
      <GradientBackground>
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <LoadingIndicator />
        </div>
      </GradientBackground>
    );
  }

  if (!user || !studentData) {
    if (typeof window !== "undefined") router.push("/login");
    return null;
  }

  const isEdgeRegistered = (studentData as any)?.edgeface_registered;
  const isGhostRegistered = (studentData as any)?.ghostface_registered;

  return (
    <GradientBackground>
      <Navigation />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 pt-36 sm:pt-40 pb-12">
        <header className="mb-8 flex items-center justify-between">
          <button
            onClick={() => router.push("/")}
            className="flex items-center space-x-2 text-primary/60 hover:text-primary font-bold uppercase text-xs tracking-widest bg-primary/5 px-4 py-2 rounded-xl transition-all border border-primary/10 hover:bg-primary/10 shadow-sm"
          >
            <ArrowLeft size={16} />
            <span>Go Back</span>
          </button>
          <div className="flex items-center space-x-3">
            <ScanFace className="text-secondary" size={28} />
            <h1 className="text-xl sm:text-2xl font-black text-primary uppercase tracking-tighter italic">
              Self Face <span className="text-secondary">Enrollment</span>
            </h1>
          </div>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-5 space-y-6">
            <div className="bg-surface/60 backdrop-blur-md rounded-[2.5rem] border border-primary/10 p-6 sm:p-8 shadow-xl flex flex-col justify-between">
              <div>
                <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-secondary mb-2">
                  Permanent Identity
                </h2>
                <h3 className="text-lg sm:text-xl font-bold text-primary mb-1 uppercase tracking-tight">
                  {studentData.name || user.name}
                </h3>
                <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-primary/40 leading-none">
                  ID: {studentData.$id}
                </p>
              </div>

              <div className="mt-8 pt-6 border-t border-primary/5 space-y-4">
                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/5">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">
                      Model 1 Profile
                    </span>
                    <span className="text-[9px] font-medium text-primary/40 leading-none mt-0.5">
                      State-of-the-art fast local verification
                    </span>
                  </div>
                  {isEdgeRegistered ? (
                    <span className="text-[10px] font-black bg-green-500/10 text-green-500 border border-green-500/20 px-3 py-1 rounded-full uppercase">
                      Registered
                    </span>
                  ) : (
                    <span className="text-[10px] font-black bg-secondary/10 text-secondary border border-secondary/20 px-3 py-1 rounded-full uppercase">
                      Unregistered
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/5">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary/60">
                      Model 2 Profile
                    </span>
                    <span className="text-[9px] font-medium text-primary/40 leading-none mt-0.5">
                      High diversity neural vector
                    </span>
                  </div>
                  {isGhostRegistered ? (
                    <span className="text-[10px] font-black bg-green-500/10 text-green-500 border border-green-500/20 px-3 py-1 rounded-full uppercase">
                      Registered
                    </span>
                  ) : (
                    <span className="text-[10px] font-black bg-secondary/10 text-secondary border border-secondary/20 px-3 py-1 rounded-full uppercase">
                      Unregistered
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start space-x-3 text-amber-600">
                <AlertCircle className="shrink-0 mt-0.5" size={18} />
                <span className="text-[10px] font-bold uppercase tracking-wide leading-relaxed">
                  Notice: Facial data cannot be deleted or changed once
                  registered. Ensure your camera view is well-lit and stable.
                </span>
              </div>
            </div>

            {/* Model & Control Selectors */}
            {enrollmentStatus === "idle" && (
              <div className="bg-surface/40 backdrop-blur-sm rounded-[2.5rem] border border-primary/5 p-6 shadow-md space-y-6">
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-primary/40 mb-3">
                    Select Identity Engine
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    <button
                      onClick={() => setModelType("edgeface")}
                      disabled={isEdgeRegistered}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                        modelType === "edgeface"
                          ? "bg-secondary/5 border-secondary text-primary"
                          : "bg-primary/[0.02] border-primary/10 hover:bg-primary/[0.05]"
                      } ${isEdgeRegistered ? "opacity-40 cursor-not-allowed select-none" : ""}`}
                    >
                      <div>
                        <p className="font-black text-xs uppercase tracking-wider text-primary">
                          Model 1
                        </p>
                        <p className="text-[9px] font-bold text-primary/40 uppercase tracking-widest mt-0.5">
                          Highly recommended, very fast
                        </p>
                      </div>
                      {isEdgeRegistered && (
                        <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">
                          Locked
                        </span>
                      )}
                    </button>

                    <button
                      onClick={() => setModelType("ghostface")}
                      disabled={isGhostRegistered}
                      className={`flex items-center justify-between p-4 rounded-2xl border transition-all text-left ${
                        modelType === "ghostface"
                          ? "bg-secondary/5 border-secondary text-primary"
                          : "bg-primary/[0.02] border-primary/10 hover:bg-primary/[0.05]"
                      } ${isGhostRegistered ? "opacity-40 cursor-not-allowed select-none" : ""}`}
                    >
                      <div>
                        <p className="font-black text-xs uppercase tracking-wider text-primary">
                          Model 2
                        </p>
                        <p className="text-[9px] font-bold text-primary/40 uppercase tracking-widest mt-0.5">
                          High sensitivity, advanced
                        </p>
                      </div>
                      {isGhostRegistered && (
                        <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">
                          Locked
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {!aiLoaded ? (
                  <div className="p-4 bg-primary/[0.02] rounded-2xl border border-primary/5 text-center flex flex-col items-center justify-center space-y-2">
                    <div className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-primary/40">
                      Warming AI Engine...
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={startEnrollment}
                    disabled={
                      modelType === "edgeface"
                        ? isEdgeRegistered
                        : isGhostRegistered
                    }
                    className="w-full h-14 bg-primary text-background rounded-2xl font-black uppercase tracking-widest flex items-center justify-center space-x-3 hover:brightness-110 active:scale-[0.99] transition-all shadow-lg hover:shadow-xl shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ScanFace size={20} />
                    <span>Start Enrollment</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Camera View Area */}
          <div className="md:col-span-7 flex flex-col">
            <div className="relative flex-1 aspect-video md:aspect-auto bg-black rounded-[2.5rem] overflow-hidden border border-primary/10 shadow-2xl flex items-center justify-center min-h-[360px]">
              {enrollmentStatus === "scanning" && (
                <div className="absolute inset-0 z-0">
                  <ReactWebcam
                    audio={false}
                    ref={webcamRef}
                    screenshotFormat="image/jpeg"
                    className="w-full h-full object-cover"
                    videoConstraints={{
                      width: { ideal: 640 },
                      height: { ideal: 480 },
                      facingMode: "user",
                    }}
                    mirrored
                  />
                </div>
              )}

              {enrollmentStatus === "idle" && (
                <div className="absolute inset-0 bg-primary/[0.03] backdrop-blur-sm flex flex-col items-center justify-center space-y-4 p-8 border border-primary/5 rounded-[2.5rem] z-10 text-center">
                  <div className="w-16 h-16 bg-primary/5 rounded-3xl flex items-center justify-center border border-primary/10 text-primary/20">
                    <ScanFace size={36} />
                  </div>
                  <div className="max-w-xs space-y-2">
                    <p className="text-xs font-bold text-primary uppercase tracking-widest leading-normal">
                      Camera Standby
                    </p>
                    <p className="text-[10px] text-primary/40 font-bold uppercase tracking-wide leading-relaxed">
                      Select your neural model and click Start Enrollment to
                      wake up the biometric camera
                    </p>
                  </div>
                </div>
              )}

              {enrollmentStatus === "scanning" && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 flex flex-col justify-between p-6 sm:p-8 z-10 select-none">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-white bg-black/40 backdrop-blur-sm px-4 py-1.5 rounded-full uppercase tracking-wider border border-white/10">
                      Enrolling with{" "}
                      {modelType === "edgeface" ? "Model 1" : "Model 2"}
                    </span>
                    <span className="text-[10px] font-black bg-secondary/80 text-white px-4 py-1.5 rounded-full uppercase tracking-wider animate-pulse border border-secondary">
                      {collectedEmbeddings.length}/{TARGET_EMBEDDINGS} Captured
                    </span>
                  </div>

                  <div className="flex flex-col items-center space-y-2 text-center">
                    <div className="text-secondary font-black text-xs sm:text-sm uppercase tracking-wider bg-black/60 backdrop-blur-sm px-6 py-2 rounded-2xl border border-secondary/40 shadow-xl leading-snug">
                      {detectionFeedback}
                    </div>
                  </div>
                </div>
              )}

              {enrollmentStatus === "processing" && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center space-y-4 p-8 z-10">
                  <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] font-black text-secondary uppercase tracking-[0.3em] px-8 text-center leading-loose">
                    {statusText || "Processing biometrics..."}
                  </p>
                </div>
              )}

              {enrollmentStatus === "done" && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center space-y-6 p-8 z-10 text-center">
                  <div className="w-16 h-16 bg-green-500/20 border border-green-500/40 rounded-full flex items-center justify-center text-green-400">
                    <CheckCircle2 size={36} />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-bold text-white uppercase tracking-tight">
                      Enrollment Successful
                    </h3>
                    <p className="text-[10px] text-primary/40 font-bold uppercase tracking-wide leading-relaxed">
                      Your identity profile has been locked into the system
                      database
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      resetEnrollment();
                      router.push("/");
                    }}
                    className="px-6 py-3 bg-white text-black font-black uppercase text-xs tracking-widest rounded-2xl hover:bg-white/90 transition-all shadow-xl"
                  >
                    Return to Dashboard
                  </button>
                </div>
              )}

              {error && (
                <div className="absolute bottom-6 left-6 right-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start space-x-3 text-red-500 z-20 backdrop-blur-md select-none">
                  <AlertCircle className="shrink-0 mt-0.5" size={18} />
                  <span className="text-[10px] font-bold uppercase tracking-wide leading-relaxed flex-1">
                    {error}
                  </span>
                  <button
                    onClick={resetEnrollment}
                    className="text-[9px] font-black uppercase tracking-widest text-primary/60 hover:text-red-500 border border-primary/10 px-3 py-1 rounded-xl bg-primary/5"
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>

            {/* Pipeline progress steps */}
            {enrollmentStatus === "scanning" && (
              <div className="mt-4 bg-surface/30 backdrop-blur-sm rounded-2xl border border-primary/5 p-4 flex justify-between items-center gap-2">
                <span className="text-[9px] font-bold text-primary/40 uppercase tracking-widest shrink-0">
                  Pose Tracking
                </span>
                <div className="flex flex-1 justify-between gap-1 h-2">
                  {Array.from({ length: TARGET_EMBEDDINGS }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-full flex-1 rounded-full transition-all duration-300 ${
                        i < collectedEmbeddings.length
                          ? "bg-secondary scale-x-105"
                          : "bg-primary/5 border border-primary/5"
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </GradientBackground>
  );
}
