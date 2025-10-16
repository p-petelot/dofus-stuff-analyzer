import fs from "fs/promises";
import path from "path";
import { MAX_CACHE_SIZE, K, SLOTS } from "../config/suggestions";

/** @typedef {import("../types").CandidateRef} CandidateRef */
/** @typedef {import("../types").FourSlot} FourSlot */
/** @typedef {import("../types").ItemIndex} ItemIndex */
/** @typedef {import("../types").ItemMeta} ItemMeta */

const INDEX_PATH = path.join(process.cwd(), ".cache", "item-index.json");

/** @typedef {{ timestamp: number; results: CandidateRef[] }} CachedResult */

const queryCache = new Map();

/** @type {Object.<FourSlot, ItemMeta[]>} */
const DEFAULT_ITEMS = {
  coiffe: [
    {
      id: 12424,
      label: "Coiffe Boréale",
      slot: "coiffe",
      setId: 502,
      palette: ["#E8C380", "#4C6074", "#2A1E10"],
    },
    {
      id: 11011,
      label: "Masque du Kami",
      slot: "coiffe",
      setId: 351,
      palette: ["#F6E3C3", "#6D3829", "#B58B52"],
    },
    {
      id: 10098,
      label: "Coiffe du Meulou",
      slot: "coiffe",
      setId: 101,
      palette: ["#9C4E3F", "#C9B497", "#2F1B17"],
    },
  ],
  cape: [
    {
      id: 15015,
      label: "Cape Boréale",
      slot: "cape",
      setId: 502,
      palette: ["#E1C082", "#395268", "#1B1F24"],
    },
    {
      id: 13912,
      label: "Cape de Korbax",
      slot: "cape",
      setId: 351,
      palette: ["#F9E5CB", "#67302A", "#8F6C45"],
    },
    {
      id: 11020,
      label: "Cape du Meulou",
      slot: "cape",
      setId: 101,
      palette: ["#9A4F3F", "#CAB69A", "#2D1914"],
    },
  ],
  bouclier: [
    {
      id: 20080,
      label: "Bouclier Ventaille",
      slot: "bouclier",
      setId: 810,
      palette: ["#F6D8A5", "#5A3F2F", "#222220"],
    },
    {
      id: 20145,
      label: "Bouclier de l'Aurore Pourpre",
      slot: "bouclier",
      setId: 351,
      palette: ["#F2C9C3", "#4D2A26", "#8B4A41"],
    },
    {
      id: 20002,
      label: "Bouclier du Meulou",
      slot: "bouclier",
      setId: 101,
      palette: ["#A25442", "#D8C5A8", "#311A14"],
    },
  ],
  familier: [
    {
      id: 30011,
      label: "Dragoune Dorée",
      slot: "familier",
      palette: ["#F0C75E", "#593514", "#8D531F"],
    },
    {
      id: 30045,
      label: "Minifoux",
      slot: "familier",
      palette: ["#F8E9CD", "#543B27", "#A57852"],
    },
    {
      id: 30089,
      label: "Chacha Angora",
      slot: "familier",
      palette: ["#F0E4D2", "#5A4A42", "#1C1713"],
    },
  ],
};

/** @type {ItemIndex | null} */
let currentIndex = null;

function ensureCacheLimit() {
  if (queryCache.size <= MAX_CACHE_SIZE) {
    return;
  }
  const entries = Array.from(queryCache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
  while (entries.length > MAX_CACHE_SIZE) {
    const entry = entries.shift();
    if (!entry) {
      break;
    }
    const [key] = entry;
    queryCache.delete(key);
  }
}

/**
 * @param {number[]} vector
 * @returns {number[]}
 */
function normalizeVector(vector) {
  const sumSquares = vector.reduce((acc, value) => acc + value * value, 0);
  if (sumSquares <= 0) {
    return vector.map(() => 0);
  }
  const norm = Math.sqrt(sumSquares);
  return vector.map((value) => value / norm);
}

/**
 * @param {string} text
 * @param {number} [dimensions=32]
 * @returns {number[]}
 */
function textEmbedding(text, dimensions = 32) {
  const vector = new Array(dimensions).fill(0);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    const index = i % dimensions;
    vector[index] += (code % 64) / 64;
  }
  return normalizeVector(vector);
}

