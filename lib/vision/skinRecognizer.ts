import fs from "fs";
import path from "path";
import crypto from "crypto";
import { buildPalettes, deltaE2000, extractDominantColors, hexToLab, mergePalettes, rgbToHex, hexToRgb } from "../colors/colorEngine";
import { SLOTS } from "../config/suggestions";
import type { CandidateRef, ImageDataLike, Lab, Mask, SlotKey } from "../types";
import { clipEmbedding } from "./features";
import { crop, locateSlots, normalizeInput } from "./preprocess";
import { resolveCachePath } from "../utils/cache";

export interface SkinDescriptor {
  classId: string;
  sex: "male" | "female";
  colors: string[];
  items: Record<SlotKey, CandidateRef>;
}

export interface SkinSampleFeatures {
  id: string;
  descriptor: SkinDescriptor;
  embedding: number[];
  slotEmbeddings: Record<SlotKey, number[]>;
  paletteLab: Lab[];
  averageLab: Lab;
  visibility: Record<SlotKey, "ok" | "low">;
  syntheticSeed: string;
  source: "synthetic" | "labeled";
  createdAt: number;
  image?: string;
}

export interface SkinRecognizerModel {
  version: number;
  trainedAt: number;
  samples: SkinSampleFeatures[];
  metadata: {
    classes: string[];
    sexes: Array<"male" | "female">;
    paletteSeeds: number;
    itemsUsed: number;
    samples: number;
    randomSeed: string;
    labeledSamples: number;
  };
}

export interface SkinTrainingConfig {
  items: CandidateRef[];
  classes: string[];
  sexes?: Array<"male" | "female">;
  paletteSeeds?: string[];
  samplesPerClass?: number;
  randomSeed?: string;
  persist?: boolean;
  includeLabeled?: boolean;
  updateDataset?: boolean;
}

export interface RecognizeOptions {
  topK?: number;
}

export interface RecognizeCandidate {
  descriptor: SkinDescriptor;
  score: number;
  components: {
    global: number;
    slots: number;
    color: number;
  };
}

export interface RecognizeResult {
  prediction: RecognizeCandidate | null;
  topMatches: RecognizeCandidate[];
  palette: {
    input: string[];
    anchors: Array<{ hex: string; weight: number }>;
  };
}

export interface SkinEvaluationMetrics {
  samples: number;
  classAccuracy: number;
  sexAccuracy: number;
  exactMatch: number;
  averageScore: number;
}

export interface SkinEvaluationSample {
  id: string;
  target: SkinDescriptor;
  prediction: RecognizeCandidate | null;
}

export interface SkinEvaluationReport {
  metrics: SkinEvaluationMetrics;
  samples: SkinEvaluationSample[];
}

export interface SkinEvaluationConfig {
  model: SkinRecognizerModel;
  items: CandidateRef[];
  classes: string[];
  sexes?: Array<"male" | "female">;
  paletteSeeds?: string[];
  samplesPerClass?: number;
  randomSeed?: string;
  topK?: number;
}

export interface SkinDatasetSummaryRecentEntry {
  id: string;
  descriptor: SkinDescriptor;
  createdAt: number;
  source: SkinSampleFeatures["source"];
  syntheticSeed: string;
  image?: string;
}

export interface SkinDatasetSummary {
  total: number;
  labeled: number;
  synthetic: number;
  classes: Record<string, number>;
  sexes: Record<"male" | "female", number>;
  recent: SkinDatasetSummaryRecentEntry[];
}

interface SkinDatasetFile {
  version: number;
  createdAt: number;
  updatedAt: number;
  samples: SkinSampleFeatures[];
}

interface RecordLabeledSampleOptions {
  storeImage?: boolean;
}

