import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchItemsForIndex } from "../lib/items/dofusFetcher";

interface MockResponse<T> {
  ok: true;
  status: number;
  json: () => Promise<T>;
}

describe("dofusFetcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes mount families and apparat types for familiers", async () => {
    const itemTypes = [
      { id: 16, name: { fr: "Coiffe" }, slug: "coiffe" },
      { id: 246, name: { fr: "Coiffe d'apparat" }, slug: "coiffe-d-apparat" },
      { id: 18, name: { fr: "Familier" }, slug: "familier" },
      { id: 249, name: { fr: "Familier d'apparat" }, slug: "familier-d-apparat" },
      { id: 812, name: { fr: "Muldo" }, slug: "muldo" },
      { id: 813, name: { fr: "Volkorne" }, slug: "volkorne" },
      { id: 814, name: { fr: "Dragodinde" }, slug: "dragodinde" },
      { id: 815, name: { fr: "Montilier" }, slug: "montilier" },
    ];

    const fetchMock = vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/item-types")) {
        const response: MockResponse<{ results: unknown[] }> = {
          ok: true,
          status: 200,
          json: async () => ({ results: itemTypes }),
        };
        return Promise.resolve(response as unknown as Response);
      }
      if (url.includes("/items")) {
        const parsed = new URL(url);
        const slotTypes = parsed.searchParams.getAll("typeId[$in][]").map((value) => Number(value));
        const items = slotTypes.map((typeId, index) => ({
          ankamaId: typeId * 1000 + index + 1,
          name: { fr: `Item ${typeId}` },
          img: `/assets/${typeId}.png`,
          look: { img: `/sprites/${typeId}.png` },
        }));
        const response: MockResponse<{ results: unknown[] }> = {
          ok: true,
          status: 200,
          json: async () => ({ results: items }),
        };
        return Promise.resolve(response as unknown as Response);
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    const itemsBySlot = await fetchItemsForIndex("fr");

    const hasType = (typeId: number) =>
      itemsBySlot.familier.some((item) => Math.floor(item.id / 1000) === typeId);
    expect(hasType(18)).toBe(true);
    expect(hasType(249)).toBe(true);
    expect(hasType(812)).toBe(true);
    expect(hasType(813)).toBe(true);
    expect(hasType(814)).toBe(true);
    expect(hasType(815)).toBe(true);

    const encodedMuldo = encodeURIComponent("typeId[$in][]") + "=812";
    const encodedVolkorne = encodeURIComponent("typeId[$in][]") + "=813";
    expect(
      fetchMock.mock.calls.some(([request]) =>
        request && request.toString().includes(encodedMuldo) && request.toString().includes("/items"),
      ),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([request]) =>
        request && request.toString().includes(encodedVolkorne) && request.toString().includes("/items"),
      ),
    ).toBe(true);
  });
});
