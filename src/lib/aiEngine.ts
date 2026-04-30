"use client";

import { FaceLandmarker, FilesetResolver } from "@mediapipe/tasks-vision";

let landmarkerInstance: FaceLandmarker | null = null;
let landmarkerInitPromise: Promise<FaceLandmarker> | null = null;

/**
 * Returns the singleton FaceLandmarker.
 * The first call initializes it; every subsequent call returns the cached instance instantly.
 * This prevents the "Warming Up" screen from appearing on every page navigation.
 */
export async function getLandmarker(): Promise<FaceLandmarker> {
  if (landmarkerInstance) return landmarkerInstance;
  if (landmarkerInitPromise) return landmarkerInitPromise;

  landmarkerInitPromise = (async () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/mediapipe/face_landmarker.task",
        delegate: isIOS ? "CPU" : "GPU",
      },
      runningMode: "VIDEO",
      outputFaceBlendshapes: false,
    });

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
