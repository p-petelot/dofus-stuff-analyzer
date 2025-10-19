import { describe, expect, it } from "vitest";
import {
  buildPalettes,
  deltaE2000,
  extractDominantColors,
  hexToLab,
  hexToRgb,
  inferAmbienceFromImage,
  labToHex,
  rgbToHex,
  rgbToLab,
} from "../lib/colors/colorEngine";
import type { ImageDataLike } from "../lib/types";

function makeSolidImage(hex: string): ImageDataLike {
  const colour = hex.replace("#", "");
  const r = parseInt(colour.slice(0, 2), 16);
  const g = parseInt(colour.slice(2, 4), 16);
  const b = parseInt(colour.slice(4, 6), 16);
  const data = new Uint8ClampedArray([
    r,
    g,
    b,
    255,
    r,
    g,
    b,
    255,
    r,
    g,
    b,
    255,
    r,
    g,
    b,
    255,
  ]);
  return { width: 2, height: 2, data };
}

describe("color conversions", () => {
  it("round-trips between hex, rgb, and lab", () => {
    const rgb = hexToRgb("#33AA77");
    expect(rgb).toEqual({ r: 51, g: 170, b: 119 });
    const lab = rgbToLab(rgb.r, rgb.g, rgb.b);
    const hex = rgbToHex({ r: rgb.r, g: rgb.g, b: rgb.b });
    expect(hex).toBe("#33AA77");
    const backHex = labToHex(lab);
    expect(deltaE2000(lab, hexToLab(backHex))).toBeLessThan(0.5);
  });
});

describe("extractDominantColors", () => {
  it("detects the dominant colour in a solid image", () => {
    const image = makeSolidImage("#FF7755");
    const result = extractDominantColors(image, { k: 3 });
    expect(result[0].hex).toBe("#FF7755");
    expect(result[0].weight).toBeCloseTo(1, 5);
  });
});

describe("buildPalettes", () => {
  it("generates harmonious palettes from a seed", () => {
    const palettes = buildPalettes(["#4477FF"]);
    expect(palettes).toHaveLength(4);
    const complementary = palettes.find((palette) => palette.type === "complementary");
    expect(complementary?.colors).toHaveLength(2);
  });
});

describe("inferAmbienceFromImage", () => {
  it("tags warm images as feu", () => {
    const image = makeSolidImage("#FF5522");
    const ambience = inferAmbienceFromImage(image);
    expect(ambience.theme).toBe("feu");
    expect(ambience.confidence).toBeGreaterThan(0.2);
  });

  it("tags cool images as eau", () => {
    const image = makeSolidImage("#2277FF");
    const ambience = inferAmbienceFromImage(image);
    expect(ambience.theme).toBe("eau");
  });

  it("keeps muted scenes as neutre", () => {
    const image = makeSolidImage("#888888");
    const ambience = inferAmbienceFromImage(image);
    expect(ambience.theme).toBe("neutre");
  });
});

