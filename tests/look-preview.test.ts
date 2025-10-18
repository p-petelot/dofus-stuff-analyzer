import { describe, expect, it } from "vitest";

import {
  buildRendererUrl,
  extractItemIdsFromQuery,
  extractColorsFromQuery,
  normalizeGender,
} from "../pages/api/look-preview";

describe("normalizeGender", () => {
  it("normalizes male-like inputs to 'm'", () => {
    expect(normalizeGender("male")).toBe("m");
    expect(normalizeGender("Mâle")).toBe("m");
    expect(normalizeGender("homme")).toBe("m");
  });

  it("normalizes female-like inputs to 'f'", () => {
    expect(normalizeGender("female")).toBe("f");
    expect(normalizeGender("Femme")).toBe("f");
    expect(normalizeGender("femelle")).toBe("f");
  });

  it("returns null for unknown values", () => {
    expect(normalizeGender("non-binary")).toBeNull();
    expect(normalizeGender(null)).toBeNull();
  });
});

describe("extractItemIdsFromQuery", () => {
  it("collects numeric item ids from multiple query keys", () => {
    const ids = extractItemIdsFromQuery({
      "itemIds[]": ["123", "abc", "456"],
      itemIds: "789",
      itemId: ["101112"],
    });

    expect(ids).toEqual([123, 456, 789, 101112]);
  });

  it("deduplicates item ids and ignores invalid values", () => {
    const ids = extractItemIdsFromQuery({
      "itemIds[]": ["321", "321", "-"],
      itemIds: "321",
      itemId: "642",
    });

    expect(ids).toEqual([321, 642]);
  });
});

describe("extractColorsFromQuery", () => {
  it("collects numeric color values from different query keys", () => {
    const colors = extractColorsFromQuery({
      "colors[]": ["123456", "#ABCDEF"],
      colors: "0x654321",
      color: ["not-a-color", "789012"],
      palette: "#112233",
    });

    expect(colors).toEqual([123456, 0xabcdef, 0x654321, 789012, 0x112233]);
  });

  it("deduplicates values and ignores invalid entries", () => {
    const colors = extractColorsFromQuery({
      colors: ["#FFFFFF", "#ffffff", ""],
      palette: "garbage",
    });

    expect(colors).toEqual([0xffffff]);
  });
});

describe("buildRendererUrl", () => {
  it("encodes the look token into a renderer URL", () => {
    const token = Buffer.from("deadbeef", "utf8").toString("base64");
    const url = buildRendererUrl(token, 256);
    expect(url).toBe(
      "https://renderer.dofusdb.fr/kool/5a4756685a474a6c5a57593d/full/1/256_256.png"
    );
  });

  it("throws when no token is provided", () => {
    expect(() => buildRendererUrl(""))
      .toThrowError("Jeton de rendu invalide");
  });
});
