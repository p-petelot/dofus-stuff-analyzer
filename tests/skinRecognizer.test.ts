import fs from "fs";
import { beforeEach, describe, expect, it } from "vitest";
import { SLOTS } from "../lib/config/suggestions";
import type { CandidateRef } from "../lib/types";
import { resolveCachePath } from "../lib/utils/cache";
import {
  evaluateSkinRecognizer,
  getSkinRecognizerDatasetSummary,
  recordLabeledSkinSample,
  recognizeSkin,
  synthesiseDescriptorImage,
  trainSkinRecognizer,
} from "../lib/vision/skinRecognizer";

const BASE_EMBEDDING = Array.from({ length: 16 }, (_, index) => (index + 1) / 16);

const MODEL_CACHE = resolveCachePath("skin-recognizer.json");
const DATASET_CACHE = resolveCachePath("skin-recognizer-dataset.json");

function makeItem(slot: CandidateRef["slot"], id: number, extraTags: string[] = []): CandidateRef {
  return {
    itemId: id,
    slot,
    label: `${slot}-${id}`,
    embedding: BASE_EMBEDDING,
    setId: null,
    tags: extraTags,
    palette: ["#AA7744", "#4477AA"],
    thumb: `/thumb-${slot}-${id}.png`,
    sprite: `/sprite-${slot}-${id}.png`,
  };
}

describe("skinRecognizer", () => {
  beforeEach(async () => {
    await fs.promises.rm(MODEL_CACHE, { force: true }).catch(() => undefined);
    await fs.promises.rm(DATASET_CACHE, { force: true }).catch(() => undefined);
  });

  it("generates a synthetic model from indexed items", async () => {
    const items: CandidateRef[] = [];
    let id = 1;
    for (const slot of SLOTS) {
      items.push(makeItem(slot, id++, [`class:iop`, `role:${slot}`]));
      items.push(makeItem(slot, id++, [`class:cra`]));
    }
    const model = await trainSkinRecognizer({
      items,
      classes: ["iop", "cra"],
      paletteSeeds: ["#FF7043", "#36A4F4"],
      samplesPerClass: 2,
      randomSeed: "unit-test",
      persist: false,
    });
    expect(model.samples).toHaveLength(2 * 2 * 2);
    expect(model.metadata.classes).toEqual(["iop", "cra"]);
    expect(model.metadata.samples).toBe(model.samples.length);
    expect(model.metadata.labeledSamples).toBe(0);
  });

  it("recognises a matching synthetic skin image", async () => {
    const items: CandidateRef[] = [];
    let id = 100;
    for (const slot of SLOTS) {
      items.push(makeItem(slot, id++, [`class:eniripsa`]));
      items.push(makeItem(slot, id++, [`class:sram`]));
    }
    const model = await trainSkinRecognizer({
      items,
      classes: ["eniripsa", "sram"],
      paletteSeeds: ["#F4EFCB"],
      samplesPerClass: 1,
      randomSeed: "recognition-test",
      persist: false,
    });
    const sample = model.samples[0];
    const buffer = await synthesiseDescriptorImage(sample.descriptor, sample.syntheticSeed);
    const result = await recognizeSkin(buffer, model, { topK: 2 });
    expect(result.prediction).not.toBeNull();
    expect(result.prediction?.descriptor.classId).toBe(sample.descriptor.classId);
    expect(result.prediction?.descriptor.sex).toBe(sample.descriptor.sex);
    expect(result.prediction?.descriptor.items.costume.itemId).toBe(
      sample.descriptor.items.costume.itemId,
    );
    expect(result.prediction?.score ?? 0).toBeGreaterThan(0.85);
  });

  it("records labeled samples and includes them in training", async () => {
    const items: CandidateRef[] = [];
    let id = 200;
    for (const slot of SLOTS) {
      items.push(makeItem(slot, id++, [`class:feca`]));
    }
    const descriptor = {
      classId: "feca",
      sex: "female" as const,
      colors: ["#FFAA33", "#2244AA", "#88CCEE"],
      items: Object.fromEntries(items.map((item) => [item.slot, item])) as Record<
        CandidateRef["slot"],
        CandidateRef
      >,
    };
    const image = `data:image/png;base64,${Buffer.from("fixture-labeled").toString("base64")}`;
    const { sample } = await recordLabeledSkinSample(image, descriptor);
    expect(sample.source).toBe("labeled");
    const summary = await getSkinRecognizerDatasetSummary();
    expect(summary.labeled).toBe(1);

    const model = await trainSkinRecognizer({
      items,
      classes: ["feca"],
      samplesPerClass: 1,
      persist: false,
    });
    expect(model.metadata.labeledSamples).toBe(1);
    const evaluation = await evaluateSkinRecognizer({
      model,
      items,
      classes: ["feca"],
      samplesPerClass: 1,
    });
    expect(evaluation.metrics.samples).toBeGreaterThan(0);
    expect(evaluation.metrics.classAccuracy).toBeGreaterThan(0);
  });
});

