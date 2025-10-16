import { FLAGS, K, SUGGESTION_COUNT, WEIGHTS_COLOR } from "../config/suggestions";
import { deltaE2000 } from "../colors/palette";
import { clipEmbedding, edgeSSIM } from "../vision/features";
import { queryIndex } from "./indexStore";
import type { Candidate, DofusPalette, FourSlot, ImageDataLike, Lab } from "../types";

function hexToLab(hex: string): Lab {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  const srgb = [r, g, b].map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [R, G, B] = srgb;
  const X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  const refX = 0.95047;
  const refY = 1;
  const refZ = 1.08883;
  const xyz = [X / refX, Y / refY, Z / refZ].map((value) =>
    value > 0.008856 ? value ** (1 / 3) : 7.787 * value + 16 / 116,
  );
  const [fx, fy, fz] = xyz;
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function normaliseDelta(delta: number): number {
  return Math.min(1, Math.max(0, delta / 100));
}

function paletteToLabs(palette: DofusPalette): Lab[] {
  return [palette.primary, palette.secondary, palette.tertiary].map(hexToLab);
}

function candidatePaletteLabs(candidate: { palette?: string[]; thumb?: string }): Lab[] | null {
  if (!candidate.palette || candidate.palette.length === 0) {
    return null;
  }
  return candidate.palette.map(hexToLab);
}

function averageDeltaE(a: Lab[], b: Lab[]): number {
  const length = Math.min(a.length, b.length);
  if (!length) {
    return 100;
  }
  let total = 0;
  for (let i = 0; i < length; i += 1) {
    total += deltaE2000(a[i], b[i]);
  }
  return total / length;
}

function limitCandidates<T>(candidates: T[]): T[] {
  if (candidates.length <= SUGGESTION_COUNT.max) {
    return candidates;
  }
  return candidates.slice(0, SUGGESTION_COUNT.max);
}

export async function colorModeSuggest(
  slot: FourSlot,
  patch: ImageDataLike,
  slotPalette: DofusPalette,
  kPool: number = K.colorPick,
): Promise<Candidate[]> {
  if (!FLAGS.enableColorMode) {
    return [];
  }
  const embedding = await clipEmbedding(patch);
  const pool = await queryIndex(slot, embedding, kPool);
  const paletteLabs = paletteToLabs(slotPalette);
  const suggestions: Candidate[] = [];
  for (const candidate of pool) {
    const labs = candidatePaletteLabs(candidate) ?? paletteLabs;
    const delta = averageDeltaE(paletteLabs, labs);
    const deltaNorm = normaliseDelta(delta);
    const colorScore = 1 - deltaNorm;
    const ssimEdges = edgeSSIM(patch, patch) * 0.8 + 0.2; // keep within 0-1 range
    const score = WEIGHTS_COLOR.color * colorScore + WEIGHTS_COLOR.edges * ssimEdges;
    suggestions.push({
      itemId: candidate.itemId,
      label: candidate.label,
      score,
      mode: "color",
      verified: false,
      thumb: candidate.thumb ?? candidate.sprite,
      setId: candidate.setId ?? undefined,
      reasons: {
        colorScore,
        ssimEdges,
        deltaE: delta,
      },
    });
  }
  suggestions.sort((a, b) => b.score - a.score);
  return limitCandidates(suggestions);
}