const MODEL_CACHE = resolveCachePath("skin-recognizer.json");
const DATASET_CACHE = resolveCachePath("skin-recognizer-dataset.json");
const DEFAULT_SEXES: Array<"male" | "female"> = ["male", "female"];
const DEFAULT_PALETTE_SEEDS = ["#FF7043", "#36A4F4", "#C7E8FF", "#7EA04D", "#2A243D", "#F4EFCB", "#B9B3A5"];
const MODEL_VERSION = 2;
const DATASET_VERSION = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensureCacheDir(): void {
  const dir = path.dirname(MODEL_CACHE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeHexColor(hex: string): string {
  if (!hex) {
    return "#000000";
  }
  const trimmed = hex.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `#${trimmed.toUpperCase()}`;
  }
  const numeric = parseInt(trimmed.slice(0, 6) || "0", 16);
  return `#${numeric.toString(16).padStart(6, "0").toUpperCase()}`;
}

function sanitizeDescriptor(descriptor: SkinDescriptor): SkinDescriptor {
  const classId = descriptor.classId.trim().toLowerCase();
  const sex: "male" | "female" = descriptor.sex === "female" ? "female" : "male";
  const colors = descriptor.colors.map((color) => sanitizeHexColor(color)).slice(0, 6);
  const items = Object.fromEntries(
    Object.entries(descriptor.items ?? {}).map(([slot, value]) => [slot as SlotKey, value]),
  ) as Record<SlotKey, CandidateRef>;
  return { classId, sex, colors, items };
}

async function loadDatasetFile(): Promise<SkinDatasetFile> {
  try {
    const raw = await fs.promises.readFile(DATASET_CACHE, "utf8");
    const parsed = JSON.parse(raw) as SkinDatasetFile;
    if (parsed.version === DATASET_VERSION && Array.isArray(parsed.samples)) {
      const samples = parsed.samples.map((sample) => ({
        ...sample,
        source: sample.source ?? "labeled",
        createdAt: sample.createdAt ?? parsed.updatedAt ?? Date.now(),
      }));
      return { ...parsed, samples };
    }
  } catch (error) {
    // ignore missing dataset
  }
  return {
    version: DATASET_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    samples: [],
  };
}

async function saveDatasetFile(dataset: SkinDatasetFile): Promise<void> {
  ensureCacheDir();
  const payload: SkinDatasetFile = {
    ...dataset,
    version: DATASET_VERSION,
    updatedAt: Date.now(),
  };
  await fs.promises.writeFile(DATASET_CACHE, JSON.stringify(payload));
}

function buildPalettePreview(colors: string[]): string {
  const palette = colors.length ? colors.slice(0, 6) : DEFAULT_PALETTE_SEEDS.slice(0, 6);
  const width = 240;
  const height = 160;
  const step = Math.ceil(width / Math.max(1, palette.length));
  const rects = palette
    .map((hex, index) => {
      const sanitized = sanitizeHexColor(hex);
      return `<rect x="${index * step}" y="0" width="${step}" height="${height}" fill="${sanitized}" />`;
    })
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${rects}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function getDatasetSamples(): Promise<SkinSampleFeatures[]> {
  const dataset = await loadDatasetFile();
  return dataset.samples;
}

function cloneForTraining(sample: SkinSampleFeatures): SkinSampleFeatures {
  return { ...sample, image: undefined, source: sample.source ?? "labeled" };
}

async function persistSyntheticSamples(samples: SkinSampleFeatures[]): Promise<void> {
  if (!samples.length) {
    return;
  }
  const dataset = await loadDatasetFile();
  const merged = new Map(dataset.samples.map((sample) => [sample.id, sample]));
  for (const sample of samples) {
    const entry = {
      ...sample,
      image: sample.image ?? buildPalettePreview(sample.descriptor.colors),
      source: "synthetic" as const,
    };
    merged.set(entry.id, entry);
  }
  dataset.samples = Array.from(merged.values());
  await saveDatasetFile(dataset);
}

function hashImageData(img512: ImageDataLike): string {
  return crypto.createHash("sha1").update(Buffer.from(img512.data.buffer)).digest("hex");
}

function buildDatasetSummary(samples: SkinSampleFeatures[]): SkinDatasetSummary {
  const summary: SkinDatasetSummary = {
    total: samples.length,
    labeled: 0,
    synthetic: 0,
    classes: {},
    sexes: { male: 0, female: 0 },
    recent: [],
  };
  for (const sample of samples) {
    if (sample.source === "labeled") {
      summary.labeled += 1;
    } else {
      summary.synthetic += 1;
    }
    const classKey = sample.descriptor.classId;
    summary.classes[classKey] = (summary.classes[classKey] ?? 0) + 1;
    summary.sexes[sample.descriptor.sex] = (summary.sexes[sample.descriptor.sex] ?? 0) + 1;
  }
  const recent = [...samples]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 12)
    .map((sample) => ({
      id: sample.id,
      descriptor: sample.descriptor,
      createdAt: sample.createdAt,
      source: sample.source,
      syntheticSeed: sample.syntheticSeed,
      image: sample.image ?? buildPalettePreview(sample.descriptor.colors),
    }));
  summary.recent = recent;
  return summary;
}

export async function getSkinRecognizerDatasetSummary(): Promise<SkinDatasetSummary> {
  const samples = await getDatasetSamples();
  return buildDatasetSummary(samples);
}

export async function listSkinRecognizerDataset(limit = 20): Promise<SkinSampleFeatures[]> {
  const samples = await getDatasetSamples();
  return [...samples]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((sample) => ({ ...sample }));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return clamp(dot / Math.sqrt(normA * normB), -1, 1);
}

function averageLab(values: Lab[]): Lab {
  if (!values.length) {
    return { L: 0, a: 0, b: 0 };
  }
  const total = values.reduce(
    (acc, lab) => {
      acc.L += lab.L;
      acc.a += lab.a;
      acc.b += lab.b;
      return acc;
    },
    { L: 0, a: 0, b: 0 },
  );
  return {
    L: total.L / values.length,
    a: total.a / values.length,
    b: total.b / values.length,
  };
}

function createRng(seed: string | undefined): () => number {
  let state = (() => {
    if (!seed) return Date.now();
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) | 0;
    }
    return hash || 1;
  })();
  return () => {
    state = Math.imul(48271, state % 2147483647);
    state = (state + 2147483647) % 2147483647;
    return (state & 0x7fffffff) / 2147483647;
  };
}

