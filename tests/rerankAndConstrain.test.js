import { describe, expect, it } from "vitest";
import { rerankAndConstrain, scoreCandidate } from "../lib/items/rerank";

describe("rerankAndConstrain", () => {
  it("filters excluded sets and boosts hinted items", () => {
    const palette = {
      primary: "#FFFFFF",
      secondary: "#000000",
      tertiary: "#FF0000",
    };

    const baseReasons = { clip: 0.7, orb: 0.6, ssim: 0.5, deltaE: 40 };

    const candidates = [
      {
        itemId: 1,
        label: "Coiffe A",
        thumb: undefined,
        reasons: baseReasons,
        score: scoreCandidate(baseReasons),
        setId: 101,
        palette: ["#FFFFFF", "#F0F0F0"],
      },
      {
        itemId: 2,
        label: "Coiffe B",
        thumb: undefined,
        reasons: baseReasons,
        score: scoreCandidate(baseReasons),
        setId: 202,
        palette: ["#112233"],
      },
      {
        itemId: 3,
        label: "Coiffe C",
        thumb: undefined,
        reasons: baseReasons,
        score: scoreCandidate(baseReasons),
        setId: 303,
        palette: ["#FF0000"],
      },
    ];

    const results = rerankAndConstrain("coiffe", candidates, palette, {
      excludeSets: [202],
      hintItemIds: [3],
      preferredSetIds: [101],
    });

    expect(results.find((entry) => entry.itemId === 2)).toBeUndefined();
    expect(results[0]?.itemId).toBe(3);
    expect(results.length).toBe(2);
  });
});
