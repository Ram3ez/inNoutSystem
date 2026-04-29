"use client";

import {
  databases,
  tablesDB,
  fetchAllRows,
  ID,
  client,
  realtime,
} from "@/lib/appwrite";
import { Query } from "appwrite";

const DB_ID = "69cb970a000853f23489";
const COLL_FACIAL_EMBEDDINGS = "facial_embeddings";

let memoryCache: Record<string, Float32Array[]> = {};
let isLoaded = false;
let isLoading = false;
let unsubscribeRealtime: any = null;

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

    // WARMING PHASE: Perform a dummy inference to wake up GPU & compile shaders
    // We wrap this in a timeout to yield the thread and keep the UI responsive
    setTimeout(async () => {
      try {
        const dummyCanvas = document.createElement("canvas");
        dummyCanvas.width = 160;
        dummyCanvas.height = 160;
        await faceapi
          .detectSingleFace(dummyCanvas)
          .withFaceLandmarks()
          .withFaceDescriptor();
        console.log("[🧠 ENGINE] face-api.js: GPU Shaders warmed and ready.");
      } catch (e) {
        console.warn("[🧠 ENGINE] Warming inference failed.", e);
      }
    }, 500);

    modelsLoaded = true;
  })();

  return modelsLoadingPromise;
}

