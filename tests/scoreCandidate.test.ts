import { describe, expect, it } from "vitest";
import { scoreCandidate } from "../lib/items/rerank";

describe("scoreCandidate", () => {
  it("combines feature scores using configured weights", () => {
    const reasons = { clip: 0.8, orb: 0.6, ssim: 0.5, deltaE: 10 };
    const expected = 0.5 * 0.8 + 0.2 * 0.6 + 0.15 * 0.5 + 0.15 * (1 - 10 / 100);
    expect(scoreCandidate(reasons)).toBeCloseTo(expected, 5);
  });

  it("clamps overflowing values", () => {
    const reasons = { clip: 2, orb: 2, ssim: 2, deltaE: -50 };
    expect(scoreCandidate(reasons)).toBeGreaterThanOrEqual(0);
    expect(scoreCandidate(reasons)).toBeLessThanOrEqual(1);
  });
});
