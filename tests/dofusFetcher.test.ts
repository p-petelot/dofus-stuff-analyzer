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

  it("includes apparat and mount families for familiers and honours default filters", async () => {
    const requestedTypeIds = new Set<number>();
    const fetchMock = vi.spyOn(global, "fetch").mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (!url.includes("/items")) {
        throw new Error(`Unexpected fetch ${url}`);
      }
      const parsed = new URL(url);
      expect(parsed.searchParams.get("typeId[$ne]")).toBe("203");
      const typeIds = parsed.searchParams.getAll("typeId[$in][]").map((value) => Number(value));
      typeIds.forEach((id) => requestedTypeIds.add(id));
      const items = typeIds.map((typeId, index) => ({
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
    });

    const itemsBySlot = await fetchItemsForIndex("fr");
    fetchMock.mockRestore();

    const familiersByType = itemsBySlot.familier.map((item) => Math.floor(item.id / 1000));
    const expectedFamilierTypeIds = [18, 249, 121, 250, 97, 196, 207];
    expectedFamilierTypeIds.forEach((typeId) => {
      expect(familiersByType).toContain(typeId);
      expect(requestedTypeIds.has(typeId)).toBe(true);
    });

    const expectedGlobalTypeIds = [16, 246, 17, 247, 82, 248, 299, 199, 300];
    expectedGlobalTypeIds.forEach((typeId) => {
      expect(requestedTypeIds.has(typeId)).toBe(true);
    });
  });
});
