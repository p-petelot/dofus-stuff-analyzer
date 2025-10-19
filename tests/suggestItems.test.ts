import { describe, expect, it } from "vitest";
import { suggestItems } from "../lib/suggestions/suggestItems";
import type { CandidateRef } from "../lib/types";

const BASE_EMBEDDING = Array.from({ length: 12 }, (_, index) => index / 12);

function makeItem(overrides: Partial<CandidateRef>): CandidateRef {
  return {
    itemId: overrides.itemId ?? Math.floor(Math.random() * 1000),
    slot: overrides.slot ?? "cape",
    label: overrides.label ?? "Item",
    embedding: overrides.embedding ?? BASE_EMBEDDING,
    setId: overrides.setId,
    tags: overrides.tags ?? [],
    palette: overrides.palette ?? ["#808080"],
    thumb: overrides.thumb,
    sprite: overrides.sprite ?? "/placeholder.png",
  };
}

describe("suggestItems", () => {
  it("prioritises thematic matches with good colour alignment", () => {
    const palette = { colors: ["#FFAA33", "#1188CC"], theme: "feu" };
    const items: CandidateRef[] = [
      makeItem({
        itemId: 1,
        label: "Cape Braise",
        slot: "cape",
        tags: ["feu"],
        palette: ["#FFAA22", "#772200"],
      }),
      makeItem({
        itemId: 2,
        label: "Cape Joker",
        slot: "cape",
        tags: ["joker"],
        palette: ["#777777"],
      }),
    ];

    const { picks } = suggestItems(palette, items, { theme: "feu" });
    expect(picks.cape[0].item.itemId).toBe(1);
    expect(picks.cape[0].breakdown.theme).toBeGreaterThan(0);
    expect(picks.cape[0].note).toContain("Cape Braise");
  });

  it("rewards joker items when requested", () => {
    const palette = { colors: ["#55CCFF"] };
    const items: CandidateRef[] = [
      makeItem({
        itemId: 10,
        label: "Coiffe Joker",
        slot: "coiffe",
        tags: ["joker"],
        palette: ["#999999"],
      }),
    ];

    const { picks: withoutPreference } = suggestItems(palette, items, { slotsNeeded: ["coiffe"] });
    const { picks: withPreference } = suggestItems(palette, items, {
      slotsNeeded: ["coiffe"],
      preferJokers: true,
    });

    expect(withoutPreference.coiffe[0].breakdown.joker).toBe(15);
    expect(withPreference.coiffe[0].breakdown.joker).toBe(20);
    expect(withPreference.coiffe[0].note).toContain("s’adapte");
  });
});

