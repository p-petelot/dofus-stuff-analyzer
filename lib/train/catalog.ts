import fs from "fs";
import path from "path";
import { jitter, createRng } from "./random";
import { clampHue, paletteToHues, hslToHex } from "./color";
import type { Catalog, CatalogItem, TrainingSlotKey } from "./types";

const CACHE_PATH = path.join(process.cwd(), ".cache", "training-catalog.json");
const ITEM_API_URL = process.env.ITEM_CATALOG_URL ?? "https://skin.souff.fr/api/training/catalog";

const TRAINING_SLOTS: TrainingSlotKey[] = [
  "coiffe",
  "cape",
  "bottes",
  "amulette",
  "anneau",
  "ceinture",
  "bouclier",
  "familier",
  "arme",
];

interface RemoteItemPayload {
  id: number;
  label: string;
  slot: TrainingSlotKey;
  themeTags?: string[];
  classTags?: string[];
  palette?: string[];
  colorizable?: boolean;
  isJoker?: boolean;
  rarity?: number;
  imageUrl?: string | null;
  rendererKey?: string | null;
}

function ensureCacheDir(): void {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function coerceArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry));
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
}

function normalizeRemoteItem(payload: RemoteItemPayload, seed: string): CatalogItem {
  const palette = payload.palette?.length ? payload.palette : generateSyntheticPalette(seed);
  const hues = paletteToHues(palette);
  const themeTags = coerceArray(payload.themeTags);
  const classTags = coerceArray(payload.classTags);
  return {
    id: payload.id,
    label: payload.label,
    slot: payload.slot,
    themeTags,
    classTags,
    palette,
    hues,
    isColorable: Boolean(payload.colorizable),
    isJoker: Boolean(payload.isJoker),
    rarity: payload.rarity,
    imageUrl: payload.imageUrl ?? null,
    rendererKey: payload.rendererKey ?? null,
  };
}

function generateSyntheticPalette(seed: string): string[] {
  const rng = createRng(seed);
  const base = rng.next() * 360;
  const palette: string[] = [];
  const steps = [0, 30, -40, 160].slice(0, rng.int(3) + 3);
  for (const step of steps) {
    const hue = clampHue(base + step + jitter(0, 8, rng));
    palette.push(hslToHex(hue, 0.6, 0.55));
  }
  return palette;
}

function buildCatalog(items: CatalogItem[]): Catalog {
  const bySlot = Object.fromEntries(
    TRAINING_SLOTS.map((slot) => [slot, items.filter((item) => item.slot === slot)]),
  ) as Record<TrainingSlotKey, CatalogItem[]>;
  const themes = Array.from(new Set(items.flatMap((item) => item.themeTags))).filter(Boolean);
  const classes = Array.from(new Set(items.flatMap((item) => item.classTags))).filter(Boolean);
  return {
    updatedAt: Date.now(),
    items,
    bySlot,
    themes,
    classes,
  };
}

function loadCatalogFromDisk(): Catalog | null {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw = fs.readFileSync(CACHE_PATH, "utf8");
      const parsed = JSON.parse(raw) as Catalog;
      return parsed;
    }
  } catch (error) {
    console.warn("training catalog load failed", error);
  }
  return null;
}

function persistCatalog(catalog: Catalog): void {
  try {
    ensureCacheDir();
    fs.writeFileSync(CACHE_PATH, JSON.stringify(catalog));
  } catch (error) {
    console.warn("training catalog persistence failed", error);
  }
}

