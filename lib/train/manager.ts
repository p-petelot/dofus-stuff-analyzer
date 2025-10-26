import { getCatalog } from "./catalog";
import { evaluateCandidate } from "./evaluator";
import {
  attachPolicyId,
  computeReward,
  createLearnerState,
  policyToGenParams,
  registerResult,
  selectPolicy,
  updatePolicy,
} from "./learner";
import { enqueueRender } from "./renderer";
import { listRuns, saveRun } from "./storage";
import { generateCandidate } from "./generator";
import type {
  EvaluatedCandidate,
  LearnerState,
  Policy,
  TrainingIterationSummary,
  TrainingRunConfig,
  TrainingRunRecord,
} from "./types";

interface RunContext {
  record: TrainingRunRecord;
  learner: LearnerState;
  iteration: number;
  stopping: boolean;
}

const contexts = new Map<string, RunContext>();
const feedbackMap = new Map<string, number>();
let activeRunId: string | null = null;

function defaultConfig(config: Partial<TrainingRunConfig>): TrainingRunConfig {
  const batchSize = Math.max(3, config.batchSize ?? 8);
  const eliteCount = Math.max(1, Math.min(config.eliteCount ?? Math.floor(batchSize / 3), batchSize));
  return {
    maxIterations: Math.max(1, config.maxIterations ?? 25),
    batchSize,
    eliteCount,
    seed: config.seed,
  };
}

function createRunRecord(config: TrainingRunConfig): TrainingRunRecord {
  return {
    id: `run-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`,
    startedAt: Date.now(),
    status: "running",
    hyperparams: config,
    iterations: [],
    notes: [],
    policySnapshots: {},
  };
}

function applyFeedback(candidateId: string): number {
  const bonus = feedbackMap.get(candidateId) ?? 0;
  if (feedbackMap.has(candidateId)) {
    feedbackMap.delete(candidateId);
  }
  return bonus;
}

async function renderHighlights(candidates: EvaluatedCandidate[]): Promise<void> {
  const targets = candidates.slice(0, Math.min(4, candidates.length));
  await Promise.all(
    targets.map(async (candidate) => {
      if (candidate.imageUrl) {
        return;
      }
      const imageUrl = await enqueueRender(candidate);
      candidate.imageUrl = imageUrl ?? candidate.imageUrl ?? null;
    }),
  );
}

function summariseIteration(
  run: TrainingRunRecord,
  iterationIndex: number,
  candidates: EvaluatedCandidate[],
  policy: Policy,
  startedAt: number,
): TrainingIterationSummary {
  const bestScore = candidates[0]?.evaluation.score ?? 0;
  const avgScore = candidates.length
    ? candidates.reduce((sum, item) => sum + item.evaluation.score, 0) / candidates.length
    : 0;
  const slice = candidates.slice(0, Math.min(6, candidates.length));
  return {
    index: iterationIndex,
    bestScore,
    avgScore,
    policyId: policy.id,
    startedAt,
    completedAt: Date.now(),
    candidates: slice,
  };
}

