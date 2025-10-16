export type FourSlot = "coiffe" | "cape" | "bouclier" | "familier";

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Mask {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export interface PaletteSwatch {
  hex: string;
  lab: Lab;
  weight: number;
}

export interface Palette {
  swatches: PaletteSwatch[];
}

export interface DofusPalette {
  primary: string;
  secondary: string;
  tertiary: string;
}

export interface CandidateReasons {
  clip: number;
  orb: number;
  ssim: number;
  deltaE: number;
}

export interface Candidate {
  itemId: number;
  label: string;
  thumb?: string;
  reasons: CandidateReasons;
  score: number;
}

export interface ItemMeta {
  id: number;
  label: string;
  slot: FourSlot;
  setId?: number | null;
  palette?: string[];
  embedding?: number[];
  thumb?: string;
}

export interface CandidateRef {
  itemId: number;
  slot: FourSlot;
  label: string;
  embedding: number[];
  setId?: number | null;
  palette?: string[];
  thumb?: string;
}

export interface ItemIndex {
  updatedAt: number;
  items: Record<FourSlot, CandidateRef[]>;
}

export interface SetRules {
  excludeSets?: number[];
  preferredSetIds?: number[];
  hintItemIds?: number[];
  panoplyBonus?: number;
  maxPerSlot?: number;
}

export interface SuggestionOutput {
  palette: { primary: string; secondary: string; tertiary: string };
  slots: Record<FourSlot, Candidate[]>;
  confidence: Record<FourSlot, number>;
  notes: string[];
  visibility: Record<FourSlot, "ok" | "low">;
}
