import { ITEM_THRESH, K, SUGGESTION_COUNT, WEIGHTS_ITEM } from "../config/suggestions";
import { clipEmbedding, edgeSSIM, orbMatch, poseAlign, silhouetteChamfer } from "../vision/features";
import { queryIndex } from "./indexStore";
import type { Candidate, FourSlot, ImageDataLike } from "../types";

function cosineSimilarity(a: number[], b: number[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
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
  slot: FourSlot,
  patch: ImageDataLike,
  k: number = K.retrieval,
): Promise<Candidate[]> {
  const embedding = await clipEmbedding(patch);
  const indexCandidates = await queryIndex(slot, embedding, k);
  const verified: Candidate[] = [];
  for (const candidate of indexCandidates) {
    const pose = await poseAlign(patch, patch);
    if (!pose.ok) {
      continue;
    }
    const clipScore = cosineSimilarity(embedding, candidate.embedding);
    const { ratio: orbRatio } = await orbMatch(patch, pose.alignedPatch);
    const ssimScore = edgeSSIM(patch, pose.alignedPatch);
    const chamfer = silhouetteChamfer(patch, pose.alignedPatch);
    const thresholds = ITEM_THRESH[slot];
    const passClip = clipScore >= thresholds.clip;
    const passOrb = orbRatio >= thresholds.orb;
    const passSsim = ssimScore >= thresholds.ssim;
    const passChamfer = chamfer <= thresholds.chamfer;
    const structuralPasses = [passOrb, passSsim, passChamfer].filter(Boolean).length >= 2;
    if (!(passClip && passOrb && passSsim && passChamfer && structuralPasses)) {
      continue;
    }
    const shape = (1 - chamfer + ssimScore) / 2;
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
      reasons: {
        clip: clipScore,
        orb: orbRatio,
        ssim: ssimScore,
        chamfer,
        poseAligned: true,
      },
    });
    if (verified.length >= SUGGESTION_COUNT.max) {
      break;
    }
  }
  verified.sort((a, b) => b.score - a.score);
  return limitCandidates(verified);
}
