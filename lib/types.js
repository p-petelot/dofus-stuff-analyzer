/**
 * @typedef {"coiffe" | "cape" | "bouclier" | "familier"} FourSlot
 */

/**
 * @typedef {{ x: number; y: number; width: number; height: number }} BoundingBox
 */

/**
 * @typedef {{ width: number; height: number; data: Uint8ClampedArray }} ImageDataLike
 */

/**
 * @typedef {{ width: number; height: number; data: Uint8Array }} Mask
 */

/**
 * @typedef {{ L: number; a: number; b: number }} Lab
 */

/**
 * @typedef {{ primary: Lab; secondary: Lab; tertiary: Lab }} Palette
 */

/**
 * @typedef {{ primary: string; secondary: string; tertiary: string }} DofusPalette
 */

/**
 * @typedef {{
 *   clip?: number;
 *   orb?: number;
 *   ssim?: number;
 *   chamfer?: number;
 *   poseAligned?: boolean;
 *   colorScore?: number;
 *   ssimEdges?: number;
 *   deltaE?: number;
 * }} CandidateReasons
 */

/**
 * @typedef {{
 *   itemId: number;
 *   label: string;
 *   thumb?: string;
 *   score: number;
 *   mode: "item" | "color";
 *   verified: boolean;
 *   reasons: CandidateReasons;
 *   setId?: number | null;
 *   palette?: string[];
 * }} Candidate
 */

/**
 * @typedef {{ id: number; label: string; slot: FourSlot; setId?: number | null; palette?: string[]; embedding?: number[]; thumb?: string }} ItemMeta
 */

/**
 * @typedef {{ itemId: number; slot: FourSlot; label: string; embedding: number[]; setId?: number | null; palette?: string[]; thumb?: string }} CandidateRef
 */

/**
 * @typedef {{ updatedAt: number; items: Object.<FourSlot, CandidateRef[]> }} ItemIndex
 */

/**
 * @typedef {{ excludeSets?: number[]; preferredSetIds?: number[]; hintItemIds?: number[]; panoplyBonus?: number; maxPerSlot?: number }} SetRules
 */

/**
 * @typedef {{
 *   palette: { primary: string; secondary: string; tertiary: string };
 *   slots: Object.<FourSlot, Candidate[]>;
 *   confidence: Object.<FourSlot, number>;
 *   notes: string[];
 *   visibility: Object.<FourSlot, "ok" | "low">;
 *   debug?: { timingsMs?: Record<string, number>; flags?: Record<string, boolean> };
 * }} SuggestionOutput
 */

export {};
