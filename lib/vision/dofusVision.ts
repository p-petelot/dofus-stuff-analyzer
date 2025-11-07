/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import crypto from "crypto";
import sharp from "sharp";

const DEFAULT_RENDERER = "https://skin.souff.fr/renderer/";

const CLASSES: Array<[number, string]> = [
  [1, "Feca"],
  [2, "Osamodas"],
  [3, "Enutrof"],
  [4, "Sram"],
  [5, "Xelor"],
  [6, "Ecaflip"],
  [7, "Eniripsa"],
  [8, "Iop"],
  [9, "Cra"],
  [10, "Sadida"],
  [11, "Sacrieur"],
  [12, "Pandawa"],
  [13, "Roublard"],
  [14, "Zobal"],
  [15, "Steamer"],
  [16, "Eliotrope"],
  [17, "Huppermage"],
  [18, "Ouginak"],
  [20, "Forgelance"],
];

const SEXES = [0, 1];

const FIXED_HEADS: Record<number, { male: number; female: number }> = {
  1: { male: 1, female: 9 },
  2: { male: 17, female: 25 },
  3: { male: 33, female: 41 },
  4: { male: 49, female: 57 },
  5: { male: 65, female: 73 },
  6: { male: 81, female: 89 },
  7: { male: 97, female: 105 },
  8: { male: 113, female: 121 },
  9: { male: 129, female: 137 },
  10: { male: 145, female: 153 },
  11: { male: 161, female: 169 },
  12: { male: 177, female: 185 },
  13: { male: 193, female: 201 },
  14: { male: 209, female: 217 },
  15: { male: 225, female: 233 },
  16: { male: 241, female: 249 },
  17: { male: 257, female: 265 },
  18: { male: 273, female: 275 },
  20: { male: 294, female: 302 },
};

const CLASS_TO_IDX = new Map<string, number>();
const IDX_TO_CLASS: Array<{ breed: number; sex: number }> = [];

{
  let idx = 0;
  for (const [breed] of CLASSES) {
    for (const sex of SEXES) {
      CLASS_TO_IDX.set(`${breed}_${sex}`, idx);
      IDX_TO_CLASS[idx] = { breed, sex };
      idx += 1;
    }
  }
}

const NUM_CLASSES = IDX_TO_CLASS.length;

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function randHex(n = 6) {
  return crypto.randomBytes(Math.ceil(n / 2)).toString("hex").slice(0, n);
}

function randomColors() {
  return Array.from({ length: 6 }, () => Math.floor(Math.random() * 0xffffff));
}

function fixedHeadFor(breed: number, sex: number) {
  const entry = FIXED_HEADS[breed];
  if (!entry) return undefined;
  return sex === 0 ? entry.male : entry.female;
}

async function painterCompositeWhite(buffer: Buffer) {
  return sharp(buffer).removeAlpha().flatten({ background: "#ffffff" });
}

