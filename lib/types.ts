import type { FourSlot } from "./config/suggestions";

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type Mask = Uint8Array;

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export interface Palette {
  primary: Lab;
  secondary: Lab;
  tertiary: Lab;
}

export interface DofusPalette {
  primary: string;
  secondary: string;
  tertiary: string;
}

export interface CandidateReasons {
  clip?: number;
  orb?: number;
  ssim?: number;
  chamfer?: number;
  poseAligned?: boolean;
  colorScore?: number;
  ssimEdges?: number;
  deltaE?: number;
}

export interface Candidate {
  itemId: number;
  label: string;
  thumb?: string;
  score: number;
  mode: "item" | "color";
  verified: boolean;
  reasons: CandidateReasons;
  setId?: number | null;
}

export interface ItemMeta {
  id: number;
  label: string;
  slot: FourSlot;
  setId?: number | null;
  tags?: string[];
  palette?: string[];
  embedding?: number[];
  thumb?: string;
  sprite?: string;
}

export interface CandidateRef {
  itemId: number;
  slot: FourSlot;
  label: string;
  embedding: number[];
  setId?: number | null;
  tags?: string[];
  palette?: string[];
  thumb?: string;
  sprite?: string;
}

export interface ItemIndex {
  updatedAt: number;
  items: Record<FourSlot, CandidateRef[]>;
}

export interface SetRules {
  excludeSets?: number[];
  preferredSetIds?: number[];
  hintItemIds?: number[];
}

export interface SuggestionOutput {
  palette: {
    global: DofusPalette;
    bySlot: Record<FourSlot, DofusPalette>;
  };
  slots: Record<FourSlot, Candidate[]>;
  confidence: Record<FourSlot, number>;
  visibility: Record<FourSlot, "ok" | "low">;
  notes: string[];
  debug?: {
    roi?: Record<FourSlot, BoundingBox>;
    timingsMs?: Record<string, number>;
    flags?: Record<string, boolean | number | string>;
  };
}
