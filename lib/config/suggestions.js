/**
 * @typedef {import("../types").FourSlot} FourSlot
 */

/** @type {FourSlot[]} */
export const FOUR_SLOTS = ["coiffe", "cape", "bouclier", "familier"];

export const DEFAULT_MAX_SUGGESTIONS = 5;
export const DEFAULT_MIN_SUGGESTIONS = 3;
export const RETRIEVAL_K = 50;
export const MAX_CACHE_SIZE = 32;

export const SCORING_WEIGHTS = {
  clip: 0.5,
  orb: 0.2,
  ssim: 0.15,
  deltaE: 0.15,
};

export const PANOPLY_BONUS = 0.03;
export const PANOPLY_MAX_BONUS = 0.05;
export const PANOPLY_MIN_BONUS = 0.02;

export const LOW_CONFIDENCE_THRESHOLD = 0.5;
export const HIGH_CONFIDENCE_THRESHOLD = 0.75;

export const MAX_DELTA_E = 100;

export const DEFAULT_IMAGE_DIMENSION = 512;
export const MIN_VISIBILITY_RATIO = 0.08;
