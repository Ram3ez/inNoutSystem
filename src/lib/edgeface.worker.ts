/**
 * EdgeFace ONNX Worker
 * Runs the EdgeFace face recognition model in a background thread using ONNX Runtime Web.
 * Performs preprocessing (image to tensor) and postprocessing (L2 normalization).
 */
import * as ort from "onnxruntime-web";


// Safe Defaults for ALL devices
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

async function initSession(modelBuffer?: ArrayBuffer): Promise<ort.InferenceSession> {
  if (session) return session;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    try {
      console.log("[👷 WORKER] Lazily Initializing EdgeFace ONNX Session...");
      let s;
      if (modelBuffer) {
        s = await ort.InferenceSession.create(new Uint8Array(modelBuffer), {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        });
      } else {
        s = await ort.InferenceSession.create("/models/edgeface.onnx", {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        });
      }
      session = s;
      console.log("[👷 WORKER] EdgeFace Engine Ready (WASM).");
      return s;
    } catch (e) {
      console.error("[👷 WORKER] ONNX init for EdgeFace failed", e);
      throw e;
    }
  })();

  return loadingPromise;
}

/**
 * preprocess
 * Converts standard ImageData (RGBA) into an ONNX-ready Tensor.
 * 
 * Logic:
 * 1. Normalization: Scales 0-255 pixels to -1.0 to 1.0 range (mean=127.5, std=127.5).
 * 2. Format Handling: Switches between Planar (CHW) and Interleaved (HWC) formats based 
 *    on the model's metadata requirements.
 */
async function preprocess(
  imageData: ImageData,
  inputShape: readonly number[],
): Promise<ort.Tensor> {
  const { width, height, data } = imageData;

  // Detect if model expects CHW [1, 3, 112, 112] or HWC [1, 112, 112, 3]
  const isCHW = inputShape && (inputShape[1] === 3 || inputShape[3] === 112);

  if (isCHW) {
    const floatData = new Float32Array(1 * 3 * 112 * 112);
    for (let i = 0; i < 112 * 112; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];

      floatData[i] = (r - 127.5) / 127.5;
      floatData[112 * 112 + i] = (g - 127.5) / 127.5;
      floatData[2 * 112 * 112 + i] = (b - 127.5) / 127.5;
    }
    return new ort.Tensor("float32", floatData, [1, 3, 112, 112]);
  } else {
    const floatData = new Float32Array(1 * 112 * 112 * 3);
    for (let i = 0; i < 112 * 112; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];

      floatData[i * 3 + 0] = (r - 127.5) / 127.5;
      floatData[i * 3 + 1] = (g - 127.5) / 127.5;
      floatData[i * 3 + 2] = (b - 127.5) / 127.5;
    }
    return new ort.Tensor("float32", floatData, [1, 112, 112, 3]);
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type, imageData, id, modelBuffer } = e.data;

  if (type === "INIT") {
    // Model warming up phase
    try {
      await initSession(modelBuffer);
    } catch (e) {
      console.error("[👷 WORKER] EdgeFace Preload failed:", e);
    }
    self.postMessage({ type: "INIT_DONE" });
    return;
  }

  if (type === "INFERENCE") {
    try {
      const activeSession = await initSession();
      const inputName = activeSession.inputNames[0];
      const inputInfo = (activeSession as any).inputs
        ? (activeSession as any).inputs[0]
        : null;
      const shape =
        inputInfo && inputInfo.dims ? inputInfo.dims : [1, 3, 112, 112];

      const inputTensor = await preprocess(imageData, shape);
      const feeds: any = {};
      feeds[inputName] = inputTensor;

      // Run the ONNX model
      const outputMap = await activeSession.run(feeds);
      const outputTensor = outputMap[activeSession.outputNames[0]];

      const embedding = outputTensor.data as Float32Array;

      // --- L2 NORMALIZATION ---
      // We normalize the 512-d vector to a unit length of 1.0.
      // This allows us to use simple Dot Product for Cosine Similarity.
      let norm = 0;
      for (let i = 0; i < embedding.length; i++)
        norm += embedding[i] * embedding[i];
      norm = Math.sqrt(norm);

      const normalizedEmbedding = new Float32Array(embedding.length);
      for (let i = 0; i < embedding.length; i++)
        normalizedEmbedding[i] = embedding[i] / (norm + 1e-6);

      // Pass the result back to the main thread using Transferable Objects
      (self as any).postMessage(
        { type: "INFERENCE_DONE", embedding: normalizedEmbedding, id },
        [normalizedEmbedding.buffer],
      );
    } catch (err: any) {
      console.error("[👷 WORKER] EdgeFace Inference Error:", err);
      const empty = new Float32Array(512);
      (self as any).postMessage(
        { type: "INFERENCE_DONE", embedding: empty, id },
        [empty.buffer],
      );
    }
  }
};
