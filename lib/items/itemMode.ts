import { ITEM_THRESH, K, SUGGESTION_COUNT, WEIGHTS_ITEM } from "../config/suggestions";
import { clipEmbedding, edgeSSIM, orbMatch, poseAlign, silhouetteChamfer } from "../vision/features";
import { queryIndex } from "./indexStore";
import { renderCandidateTemplate } from "./templateImage";
import type { Candidate, ImageDataLike, SlotKey } from "../types";

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

function limitCandidates<T>(candidates: T[]): T[] {
  if (candidates.length <= SUGGESTION_COUNT.max) {
    return candidates;
  }
  return candidates.slice(0, SUGGESTION_COUNT.max);
}

/**
 * Try to confirm that an actual catalogue item is present in the slot patch.
 * Returns only verified candidates that satisfied all structural thresholds.
 */
export async function itemModeSuggest(
  slot: SlotKey,
  patch: ImageDataLike,
  k: number = K.retrieval,
): Promise<Candidate[]> {
  const embedding = await clipEmbedding(patch);
  const indexCandidates = await queryIndex(slot, embedding, k);
  const verified: Candidate[] = [];
  for (const candidate of indexCandidates) {
    const template = renderCandidateTemplate(candidate, patch);
    const orbResult = await orbMatch(patch, template);
    if (orbResult.inliers < 12) {
      continue;
    }
    const pose = await poseAlign(patch, template);
    if (!pose.ok) {
      continue;
    }
    const clipScore = cosineSimilarity(embedding, candidate.embedding);
    const orbRatio = orbResult.ratio;
    const ssimScore = edgeSSIM(pose.alignedPatch, pose.alignedTemplate);
    const chamfer = silhouetteChamfer(pose.alignedPatch, pose.alignedTemplate);
    const thresholds = ITEM_THRESH[slot];
    const passClip = clipScore >= thresholds.clip;
    const passOrb = orbRatio >= thresholds.orb;
    const passSsim = ssimScore >= thresholds.ssim;
    const passChamfer = chamfer <= thresholds.chamfer;
    const structuralPasses = [passOrb, passSsim, passChamfer].filter(Boolean).length;
    if (!passClip || structuralPasses < 2) {
      continue;
    }
    const shape = (1 - chamfer + ssimScore) / 2;
    const isColorable = candidate.tags?.includes("colorable") ?? false;
    const score =
      WEIGHTS_ITEM.clip * clipScore +
      WEIGHTS_ITEM.orb * orbRatio +
      WEIGHTS_ITEM.ssim * ssimScore +
      WEIGHTS_ITEM.shape * shape;
    verified.push({
      itemId: candidate.itemId,
      label: candidate.label,
      score,
      mode: "item",
      verified: true,
      thumb: candidate.thumb ?? candidate.sprite,
      setId: candidate.setId ?? undefined,
      isColorable,
      reasons: {
        clip: clipScore,
        orb: orbRatio,
        ssim: ssimScore,
        chamfer,
        poseAligned: pose.ok,
      },
    });
    if (verified.length >= SUGGESTION_COUNT.max) {
      break;
    }
  }
  verified.sort((a, b) => b.score - a.score);
  return limitCandidates(verified);
}
