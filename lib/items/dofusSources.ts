import type { SlotKey } from "../types";

export const DOFUS_API_HOST = "https://api.dofusdb.fr" as const;
export const DOFUS_API_BASE_URL = `${DOFUS_API_HOST}/items` as const;
export const DOFUS_DEFAULT_LANGUAGE = "fr" as const;
export const DOFUS_DEFAULT_LIMIT = 1200 as const;

export interface SlotRequestSource {
  typeIds: number[];
  skip?: number;
  limit?: number;
  query?: Record<string, string>;
  maxPages?: number;
}

export const SLOT_REQUEST_SOURCES: Record<SlotKey, SlotRequestSource[]> = {
  coiffe: [
    { typeIds: [16], skip: 0, limit: 1200 },
    { typeIds: [246], skip: 0, limit: 1200 },
  ],
  cape: [
    { typeIds: [17], skip: 0, limit: 1200 },
    { typeIds: [247], skip: 0, limit: 1200 },
  ],
  bouclier: [
    { typeIds: [82], skip: 0, limit: 1200 },
    { typeIds: [248], skip: 0, limit: 1200 },
  ],
  familier: [
    { typeIds: [18, 249], skip: 0, limit: 1200 },
    { typeIds: [121, 250], skip: 0, limit: 1200 },
    { typeIds: [97], skip: 0, limit: 1200 },
    { typeIds: [196], skip: 0, limit: 1200 },
    { typeIds: [207], skip: 0, limit: 1200 },
  ],
  epauliere: [{ typeIds: [299], skip: 0, limit: 1200 }],
  costume: [{ typeIds: [199], skip: 0, limit: 1200 }],
  ailes: [{ typeIds: [300], skip: 0, limit: 1200 }],
};

export interface FamilierTypeGroup {
  key: "pet" | "mount" | "dragodinde" | "muldo" | "volkorne";
  typeIds: number[];
}

export const FAMILIER_TYPE_GROUPS: FamilierTypeGroup[] = [
  { key: "pet", typeIds: [18, 249] },
  { key: "mount", typeIds: [121, 250] },
  { key: "dragodinde", typeIds: [97] },
  { key: "muldo", typeIds: [196] },
  { key: "volkorne", typeIds: [207] },
];

export function getDefaultDofusItemParams(language = DOFUS_DEFAULT_LANGUAGE): Record<string, string> {
  const normalized = typeof language === "string" && language.trim() ? language.trim() : DOFUS_DEFAULT_LANGUAGE;
  return {
    "typeId[$ne]": "203",
    "$sort": "-id",
    "level[$gte]": "0",
    "level[$lte]": "200",
    lang: normalized,
  };
}
