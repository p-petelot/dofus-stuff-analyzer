import type { SlotKey } from "./config/suggestions";
export type { SlotKey } from "./config/suggestions";

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
  colorScoreRaw?: number;
  ssimEdges?: number;
  deltaE?: number;
  colorablePenalty?: number;
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
  isColorable?: boolean;
}

export interface ItemMeta {
  id: number;
  label: string;
  slot: SlotKey;
  setId?: number | null;
  tags?: string[];
  palette?: string[];
  embedding?: number[];
  thumb?: string;
  sprite?: string;
}

export interface CandidateRef {
  itemId: number;
  slot: SlotKey;
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
  items: Record<SlotKey, CandidateRef[]>;
}

export interface SetRules {
  excludeSets?: number[];
  preferredSetIds?: number[];
  hintItemIds?: number[];
}

export interface SuggestionOutput {
  palette: {
    global: DofusPalette;
    bySlot: Record<SlotKey, DofusPalette>;
    zones?: Record<VisualZoneKey, DofusPalette>;
    colorSlots?: DofusColorSlots;
  };
  slots: Record<SlotKey, Candidate[]>;
  confidence: Record<SlotKey, number>;
  visibility: Record<SlotKey, "ok" | "low">;
  notes: string[];
  debug?: {
    roi?: Record<SlotKey, BoundingBox>;
    timingsMs?: Record<string, number>;
    flags?: Record<string, boolean | number | string>;
  };
}

export type VisualZoneKey = "hair" | "skin" | "outfit" | "accent";

export type ColorSlotKey = 1 | 2 | 3 | 4 | 5;

export interface DofusColorSlots {
  slots: Record<ColorSlotKey, string>;
  byZone: Record<VisualZoneKey, string>;
}
