"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaceLandmarker,
  FilesetResolver,
  FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";
import {
  Camera,
  Upload,
  UserPlus,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  RefreshCw,
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

const DB_ID = "69cb970a000853f23489";
const COLL_STUDENTS = "student_details";

type ImageSlot = {
  id: string;
  label: string;
  description: string;
  dataUrl: string | null;
};

export default function RegisterFacePage() {
  const { user, isLoading: authLoading, isAdmin, isKiosk } = useAuth();
  const router = useRouter();

  const [pendingStudents, setPendingStudents] = useState<any[]>([]);
  const [selectedRollNo, setSelectedRollNo] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const [slots, setSlots] = useState<ImageSlot[]>([
    {
      id: "center",
      label: "Straight View",
      description: "Look directly at camera",
      dataUrl: null,
    },
    {
      id: "left",
      label: "Left View",
      description: "Turn head 45° to the left",
      dataUrl: null,
    },
    {
      id: "right",
      label: "Right View",
      description: "Turn head 45° to the right",
      dataUrl: null,
    },
    {
      id: "top",
      label: "Top View",
      description: "Tilt head 45° upwards",
      dataUrl: null,
    },
    {
      id: "bottom",
      label: "Bottom View",
      description: "Tilt head 45° downwards",
      dataUrl: null,
    },
  ]);

  const [isDataLoaded, setIsDataLoaded] = useState(false);

  React.useEffect(() => {
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

  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(
    null,
  );
  const [isFaceValid, setIsFaceValid] = useState(false);
  const [detectionFeedback, setDetectionFeedback] =
    useState("Initializing AI...");
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);

  // Liveness & Blur states
  const [livenessScore, setLivenessScore] = useState(0); // Boost on blink/movement
  const [isStable, setIsStable] = useState(true);
  const lastLandmarks = useRef<any>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const webcamRef = useRef<ReactWebcam>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const processResults = (result: FaceLandmarkerResult) => {
    if (result.faceLandmarks.length === 0) {
      setIsFaceValid(false);
      setDetectionFeedback("No Face Detected");
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

    // --- 3. Angle Verification (Yaw & Pitch) ---
    // Simple pose estimation using landmarks 1 (nose), 33 (left eye outer), 263 (right eye outer)
    const nose = landmarks[1];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const forehead = landmarks[10];
    const chin = landmarks[152];

    const yaw =
      (nose.x - (leftEye.x + rightEye.x) / 2) / (rightEye.x - leftEye.x);
    const pitch =
      (nose.y - (leftEye.y + rightEye.y) / 2) / (chin.y - forehead.y);

    const activeSlot = slots.find((s) => s.id === activeSlotId);
    let isAngleCorrect = false;

    switch (activeSlotId) {
      case "center":
        // Much more lenient center check (was 0.25)
        isAngleCorrect = Math.abs(yaw) < 0.4 && Math.abs(pitch) < 0.4;
        if (!isAngleCorrect) setDetectionFeedback("Look Straight");
        break;
      case "left":
        isAngleCorrect = yaw > 0.2; // Was 0.25
        if (!isAngleCorrect) setDetectionFeedback("Turn Head Left");
        break;
      case "right":
        isAngleCorrect = yaw < -0.2; // Was -0.25
        if (!isAngleCorrect) setDetectionFeedback("Turn Head Right");
        break;
      case "top":
        // Recalibrated for easier detection of upward tilt
        isAngleCorrect = pitch < 0.1 || pitch < Math.abs(yaw) * 0.5;
        if (!isAngleCorrect) setDetectionFeedback("Look Upward");
        break;
      case "bottom":
        isAngleCorrect = pitch > 0.2; // Slightly more pronounced
        if (!isAngleCorrect) setDetectionFeedback("Look Downward");
        break;
    }

    if (isAngleCorrect) {
      setDetectionFeedback("Perfect! Hold Steady");
      setIsFaceValid(true);
    } else {
      setIsFaceValid(false);
    }
  };

  const capture = useCallback(() => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc && activeSlotId) {
      updateSlot(activeSlotId, imageSrc);
      setIsCapturing(false);
      setActiveSlotId(null);
    }
  }, [webcamRef, activeSlotId]);

  // Auto-capture logic
  useEffect(() => {
    let timerId: NodeJS.Timeout;
    let countdownId: NodeJS.Timeout;

    if (isFaceValid && isCapturing && !success) {
      setCaptureCountdown(3); // Start at 3 seconds

      countdownId = setInterval(() => {
        setCaptureCountdown((prev) =>
          prev !== null && prev > 1 ? prev - 1 : prev,
        );
      }, 1000);

      timerId = setTimeout(() => {
        capture();
        setCaptureCountdown(null);
        setLivenessScore(0); // Reset for next slot
      }, 3000);
    } else {
      setCaptureCountdown(null);
    }

    return () => {
      clearTimeout(timerId);
      clearInterval(countdownId);
    };
  }, [isFaceValid, isCapturing, success, capture]);

  const updateSlot = (id: string, dataUrl: string | null) => {
    setSlots((prev) =>
      prev.map((slot) => (slot.id === id ? { ...slot, dataUrl } : slot)),
    );
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeSlotId) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateSlot(activeSlotId, reader.result as string);
        setActiveSlotId(null);
      };
      reader.readAsDataURL(file);
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Roll number is taken from selection
    const rollNo = selectedRollNo;

    if (!rollNo) {
      setError("PLEASE SELECT A STUDENT FROM THE SEARCHABLE LIST ABOVE");
      return;
    }

    const missingSlots = slots.filter((s) => !s.dataUrl);
    if (missingSlots.length > 0) {
      setError(
        `MISSING DATA: PLEASE PROVIDE ALL 5 IMAGES (${missingSlots.map((s) => s.label).join(", ")})`,
      );
      return;
    }

    setIsSubmitting(true);
    setStatusText("Preparing biometric data...");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("roll_no", rollNo);

      for (const slot of slots) {
        if (slot.dataUrl) {
          const blob = dataURLtoBlob(slot.dataUrl);
          const file = new File([blob], `${slot.id}.jpg`, {
            type: "image/jpeg",
          });
          formData.append("images", file);
        }
      }

      console.log(
        `[Frontend] Submitting ${formData.getAll("images").length} images for roll_no: ${rollNo}`,
      );

      setStatusText("Registering with AI Engine...");
      const response = await fetch("/api/register", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to register");
      }

      // Update faceRegistered status in Appwrite database
      try {
        const DB_ID = "69cb970a000853f23489";
        const COLL_STUDENTS = "student_details";
        await databases.updateDocument(DB_ID, COLL_STUDENTS, rollNo, {
          faceRegistered: true,
        });
      } catch (dbErr) {
        console.warn("Could not update faceRegistered status in DB", dbErr);
        // We don't fail here because the AI registration was successful
      }

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
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

  if (!isAdmin && !isKiosk) {
    if (typeof window !== "undefined") router.push("/");
    return null;
  }

  return (
    <GradientBackground>
      <Navigation />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 pt-24 sm:pt-32 pb-12 italic">
        <header className="mb-12 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              href="/"
              className="p-2 hover:bg-white/5 rounded-full transition-all text-white/40 hover:text-white"
            >
              <ArrowLeft size={24} />
            </Link>
            <div>
              <p className="text-secondary font-medium tracking-[0.2em] text-xs uppercase mb-1">
                Onboarding
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight uppercase leading-tight">
                Face Registration
              </h1>
            </div>
          </div>
          <div className="hidden md:flex items-center space-x-2 text-white/40 bg-surface/40 px-4 py-2 rounded-full border border-white/5">
            <ScanFace size={18} className="text-secondary" />
            <span className="text-xs font-medium uppercase tracking-wider">
              Secure Biometric Sync
            </span>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-12">
          {/* Searchable Student Selection */}
          <section className="bg-surface/30 border border-white/5 p-5 sm:p-8 rounded-[2rem] backdrop-blur-sm relative z-20 overflow-visible">
            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-secondary/5 rounded-full blur-3xl" />

            <div className="relative z-10">
              <label className="block text-white/40 text-xs font-bold uppercase tracking-[0.2em] mb-4 ml-1">
                Search & Select Student
              </label>

              <div className="relative">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-white/20 group-focus-within:text-secondary transition-colors">
                    <Search size={20} />
                  </div>
                  <input
                    type="text"
                    placeholder="ENTER ROLL NO OR NAME..."
                    className="w-full bg-background/50 border border-white/10 rounded-2xl h-14 sm:h-16 pl-12 pr-4 text-white text-base sm:text-lg font-bold focus:outline-none focus:border-secondary/50 transition-all uppercase placeholder:text-white/5"
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                  />
                </div>

                <AnimatePresence>
                  {showDropdown && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="absolute top-full left-0 right-0 mt-2 bg-surface/90 border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto z-[60] backdrop-blur-2xl"
                    >
                      {pendingStudents
                        .filter(
                          (s) =>
                            s.$id
                              .toLowerCase()
                              .includes(searchTerm.toLowerCase()) ||
                            s.name
                              ?.toLowerCase()
                              .includes(searchTerm.toLowerCase()),
                        )
                        .map((student) => (
                          <button
                            key={student.$id}
                            type="button"
                            onClick={() => {
                              setSelectedRollNo(student.$id);
                              setSearchTerm(`${student.$id} - ${student.name}`);
                              setShowDropdown(false);
                              setError(null);
                            }}
                            className="w-full p-4 hover:bg-white/5 text-left border-b border-white/5 transition-colors group flex items-center justify-between"
                          >
                            <div>
                              <p className="text-white font-bold group-hover:text-secondary transition-colors uppercase tracking-tight">
                                {student.name}
                              </p>
                              <p className="text-white/40 text-[10px] font-bold tracking-widest">
                                {student.$id}
                              </p>
                            </div>
                            <div className="text-white/10 group-hover:text-secondary/20">
                              <ScanFace size={20} />
                            </div>
                          </button>
                        ))}
                      {pendingStudents.length === 0 && (
                        <p className="p-8 text-white/20 text-xs text-center font-bold uppercase tracking-widest italic">
                          No pending registrations
                        </p>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {selectedRollNo && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="mt-6 p-4 bg-secondary/10 border border-secondary/20 rounded-[1.5rem] flex items-center justify-between group"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-secondary/20 rounded-xl flex items-center justify-center text-secondary">
                      <UserCheck size={24} />
                    </div>
                    <div>
                      <p className="text-secondary text-[10px] font-bold uppercase tracking-[0.2em]">
                        Ready For Enrollment
                      </p>
                      <p className="text-white font-black text-xl italic uppercase tracking-tighter leading-none">
                        {selectedRollNo}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRollNo("");
                      setSearchTerm("");
                    }}
                    className="text-white/20 hover:text-white/60 p-2 italic text-xs font-bold uppercase tracking-widest"
                  >
                    Clear
                  </button>
                </motion.div>
              )}
            </div>
          </section>

          {/* Image Slots */}
          <section>
            <div className="flex items-center justify-between mb-8 px-2">
              <h2 className="text-white font-semibold uppercase tracking-widest text-sm flex items-center space-x-3">
                <div className="w-1 h-4 bg-secondary rounded-full" />
                <span>Required Angles</span>
              </h2>
              <span className="text-white/20 text-xs italic">
                % Images Required
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className={`relative aspect-[4/3] rounded-[2rem] overflow-hidden border transition-all duration-500 group ${
                    slot.dataUrl
                      ? "border-secondary/20 bg-secondary/5"
                      : "border-white/5 bg-surface/30 hover:bg-surface/50"
                  }`}
                >
                  {slot.dataUrl ? (
                    <div className="relative w-full h-full">
                      <img
                        src={slot.dataUrl}
                        className="w-full h-full object-contain bg-black"
                        alt={slot.label}
                      />
                      {/* Interactive Controls Overlay */}
                      <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px] transition-opacity flex flex-col items-center justify-center p-4 sm:p-6 text-center">
                        <div className="flex space-x-3 sm:space-x-4">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveSlotId(slot.id);
                              setIsCapturing(true);
                            }}
                            className="w-12 h-12 sm:w-14 sm:h-14 bg-secondary text-background rounded-full flex items-center justify-center hover:scale-110 active:scale-90 transition-all shadow-2xl"
                            title="Retake Photo"
                          >
                            <RefreshCw size={20} />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateSlot(slot.id, null)}
                            className="w-12 h-12 sm:w-14 sm:h-14 bg-error text-white rounded-full flex items-center justify-center hover:scale-110 active:scale-90 transition-all shadow-2xl"
                            title="Clear Photo"
                          >
                            <Trash2 size={20} />
                          </button>
                        </div>
                        <p className="mt-4 text-white text-[10px] font-black uppercase tracking-[0.2em] bg-black/50 px-3 py-1 rounded-full backdrop-blur-md">
                          {slot.label}
                        </p>
                      </div>
                      <div className="absolute top-4 right-4 bg-secondary text-background p-1.5 rounded-full shadow-lg z-20">
                        <CheckCircle size={14} />
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center space-y-4">
                      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center text-white/20 group-hover:text-white/40 transition-all group-hover:scale-110">
                        <ImageIcon size={32} />
                      </div>
                      <div>
                        <h3 className="text-white font-bold uppercase text-sm mb-1">
                          {slot.label}
                        </h3>
                        <p className="text-white/30 text-xs">
                          {slot.description}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedRollNo) {
                            setError(
                              "CRITICAL: SELECT A STUDENT BEFORE STARTING CAPTURE",
                            );
                            window.scrollTo({ top: 0, behavior: "smooth" });
                            return;
                          }
                          setActiveSlotId(slot.id);
                          setIsCapturing(true);
                        }}
                        className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/5 rounded-xl py-3 text-xs font-bold uppercase tracking-widest transition-all"
                      >
                        Capture / Upload
                      </button>
                    </div>
                  )}
                  <div className="absolute bottom-4 left-4 right-4 h-1 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-700 ${slot.dataUrl ? "w-full bg-secondary" : "w-0 bg-primary"}`}
                    />
                  </div>
                </div>
              ))}
            </div>
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

          <div className="flex justify-center pt-8">
            <button
              type="submit"
              disabled={isSubmitting || !!success}
              className={`w-full max-w-sm h-16 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-[2rem] font-bold uppercase tracking-[0.2em] transition-all disabled:opacity-50 disabled:grayscale relative overflow-hidden italic hover:border-secondary/30 active:scale-[0.98]`}
            >
              {isSubmitting ? (
                <div className="flex items-center justify-center space-x-4">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span className="text-xs">{statusText}</span>
                </div>
              ) : success ? (
                <span className="text-xs">ENROLLMENT COMPLETE</span>
              ) : (
                <span className="text-xs">Initialize Enrollment</span>
              )}
            </button>
          </div>
        </form>
      </main>

      {/* Capture Dialog */}
      <AnimatePresence>
        {isCapturing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-background/95 backdrop-blur-2xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="w-full max-w-2xl bg-surface border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl italic"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div>
                  <h2 className="text-xl font-bold text-white uppercase tracking-tight mb-1">
                    Capture {slots.find((s) => s.id === activeSlotId)?.label}
                  </h2>
                  <p className="text-white/40 text-xs uppercase tracking-widest font-medium">
                    Position face according to angle
                  </p>
                </div>
                <button
                  onClick={() => {
                    setIsCapturing(false);
                    setActiveSlotId(null);
                  }}
                  className="p-3 hover:bg-white/5 rounded-full text-white/40 hover:text-white transition-all"
                >
                  <ArrowLeft size={24} />
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
                    {/* Overlay Guides */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div
                        className={`w-56 h-72 border-4 border-dashed rounded-[6rem] flex items-center justify-center transition-all duration-300 ${isFaceValid ? "border-secondary scale-105" : "border-white/20"}`}
                      >
                        <div
                          className={`w-48 h-64 border-2 rounded-[5rem] transition-all ${isFaceValid ? "border-secondary/40" : "border-white/5"}`}
                        />
                      </div>

                      {/* Detection Status & Countdown */}
                      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center space-y-4">
                        <AnimatePresence>
                          {captureCountdown !== null && (
                            <motion.div
                              initial={{ scale: 0.5, opacity: 0 }}
                              animate={{ scale: 1.2, opacity: 1 }}
                              exit={{ scale: 2, opacity: 0 }}
                              className="w-16 h-16 bg-secondary text-background rounded-full flex items-center justify-center text-2xl font-black italic shadow-2xl"
                            >
                              {captureCountdown}
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div
                          className={`px-4 py-2 rounded-full backdrop-blur-md border text-[10px] font-black uppercase tracking-widest transition-all ${isFaceValid ? "bg-secondary/20 border-secondary text-secondary" : "bg-black/50 border-white/10 text-white/40"}`}
                        >
                          {detectionFeedback}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-secondary/10 border border-secondary/20 p-4 rounded-2xl text-center">
                  <p className="text-secondary font-bold uppercase tracking-tighter text-sm italic">
                    {slots.find((s) => s.id === activeSlotId)?.description}
                  </p>
                </div>

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
                    <p className="text-secondary font-black uppercase text-[8px] italic">
                      AI Alignment Secured
                    </p>
                  )}
                </div>
              </div>

              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileUpload}
              />
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
            className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-background/90 backdrop-blur-xl"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm bg-surface p-8 rounded-[3rem] border border-white/10 text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-secondary/20 rounded-full flex items-center justify-center text-secondary mx-auto mb-8 shadow-xl shadow-secondary/5">
                <CheckCircle size={40} />
              </div>
              <h2 className="text-2xl font-bold text-white mb-4 uppercase italic">
                Enrollment Complete
              </h2>
              <p className="text-white/40 mb-10 text-sm font-medium leading-relaxed italic">
                Face data for{" "}
                <span className="text-white font-bold">{selectedRollNo}</span>{" "}
                has been successfully added to the biometric database.
              </p>
              <button
                onClick={() => router.push("/")}
                className="w-full h-14 bg-gradient-to-r from-secondary to-primary text-white rounded-2xl font-bold uppercase tracking-widest hover:brightness-110 transition-all shadow-lg shadow-secondary/10 italic"
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
