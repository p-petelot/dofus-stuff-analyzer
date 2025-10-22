import { describe, expect, it } from "vitest";

import {
  buildRendererUrl,
  extractItemIdsFromQuery,
  extractColorsFromQuery,
  normalizeGender,
  genderToSouffSexCode,
  extractFaceIdFromQuery,
  buildSouffLookPayload,
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

describe("genderToSouffSexCode", () => {
  it("maps male genders to 0", () => {
    expect(genderToSouffSexCode("male")).toBe(0);
    expect(genderToSouffSexCode("m")).toBe(0);
  });

  it("maps female genders to 1", () => {
    expect(genderToSouffSexCode("female")).toBe(1);
    expect(genderToSouffSexCode("f")).toBe(1);
  });

  it("returns null for unknown values", () => {
    expect(genderToSouffSexCode("?")).toBeNull();
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

describe("extractFaceIdFromQuery", () => {
  it("extracts the first valid numeric face id", () => {
    expect(extractFaceIdFromQuery({ faceId: "105" })).toBe(105);
    expect(extractFaceIdFromQuery({ head: ["", "73"] })).toBe(73);
  });

  it("returns null when no valid face id is present", () => {
    expect(extractFaceIdFromQuery({ faceId: "abc" })).toBeNull();
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

describe("buildSouffLookPayload", () => {
  it("creates a payload ready for the Souff renderer", () => {
    const payload = buildSouffLookPayload({
      breedId: 7,
      faceId: 105,
      gender: "f",
      itemIds: [22258, 8632, 8632, 8644],
      colors: [0xffffff, 0x123456, "garbage"],
    });

    expect(payload).toEqual({
      breed: 7,
      head: 105,
      sex: 1,
      item_id: [22258, 8632, 8644],
      colors: [0xffffff, 0x123456],
      animation: 0,
      direction: 1,
    });
  });

  it("normalizes the animation value", () => {
    const payload = buildSouffLookPayload({
      breedId: 7,
      faceId: 105,
      gender: "f",
      itemIds: [22258],
      colors: [],
      animation: 2.7,
    });

    expect(payload.animation).toBe(2);
  });

  it("normalizes the direction value", () => {
    const payload = buildSouffLookPayload({
      breedId: 7,
      faceId: 105,
      gender: "f",
      itemIds: [22258],
      colors: [],
      direction: 9.2,
    });

    expect(payload.direction).toBe(7);

    const negative = buildSouffLookPayload({
      breedId: 7,
      faceId: 105,
      gender: "m",
      itemIds: [22258],
      colors: [],
      direction: -3,
    });

    expect(negative.direction).toBe(0);
  });

  it("throws when required properties are missing", () => {
    expect(() =>
      buildSouffLookPayload({
        breedId: 0,
        faceId: 10,
        gender: "m",
        itemIds: [1],
        colors: [],
      })
    ).toThrowError("Paramètre breedId invalide");

    expect(() =>
      buildSouffLookPayload({
        breedId: 7,
        faceId: null,
        gender: "m",
        itemIds: [1],
        colors: [],
      })
    ).toThrowError("Paramètre faceId invalide");

    expect(() =>
      buildSouffLookPayload({
        breedId: 7,
        faceId: 105,
        gender: "x",
        itemIds: [1],
        colors: [],
      })
    ).toThrowError("Paramètre sexe/gender invalide");

    expect(() =>
      buildSouffLookPayload({
        breedId: 7,
        faceId: 105,
        gender: "m",
        itemIds: [],
        colors: [],
      })
    ).toThrowError("Au moins un identifiant d'objet est requis");
  });
});