async function renderSprite(
  payload: Record<string, unknown>,
  renderer = DEFAULT_RENDERER,
): Promise<Buffer> {
  const response = await fetch(renderer, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Renderer error ${response.status}: ${text}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function buildPayload({
  breed,
  sex,
  colors,
  head,
}: {
  breed: number;
  sex: number;
  colors: number[];
  head?: number;
}) {
  return {
    breed,
    sex,
    head,
    item_id: [],
    colors,
    direction: 1,
    kramelehone: 0,
    living_objects: [],
    animation: 0,
  };
}

type TfModule = typeof import("@tensorflow/tfjs");

let tfPromise: Promise<TfModule> | null = null;
let backendReady = false;

async function loadTf(): Promise<TfModule> {
  if (!tfPromise) {
    tfPromise = (async () => {
      const tf = await import("@tensorflow/tfjs");
      await import("@tensorflow/tfjs-backend-cpu");
      await import("@tensorflow/tfjs-backend-wasm");
      try {
        await import("@tensorflow/tfjs-node");
        await tf.setBackend("tensorflow");
      } catch (err) {
        console.warn("tfjs-node unavailable, falling back to CPU backend", err);
        await tf.setBackend("cpu");
      }
      await tf.ready();
      backendReady = true;
      return tf;
    })();
  }
  return tfPromise;
}

async function ensureBackend(tf: TfModule) {
  if (backendReady) return;
  try {
    if (tf.getBackend() !== "tensorflow") {
      await tf.setBackend("wasm");
      await tf.ready();
    }
  } catch (err) {
    console.warn("Failed to switch backend, staying on", tf.getBackend(), err);
  }
  backendReady = true;
}

async function loadImageAsTensor(filePath: string, imgSize: number, tf: TfModule) {
  const buffer = fs.readFileSync(filePath);
  const rgb = await (await painterCompositeWhite(buffer)).resize(imgSize, imgSize).raw().toBuffer();
  const float = Float32Array.from(rgb, (value) => (value / 255 - 0.5) / 0.5);
  return tf.tensor4d(float, [1, imgSize, imgSize, 3]);
}

function makeImageList(labelsPath: string) {
  if (!fs.existsSync(labelsPath)) return [] as Array<Record<string, any>>;
  const text = fs.readFileSync(labelsPath, "utf-8");
  if (!text.trim()) return [] as Array<Record<string, any>>;
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
}

class ImageCache {
  private store = new Map<string, Float32Array>();

  constructor(private imgSize: number, private parallel = 6) {}

  has(filePath: string) {
    return this.store.has(filePath);
  }

  getTensor(filePath: string, tf: TfModule) {
    const arr = this.store.get(filePath);
    if (!arr) return null;
    return tf.tensor4d(arr, [1, this.imgSize, this.imgSize, 3]);
  }

  async preload(paths: string[]) {
    let index = 0;
    const total = paths.length;
    const worker = async () => {
      while (index < total) {
        const current = index;
        index += 1;
        const p = paths[current];
        if (!p) break;
        try {
          const buffer = fs.readFileSync(p);
          const rgb = await (await painterCompositeWhite(buffer))
            .resize(this.imgSize, this.imgSize)
            .raw()
            .toBuffer();
          const float = Float32Array.from(rgb, (value) => (value / 255 - 0.5) / 0.5);
          this.store.set(p, float);
        } catch (err) {
          console.warn("Failed to preload", p, err);
        }
      }
    };
    await Promise.all(Array.from({ length: this.parallel }, () => worker()));
  }
}

function buildModelLite(tf: TfModule, imgSize: number, numClasses: number, lr: number) {
  const model = tf.sequential();
  model.add(
    tf.layers.conv2d({
      filters: 12,
      kernelSize: 3,
      activation: "relu",
      inputShape: [imgSize, imgSize, 3],
      padding: "same",
    }),
  );
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  model.add(tf.layers.conv2d({ filters: 24, kernelSize: 3, activation: "relu", padding: "same" }));
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  model.add(tf.layers.conv2d({ filters: 36, kernelSize: 3, activation: "relu", padding: "same" }));
  model.add(tf.layers.maxPooling2d({ poolSize: 2 }));
  model.add(tf.layers.flatten());
  model.add(tf.layers.dense({ units: 128, activation: "relu" }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: numClasses, activation: "softmax" }));
  model.compile({
    optimizer: tf.train.adam(lr),
    loss: "sparseCategoricalCrossentropy",
    metrics: ["accuracy"],
  });
  return model;
}

async function saveModelLocal(tf: TfModule, model: import("@tensorflow/tfjs").LayersModel, outDir: string) {
  ensureDir(outDir);
  const ioHandler: import("@tensorflow/tfjs").io.IOHandler = {
    save: async (artifacts) => {
      fs.writeFileSync(path.join(outDir, "weights.bin"), Buffer.from(artifacts.weightData));
      const modelJSON = {
        format: "layers-model",
        generatedBy: "tfjs-layers",
        convertedBy: null,
        modelTopology: artifacts.modelTopology,
        trainingConfig: artifacts.trainingConfig ?? null,
        weightsManifest: [{ paths: ["weights.bin"], weights: artifacts.weightSpecs }],
      };
      fs.writeFileSync(path.join(outDir, "model.json"), JSON.stringify(modelJSON));
      return { modelArtifactsInfo: { dateSaved: new Date() }, responses: [] };
    },
  };
  await model.save(ioHandler);
}

async function loadModelLocal(tf: TfModule, outDir: string) {
  const modelJSON = JSON.parse(fs.readFileSync(path.join(outDir, "model.json"), "utf-8"));
  const weightBuf = fs.readFileSync(path.join(outDir, "weights.bin"));
  const ioHandler: import("@tensorflow/tfjs").io.IOHandler = {
    load: async () => ({
      modelTopology: modelJSON.modelTopology,
      weightSpecs: modelJSON.weightsManifest[0].weights,
      weightData: weightBuf.buffer.slice(weightBuf.byteOffset, weightBuf.byteOffset + weightBuf.byteLength),
      trainingConfig: modelJSON.trainingConfig ?? null,
      format: modelJSON.format,
      generatedBy: modelJSON.generatedBy,
      convertedBy: modelJSON.convertedBy,
    }),
  };
  return tf.loadLayersModel(ioHandler);
}

function top5FromProbs(probs: Float32Array | number[]) {
  const arr = Array.from(probs);
  return arr
    .map((p, idx) => ({ idx, prob: p }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 5)
    .map(({ idx, prob }) => ({
      class_idx: idx,
      prob: Number(prob.toFixed(4)),
      breed: IDX_TO_CLASS[idx].breed,
      sex: IDX_TO_CLASS[idx].sex,
    }));
}

function decFromRGB(r: number, g: number, b: number) {
  return ((r & 255) << 16) + ((g & 255) << 8) + (b & 255);
}

function kmeans(points: Float32Array, k = 6, iters = 12) {
  const n = Math.floor(points.length / 3);
  if (n <= k) {
    const out: number[][] = [];
    for (let i = 0; i < n; i += 1) {
      out.push([points[i * 3], points[i * 3 + 1], points[i * 3 + 2]]);
    }
    while (out.length < k) out.push([255, 255, 255]);
    return out;
  }

  const centers: number[][] = [];
  for (let i = 0; i < k; i += 1) {
    const j = Math.floor(Math.random() * n);
    centers.push([points[j * 3], points[j * 3 + 1], points[j * 3 + 2]]);
  }

  for (let t = 0; t < iters; t += 1) {
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = Array.from({ length: k }, () => 0);
    for (let i = 0; i < n; i += 1) {
      const r = points[i * 3];
      const g = points[i * 3 + 1];
      const b = points[i * 3 + 2];
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c += 1) {
        const [cr, cg, cb] = centers[c];
        const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      sums[best][0] += r;
      sums[best][1] += g;
      sums[best][2] += b;
      counts[best] += 1;
    }
    for (let c = 0; c < k; c += 1) {
      if (counts[c] > 0) {
        centers[c][0] = Math.round(sums[c][0] / counts[c]);
        centers[c][1] = Math.round(sums[c][1] / counts[c]);
        centers[c][2] = Math.round(sums[c][2] / counts[c]);
      }
    }
  }

  const counts = Array.from({ length: k }, () => 0);
  for (let i = 0; i < n; i += 1) {
    const r = points[i * 3];
    const g = points[i * 3 + 1];
    const b = points[i * 3 + 2];
    let best = 0;
    let bestD = Infinity;
    for (let c = 0; c < k; c += 1) {
      const [cr, cg, cb] = centers[c];
      const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
      if (d < bestD) {
        best = c;
        bestD = d;
      }
    }
    counts[best] += 1;
  }

  const order = Array.from({ length: k }, (_, i) => i).sort((a, b) => counts[b] - counts[a]);
  return order.map((idx) => centers[idx]);
}

async function extract6Colors(imagePath: string) {
  const buf = fs.readFileSync(imagePath);
  const rgb = await (await painterCompositeWhite(buf)).raw().toBuffer();
  const arr: number[] = [];
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i];
    const g = rgb[i + 1];
    const b = rgb[i + 2];
    if (r > 250 && g > 250 && b > 250) continue;
    arr.push(r, g, b);
  }
  const pts = Float32Array.from(arr);
  const centers = kmeans(pts, 6, 12);
  return centers.map(([r, g, b]) => decFromRGB(r, g, b));
}

