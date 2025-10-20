import crypto from "crypto";
import type { ItemMeta, SlotKey } from "../types";
import { SLOTS } from "../config/suggestions";

const DOFUS_API_HOST = "https://api.dofusdb.fr";
const DEFAULT_LANGUAGE = "fr";

const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36",
  Referer: "https://dofusdb.fr/",
  Accept: "application/json",
};

interface SlotRequestConfig {
  typeIds?: number[];
  typeNames?: string[];
  typeSlugs?: string[];
  skip?: number;
  limit?: number;
  maxPages?: number;
}

const SLOT_REQUESTS: Record<SlotKey, SlotRequestConfig[]> = {
  coiffe: [
    {
      typeIds: [16, 246],
      typeNames: ["Coiffe", "Coiffe d'apparat"],
      skip: 0,
      limit: 1600,
    },
  ],
  cape: [
    {
      typeIds: [17, 247],
      typeNames: ["Cape", "Cape d'apparat"],
      skip: 0,
      limit: 1600,
    },
  ],
  bouclier: [
    {
      typeIds: [82, 248],
      typeNames: ["Bouclier", "Bouclier d'apparat"],
      skip: 0,
      limit: 1600,
    },
  ],
  familier: [
    {
      typeIds: [18, 97, 121, 196, 207, 249, 250],
      typeNames: [
        "Familier",
        "Familier d'apparat",
        "Montilier",
        "Monture",
        "Montures",
        "Dragodinde",
        "Dragodindes",
        "Muldo",
        "Muldos",
        "Volkorne",
        "Volkornes",
      ],
      skip: 0,
      limit: 2000,
    },
  ],
  epauliere: [
    {
      typeIds: [299],
      typeNames: ["Épaulière", "Épaulière d'apparat", "Epaulière", "Epaulière d'apparat"],
      skip: 0,
      limit: 800,
    },
  ],
  costume: [
    {
      typeIds: [199],
      typeNames: ["Costume", "Costume d'apparat"],
      skip: 0,
      limit: 800,
    },
  ],
  ailes: [
    {
      typeIds: [300],
      typeNames: ["Ailes", "Ailes d'apparat"],
      skip: 0,
      limit: 800,
    },
  ],
};

const BREED_FALLBACK_ORDER = ["iop", "cra", "eniripsa", "sram", "sacrieur", "feca"];

interface ItemTypeIndexEntry {
  id: number;
  aliases: string[];
}

interface ItemTypeIndex {
  entries: ItemTypeIndexEntry[];
  aliasLookup: Map<string, Set<number>>;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickLocalized(value: unknown, language = DEFAULT_LANGUAGE): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => pickLocalized(entry, language)).filter(Boolean).join(" ");
  }

  if (isObject(value)) {
    const direct = value[language];
    if (typeof direct === "string" && direct.trim()) {
      return direct;
    }
    for (const candidate of Object.values(value)) {
      const picked = pickLocalized(candidate, language);
      if (picked) {
        return picked;
      }
    }
  }

  return "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function ensureAbsoluteUrl(input: unknown): string | undefined {
  if (typeof input !== "string" || !input.trim()) {
    return undefined;
  }
  const trimmed = input.trim();
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  const prefixed = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${DOFUS_API_HOST}${prefixed}`;
}

function extractArray<T>(payload: unknown, fallback: T[] = []): T[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (isObject(payload)) {
    const candidates = ["results", "items", "data", "values"];
    for (const key of candidates) {
      const value = payload[key];
      if (Array.isArray(value)) {
        return value as T[];
      }
    }
  }
  return fallback;
}

function ensureNumericId(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return null;
}

function addAlias(target: Set<string>, value: string | null | undefined): void {
  if (!value) {
    return;
  }
  const normalized = slugify(normalizeWhitespace(value));
  if (!normalized) {
    return;
  }
  target.add(normalized);
  if (normalized.endsWith("s")) {
    target.add(normalized.slice(0, -1));
  }
  if (normalized.endsWith("es")) {
    target.add(normalized.slice(0, -2));
  }
}

function buildTypeIndex(rawTypes: Record<string, unknown>[], language = DEFAULT_LANGUAGE): ItemTypeIndex {
  const entries: ItemTypeIndexEntry[] = [];
  const aliasLookup = new Map<string, Set<number>>();
  const languages = Array.from(new Set([language, DEFAULT_LANGUAGE, "en", "fr"])) as string[];

  for (const raw of rawTypes) {
    const id = ensureNumericId(readField(raw, "id"), readField(raw, "_id"), readField(raw, "ankamaId"));
    if (id === null) {
      continue;
    }
    const aliases = new Set<string>();
    for (const lang of languages) {
      const name = pickLocalized(readField(raw, "name") ?? readField(raw, "title"), lang);
      addAlias(aliases, name);
      const slugSource = pickLocalized(readField(raw, "slug"), lang);
      addAlias(aliases, slugSource);
    }
    const slugFallback = readField<unknown>(raw, "slug");
    if (typeof slugFallback === "string") {
      addAlias(aliases, slugFallback);
    }
    const nameFallback = readField<unknown>(raw, "name");
    if (typeof nameFallback === "string") {
      addAlias(aliases, nameFallback);
    }
    if (!aliases.size) {
      continue;
    }
    const uniqueAliases = Array.from(aliases);
    entries.push({ id, aliases: uniqueAliases });
    for (const alias of uniqueAliases) {
      if (!aliasLookup.has(alias)) {
        aliasLookup.set(alias, new Set());
      }
      aliasLookup.get(alias)?.add(id);
    }
  }

  return { entries, aliasLookup };
}

function matchTypeIds(
  config: SlotRequestConfig,
  typeIndex: ItemTypeIndex | null,
): number[] {
  const resolved = new Set<number>();
  for (const id of config.typeIds ?? []) {
    if (typeof id === "number" && Number.isFinite(id)) {
      resolved.add(id);
    }
  }
  if (!typeIndex) {
    return Array.from(resolved);
  }
  const queries = [
    ...(config.typeNames ?? []),
    ...(config.typeSlugs ?? []),
  ];
  for (const query of queries) {
    if (!query) continue;
    const normalized = slugify(normalizeWhitespace(query));
    if (!normalized) continue;
    const directMatches = typeIndex.aliasLookup.get(normalized);
    if (directMatches) {
      for (const id of directMatches) {
        resolved.add(id);
      }
      continue;
    }
    for (const entry of typeIndex.entries) {
      if (entry.aliases.some((alias) => alias.includes(normalized) || normalized.includes(alias))) {
        resolved.add(entry.id);
      }
    }
  }
  return Array.from(resolved);
}

function normalizeHex(input: unknown): string | null {
  if (typeof input === "number" && Number.isFinite(input)) {
    const clamped = Math.max(0, Math.min(0xffffff, Math.floor(input)));
    return `#${clamped.toString(16).padStart(6, "0").toUpperCase()}`;
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    const match = trimmed.match(/[0-9a-fA-F]{6}/);
    if (match) {
      return `#${match[0].toUpperCase()}`;
    }
    if (/^\d+$/.test(trimmed)) {
      return normalizeHex(Number(trimmed));
    }
  }
  return null;
}

