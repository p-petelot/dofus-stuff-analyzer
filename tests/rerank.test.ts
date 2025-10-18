import { describe, expect, it } from "vitest";
import { applySetBonus, finalizeSlot, nmsSilhouette } from "../lib/items/rerank";
import type { Candidate, DofusPalette, SlotKey } from "../lib/types";

const basePalette: Record<SlotKey, DofusPalette> = {
  coiffe: { primary: "#F5D142", secondary: "#57B8FF", tertiary: "#A1D25A" },
  cape: { primary: "#F5D142", secondary: "#57B8FF", tertiary: "#A1D25A" },
  bouclier: { primary: "#F5D142", secondary: "#57B8FF", tertiary: "#A1D25A" },
  familier: { primary: "#F5D142", secondary: "#57B8FF", tertiary: "#A1D25A" },
  epauliere: { primary: "#F5D142", secondary: "#57B8FF", tertiary: "#A1D25A" },
  costume: { primary: "#F5D142", secondary: "#57B8FF", tertiary: "#A1D25A" },
  ailes: { primary: "#F5D142", secondary: "#57B8FF", tertiary: "#A1D25A" },
};

const makeCandidate = (overrides: Partial<Candidate>): Candidate => ({
  itemId: overrides.itemId ?? Math.floor(Math.random() * 10000),
  label: overrides.label ?? "Item",
  score: overrides.score ?? 0.6,
  mode: overrides.mode ?? "item",
  verified: overrides.verified ?? true,
  reasons: overrides.reasons ?? {},
  setId: overrides.setId,
  thumb: overrides.thumb,
});

describe("nmsSilhouette", () => {
  it("removes duplicate items keeping the highest score", () => {
    const first = makeCandidate({ itemId: 1, score: 0.9 });
    const duplicate = makeCandidate({ itemId: 1, score: 0.7 });
    const unique = makeCandidate({ itemId: 2, score: 0.8 });
    const result = nmsSilhouette([duplicate, first, unique]);
    expect(result).toHaveLength(2);
    expect(result[0].itemId).toBe(1);
    expect(result[0].score).toBeCloseTo(0.9, 4);
  });
});

describe("applySetBonus", () => {
  it("boosts coiffe and cape from the same set when at least one is verified", () => {
    const coiffe = makeCandidate({ itemId: 10, setId: 5, score: 0.8, mode: "item", verified: true });
    const cape = makeCandidate({ itemId: 20, setId: 5, score: 0.75, mode: "color", verified: false });
    const result = applySetBonus(
      {
        coiffe: [coiffe],
        cape: [cape],
        bouclier: [],
        familier: [],
        epauliere: [],
        costume: [],
        ailes: [],
      },
      basePalette,
    );
    expect(result.coiffe[0].score).toBeGreaterThan(0.8);
    expect(result.cape[0].score).toBeGreaterThan(0.75);
  });
});

describe("finalizeSlot", () => {
  it("keeps verified suggestions at the top", () => {
    const verified = makeCandidate({ itemId: 1, verified: true, score: 0.7 });
    const color = makeCandidate({ itemId: 2, verified: false, mode: "color", score: 0.9 });
    const ordered = finalizeSlot([color, verified]);
    expect(ordered[0].verified).toBe(true);
  });
});
