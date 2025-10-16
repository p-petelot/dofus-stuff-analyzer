import { BONUS, SUGGESTION_COUNT } from "../config/suggestions";
import { deltaE2000 } from "../colors/palette";
import type { Candidate, DofusPalette, FourSlot } from "../types";

function hexToLab(hex: string) {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  const srgb = [r, g, b].map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const [R, G, B] = srgb;
  const X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  const refX = 0.95047;
  const refY = 1;
  const refZ = 1.08883;
  const xyz = [X / refX, Y / refY, Z / refZ].map((value) =>
    value > 0.008856 ? Math.pow(value, 1 / 3) : 7.787 * value + 16 / 116,
  );
  const [fx, fy, fz] = xyz;
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function cloneCandidate(candidate: Candidate): Candidate {
  return { ...candidate, reasons: { ...candidate.reasons } };
}

export function nmsSilhouette(candidates: Candidate[]): Candidate[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const seen = new Set<number>();
  const result: Candidate[] = [];
  for (const candidate of sorted) {
    if (seen.has(candidate.itemId)) {
      continue;
    }
    seen.add(candidate.itemId);
    result.push(candidate);
    if (result.length >= SUGGESTION_COUNT.max) {
      break;
    }
  }
  return result;
}

export function applySetBonus(
  slots: Record<FourSlot, Candidate[]>,
  paletteBySlot: Record<FourSlot, DofusPalette>,
): Record<FourSlot, Candidate[]> {
  const result: Record<FourSlot, Candidate[]> = {
    coiffe: slots.coiffe?.map(cloneCandidate) ?? [],
    cape: slots.cape?.map(cloneCandidate) ?? [],
    bouclier: slots.bouclier?.map(cloneCandidate) ?? [],
    familier: slots.familier?.map(cloneCandidate) ?? [],
  };
  const coiffe = result.coiffe;
  const cape = result.cape;
  if (!coiffe.length || !cape.length) {
    return result;
  }
  const paletteDelta = deltaE2000(
    hexToLab(paletteBySlot.coiffe.primary),
    hexToLab(paletteBySlot.cape.primary),
  );
  const bonusMagnitude = paletteDelta < 10 ? BONUS.sameSetCoiffeCape * 2 : BONUS.sameSetCoiffeCape;
  for (const c of coiffe) {
    for (const k of cape) {
      if (!c.setId || !k.setId || c.setId !== k.setId) {
        continue;
      }
      if (!(c.verified || k.verified)) {
        continue;
      }
      c.score += bonusMagnitude;
      k.score += bonusMagnitude;
    }
  }
  coiffe.sort((a, b) => {
    if (a.verified !== b.verified) {
      return a.verified ? -1 : 1;
    }
    return b.score - a.score;
  });
  cape.sort((a, b) => {
    if (a.verified !== b.verified) {
      return a.verified ? -1 : 1;
    }
    return b.score - a.score;
  });
  return result;
}

export function finalizeSlot(candidates: Candidate[]): Candidate[] {
  const ranked = [...candidates].sort((a, b) => {
    if (a.verified !== b.verified) {
      return a.verified ? -1 : 1;
    }
    return b.score - a.score;
  });
  return nmsSilhouette(ranked);
}