function readField<T>(raw: Record<string, unknown>, key: string): T | undefined {
  const value = raw[key];
  return value as T | undefined;
}

function buildItemMeta(raw: Record<string, unknown>, slot: SlotKey): ItemMeta | null {
  const nameSource =
    readField<unknown>(raw, "name") ??
    readField<unknown>(raw, "title") ??
    readField<unknown>(raw, "label") ??
    readField<unknown>(raw, "text");
  const name = normalizeWhitespace(pickLocalized(nameSource, DEFAULT_LANGUAGE));
  if (!name) {
    return null;
  }

  const numericId = ensureNumericId(readField(raw, "ankamaId"), readField(raw, "id"), readField(raw, "_id"));
  if (numericId === null) {
    const hash = crypto.createHash("sha1").update(JSON.stringify({ slot, name })).digest("hex");
    const fallbackId = parseInt(hash.slice(0, 10), 16);
    if (!Number.isFinite(fallbackId)) {
      return null;
    }
    return {
      id: fallbackId,
      label: name,
      slot,
      setId: undefined,
      tags: [],
      palette: [],
      thumb: ensureAbsoluteUrl(
        readField(raw, "img") ?? readField(raw, "icon") ?? readField(raw, "image") ?? readField(raw, "illustration"),
      ),
      sprite: ensureAbsoluteUrl(
        readField<Record<string, unknown>>(raw, "look")?.img ??
          readField(raw, "image") ??
          readField(raw, "icon") ??
          readField(raw, "img"),
      ),
    };
  }

  const colors = readField<unknown>(raw, "colors");
  const paletteSource = Array.isArray(colors)
    ? (colors as unknown[])
        .map((value) => normalizeHex(value))
        .filter((value): value is string => Boolean(value))
        .slice(0, 6)
    : [];

  const look = readField<Record<string, unknown>>(raw, "look");
  const lookImg = look ? readField<string>(look, "img") : undefined;
  const illustration = readField(raw, "illustration");
  const itemSet = readField<Record<string, unknown>>(raw, "itemSet");
  const itemSetIdentifier = itemSet ? readField(itemSet, "_id") : undefined;
  const thumb = ensureAbsoluteUrl(
    readField(raw, "img") ?? readField(raw, "icon") ?? readField(raw, "image") ?? lookImg ?? illustration,
  );
  const sprite = ensureAbsoluteUrl(
    lookImg ?? readField(raw, "image") ?? readField(raw, "icon") ?? readField(raw, "img") ?? illustration,
  );

  return {
    id: numericId,
    label: name,
    slot,
    setId: ensureNumericId(readField(raw, "setId"), readField(raw, "itemSetId"), itemSetIdentifier) ?? undefined,
    tags: Array.isArray(readField(raw, "tags"))
      ? (readField(raw, "tags") as unknown[])
          .map((value) => (typeof value === "string" ? value : ""))
          .filter(Boolean)
      : [],
    palette: paletteSource,
    thumb: thumb ?? sprite ?? undefined,
    sprite: sprite ?? thumb ?? undefined,
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) {
    const message = `DofusDB request failed (${response.status})`;
    throw new Error(message);
  }
  return response.json();
}

