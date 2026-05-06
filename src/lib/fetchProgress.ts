/**
 * fetchWithProgress
 * 
 * A specialized fetch wrapper designed for large binary assets (AI models).
 * It implements a two-tier strategy:
 * 1. Persistent Cache Lookup: Checks the browser's Cache API for the file.
 * 2. Network Fetch with Stream Monitoring: If not cached, downloads via fetch and monitors 
 *    the ReadableStream to report real-time progress percentages.
 * 3. Cache Population: Saves the downloaded buffer back to the Cache API for future use.
 * 
 * @param url - The absolute or relative URL to the asset.
 * @param onProgress - Callback receiving a percentage (0-100).
 * @returns ArrayBuffer containing the file data.
 */
export async function fetchWithProgress(
  url: string,
  onProgress: (progress: number) => void
): Promise<ArrayBuffer> {
  const CACHE_NAME = "ai-models-cache-v1";
  
  // STEP 1: Attempt to retrieve the asset from the persistent Cache API.
  // This avoids massive bandwidth usage on page refreshes.
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(url);
    if (cachedResponse) {
      console.log(`[📦 CACHE] serving ${url} from persistent storage.`);
      // Report 100% immediately if we have a cache hit
      onProgress(100); 
      return await cachedResponse.arrayBuffer();
    }
  } catch (e) {
    console.warn("[📦 CACHE] Cache API not available or failed:", e);
  }

  // STEP 2: Network Fetch. 
  // If we're here, the model is either being downloaded for the first time or the cache failed.
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);

  // Retrieve Content-Length to calculate progress. 
  // Note: Servers must include this header (and CORS allow it) for progress to work.
  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  let loaded = 0;

  // STEP 3: Stream Monitoring.
  // We use the getReader() method on the response body to read the stream chunk-by-chunk.
  const reader = response.body?.getReader();
  if (!reader) return await response.arrayBuffer();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    // Accumulate the chunks and update the total loaded bytes
    chunks.push(value);
    loaded += value.length;
    
    // Fire the progress callback with current percentage
    if (total > 0) onProgress((loaded / total) * 100);
  }

  // Combine all Uint8Array chunks into a single buffer
  const allChunks = new Uint8Array(loaded);
  let position = 0;
  for (const chunk of chunks) {
    allChunks.set(chunk, position);
    position += chunk.length;
  }

  // STEP 4: Persistent Storage.
  // Save the successfully downloaded buffer to the Cache API.
  try {
    const cache = await caches.open(CACHE_NAME);
    const cacheResponse = new Response(allChunks.buffer, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
        "Content-Length": loaded.toString(),
      },
    });
    await cache.put(url, cacheResponse);
    console.log(`[📦 CACHE] ${url} saved to persistent storage.`);
  } catch (e) {
    console.warn("[📦 CACHE] Failed to save to cache:", e);
  }

  return allChunks.buffer;
}

