import fs from "fs";
import path from "path";

export type VisionTrainingStatus = "idle" | "running" | "completed" | "failed";

export interface VisionTrainingRun {
  id: string;
  status: Exclude<VisionTrainingStatus, "idle">;
  datasetPath: string;
  indexPath: string;
  totalExamples: number;
  processedExamples: number;
  reusedExamples: number;
  newExamples: number;
  failedExamples: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  lastExampleId?: string | null;
  message?: string | null;
}

export interface VisionTrainingState {
  current: VisionTrainingRun | null;
  history: VisionTrainingRun[];
}

export interface StartTrainingProgressOptions {
  datasetPath: string;
  indexPath: string;
  totalExamples: number;
  processedExamples?: number;
  reusedExamples?: number;
  newExamples?: number;
  progressPath?: string;
}

export interface UpdateTrainingProgressOptions {
  progressPath?: string;
  processedExamples?: number;
  failedExamples?: number;
  lastExampleId?: string | null;
  message?: string | null;
}

const DEFAULT_PROGRESS_PATH = path.join(process.cwd(), ".cache", "vision-training.json");
const MAX_HISTORY = 20;

function resolveProgressPath(progressPath?: string): string {
  return progressPath ?? DEFAULT_PROGRESS_PATH;
}

function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readState(progressPath: string): VisionTrainingState {
  try {
    if (fs.existsSync(progressPath)) {
      const raw = fs.readFileSync(progressPath, "utf8");
      if (raw.trim()) {
        const parsed = JSON.parse(raw) as VisionTrainingState;
        return {
          current: parsed.current ?? null,
          history: Array.isArray(parsed.history) ? parsed.history : [],
        };
      }
    }
  } catch (error) {
    console.warn("Failed to read training progress", error);
  }
  return { current: null, history: [] };
}

function writeState(state: VisionTrainingState, progressPath: string): void {
  try {
    ensureDir(progressPath);
    fs.writeFileSync(progressPath, JSON.stringify(state, null, 2));
  } catch (error) {
    console.warn("Failed to persist training progress", error);
  }
}

function generateRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadTrainingState(progressPath?: string): VisionTrainingState {
  return readState(resolveProgressPath(progressPath));
}

export function startTrainingProgress(options: StartTrainingProgressOptions): VisionTrainingRun {
  const resolvedPath = resolveProgressPath(options.progressPath);
  const state = readState(resolvedPath);
  const now = Date.now();
  const reusedExamples = Math.max(0, options.reusedExamples ?? options.processedExamples ?? 0);
  const totalExamples = Math.max(0, options.totalExamples);
  const newExamples = Math.max(0, options.newExamples ?? totalExamples - reusedExamples);
  const processedExamples = Math.min(totalExamples, Math.max(0, options.processedExamples ?? reusedExamples));

  const run: VisionTrainingRun = {
    id: generateRunId(),
    status: "running",
    datasetPath: options.datasetPath,
    indexPath: options.indexPath,
    totalExamples,
    processedExamples,
    reusedExamples,
    newExamples,
    failedExamples: 0,
    startedAt: now,
    updatedAt: now,
    lastExampleId: null,
    message: null,
  };

  state.current = run;
  writeState(state, resolvedPath);
  return run;
}

export function updateTrainingProgress(
  runId: string,
  patch: UpdateTrainingProgressOptions,
): VisionTrainingRun | null {
  const resolvedPath = resolveProgressPath(patch.progressPath);
  const state = readState(resolvedPath);
  if (!state.current || state.current.id !== runId) {
    return state.current;
  }

  const now = Date.now();
  const next: VisionTrainingRun = {
    ...state.current,
    processedExamples:
      patch.processedExamples != null
        ? Math.max(0, Math.min(state.current.totalExamples, patch.processedExamples))
        : state.current.processedExamples,
    failedExamples:
      patch.failedExamples != null ? Math.max(0, patch.failedExamples) : state.current.failedExamples,
    lastExampleId: patch.lastExampleId ?? state.current.lastExampleId ?? null,
    message: patch.message ?? state.current.message ?? null,
    updatedAt: now,
  };

  state.current = next;
  writeState(state, resolvedPath);
  return next;
}

export function finishTrainingProgress(
  runId: string,
  status: Exclude<VisionTrainingStatus, "idle" | "running">,
  options: { message?: string | null; progressPath?: string } = {},
): VisionTrainingRun | null {
  const resolvedPath = resolveProgressPath(options.progressPath);
  const state = readState(resolvedPath);
  if (!state.current || state.current.id !== runId) {
    return state.current;
  }

  const finishedAt = Date.now();
  const completed: VisionTrainingRun = {
    ...state.current,
    status,
    message: options.message ?? state.current.message ?? null,
    updatedAt: finishedAt,
    finishedAt,
  };

  const history = [completed, ...state.history];
  state.history = history.slice(0, MAX_HISTORY);
  state.current = null;
  writeState(state, resolvedPath);
  return completed;
}

export function clearTrainingProgress(progressPath?: string): void {
  const resolvedPath = resolveProgressPath(progressPath);
  try {
    if (fs.existsSync(resolvedPath)) {
      fs.rmSync(resolvedPath);
    }
  } catch (error) {
    console.warn("Failed to clear training progress", error);
  }
}