async function fetchItemTypes(language = DEFAULT_LANGUAGE): Promise<ItemTypeIndex | null> {
  try {
    const results: Record<string, unknown>[] = [];
    const pageSize = 200;
    let skip = 0;
    for (let page = 0; page < 50; page += 1) {
      const params = new URLSearchParams();
      params.set("lang", language);
      params.set("$skip", String(skip));
      params.set("$limit", String(pageSize));
      const url = `${DOFUS_API_HOST}/item-types?${params.toString()}`;
      const payload = await fetchJson(url);
      const entries = extractArray<Record<string, unknown>>(payload);
      if (!entries.length) {
        break;
      }
      results.push(...entries);
      if (entries.length < pageSize) {
        break;
      }
      skip += pageSize;
    }
    if (!results.length) {
      return null;
    }
    return buildTypeIndex(results, language);
  } catch (error) {
    console.warn("Failed to fetch item types", error);
  }
  return null;
}

async function fetchItemsForSlot(
  slot: SlotKey,
  typeIndex: ItemTypeIndex | null,
  language = DEFAULT_LANGUAGE,
): Promise<ItemMeta[]> {
  const configs = SLOT_REQUESTS[slot] ?? [];
  const results = new Map<number, ItemMeta>();

  for (const config of configs) {
    const baseSkip = config.skip ?? 0;
    const pageSize = Math.max(1, Math.min(config.limit ?? 800, 2000));
    const maxPages = Math.max(1, config.maxPages ?? 25);
    let skip = baseSkip;
    const typeIds = matchTypeIds(config, typeIndex);
    if (!typeIds.length) {
      continue;
    }

    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams();
      params.set("lang", language);
      params.set("$skip", String(skip));
      params.set("$limit", String(pageSize));
      for (const typeId of typeIds) {
        params.append("typeId[$in][]", String(typeId));
      }

      const url = `${DOFUS_API_HOST}/items?${params.toString()}`;
      const payload = await fetchJson(url);
      const entries = extractArray<Record<string, unknown>>(payload);
      if (!entries.length) {
        break;
      }
      for (const entry of entries) {
        const meta = buildItemMeta(entry, slot);
        if (meta) {
          results.set(meta.id, meta);
        }
      }
      if (entries.length < pageSize) {
        break;
      }
      skip += pageSize;
    }
  }

  return Array.from(results.values());
}

export async function fetchItemsForIndex(
  language = DEFAULT_LANGUAGE,
): Promise<Record<SlotKey, ItemMeta[]>> {
  const typeIndex = await fetchItemTypes(language);
  const items: Partial<Record<SlotKey, ItemMeta[]>> = {};
  for (const slot of SLOTS) {
    items[slot] = await fetchItemsForSlot(slot, typeIndex, language);
  }
  return items as Record<SlotKey, ItemMeta[]>;
}

export interface BreedOption {
  code: string;
  name: string;
  icon?: string;
  sortIndex: number;
}

export async function fetchDofusBreeds(language = DEFAULT_LANGUAGE): Promise<BreedOption[]> {
  const params = new URLSearchParams();
  params.set("lang", language);
  params.set("$skip", "0");
  params.set("$limit", "50");
  const url = `${DOFUS_API_HOST}/breeds?${params.toString()}`;
  const payload = await fetchJson(url);
  const entries = extractArray<Record<string, unknown>>(payload);
  const breeds: BreedOption[] = [];

  for (const entry of entries) {
    const name = normalizeWhitespace(pickLocalized(entry.name ?? entry.title, language));
    if (!name) {
      continue;
    }
    const slugSource =
      pickLocalized(entry.slug, language) || pickLocalized(entry.className, language) || name;
    const code = slugify(slugSource || name);
    if (!code) {
      continue;
    }
    const sortIndex = ensureNumericId(entry.id, entry.order, entry.sortIndex) ??
      (BREED_FALLBACK_ORDER.indexOf(code) >= 0
        ? BREED_FALLBACK_ORDER.indexOf(code)
        : BREED_FALLBACK_ORDER.length + breeds.length);
    const icon = ensureAbsoluteUrl(entry.img ?? entry.icon ?? entry.image ?? entry.portrait);
    breeds.push({ code, name, icon, sortIndex });
  }

  breeds.sort((a, b) => a.sortIndex - b.sortIndex || a.name.localeCompare(b.name));
  return breeds;
}
