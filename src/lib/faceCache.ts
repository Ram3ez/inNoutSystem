"use client";

import { databases, ID, client } from "./appwrite";
import { Query } from "appwrite";

const DB_ID = "69cb970a000853f23489";
const COLL_FACIAL_EMBEDDINGS = "facial_embeddings";

let memoryCache: Record<string, Float32Array[]> = {};
let isLoaded = false;
let isLoading = false;
let unsubscribeRealtime: (() => void) | null = null;

// We export faceapi locally dynamically to avoid SSR crashes if needed,
// but inside a "use client" it shouldn't execute on server if wrapped properly.
// @ts-ignore
import * as faceapi from "face-api.js";

let modelsLoaded = false;
let modelsLoadingPromise: Promise<void> | null = null;
let faceCacheLoadingPromise: Promise<void> | null = null;

/**
 * Returns true if both the models and the student database are ready.
 */
export function isAIReady(): boolean {
  return modelsLoaded && isLoaded;
}

/**
 * Returns true if the face-api models are already in memory.
 */
export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

/**
 * Returns true if the student facial database is already in memory.
 */
export function isCacheLoaded(): boolean {
  return isLoaded;
}

// Load models — guarded so weights are only fetched once per browser session
export async function loadFaceApiModels() {
  if (modelsLoaded) return;
  if (modelsLoadingPromise) return modelsLoadingPromise;

  modelsLoadingPromise = (async () => {
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri("/models"),
      faceapi.nets.faceLandmark68Net.loadFromUri("/models"),
      faceapi.nets.faceRecognitionNet.loadFromUri("/models"),
    ]);
    modelsLoaded = true;
  })();

  return modelsLoadingPromise;
}

// Load cache from Appwrite — guarded so the database is only fetched once
export async function loadFaceCache() {
  if (isLoaded) return;
  if (faceCacheLoadingPromise) return faceCacheLoadingPromise;

  faceCacheLoadingPromise = (async () => {
    isLoading = true;
    try {
    const newCache: Record<string, Float32Array[]> = {};
    let offset = 0;
    const limit = 100;
    let keepParsing = true;

    // Pagination loop
    while (keepParsing) {
      const { documents } = await databases.listDocuments(
        DB_ID,
        COLL_FACIAL_EMBEDDINGS,
        [Query.limit(limit), Query.offset(offset)],
      );

      for (const doc of documents) {
        if (doc.embeddings) {
          try {
            const parsed: number[][] = JSON.parse(doc.embeddings);
            newCache[doc.$id] = parsed.map((arr) => new Float32Array(arr));
          } catch (e) {
            console.error(`Failed to parse embeddings for ${doc.$id}`, e);
          }
        }
      }

      if (documents.length < limit) {
        keepParsing = false;
      } else {
        offset += limit;
      }
    }

    memoryCache = newCache;
    isLoaded = true;
    console.log(
      `Loaded ${Object.keys(memoryCache).length} students faces into local cache.`,
    );

    // Initialize Realtime Sync
    if (!unsubscribeRealtime) {
      unsubscribeRealtime = client.subscribe(
        `databases.${DB_ID}.collections.${COLL_FACIAL_EMBEDDINGS}.documents`,
        (response) => {
          const events = response.events.join(",");
          const doc = response.payload as any;
          if (events.includes(".create") || events.includes(".update")) {
            if (doc.embeddings) {
              try {
                const parsed: number[][] = JSON.parse(doc.embeddings);
                memoryCache[doc.$id] = parsed.map(
                  (arr) => new Float32Array(arr),
                );
                console.log(`[Realtime Sync] Synced face for ${doc.$id}`);
              } catch (e) {
                console.error(`[Realtime Sync] Parse error for ${doc.$id}`, e);
              }
            }
          } else if (events.includes(".delete")) {
            delete memoryCache[doc.$id];
            console.log(`[Realtime Sync] Removed face for ${doc.$id}`);
          }
        },
      );
    }
  } catch (error) {
    console.error("Failed to load face cache from Appwrite", error);
  } finally {
    isLoading = false;
  }
})();

  return faceCacheLoadingPromise;
}

export async function uploadEmbeddings(
  rollNo: string,
  embeddings: Float32Array[],
) {
  const jsonString = JSON.stringify(embeddings.map((emb) => Array.from(emb)));

  // Try to create, if exists, update
  try {
    await databases.createDocument(DB_ID, COLL_FACIAL_EMBEDDINGS, rollNo, {
      embeddings: jsonString,
    });
  } catch (e: any) {
    if (e.code === 409) {
      // Document exists, update it
      await databases.updateDocument(DB_ID, COLL_FACIAL_EMBEDDINGS, rollNo, {
        embeddings: jsonString,
      });
    } else {
      throw e;
    }
  }

  // Update local memory cache instantly
  memoryCache[rollNo] = embeddings;
}

// Cosine similarity
function cosineSimilarity(xs: Float32Array, ys: Float32Array): number {
  let dotProduct = 0;
  let normX = 0;
  let normY = 0;
  for (let i = 0; i < xs.length; i++) {
    dotProduct += xs[i] * ys[i];
    normX += xs[i] * xs[i];
    normY += ys[i] * ys[i];
  }
  if (normX === 0 || normY === 0) return 0;
  return dotProduct / (Math.sqrt(normX) * Math.sqrt(normY));
}

// Emulate Python scoring threshold
export function getBestMatch(queryDescriptor: Float32Array): {
  rollNo: string;
  score: number;
} {
  if (!isLoaded) {
    console.warn("Face cache not loaded yet!");
    return { rollNo: "Unknown", score: 0 };
  }

  let bestMatch = "Unknown";
  let bestScore = -1;
  let secondBestScore = -1;

  for (const [rollNo, embeddings] of Object.entries(memoryCache)) {
    // Sort scores descending, average the top-K for robustness
    const scores = embeddings
      .map((dbEmb) => cosineSimilarity(queryDescriptor, dbEmb))
      .sort((a, b) => b - a);

    const topK = Math.min(5, scores.length);
    const avgScore = scores.slice(0, topK).reduce((s, v) => s + v, 0) / topK;

    if (avgScore > bestScore) {
      secondBestScore = bestScore;
      bestScore = avgScore;
      bestMatch = rollNo;
    } else if (avgScore > secondBestScore) {
      secondBestScore = avgScore;
    }
  }

  // Strict threshold — reduces false positives significantly
  const THRESHOLD = 0.95;
  if (bestScore < THRESHOLD) {
    bestMatch = "Unknown";
  } else if (
    secondBestScore >= THRESHOLD &&
    bestScore - secondBestScore < 0.08
  ) {
    // Only reject if TWO candidates both clear the threshold and are too close —
    // genuinely ambiguous. A single strong match should never be rejected by the gap.
    bestMatch = "Unknown";
  }

  return { rollNo: bestMatch, score: bestScore };
}
