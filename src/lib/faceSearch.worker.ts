/**
 * Face Search Web Worker
 * Offloads heavy 512-dimension vector comparisons for thousands of student embeddings
 * to a background thread to maintain 60fps UI performance.
 */


interface EmbeddingData {
  id: string;
  data: Float32Array;
}

let faceCache: EmbeddingData[] = [];
let ghostCache: EmbeddingData[] = [];
let edgeCache: EmbeddingData[] = [];

self.onmessage = (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'SYNC_CACHE') {
    const { modelType, data } = payload;
    let target = faceCache;
    if (modelType === 'ghostface') target = ghostCache;
    else if (modelType === 'edgeface') target = edgeCache;
    
    // Clear and rebuild for this student
    const studentId = data.id;
    const filtered = target.filter(item => item.id !== studentId);
    
    if (data.embeddings) {
      data.embeddings.forEach((emb: Float32Array) => {
        filtered.push({ id: studentId, data: emb });
      });
    }
    
    if (modelType === 'ghostface') ghostCache = filtered;
    else if (modelType === 'edgeface') edgeCache = filtered;
    else faceCache = filtered;
    return;
  }

  if (type === 'SET_FULL_CACHE') {
    const { modelType, flattenedData, mapping } = payload;
    const list: EmbeddingData[] = [];
    const dim = modelType === 'face-api' ? 128 : 512;
    
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
    else if (modelType === 'edgeface') edgeCache = list;
    else faceCache = list;
    return;
  }

  if (type === 'SEARCH') {
    const { query, modelType, threshold, conflictGap, requestId } = payload;
    let target = faceCache;
    if (modelType === 'ghostface') target = ghostCache;
    else if (modelType === 'edgeface') target = edgeCache;
    
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
    edgeCache = [];
    return;
  }

  if (type === 'REMOVE_CACHE') {
    const { modelType, studentId } = payload;
    if (modelType === 'ghostface') {
      ghostCache = ghostCache.filter(item => item.id !== studentId);
    } else if (modelType === 'edgeface') {
      edgeCache = edgeCache.filter(item => item.id !== studentId);
    } else {
      faceCache = faceCache.filter(item => item.id !== studentId);
    }
    return;
  }
};
