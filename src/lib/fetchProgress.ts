/**
 * fetchWithProgress
 *
 * Downloads large binary assets (AI models) with real-time progress reporting.
 *
 * CACHING STRATEGY:
 * Cache WRITE is intentionally omitted here — the PWA service worker (workbox
 * CacheFirst strategy in next.config.ts) is the single source of truth for
 * persisting model files. Having two systems both writing caused every model
 * to be stored twice (172MB+ of duplicates visible in DevTools → Application → Storage).
 *
 * We still do a cache READ so that on repeat visits the progress bar snaps to
 * 100% instantly without re-streaming the buffer from the SW response.
 *
 * RAM STRATEGY:
 * Pre-allocates a single Uint8Array using Content-Length so chunks are written
 * directly in-place. Avoids the chunk-accumulate-then-copy pattern that would
 * double peak memory usage on a 25MB model download.
 *
 * @param url - The absolute or relative URL to the asset.
 * @param onProgress - Callback receiving a percentage (0–100).
 * @returns ArrayBuffer containing the file data.
 */
export async function fetchWithProgress(
  url: string,
  onProgress: (progress: number) => void
): Promise<ArrayBuffer> {
  // READ-ONLY check: the workbox service worker (CacheFirst) stores the model
  // after the first network fetch. On repeat visits we just read it back here
  // for an instant 100% hit without re-downloading.
  try {
    // Check all caches, not just a named one, so workbox's own cache buckets are found.
    const cachedResponse = await caches.match(url);
    if (cachedResponse) {
      console.log(`[📦 CACHE] Serving ${url} from SW cache (instant).`);
      onProgress(100);
      return await cachedResponse.arrayBuffer();
    }
  } catch (e) {
    // Cache API unavailable (e.g., private browsing) — fall through to network.
    console.warn("[📦 CACHE] Cache API read failed:", e);
  }

  // Network fetch — the service worker intercepts this and will cache the response.
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  let loaded = 0;

  const reader = response.body?.getReader();
  if (!reader) return (await response.arrayBuffer()) as ArrayBuffer;

  let resultBuffer: Uint8Array;

  if (total > 0) {
    // Pre-allocated path: single buffer, zero copy overhead.
    resultBuffer = new Uint8Array(total);
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      resultBuffer.set(value, offset);
      offset += value.length;
      loaded = offset;
      onProgress((loaded / total) * 100);
    }
  } else {
    // Fallback: Content-Length unknown (e.g. chunked transfer encoding).
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
    }
    resultBuffer = new Uint8Array(loaded);
    let position = 0;
    for (const chunk of chunks) {
      resultBuffer.set(chunk, position);
      position += chunk.length;
    }
    onProgress(100);
  }

  return resultBuffer.buffer as ArrayBuffer;
}
