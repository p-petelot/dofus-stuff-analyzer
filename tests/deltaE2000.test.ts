import { describe, expect, it } from "vitest";
import { deltaE2000 } from "../lib/colors/palette";
import { Lab } from "../lib/types";

describe("deltaE2000", () => {
  it("returns zero for identical colors", () => {
    const color: Lab = { L: 50, a: 2, b: -10 };
    expect(deltaE2000(color, color)).toBeCloseTo(0, 5);
  });

  it("matches the reference CIEDE2000 example", () => {
    const c1: Lab = { L: 50, a: 2.6772, b: -79.7751 };
    const c2: Lab = { L: 50, a: 0, b: -82.7485 };
    expect(deltaE2000(c1, c2)).toBeCloseTo(2.0425, 3);
  });
});
