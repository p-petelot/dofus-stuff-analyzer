import fs from "fs";
import path from "path";
import { loadGenerationDataset, type LookGenerationExample } from "./dataset";
import { clipEmbedding } from "./features";
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
  if (options.reuseExisting) {
    const cached = loadIndex(indexPath);
    if (cached) {
      return cached;
    }
  }
  const examples = loadGenerationDataset(datasetPath);
  const limit = options.limit && options.limit > 0 ? options.limit : undefined;
  const selected = limit ? examples.slice(0, limit) : examples;
  const entries: VisionIndexEntry[] = [];
  for (const example of selected) {
    const buffer = await loadExampleBuffer(example);
    if (!buffer) {
      continue;
    }
    try {
      const { img512, mask } = await normalizeInput(buffer);
      const embedding = await clipEmbedding(img512);
      const slotEmbeddings = await computeSlotEmbeddings(img512, mask);
      entries.push({
        id: example.id,
        embedding,
        slotEmbeddings,
        classLabel: example.classLabel ?? undefined,
        gender: example.gender ?? undefined,
        colors: example.colors,
        items: example.items,
        meta: example.meta,
      });
    } catch (error) {
      console.warn(`Failed to process example ${example.id}`, error);
    }
  }
  const index: VisionIndex = {
    updatedAt: Date.now(),
    entries,
    meta: {
      datasetPath,
      datasetSize: examples.length,
      clipModel: process.env.VISION_CLIP_MODEL ?? "Xenova/clip-vit-base-patch32",
    },
  };
  saveIndex(index, indexPath);
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
