import { describe, expect, it } from "vitest";
import { generateCandidate } from "../lib/train/generator";
import { hexToRgb, rgbToHue } from "../lib/train/color";

function hueFromHex(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHue(r, g, b);
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

describe("training random generation", () => {
  it("produces candidates with palette and items", async () => {
    const candidate = await generateCandidate();
    expect(candidate.id).toBeTruthy();
    expect(candidate.classKey).toBeTruthy();
    expect(typeof candidate.className).toBe("string");
    expect(candidate.className.length).toBeGreaterThan(0);
    expect(["string", "object"].includes(typeof candidate.classIcon)).toBe(true);
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

  it("aligns item colors when coherence is enforced", async () => {
    const candidate = await generateCandidate({ enforceColorCoherence: true });
    const paletteValues = Object.values(candidate.palette.colors).map((color) => color.toUpperCase());
    let worstDistance = 0;
    let paletteCoverage = 0;
    candidate.items.forEach((pick) => {
      if (!pick.item || pick.item.palette.length === 0) {
        return;
      }
      expect(pick.item.palette.map((hex) => hex.toUpperCase())).toContain(pick.assignedColor.toUpperCase());
      const assignedHue = hueFromHex(pick.assignedColor);
      const bestItemHue = Math.min(
        ...pick.item.palette.map((hex) => hueDistance(assignedHue, hueFromHex(hex))),
      );
      worstDistance = Math.max(worstDistance, bestItemHue);
      const paletteMatch = paletteValues.some((hex) => hex === pick.assignedColor.toUpperCase());
      if (paletteMatch) {
        paletteCoverage += 1;
      }
    });
    expect(worstDistance).toBeLessThanOrEqual(35);
    expect(paletteCoverage).toBeGreaterThan(0);
    const paletteHueDistances = paletteValues.map((hex) => hueFromHex(hex));
    candidate.items.forEach((pick) => {
      const assignedHue = hueFromHex(pick.assignedColor);
      const bestPaletteDistance = Math.min(
        ...paletteHueDistances.map((hue) => hueDistance(assignedHue, hue)),
      );
      expect(bestPaletteDistance).toBeLessThanOrEqual(25);
    });
  });
});
