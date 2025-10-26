import { describe, expect, it } from "vitest";
import { generateCandidate } from "../lib/train/generator";

describe("training random generation", () => {
  it("produces candidates with palette and items", async () => {
    const candidate = await generateCandidate();
    expect(candidate.id).toBeTruthy();
    expect(candidate.palette.colors.hair).toMatch(/^#/);
    expect(Object.keys(candidate.palette.colors)).toHaveLength(6);
    expect(candidate.items.length).toBeGreaterThan(0);
    expect(candidate.items.every((pick) => typeof pick.assignedColor === "string")).toBe(true);
  });

  it("attaches preview descriptors when possible", async () => {
    const candidate = await generateCandidate({
      classDist: { iop: 1 },
      sexDist: { male: 1, female: 0 },
    });
    expect(candidate.preview).not.toBeNull();
    expect(candidate.preview?.itemIds.length ?? 0).toBeGreaterThanOrEqual(0);
    expect(candidate.preview?.colors.length ?? 0).toBeGreaterThan(0);
    expect(candidate.preview?.colors.length).toBeGreaterThanOrEqual(6);
  });
});
