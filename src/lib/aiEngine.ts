"use client";

/**
 * MediaPipe Face Landmarker Engine
 * Provides singleton access to the MediaPipe Face Landmarker for face detection and tracking.
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { fetchWithProgress } from "./fetchProgress";

let landmarkerInstance: FaceLandmarker | null = null;
let landmarkerInitPromise: Promise<FaceLandmarker> | null = null;

/**
 * Returns the singleton FaceLandmarker.
 * The first call initializes it; every subsequent call returns the cached instance instantly.
 * This prevents the "Warming Up" screen from appearing on every page navigation.
 */
export async function getLandmarker(updateProgress?: (p: number, s: string) => void): Promise<FaceLandmarker> {
  if (landmarkerInstance) return landmarkerInstance;
  if (landmarkerInitPromise) return landmarkerInitPromise;

  landmarkerInitPromise = (async () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    
    // Download model with progress tracking
    if (updateProgress) updateProgress(0, "Downloading Detection Model...");
    const modelBuffer = await fetchWithProgress(
      "/mediapipe/face_landmarker.task",
      (p) => updateProgress?.(p, "Downloading Detection Model...")
    );

    /**
     * Robust Initialization:
     * We attempt to use GPU for performance, but automatically fall back to CPU
     * if the device context prevents GPU delegation (common on some mobile/PWA environments).
     */
    let landmarker;
    try {
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer: new Uint8Array(modelBuffer),
          delegate: isIOS ? "CPU" : "GPU",
        },
        runningMode: "VIDEO",
        outputFaceBlendshapes: false,
      });
    } catch (e) {
      console.warn("[🧠 ENGINE] GPU Delegate failed, falling back to CPU", e);
      landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetBuffer: new Uint8Array(modelBuffer),
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        outputFaceBlendshapes: false,
      });
    }


    // WARMING PHASE: Run a dummy frame to initialize WASM & WebGL backends
    try {
      const dummyCanvas = document.createElement("canvas");
      dummyCanvas.width = 1;
      dummyCanvas.height = 1;
      landmarker.detectForVideo(dummyCanvas, 0);
      console.log("[🧠 ENGINE] MediaPipe: Landmarker ready.");
    } catch (e) {
      // Ignore warming errors
    }

    landmarkerInstance = landmarker;
    return landmarker;
  })();

  return landmarkerInitPromise;
}

export function isLandmarkerLoaded(): boolean {
  return landmarkerInstance !== null;
}

export function getLandmarkerSync(): FaceLandmarker | null {
  return landmarkerInstance;
}
