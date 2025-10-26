import { describe, expect, it } from "vitest";
import { generateCandidate } from "../lib/train/generator";
import { evaluateCandidate } from "../lib/train/evaluator";
import { createLearnerState, updatePolicy } from "../lib/train/learner";
import { getCatalog } from "../lib/train/catalog";

describe("training pipeline", () => {
  it("generates candidates covering requested slots", async () => {
    const candidate = await generateCandidate();
    expect(candidate.items.length).toBeGreaterThan(0);
    expect(candidate.slotCoverage.length).toBe(candidate.items.length);
    expect(candidate.palette.colors.hair).toMatch(/^#/);
  });

  it("evaluates candidate with bounded score", async () => {
    const candidate = await generateCandidate();
    const evaluation = evaluateCandidate(candidate);
    expect(evaluation.score).toBeGreaterThanOrEqual(0);
    expect(evaluation.score).toBeLessThanOrEqual(100);
    expect(Object.keys(evaluation.breakdown).length).toBeGreaterThan(0);
  });

  it("nudges policy towards successful candidates", async () => {
    const catalog = await getCatalog();
    const learner = createLearnerState(catalog, 1, "spec");
    const basePolicy = learner.population[0].policy;
    const candidate = await generateCandidate({
      classDist: basePolicy.classDist,
      sexDist: basePolicy.sexDist,
      paletteBias: basePolicy.paletteBias,
    });
    const updated = updatePolicy(basePolicy, [candidate]);
    expect(updated).not.toBe(basePolicy);
    const classWeight = updated.classDist[candidate.classKey] ?? 0;
    expect(classWeight).toBeGreaterThan(basePolicy.classDist[candidate.classKey] ?? 0);
  });
});
