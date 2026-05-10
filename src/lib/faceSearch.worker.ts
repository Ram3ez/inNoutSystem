/**
 * Face Search Web Worker
 * Offloads heavy 512-dimension vector comparisons for thousands of student embeddings
 * to a background thread to maintain 60fps UI performance.
 */


interface EmbeddingData {
  id: string;
  data: Float32Array;
}


let ghostCache = new Map<string, Float32Array[]>();
let edgeCache = new Map<string, Float32Array[]>();

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'SYNC_CACHE') {
    const { modelType, data } = payload;
    const target = modelType === 'edgeface' ? edgeCache : ghostCache;
    
    if (data.embeddings && data.embeddings.length > 0) {
      target.set(data.id, data.embeddings);
    } else {
      target.delete(data.id);
    }
    return;
  }

  if (type === 'SET_FULL_CACHE') {
    const { modelType, flattenedData, mapping } = payload;
    const target = modelType === 'edgeface' ? edgeCache : ghostCache;
    target.clear();

    const dim = 512;
    let offset = 0;
    
    for (const entry of mapping) {
      const { id, count } = entry;
      const studentEmbeddings: Float32Array[] = [];
      for (let i = 0; i < count; i++) {
        studentEmbeddings.push(flattenedData.slice(offset, offset + dim));
        offset += dim;
      }
      target.set(id, studentEmbeddings);
    }
    return;
  }

  if (type === 'SEARCH') {
    const { query, modelType, threshold, conflictGap, requestId } = payload;
    const target = modelType === 'edgeface' ? edgeCache : ghostCache;
    
    let bestMatch = "Unknown";
    let bestScore = -1;
    let secondBestMatch = "Unknown";
    let secondBestScore = -1;

    const q = query as Float32Array;

    // Optimized Search: Iterate over Map entries
    for (const [id, embeddings] of target.entries()) {
      for (let i = 0; i < embeddings.length; i++) {
        const dbEmb = embeddings[i];
        
        // Fast Dot Product
        let score = 0;
        for (let j = 0; j < dbEmb.length; j++) {
          score += q[j] * dbEmb[j];
        }

        if (score > bestScore) {
          if (id !== bestMatch) {
            secondBestScore = bestScore;
            secondBestMatch = bestMatch;
          }
          bestScore = score;
          bestMatch = id;
        } else if (score > secondBestScore && id !== bestMatch) {
          secondBestScore = score;
          secondBestMatch = id;
        }
      }
    }

    const finalMatch = bestScore > threshold ? bestMatch : "Unknown";
    
    let conflictWith = null;
    let conflictScore = null;
    const gap = conflictGap || 0.05;

    if (bestScore > threshold && secondBestScore > threshold && secondBestScore > (bestScore - gap) && secondBestMatch !== bestMatch) {
      conflictWith = secondBestMatch;
      conflictScore = secondBestScore;
    }

    self.postMessage({
      type: 'SEARCH_RESULT',
      requestId,
      result: {
        rollNo: conflictWith ? "Unknown" : finalMatch,
        score: bestScore,
        conflictWith,
        conflictScore,
        potentialMatch: bestMatch
      }
    });
    return;
  }

  if (type === 'CLEAR') {
    ghostCache.clear();
    edgeCache.clear();
    return;
  }

  if (type === 'REMOVE_CACHE') {
    const { modelType, studentId } = payload;
    if (modelType === 'ghostface') ghostCache.delete(studentId);
    else edgeCache.delete(studentId);
    return;
  }
};

