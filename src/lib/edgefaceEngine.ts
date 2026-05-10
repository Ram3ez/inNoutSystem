"use client";

/**
 * EdgeFace Recognition Engine
 * Handles face embedding extraction using the EdgeFace ONNX model via a Web Worker.
 * Includes utilities for facial alignment and cropping.
 */


import { fetchWithProgress } from "./fetchProgress";

let worker: Worker | null = null;
let initPromise: Promise<any> | null = null;
const pendingRequests = new Map<number, (embedding: Float32Array) => void>();
let requestIdCounter = 0;

/**
 * Initializes the EdgeFace Web Worker and warms up the model.
 */
export async function initEdgeFace(updateProgress?: (p: number, s: string) => void): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Step 1 – Pre-download the ONNX WASM runtime.
      // ONNX Runtime fetches its .wasm file inside the Worker where there is no
      // way to hook a progress callback. By downloading it here on the main thread
      // first, we both show a real progress bar AND warm the SW cache so the
      // worker gets a near-instant cache hit when it makes the same request.
      if (updateProgress) updateProgress(0, "Downloading WASM Runtime...");
      await fetchWithProgress(
        "/models/ort-wasm-simd-threaded.wasm",
        (p) => updateProgress?.(p * 0.4, "Downloading WASM Runtime...")
      );

      // Step 2 – Download the EdgeFace model binary with progress.
      if (updateProgress) updateProgress(40, "Downloading Edge Model...");
      const modelBuffer = await fetchWithProgress(
        "/models/edgeface_fp16.onnx",
        (p) => updateProgress?.(40 + p * 0.6, "Downloading Edge Model...")
      );

      return new Promise<void>((resolve, reject) => {
        worker = new Worker(new URL("./edgeface.worker.ts", import.meta.url));

        worker.onmessage = (e) => {
          const { type, embedding, id, error } = e.data;
          if (type === "INIT_DONE") {
            console.log("[🧠 ENGINE] EdgeFace Worker Initialized.");
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
      console.error("[🧠 ENGINE] EdgeFace Initialization failed:", e);
      throw e;
    }
  })();


  return initPromise;
}

/**
 * Extracts a 512-dimension embedding from a face image.
 * Assumes the input image is already cropped to the face for best results.
 */
export async function extractEdgeFaceEmbedding(
  canvas: HTMLCanvasElement | ImageData,
): Promise<Float32Array> {
  await initEdgeFace();
  if (!worker) throw new Error("EdgeFace Worker not initialized");

  return new Promise((resolve) => {
    const id = requestIdCounter++;
    pendingRequests.set(id, resolve);

    let imageData: ImageData;
    if (canvas instanceof HTMLCanvasElement) {
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get canvas context");
      imageData = ctx.getImageData(0, 0, 112, 112);
    } else {
      imageData = canvas;
    }

    worker!.postMessage({ type: "INFERENCE", imageData, id });
  });
}

let sharedCropCanvas: HTMLCanvasElement | null = null;

/**
 * High precision facial cropping & alignment for EdgeFace.
 * Uses eye landmarks to rotate the face so eyes are level.
 */
export async function getEdgeFaceDescriptor(
  source: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement,
  box: { x: number; y: number; width: number; height: number },
  landmarks?: any,
  flip: boolean = false,
): Promise<Float32Array> {
  if (!sharedCropCanvas) {
    sharedCropCanvas = document.createElement("canvas");
    sharedCropCanvas.width = 112;
    sharedCropCanvas.height = 112;
  }

  const ctx = sharedCropCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    console.error("[🧠 ENGINE] Canvas context creation failed");
    return new Float32Array(512);
  }

  const dw = (source as any).videoWidth || (source as any).naturalWidth || source.width;
  const dh = (source as any).videoHeight || (source as any).naturalHeight || source.height;

  ctx.clearRect(0, 0, 112, 112);

  let l: { x: number; y: number } | null = null;
  let r: { x: number; y: number } | null = null;

  if (landmarks) {
    if (Array.isArray(landmarks)) {
      if (landmarks.length >= 33) {
        l = { x: landmarks[33].x * dw, y: landmarks[33].y * dh };
        r = { x: landmarks[263].x * dw, y: landmarks[263].y * dh };
      } else if (landmarks.length === 2) {
        l = { x: landmarks[0].x * dw, y: landmarks[0].y * dh };
        r = { x: landmarks[1].x * dw, y: landmarks[1].y * dh };
      }
    } else if (landmarks.positions && Array.isArray(landmarks.positions)) {
      const pts = landmarks.positions;
      if (pts.length === 68) {
        l = pts[36];
        r = pts[45];
      }
    }
  }

  // --- AFFINE ALIGNMENT ---
  // standardizes the face image into a 112x112 square.
  // Proper alignment significantly increases recognition accuracy.
  if (l && r && dw && dh) {
    // 1. Calculate the roll angle (tilt) of the head
    const dy = r.y - l.y;
    const dx = r.x - l.x;
    const angle = Math.atan2(dy, dx);

    // 2. Find the eye midpoint as the rotational anchor
    const mx = (l.x + r.x) / 2;
    const my = (l.y + r.y) / 2;

    // 3. Scale calculation based on Interpupillary Distance (IPD)
    // For EdgeFace (112px input), we target an IPD of ~48px.
    const desiredDistance = 48;
    const actualDistance = Math.sqrt(dx * dx + dy * dy);
    const scale = desiredDistance / actualDistance;

    ctx.save();
    if (flip) {
      // Handle mirrored video streams (typical of front cameras)
      ctx.translate(112, 0);
      ctx.scale(-1, 1);
    }
    
    // Transform to center-point (56, 48) on the output canvas
    ctx.translate(56, 48);
    ctx.rotate(-angle);
    ctx.scale(scale, scale);
    ctx.translate(-mx, -my);
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  } else {
    // FALLBACK: If landmarks failed, perform a simple centered crop.
    drawSimpleCrop(ctx, source, box);
  }

  return extractEdgeFaceEmbedding(sharedCropCanvas);
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
 * Safely terminates the EdgeFace Web Worker and releases its memory.
 */
export async function disposeEdgeFace(): Promise<void> {
  if (initPromise) {
    try {
      await initPromise; // Wait for init to finish before killing
    } catch (e) {
      // Ignore init errors during disposal
    }
  }
  
  if (worker) {
    worker.terminate();
    console.log("[🧠 ENGINE] EdgeFace Worker terminated.");
  }
  
  // Clear pending requests to prevent memory leaks in the map
  pendingRequests.clear();
  
  worker = null;
  initPromise = null;
}
