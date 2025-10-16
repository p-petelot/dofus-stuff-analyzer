import {
  DEFAULT_MAX_SUGGESTIONS,
  DEFAULT_MIN_SUGGESTIONS,
  MAX_DELTA_E,
  PANOPLY_BONUS,
  SCORING_WEIGHTS,
} from "../config/suggestions";
import { deltaE2000 } from "../colors/palette";

/** @typedef {import("../types").Candidate} Candidate */
/** @typedef {import("../types").CandidateReasons} CandidateReasons */
/** @typedef {import("../types").DofusPalette} DofusPalette */
/** @typedef {import("../types").FourSlot} FourSlot */
/** @typedef {import("../types").Lab} Lab */
/** @typedef {import("../types").SetRules} SetRules */

/**
 * @typedef {Candidate & { setId?: number | null; palette?: string[] }} EnrichedCandidate
 */

/**
 * @param {number} score
 * @returns {number}
 */
function clampScore(score) {
  if (!Number.isFinite(score)) {
    return 0;
  }
  return Math.max(0, Math.min(1, score));
}

/**
 * @param {string[] | undefined} candidatePalette
 * @param {DofusPalette} reference
 * @returns {number}
 */
function averageDeltaE(candidatePalette, reference) {
  if (!candidatePalette || candidatePalette.length === 0) {
    return MAX_DELTA_E;
  }
  const toLab = (hex) => {
    const value = parseInt(hex.slice(1), 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return rgbToLab(r, g, b);
  };
  const referenceColors = [reference.primary, reference.secondary, reference.tertiary].map(toLab);
  const candidateColors = candidatePalette.map(toLab);
  let total = 0;
  let count = 0;
  for (const candidateLab of candidateColors) {
    let best = MAX_DELTA_E;
    for (const refLab of referenceColors) {
      const delta = deltaE2000(candidateLab, refLab);
      if (delta < best) {
        best = delta;
      }
    }
    total += best;
    count += 1;
  }
  return count > 0 ? total / count : MAX_DELTA_E;
}

/**
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {Lab}
 */
function rgbToLab(r, g, b) {
  const pivot = (value) => {
    const c = value / 255;
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

  const fx = f(x / refX);
  const fy = f(y / refY);
  const fz = f(z / refZ);

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/**
 * @param {number} value
 * @returns {number}
 */
function f(value) {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  return value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116;
}

/**
 * @param {CandidateReasons} reasons
 * @returns {number}
 */
export function scoreCandidate({ clip, orb, ssim, deltaE }) {
  const deltaNorm = Math.min(Math.max(deltaE / MAX_DELTA_E, 0), 1);
  const score =
    SCORING_WEIGHTS.clip * clip +
    SCORING_WEIGHTS.orb * orb +
    SCORING_WEIGHTS.ssim * ssim +
    SCORING_WEIGHTS.deltaE * (1 - deltaNorm);
  return clampScore(score);
}

/**
 * @param {number | null | undefined} setId
 * @param {SetRules} rules
 * @returns {number}
 */
function computePanoplyBonus(setId, rules) {
  if (!setId) {
    return 0;
  }
  if (!rules.preferredSetIds || !rules.preferredSetIds.includes(setId)) {
    return 0;
  }
  return clampScore(rules.panoplyBonus ?? PANOPLY_BONUS);
}

/**
 * @param {EnrichedCandidate} candidate
 * @param {SetRules} rules
 * @returns {number}
 */
function applyHintBoost(candidate, rules) {
  if (!rules.hintItemIds || !rules.hintItemIds.includes(candidate.itemId)) {
    return 0;
  }
  return 0.05;
}

/**
 * @param {number} count
 * @param {SetRules} rules
 * @returns {number}
 */
function clampSuggestionCount(count, rules) {
  const configured = rules.maxPerSlot ?? DEFAULT_MAX_SUGGESTIONS;
  const max = Math.min(configured, DEFAULT_MAX_SUGGESTIONS);
  return Math.min(count, max);
}

/**
 * @param {FourSlot} slot
 * @param {EnrichedCandidate[]} candidates
 * @param {DofusPalette} palette
 * @param {SetRules} rules
 * @returns {Candidate[]}
 */
export function rerankAndConstrain(slot, candidates, palette, rules) {
  const excludeSets = new Set(rules.excludeSets ?? []);
  const suggestions = new Map();
  const limited = clampSuggestionCount(candidates.length, rules);

  for (const candidate of candidates) {
    if (excludeSets.size && candidate.setId && excludeSets.has(candidate.setId)) {
      continue;
    }

    const reasons = candidate.reasons;
    const deltaFromPalette = averageDeltaE(candidate.palette, palette);
    const updatedReasons = {
      ...reasons,
      deltaE: deltaFromPalette,
    };

    let score = scoreCandidate(updatedReasons);
    score += computePanoplyBonus(candidate.setId ?? null, rules);
    score += applyHintBoost(candidate, rules);
    score = clampScore(score);

    const enriched = {
      ...candidate,
      reasons: updatedReasons,
      score,
    };

    const existing = suggestions.get(enriched.itemId);
    if (!existing || existing.score < enriched.score) {
      suggestions.set(enriched.itemId, enriched);
    }
  }

  const ranked = Array.from(suggestions.values()).sort((a, b) => b.score - a.score);
  const minCount = Math.min(DEFAULT_MIN_SUGGESTIONS, ranked.length);
  const limit = Math.max(minCount, limited);
  return ranked.slice(0, limit).map((candidate) => ({
    itemId: candidate.itemId,
    label: candidate.label,
    thumb: candidate.thumb,
    reasons: candidate.reasons,
    score: candidate.score,
  }));
}
