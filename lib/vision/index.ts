import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { loadGenerationDataset, type LookGenerationExample } from "./dataset";
import { clipEmbedding } from "./features";
import { startTrainingProgress, updateTrainingProgress, finishTrainingProgress } from "./progress";
import { crop, locateSlots, normalizeInput } from "./preprocess";
import { SLOTS } from "../config/suggestions";
import type { ImageDataLike, SlotKey } from "../types";

export interface VisionSlotEmbedding {
  slot: SlotKey;
  embedding: number[];
}

export interface VisionIndexEntry {
  id: string;
  embedding: number[];
  slotEmbeddings: Record<SlotKey, number[]>;
  classLabel?: string | null;
  gender?: "m" | "f" | null;
  colors: string[];
  items: Partial<Record<SlotKey, number>>;
  meta?: Record<string, unknown>;
  sourceFingerprint?: string;
}

export interface VisionIndexMeta {
  datasetPath: string;
  datasetSize: number;
  clipModel?: string | null;
}

export interface VisionIndex {
  updatedAt: number;
  entries: VisionIndexEntry[];
  meta: VisionIndexMeta;
}

export interface BuildVisionIndexOptions {
  datasetPath?: string;
  indexPath?: string;
  limit?: number;
  reuseExisting?: boolean;
  progressPath?: string;
}

const DEFAULT_INDEX_PATH = path.join(process.cwd(), ".cache", "vision-index.json");

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

async function loadExampleBuffer(example: LookGenerationExample): Promise<Buffer | null> {
  try {
    if (example.absoluteImagePath) {
      return await fs.promises.readFile(example.absoluteImagePath);
    }
    if (example.imageData) {
      const base64 = example.imageData.startsWith("data:")
        ? example.imageData.split(",").pop() ?? ""
        : example.imageData;
      return Buffer.from(base64, "base64");
    }
  } catch (error) {
    console.warn(`Failed to load image for example ${example.id}`, error);
  }
  return null;
}

async function computeSlotEmbeddings(img512: ImageDataLike, mask: Uint8Array): Promise<Record<SlotKey, number[]>> {
  const { boxes } = await locateSlots(img512, mask);
  const slotEmbeddings: Record<SlotKey, number[]> = {} as Record<SlotKey, number[]>;
  for (const slot of SLOTS) {
    const patch = crop(img512, boxes[slot]);
    slotEmbeddings[slot] = await clipEmbedding(patch);
  }
  return slotEmbeddings;
}

function fingerprintExample(example: LookGenerationExample): string {
  const hash = createHash("sha1");
  hash.update(example.id ?? "");

  if (example.absoluteImagePath) {
    hash.update(`abs:${example.absoluteImagePath}`);
    try {
      const stats = fs.statSync(example.absoluteImagePath);
      hash.update(`:${stats.size}:${stats.mtimeMs}`);
    } catch (error) {
      console.warn(`Unable to stat image for fingerprint ${example.id}`, error);
    }
  }

  if (example.imageData) {
    const base64 = example.imageData.startsWith("data:")
      ? example.imageData.split(",").pop() ?? ""
      : example.imageData;
    hash.update(`data:${base64.length}`);
    hash.update(base64);
  }

  if (example.classLabel) {
    hash.update(`class:${example.classLabel}`);
  }
  if (example.gender) {
    hash.update(`gender:${example.gender}`);
  }

  if (Array.isArray(example.colors) && example.colors.length) {
    hash.update(`colors:${example.colors.join(",")}`);
  }

  const itemEntries = Object.entries(example.items ?? {}).sort(([a], [b]) => a.localeCompare(b));
  itemEntries.forEach(([slot, itemId]) => {
    hash.update(`item:${slot}:${itemId}`);
  });

  try {
    hash.update(JSON.stringify(example.meta ?? {}));
  } catch (error) {
    console.warn(`Failed to serialize metadata for fingerprint ${example.id}`, error);
  }

  return hash.digest("hex");
}

function saveIndex(index: VisionIndex, indexPath: string): void {
  try {
    ensureDir(indexPath);
    fs.writeFileSync(indexPath, JSON.stringify(index));
  } catch (error) {
    console.warn("Failed to persist vision index", error);
  }
}

function loadIndex(indexPath: string): VisionIndex | null {
  try {
    if (fs.existsSync(indexPath)) {
      const raw = fs.readFileSync(indexPath, "utf8");
      if (!raw.trim()) {
        return null;
      }
      return JSON.parse(raw) as VisionIndex;
    }
  } catch (error) {
    console.warn("Failed to load vision index", error);
  }
  return null;
}