async function runIteration(context: RunContext): Promise<void> {
  const { record, learner } = context;
  if (record.status !== "running") {
    return;
  }
  if (context.iteration >= record.hyperparams.maxIterations) {
    record.status = "completed";
    saveRun(record);
    contexts.delete(record.id);
    activeRunId = null;
    return;
  }
  const iterationIndex = context.iteration + 1;
  const iterationStart = Date.now();
  try {
    const policyStats = selectPolicy(learner, `${record.id}-${iterationIndex}`);
    const genParams = policyToGenParams(policyStats.policy);
    const candidates: EvaluatedCandidate[] = [];
    for (let i = 0; i < record.hyperparams.batchSize; i += 1) {
      const generated = await generateCandidate({ ...genParams, paletteBias: policyStats.policy.paletteBias });
      const withPolicy = attachPolicyId(generated, policyStats.policy.id);
      const evaluation = evaluateCandidate(withPolicy);
      const evaluated: EvaluatedCandidate = { ...withPolicy, evaluation };
      const bonus = applyFeedback(evaluated.id);
      const reward = computeReward(evaluated, bonus);
      registerResult(learner, policyStats.policy.id, evaluation.score, reward);
      candidates.push(evaluated);
    }
    candidates.sort((a, b) => b.evaluation.score - a.evaluation.score);
    const elites = candidates.slice(0, Math.min(record.hyperparams.eliteCount, candidates.length));
    const updatedPolicy = updatePolicy(
      policyStats.policy,
      elites.map((candidate) => ({
        id: candidate.id,
        classKey: candidate.classKey,
        sex: candidate.sex,
        palette: candidate.palette,
        slotCoverage: candidate.slotCoverage,
        items: candidate.items,
        theme: candidate.theme,
        jokerCount: candidate.jokerCount,
        notes: candidate.notes,
        policyId: candidate.policyId,
        imageUrl: candidate.imageUrl,
      })),
    );
    policyStats.policy = updatedPolicy;
    await renderHighlights(candidates);
    record.policySnapshots[iterationIndex] = updatedPolicy;
    const summary = summariseIteration(record, iterationIndex, candidates, updatedPolicy, iterationStart);
    record.iterations.push(summary);
    saveRun(record);
    context.iteration += 1;
    if (context.stopping) {
      record.status = "completed";
      saveRun(record);
      contexts.delete(record.id);
      activeRunId = null;
      return;
    }
    setTimeout(() => {
      runIteration(context).catch((error) => {
        console.error("training iteration error", error);
        record.status = "error";
        record.notes.push(String(error));
        saveRun(record);
        contexts.delete(record.id);
        activeRunId = null;
      });
    }, 50);
  } catch (error) {
    console.error("training loop error", error);
    record.status = "error";
    record.notes.push(String(error));
    saveRun(record);
    contexts.delete(record.id);
    activeRunId = null;
  }
}

export async function startTrainingRun(config: Partial<TrainingRunConfig>): Promise<TrainingRunRecord> {
  if (activeRunId) {
    return contexts.get(activeRunId)!.record;
  }
  const catalog = await getCatalog();
  const fullConfig = defaultConfig(config);
  const record = createRunRecord(fullConfig);
  const learner = createLearnerState(catalog, undefined, fullConfig.seed ?? record.id);
  const context: RunContext = { record, learner, iteration: 0, stopping: false };
  contexts.set(record.id, context);
  activeRunId = record.id;
  saveRun(record);
  setTimeout(() => {
    runIteration(context).catch((error) => {
      console.error("training start error", error);
      record.status = "error";
      record.notes.push(String(error));
      saveRun(record);
      contexts.delete(record.id);
      activeRunId = null;
    });
  }, 50);
  return record;
}

export function stopTrainingRun(runId: string): TrainingRunRecord | null {
  const context = contexts.get(runId);
  if (context) {
    context.stopping = true;
    context.record.status = "stopping";
    saveRun(context.record);
    return context.record;
  }
  const runs = listRuns();
  return runs.find((run) => run.id === runId) ?? null;
}

export function getTrainingStatus(): { runs: TrainingRunRecord[]; activeRunId: string | null } {
  const stored = listRuns();
  if (activeRunId && contexts.has(activeRunId)) {
    const activeRecord = contexts.get(activeRunId)!.record;
    const index = stored.findIndex((run) => run.id === activeRecord.id);
    if (index >= 0) {
      stored[index] = activeRecord;
    } else {
      stored.unshift(activeRecord);
    }
  }
  return { runs: stored, activeRunId };
}

export function submitFeedback(candidateId: string, like: boolean): void {
  const bonus = like ? 15 : -10;
  let applied = false;
  for (const context of contexts.values()) {
    for (const iteration of context.record.iterations) {
      const candidate = iteration.candidates.find((entry) => entry.id === candidateId);
      if (candidate && candidate.policyId) {
        const reward = computeReward(candidate, bonus);
        registerResult(context.learner, candidate.policyId, candidate.evaluation.score, reward);
        applied = true;
        break;
      }
    }
    if (applied) {
      break;
    }
  }
  if (!applied) {
    feedbackMap.set(candidateId, bonus);
  }
}