/**
 * @param {ItemMeta} meta
 * @returns {CandidateRef}
 */
function candidateFromMeta(meta) {
  const embedding = meta.embedding ? normalizeVector(meta.embedding) : textEmbedding(meta.label ?? `${meta.id}`);
  return {
    itemId: meta.id,
    slot: meta.slot,
    label: meta.label,
    embedding,
    setId: meta.setId ?? null,
    palette: meta.palette,
    thumb: meta.thumb,
  };
}

/**
 * @param {ItemIndex} index
 */
async function persistIndex(index) {
  try {
    await fs.mkdir(path.dirname(INDEX_PATH), { recursive: true });
    await fs.writeFile(INDEX_PATH, JSON.stringify(index), "utf-8");
  } catch (error) {
    console.warn("Unable to persist item index", error);
  }
}

/**
 * @returns {Promise<ItemIndex | null>}
 */
async function loadIndexFromDisk() {
  try {
    const raw = await fs.readFile(INDEX_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    for (const slot of SLOTS) {
      parsed.items[slot] = (parsed.items[slot] ?? []).map((entry) => ({
        ...entry,
        embedding: normalizeVector(entry.embedding ?? textEmbedding(entry.label)),
      }));
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

/**
 * @param {Object.<FourSlot, ItemMeta[]>} itemsBySlot
 * @returns {ItemIndex}
 */
function createIndex(itemsBySlot) {
  /** @type {Object.<FourSlot, CandidateRef[]>} */
  const items = {
    coiffe: [],
    cape: [],
    bouclier: [],
    familier: [],
  };
  for (const slot of SLOTS) {
    items[slot] = (itemsBySlot[slot] ?? []).map(candidateFromMeta);
  }
  return {
    updatedAt: Date.now(),
    items,
  };
}

/**
 * @returns {Promise<ItemIndex>}
 */
async function ensureIndex() {
  if (currentIndex) {
    return currentIndex;
  }
  const stored = await loadIndexFromDisk();
  if (stored) {
    currentIndex = stored;
    return stored;
  }
  const fallback = createIndex(DEFAULT_ITEMS);
  currentIndex = fallback;
  await persistIndex(fallback);
  return fallback;
}

/**
 * @param {Object.<FourSlot, ItemMeta[]>} itemsBySlot
 * @returns {Promise<ItemIndex>}
 */
export async function buildItemIndex(itemsBySlot) {
  const index = createIndex(itemsBySlot);
  currentIndex = index;
  await persistIndex(index);
  return index;
}

/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
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
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * @param {FourSlot} slot
 * @param {number[]} embedding
 * @returns {string}
 */
function cacheKey(slot, embedding) {
  return `${slot}:${embedding.map((value) => value.toFixed(3)).join(",")}`;
}

/**
 * @param {FourSlot} slot
 * @param {number[]} embedding
 * @param {number} [k=K.retrieval]
 * @returns {Promise<CandidateRef[]>}
 */
export async function queryIndex(slot, embedding, k = K.retrieval) {
  const normalizedEmbedding = normalizeVector(embedding);
  const key = cacheKey(slot, normalizedEmbedding);
  const cached = queryCache.get(key);
  if (cached) {
    cached.timestamp = Date.now();
    return cached.results.slice(0, k);
  }

  const index = await ensureIndex();
  const candidates = index.items[slot] ?? [];
  const scored = candidates
    .map((candidate) => ({ candidate, score: cosineSimilarity(normalizedEmbedding, candidate.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(k, candidates.length))
    .map(({ candidate }) => candidate);

  queryCache.set(key, { timestamp: Date.now(), results: scored });
  ensureCacheLimit();
  return scored;
}
