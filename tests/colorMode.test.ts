import { beforeEach, describe, expect, it, vi } from "vitest";
import { colorModeSuggest } from "../lib/items/colorMode";
import type { CandidateRef, DofusPalette, ImageDataLike } from "../lib/types";
import { PENALTIES } from "../lib/config/suggestions";

const mockQueryIndex = vi.fn(async (..._args: unknown[]) => [] as CandidateRef[]);

vi.mock("../lib/items/indexStore", () => ({
  queryIndex: (...args: unknown[]) => mockQueryIndex(...args),
}));

vi.mock("../lib/vision/features", () => ({
  clipEmbedding: vi.fn(async () => new Array(12).fill(0)),
  edgeSSIM: vi.fn(() => 0.5),
}));

vi.mock("../lib/items/templateImage", () => ({
  renderCandidateTemplate: vi.fn(() => ({
    width: 1,
    height: 1,
    data: new Uint8ClampedArray(4),
  } satisfies ImageDataLike)),
}));

const slotPalette: DofusPalette = {
  primary: "#112233",
  secondary: "#112233",
  tertiary: "#112233",
};

const patch: ImageDataLike = {
  width: 1,
  height: 1,
  data: new Uint8ClampedArray(4),
};

describe("colorModeSuggest", () => {
  beforeEach(() => {
    mockQueryIndex.mockReset();
  });

  it("penalises color-synchronised candidates", async () => {
    const colorableCandidate: CandidateRef = {
      itemId: 1,
      label: "Colorable",
      slot: "coiffe",
      embedding: new Array(12).fill(0.1),
      tags: ["colorable"],
      palette: ["#112233", "#112233", "#112233"],
    };
    const staticCandidate: CandidateRef = {
      itemId: 2,
      label: "Static",
      slot: "coiffe",
      embedding: new Array(12).fill(0.2),
      tags: [],
      palette: ["#112233", "#112233", "#112233"],
    };
    mockQueryIndex.mockResolvedValue([colorableCandidate, staticCandidate]);

    const suggestions = await colorModeSuggest("coiffe", patch, slotPalette, 2);

    expect(mockQueryIndex).toHaveBeenCalled();
    expect(suggestions[0]?.itemId).toBe(staticCandidate.itemId);

    const penalised = suggestions.find((entry) => entry.itemId === colorableCandidate.itemId);
    expect(penalised).toBeTruthy();
    expect(penalised?.isColorable).toBe(true);
    expect(penalised?.reasons.colorScoreRaw).toBeGreaterThan(
      penalised?.reasons.colorScore ?? 0,
    );
    expect(penalised?.reasons.colorablePenalty).toBeCloseTo(
      PENALTIES.colorModeColorableFactor,
      5,
    );
  });
});

