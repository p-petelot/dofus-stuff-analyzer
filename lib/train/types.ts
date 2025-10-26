import type { SlotKey as SuggestionSlotKey } from "../config/suggestions";

export type TrainingSex = "male" | "female";

export type TrainingSlotKey = SuggestionSlotKey;

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
    primary: string;
    secondary: string;
    accent: string;
    detail: string;
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

export interface CatalogClassMetadata {
  key: string;
  name: string;
  icon: string | null;
}

export interface Catalog {
  updatedAt: number;
  items: CatalogItem[];
  bySlot: Record<TrainingSlotKey, CatalogItem[]>;
  themes: string[];
  classes: string[];
  classMetadata: Record<string, CatalogClassMetadata>;
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
  className: string;
  classIcon: string | null;
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
  generation?: number;
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
  breed: number;
  head: number;
  sex: 0 | 1;
  item_id: number[];
  colors: number[];
  animation: number;
  direction: number;
}

export interface RendererResult {
  imageUrl: string | null;
}

export interface TrainingStatusResponse {
  runs: TrainingRunRecord[];
  activeRunId: string | null;
  completedCount: number;
}

export type SlotKey = SuggestionSlotKey;
