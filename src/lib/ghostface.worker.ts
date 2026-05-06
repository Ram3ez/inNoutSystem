/**
 * GhostFaceNet ONNX Worker
 * Runs the GhostFaceNet v1 face recognition model in a background thread.
 * Handles specialized image preprocessing and L2 normalization of results.
 */
import * as ort from "onnxruntime-web";


// Safe Defaults for ALL devices (Prevents lag/stutter)
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = false;
ort.env.wasm.proxy = false;

(ort.env.wasm.wasmPaths as any) = {
  "ort-wasm-simd-threaded.wasm": "/models/ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd.wasm": "/models/ort-wasm-simd-threaded.wasm",
  "ort-wasm.wasm": "/models/ort-wasm-simd-threaded.wasm",
};

let session: ort.InferenceSession | null = null;
let loadingPromise: Promise<ort.InferenceSession> | null = null;

async function initSessionV1(): Promise<ort.InferenceSession> {
  if (session) return session;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      console.log("[👷 WORKER] Lazily Initializing GhostFaceNet v1 ONNX Session...");
      const s = await ort.InferenceSession.create("/models/ghostfacenet.onnx", {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      session = s;
      console.log("[👷 WORKER] GhostFaceNet v1 Engine Ready (WASM).");
      return s;
    } catch (e) {
      console.error("[👷 WORKER] ONNX init v1 failed", e);
      throw e;
    }
  })();

  return loadingPromise;
}

async function preprocess(imageData: ImageData): Promise<ort.Tensor> {
  const { width, height, data } = imageData;
  const floatData = new Float32Array(1 * 112 * 112 * 3);

  for (let i = 0; i < 112 * 112; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    floatData[i * 3 + 0] = (r - 127.5) / 128.0;
    floatData[i * 3 + 1] = (g - 127.5) / 128.0;
    floatData[i * 3 + 2] = (b - 127.5) / 128.0;
  }

  return new ort.Tensor("float32", floatData, [1, 112, 112, 3]);
}

self.onmessage = async (e: MessageEvent) => {
  const { type, imageData, id } = e.data;

  if (type === "INIT") {
    try {
      await initSessionV1();
    } catch (e) {
      console.error("[👷 WORKER] Preload failed:", e);
    }
    self.postMessage({ type: "INIT_DONE" });
    return;
  }

  if (type === "INFERENCE") {
    try {
      const activeSession = await initSessionV1();

      const inputTensor = await preprocess(imageData);
      const feeds: any = {};
      feeds[activeSession.inputNames[0]] = inputTensor;

      const outputMap = await activeSession.run(feeds);
      const outputTensor = outputMap[activeSession.outputNames[0]];

      const embedding = outputTensor.data as Float32Array;

      // L2 Normalization
      let norm = 0;
      for (let i = 0; i < embedding.length; i++)
        norm += embedding[i] * embedding[i];
      norm = Math.sqrt(norm);

      const normalizedEmbedding = new Float32Array(embedding.length);
      for (let i = 0; i < embedding.length; i++)
        normalizedEmbedding[i] = embedding[i] / (norm + 1e-6);

      (self as any).postMessage(
        { type: "INFERENCE_DONE", embedding: normalizedEmbedding, id },
        [normalizedEmbedding.buffer],
      );
    } catch (err: any) {
      console.error("[👷 WORKER] Inference Error:", err);
      // Even on error, resolve with zeros to keep the main thread loop moving
      const empty = new Float32Array(512);
      (self as any).postMessage(
        { type: "INFERENCE_DONE", embedding: empty, id },
        [empty.buffer],
      );
    }
  }
};
