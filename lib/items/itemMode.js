import { FLAGS, HARD_CHECKS, ITEM_THRESH, K, SUGGESTION_COUNT } from "../config/suggestions";
import { clipEmbedding, edgeSSIM, orbMatch, poseAlign, silhouetteChamfer } from "../vision/features";
import { queryIndex } from "./indexStore";
import { scoreCandidate } from "./rerank";

/** @typedef {import("../types").Candidate} Candidate */
/** @typedef {import("../types").CandidateRef} CandidateRef */
/** @typedef {import("../types").FourSlot} FourSlot */
/** @typedef {import("../types").ImageDataLike} ImageDataLike */
/** @typedef {import("../types").SetRules} SetRules */

function structuralPasses(slot, metrics) {
  const thresholds = ITEM_THRESH[slot];
  const checks = [
    metrics.orb >= thresholds.orb,
    metrics.ssim >= thresholds.ssim,
    metrics.chamfer <= thresholds.chamfer,
  ];
  const passed = checks.filter(Boolean).length;
  return !HARD_CHECKS.require2of3 || passed >= 2;
}

function buildCandidate(slot, ref, metrics) {
  const score = scoreCandidate(metrics);
  return {
    itemId: ref.itemId,
    label: ref.label,
    thumb: ref.thumb,
    score,
    mode: "item",
    verified: true,
    reasons: { ...metrics, poseAligned: metrics.poseAligned },
    setId: ref.setId ?? null,
    palette: ref.palette,
  };
}

function metricsFor(slot, patchEmbedding, patch, ref) {
  const { ok: aligned, alignedPatch, alignedTemplate } = poseAlign(patch, ref);
  if (!aligned) {
    return { poseAligned: false, clip: 0, orb: 0, ssim: 0, chamfer: 1 };
  }
  const clip = Math.max(0, Math.min(1, patchEmbedding && ref.embedding ? dot(patchEmbedding, ref.embedding) : 0.5));
  const { ratio: orb } = orbMatch(alignedPatch, alignedTemplate);
  const ssim = edgeSSIM(alignedPatch, alignedTemplate);
  const chamfer = silhouetteChamfer(alignedPatch, alignedTemplate);
  return { poseAligned: true, clip, orb, ssim, chamfer };
}

function dot(a, b) {
  const length = Math.min(a?.length ?? 0, b?.length ?? 0);
  if (!length) return 0;
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Attempt to confirm that the actual item is present in the provided patch.
 * @param {FourSlot} slot
 * @param {ImageDataLike} patch
 * @param {SetRules} rules
 * @returns {Promise<{ confirmed: Candidate[]; confidence: number; notes: string[] }>} 
 */
export async function runItemMode(slot, patch, rules) {
  if (!FLAGS.enableItemMode) {
    return { confirmed: [], confidence: 0, notes: ["Mode ITEM désactivé"] };
  }
  const patchEmbedding = await clipEmbedding(patch);
  const pool = await queryIndex(slot, patchEmbedding, K.retrieval);
  const thresholds = ITEM_THRESH[slot];
  const confirmed = [];
  for (const ref of pool) {
    const metrics = metricsFor(slot, patchEmbedding, patch, ref);
    if (metrics.clip < thresholds.clip) continue;
    if (!structuralPasses(slot, metrics)) continue;
    if (metrics.chamfer > thresholds.chamfer) continue;
    const candidate = buildCandidate(slot, ref, metrics);
    if (candidate.score < thresholds.final) {
      continue;
    }
    confirmed.push(candidate);
    if (confirmed.length >= SUGGESTION_COUNT.max) {
      break;
    }
  }
  const notes = [];
  if (!confirmed.length) {
    notes.push("Aucun item confirmé : bascule en mode COULEUR");
    return { confirmed: [], confidence: 0, notes };
  }
  confirmed.sort((a, b) => b.score - a.score);
  const confidence = confirmed[0]?.score ?? 0;
  if (confidence < thresholds.final) {
    notes.push("Scores ITEM sous le seuil final → fallback COULEUR");
    return { confirmed: [], confidence: 0, notes };
  }
  return { confirmed, confidence, notes: ["Mode ITEM activé (checks structurels validés)"] };
}
