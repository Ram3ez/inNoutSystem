"use client";

/**
 * GhostFaceNet Recognition Engine
 * Handles high-precision face embedding extraction and facial alignment.
 * Uses a Web Worker for ONNX inference and includes a quality guard for frame selection.
 */


import { fetchWithProgress } from "./fetchProgress";

let worker: Worker | null = null;
let initPromise: Promise<any> | null = null;
let disposePromise: Promise<void> | null = null;
const pendingRequests = new Map<number, (embedding: Float32Array) => void>();
let requestIdCounter = 0;

/**
 * Initializes the GhostFace Web Worker and warms up the model.
 */
export async function initGhostFace(updateProgress?: (p: number, s: string) => void): Promise<void> {
  if (disposePromise) await disposePromise;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Step 1 – Pre-download the ONNX WASM runtime.
      // ONNX Runtime fetches its .wasm file inside the Worker where there is no
      // way to hook a progress callback. Downloading it here first shows a real
      // progress bar AND warms the SW cache so the worker gets an instant hit.
      if (updateProgress) updateProgress(0, "Downloading WASM Runtime...");
      await fetchWithProgress(
        "/models/ort-wasm-simd-threaded.wasm",
        (p) => updateProgress?.(p * 0.4, "Downloading WASM Runtime...")
      );

      // Step 2 – Download the GhostFace model binary with progress.
      if (updateProgress) updateProgress(40, "Downloading Recognition Model...");
      const modelBuffer = await fetchWithProgress(
        "/models/ghostfacenet_fp16.onnx",
        (p) => updateProgress?.(40 + p * 0.6, "Downloading Recognition Model...")
      );

      return new Promise<void>((resolve, reject) => {
        worker = new Worker(new URL("./ghostface.worker.ts", import.meta.url));

        worker.onmessage = (e) => {
          const { type, embedding, id, error } = e.data;
          if (type === "INIT_DONE") {
            console.log("[🧠 ENGINE] GhostFaceNet Worker Initialized.");
            resolve();
          } else if (type === "INFERENCE_DONE") {
            const callback = pendingRequests.get(id);
            if (callback) {
              callback(embedding);
              pendingRequests.delete(id);
            }
          } else if (type === "ERROR") {
            console.error("[🧠 ENGINE] Worker Error:", error);
          }
        };

        // Pass the downloaded buffer to the worker
        worker.postMessage({ type: "INIT", modelBuffer }, [modelBuffer]);
      });
    } catch (e) {
      console.error("[🧠 ENGINE] GhostFace Initialization failed:", e);
      throw e;
    }
  })();


  return initPromise;
}

/**
 * Extracts a 512-dimension embedding from a face image.
 * Assumes the input image is already cropped to the face for best results.
 */
export async function extractGhostFaceEmbedding(
  canvas: HTMLCanvasElement | ImageData,
): Promise<Float32Array> {
  await initGhostFace();
  if (!worker) throw new Error("GhostFace Worker not initialized");

  return new Promise((resolve) => {
    const id = requestIdCounter++;
    pendingRequests.set(id, resolve);

    let imageData: ImageData;
    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
      imageData = canvas;
    }

    const activeWorker = worker!;
    activeWorker.postMessage({ type: "INFERENCE", imageData, id }, [
      imageData.data.buffer,
    ]);
  });
}

let sharedCropCanvas: HTMLCanvasElement | null = null;

/**
 * Uses eye landmarks to rotate the face so eyes are level.
 */
