import { SCORE_WEIGHTS } from "../config/suggestions";

/** @typedef {import("../types").ImageDataLike} ImageDataLike */

const DEFAULT_DIM = 32;

function normalize(vector) {
  const norm = Math.sqrt(vector.reduce((acc, value) => acc + value * value, 0));
  if (!norm) return vector.map(() => 0);
  return vector.map((value) => value / norm);
}

function embeddingFromPatch(patch) {
  const vector = new Array(DEFAULT_DIM).fill(0);
  if (!patch || !patch.data) return vector;
  const channelCount = Math.min(patch.data.length / 4, 1024);
  for (let i = 0; i < channelCount; i += 1) {
    const base = i * 4;
    const r = patch.data[base];
    const g = patch.data[base + 1];
    const b = patch.data[base + 2];
    const luminance = 0.3 * r + 0.59 * g + 0.11 * b;
    const index = i % DEFAULT_DIM;
    vector[index] += (luminance / 255 - 0.5) * 0.5;
  }
  return normalize(vector);
}

/**
 * Lightweight CLIP-like embedding computed from pixel statistics.
 * @param {ImageDataLike} patch
 * @returns {Promise<number[]>}
 */
export async function clipEmbedding(patch) {
  return embeddingFromPatch(patch);
}

function dot(a, b) {
  const length = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Estimate an ORB-like match ratio via cosine similarity between embeddings.
 * @param {ImageDataLike} patch
 * @param {{ embedding?: number[] }} template
 * @returns {{ ratio: number; inliers: number }}
 */
export function orbMatch(patch, template) {
  const a = embeddingFromPatch(patch);
  const b = normalize(template?.embedding ?? []);
  const similarity = b.length ? dot(a, b) : 0.2;
  const ratio = Math.max(0, Math.min(1, (similarity + 1) / 2));
  const inliers = Math.round(ratio * 120);
  return { ratio, inliers };
}

/**
 * Edge-based SSIM approximation using embedding distance.
 * @param {ImageDataLike} patch
 * @param {{ embedding?: number[] }} template
 * @returns {number}
 */
export function edgeSSIM(patch, template) {
  const a = embeddingFromPatch(patch);
  const b = normalize(template?.embedding ?? []);
  if (!b.length) return 0.4;
  const similarity = dot(a, b);
  return Math.max(0, Math.min(1, (similarity + 1) / 2));
}

/**
 * Approximate silhouette distance as an inverse of edge similarity.
 * @param {ImageDataLike} patch
 * @param {{ embedding?: number[] }} template
 * @returns {number}
 */
export function silhouetteChamfer(patch, template) {
  const ssim = edgeSSIM(patch, template);
  return Math.max(0, 1 - ssim);
}

/**
 * Coarse pose alignment heuristic. For now we simply validate similarity.
 * @param {ImageDataLike} patch
 * @param {{ embedding?: number[] }} template
 * @returns {{ ok: boolean; alignedPatch: ImageDataLike; alignedTemplate: { embedding?: number[] } }}
 */
export function poseAlign(patch, template) {
  const { ratio } = orbMatch(patch, template);
  return { ok: ratio >= 0.45, alignedPatch: patch, alignedTemplate: template };
}

/**
 * Combine structural metrics into a shape score when some metrics are unavailable.
 * @param {{ clip?: number; orb?: number; ssim?: number; chamfer?: number }} metrics
 * @returns {number}
 */
export function normalizeScore(metrics) {
  const weights = { ...SCORE_WEIGHTS };
  const active = Object.entries(metrics)
    .filter(([, value]) => Number.isFinite(value))
    .map(([key, value]) => [key, value]);
  const missing = Object.keys(weights).filter((key) => !active.some(([name]) => name === key));
  const sumWeights = active.reduce((acc, [key]) => acc + (weights[key] ?? 0), 0);
  if (!sumWeights) return 0;
  const renorm = 1 / sumWeights;
  let score = 0;
  for (const [key, value] of active) {
    score += (weights[key] ?? 0) * value;
  }
  score *= renorm;
  if (missing.length) {
    // distribute missing weight evenly on available metrics
    const missingSum = missing.reduce((acc, key) => acc + (weights[key] ?? 0), 0);
    score *= 1 + missingSum / sumWeights;
  }
  return Math.max(0, Math.min(1, score));
}
