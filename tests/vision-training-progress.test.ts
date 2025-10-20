import fs from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  clearTrainingProgress,
  finishTrainingProgress,
  loadTrainingState,
  startTrainingProgress,
  updateTrainingProgress,
} from "../lib/vision/progress";

const progressPath = path.join(process.cwd(), ".cache", "vision-progress-test.json");

function cleanup(): void {
  if (fs.existsSync(progressPath)) {
    fs.rmSync(progressPath, { force: true });
  }
}

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  cleanup();
});

describe("vision training progress", () => {
  test("start, update and finish a training run", () => {
    const run = startTrainingProgress({
      datasetPath: "dataset/path",
      indexPath: "index/path",
      totalExamples: 10,
      reusedExamples: 2,
      progressPath,
    });

    expect(run.status).toBe("running");
    expect(run.processedExamples).toBe(2);

    let state = loadTrainingState(progressPath);
    expect(state.current?.id).toBe(run.id);

    const updated = updateTrainingProgress(run.id, {
      progressPath,
      processedExamples: 5,
      failedExamples: 1,
      lastExampleId: "look-123",
      message: "Traitement en cours",
    });

    expect(updated?.processedExamples).toBe(5);
    expect(updated?.failedExamples).toBe(1);
    expect(updated?.lastExampleId).toBe("look-123");

    const summary = "Terminé avec succès";
    const finished = finishTrainingProgress(run.id, "completed", { progressPath, message: summary });
    expect(finished?.status).toBe("completed");
    expect(finished?.message).toBe(summary);

    state = loadTrainingState(progressPath);
    expect(state.current).toBeNull();
    expect(state.history.length).toBe(1);
    expect(state.history[0].status).toBe("completed");
  });

  test("clearTrainingProgress removes progress file", () => {
    startTrainingProgress({
      datasetPath: "dataset/path",
      indexPath: "index/path",
      totalExamples: 1,
      progressPath,
    });
    expect(fs.existsSync(progressPath)).toBe(true);
    clearTrainingProgress(progressPath);
    expect(fs.existsSync(progressPath)).toBe(false);
  });
});
