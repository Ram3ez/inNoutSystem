"use client";

import {
  FaceLandmarker,
  FilesetResolver,
} from "@mediapipe/tasks-vision";

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
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "/mediapipe/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      outputFaceBlendshapes: false,
    });
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
