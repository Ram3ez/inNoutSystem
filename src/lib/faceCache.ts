/**
 * Face Cache & Biometric Synchronization Library
 * Handles IndexedDB persistence, incremental cloud sync, and
 * background worker offloading for large-scale searching.
 */
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
import { DB_ID, COLLECTIONS, BIOMETRIC_THRESHOLDS } from "./constants";

// @ts-ignore
import * as faceapi from "face-api.js";

// In-Memory State
let memoryCache: Record<string, Float32Array[]> = {};
let memoryCacheGhost: Record<string, Float32Array[]> = {};
let memoryCacheEdge: Record<string, Float32Array[]> = {};
let isLoaded = false;
let isLoading = false;

export function getMemoryCache() {
  return memoryCache;
}
export function getMemoryCacheGhost() {
  return memoryCacheGhost;
}
export function getMemoryCacheEdge() {
  return memoryCacheEdge;
}

// Worker State
let searchWorker: Worker | null = null;
const searchRequests = new Map<number, (res: RecognitionResult) => void>();
let searchRequestIdCounter = 0;

// Synchronization State
let isSyncInitialized = false;
let syncInProgress = false;
let modelsLoaded = false;
let modelsLoadingPromise: Promise<void> | null = null;
let faceCacheLoadingPromise: Promise<void> | null = null;

/**
 * Recognition Data Interface
 */
export interface RecognitionResult {
  rollNo: string;
  score: number;
  conflictWith?: string | null;
  conflictScore?: number | null;
  potentialMatch?: string | null;
}

// ---------------------------------------------------------
// WORKER INITIALIZATION
// ---------------------------------------------------------

function initSearchWorker() {
  if (typeof window === "undefined" || searchWorker) return;
  searchWorker = new Worker(new URL("./faceSearch.worker.ts", import.meta.url));
  searchWorker.onmessage = (e) => {
    const { type, requestId, result } = e.data;
    if (type === "SEARCH_RESULT") {
      const cb = searchRequests.get(requestId);
      if (cb) {
        cb(result);
        searchRequests.delete(requestId);
      }
    }
  };
}

function syncWorkerFull(
  modelType: "face-api" | "ghostface" | "edgeface",
  data: Record<string, Float32Array[]>,
) {
  if (!searchWorker) initSearchWorker();
  const dim = modelType === "face-api" ? 128 : 512;

  // Calculate total size for allocation by only counting valid-length embeddings
  let totalCount = 0;
  for (const id in data) {
    for (const emb of data[id]) {
      if (emb && emb.length === dim) totalCount++;
    }
  }

  const flattened = new Float32Array(totalCount * dim);
  const mapping: { id: string; count: number }[] = [];

  let offset = 0;
  for (const id in data) {
    const embs = data[id];
    let validCount = 0;
    for (const emb of embs) {
      if (emb && emb.length === dim) {
        flattened.set(emb, offset);
        offset += dim;
        validCount++;
      }
    }
    if (validCount > 0) {
      mapping.push({ id, count: validCount });
    }
  }

  searchWorker?.postMessage(
    {
      type: "SET_FULL_CACHE",
      payload: { modelType, flattenedData: flattened, mapping },
    },
    [flattened.buffer],
  );
}

function syncWorkerSingle(
  modelType: "face-api" | "ghostface" | "edgeface",
  studentId: string,
  embeddings: Float32Array[],
) {
  if (!searchWorker) initSearchWorker();
  searchWorker?.postMessage({
    type: "SYNC_CACHE",
    payload: { modelType, data: { id: studentId, embeddings } },
  });
}

// ---------------------------------------------------------
// MODEL LOADING
// ---------------------------------------------------------

/**
 * Loads detection and landmark models needed for both GhostFace and Face-API.
 */
export async function loadBaseFaceModels() {
  if (
    faceapi.nets.ssdMobilenetv1.isLoaded &&
    faceapi.nets.faceLandmark68Net.isLoaded
  )
    return;

  // Load models sequentially to prevent RAM spikes on iOS
  await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
  await new Promise((r) => setTimeout(r, 100)); // Breathing room
  await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
}

/**
 * Loads the heavy recognition model only when needed.
 */
