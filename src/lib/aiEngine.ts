"use client";

/**
 * MediaPipe Face Landmarker Engine
 * Provides singleton access to the MediaPipe Face Landmarker for face detection and tracking.
 */

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";
import { fetchWithProgress } from "./fetchProgress";

let landmarkerInstance: FaceLandmarker | null = null;
let landmarkerInitPromise: Promise<FaceLandmarker> | null = null;
let landmarkerDisposePromise: Promise<void> | null = null;

/**
 * Returns the singleton FaceLandmarker.
 */
export async function getLandmarker(updateProgress?: (p: number, s: string) => void): Promise<FaceLandmarker> {
  // If we are currently disposing, wait for it to finish before starting a new init
  if (landmarkerDisposePromise) {
    await landmarkerDisposePromise;
  }

  if (landmarkerInstance) return landmarkerInstance;
  if (landmarkerInitPromise) return landmarkerInitPromise;

  landmarkerInitPromise = (async () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

    // Step 1 – Pre-download MediaPipe WASM runtime files.
    // FilesetResolver.forVisionTasks() silently fetches vision_wasm_internal.wasm
    // (~11MB) or its nosimd variant with no progress hook. We download both
    // in parallel here so the SW caches them before MediaPipe requests them.
    // On iOS we prioritize the nosimd variant since SIMD is restricted.
    if (updateProgress) updateProgress(0, "Downloading Vision Runtime...");
    const wasmFiles = isIOS
      ? [
          "/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
          "/mediapipe/wasm/vision_wasm_nosimd_internal.js",
        ]
      : [
          "/mediapipe/wasm/vision_wasm_internal.wasm",
          "/mediapipe/wasm/vision_wasm_internal.js",
          "/mediapipe/wasm/vision_wasm_module_internal.wasm",
        ];

    let wasmLoaded = 0;
    await Promise.all(
      wasmFiles.map((file) =>
        fetchWithProgress(file, (p) => {
          // Average progress across all files for a smooth bar
          wasmLoaded = Math.max(wasmLoaded, p);
          updateProgress?.(wasmLoaded * 0.3, "Downloading Vision Runtime...");
        })
      )
    );

    // Step 2 – FilesetResolver is now an instant cache hit.
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");

    // Step 3 – Download the face_landmarker.task model with progress.
    if (updateProgress) updateProgress(30, "Downloading Detection Model...");
    const modelBuffer = await fetchWithProgress(
      "/mediapipe/face_landmarker.task",
      (p) => updateProgress?.(30 + p * 0.7, "Downloading Detection Model...")
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

/**
 * Safely disposes of the MediaPipe Face Landmarker to free up WebGL context and WASM memory.
 * Call this when navigating away from biometric-intensive pages.
 */
export async function disposeLandmarker(): Promise<void> {
  if (landmarkerInitPromise) {
    const promiseToClose = landmarkerInitPromise;
    landmarkerInstance = null;
    landmarkerInitPromise = null;
    
    landmarkerDisposePromise = (async () => {
      try {
        const instance = await promiseToClose;
        instance.close();
        console.log("[🧠 ENGINE] MediaPipe Landmarker disposed.");
      } catch (e) {
        console.error("[🧠 ENGINE] Error disposing MediaPipe Landmarker", e);
      } finally {
        landmarkerDisposePromise = null;
      }
    })();
    
    return landmarkerDisposePromise;
  }
}
