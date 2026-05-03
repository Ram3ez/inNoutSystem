"use client";

let worker: Worker | null = null;
let initPromise: Promise<void> | null = null;
const pendingRequests = new Map<number, (embedding: Float32Array) => void>();
let requestIdCounter = 0;

/**
 * Initializes the GhostFace Web Worker and warms up the model.
 */
export async function initGhostFace(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    try {
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

      worker.postMessage({ type: "INIT" });
    } catch (e) {
      reject(e);
    }
  });

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
  // We can handle either Face-API landmarks or MediaPipe landmarks (Array of 478 pts)
  let l: { x: number; y: number } | null = null;
  let r: { x: number; y: number } | null = null;

  if (Array.isArray(landmarks)) {
    // MEDIAPIPE LANDMARKS (Normalized 0.0 - 1.0)
    // Left eye corners: 33, 133. Right eye: 362, 263. Nose bridge: 168.
    const getMPCoord = (idx: number) => ({
      x: landmarks[idx].x * sw,
      y: landmarks[idx].y * sh,
    });

    const lCorner = getMPCoord(33);
    const rCorner = getMPCoord(263);

    // Calculate angle based on eyes
    const dy = rCorner.y - lCorner.y;
    const dx = rCorner.x - lCorner.x;
    const angle = Math.atan2(dy, dx);

    // Scale based on eye distance
    const dist = Math.sqrt(dx * dx + dy * dy);
    const desiredEyeDist = 51.5; // 46% of 112px
    const scale = desiredEyeDist / dist;

    // Use eye midpoint as the anchor to match Face-API logic
    const mx = (lCorner.x + rCorner.x) / 2;
    const my = (lCorner.y + rCorner.y) / 2;

    ctx.save();
    // Standard GhostFaceNet anchor: Eye midpoint at (56, 48)
    ctx.translate(56, 48);

    if (flip) {
      ctx.scale(-1, 1);
    }

    ctx.rotate(-angle);
    ctx.scale(scale, scale);
    ctx.translate(-mx, -my);
    ctx.drawImage(source, 0, 0);
    ctx.restore();

    // Safety check
    l = lCorner;
    r = rCorner;
  } else if (landmarks && landmarks.getLeftEye && landmarks.getRightEye) {
    // FACE-API LANDMARKS (Pixel coordinates)
    const leftEyePoints = landmarks.getLeftEye();
    const rightEyePoints = landmarks.getRightEye();
    if (leftEyePoints?.length > 0 && rightEyePoints?.length > 0) {
      l = {
        x:
          leftEyePoints.reduce((s: any, p: any) => s + p.x, 0) /
          leftEyePoints.length,
        y:
          leftEyePoints.reduce((s: any, p: any) => s + p.y, 0) /
          leftEyePoints.length,
      };
      r = {
        x:
          rightEyePoints.reduce((s: any, p: any) => s + p.x, 0) /
          rightEyePoints.length,
        y:
          rightEyePoints.reduce((s: any, p: any) => s + p.y, 0) /
          rightEyePoints.length,
      };
    }
  }

  if (l && r && !Array.isArray(landmarks)) {
    const dy = r.y - l.y;
    const dx = r.x - l.x;
    const angle = Math.atan2(dy, dx);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const mx = (l.x + r.x) / 2;
    const my = (l.y + r.y) / 2;

    // Optimal parameters for 112x112 GhostFaceNet input:
    // We set the Interpupillary Distance (IPD) to ~46% of the width (51.5px)
    const desiredEyeDist = 51.5;
    const scale = desiredEyeDist / dist;

    ctx.save();
    ctx.translate(56, 48);
    ctx.rotate(-angle);
    ctx.scale(scale, scale);
    ctx.translate(-mx, -my);
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  } else if (!l || !r) {
    drawSimpleCrop(ctx, source, box);
  }

  // Quality Check: Factor out bad frames before inference
  const quality = checkFaceQuality(ctx);
  if (!quality.isGood) {
    console.warn(`[🧠 ENGINE] Skipping frame: ${quality.reason}`);
    return new Float32Array(512); // Return zeroed descriptor to skip
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