export async function loadFaceRecognitionModel() {
  if (modelsLoaded) return;
  if (modelsLoadingPromise) return modelsLoadingPromise;

  modelsLoadingPromise = (async () => {
    console.log("[🧠 ENGINE] Loading Face-API Recognition Model...");
    await faceapi.nets.faceRecognitionNet.loadFromUri("/models");

    // Warm up
    setTimeout(async () => {
      try {
        const dummyCanvas = document.createElement("canvas");
        dummyCanvas.width = 160;
        dummyCanvas.height = 160;
        await faceapi
          .detectSingleFace(dummyCanvas)
          .withFaceLandmarks()
          .withFaceDescriptor();
        console.log("[🧠 ENGINE] Face-API: Warmed.");
      } catch (e) {}
    }, 100);

    modelsLoaded = true;
  })();

  return modelsLoadingPromise;
}

export async function loadFaceApiModels() {
  await loadBaseFaceModels();
  return loadFaceRecognitionModel();
}

// ---------------------------------------------------------
// SYNCHRONIZATION LOGIC
// ---------------------------------------------------------

/**
 * Performs an incremental sync from TablesDB to catch up on missed data.
 */
export async function performIncrementalSync() {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    const { getCache, setCache } = await import("./idb");

    const syncModel = async (
      coll: string,
      cache: Record<string, Float32Array[]>,
      syncKey: string,
      storageKey: string,
    ) => {
      const lastSyncTime =
        (await getCache<string>(syncKey)) || "1970-01-01T00:00:00.000Z";

      try {
        const updates = await fetchAllRows<any>(DB_ID, coll, [
          Query.greaterThan("$updatedAt", lastSyncTime),
          Query.orderAsc("$updatedAt"),
        ]);

        if (updates.length > 0) {
          const disk =
            (await getCache<Record<string, number[][]>>(storageKey)) || {};
          let latestTimestamp = lastSyncTime;

          for (const doc of updates) {
            if (doc.embeddings) {
              try {
                const p = JSON.parse(doc.embeddings);
                const floatArrays = p.map((a: any) => new Float32Array(a));
                cache[doc.$id] = floatArrays;
                disk[doc.$id] = p;
                if (doc.$updatedAt > latestTimestamp)
                  latestTimestamp = doc.$updatedAt;

                syncWorkerSingle(
                  coll === COLLECTIONS.FACIAL_EMBEDDINGS_NEW
                    ? "ghostface"
                    : "face-api",
                  doc.$id,
                  floatArrays,
                );
              } catch (e) {}
            }
          }
          await setCache(storageKey, disk);
          await setCache(syncKey, latestTimestamp);
          console.log(
            `[🔄 SYNC] ${coll}: +${updates.length} new records synced.`,
          );
        }
      } catch (err) {
        console.error(`[⚠️ SYNC ERROR] ${coll}`, err);
      }
    };

    await Promise.all([
      syncModel(
        COLLECTIONS.FACIAL_EMBEDDINGS,
        memoryCache,
        "last_sync_time",
        "embeddings",
      ),
      syncModel(
        COLLECTIONS.FACIAL_EMBEDDINGS_NEW,
        memoryCacheGhost,
        "last_sync_time_ghost",
        "embeddings_ghost",
      ),
      syncModel(
        COLLECTIONS.FACIAL_EMBEDDINGS_EDGE,
        memoryCacheEdge,
        "last_sync_time_edge",
        "embeddings_edge",
      ),
    ]);
  } finally {
    syncInProgress = false;
  }
}

/**
 * Initializes listeners for Online/Offline events and Realtime subscriptions.
 * Guaranteed to run only once to prevent memory leaks.
 */
