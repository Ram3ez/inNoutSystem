/**
 * Face Search Web Worker
 * Offloads 512d vector comparisons for 3000+ students (24,000+ embeddings)
 * to a background thread to prevent UI jank.
 */

interface EmbeddingData {
  id: string;
  data: Float32Array;
}

let faceCache: EmbeddingData[] = [];
let ghostCache: EmbeddingData[] = [];

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'SYNC_CACHE') {
    const { modelType, data } = payload;
    const target = modelType === 'ghostface' ? ghostCache : faceCache;
    
    // Clear and rebuild for this student
    const studentId = data.id;
    const filtered = target.filter(item => item.id !== studentId);
    
    if (data.embeddings) {
      data.embeddings.forEach((emb: Float32Array) => {
        filtered.push({ id: studentId, data: emb });
      });
    }
    
    if (modelType === 'ghostface') ghostCache = filtered;
    else faceCache = filtered;
    return;
  }

  if (type === 'SET_FULL_CACHE') {
    const { modelType, flattenedData, mapping } = payload;
    const list: EmbeddingData[] = [];
    const dim = modelType === 'ghostface' ? 512 : 128;
    
    let offset = 0;
    for (const entry of mapping) {
      const { id, count } = entry;
      for (let i = 0; i < count; i++) {
        const sub = flattenedData.slice(offset, offset + dim);
        list.push({ id, data: sub });
        offset += dim;
      }
    }
    
    if (modelType === 'ghostface') ghostCache = list;
    else faceCache = list;
    return;
  }

  if (type === 'SEARCH') {
    const { query, modelType, threshold, conflictGap, requestId } = payload;
    const target = modelType === 'ghostface' ? ghostCache : faceCache;
    
    let bestMatch = "Unknown";
    let bestScore = -1;
    let secondBestMatch = "Unknown";
    let secondBestScore = -1;

    const q = query as Float32Array;

    for (let i = 0; i < target.length; i++) {
      const item = target[i];
      const dbEmb = item.data;
      
      // Fast Dot Product (Cosine Similarity for L2-Normalized Vectors)
      let score = 0;
      for (let j = 0; j < dbEmb.length; j++) {
        score += q[j] * dbEmb[j];
      }

      if (score > bestScore) {
        if (item.id !== bestMatch) {
          secondBestScore = bestScore;
          secondBestMatch = bestMatch;
        }
        bestScore = score;
        bestMatch = item.id;
      } else if (score > secondBestScore && item.id !== bestMatch) {
        secondBestScore = score;
        secondBestMatch = item.id;
      }
    }

    const finalMatch = bestScore > threshold ? bestMatch : "Unknown";
    
    // Check for conflicts (if gap between best and second best is too small)
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
        rollNo: finalMatch,
        score: bestScore,
        conflictWith,
        conflictScore,
        potentialMatch: bestMatch
      }
    });
    return;
  }

  if (type === 'CLEAR') {
    faceCache = [];
    ghostCache = [];
    return;
  }

  if (type === 'REMOVE_CACHE') {
    const { modelType, studentId } = payload;
    if (modelType === 'ghostface') {
      ghostCache = ghostCache.filter(item => item.id !== studentId);
    } else {
      faceCache = faceCache.filter(item => item.id !== studentId);
    }
    return;
  }
};
