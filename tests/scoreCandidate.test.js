import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../lib/items/rerank";

describe("scoreCandidate", () => {
  it("combines structural metrics with the configured weights", () => {
    const metrics = { clip: 0.8, orb: 0.6, ssim: 0.5, chamfer: 0.2 };
    const shape = ((1 - metrics.chamfer) + metrics.ssim) / 2;
    const expected = 0.35 * metrics.clip + 0.25 * metrics.orb + 0.2 * metrics.ssim + 0.2 * shape;
    expect(scoreCandidate(metrics)).toBeCloseTo(expected, 5);
  });

  it("returns a value in the [0,1] range even with extreme metrics", () => {
    const metrics = { clip: 5, orb: -3, ssim: 4, chamfer: -1 };
    const score = scoreCandidate(metrics);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });
});