function initSyncListeners() {
  if (typeof window === "undefined" || isSyncInitialized) return;
  isSyncInitialized = true;

  // Catch-up when back online
  window.addEventListener("online", () => {
    console.log("[🌐 NETWORK] Connection restored. Syncing...");
    performIncrementalSync();
  });

  // Background Heartbeat (10 mins)
  setInterval(
    () => {
      performIncrementalSync();
    },
    10 * 60 * 1000,
  );

  // Realtime Subscriptions
  const setupRealtime = (
    coll: string,
    cache: Record<string, Float32Array[]>,
    storageKey: string,
    syncKey: string,
  ) => {
    const channel = `databases.${DB_ID}.tables.${coll}.rows`;
    const { getCache, setCache } = require("./idb"); // Use require to avoid async in sync callback

    realtime.subscribe(channel, (response: any) => {
      const events = response.events;
      const doc = response.payload as any;
      const docId = doc.$id || doc.id;

      if (
        events.some(
          (e: string) => e.includes(".create") || e.includes(".update"),
        )
      ) {
        if (doc.embeddings) {
          try {
            const parsed: number[][] = JSON.parse(doc.embeddings);
            const floatArrays = parsed.map((arr) => new Float32Array(arr));
            cache[docId] = floatArrays;
            syncWorkerSingle(
              coll === COLLECTIONS.FACIAL_EMBEDDINGS_NEW
                ? "ghostface"
                : coll === COLLECTIONS.FACIAL_EMBEDDINGS_EDGE
                ? "edgeface"
                : "face-api",
              docId,
              floatArrays,
            );

            getCache(storageKey).then((disk: any) => {
              const d = disk || {};
              d[docId] = parsed;
              setCache(storageKey, d);
              setCache(syncKey, doc.$updatedAt || new Date().toISOString());
            });
          } catch (e) {}
        }
      } else if (events.some((e: string) => e.includes(".delete"))) {
        delete cache[docId];
        syncWorkerSingle(
          coll === COLLECTIONS.FACIAL_EMBEDDINGS_NEW
            ? "ghostface"
            : coll === COLLECTIONS.FACIAL_EMBEDDINGS_EDGE
            ? "edgeface"
            : "face-api",
          docId,
          [],
        );
        getCache(storageKey).then((disk: any) => {
          if (disk) {
            delete disk[docId];
            setCache(storageKey, disk);
          }
        });
      }
    });
  };

  setupRealtime(
    COLLECTIONS.FACIAL_EMBEDDINGS,
    memoryCache,
    "embeddings",
    "last_sync_time",
  );
  setupRealtime(
    COLLECTIONS.FACIAL_EMBEDDINGS_NEW,
    memoryCacheGhost,
    "embeddings_ghost",
    "last_sync_time_ghost",
  );
  setupRealtime(
    COLLECTIONS.FACIAL_EMBEDDINGS_EDGE,
    memoryCacheEdge,
    "embeddings_edge",
    "last_sync_time_edge",
  );
}

/**
 * Entry point for loading the facial database.
 */
export async function loadFaceCache() {
  if (isLoaded) {
    performIncrementalSync();
    return;
  }
  if (faceCacheLoadingPromise) return faceCacheLoadingPromise;

  faceCacheLoadingPromise = (async () => {
    try {
      isLoading = true;
      const { getCache } = await import("./idb");

      // Load listeners once
      initSyncListeners();

      // Load from disk for instant startup
      const loadFromDisk = async (
        key: string,
        cache: Record<string, Float32Array[]>,
      ) => {
        const disk = (await getCache<Record<string, number[][]>>(key)) || {};
        for (const [id, data] of Object.entries(disk)) {
          cache[id] = data.map((a) => new Float32Array(a));
        }
      };

      await Promise.all([
        loadFromDisk("embeddings", memoryCache),
        loadFromDisk("embeddings_ghost", memoryCacheGhost),
        loadFromDisk("embeddings_edge", memoryCacheEdge),
      ]);

      // Seed worker
      syncWorkerFull("face-api", memoryCache);
      syncWorkerFull("ghostface", memoryCacheGhost);
      syncWorkerFull("edgeface", memoryCacheEdge);

      // Final catch-up
      await performIncrementalSync();

      isLoaded = true;
    } catch (err) {
      console.error("[❌ CACHE] Init failed", err);
    } finally {
      isLoading = false;
    }
  })();

  return faceCacheLoadingPromise;
}

// ---------------------------------------------------------
// SEARCH & UTIL
// ---------------------------------------------------------

