"use client";

import React, { useRef, useState, useEffect } from "react";
import ReactWebcam from "react-webcam";
import {
  ArrowLeft,
  Play,
  Table,
  Cpu,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import * as faceapi from "face-api.js";
import {
  loadBaseFaceModels,
  loadFaceCache,
  isAIReady,
  getMemoryCache,
  getMemoryCacheGhost,
} from "@/lib/faceCache";
import { BIOMETRIC_THRESHOLDS } from "@/lib/constants";
import { getLandmarker, getLandmarkerSync } from "@/lib/aiEngine";
import { initGhostFace, getGhostFaceDescriptor } from "@/lib/ghostfaceEngine";
import { GradientBackground } from "@/components/GradientBackground";

interface CompareResult {
  rollNo: string;
  ghostScore: number;
  faceApiScore: number;
}

export default function CompareLab() {
  const webcamRef = useRef<ReactWebcam>(null);
  const [isReady, setIsReady] = useState(false);
  const [results, setResults] = useState<CompareResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [imgSrc, setImgSrc] = useState<string | null>(null);

  const [status, setStatus] = useState("");

  useEffect(() => {
    const init = async () => {
      setStatus("Loading Neural Models...");
      await loadBaseFaceModels();
      setStatus("Synchronizing Biometric Database...");
      await loadFaceCache();
      setStatus("Warming Up Landmarker...");
      await getLandmarker();
      setStatus("Initializing GhostFace Engine...");
      await initGhostFace();
      setIsReady(true);
      setStatus("");
    };
    init();
  }, []);

  const analyze = async () => {
    if (!webcamRef.current) return;
    setIsAnalyzing(true);
    setStatus("Waking up camera...");

    let video = webcamRef.current.video;

    // Retry loop for slow-starting cameras
    let retries = 0;
    while (
      (!video || video.videoWidth === 0 || video.readyState < 4) &&
      retries < 10
    ) {
      await new Promise((r) => setTimeout(r, 100));
      video = webcamRef.current.video;
      retries++;
    }

    if (!video || video.videoWidth === 0) {
      alert("Camera timed out or reported 0px resolution. Please refresh.");
      setIsAnalyzing(false);
      setStatus("");
      return;
    }

    const screenshot = webcamRef.current.getScreenshot();
    if (!screenshot) {
      setIsAnalyzing(false);
      setStatus("");
      return;
    }

    try {
      // 1. Detect and Extract for BOTH
      setStatus("AI Step 1: Running Neural Engine...");

      const tf = (faceapi as any).tf;
      if (tf) {
        try {
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
          if (isIOS && tf.setBackend) {
            await tf.setBackend("cpu");
          }
        } catch (err) {}
        if (tf.engine) tf.engine().startScope();
      }

       try {
        const swOriginal = video.videoWidth || 640;
        const shOriginal = video.videoHeight || 480;

        // Scale down while preserving the EXACT aspect ratio to prevent face distortion
        const maxDim = 480;
        let dw = swOriginal;
        let dh = shOriginal;
        if (swOriginal > shOriginal && swOriginal > maxDim) {
          dw = maxDim;
          dh = Math.round((shOriginal * maxDim) / swOriginal);
        } else if (shOriginal > swOriginal && shOriginal > maxDim) {
          dh = maxDim;
          dw = Math.round((swOriginal * maxDim) / shOriginal);
        }

        // Create a lightweight static canvas using the correct aspect ratio
        const cropCanvas = document.createElement("canvas");
        cropCanvas.width = dw;
        cropCanvas.height = dh;
        const cropCtx = cropCanvas.getContext("2d", { willReadFrequently: true });
        if (!cropCtx) throw new Error("Could not create canvas context");
        cropCtx.drawImage(video, 0, 0, dw, dh);

        // --- 1a. MEDIAPIPE (GhostFace Path) ---
        const landmarker = getLandmarkerSync();
        if (!landmarker) throw new Error("Landmarker not ready");
        const mpResult = landmarker.detectForVideo(cropCanvas, performance.now());

        if (!mpResult.faceLandmarks || mpResult.faceLandmarks.length === 0) {
          throw new Error("MediaPipe failed to find face. Try again.");
        }

        const mpLandmarks = mpResult.faceLandmarks[0];

        // Estimate a bounding box from landmarks for the crop
        const xs = mpLandmarks.map((p: any) => p.x);
        const ys = mpLandmarks.map((p: any) => p.y);
        const minX = Math.min(...xs),
          maxX = Math.max(...xs);
        const minY = Math.min(...ys),
          maxY = Math.max(...ys);

        const sw = dw;
        const sh = dh;

        const mpBox = {
          x: minX * sw,
          y: minY * sh,
          width: (maxX - minX) * sw,
          height: (maxY - minY) * sh,
        };

        // Use MediaPipe landmarks for GhostFace parity!
        const ghostDescriptor = await getGhostFaceDescriptor(
          cropCanvas,
          mpBox,
          mpLandmarks,
        );

        // Yield to browser thread to release WASM/VRAM buffers before launching legacy path
        await new Promise((r) => setTimeout(r, 100));

        // --- 1b. FACE-API (Legacy Path) ---
        const faceApiDetection = await faceapi
          .detectSingleFace(
            cropCanvas,
            new faceapi.SsdMobilenetv1Options({ minConfidence: 0.4 }),
          )
          .withFaceLandmarks()
          .withFaceDescriptor();

        const faceApiDescriptor = faceApiDetection?.descriptor;

        if (!ghostDescriptor) throw new Error("GhostFace engine failed");

        // NOW WE CAN FREEZE
        setImgSrc(screenshot);

        // 2. Perform Database Comparisons
        setStatus("AI Step 2: Comparing with 3,000+ Students...");

        const ghostCache = getMemoryCacheGhost();
        const faceApiCache = getMemoryCache();
        const allRollNos = Array.from(
          new Set([...Object.keys(ghostCache), ...Object.keys(faceApiCache)]),
        );

        const comparison: CompareResult[] = [];
        const CHUNK_SIZE = 100;

        for (let i = 0; i < allRollNos.length; i += CHUNK_SIZE) {
          const chunk = allRollNos.slice(i, i + CHUNK_SIZE);

          chunk.forEach((rollNo) => {
            // GhostFace (Cosine Similarity)
            let ghostMax = 0;
            if (ghostCache[rollNo]) {
              ghostCache[rollNo].forEach((saved) => {
                let score = 0;
                for (let j = 0; j < saved.length; j++) {
                  score += ghostDescriptor[j] * saved[j];
                }
                if (score > ghostMax) ghostMax = score;
              });
            }

            // Face-API (Euclidean converted to score)
            let faceApiMax = 0;
            if (faceApiCache[rollNo] && faceApiDescriptor) {
              faceApiCache[rollNo].forEach((saved) => {
                const dist = faceapi.euclideanDistance(
                  faceApiDescriptor,
                  saved,
                );
                const score = Math.max(0, 1 - dist);
                if (score > faceApiMax) faceApiMax = score;
              });
            }

            comparison.push({
              rollNo,
              ghostScore: ghostMax,
              faceApiScore: faceApiMax,
            });
          });

          // Yield UI thread
          setStatus(
            `AI Step 3: Scanning... ${Math.min(i + CHUNK_SIZE, allRollNos.length)}/${allRollNos.length}`,
          );
          await new Promise((r) => setTimeout(r, 10));
        }

        setStatus("AI Step 4: Sorting Leaderboard...");
        // Sort by best ghost score
        comparison.sort((a, b) => b.ghostScore - a.ghostScore);
        setResults(comparison);
        setStatus("");
      } finally {
        if (tf && tf.engine) tf.engine().endScope();
      }
    } catch (e: any) {
      console.error(e);
      alert(`Analysis failed: ${e.message || e}`);
      setStatus("Error: Check Console");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const cosineSimilarity = (a: Float32Array, b: Float32Array) => {
    let dot = 0,
      nx = 0,
      ny = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      nx += a[i] * a[i];
      ny += b[i] * b[i];
    }
    return nx === 0 || ny === 0 ? 0 : dot / (Math.sqrt(nx) * Math.sqrt(ny));
  };

  if (!isReady) {
    return (
      <GradientBackground>
        <div className="flex items-center justify-center h-screen text-primary/40 font-bold uppercase tracking-widest animate-pulse">
          Initializing Comparison Lab...
        </div>
      </GradientBackground>
    );
  }

  return (
    <GradientBackground>
      <div className="flex-1 flex flex-col p-6 overflow-auto">
        <header className="mb-8 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <ShieldCheck className="text-secondary" size={32} />
            <h1 className="text-2xl font-black text-primary tracking-tighter uppercase italic">
              AI Comparison <span className="text-secondary">Lab</span>
            </h1>
          </div>
          <button
            onClick={() => {
              setResults([]);
              setImgSrc(null);
            }}
            className="px-4 py-2 bg-primary/5 rounded-xl text-[10px] font-bold uppercase tracking-widest text-primary/40 hover:bg-primary/10 transition-all"
          >
            Clear Data
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Camera Section */}
          <div className="space-y-6">
            <div className="relative aspect-video bg-black rounded-3xl overflow-hidden border border-primary/10 shadow-2xl">
              {imgSrc ? (
                <div className="relative w-full h-full">
                  <img
                    src={imgSrc}
                    className="w-full h-full object-cover"
                    alt="Captured"
                  />
                  <button
                    onClick={() => {
                      setImgSrc(null);
                      setResults([]);
                    }}
                    className="absolute top-4 right-4 p-3 bg-black/60 backdrop-blur-md rounded-xl text-white hover:bg-secondary transition-all shadow-xl z-20"
                  >
                    <RefreshCw size={20} />
                  </button>
                </div>
              ) : (
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
              )}

              {isAnalyzing && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center space-y-4 z-10">
                  <div className="w-12 h-12 border-4 border-secondary border-t-transparent rounded-full animate-spin" />
                  <p className="text-[10px] font-bold text-secondary uppercase tracking-[0.3em] px-8 text-center leading-loose">
                    {status || "Crunching vectors..."}
                  </p>
                </div>
              )}
            </div>

            {imgSrc ? (
              <button
                onClick={() => {
                  setImgSrc(null);
                  setResults([]);
                }}
                className="w-full h-16 bg-primary/10 text-primary rounded-2xl font-black uppercase tracking-widest flex items-center justify-center space-x-3 hover:bg-primary/20 transition-all border border-primary/20"
              >
                <RefreshCw size={20} />
                <span>Reset & Start New Scan</span>
              </button>
            ) : (
              <button
                onClick={analyze}
                disabled={isAnalyzing}
                className="w-full h-16 bg-primary text-background rounded-2xl font-black uppercase tracking-widest flex items-center justify-center space-x-3 hover:brightness-110 transition-all shadow-xl shadow-primary/20"
              >
                <Play size={20} fill="currentColor" />
                <span>Analyze & Compare All</span>
              </button>
            )}
          </div>

          {/* Results Table */}
          <div className="bg-surface/40 backdrop-blur-md rounded-3xl border border-primary/10 overflow-hidden flex flex-col h-[600px]">
            <div className="p-6 border-b border-primary/5 bg-primary/5 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Table size={16} className="text-secondary" />
                <h2 className="text-[10px] font-black uppercase tracking-widest text-primary">
                  Biometric Leaderboard
                </h2>
              </div>
              <span className="text-[10px] font-bold text-primary/40 uppercase">
                {results.length} Identities Checked
              </span>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-surface/80 backdrop-blur-md z-10">
                  <tr className="border-b border-primary/5">
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest text-primary/40">
                      Student ID
                    </th>
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest text-secondary">
                      GhostFace (Sim)
                    </th>
                    <th className="p-4 text-[9px] font-black uppercase tracking-widest text-primary">
                      Face-API (Sim*)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="p-12 text-center text-primary/20 text-[10px] font-bold uppercase tracking-widest"
                      >
                        Scan your face to see scores
                      </td>
                    </tr>
                  ) : (
                    results.map((res, i) => (
                      <tr
                        key={res.rollNo}
                        className={`border-b border-primary/5 transition-colors hover:bg-primary/5 ${i === 0 ? "bg-secondary/5" : ""}`}
                      >
                        <td className="p-4 font-black text-primary text-sm tracking-tight">
                          {res.rollNo}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span
                              className={`text-sm font-black ${res.ghostScore >= BIOMETRIC_THRESHOLDS.GHOSTFACE.MATCH ? "text-secondary" : "text-primary/40"}`}
                            >
                              {(res.ghostScore * 100).toFixed(1)}%
                            </span>
                            <div className="w-full h-1 bg-primary/5 rounded-full mt-1 overflow-hidden">
                              <div
                                className={`h-full transition-all duration-1000 ${res.ghostScore >= BIOMETRIC_THRESHOLDS.GHOSTFACE.MATCH ? "bg-secondary" : "bg-primary/20"}`}
                                style={{ width: `${res.ghostScore * 100}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-primary/60">
                              {(res.faceApiScore * 100).toFixed(1)}%
                            </span>
                            <div className="w-full h-1 bg-primary/5 rounded-full mt-1 overflow-hidden">
                              <div
                                className="h-full bg-primary/20"
                                style={{ width: `${res.faceApiScore * 100}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10">
            <div className="flex items-center space-x-2 mb-2 text-secondary">
              <ShieldCheck size={16} />
              <h3 className="text-[10px] font-black uppercase tracking-widest">
                Cosine Similarity
              </h3>
            </div>
            <p className="text-[10px] text-primary/60 leading-relaxed font-medium">
              GhostFaceNet uses Cosine Similarity (Higher is better). 0.55+ is a
              strong match. 0.75+ is highly confident.
            </p>
          </div>
          <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10">
            <div className="flex items-center space-x-2 mb-2 text-primary">
              <Cpu size={16} />
              <h3 className="text-[10px] font-black uppercase tracking-widest">
                Euclidean Distance
              </h3>
            </div>
            <p className="text-[10px] text-primary/60 leading-relaxed font-medium">
              Face-API uses distance. In this table, we've converted it to %
              (Higher is better). 0.60+ is a match.
            </p>
          </div>
          <div className="p-6 bg-primary/5 rounded-2xl border border-primary/10 flex items-center justify-center">
            <div className="text-center">
              <p className="text-primary/20 text-[8px] font-black uppercase tracking-[0.4em] mb-1">
                Scale Test
              </p>
              <p className="text-primary font-black text-xl italic tracking-tighter uppercase">
                {results.length} Students Indexed
              </p>
            </div>
          </div>
        </div>
      </div>
    </GradientBackground>
  );
}
