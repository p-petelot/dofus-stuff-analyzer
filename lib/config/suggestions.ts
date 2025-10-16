/**
 * Configuration constants driving the four-slot suggestion pipeline.
 * This file acts as the single source of truth for slot ordering,
 * thresholds, ROI definitions, and weighting knobs.
 */

export type FourSlot = "coiffe" | "cape" | "bouclier" | "familier";

export const SLOTS: FourSlot[] = ["coiffe", "cape", "bouclier", "familier"];

export const FLAGS = {
  enableItemMode: true,
  enableColorMode: true,
  recolorTemplates: true,
} as const;

export const K = { retrieval: 80, colorPick: 100 } as const;

export const ROI: Record<FourSlot, { x: number; y: number; w: number; h: number }> = {
  coiffe: { x: 0.34, y: 0.02, w: 0.32, h: 0.22 },
  cape: { x: 0.28, y: 0.2, w: 0.44, h: 0.5 },
  bouclier: { x: 0.6, y: 0.36, w: 0.22, h: 0.28 },
  familier: { x: 0.08, y: 0.58, w: 0.28, h: 0.3 },
};

export const VIS_THRESH = { minCoverage: 0.15, minEdgeDensity: 0.06 } as const;

export const ITEM_THRESH: Record<
  FourSlot,
  { clip: number; orb: number; ssim: number; chamfer: number; final: number }
> = {
  coiffe: { clip: 0.8, orb: 0.35, ssim: 0.7, chamfer: 0.18, final: 0.78 },
  cape: { clip: 0.78, orb: 0.32, ssim: 0.68, chamfer: 0.2, final: 0.76 },
  bouclier: { clip: 0.8, orb: 0.38, ssim: 0.7, chamfer: 0.16, final: 0.8 },
  familier: { clip: 0.76, orb: 0.3, ssim: 0.66, chamfer: 0.22, final: 0.74 },
};

export const WEIGHTS_ITEM = { clip: 0.35, orb: 0.25, ssim: 0.2, shape: 0.2 } as const;

export const WEIGHTS_COLOR = { color: 0.8, edges: 0.2 } as const;

export const BONUS = { sameSetCoiffeCape: 0.02 } as const;

export const SUGGESTION_COUNT = { min: 3, max: 5 } as const;

export const LOW_CONFIDENCE_THRESHOLD = 0.5;

export const DEFAULT_IMAGE_SIZE = 512;