export async function getBestMatch(
  queryDescriptor: Float32Array,
  modelType: "face-api" | "ghostface" | "edgeface" = "face-api",
): Promise<RecognitionResult> {
  if (!isLoaded) {
    console.warn("Face cache not loaded yet!");
    return { rollNo: "Unknown", score: 0 };
  }

  // GHOSTFACE & EDGEFACE: Background Worker (Scalable)
  if (modelType === "ghostface" || modelType === "edgeface") {
    if (!searchWorker) initSearchWorker();
    const requestId = searchRequestIdCounter++;
    const matchThreshold =
      modelType === "ghostface"
        ? BIOMETRIC_THRESHOLDS.GHOSTFACE.MATCH
        : BIOMETRIC_THRESHOLDS.EDGEFACE.MATCH;
    const gapThreshold =
      modelType === "ghostface"
        ? BIOMETRIC_THRESHOLDS.GHOSTFACE.CONFLICT_GAP
        : BIOMETRIC_THRESHOLDS.EDGEFACE.CONFLICT_GAP;

    return new Promise((resolve) => {
      searchRequests.set(requestId, resolve);
      searchWorker?.postMessage({
        type: "SEARCH",
        payload: {
          query: queryDescriptor,
          modelType,
          threshold: matchThreshold,
          conflictGap: gapThreshold,
          requestId,
        },
      });
    });
  }

  // FACE-API: Legacy Main Thread (Stable)
  let bestMatch = "Unknown";
  let bestScore = -1;
  let secondBestMatch = "Unknown";
  let secondBestScore = -1;

  for (const [rollNo, embeddings] of Object.entries(memoryCache)) {
    let maxUserScore = -1;
    for (const dbEmb of embeddings) {
      const score = cosineSimilarity(queryDescriptor, dbEmb);
      if (score > maxUserScore) maxUserScore = score;
    }

    if (maxUserScore > bestScore) {
      secondBestScore = bestScore;
      secondBestMatch = bestMatch;
      bestScore = maxUserScore;
      bestMatch = rollNo;
    } else if (maxUserScore > secondBestScore) {
      secondBestScore = maxUserScore;
      secondBestMatch = rollNo;
    }
  }

  const isConflict =
    bestScore > BIOMETRIC_THRESHOLDS.FACE_API.MATCH &&
    secondBestScore > BIOMETRIC_THRESHOLDS.FACE_API.MATCH && // Must BOTH be above threshold to be a conflict
    secondBestScore > bestScore - BIOMETRIC_THRESHOLDS.FACE_API.CONFLICT_GAP &&
    secondBestMatch !== bestMatch;

  if (bestScore < BIOMETRIC_THRESHOLDS.FACE_API.MATCH || isConflict) {
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

function cosineSimilarity(xs: Float32Array, ys: Float32Array): number {
  let dot = 0,
    nx = 0,
    ny = 0;
  for (let i = 0; i < xs.length; i++) {
    dot += xs[i] * ys[i];
    nx += xs[i] * xs[i];
    ny += ys[i] * ys[i];
  }
  return nx === 0 || ny === 0 ? 0 : dot / (Math.sqrt(nx) * Math.sqrt(ny));
}

export async function uploadEmbeddings(
  rollNo: string,
  embeddings: Float32Array[],
  modelType: "face-api" | "ghostface" | "edgeface",
) {
  const jsonString = JSON.stringify(embeddings.map((a) => Array.from(a)));
  const collId =
    modelType === "ghostface"
      ? COLLECTIONS.FACIAL_EMBEDDINGS_NEW
      : modelType === "edgeface"
      ? COLLECTIONS.FACIAL_EMBEDDINGS_EDGE
      : COLLECTIONS.FACIAL_EMBEDDINGS;

  try {
    await tablesDB.updateRow({
      databaseId: DB_ID,
      tableId: collId,
      rowId: rollNo,
      data: { embeddings: jsonString },
    });
  } catch (e: any) {
    // Appwrite SDK sometimes wraps or formats errors differently for TablesDB
    const is404 =
      e.code === 404 ||
      e.status === 404 ||
      (e.message && e.message.toLowerCase().includes("not found"));
    if (is404) {
      console.log(`[💾 CACHE] Creating new record for ${rollNo} in ${collId}`);
      await tablesDB.createRow({
        databaseId: DB_ID,
        tableId: collId,
        rowId: rollNo,
        data: { embeddings: jsonString },
      });
    } else {
      throw e;
    }
  }

  // Immediate local update
  const cache =
    modelType === "ghostface"
      ? memoryCacheGhost
      : modelType === "edgeface"
      ? memoryCacheEdge
      : memoryCache;
  cache[rollNo] = embeddings;
  syncWorkerSingle(modelType, rollNo, embeddings);

  // Immediate Disk Persistence (IndexedDB)
  try {
    const { getCache, setCache } = await import("./idb");
    const storageKey =
      modelType === "ghostface"
        ? "embeddings_ghost"
        : modelType === "edgeface"
        ? "embeddings_edge"
        : "embeddings";
    const disk = (await getCache<Record<string, number[][]>>(storageKey)) || {};
    disk[rollNo] = embeddings.map((a) => Array.from(a));
    await setCache(storageKey, disk);
  } catch (err) {
    console.warn("[💾 CACHE] Failed to persist to IndexedDB", err);
  }
}

export async function rollingUpdateEmbedding(
  rollNo: string,
  newEmbedding: Float32Array,
  modelType: "face-api" | "ghostface" | "edgeface",
) {
  if (modelType === "face-api") return;
  const current =
    modelType === "ghostface"
      ? memoryCacheGhost[rollNo]
      : memoryCacheEdge[rollNo];
  if (!current || current.length === 0) return;
  const updated = [...current];

  if (updated.length < 13) {
    // Fill up to 13 slots total (8 Registration + 5 Adaptive)
    updated.push(newEmbedding);
  } else {
    // FIFO shift for the adaptive slots
    for (let i = 8; i < 12; i++) {
      updated[i] = updated[i + 1];
    }
    updated[12] = newEmbedding;
  }

  await uploadEmbeddings(rollNo, updated, modelType);
}

export function isUserRegisteredFor(
  rollNo: string,
  modelType: "face-api" | "ghostface" | "edgeface",
): boolean {
  const cache =
    modelType === "ghostface"
      ? memoryCacheGhost
      : modelType === "edgeface"
      ? memoryCacheEdge
      : memoryCache;
  return !!cache[rollNo] && cache[rollNo].length > 0;
}

export async function purgeAndFullSync(onProgress?: (msg: string) => void) {
  if (syncInProgress) return;
  syncInProgress = true;

  try {
    if (onProgress) onProgress("Wiping local biometric database...");
    const { clearAllCache } = await import("./idb");
    await clearAllCache();

    // Clear memory
    Object.keys(memoryCache).forEach((k) => delete memoryCache[k]);
    Object.keys(memoryCacheGhost).forEach((k) => delete memoryCacheGhost[k]);
    Object.keys(memoryCacheEdge).forEach((k) => delete memoryCacheEdge[k]);

    // Clear Workers
    searchWorker?.postMessage({ type: "CLEAR" });

    const syncCollection = async (
      coll: string,
      type: "face-api" | "ghostface" | "edgeface",
      storageKey: string,
      syncKey: string,
    ) => {
      if (onProgress) onProgress(`Fetching ${type} profiles...`);
      const all = await fetchAllRows<any>(DB_ID, coll);

      if (onProgress) onProgress(`Indexing ${all.length} ${type} records...`);
      const disk: Record<string, number[][]> = {};
      const cache =
        type === "ghostface"
          ? memoryCacheGhost
          : type === "edgeface"
          ? memoryCacheEdge
          : memoryCache;

      let latest = "1970-01-01T00:00:00.000Z";

      for (const doc of all) {
        if (doc.embeddings) {
          try {
            const p = JSON.parse(doc.embeddings);
            const floatArrays = p.map((a: any) => new Float32Array(a));
            cache[doc.$id] = floatArrays;
            disk[doc.$id] = p;
            if (doc.$updatedAt > latest) latest = doc.$updatedAt;
            syncWorkerSingle(type, doc.$id, floatArrays);
          } catch (e) {}
        }
      }

      const { setCache } = await import("./idb");
      await setCache(storageKey, disk);
      await setCache(syncKey, latest);
    };

    await syncCollection(
      COLLECTIONS.FACIAL_EMBEDDINGS,
      "face-api",
      "embeddings",
      "last_sync_time",
    );
    await syncCollection(
      COLLECTIONS.FACIAL_EMBEDDINGS_NEW,
      "ghostface",
      "embeddings_ghost",
      "last_sync_time_ghost",
    );
    await syncCollection(
      COLLECTIONS.FACIAL_EMBEDDINGS_EDGE,
      "edgeface",
      "embeddings_edge",
      "last_sync_time_edge",
    );

    if (onProgress) onProgress("Sync Complete! System Optimized.");
  } catch (err) {
    console.error("[🔥 SYNC] Purge failed", err);
    if (onProgress) onProgress("Sync Failed. Check Console.");
    throw err;
  } finally {
    syncInProgress = false;
  }
}

export function isAIReady(): boolean {
  return modelsLoaded && isLoaded;
}
export function areModelsLoaded(): boolean {
  return modelsLoaded;
}
export function isCacheLoaded(): boolean {
  return isLoaded;
}
