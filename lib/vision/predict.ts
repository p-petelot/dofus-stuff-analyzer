import { SLOTS } from "../config/suggestions";
import type { SlotKey } from "../types";
import { clipEmbedding } from "./features";
import { loadVisionIndex, cosineSimilarity, type VisionIndex, type VisionIndexEntry } from "./index";
import { crop, locateSlots, normalizeInput } from "./preprocess";

export interface AttributeVote<T extends string | number> {
  label: T;
  weight: number;
  exampleId: string;
}

export interface SlotPrediction {
  itemId: number | null;
  score: number;
  candidates: AttributeVote<number>[];
}

export interface AttributePrediction {
  classLabel: string | null;
  classVotes: AttributeVote<string>[];
  gender: "m" | "f" | null;
  genderVotes: AttributeVote<"m" | "f">[];
  colors: string[];
  colorSources: AttributeVote<string>[];
  items: Record<SlotKey, SlotPrediction>;
  neighbors: AttributeVote<string>[];
}

export interface PredictAttributesOptions {
  index?: VisionIndex;
  indexPath?: string;
  datasetPath?: string;
  k?: number;
}

function weightedVotes<T extends string | number>(votes: AttributeVote<T>[]): AttributeVote<T>[] {
  const totals = new Map<T, { weight: number; exampleId: string }>();
  votes.forEach((vote) => {
    const existing = totals.get(vote.label);
    if (existing) {
      existing.weight += vote.weight;
    } else {
      totals.set(vote.label, { weight: vote.weight, exampleId: vote.exampleId });
    }
  });
  return Array.from(totals.entries())
    .map(([label, info]) => ({ label, weight: info.weight, exampleId: info.exampleId }))
    .sort((a, b) => b.weight - a.weight);
}

function selectTopColors(votes: AttributeVote<string>[], maxColors: number): string[] {
  return votes
    .slice(0, Math.max(1, maxColors))
    .map((vote) => vote.label.toUpperCase())
    .slice(0, maxColors);
}

function buildVotes(entries: { entry: VisionIndexEntry; score: number }[]): AttributeVote<string>[] {
  return entries.map(({ entry, score }) => ({ label: entry.id, weight: Math.max(score, 0), exampleId: entry.id }));
}

function resolveBestLabel<T extends string | number>(votes: AttributeVote<T>[]): T | null {
  if (!votes.length) {
    return null;
  }
  return weightedVotes(votes)[0]?.label ?? null;
}

function voteForAttribute<T extends string | number>(
  entries: { entry: VisionIndexEntry; score: number }[],
  extractor: (entry: VisionIndexEntry) => T | null | undefined,
): AttributeVote<T>[] {
  const votes: AttributeVote<T>[] = [];
  entries.forEach(({ entry, score }) => {
    const label = extractor(entry);
    if (label != null) {
      votes.push({ label, weight: Math.max(score, 0), exampleId: entry.id });
    }
  });
  return weightedVotes(votes);
}

function buildItemVotes(
  entries: { entry: VisionIndexEntry; score: number }[],
  slot: SlotKey,
): AttributeVote<number>[] {
  const votes: AttributeVote<number>[] = [];
  for (const { entry, score } of entries) {
    const itemId = entry.items[slot];
    if (itemId == null) {
      continue;
    }
    votes.push({ label: itemId, weight: Math.max(score, 0), exampleId: entry.id });
  }
  return weightedVotes(votes);
}

function buildColorVotes(entries: { entry: VisionIndexEntry; score: number }[]): AttributeVote<string>[] {
  const votes: AttributeVote<string>[] = [];
  entries.forEach(({ entry, score }) => {
    if (!entry.colors?.length) {
      return;
    }
    entry.colors.forEach((color, index) => {
      if (!color) {
        return;
      }
      const weight = Math.max(score * (1 - index * 0.1), 0.0001);
      votes.push({ label: color, weight, exampleId: entry.id });
    });
  });
  return weightedVotes(votes);
}

function bestCandidate<T extends string | number>(votes: AttributeVote<T>[]): AttributeVote<T> | null {
  return votes.length ? votes[0] : null;
}

async function ensureIndex(options: PredictAttributesOptions): Promise<VisionIndex> {
  if (options.index) {
    return options.index;
  }
  return loadVisionIndex({ indexPath: options.indexPath, datasetPath: options.datasetPath });
}

function topNeighbors(
  index: VisionIndex,
  embedding: number[],
  k: number,
  predicate?: (entry: VisionIndexEntry) => boolean,
): { entry: VisionIndexEntry; score: number }[] {
  const results: { entry: VisionIndexEntry; score: number }[] = [];
  for (const entry of index.entries) {
    if (predicate && !predicate(entry)) {
      continue;
    }
    const score = cosineSimilarity(embedding, entry.embedding);
    if (!Number.isFinite(score) || score <= 0) {
      continue;
    }
    results.push({ entry, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.max(1, k));
}

function topSlotNeighbors(
  index: VisionIndex,
  slot: SlotKey,
  embedding: number[],
  k: number,
): { entry: VisionIndexEntry; score: number }[] {
  const results: { entry: VisionIndexEntry; score: number }[] = [];
  for (const entry of index.entries) {
    const slotEmbedding = entry.slotEmbeddings[slot];
    if (!slotEmbedding?.length) {
      continue;
    }
    const score = cosineSimilarity(embedding, slotEmbedding);
    if (!Number.isFinite(score) || score <= 0) {
      continue;
    }
    results.push({ entry, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.max(1, k));
}

export async function predictLookAttributes(
  image: Buffer | string,
  options: PredictAttributesOptions = {},
): Promise<AttributePrediction> {
  const index = await ensureIndex(options);
  const k = Math.max(1, options.k ?? 5);
  if (!index.entries.length) {
    return {
      classLabel: null,
      classVotes: [],
      gender: null,
      genderVotes: [],
      colors: [],
      colorSources: [],
      items: Object.fromEntries(SLOTS.map((slot) => [slot, { itemId: null, score: 0, candidates: [] }])) as Record<SlotKey, SlotPrediction>,
      neighbors: [],
    };
  }

  const { img512, mask } = await normalizeInput(image);
  const globalEmbedding = await clipEmbedding(img512);
  const { boxes } = await locateSlots(img512, mask);

  const neighborEntries = topNeighbors(index, globalEmbedding, k);
  const classVotes = voteForAttribute(neighborEntries, (entry) => entry.classLabel ?? null);
  const genderVotes = voteForAttribute(neighborEntries, (entry) => entry.gender ?? null);
  const colorVotes = buildColorVotes(neighborEntries);

  const items: Record<SlotKey, SlotPrediction> = {} as Record<SlotKey, SlotPrediction>;
  for (const slot of SLOTS) {
    const patch = crop(img512, boxes[slot]);
    const slotEmbedding = await clipEmbedding(patch);
    const slotNeighbors = topSlotNeighbors(index, slot, slotEmbedding, k);
    const votes = buildItemVotes(slotNeighbors, slot);
    const topVote = bestCandidate(votes);
    items[slot] = {
      itemId: topVote ? topVote.label : null,
      score: topVote ? topVote.weight : 0,
      candidates: votes,
    };
  }

  return {
    classLabel: resolveBestLabel(classVotes) ?? null,
    classVotes,
    gender: resolveBestLabel(genderVotes) as "m" | "f" | null,
    genderVotes,
    colors: selectTopColors(colorVotes, Math.min(6, k * 2)),
    colorSources: colorVotes,
    items,
    neighbors: buildVotes(neighborEntries),
  };
}
