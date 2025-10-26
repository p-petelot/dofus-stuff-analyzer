import type { SlotKey as SuggestionSlotKey } from "../config/suggestions";

export type TrainingSex = "male" | "female";

export type TrainingSlotKey =
  | "coiffe"
  | "cape"
  | "bottes"
  | "amulette"
  | "anneau"
  | "ceinture"
  | "bouclier"
  | "familier"
  | "arme";

export type PaletteSource = "random" | "theme" | "image";

export type PaletteHarmony = "triad" | "split" | "analogous" | "complementary";

export interface PaletteSummary {
  source: PaletteSource;
  harmony: PaletteHarmony;
  seed: string;
  anchorHue: number;
  colors: {
    hair: string;
    skin: string;
    outfitPrimary: string;
    outfitSecondary: string;
    accent: string;
  };
}

export interface CatalogItem {
  id: number;
  label: string;
  slot: TrainingSlotKey;
  themeTags: string[];
  classTags: string[];
  hues: number[];
  palette: string[];
  isColorable: boolean;
  isJoker: boolean;
  rarity?: number;
  imageUrl?: string | null;
  rendererKey?: string | null;
}

export interface Catalog {
  updatedAt: number;
  items: CatalogItem[];
  bySlot: Record<TrainingSlotKey, CatalogItem[]>;
  themes: string[];
  classes: string[];
}

export interface CandidateItemPick {
  slot: TrainingSlotKey;
  item: CatalogItem | null;
  assignedColor: string;
  isJoker: boolean;
}

export interface CandidatePreviewDescriptor {
  classId: number;
  faceId: number;
  gender: TrainingSex;
  colors: number[];
  itemIds: number[];
  animation: number;
  direction: number;
}

export interface GeneratedCandidate {
  id: string;
  classKey: string;
  sex: TrainingSex;
  palette: PaletteSummary;
  slotCoverage: TrainingSlotKey[];
  items: CandidateItemPick[];
  theme: string | null;
  jokerCount: number;
  notes: string[];
  policyId?: string;
  imageUrl?: string | null;
  preview?: CandidatePreviewDescriptor | null;
}

export interface EvaluationBreakdown {
  score: number;
  breakdown: Record<string, number>;
  notes: string[];
}

export interface EvaluatedCandidate extends GeneratedCandidate {
  evaluation: EvaluationBreakdown;
}

export interface GenParams {
  classDist?: Record<string, number>;
  sexDist?: { male: number; female: number };
  slotCoverage?: TrainingSlotKey[];
  preferJokers?: boolean;
  paletteMode?: PaletteSource;
  paletteBias?: Partial<Record<PaletteHarmony, number>>;
}

export interface Policy {
  id: string;
  classDist: Record<string, number>;
  sexDist: { male: number; female: number };
  themeDist: Record<string, number>;
  jokerRate: number;
  paletteBias: Record<PaletteHarmony, number>;
}

export interface PolicyStats {
  policy: Policy;
  samples: number;
  avgScore: number;
  bestScore: number;
  lastUpdated: number;
  totalReward: number;
}

export interface LearnerState {
  population: PolicyStats[];
  epsilon: number;
}

export interface TrainingRunConfig {
  maxIterations: number;
  batchSize: number;
  seed?: string;
  eliteCount: number;
}

export type TrainingRunStatus = "idle" | "running" | "stopping" | "completed" | "error";

export interface TrainingIterationSummary {
  index: number;
  bestScore: number;
  avgScore: number;
  policyId: string;
  startedAt: number;
  completedAt: number;
  candidates: EvaluatedCandidate[];
}

export interface TrainingRunRecord {
  id: string;
  startedAt: number;
  status: TrainingRunStatus;
  hyperparams: TrainingRunConfig;
  iterations: TrainingIterationSummary[];
  notes: string[];
  policySnapshots: Record<number, Policy>;
}

export interface FeedbackPayload {
  candidateId: string;
  like: boolean;
}

export interface RendererPayload {
  classKey: string;
  sex: TrainingSex;
  colors: PaletteSummary["colors"];
  items: Record<TrainingSlotKey, number | null>;
}

export interface RendererResult {
  imageUrl: string | null;
}

export interface TrainingStatusResponse {
  runs: TrainingRunRecord[];
  activeRunId: string | null;
  completedCount: number;
}

export type SlotKey = SuggestionSlotKey | TrainingSlotKey;