// Load cache from Appwrite — optimized with IndexedDB for instant startup and incremental sync
export async function loadFaceCache() {
  if (isLoaded) return;
  if (faceCacheLoadingPromise) return faceCacheLoadingPromise;

  faceCacheLoadingPromise = (async () => {
    isLoading = true;
    try {
      const { getCache, setCache } = await import("./idb");

      // 1. Load from IndexedDB first (Instant UI Ready)
      const cachedData =
        await getCache<Record<string, number[][]>>("embeddings");
      const lastSync =
        (await getCache<string>("last_sync_time")) ||
        "1970-01-01T00:00:00.000Z";

      if (cachedData) {
        memoryCache = {};
        for (const [id, emb] of Object.entries(cachedData)) {
          memoryCache[id] = emb.map((a) => new Float32Array(a));
        }
        isLoaded = true;
        console.log(
          `[🚀 CACHE] Instantly loaded ${Object.keys(memoryCache).length} faces from local disk.`,
        );
      }

      // 2. Incremental Sync (Fetch only what's new since lastSync)
      try {
        const updateQueries = [
          Query.greaterThan("$updatedAt", lastSync),
          Query.orderAsc("$updatedAt"),
        ];

        const updates = await fetchAllRows<any>(
          DB_ID,
          COLL_FACIAL_EMBEDDINGS,
          updateQueries,
        );

        if (updates.length > 0) {
          const disk =
            (await getCache<Record<string, number[][]>>("embeddings")) || {};
          let latestTimestamp = lastSync;

          for (const doc of updates) {
            if (doc.embeddings) {
              try {
                const parsed: number[][] = JSON.parse(doc.embeddings);
                memoryCache[doc.$id] = parsed.map((a) => new Float32Array(a));
                disk[doc.$id] = parsed;
                if (doc.$updatedAt > latestTimestamp)
                  latestTimestamp = doc.$updatedAt;
              } catch (e) {
                console.error(`Failed to parse sync update for ${doc.$id}`, e);
              }
            }
          }

          await setCache("embeddings", disk);
          await setCache("last_sync_time", latestTimestamp);
          console.log(
            `[🔄 SYNC] Incremental sync finished: +${updates.length} new faces.`,
          );
        } else {
          console.log("[✅ SYNC] Already up to date.");
        }
      } catch (syncErr) {
        console.error(
          "Incremental sync failed, but using cached data",
          syncErr,
        );
        // Fallback: if cache is totally empty, do a full fetch
        if (Object.keys(memoryCache).length === 0) {
          const allRows = await fetchAllRows<any>(
            DB_ID,
            COLL_FACIAL_EMBEDDINGS,
          );
          // ... (same full fetch logic as before but updated to save timestamp)
          const disk: Record<string, number[][]> = {};
          let latest = lastSync;
          for (const r of allRows) {
            const p = JSON.parse(r.embeddings);
            memoryCache[r.$id] = p.map((a: any) => new Float32Array(a));
            disk[r.$id] = p;
            if (r.$updatedAt > latest) latest = r.$updatedAt;
          }
          await setCache("embeddings", disk);
          await setCache("last_sync_time", latest);
        }
      }

      isLoaded = true;

      // 3. Initialize Realtime Sync for live updates
      if (!unsubscribeRealtime) {
        const channel = `tablesdb.${DB_ID}.tables.${COLL_FACIAL_EMBEDDINGS}.rows`;
        console.log(`[📡 REALTIME] Connecting via service: ${channel}`);

        unsubscribeRealtime = await realtime.subscribe(
          channel,
          async (response: any) => {
            console.log("[📡 REALTIME] Event received:", response.events);
            const events = response.events.join(",");
            const doc = response.payload as any;
            const docId = doc.$id || doc.id; // Support both just in case

            if (events.includes(".create") || events.includes(".update")) {
              if (doc.embeddings) {
                try {
                  const parsed: number[][] = JSON.parse(doc.embeddings);
                  memoryCache[docId] = parsed.map(
                    (arr) => new Float32Array(arr),
                  );

                  // Update disk cache and timestamp
                  const disk =
                    (await getCache<Record<string, number[][]>>(
                      "embeddings",
                    )) || {};
                  disk[docId] = parsed;
                  await setCache("embeddings", disk);
                  await setCache("last_sync_time", doc.$updatedAt);

                  console.log(`[✨ REALTIME] Synced face for ${docId}`);
                } catch (e) {
                  console.error(`[Realtime Sync] Parse error for ${docId}`, e);
                }
              }
            } else if (events.includes(".delete")) {
              delete memoryCache[docId];
              const disk =
                (await getCache<Record<string, number[][]>>("embeddings")) ||
                {};
              delete disk[docId];
              await setCache("embeddings", disk);
              console.log(`[🗑️ REALTIME] Removed face for ${docId}`);
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
    /*
    await databases.createDocument({
      databaseId: DB_ID,
      collectionId: COLL_FACIAL_EMBEDDINGS,
      documentId: rollNo,
      data: {
        embeddings: jsonString,
      }
    });
    */
    await tablesDB.createRow({
      databaseId: DB_ID,
      tableId: COLL_FACIAL_EMBEDDINGS,
      rowId: rollNo,
      data: {
        embeddings: jsonString,
      },
    });
  } catch (e: any) {
    if (e.code === 409) {
      // Document exists, update it
      /*
      await databases.updateDocument({
        databaseId: DB_ID,
        collectionId: COLL_FACIAL_EMBEDDINGS,
        documentId: rollNo,
        data: {
          embeddings: jsonString,
        }
      });
      */
      await tablesDB.updateRow({
        databaseId: DB_ID,
        tableId: COLL_FACIAL_EMBEDDINGS,
        rowId: rollNo,
        data: {
          embeddings: jsonString,
        },
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
export interface RecognitionResult {
  rollNo: string;
  score: number;
  conflictWith?: string | null;
  conflictScore?: number | null;
  potentialMatch?: string | null;
}

/**
 * Find the best student match for a face descriptor in memory
 */
export function getBestMatch(queryDescriptor: Float32Array): RecognitionResult {
  if (!isLoaded) {
    console.warn("Face cache not loaded yet!");
    return { rollNo: "Unknown", score: 0 };
  }

  let bestMatch = "Unknown";
  let bestScore = -1;
  let secondBestMatch = "Unknown";
  let secondBestScore = -1;

  for (const [rollNo, embeddings] of Object.entries(memoryCache)) {
    // Peak Similarity: We only care if the current face matches ANY
    // of the student's registered embeddings at a high level.
    let maxScoreForUser = -1;
    for (const dbEmb of embeddings) {
      const score = cosineSimilarity(queryDescriptor, dbEmb);
      if (score > maxScoreForUser) maxScoreForUser = score;
    }
    const currentScore = maxScoreForUser;

    if (currentScore > bestScore) {
      secondBestScore = bestScore;
      secondBestMatch = bestMatch;
      bestScore = currentScore;
      bestMatch = rollNo;
    } else if (currentScore > secondBestScore) {
      secondBestScore = currentScore;
      secondBestMatch = rollNo;
    }
  }

  // Strict threshold — reduces false positives significantly
  const THRESHOLD = 0.95;

  // Conflict Detection: Only reject if the runner-up is ALSO a very strong candidate
  // AND the two scores are mathematically too close (Ratio Test).
  const isConflict =
    secondBestScore > THRESHOLD && secondBestScore / bestScore > 0.98;

  if (bestScore < THRESHOLD || isConflict) {
    return {
      rollNo: "Unknown",
      score: bestScore,
      conflictWith: isConflict ? secondBestMatch : null,
      conflictScore: isConflict ? secondBestScore : null,
      potentialMatch: bestMatch,
    };
  }

  return {
    rollNo: bestMatch,
    score: bestScore,
    conflictWith: null,
    conflictScore: null,
    potentialMatch: bestMatch,
  };
}