function jitterHex(hex: string, rng: () => number): string {
  const { r, g, b } = hexToRgb(hex);
  const jitter = () => Math.round((rng() - 0.5) * 40);
  const adjust = (value: number) => clamp(value + jitter(), 0, 255);
  return rgbToHex({ r: adjust(r), g: adjust(g), b: adjust(b) });
}

function buildTrainingPalette(seed: string, rng: () => number): string[] {
  const harmonies = buildPalettes([seed]);
  const merged = mergePalettes(harmonies, { maxSize: 8, deltaThreshold: 8 });
  const base = merged.length ? merged : [seed];
  const targetSize = 6;
  const palette = base.slice(0, targetSize).map((hex) => jitterHex(hex, rng));
  while (palette.length < targetSize) {
    palette.push(jitterHex(seed, rng));
  }
  return palette;
}

function groupItemsBySlot(items: CandidateRef[]): Record<SlotKey, CandidateRef[]> {
  const groups = Object.fromEntries(SLOTS.map((slot) => [slot, [] as CandidateRef[]])) as Record<
    SlotKey,
    CandidateRef[]
  >;
  for (const item of items) {
    if (groups[item.slot]) {
      groups[item.slot].push(item);
    }
  }
  return groups;
}

function pickItemForSlot(
  groups: Record<SlotKey, CandidateRef[]>,
  slot: SlotKey,
  classId: string,
  rng: () => number,
): CandidateRef | null {
  const entries = groups[slot] ?? [];
  if (!entries.length) {
    return null;
  }
  const classMatches = entries.filter((entry) =>
    (entry.tags ?? []).some((tag) => tag.toLowerCase() === `class:${classId.toLowerCase()}`),
  );
  const pool = classMatches.length ? classMatches : entries;
  const index = Math.floor(rng() * pool.length);
  return pool[Math.max(0, Math.min(pool.length - 1, index))] ?? pool[0] ?? null;
}

function descriptorToBuffer(descriptor: SkinDescriptor, seed: string): Buffer {
  const payload = JSON.stringify({ descriptor, seed, version: MODEL_VERSION });
  return crypto.createHash("sha1").update(payload).digest();
}

async function synthesiseSkinImage(
  descriptor: SkinDescriptor,
  syntheticSeed: string,
): Promise<{ buffer: Buffer; img512: ImageDataLike; mask: Mask }> {
  const buffer = descriptorToBuffer(descriptor, syntheticSeed);
  const { img512, mask } = await normalizeInput(buffer);
  return { buffer, img512, mask };
}