export interface GenerateOptions {
  per?: number;
  outDir?: string;
  renderer?: string;
}

export async function generateDataset({
  per = 5,
  outDir = path.resolve("./data/phase1"),
  renderer = DEFAULT_RENDERER,
}: GenerateOptions = {}) {
  const imgDir = path.join(outDir, "images");
  const labelsPath = path.join(outDir, "labels.jsonl");
  ensureDir(imgDir);
  ensureDir(path.dirname(labelsPath));
  const labelsStream = fs.createWriteStream(labelsPath, { flags: "a" });
  try {
    for (const [breed] of CLASSES) {
      for (const sex of SEXES) {
        const head = fixedHeadFor(breed, sex);
        const classIdx = CLASS_TO_IDX.get(`${breed}_${sex}`) ?? 0;
        for (let i = 0; i < per; i += 1) {
          const colors = randomColors();
          const payload = buildPayload({ breed, sex, colors, head });
          const png = await renderSprite(payload, renderer);
          const uid = randHex(8);
          const filePath = path.join(imgDir, `${uid}.png`);
          fs.writeFileSync(filePath, png);
          labelsStream.write(
            `${JSON.stringify({
              id: uid,
              path: filePath,
              breed,
              sex,
              class_idx: classIdx,
              colors,
              head,
              items: [],
            })}\n`,
          );
        }
      }
    }
  } finally {
    labelsStream.end();
  }
}

