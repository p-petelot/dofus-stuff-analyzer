import fs from "fs";
import path from "path";
import type { TrainingIterationSummary, TrainingRunRecord } from "./types";

const DATA_DIR = path.join(process.cwd(), "data", "training");
const RUNS_PATH = path.join(DATA_DIR, "runs.json");

interface PersistedState {
  runs: TrainingRunRecord[];
}

let cache: PersistedState | null = null;

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStateFromDisk(): PersistedState {
  try {
    if (cache) {
      return cache;
    }
    if (fs.existsSync(RUNS_PATH)) {
      const raw = fs.readFileSync(RUNS_PATH, "utf8");
      const parsed = JSON.parse(raw) as PersistedState;
      cache = parsed;
      return parsed;
    }
  } catch (error) {
    console.warn("training storage load failed", error);
  }
  const empty: PersistedState = { runs: [] };
  cache = empty;
  return empty;
}

function persistState(state: PersistedState): void {
  try {
    ensureDir();
    fs.writeFileSync(RUNS_PATH, JSON.stringify(state, null, 2));
    cache = state;
  } catch (error) {
    console.warn("training storage persist failed", error);
  }
}

export function listRuns(): TrainingRunRecord[] {
  return loadStateFromDisk().runs;
}

export function saveRun(run: TrainingRunRecord): void {
  const state = loadStateFromDisk();
  const index = state.runs.findIndex((entry) => entry.id === run.id);
  if (index >= 0) {
    state.runs[index] = run;
  } else {
    state.runs.push(run);
  }
  persistState(state);
}

export function appendIteration(runId: string, iteration: TrainingIterationSummary): void {
  const state = loadStateFromDisk();
  const run = state.runs.find((entry) => entry.id === runId);
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }
  run.iterations.push(iteration);
  persistState(state);
}

export function updateRunStatus(runId: string, updater: (run: TrainingRunRecord) => TrainingRunRecord): void {
  const state = loadStateFromDisk();
  const index = state.runs.findIndex((entry) => entry.id === runId);
  if (index < 0) {
    throw new Error(`Run ${runId} not found`);
  }
  state.runs[index] = updater(state.runs[index]);
  persistState(state);
}

export function hydrateRun(run: TrainingRunRecord): TrainingRunRecord {
  const state = loadStateFromDisk();
  const stored = state.runs.find((entry) => entry.id === run.id);
  return stored ?? run;
}

export function clearCache(): void {
  cache = null;
}
