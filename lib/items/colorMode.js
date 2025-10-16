import { FLAGS, K, SUGGESTION_COUNT } from "../config/suggestions";
import { clipEmbedding } from "../vision/features";
import { queryIndex } from "./indexStore";
import { deltaE2000, rgbToLab } from "../colors/palette";

/** @typedef {import("../types").Candidate} Candidate */
/** @typedef {import("../types").FourSlot} FourSlot */
/** @typedef {import("../types").ImageDataLike} ImageDataLike */
/** @typedef {import("../types").DofusPalette} DofusPalette */

function dot(a, b) {
  const length = Math.min(a?.length ?? 0, b?.length ?? 0);
  if (!length) return 0;
  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += a[i] * b[i];
  }
  return sum;
}

function paletteDelta(candidate, palette) {
  if (!candidate.palette || !candidate.palette.length) return 60;
  const reference = [palette.primary, palette.secondary, palette.tertiary].map((hex) => rgbToLabFromHex(hex));
  let total = 0;
  let count = 0;
  for (const swatch of candidate.palette) {
    if (!/^#?[0-9a-fA-F]{6}$/.test(swatch)) continue;
    const lab = rgbToLabFromHex(swatch.startsWith("#") ? swatch : `#${swatch}`);
    let best = Infinity;
    for (const ref of reference) {
      const delta = deltaE2000(lab, ref);
      if (delta < best) best = delta;
    }
    if (best < Infinity) {
      total += best;
      count += 1;
    }
  }
  return count ? total / count : 60;
}

function rgbToLabFromHex(hex) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return rgbToLab(r, g, b);
}

/**
 * Suggest items based on palette similarity when item confirmation fails.
 * @param {FourSlot} slot
 * @param {ImageDataLike} patch
 * @param {DofusPalette} palette
 * @returns {Promise<{ suggestions: Candidate[]; confidence: number; notes: string[] }>}
 */
export async function runColorMode(slot, patch, palette) {
  if (!FLAGS.enableColorMode) {
    return { suggestions: [], confidence: 0, notes: ["Mode COULEUR désactivé"] };
  }
  const embedding = await clipEmbedding(patch);
  const pool = await queryIndex(slot, embedding, K.colorPick);
  const suggestions = [];
  for (const ref of pool) {
    const delta = paletteDelta(ref, palette);
    const colorScore = Math.max(0, Math.min(1, 1 - delta / 100));
    const edgeScore = Math.max(0, Math.min(1, (dot(embedding, ref.embedding) + 1) / 2));
    const score = 0.8 * colorScore + 0.2 * edgeScore;
    suggestions.push({
      itemId: ref.itemId,
      label: ref.label,
      thumb: ref.thumb,
      score,
      mode: "color",
      verified: false,
      reasons: { colorScore, ssimEdges: edgeScore, deltaE: delta },
      setId: ref.setId ?? null,
      palette: ref.palette,
    });
  }
  suggestions.sort((a, b) => b.score - a.score);
  return {
    suggestions: suggestions.slice(0, SUGGESTION_COUNT.max),
    confidence: suggestions[0]?.reasons?.colorScore ?? 0,
    notes: ["Mode COULEUR actif (ΔE minimisé)"]
  };
}