export interface TrainOptions {
  dataDir?: string;
  imgSize?: number;
  epochs?: number;
  batchSize?: number;
  outDir?: string;
  validationSplit?: number;
  learningRate?: number;
  cache?: boolean;
  valMax?: number;
  resume?: boolean;
}

export interface TrainReport {
  history: Array<{
    epoch: number;
    trainLoss: number;
    trainAcc: number;
    valLoss: number;
    valAcc: number;
  }>;
}

export async function trainModel({
  dataDir = path.resolve("./data/phase1"),
  imgSize = 64,
  epochs = 1,
  batchSize = 32,
  outDir = path.resolve("./models/class_sex"),
  validationSplit = 0.2,
  learningRate = 2e-4,
  cache = false,
  valMax = 0,
  resume = true,
}: TrainOptions = {}): Promise<TrainReport> {
  const tf = await loadTf();
  await ensureBackend(tf);

  const labelsPath = path.join(dataDir, "labels.jsonl");
  if (!fs.existsSync(labelsPath)) {
    throw new Error(`Labels file not found at ${labelsPath}`);
  }

  const records = makeImageList(labelsPath);
  if (!records.length) {
    throw new Error("Dataset is empty. Generate images before training.");
  }

  const split = Math.min(0.9, Math.max(0.05, validationSplit));
  const valCount = Math.max(50, Math.floor(records.length * split));
  const shuffled = [...records].sort(() => Math.random() - 0.5);
  let val = shuffled.slice(0, valCount);
  const train = shuffled.slice(valCount);
  if (valMax > 0 && val.length > valMax) val = val.slice(0, valMax);

  let cacheStore: ImageCache | null = null;
  if (cache) {
    cacheStore = new ImageCache(imgSize, 8);
    await cacheStore.preload([...train, ...val].map((r) => r.path));
  }

  let model: import("@tensorflow/tfjs").LayersModel;
  const modelExists = fs.existsSync(path.join(outDir, "model.json"));
  if (resume && modelExists) {
    model = await loadModelLocal(tf, outDir);
    model.compile({ optimizer: tf.train.adam(learningRate), loss: "sparseCategoricalCrossentropy", metrics: ["accuracy"] });
  } else {
    model = buildModelLite(tf, imgSize, NUM_CLASSES, learningRate);
  }
  ensureDir(outDir);
  await saveModelLocal(tf, model, outDir);

  const history: TrainReport["history"] = [];
  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    let trainLoss = 0;
    let trainAcc = 0;
    let seen = 0;
    const totalBatches = Math.ceil(train.length / batchSize);
    for (let start = 0; start < train.length; start += batchSize) {
      const end = Math.min(start + batchSize, train.length);
      const chunk = train.slice(start, end);
      const xs = await Promise.all(
        chunk.map(async (record) => {
          if (cacheStore && cacheStore.has(record.path)) return cacheStore.getTensor(record.path, tf)!;
          return loadImageAsTensor(record.path, imgSize, tf);
        }),
      );
      const ys = tf.tensor1d(
        chunk.map((record) => record.class_idx),
        "float32",
      );
      const batchTensor = tf.concat(xs, 0);
      xs.forEach((tensor) => tensor.dispose());
      const fitResult = await model.fit(batchTensor, ys, { epochs: 1, verbose: 0 });
      const loss = fitResult.history.loss?.[0] ?? 0;
      const acc = (fitResult.history.acc ?? fitResult.history.accuracy)?.[0] ?? 0;
      trainLoss += loss * batchTensor.shape[0];
      trainAcc += acc * batchTensor.shape[0];
      seen += batchTensor.shape[0];
      batchTensor.dispose();
      ys.dispose();
      const globalWithGc = globalThis as typeof globalThis & { gc?: () => void };
      if (typeof globalWithGc.gc === "function") {
        globalWithGc.gc();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    trainLoss /= Math.max(1, seen);
    trainAcc /= Math.max(1, seen);

    let valLoss = 0;
    let valAcc = 0;
    let vseen = 0;
    for (let start = 0; start < val.length; start += batchSize) {
      const end = Math.min(start + batchSize, val.length);
      const chunk = val.slice(start, end);
      const xs = await Promise.all(
        chunk.map(async (record) => {
          if (cacheStore && cacheStore.has(record.path)) return cacheStore.getTensor(record.path, tf)!;
          return loadImageAsTensor(record.path, imgSize, tf);
        }),
      );
      const ys = tf.tensor1d(
        chunk.map((record) => record.class_idx),
        "float32",
      );
      const batchTensor = tf.concat(xs, 0);
      xs.forEach((tensor) => tensor.dispose());
      const evalRes = model.evaluate(batchTensor, ys, { verbose: 0 });
      const lossTensor = Array.isArray(evalRes) ? evalRes[0] : evalRes;
      const accTensor = Array.isArray(evalRes) ? evalRes[1] : evalRes;
      const loss = (await lossTensor.data())[0];
      const acc = (await accTensor.data())[0];
      valLoss += loss * batchTensor.shape[0];
      valAcc += acc * batchTensor.shape[0];
      vseen += batchTensor.shape[0];
      batchTensor.dispose();
      ys.dispose();
    }
    if (vseen > 0) {
      valLoss /= vseen;
      valAcc /= vseen;
    }
    history.push({ epoch, trainLoss, trainAcc, valLoss, valAcc });
    await saveModelLocal(tf, model, outDir);
  }

  return { history };
}

export interface PredictOptions {
  imagePath?: string;
  imageBuffer?: Buffer;
  modelDir?: string;
  imgSize?: number;
}

export interface PredictResult {
  prediction: { class_idx: number; breed: number; sex: number; prob: number };
  top5: Array<{ class_idx: number; breed: number; sex: number; prob: number }>;
  colors: number[];
}

let loadedModels = new Map<string, import("@tensorflow/tfjs").LayersModel>();

async function getModel(tf: TfModule, modelDir: string) {
  if (loadedModels.has(modelDir)) {
    return loadedModels.get(modelDir)!;
  }
  const model = await loadModelLocal(tf, modelDir);
  loadedModels.set(modelDir, model);
  return model;
}

export async function predictImage({
  imagePath,
  imageBuffer,
  modelDir = path.resolve("./models/class_sex"),
  imgSize = 64,
}: PredictOptions): Promise<PredictResult> {
  if (!imagePath && !imageBuffer) {
    throw new Error("Provide either imagePath or imageBuffer");
  }

  const tf = await loadTf();
  await ensureBackend(tf);

  const tmpPath = imagePath ?? path.join(path.resolve("./tmp"), `${Date.now()}-${randHex(6)}.png`);
  if (!imagePath) {
    ensureDir(path.dirname(tmpPath));
    fs.writeFileSync(tmpPath, imageBuffer!);
  }

  const model = await getModel(tf, modelDir);
  const tensor = await loadImageAsTensor(tmpPath, imgSize, tf);
  const logits = model.predict(tensor) as import("@tensorflow/tfjs").Tensor;
  const probs = await logits.data();
  tensor.dispose();
  logits.dispose();

  const top5 = top5FromProbs(probs as Float32Array);
  const best = top5[0];
  const colors = await extract6Colors(tmpPath);

  if (!imagePath) {
    fs.unlink(tmpPath, () => {});
  }

  return {
    prediction: best,
    top5,
    colors,
  };
}

export function formatHex(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function describeClass(classIdx: number) {
  const entry = IDX_TO_CLASS[classIdx];
  if (!entry) return { breed: null, sex: null };
  const breed = CLASSES.find(([id]) => id === entry.breed)?.[1] ?? String(entry.breed);
  const sex = entry.sex === 0 ? "male" : "female";
  return { breed, sex };
}

export function listClasses() {
  return IDX_TO_CLASS.map((entry, class_idx) => ({
    class_idx,
    breed: entry.breed,
    sex: entry.sex,
    name: CLASSES.find(([id]) => id === entry.breed)?.[1] ?? String(entry.breed),
  }));
}

export const constants = {
  CLASSES,
  SEXES,
  NUM_CLASSES,
};
