import { describe, expect, it } from "vitest";

import {
  buildDofusColorSlots,
  extractVisualZonePalettes,
  snapVisualZonesToDofus,
} from "../lib/colors/palette";
import type { ImageDataLike, Mask } from "../lib/types";

function buildTestImage(): { img: ImageDataLike; mask: Mask } {
  const width = 8;
  const height = 8;
  const data = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8Array(width * height).fill(1);

  const colors: Record<string, [number, number, number]> = {
    hair: [245, 209, 66], // #F5D142
    skin: [249, 166, 2], // #F9A602
    outfitPrimary: [255, 122, 90], // #FF7A5A
    outfitSecondary: [158, 122, 79], // #9E7A4F
    accent: [87, 184, 255], // #57B8FF
  };

  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let color: [number, number, number];
      if (y < 2) {
        color = colors.hair;
      } else if (y < 4) {
        color = colors.skin;
      } else if (y < 6) {
        color = x % 2 === 0 ? colors.outfitPrimary : colors.outfitSecondary;
      } else {
        color = colors.accent;
      }
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = 255;
      offset += 4;
    }
  }

  const img: ImageDataLike = { width, height, data };
  return { img, mask };
}

describe("visual zone palette extraction", () => {
  it("identifies dominant colours for hair, skin, outfit and accents", () => {
    const { img, mask } = buildTestImage();

    const zonePalettes = extractVisualZonePalettes(img, mask);
    const snapped = snapVisualZonesToDofus(zonePalettes);
    const colorSlots = buildDofusColorSlots(snapped);

    expect(snapped.hair.primary).toBe("#F5D142");
    expect(snapped.skin.primary).toBe("#F9A602");
    expect(snapped.outfit.primary).toBe("#FF7A5A");
    expect(snapped.outfit.secondary).toBe("#9E7A4F");
    expect(snapped.accent.primary).toBe("#57B8FF");

    expect(colorSlots.slots[1]).toBe("#F5D142");
    expect(colorSlots.slots[2]).toBe("#F9A602");
    expect(colorSlots.slots[3]).toBe("#FF7A5A");
    expect(colorSlots.slots[4]).toBe("#9E7A4F");
    expect(colorSlots.slots[5]).toBe("#57B8FF");
    expect(colorSlots.byZone.hair).toBe("#F5D142");
    expect(colorSlots.byZone.accent).toBe("#57B8FF");
  });
});
