import { createRng, weightedSample } from "./random";
import type { Catalog, EvaluatedCandidate, GeneratedCandidate, LearnerState, Policy, PolicyStats } from "./types";

const DEFAULT_POPULATION = 4;
const LEARNING_RATE = 0.18;
const MIN_EPSILON = 0.05;
const EPSILON_DECAY = 0.97;

function normaliseWeights(weights: Record<string, number>): Record<string, number> {
  const total = Object.values(weights).reduce((sum, weight) => sum + Math.max(weight, 0), 0);
  if (!total) {
    const entries = Object.keys(weights);
    const fallback = entries.length ? 1 / entries.length : 0;
    return Object.fromEntries(entries.map((key) => [key, fallback]));
  }
  return Object.fromEntries(
    Object.entries(weights).map(([key, weight]) => [key, Math.max(weight, 0) / total]),
  );
}

function clonePolicy(policy: Policy): Policy {
  return {
    id: policy.id,
    classDist: { ...policy.classDist },
    sexDist: { ...policy.sexDist },
    themeDist: { ...policy.themeDist },
    jokerRate: policy.jokerRate,
    paletteBias: { ...policy.paletteBias },
  };
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildBasePolicy(catalog: Catalog, seed: string, offset: number): Policy {
  const id = `policy-${offset}-${seed}`;
  const classes = catalog.classes.length ? catalog.classes : ["iop", "cra", "eniripsa"];
  const classDist = normaliseWeights(Object.fromEntries(classes.map((key) => [key, 1])));
  const themeDist = normaliseWeights(
    catalog.themes.length ? Object.fromEntries(catalog.themes.map((key) => [key, 1])) : { neutre: 1 },
  );
  return {
    id,
    classDist,
    sexDist: { male: 0.5, female: 0.5 },
    themeDist,
    jokerRate: 0.25,
    paletteBias: {
      triad: 0.25,
      split: 0.25,
      analogous: 0.25,
      complementary: 0.25,
    },
  };
}

export function createLearnerState(
  catalog: Catalog,
  populationSize = DEFAULT_POPULATION,
  seed: string = Date.now().toString(36),
): LearnerState {
  const rng = createRng(seed);
  const population: PolicyStats[] = [];
  for (let i = 0; i < populationSize; i += 1) {
    const policy = buildBasePolicy(catalog, seed, i);
    // Introduce slight diversity
    const jitter = rng.next() * 0.2 - 0.1;
    policy.jokerRate = Math.min(0.9, Math.max(0.05, policy.jokerRate + jitter));
    population.push({ policy, samples: 0, avgScore: 0, bestScore: 0, lastUpdated: Date.now(), totalReward: 0 });
  }
  return { population, epsilon: 0.25 };
}

function totalSamples(state: LearnerState): number {
  return state.population.reduce((sum, entry) => sum + entry.samples, 0);
}

export function selectPolicy(state: LearnerState, rngSeed: string): PolicyStats {
  const rng = createRng(rngSeed);
  if (state.population.length === 0) {
    throw new Error("Learner population is empty");
  }
  if (rng.next() < state.epsilon) {
    return state.population[rng.int(state.population.length)];
  }
  const total = Math.max(1, totalSamples(state));
  let best: PolicyStats | null = null;
  let bestScore = -Infinity;
  for (const entry of state.population) {
    if (entry.samples === 0) {
      return entry;
    }
    const exploration = Math.sqrt((2 * Math.log(total)) / entry.samples);
    const ucb = entry.avgScore + exploration;
    if (ucb > bestScore) {
      best = entry;
      bestScore = ucb;
    }
  }
  return best ?? state.population[0];
}

export function registerResult(
  state: LearnerState,
  policyId: string,
  score: number,
  reward: number,
): void {
  const target = state.population.find((entry) => entry.policy.id === policyId);
  if (!target) {
    return;
  }
  target.samples += 1;
  target.avgScore = target.avgScore + (score - target.avgScore) / target.samples;
  target.bestScore = Math.max(target.bestScore, score);
  target.totalReward += reward;
  target.lastUpdated = Date.now();
  state.epsilon = Math.max(MIN_EPSILON, state.epsilon * EPSILON_DECAY);
}

function enrichDistribution(
  base: Record<string, number>,
  updates: Record<string, number>,
  rate: number,
): Record<string, number> {
  const merged = { ...base };
  const keys = new Set([...Object.keys(base), ...Object.keys(updates)]);
  keys.forEach((key) => {
    const current = base[key] ?? 0;
    const target = updates[key] ?? 0;
    merged[key] = current * (1 - rate) + target * rate;
  });
  return normaliseWeights(merged);
}

export function updatePolicy(policy: Policy, elites: GeneratedCandidate[]): Policy {
  if (!elites.length) {
    return policy;
  }
  const clone = clonePolicy(policy);
  const rate = LEARNING_RATE;
  const classCounts: Record<string, number> = {};
  const themeCounts: Record<string, number> = {};
  const harmonyCounts: Record<string, number> = {};
  let maleCount = 0;
  let femaleCount = 0;
  const jokerRatios: number[] = [];

  for (const elite of elites) {
    classCounts[elite.classKey] = (classCounts[elite.classKey] ?? 0) + 1;
    if (elite.theme) {
      themeCounts[elite.theme] = (themeCounts[elite.theme] ?? 0) + 1;
    }
    harmonyCounts[elite.palette.harmony] = (harmonyCounts[elite.palette.harmony] ?? 0) + 1;
    if (elite.sex === "male") maleCount += 1;
    if (elite.sex === "female") femaleCount += 1;
    const coverage = elite.slotCoverage.length ? elite.jokerCount / elite.slotCoverage.length : 0;
    jokerRatios.push(coverage);
  }

  clone.classDist = enrichDistribution(
    clone.classDist,
    normaliseWeights(classCounts),
    rate,
  );
  if (Object.keys(themeCounts).length) {
    clone.themeDist = enrichDistribution(clone.themeDist, normaliseWeights(themeCounts), rate);
  }
  clone.paletteBias = enrichDistribution(clone.paletteBias, normaliseWeights(harmonyCounts), rate);
  const totalSex = maleCount + femaleCount;
  if (totalSex > 0) {
    const maleRatio = maleCount / totalSex;
    const femaleRatio = femaleCount / totalSex;
    clone.sexDist = {
      male: clone.sexDist.male * (1 - rate) + maleRatio * rate,
      female: clone.sexDist.female * (1 - rate) + femaleRatio * rate,
    };
  }
  if (jokerRatios.length) {
    const desired = Math.min(0.85, Math.max(0.05, average(jokerRatios)));
    clone.jokerRate = clone.jokerRate * (1 - rate) + desired * rate;
  }
  return clone;
}

export function policyToGenParams(policy: Policy): {
  classDist: Record<string, number>;
  sexDist: { male: number; female: number };
  preferJokers: boolean;
  paletteMode: "random" | "theme" | "image";
  paletteBias: Partial<Record<"triad" | "split" | "analogous" | "complementary", number>>;
} {
  const rng = createRng(`${policy.id}-${Date.now().toString(36)}`);
  const paletteMode = weightedSample({ random: 0.4, theme: 0.4, image: 0.2 }, rng) as
    | "random"
    | "theme"
    | "image";
  return {
    classDist: policy.classDist,
    sexDist: policy.sexDist,
    preferJokers: rng.next() < policy.jokerRate,
    paletteMode,
    paletteBias: policy.paletteBias,
  };
}

export function attachPolicyId(candidate: GeneratedCandidate, policyId: string): GeneratedCandidate {
  return { ...candidate, policyId };
}

export function computeReward(candidate: EvaluatedCandidate, feedback: number = 0): number {
  return candidate.evaluation.score + feedback;
}