async function computeFeatures(
  descriptor: SkinDescriptor,
  syntheticSeed: string,
): Promise<SkinSampleFeatures> {
  const { img512, mask } = await synthesiseSkinImage(descriptor, syntheticSeed);
  const preview = buildPalettePreview(descriptor.colors);
  return computeFeaturesFromImageData(img512, mask, descriptor, syntheticSeed, "synthetic", preview);
}

async function computeFeaturesFromImageData(
  img512: ImageDataLike,
  mask: Mask,
  descriptor: SkinDescriptor,
  syntheticSeed: string,
  source: "synthetic" | "labeled",
  image?: string,
): Promise<SkinSampleFeatures> {
  const { boxes, visibility } = await locateSlots(img512, mask);
  const embedding = await clipEmbedding(img512);
  const slotEmbeddings = {} as Record<SlotKey, number[]>;
  for (const slot of SLOTS) {
    const box = boxes[slot];
    const patch = crop(img512, box);
    slotEmbeddings[slot] = await clipEmbedding(patch);
  }
  const paletteLab = descriptor.colors.map((hex) => hexToLab(hex));
  const average = averageLab(paletteLab);
  const id = crypto.createHash("sha1").update(descriptorToBuffer(descriptor, syntheticSeed)).digest("hex");
  return {
    id,
    descriptor,
    embedding,
    slotEmbeddings,
    paletteLab,
    averageLab: average,
    visibility,
    syntheticSeed,
    source,
    createdAt: Date.now(),
    image,
  };
}

export async function recordLabeledSkinSample(
  image: Buffer | string,
  descriptor: SkinDescriptor,
  options: RecordLabeledSampleOptions = {},
): Promise<{ sample: SkinSampleFeatures; summary: SkinDatasetSummary }> {
  const sanitized = sanitizeDescriptor(descriptor);
  const { img512, mask } = await normalizeInput(image);
  const fingerprint = hashImageData(img512);
  const seed = `human-${fingerprint}`;
  const storeImage = typeof image === "string" && options.storeImage !== false ? image : undefined;
  const features = await computeFeaturesFromImageData(img512, mask, sanitized, seed, "labeled", storeImage);
  const dataset = await loadDatasetFile();
  const index = dataset.samples.findIndex((sample) => sample.id === features.id);
  if (index >= 0) {
    dataset.samples[index] = features;
  } else {
    dataset.samples.push(features);
  }
  await saveDatasetFile(dataset);
  const summary = buildDatasetSummary(dataset.samples);
  return { sample: features, summary };
}

export async function trainSkinRecognizer(config: SkinTrainingConfig): Promise<SkinRecognizerModel> {
  const { items, classes } = config;
  if (!items.length) {
    throw new Error("No items provided for training");
  }
  if (!classes.length) {
    throw new Error("No classes provided for training");
  }
  const sexes = config.sexes?.length ? config.sexes : DEFAULT_SEXES;
  const paletteSeeds = config.paletteSeeds?.length ? config.paletteSeeds : DEFAULT_PALETTE_SEEDS;
  const samplesPerClass = clamp(config.samplesPerClass ?? 3, 1, 12);
  const rng = createRng(config.randomSeed);
  const grouped = groupItemsBySlot(items);

  const includeLabeled = config.includeLabeled !== false;
  const dataset = includeLabeled ? await loadDatasetFile() : null;
  const samples: SkinSampleFeatures[] = [];
  const labeledSamples = dataset?.samples ?? [];
  if (includeLabeled) {
    for (const sample of labeledSamples) {
      samples.push(cloneForTraining(sample));
    }
  }
  for (const classId of classes) {
    for (const sex of sexes) {
      for (let i = 0; i < samplesPerClass; i += 1) {
        const seedIndex = Math.floor(rng() * paletteSeeds.length);
        const palette = buildTrainingPalette(paletteSeeds[seedIndex], rng);
        const descriptorItems: Partial<Record<SlotKey, CandidateRef>> = {};
        for (const slot of SLOTS) {
          const pick = pickItemForSlot(grouped, slot, classId, rng);
          if (pick) {
            descriptorItems[slot] = pick;
          }
        }
        const descriptor: SkinDescriptor = {
          classId,
          sex,
          colors: palette,
          items: descriptorItems as Record<SlotKey, CandidateRef>,
        };
        const syntheticSeed = `${classId}-${sex}-${i}-${Math.floor(rng() * 1_000_000)}`;
        const features = await computeFeatures(descriptor, syntheticSeed);
        samples.push({ ...features, source: "synthetic" });
      }
    }
  }

  const model: SkinRecognizerModel = {
    version: MODEL_VERSION,
    trainedAt: Date.now(),
    samples,
    metadata: {
      classes: classes.map((value) => value.toLowerCase()),
      sexes,
      paletteSeeds: paletteSeeds.length,
      itemsUsed: items.length,
      samples: samples.length,
      randomSeed: config.randomSeed ?? "dynamic",
      labeledSamples: includeLabeled ? labeledSamples.length : 0,
    },
  };

  if (config.persist) {
    await saveSkinRecognizerModel(model);
  }

  if (config.updateDataset) {
    const syntheticSamples = samples.filter((sample) => sample.source === "synthetic");
    if (syntheticSamples.length) {
      await persistSyntheticSamples(syntheticSamples);
    }
  }

  return model;
}

