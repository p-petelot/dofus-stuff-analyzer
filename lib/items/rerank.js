import { BONUS, SUGGESTION_COUNT } from "../config/suggestions";
import { deltaE2000 } from "../colors/palette";

/** @typedef {import("../types").Candidate} Candidate */
/** @typedef {import("../types").CandidateReasons} CandidateReasons */
/** @typedef {import("../types").DofusPalette} DofusPalette */
/** @typedef {import("../types").FourSlot} FourSlot */
/** @typedef {import("../types").SetRules} SetRules */
/** @typedef {import("../types").Lab} Lab */

function clamp(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function averageDelta(candidatePalette, reference) {
  if (!candidatePalette || candidatePalette.length === 0) return 50;
  const refLabs = [reference.primary, reference.secondary, reference.tertiary];
  let total = 0;
  let count = 0;
  for (const hex of candidatePalette) {
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) continue;
    const normalized = hex.startsWith("#") ? hex : `#${hex}`;
    const lab = hexToLab(normalized);
    let best = Infinity;
    for (const ref of refLabs) {
      const delta = deltaE2000(lab, ref);
      if (delta < best) best = delta;
    }
    if (best < Infinity) {
      total += best;
      count += 1;
    }
  }
  return count ? total / count : 50;
}

function hexToLab(hex) {
  const value = parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return rgbToLab(r, g, b);
}

function rgbToLab(r, g, b) {
  const pivot = (channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const rr = pivot(r);
  const gg = pivot(g);
  const bb = pivot(b);
  const x = rr * 0.4124 + gg * 0.3576 + bb * 0.1805;
  const y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
  const z = rr * 0.0193 + gg * 0.1192 + bb * 0.9505;
  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;
  const fx = xyzPivot(x / refX);
  const fy = xyzPivot(y / refY);
  const fz = xyzPivot(z / refZ);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function xyzPivot(value) {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  return value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116;
}

/**
 * Score a candidate using the structural weights provided by the configuration.
 * @param {{ clip?: number; orb?: number; ssim?: number; chamfer?: number }} metrics
 * @returns {number}
 */
export function scoreCandidate({ clip = 0, orb = 0, ssim = 0, chamfer = 1 }) {
  const shape = (Math.max(0, 1 - chamfer) + ssim) / 2;
  const score = 0.35 * clip + 0.25 * orb + 0.2 * ssim + 0.2 * shape;
  return clamp(score);
}

function applySetBonus(slot, candidate, reasons, rules) {
  if (!candidate.setId) return 0;
  if (!rules?.preferredSetIds || !rules.preferredSetIds.includes(candidate.setId)) {
    return 0;
  }
  if (slot !== "coiffe" && slot !== "cape") {
    return BONUS.sameSetCoiffeCape;
  }
  const delta = reasons?.deltaE ?? 0;
  const boost = delta > 0 && delta < BONUS.maxColorDelta ? BONUS.sameSetCoiffeCape * 2 : BONUS.sameSetCoiffeCape;
  return Math.min(boost, BONUS.sameSetMax ?? BONUS.sameSetCoiffeCape);
}

function applyHintBoost(candidate, rules) {
  if (!rules?.hintItemIds || !rules.hintItemIds.includes(candidate.itemId)) {
    return 0;
  }
  return 0.05;
}

function dedupe(candidates) {
  const map = new Map();
  for (const candidate of candidates) {
    const existing = map.get(candidate.itemId);
    if (!existing || existing.score < candidate.score) {
      map.set(candidate.itemId, candidate);
    }
  }
  return Array.from(map.values());
}

/**
 * Apply rules, set bonuses and deduplication to a list of slot candidates.
 * @param {FourSlot} slot
 * @param {Candidate[]} candidates
 * @param {DofusPalette} palette
 * @param {SetRules} rules
 * @returns {Candidate[]}
 */
export function rerankAndConstrain(slot, candidates, palette, rules) {
  const exclude = new Set(rules?.excludeSets ?? []);
  const enriched = [];
  for (const candidate of candidates) {
    if (candidate.setId && exclude.has(candidate.setId)) {
      continue;
    }
    const reasons = { ...candidate.reasons };
    if (candidate.mode === "color" && candidate.reasons?.deltaE == null && candidate.reasons?.colorScore != null) {
      reasons.deltaE = Math.max(0, 1 - candidate.reasons.colorScore) * 50;
    }
    if (candidate.mode === "item" && candidate.reasons?.deltaE == null && candidate.reasons?.chamfer != null) {
      reasons.deltaE = candidate.reasons.chamfer * 50;
    }
    const bonus = applySetBonus(slot, candidate, reasons, rules) + applyHintBoost(candidate, rules);
    const paletteDelta = candidate.reasons?.deltaE ?? averageDelta(candidate.palette, palette);
    const updated = {
      ...candidate,
      reasons: { ...reasons, deltaE: paletteDelta },
      score: clamp(candidate.score + bonus),
    };
    enriched.push(updated);
  }
  const deduped = dedupe(enriched);
  return deduped
    .sort((a, b) => {
      if (a.verified !== b.verified) {
        return a.verified ? -1 : 1;
      }
      return b.score - a.score;
    })
    .slice(0, SUGGESTION_COUNT.max);
}