export async function buildVisionIndexFromGenerations(options: BuildVisionIndexOptions = {}): Promise<VisionIndex> {
  const datasetPath = options.datasetPath ?? path.join(process.cwd(), ".cache", "generations");
  const indexPath = options.indexPath ?? DEFAULT_INDEX_PATH;
  const progressPath = options.progressPath;

  let previousIndex: VisionIndex | null = null;
  if (options.reuseExisting) {
    previousIndex = loadIndex(indexPath);
    if (previousIndex) {
      return previousIndex;
    }
  }
  if (!previousIndex) {
    previousIndex = loadIndex(indexPath);
  }

  const examples = loadGenerationDataset(datasetPath);
  const limit = options.limit && options.limit > 0 ? options.limit : undefined;
  const selected = limit ? examples.slice(0, limit) : examples;
  const existingEntries = new Map<string, VisionIndexEntry>();
  if (previousIndex) {
    previousIndex.entries.forEach((entry) => {
      existingEntries.set(entry.id, entry);
    });
  }

  const candidates = selected.map((example) => {
    const fingerprint = fingerprintExample(example);
    const existingEntry = existingEntries.get(example.id);
    const reusable = !!existingEntry && existingEntry.sourceFingerprint === fingerprint;
    return { example, fingerprint, existingEntry, reusable };
  });

  const reusedCount = candidates.filter((candidate) => candidate.reusable).length;
  const run = startTrainingProgress({
    datasetPath,
    indexPath,
    totalExamples: candidates.length,
    processedExamples: reusedCount,
    reusedExamples: reusedCount,
    newExamples: candidates.length - reusedCount,
    progressPath,
  });

  const entries: VisionIndexEntry[] = [];
  let runState = run;
  let processedCount = reusedCount;
  let failedCount = 0;

  if (reusedCount > 0) {
    runState =
      updateTrainingProgress(runState.id, {
        progressPath,
        message: `Réutilisation de ${reusedCount} exemple${reusedCount > 1 ? "s" : ""}`,
      }) ?? runState;
  }

  const meta = {
    datasetPath,
    datasetSize: examples.length,
    clipModel: process.env.VISION_CLIP_MODEL ?? "Xenova/clip-vit-base-patch32",
  } satisfies VisionIndexMeta;

  const persistIndex = (): void => {
    const partialIndex: VisionIndex = {
      updatedAt: Date.now(),
      entries: [...entries],
      meta,
    };
    saveIndex(partialIndex, indexPath);
  };

  try {
    for (const candidate of candidates) {
      if (candidate.reusable && candidate.existingEntry) {
        entries.push(candidate.existingEntry);
        continue;
      }

      const buffer = await loadExampleBuffer(candidate.example);
      if (!buffer) {
        failedCount += 1;
        processedCount += 1;
        runState =
          updateTrainingProgress(runState.id, {
            progressPath,
            processedExamples: processedCount,
            failedExamples: failedCount,
            lastExampleId: candidate.example.id,
            message: `Image introuvable pour ${candidate.example.id}`,
          }) ?? runState;
        continue;
      }

      try {
        const { img512, mask } = await normalizeInput(buffer);
        const embedding = await clipEmbedding(img512);
        const slotEmbeddings = await computeSlotEmbeddings(img512, mask);
        const entry: VisionIndexEntry = {
          id: candidate.example.id,
          embedding,
          slotEmbeddings,
          classLabel: candidate.example.classLabel ?? undefined,
          gender: candidate.example.gender ?? undefined,
          colors: candidate.example.colors,
          items: candidate.example.items,
          meta: candidate.example.meta,
          sourceFingerprint: candidate.fingerprint,
        };
        entries.push(entry);
        processedCount += 1;
        runState =
          updateTrainingProgress(runState.id, {
            progressPath,
            processedExamples: processedCount,
            failedExamples: failedCount,
            lastExampleId: candidate.example.id,
            message: `Traitement ${processedCount}/${candidates.length} (${candidate.example.id})`,
          }) ?? runState;
        persistIndex();
      } catch (error) {
        failedCount += 1;
        processedCount += 1;
        console.warn(`Failed to process example ${candidate.example.id}`, error);
        runState =
          updateTrainingProgress(runState.id, {
            progressPath,
            processedExamples: processedCount,
            failedExamples: failedCount,
            lastExampleId: candidate.example.id,
            message: `Erreur sur ${candidate.example.id}`,
          }) ?? runState;
      }
    }
  } catch (error) {
    console.warn("Unexpected error while building vision index", error);
    runState =
      updateTrainingProgress(runState.id, {
        progressPath,
        message: `Interruption inattendue: ${error instanceof Error ? error.message : String(error)}`,
      }) ?? runState;
    finishTrainingProgress(runState.id, "failed", {
      progressPath,
      message: runState.message ?? "Interruption inattendue",
    });
    throw error;
  }

  const totalExamples = candidates.length;
  processedCount = Math.max(processedCount, totalExamples);
  const summaryMessage = failedCount
    ? `Terminé avec ${failedCount} échec${failedCount > 1 ? "s" : ""}`
    : `Terminé (${totalExamples} exemple${totalExamples > 1 ? "s" : ""})`;

  runState =
    updateTrainingProgress(runState.id, {
      progressPath,
      processedExamples: processedCount,
      failedExamples: failedCount,
      message: summaryMessage,
    }) ?? runState;

  const index: VisionIndex = {
    updatedAt: Date.now(),
    entries,
    meta,
  };
  saveIndex(index, indexPath);
  finishTrainingProgress(runState.id, failedCount > 0 ? "failed" : "completed", {
    progressPath,
    message: summaryMessage,
  });
  return index;
}

let cachedIndex: VisionIndex | null = null;
let cachedIndexPath: string | null = null;

export async function loadVisionIndex(options: BuildVisionIndexOptions = {}): Promise<VisionIndex> {
  const indexPath = options.indexPath ?? DEFAULT_INDEX_PATH;
  if (cachedIndex && cachedIndexPath === indexPath) {
    return cachedIndex;
  }
  const existing = loadIndex(indexPath);
  if (existing) {
    cachedIndex = existing;
    cachedIndexPath = indexPath;
    return existing;
  }
  const built = await buildVisionIndexFromGenerations(options);
  cachedIndex = built;
  cachedIndexPath = indexPath;
  return built;
}

export function clearVisionIndexCache(): void {
  cachedIndex = null;
  cachedIndexPath = null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) {
    return 0;
  }
  return dot / Math.sqrt(normA * normB);
}

export function readVisionIndex(indexPath?: string): VisionIndex | null {
  return loadIndex(indexPath ?? DEFAULT_INDEX_PATH);
}