export async function evaluateSkinRecognizer(config: SkinEvaluationConfig): Promise<SkinEvaluationReport> {
  const { model, items, classes } = config;
  if (!model.samples.length) {
    throw new Error("Skin recognizer model not trained");
  }
  if (!items.length) {
    throw new Error("No items provided for evaluation");
  }
  if (!classes.length) {
    throw new Error("No classes provided for evaluation");
  }

  const sexes = config.sexes?.length ? config.sexes : DEFAULT_SEXES;
  const paletteSeeds = config.paletteSeeds?.length ? config.paletteSeeds : DEFAULT_PALETTE_SEEDS;
  const samplesPerClass = clamp(config.samplesPerClass ?? 2, 1, 8);
  const rng = createRng(config.randomSeed ?? `${model.metadata.randomSeed}-eval`);
  const grouped = groupItemsBySlot(items);

  const evaluationSamples: SkinEvaluationSample[] = [];
  let classHits = 0;
  let sexHits = 0;
  let exactHits = 0;
  let scoreTotal = 0;

  for (const classId of classes) {
    for (const sex of sexes) {
      for (let i = 0; i < samplesPerClass; i += 1) {
        const seedIndex = Math.floor(rng() * paletteSeeds.length);
        const palette = buildTrainingPalette(paletteSeeds[seedIndex], rng);
        const descriptorItems: Partial<Record<SlotKey, CandidateRef>> = {};
        for (const slot of SLOTS) {
          const pick = pickItemForSlot(grouped, slot, classId, rng);
          if (pick) {
            descriptorItems[slot] = pick;
          }
        }
        const descriptor: SkinDescriptor = {
          classId,
          sex,
          colors: palette,
          items: descriptorItems as Record<SlotKey, CandidateRef>,
        };
        const syntheticSeed = `${classId}-${sex}-eval-${i}-${Math.floor(rng() * 1_000_000)}`;
        const buffer = await synthesiseDescriptorImage(descriptor, syntheticSeed);
        const result = await recognizeSkin(buffer, model, { topK: config.topK ?? 3 });
        const prediction = result.prediction ?? null;
        if (prediction) {
          scoreTotal += prediction.score;
          if (prediction.descriptor.classId === descriptor.classId) {
            classHits += 1;
          }
          if (prediction.descriptor.sex === descriptor.sex) {
            sexHits += 1;
          }
          const predictedItems = prediction.descriptor.items ?? {};
          const targetItems = descriptor.items ?? {};
          const sameItems = SLOTS.every((slot) => {
            const target = targetItems[slot];
            const predicted = predictedItems[slot];
            if (!target && !predicted) return true;
            if (!target || !predicted) return false;
            return target.itemId === predicted.itemId;
          });
          const samePalette = descriptor.colors.every((color, index) => prediction.descriptor.colors[index] === color);
          if (sameItems && samePalette && prediction.descriptor.classId === descriptor.classId && prediction.descriptor.sex === descriptor.sex) {
            exactHits += 1;
          }
        }
        evaluationSamples.push({ id: syntheticSeed, target: descriptor, prediction });
      }
    }
  }

  const totalSamples = evaluationSamples.length || 1;
  const metrics: SkinEvaluationMetrics = {
    samples: evaluationSamples.length,
    classAccuracy: classHits / totalSamples,
    sexAccuracy: sexHits / totalSamples,
    exactMatch: exactHits / totalSamples,
    averageScore: evaluationSamples.length ? scoreTotal / evaluationSamples.length : 0,
  };

  return { metrics, samples: evaluationSamples };
}

