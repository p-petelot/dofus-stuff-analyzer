import fs from "fs";
import path from "path";
import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { buildVisionIndexFromGenerations, clearVisionIndexCache, loadVisionIndex } from "../lib/vision/index";
import { predictLookAttributes } from "../lib/vision/predict";

const datasetDir = path.join(process.cwd(), ".cache", "vision-test-dataset");
const indexPath = path.join(process.cwd(), ".cache", "vision-test-index.json");

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeDataset(): void {
  ensureDir(datasetDir);
  const examples = [
    {
      id: "look-red",
      image: `data:application/octet-stream;base64,${Buffer.from("look-red").toString("base64")}`,
      class: "Iop",
      gender: "m",
      colors: ["#FF0000", "#AA0000", "#880000", "#550000", "#330000", "#110000"],
      items: {
        coiffe: 101,
        cape: 202,
      },
    },
    {
      id: "look-blue",
      image: `data:application/octet-stream;base64,${Buffer.from("look-blue").toString("base64")}`,
      class: "Eniripsa",
      gender: "f",
      colors: ["#0000FF", "#0000AA", "#000088", "#000055", "#000033", "#000011"],
      items: {
        bouclier: 303,
      },
    },
  ];
  fs.writeFileSync(path.join(datasetDir, "examples.json"), JSON.stringify(examples, null, 2));
}

function cleanup(): void {
  if (fs.existsSync(datasetDir)) {
    fs.rmSync(datasetDir, { recursive: true, force: true });
  }
  if (fs.existsSync(indexPath)) {
    fs.rmSync(indexPath, { force: true });
  }
}

beforeAll(async () => {
  process.env.VISION_FORCE_STUB = "1";
  cleanup();
  writeDataset();
  await buildVisionIndexFromGenerations({ datasetPath: datasetDir, indexPath });
});

afterAll(() => {
  delete process.env.VISION_FORCE_STUB;
  clearVisionIndexCache();
  cleanup();
});

describe("vision attribute prediction", () => {
  test("predictLookAttributes returns known metadata for training example", async () => {
    const base64 = Buffer.from("look-red").toString("base64");
    const index = await loadVisionIndex({ indexPath, datasetPath: datasetDir });
    const prediction = await predictLookAttributes(base64, { index, k: 2 });

    expect(prediction.classLabel).toBe("Iop");
    expect(prediction.gender).toBe("m");
    expect(prediction.colors.length).toBeGreaterThan(0);
    expect(prediction.colors[0]).toBe("#FF0000");
    expect(prediction.items.coiffe.itemId).toBe(101);
    expect(prediction.items.cape.itemId).toBe(202);
  });
});
