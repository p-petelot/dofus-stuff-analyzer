import { SLOTS } from "../config/suggestions";
import { clampHue, hslToHex, paletteToHues } from "./color";
import { AVAILABLE_CLASS_KEYS } from "./look";
import { createRng } from "./random";
import type { Catalog, CatalogClassMetadata, CatalogItem, TrainingSlotKey } from "./types";

const DOFUS_API_HOST = "https://api.dofusdb.fr";
const DEFAULT_LANG = "fr";
const MAX_ITEMS_PER_REQUEST = 120;
const MAX_REQUESTS_PER_SLOT = 3;

const SLOT_REQUESTS: Record<TrainingSlotKey, { typeIds: number[]; limit: number }[]> = {
  coiffe: [
    { typeIds: [16], limit: MAX_ITEMS_PER_REQUEST },
    { typeIds: [246], limit: MAX_ITEMS_PER_REQUEST },
  ],
  cape: [
    { typeIds: [17], limit: MAX_ITEMS_PER_REQUEST },
    { typeIds: [247], limit: MAX_ITEMS_PER_REQUEST },
  ],
  bouclier: [
    { typeIds: [82], limit: MAX_ITEMS_PER_REQUEST },
    { typeIds: [248], limit: MAX_ITEMS_PER_REQUEST },
  ],
  familier: [
    { typeIds: [18, 249], limit: MAX_ITEMS_PER_REQUEST },
    { typeIds: [121, 250], limit: MAX_ITEMS_PER_REQUEST },
    { typeIds: [97, 196, 207], limit: MAX_ITEMS_PER_REQUEST },
  ],
  epauliere: [{ typeIds: [299], limit: MAX_ITEMS_PER_REQUEST }],
  costume: [{ typeIds: [199], limit: MAX_ITEMS_PER_REQUEST }],
  ailes: [{ typeIds: [300], limit: MAX_ITEMS_PER_REQUEST }],
};

const FALLBACK_CLASS_KEYS = AVAILABLE_CLASS_KEYS;

const FALLBACK_CLASS_METADATA: CatalogClassMetadata[] = [
  { key: "feca", name: "Féca", icon: null },
  { key: "osamodas", name: "Osamodas", icon: null },
  { key: "enutrof", name: "Enutrof", icon: null },
  { key: "sram", name: "Sram", icon: null },
  { key: "xelor", name: "Xélor", icon: null },
  { key: "ecaflip", name: "Ecaflip", icon: null },
  { key: "eniripsa", name: "Eniripsa", icon: null },
  { key: "iop", name: "Iop", icon: null },
  { key: "cra", name: "Crâ", icon: null },
  { key: "sadida", name: "Sadida", icon: null },
  { key: "sacrieur", name: "Sacrieur", icon: null },
  { key: "pandawa", name: "Pandawa", icon: null },
  { key: "roublard", name: "Roublard", icon: null },
  { key: "zobal", name: "Zobal", icon: null },
  { key: "steamer", name: "Steamer", icon: null },
  { key: "eliotrope", name: "Eliotrope", icon: null },
  { key: "huppermage", name: "Huppermage", icon: null },
  { key: "ouginak", name: "Ouginak", icon: null },
  { key: "forgelance", name: "Forgelance", icon: null },
];

const LANGUAGE_PRIORITY = ["fr", "en", "es", "pt", "de", "it"];

function coerceArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }
  if (typeof value === "object" && value !== null) {
    return Object.values(value)
      .map((entry) => String(entry))
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizeLabel(entry: unknown, fallback: string): string {
  if (typeof entry === "string" && entry.trim()) {
    return entry.trim();
  }
  if (entry && typeof entry === "object") {
    for (const key of LANGUAGE_PRIORITY) {
      const value = (entry as Record<string, unknown>)[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    const candidates = coerceArray(entry);
    for (const candidate of candidates) {
      if (candidate.trim()) {
        return candidate.trim();
      }
    }
  }
  return fallback;
}

function sanitizeId(value: unknown): number | null {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return Math.trunc(numeric);
  }
  return null;
}

function generatePalette(seed: string): string[] {
  const rng = createRng(seed);
  const baseHue = rng.next() * 360;
  const palette: string[] = [];
  const offsets = [0, 120, 220, 45];
  offsets.forEach((offset, index) => {
    const hue = clampHue(baseHue + offset + rng.next() * 18 - 9);
    const saturation = 0.45 + (index % 2 === 0 ? 0.15 : 0.05);
    const lightness = 0.4 + (index % 3) * 0.08;
    palette.push(hslToHex(hue, saturation, Math.min(0.75, lightness)));
  });
  return palette;
}

function extractPalette(entry: any, seed: string): string[] {
  const rawColors = coerceArray(entry?.colors ?? entry?.appearance?.colors ?? entry?.look?.colors);
  const hexColors = rawColors
    .map((value) => {
      if (typeof value !== "string" || !value.trim()) {
        return null;
      }
      const normalized = value.trim().replace(/[^0-9a-fA-F#]/g, "");
      if (!normalized) {
        return null;
      }
      if (normalized.startsWith("#") && normalized.length === 7) {
        return normalized.toUpperCase();
      }
      if (normalized.length === 6) {
        return `#${normalized.toUpperCase()}`;
      }
      return null;
    })
    .filter((value): value is string => Boolean(value));

  if (hexColors.length) {
    return hexColors.slice(0, 4);
  }

  return generatePalette(seed);
}

function extractImageUrl(entry: any): string | null {
  const candidates = [entry?.img, entry?.image, entry?.icon, entry?.href, entry?.url];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function extractClassIcon(entry: any): string | null {
  const direct = extractImageUrl(entry);
  if (direct) {
    return direct;
  }
  const nestedCandidates = [
    entry?.headUri,
    entry?.maleImg,
    entry?.femaleImg,
    entry?.maleImage,
    entry?.femaleImage,
    entry?.maleIcon,
    entry?.femaleIcon,
    entry?.malePortrait,
    entry?.femalePortrait,
    entry?.images?.icon,
    entry?.images?.head,
    entry?.artwork,
    entry?.illustration,
  ];
  for (const candidate of nestedCandidates) {
    if (!candidate) {
      continue;
    }
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (typeof candidate === "object") {
      const extracted = extractImageUrl(candidate);
      if (extracted) {
        return extracted;
      }
    }
  }
  return null;
}

function normalizeCatalogItem(entry: any, slot: TrainingSlotKey, seed: string): CatalogItem | null {
  const id = sanitizeId(entry?.id ?? entry?.ankamaId ?? entry?.ankama_id ?? entry?.data?.id);
  if (!id) {
    return null;
  }
  const defaultLabel = `Objet ${id}`;
  const label = normalizeLabel(entry?.name ?? entry?.title ?? entry?.label ?? entry?.text, defaultLabel);
  const palette = extractPalette(entry, `${seed}-${id}`);
  const hues = paletteToHues(palette);
  const themeTags = coerceArray(entry?.tags ?? entry?.theme ?? entry?.categories);
  const classTags = coerceArray(entry?.classRestriction ?? entry?.classes ?? entry?.classTags);
  const imageUrl = extractImageUrl(entry);
  const isColorable = Boolean(
    entry?.colorizable ??
      entry?.appearance?.isDyeable ??
      entry?.look?.isDyeable ??
      entry?.isDyeable ??
      entry?.isColorable,
  );

  return {
    id,
    label,
    slot,
    themeTags,
    classTags,
    palette,
    hues,
    isColorable,
    isJoker: false,
    rarity: sanitizeId(entry?.rarity) ?? undefined,
    imageUrl,
    rendererKey: typeof entry?.rendererKey === "string" ? entry.rendererKey : null,
  };
}

async function fetchJson(url: URL): Promise<any> {
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (training-center)",
      Referer: "https://dofusdb.fr/",
      Origin: "https://dofusdb.fr",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

function extractDataset(payload: any): any[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  const candidateKeys = ["data", "items", "value", "results", "entries"];
  for (const key of candidateKeys) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function applyTypeFilters(params: URLSearchParams, typeIds: number[]): void {
  if (!typeIds.length) {
    return;
  }
  if (typeIds.length === 1) {
    params.set("typeId", String(typeIds[0]));
    return;
  }
  typeIds.slice(0, MAX_REQUESTS_PER_SLOT).forEach((typeId, index) => {
    params.set(`typeId[$in][${index}]`, String(typeId));
  });
}

async function fetchItemsForSlot(slot: TrainingSlotKey, seed: string): Promise<CatalogItem[]> {
  const requests = SLOT_REQUESTS[slot] ?? [];
  const results: CatalogItem[] = [];
  for (const request of requests.slice(0, MAX_REQUESTS_PER_SLOT)) {
    const params = new URLSearchParams();
    params.set("lang", DEFAULT_LANG);
    params.set("$limit", String(Math.min(request.limit, MAX_ITEMS_PER_REQUEST)));
    params.set("$skip", "0");
    params.set("$sort", "-id");
    applyTypeFilters(params, request.typeIds);
    const url = new URL(`/items?${params.toString()}`, DOFUS_API_HOST);
    try {
      const payload = await fetchJson(url);
      const dataset = extractDataset(payload);
      dataset.forEach((entry: any, index: number) => {
        const normalized = normalizeCatalogItem(entry, slot, `${seed}-${slot}-${index}`);
        if (normalized) {
          results.push(normalized);
        }
      });
    } catch (error) {
      console.warn(`Failed to load items for slot ${slot}`, error);
    }
  }
  return results;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function toClassKey(entry: any): string | null {
  const id = sanitizeId(entry?.id);
  const fallback = id ? `breed-${id}` : null;
  const nameCandidates = [entry?.slug, entry?.key, entry?.name, entry?.shortName, entry?.title];
  for (const candidate of nameCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      const normalized = slugify(candidate.trim());
      const key = normalized.replace(/[^a-z0-9]/g, "");
      if (FALLBACK_CLASS_KEYS.includes(key)) {
        return key;
      }
    }
    if (candidate && typeof candidate === "object") {
      const values = coerceArray(candidate);
      for (const value of values) {
        const normalized = slugify(value);
        const key = normalized.replace(/[^a-z0-9]/g, "");
        if (FALLBACK_CLASS_KEYS.includes(key)) {
          return key;
        }
      }
    }
  }
  return fallback && FALLBACK_CLASS_KEYS.includes(fallback) ? fallback : null;
}

function normalizeClassMetadata(entry: any): CatalogClassMetadata | null {
  const key = toClassKey(entry);
  if (!key) {
    return null;
  }
  const fallback = FALLBACK_CLASS_METADATA.find((meta) => meta.key === key);
  const defaultLabel = fallback?.name ?? key.charAt(0).toUpperCase() + key.slice(1);
  const labelSources = [entry?.name, entry?.title, entry?.shortName];
  let name = defaultLabel;
  for (const source of labelSources) {
    const candidate = normalizeLabel(source, defaultLabel);
    if (candidate && candidate !== defaultLabel) {
      name = candidate;
      break;
    }
  }
  const icon = extractClassIcon(entry) ?? fallback?.icon ?? null;
  return { key, name, icon };
}

function dedupeClassMetadata(entries: CatalogClassMetadata[]): CatalogClassMetadata[] {
  const map = new Map<string, CatalogClassMetadata>();
  entries.forEach((entry) => {
    if (!map.has(entry.key)) {
      map.set(entry.key, entry);
    }
  });
  return Array.from(map.values());
}

async function fetchClassMetadata(): Promise<CatalogClassMetadata[]> {
  const params = new URLSearchParams();
  params.set("$limit", "40");
  params.set("$skip", "0");
  params.set("lang", DEFAULT_LANG);
  const url = new URL(`/breeds?${params.toString()}`, DOFUS_API_HOST);
  try {
    const payload = await fetchJson(url);
    const dataset = extractDataset(payload);
    const metadata = dataset
      .map((entry: any) => normalizeClassMetadata(entry))
      .filter((value): value is CatalogClassMetadata => Boolean(value));
    const unique = dedupeClassMetadata(metadata);
    return unique.length ? unique : [...FALLBACK_CLASS_METADATA];
  } catch (error) {
    console.warn("Failed to load class keys", error);
    return [...FALLBACK_CLASS_METADATA];
  }
}

function buildCatalogFromItems(items: CatalogItem[], classEntries: CatalogClassMetadata[]): Catalog {
  const bySlot = Object.fromEntries(
    SLOTS.map((slot) => [slot, items.filter((item) => item.slot === slot)]),
  ) as Record<TrainingSlotKey, CatalogItem[]>;
  const themes = Array.from(new Set(items.flatMap((item) => item.themeTags))).filter(Boolean);
  const classMetadata = Object.fromEntries(
    classEntries.map((entry) => [entry.key, entry] as [string, CatalogClassMetadata]),
  );
  const classes = classEntries.map((entry) => entry.key);
  return {
    updatedAt: Date.now(),
    items,
    bySlot,
    themes,
    classes,
    classMetadata,
  };
}

function buildFallbackCatalog(): Catalog {
  const fallbackItems: CatalogItem[] = [
    {
      id: 1001,
      label: "Coiffe du Bravache",
      slot: "coiffe",
      themeTags: ["feu"],
      classTags: ["iop", "sacrieur"],
      palette: ["#F4A261", "#E76F51", "#2A9D8F"],
      hues: paletteToHues(["#F4A261", "#E76F51", "#2A9D8F"]),
      isColorable: true,
      isJoker: false,
      rarity: 3,
      imageUrl: null,
      rendererKey: null,
    },
    {
      id: 1002,
      label: "Cape de l'Aube",
      slot: "cape",
      themeTags: ["lumiere"],
      classTags: ["eniripsa", "feca"],
      palette: ["#E9C46A", "#264653", "#2A9D8F"],
      hues: paletteToHues(["#E9C46A", "#264653", "#2A9D8F"]),
      isColorable: false,
      isJoker: false,
      rarity: 2,
      imageUrl: null,
      rendererKey: null,
    },
    {
      id: 1003,
      label: "Bouclier Boréal",
      slot: "bouclier",
      themeTags: ["glace"],
      classTags: ["feca"],
      palette: ["#577590", "#43AA8B", "#90BE6D"],
      hues: paletteToHues(["#577590", "#43AA8B", "#90BE6D"]),
      isColorable: false,
      isJoker: false,
      rarity: 4,
      imageUrl: null,
      rendererKey: null,
    },
    {
      id: 1004,
      label: "Familier Lumille",
      slot: "familier",
      themeTags: ["air"],
      classTags: ["cra"],
      palette: ["#219EBC", "#8ECAE6", "#FFB703"],
      hues: paletteToHues(["#219EBC", "#8ECAE6", "#FFB703"]),
      isColorable: true,
      isJoker: false,
      rarity: 1,
      imageUrl: null,
      rendererKey: null,
    },
    {
      id: 1005,
      label: "Épaulettes Telluriques",
      slot: "epauliere",
      themeTags: ["terre"],
      classTags: ["sadida"],
      palette: ["#606C38", "#283618", "#DDA15E"],
      hues: paletteToHues(["#606C38", "#283618", "#DDA15E"]),
      isColorable: false,
      isJoker: false,
      rarity: 3,
      imageUrl: null,
      rendererKey: null,
    },
    {
      id: 1006,
      label: "Costume Astral",
      slot: "costume",
      themeTags: ["stellaire"],
      classTags: ["xelor", "eliotrope"],
      palette: ["#264653", "#2A9D8F", "#E9C46A"],
      hues: paletteToHues(["#264653", "#2A9D8F", "#E9C46A"]),
      isColorable: true,
      isJoker: false,
      rarity: 5,
      imageUrl: null,
      rendererKey: null,
    },
    {
      id: 1007,
      label: "Ailes d'Opaline",
      slot: "ailes",
      themeTags: ["celeste"],
      classTags: ["enu", "eniripsa"],
      palette: ["#4CC9F0", "#4361EE", "#7209B7"],
      hues: paletteToHues(["#4CC9F0", "#4361EE", "#7209B7"]),
      isColorable: false,
      isJoker: false,
      rarity: 4,
      imageUrl: null,
      rendererKey: null,
    },
  ];
  return buildCatalogFromItems(fallbackItems, [...FALLBACK_CLASS_METADATA]);
}

let catalogCache: Catalog | null = null;

export async function getCatalog(): Promise<Catalog> {
  if (catalogCache) {
    return catalogCache;
  }
  try {
    const classEntries = await fetchClassMetadata();
    const seed = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
    const itemsBySlot = await Promise.all(
      SLOTS.map(async (slot) => {
        const items = await fetchItemsForSlot(slot, seed);
        if (items.length) {
          return items;
        }
        return [] as CatalogItem[];
      }),
    );
    const items = itemsBySlot.flat();
    if (!items.length) {
      const fallback = buildFallbackCatalog();
      catalogCache = fallback;
      return fallback;
    }
    const catalog = buildCatalogFromItems(
      items,
      classEntries.length ? classEntries : [...FALLBACK_CLASS_METADATA],
    );
    catalogCache = catalog;
    return catalog;
  } catch (error) {
    console.warn("training catalog generation failed", error);
    const fallback = buildFallbackCatalog();
    catalogCache = fallback;
    return fallback;
  }
}

export { SLOTS as TRAINING_SLOTS };
