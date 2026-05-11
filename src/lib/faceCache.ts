/**
 * FACE CACHE & BIOMETRIC SYNCHRONIZATION LIBRARY
 * 
 * This module acts as the central state manager for all facial identities in the system.
 * It manages three levels of storage:
 * 1. Memory Cache: For ultra-fast matching during live camera scans.
 * 2. Background Workers: Offloads heavy vector comparisons to keep the UI at 60fps.
 * 3. Persistence: Handles incremental cloud sync from Appwrite TablesDB.
 * 
 * MODELS SUPPORTED:
 * - GhostFaceNet (512-d descriptors)
 * - EdgeFace (512-d descriptors)
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
import { DB_ID, COLLECTIONS, BIOMETRIC_THRESHOLDS, DISABLE_REALTIME } from "./constants";

// In-Memory State for lightning-fast matching
let memoryCacheGhost: Record<string, Float32Array[]> = {};
let memoryCacheEdge: Record<string, Float32Array[]> = {};
let isLoaded = false;
let isLoading = false;

/** Accessor for GhostFaceNet descriptors */
export function getMemoryCacheGhost() {
  return memoryCacheGhost;
}

/** Accessor for EdgeFace descriptors */
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
let isGhostWorkerSynced = false;
let isEdgeWorkerSynced = false;

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

/**
 * Spawns a dedicated Web Worker to handle facial vector searching.
 * This prevents the main UI thread from freezing when comparing a face 
 * against thousands of student identities in the database.
 */
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
  searchWorker.onerror = (err) => {
    console.error("[👷 WORKER] Search Worker Crashed:", err);
    searchWorker?.terminate();
    searchWorker = null;
    isLoaded = false;
  };
}

/**
 * Initializes a full dataset synchronization with the background worker.
 * We flatten all embedding arrays into a single, massive contiguous Float32Array
 * buffer in JavaScript. This allows us to pass gigabytes of vector data to the 
 * Web Worker instantaneously via "Transferable Objects", bypassing the standard 
 * structured clone algorithm which would otherwise crash the UI thread.
 */
function syncWorkerFull(
  modelType: "ghostface" | "edgeface",
  data: Record<string, Float32Array[]>,
): Promise<void> {
  if (!searchWorker) initSearchWorker();
  
  // Guard: Avoid redundant full transfers if already synced
  if (modelType === "ghostface" && isGhostWorkerSynced) return Promise.resolve();
  if (modelType === "edgeface" && isEdgeWorkerSynced) return Promise.resolve();

  const dim = 512;

  // Calculate total size for allocation by only counting valid-length embeddings
  let totalCount = 0;
  for (const id in data) {
    for (const emb of data[id]) {
      if (emb && emb.length === dim) totalCount++;
    }
  }

  // Allocate a single contiguous block of memory
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

  return new Promise<void>((resolve) => {
    // We use a one-time message handler to confirm the worker finished loading
    const tempHandler = (e: MessageEvent) => {
      if (e.data.type === "CACHE_LOAD_DONE" && e.data.modelType === modelType) {
        searchWorker?.removeEventListener("message", tempHandler);
        if (modelType === "ghostface") isGhostWorkerSynced = true;
        if (modelType === "edgeface") isEdgeWorkerSynced = true;
        resolve();
      }
    };
    searchWorker?.addEventListener("message", tempHandler);

    console.log(`[🔄 SYNC] Transferring full ${modelType} cache to worker...`);
    searchWorker?.postMessage(
      {
        type: "SET_FULL_CACHE",
        payload: { modelType, flattenedData: flattened, mapping },
      },
      [flattened.buffer],
    );
  });
}

function syncWorkerSingle(
  modelType: "ghostface" | "edgeface",
  studentId: string,
  embeddings: Float32Array[],
) {
  if (!searchWorker) initSearchWorker();
  
  // Invalidate sync flag for this model since we are doing an incremental update
  // Actually, incremental doesn't invalidate a full sync, but ensures consistency.
  
  searchWorker?.postMessage({
    type: "SYNC_CACHE",
    payload: { modelType, data: { id: studentId, embeddings } },
  });
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
                    : "edgeface",
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

  // Catch-up when back online or window gains focus
  const syncHandler = () => {
    console.log("[🌐 NETWORK] Syncing biometric database...");
    performIncrementalSync();
  };

  window.addEventListener("online", syncHandler);
  window.addEventListener("focus", syncHandler);

  // Background Heartbeat (60 seconds)
  // Polls more frequently when active, slower when backgrounded
  let pollingInterval: NodeJS.Timeout;
  
  const startPolling = () => {
    clearInterval(pollingInterval);
    pollingInterval = setInterval(() => {
      if (document.visibilityState === "visible") {
        performIncrementalSync();
      }
    }, 60 * 1000);
  };

  startPolling();

  // Slow down polling when tab is hidden
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      clearInterval(pollingInterval);
      pollingInterval = setInterval(() => {
        performIncrementalSync();
      }, 5 * 60 * 1000); // 5 minutes when hidden
    } else {
      startPolling();
      performIncrementalSync(); // Instant sync on return
    }
  });

  if (DISABLE_REALTIME) {
    console.log("[🚫 REALTIME] WebSockets disabled. Using Adaptive Polling fallback.");
    return;
  }

  // Realtime Subscriptions (Only if not disabled)
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
                : "edgeface",
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
            : "edgeface",
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
    // Re-verify worker state and WAIT for it to be ready.
    // This is critical for fast navigation.
    await Promise.all([
      syncWorkerFull("ghostface", memoryCacheGhost),
      syncWorkerFull("edgeface", memoryCacheEdge),
    ]);
    performIncrementalSync(); // This can be backgrounded
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
        loadFromDisk("embeddings_ghost", memoryCacheGhost),
        loadFromDisk("embeddings_edge", memoryCacheEdge),
      ]);

      // Seed worker and WAIT for it to be ready
      await Promise.all([
        syncWorkerFull("ghostface", memoryCacheGhost),
        syncWorkerFull("edgeface", memoryCacheEdge),
      ]);

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
  modelType: "ghostface" | "edgeface" = "edgeface",
): Promise<RecognitionResult> {
  if (!isLoaded) {
    console.warn("Face cache not loaded yet!");
    return { rollNo: "Unknown", score: 0 };
  }

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
  modelType: "ghostface" | "edgeface",
) {
  const jsonString = JSON.stringify(embeddings.map((a) => Array.from(a)));
  const collId =
    modelType === "ghostface"
      ? COLLECTIONS.FACIAL_EMBEDDINGS_NEW
      : COLLECTIONS.FACIAL_EMBEDDINGS_EDGE;

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
      : memoryCacheEdge;
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
  modelType: "ghostface" | "edgeface",
) {
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
  modelType: "ghostface" | "edgeface",
): boolean {
  const cache =
    modelType === "ghostface"
      ? memoryCacheGhost
      : memoryCacheEdge;
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
    Object.keys(memoryCacheGhost).forEach((k) => delete memoryCacheGhost[k]);
    Object.keys(memoryCacheEdge).forEach((k) => delete memoryCacheEdge[k]);

    // Clear Workers
    searchWorker?.postMessage({ type: "CLEAR" });

    const syncCollection = async (
      coll: string,
      type: "ghostface" | "edgeface",
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
          : memoryCacheEdge;

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
  return isLoaded;
}
export function areModelsLoaded(): boolean {
  return modelsLoaded;
}
export function isCacheLoaded(): boolean {
  return isLoaded;
}