export async function getGhostFaceDescriptor(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  box: { x: number; y: number; width: number; height: number },
  landmarks?: any,
  flip: boolean = false,
): Promise<Float32Array> {
  // Reuse single canvas instance to prevent memory leaks
  if (!sharedCropCanvas) {
    sharedCropCanvas = document.createElement("canvas");
    sharedCropCanvas.width = 112;
    sharedCropCanvas.height = 112;
  }

  const ctx = sharedCropCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas context failed");

  let sw =
    (source as any).videoWidth || (source as any).naturalWidth || source.width;
  let sh =
    (source as any).videoHeight ||
    (source as any).naturalHeight ||
    source.height;

  if (!sw || !sh) return new Float32Array(512);

  ctx.clearRect(0, 0, 112, 112);

    // --- SUPERIOR AFFINE ALIGNMENT ---
    // We use affine transformation to rotate and scale the face into a standardized 112x112 crop.
    // This process (Alignment) is critical for high-accuracy recognition.
    // We can handle either Face-API landmarks or MediaPipe landmarks (Array of 478 pts).
    let l: { x: number; y: number } | null = null;
    let r: { x: number; y: number } | null = null;

    if (Array.isArray(landmarks)) {
      // CASE 1: MEDIAPIPE LANDMARKS (Normalized 0.0 - 1.0)
      // Index mapping: Left eye inner corner: 133, Right eye inner corner: 362.
      // We scale these normalized coordinates to pixel coordinates based on source dimensions.
      const getMPCoord = (idx: number) => ({
        x: landmarks[idx].x * sw,
        y: landmarks[idx].y * sh,
      });

      const lCorner = getMPCoord(33);
      const rCorner = getMPCoord(263);

      // ALIGNMENT MATH:
      // 1. Calculate the angle between the eyes to determine head tilt (Roll).
      const dy = rCorner.y - lCorner.y;
      const dx = rCorner.x - lCorner.x;
      const angle = Math.atan2(dy, dx);

      // 2. Calculate the interpupillary distance (IPD) to determine face scale.
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // SOTA Constraint: For a 112px input, eyes should be ~51.5px apart (IPD).
      const desiredEyeDist = 51.5; 
      const scale = desiredEyeDist / dist;

      // 3. Eye midpoint serves as our rotational anchor.
      const mx = (lCorner.x + rCorner.x) / 2;
      const my = (lCorner.y + rCorner.y) / 2;

      ctx.save();
      // We translate the center-point of the eyes to (56, 48) on the 112x112 target.
      ctx.translate(56, 48);

      if (flip) {
        ctx.scale(-1, 1);
      }

      // Apply the inverse roll and the required scale
      ctx.rotate(-angle);
      ctx.scale(scale, scale);
      
      // Move back to the eye midpoint in the source space
      ctx.translate(-mx, -my);
      ctx.drawImage(source, 0, 0);
      ctx.restore();
      
      l = lCorner;
      r = rCorner;
    } else if (!l || !r) {
      // FALLBACK: Simple bounding-box crop if landmarks are missing or failed.
      drawSimpleCrop(ctx, source, box);
    }

    /**
     * Quality Guard (Pre-Inference)
     * We analyze the cropped 112x112 face image before passing it to the Neural Engine.
     * If the frame is blurry or under-exposed, we skip it to prevent unstable embeddings.
     */
    const quality = checkFaceQuality(ctx);
    if (!quality.isGood) {
      console.warn(`[🧠 ENGINE] Skipping frame: ${quality.reason}`);
      return new Float32Array(512); // Zeroed descriptor signals a skip to the caller
    }

  return extractGhostFaceEmbedding(sharedCropCanvas);
}

/**
 * Quality Guard: Checks for under-exposure and motion blur.
 * Ensures we only run inference on high-quality frames.
 */
function checkFaceQuality(ctx: CanvasRenderingContext2D): {
  isGood: boolean;
  reason?: string;
} {
  const imageData = ctx.getImageData(0, 0, 112, 112);
  const data = imageData.data;

  let totalBrightness = 0;
  let variance = 0;
  const pixels = data.length / 4;

  // 1. Exposure Check (Average Brightness)
  for (let i = 0; i < data.length; i += 4) {
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
    totalBrightness += brightness;
  }
  const avgBrightness = totalBrightness / pixels;

  if (avgBrightness < 45) return { isGood: false, reason: "UNDER_EXPOSED" };
  if (avgBrightness > 250) return { isGood: false, reason: "OVER_EXPOSED" };

  // 2. Simple Blur Detection (Edge Intensity)
  // We check the variance of grayscale values to see if there's enough detail
  let avgDetail = 0;
  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    avgDetail += gray;
  }
  const mean = avgDetail / pixels;

  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    variance += Math.pow(gray - mean, 2);
  }
  const stdDev = Math.sqrt(variance / pixels);

  // If stdDev is very low, the image is very "flat" (likely blurry or out of focus)
  if (stdDev < 15) return { isGood: false, reason: "MOTION_BLUR" };

  return { isGood: true };
}

function drawSimpleCrop(ctx: CanvasRenderingContext2D, source: any, box: any) {
  const padding = 0.1;
  const px = (box.width || 0) * padding;
  const py = (box.height || 0) * padding;

  ctx.drawImage(
    source,
    (box.x || 0) - px,
    (box.y || 0) - py,
    (box.width || 1) + px * 2,
    (box.height || 1) + py * 2,
    0,
    0,
    112,
    112,
  );
}

/**
 * Safely terminates the GhostFace Web Worker and releases its memory.
 */
export async function disposeGhostFace(): Promise<void> {
  if (initPromise) {
    const p = initPromise;
    const w = worker;
    worker = null;
    initPromise = null;

    disposePromise = (async () => {
      try {
        await p;
        if (w) {
          w.terminate();
          console.log("[🧠 ENGINE] GhostFace Worker terminated.");
        }
      } catch (e) {
      } finally {
        disposePromise = null;
      }
    })();

    return disposePromise;
  }

  // Clear pending requests to prevent memory leaks in the map
  pendingRequests.clear();
}
