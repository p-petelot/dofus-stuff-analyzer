import { describe, expect, it } from "vitest";
import { deltaE2000 } from "../lib/color/palette";

function hexToLab(hex: string) {
  const cleaned = hex.replace("#", "");
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  const srgb = [r, g, b].map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const [R, G, B] = srgb;
  const X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  const refX = 0.95047;
  const refY = 1;
  const refZ = 1.08883;
  const xyz = [X / refX, Y / refY, Z / refZ].map((value) =>
    value > 0.008856 ? Math.pow(value, 1 / 3) : 7.787 * value + 16 / 116,
  );
  const [fx, fy, fz] = xyz;
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

describe("deltaE2000", () => {
  it("returns zero for identical colours", () => {
    const colour = hexToLab("#AABBCC");
    expect(deltaE2000(colour, colour)).toBeCloseTo(0, 5);
  });

  it("detects large differences for contrasting hues", () => {
    const warm = hexToLab("#FF6633");
    const cool = hexToLab("#3366FF");
    expect(deltaE2000(warm, cool)).toBeGreaterThan(40);
  });
});