const FALLBACK_ITEMS: CatalogItem[] = [
  {
    id: 1,
    label: "Coiffe du Soleil",
    slot: "coiffe",
    themeTags: ["feu", "royal"],
    classTags: ["iop", "cra"],
    palette: ["#FFB347", "#FF9100"],
    hues: [35, 25],
    isColorable: true,
    isJoker: false,
    imageUrl: null,
    rendererKey: null,
  },
  {
    id: 2,
    label: "Cape de l'Aurore",
    slot: "cape",
    themeTags: ["air", "aventurier"],
    classTags: ["iop", "enu"],
    palette: ["#FF6F91", "#FFC1CF"],
    hues: [345, 350],
    isColorable: true,
    isJoker: false,
    imageUrl: null,
    rendererKey: null,
  },
  {
    id: 3,
    label: "Bottes de l'Eclipse",
    slot: "bottes",
    themeTags: ["tenebres", "air"],
    classTags: ["sram", "eniripsa"],
    palette: ["#2D2A4A", "#3F3A6B"],
    hues: [250, 240],
    isColorable: false,
    isJoker: false,
    imageUrl: null,
    rendererKey: null,
  },
  {
    id: 4,
    label: "Amulette du Bosquet",
    slot: "amulette",
    themeTags: ["nature", "terre"],
    classTags: ["sadida", "eniripsa"],
    palette: ["#5E8C31", "#3B5323"],
    hues: [110, 100],
    isColorable: false,
    isJoker: false,
    imageUrl: null,
    rendererKey: null,
  },
  {
    id: 5,
    label: "Anneau du Mistral",
    slot: "anneau",
    themeTags: ["air", "aventurier"],
    classTags: ["cra", "eliotrope"],
    palette: ["#A6E7FF", "#3EB5FF"],
    hues: [190, 200],
    isColorable: false,
    isJoker: true,
    imageUrl: null,
    rendererKey: null,
  },
  {
    id: 6,
    label: "Ceinture de Braise",
    slot: "ceinture",
    themeTags: ["feu", "forgeron"],
    classTags: ["iop", "roublard"],
    palette: ["#F46036", "#DD2E0F"],
    hues: [15, 10],
    isColorable: true,
    isJoker: false,
    imageUrl: null,
    rendererKey: null,
  },
  {
    id: 7,
    label: "Bouclier Astral",
    slot: "bouclier",
    themeTags: ["cosmos", "royal"],
    classTags: ["feca", "xelor"],
    palette: ["#5B5EA6", "#A1D2CE"],
    hues: [245, 180],
    isColorable: false,
    isJoker: false,
    imageUrl: null,
    rendererKey: null,
  },
  {
    id: 8,
    label: "Familier Polychrome",
    slot: "familier",
    themeTags: ["compagnon", "multicolore"],
    classTags: ["toutes"],
    palette: ["#F7C59F", "#2A9D8F", "#E76F51"],
    hues: [28, 170, 15],
    isColorable: true,
    isJoker: true,
    imageUrl: null,
    rendererKey: null,
  },
  {
    id: 9,
    label: "Épée Boreale",
    slot: "arme",
    themeTags: ["glace", "royal"],
    classTags: ["iop", "feca"],
    palette: ["#8ecae6", "#219ebc", "#023047"],
    hues: [200, 195, 210],
    isColorable: false,
    isJoker: false,
    imageUrl: null,
    rendererKey: null,
  },
];

let catalogCache: Catalog | null = null;

async function fetchRemoteCatalog(): Promise<Catalog | null> {
  try {
    const response = await fetch(ITEM_API_URL, { method: "GET" });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as RemoteItemPayload[];
    if (!Array.isArray(payload) || payload.length === 0) {
      return null;
    }
    const normalized = payload.map((item) => normalizeRemoteItem(item, `${item.id}-${item.label}`));
    return buildCatalog(normalized);
  } catch (error) {
    console.warn("training catalog remote fetch failed", error);
    return null;
  }
}

export async function getCatalog(): Promise<Catalog> {
  if (catalogCache) {
    return catalogCache;
  }
  const disk = loadCatalogFromDisk();
  if (disk) {
    catalogCache = disk;
    return disk;
  }
  const remote = await fetchRemoteCatalog();
  if (remote) {
    catalogCache = remote;
    persistCatalog(remote);
    return remote;
  }
  const fallback = buildCatalog(FALLBACK_ITEMS);
  catalogCache = fallback;
  persistCatalog(fallback);
  return fallback;
}

export function clearCatalogCache(): void {
  catalogCache = null;
}

export { TRAINING_SLOTS };
