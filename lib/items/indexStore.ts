import fs from "fs";
import path from "path";
import { DEFAULT_IMAGE_SIZE, SLOTS } from "../config/suggestions";
import type { CandidateRef, FourSlot, ItemIndex, ItemMeta } from "../types";

const CACHE_PATH = path.join(process.cwd(), ".cache", "items-index-4slots.json");

let indexCache: ItemIndex | null = null;

function ensureCacheDir(): void {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function normalizeEmbedding(source?: number[], seed?: string): number[] {
  if (source && source.length) {
    return source;
  }
  const vector: number[] = [];
  const base = seed ?? "unknown";
  for (let i = 0; i < 12; i += 1) {
    const char = base.charCodeAt(i % base.length) ?? 0;
    vector.push(((char % 97) + i) / 100);
  }
  return vector;
}

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += Math.pow(a[i], 2);
    normB += Math.pow(b[i], 2);
  }
  if (!normA || !normB) return 0;
  return dot / Math.sqrt(normA * normB);
}

function defaultSprite(): string {
  return `/api/static/sprites/placeholder-${DEFAULT_IMAGE_SIZE}.png`;
}

function convertItem(meta: ItemMeta): CandidateRef {
  const embedding = normalizeEmbedding(meta.embedding, `${meta.id}-${meta.label}`);
  return {
    itemId: meta.id,
    slot: meta.slot,
    label: meta.label,
    embedding,
    setId: meta.setId ?? undefined,
    tags: meta.tags ?? [],
    palette: meta.palette ?? [],
    thumb: meta.thumb,
    sprite: meta.sprite ?? defaultSprite(),
  };
}

function loadIndexFromDisk(): ItemIndex | null {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw = fs.readFileSync(CACHE_PATH, "utf8");
      const parsed = JSON.parse(raw) as ItemIndex;
      return parsed;
    }
  } catch (error) {
    console.warn("Failed to load item index", error);
  }
  return null;
}

function saveIndex(index: ItemIndex): void {
  try {
    ensureCacheDir();
    fs.writeFileSync(CACHE_PATH, JSON.stringify(index));
  } catch (error) {
    console.warn("Failed to persist item index", error);
  }
}

export async function buildItemIndex(itemsBySlot: Record<FourSlot, ItemMeta[]>): Promise<ItemIndex> {
  const items: Record<FourSlot, CandidateRef[]> = {
    coiffe: [],
    cape: [],
    bouclier: [],
    familier: [],
  };
  for (const slot of SLOTS) {
    const metas = itemsBySlot[slot] ?? [];
    items[slot] = metas.map(convertItem);
  }
  const index: ItemIndex = { updatedAt: Date.now(), items };
  indexCache = index;
  saveIndex(index);
  return index;
}

function requireIndex(): ItemIndex {
  if (indexCache) {
    return indexCache;
  }
  const loaded = loadIndexFromDisk();
  if (loaded) {
    indexCache = loaded;
    return loaded;
  }
  const empty: ItemIndex = {
    updatedAt: Date.now(),
    items: {
      coiffe: [],
      cape: [],
      bouclier: [],
      familier: [],
    },
  };
  indexCache = empty;
  return empty;
}

export async function queryIndex(
  slot: FourSlot,
  embedding: number[],
  k: number,
): Promise<CandidateRef[]> {
  const index = requireIndex();
  const entries = index.items[slot] ?? [];
  if (!entries.length) {
    return [];
  }
  const scored = entries.map((entry) => ({
    entry,
    score: cosineSimilarity(entry.embedding, embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, Math.max(k, 1)).map(({ entry }) => entry);
}

// Warm the index cache immediately when possible.
(function bootstrap() {
  try {
    requireIndex();
  } catch (error) {
    console.warn("index bootstrap failed", error);
  }
})();
