/**
 * Shared configuration for the four-slot suggestion pipeline.
 * Values follow the product specification and are only adjusted in this file.
 */

export const SLOTS = ["coiffe", "cape", "bouclier", "familier"];

export const FLAGS = {
  enableItemMode: true,
  enableColorMode: true,
  recolorTemplates: true,
};

export const K = { retrieval: 80, colorPick: 100 };

export const ITEM_THRESH = {
  coiffe: { clip: 0.8, orb: 0.35, ssim: 0.7, chamfer: 0.18, final: 0.78 },
  cape: { clip: 0.78, orb: 0.32, ssim: 0.68, chamfer: 0.2, final: 0.76 },
  bouclier: { clip: 0.8, orb: 0.38, ssim: 0.7, chamfer: 0.16, final: 0.8 },
  familier: { clip: 0.76, orb: 0.3, ssim: 0.66, chamfer: 0.22, final: 0.74 },
};

export const HARD_CHECKS = { require2of3: true, minCoverage: 0.15, minEdgeDensity: 0.06 };

export const SCORE_WEIGHTS = { clip: 0.35, orb: 0.25, ssim: 0.2, shape: 0.2 };

export const BONUS = { sameSetCoiffeCape: 0.02, sameSetMax: 0.04, maxColorDelta: 10 };

export const SUGGESTION_COUNT = { min: 3, max: 5 };

export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export const DEFAULT_IMAGE_SIZE = 512;

export const VISIBILITY_THRESHOLDS = { coverage: 0.12, edgeDensity: 0.04 };

export const MAX_CACHE_SIZE = 64;