function paletteDelta(sample: Lab[], observed: Lab[]): number {
  if (!sample.length || !observed.length) {
    return 100;
  }
  let total = 0;
  for (const lab of sample) {
    let best = Infinity;
    for (const obs of observed) {
      const delta = deltaE2000(lab, obs);
      if (delta < best) {
        best = delta;
      }
    }
    total += best === Infinity ? 100 : best;
  }
  return total / sample.length;
}

export async function recognizeSkin(
  image: Buffer | string,
  model?: SkinRecognizerModel | null,
  options: RecognizeOptions = {},
): Promise<RecognizeResult> {
  const activeModel = model ?? (await loadSkinRecognizerModel());
  if (!activeModel || !activeModel.samples.length) {
    throw new Error("Skin recognizer model not trained");
  }

  const { img512, mask } = await normalizeInput(image);
  const { boxes, visibility } = await locateSlots(img512, mask);
  const embedding = await clipEmbedding(img512);
  const slotEmbeddings = {} as Record<SlotKey, number[]>;
  for (const slot of SLOTS) {
    const patch = crop(img512, boxes[slot]);
    slotEmbeddings[slot] = await clipEmbedding(patch);
  }
  const anchors = extractDominantColors(img512, { k: 4, mask });
  const observedPalette = anchors.map((anchor) => anchor.lab);
  const observedHex = anchors.map((anchor) => anchor.hex);

  const candidates: RecognizeCandidate[] = [];
  for (const sample of activeModel.samples) {
    const global = (cosineSimilarity(sample.embedding, embedding) + 1) / 2;
    let slotTotal = 0;
    let slotWeight = 0;
    for (const slot of SLOTS) {
      const embA = sample.slotEmbeddings[slot];
      const embB = slotEmbeddings[slot];
      if (embA?.length && embB?.length) {
        const weight = (sample.visibility[slot] === "ok" ? 1 : 0.6) * (visibility[slot] === "ok" ? 1 : 0.6);
        slotTotal += ((cosineSimilarity(embA, embB) + 1) / 2) * weight;
        slotWeight += weight;
      }
    }
    const slots = slotWeight ? slotTotal / slotWeight : global;
    const delta = paletteDelta(sample.paletteLab, observedPalette);
    const color = 1 - clamp(delta / 100, 0, 1);
    const score = global * 0.4 + slots * 0.4 + color * 0.2;
    candidates.push({
      descriptor: sample.descriptor,
      score,
      components: { global, slots, color },
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const topK = clamp(options.topK ?? 3, 1, 10);
  const topMatches = candidates.slice(0, topK);
  const prediction = topMatches[0] ?? null;

  return {
    prediction,
    topMatches,
    palette: {
      input: observedHex,
      anchors: anchors.map((entry) => ({ hex: entry.hex, weight: entry.weight })),
    },
  };
}

export async function saveSkinRecognizerModel(model: SkinRecognizerModel): Promise<void> {
  ensureCacheDir();
  await fs.promises.writeFile(MODEL_CACHE, JSON.stringify(model));
}

export async function loadSkinRecognizerModel(): Promise<SkinRecognizerModel | null> {
  try {
    const raw = await fs.promises.readFile(MODEL_CACHE, "utf8");
    const parsed = JSON.parse(raw) as SkinRecognizerModel;
    if (parsed.version === MODEL_VERSION) {
      return parsed;
    }
  } catch (error) {
    // ignore load errors
  }
  return null;
}

export async function hasSkinRecognizerModel(): Promise<boolean> {
  try {
    await fs.promises.access(MODEL_CACHE, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}

export async function synthesiseDescriptorImage(
  descriptor: SkinDescriptor,
  syntheticSeed: string,
): Promise<Buffer> {
  const { buffer } = await synthesiseSkinImage(descriptor, syntheticSeed);
  return buffer;
}

export function deriveClassesFromItems(items: CandidateRef[]): string[] {
  const classes = new Set<string>();
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      if (tag.toLowerCase().startsWith("class:")) {
        classes.add(tag.toLowerCase().replace("class:", ""));
      }
    }
  }
  return Array.from(classes);
}

