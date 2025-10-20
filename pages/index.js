import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  DEFAULT_LANGUAGE,
  getLanguagePriority,
  normalizeLanguage,
  translate,
  useLanguage,
} from "../lib/i18n";
import {
  DOFUS_API_HOST,
  DOFUS_API_BASE_URL,
  DOFUS_DEFAULT_LIMIT,
  FAMILIER_TYPE_GROUPS,
  SLOT_REQUEST_SOURCES,
  getDefaultDofusItemParams,
} from "../lib/items/dofusSources";

const ITEM_TYPES = ["coiffe", "cape", "bouclier", "familier", "epauliere", "costume", "ailes"];

let activeLocalizationPriority = getLanguagePriority();

function setActiveLocalizationPriority(language) {
  activeLocalizationPriority = getLanguagePriority(language);
}

function getActiveLocalizationPriority() {
  if (!Array.isArray(activeLocalizationPriority) || activeLocalizationPriority.length === 0) {
    activeLocalizationPriority = getLanguagePriority();
  }
  return activeLocalizationPriority;
}

function getDefaultDofusQueryParams(language = DEFAULT_LANGUAGE) {
  return getDefaultDofusItemParams(language);
}

function buildBreedsUrl(language = DEFAULT_LANGUAGE) {
  const normalized = language ?? DEFAULT_LANGUAGE;
  const params = new URLSearchParams();
  params.set("$skip", "0");
  params.set("$limit", "20");
  params.set("lang", normalized);
  return `${DOFUS_API_HOST}/breeds?${params.toString()}`;
}

const FAMILIER_FILTERS = Object.freeze(
  FAMILIER_TYPE_GROUPS.map((group) => ({
    key: group.key,
    labelKey: `companions.filters.${group.key}`,
    typeIds: group.typeIds,
  })),
);

const FAMILIER_TYPE_ID_TO_FILTER_KEY = new Map();
FAMILIER_FILTERS.forEach((filter) => {
  filter.typeIds.forEach((typeId) => {
    FAMILIER_TYPE_ID_TO_FILTER_KEY.set(typeId, filter.key);
  });
});

const ITEM_FLAG_FILTERS = Object.freeze([
  { key: "colorable", labelKey: "items.filters.colorable", flagKey: "isColorable" },
  { key: "cosmetic", labelKey: "items.filters.cosmetic", flagKey: "isCosmetic" },
]);

const ITEM_TYPE_CONFIG = Object.fromEntries(
  Object.entries(SLOT_REQUEST_SOURCES).map(([slot, requests]) => [slot, { requests }]),
);

const MAX_ITEM_PALETTE_COLORS = 6;
const IMAGE_REFERENCE_KEYS = [
  "url",
  "href",
  "img",
  "image",
  "icon",
  "fullSize",
  "large",
  "medium",
  "small",
  "src",
];

function slugify(value) {
  if (!value) return "";
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function stripHtml(value) {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, " ");
}

function normalizeWhitespace(value) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function pickLocalizedValue(value, languagePriority = getActiveLocalizationPriority()) {
  if (!value) return "";
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => pickLocalizedValue(entry, languagePriority)).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    const priorityKeys = Array.isArray(languagePriority) && languagePriority.length
      ? languagePriority
      : getActiveLocalizationPriority();
    for (const key of priorityKeys) {
      if (value[key]) {
        const candidate = pickLocalizedValue(value[key], languagePriority);
        if (candidate) {
          return candidate;
        }
      }
    }
    const first = Object.values(value)[0];
    return pickLocalizedValue(first, languagePriority);
  }
  return "";
}

function normalizeTextContent(value, languagePriority = getActiveLocalizationPriority()) {
  const extracted = pickLocalizedValue(value, languagePriority);
  if (!extracted) {
    return "";
  }
  return normalizeWhitespace(stripHtml(extracted));
}

function normalizeColorToHex(color) {
  if (color === null || color === undefined) {
    return null;
  }

  if (typeof color === "number" && Number.isFinite(color)) {
    const hex = Math.max(0, Math.floor(color)).toString(16).padStart(6, "0").slice(-6);
    return `#${hex.toUpperCase()}`;
  }

  if (typeof color === "string") {
    const trimmed = color.trim();
    if (!trimmed) return null;
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    const hexMatch = trimmed.match(/[0-9a-fA-F]{6}/);
    if (hexMatch) {
      return `#${hexMatch[0].toUpperCase()}`;
    }
    if (/^\d+$/.test(trimmed)) {
      return normalizeColorToHex(Number(trimmed));
    }
  }

  if (typeof color === "object") {
    if (color.hex) return normalizeColorToHex(color.hex);
    if (color.value) return normalizeColorToHex(color.value);
    if (color.color) return normalizeColorToHex(color.color);
  }

  return null;
}

function normalizeSelection(indexes, limit, poolLength) {
  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(poolLength) || poolLength <= 0) {
    return { indexes: [], changed: Array.isArray(indexes) && indexes.length > 0 };
  }

  const previous = Array.isArray(indexes) ? indexes : [];
  const used = new Set();
  const normalized = Array.from({ length: limit }, (_, slotIndex) => {
    let candidate = previous[slotIndex];
    if (!Number.isFinite(candidate) || candidate < 0 || candidate >= poolLength) {
      candidate = slotIndex;
    }

    let safety = 0;
    while (used.has(candidate) && safety < poolLength) {
      candidate = (candidate + 1) % poolLength;
      safety += 1;
    }

    used.add(candidate);
    return candidate;
  });

  const changed =
    normalized.length !== previous.length ||
    normalized.some((value, index) => value !== previous[index]);

  return { indexes: normalized, changed };
}

function cycleItemSelection(indexes, limit, poolLength, targetSlot, options = {}) {
  const normalizedResult = normalizeSelection(indexes, limit, poolLength);
  const normalized = normalizedResult.indexes;
  let changed = normalizedResult.changed;

  if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(poolLength) || poolLength <= 0) {
    return { indexes: normalized, selection: null, changed };
  }

  if (!Number.isFinite(targetSlot) || targetSlot < 0 || targetSlot >= limit) {
    return { indexes: normalized, selection: null, changed };
  }

  if (Number.isFinite(options.forcedSelection)) {
    const desired = Math.min(poolLength - 1, Math.max(0, Math.trunc(options.forcedSelection)));
    const used = new Set([desired]);
    const updated = Array.from({ length: limit }, (_, slotIndex) => {
      if (slotIndex === targetSlot) {
        return desired;
      }

      let candidate = normalized[slotIndex];
      if (!Number.isFinite(candidate) || candidate < 0 || candidate >= poolLength) {
        candidate = slotIndex >= targetSlot ? slotIndex + 1 : slotIndex;
      }

      let safety = 0;
      while (used.has(candidate) && safety < poolLength) {
        candidate = (candidate + 1) % poolLength;
        safety += 1;
      }

      used.add(candidate);
      return candidate;
    });

    const updatedChanged =
      changed ||
      updated.length !== normalized.length ||
      updated.some((value, index) => value !== normalized[index]);

    return { indexes: updated, selection: desired, changed: updatedChanged };
  }

  const activeIndex = normalized[targetSlot];
  if (!Number.isFinite(activeIndex)) {
    return { indexes: normalized, selection: null, changed };
  }

  if (poolLength <= 1) {
    return { indexes: normalized, selection: activeIndex, changed };
  }

  const forbidden = new Set(normalized.filter((_, index) => index !== targetSlot));
  let nextIndex = activeIndex;
  let safety = 0;

  do {
    nextIndex = (nextIndex + 1) % poolLength;
    safety += 1;
  } while (forbidden.has(nextIndex) && safety < poolLength * 2);

  if (nextIndex === activeIndex || forbidden.has(nextIndex)) {
    return { indexes: normalized, selection: activeIndex, changed };
  }

  const updated = [...normalized];
  updated[targetSlot] = nextIndex;

  return { indexes: updated, selection: nextIndex, changed: true };
}

function extractPaletteFromItemData(item) {
  const palette = [];
  const seen = new Set();

  const register = (value) => {
    const hex = normalizeColorToHex(value);
    if (!hex || seen.has(hex)) {
      return;
    }
    seen.add(hex);
    palette.push(hex);
  };

  const sources = [
    item?.appearance?.colors,
    item?.look?.colors,
    item?.colors,
    item?.palette,
    item?.color,
    item?.visual?.colors,
  ];

  sources.forEach((source) => {
    if (!source) return;
    if (Array.isArray(source)) {
      source.forEach(register);
      return;
    }
    if (typeof source === "object") {
      Object.values(source).forEach(register);
      return;
    }
    register(source);
  });

  if (typeof item?.look === "string") {
    const hexMatches = item.look.match(/#?[0-9a-fA-F]{6}/g);
    if (hexMatches) {
      hexMatches.forEach(register);
    } else {
      const numericMatches = item.look.match(/\b\d{3,}\b/g);
      if (numericMatches) {
        numericMatches.forEach((match) => register(Number(match)));
      }
    }
  }

  return palette.slice(0, MAX_ITEM_PALETTE_COLORS);
}

function ensureAbsoluteUrl(path) {
  if (!path) return null;
  if (typeof path !== "string") return null;

  const trimmed = path.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `${DOFUS_API_HOST}${trimmed}`;
  }
  return `${DOFUS_API_HOST}/${trimmed}`;
}

function extractLookIdFromLookString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const directMatch = value.match(/\|\|(-?\d+)/);
  if (directMatch) {
    const parsed = Number(directMatch[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const numericMatches = value.match(/-?\d+/g);
  if (numericMatches && numericMatches.length) {
    const last = Number(numericMatches[numericMatches.length - 1]);
    if (Number.isFinite(last)) {
      return last;
    }
  }
  return null;
}

function extractLookIdFromUrl(url) {
  if (typeof url !== "string") {
    return null;
  }
  const match = url.match(/(\d+)(?=\.[a-z]+$)/i);
  if (match) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function normalizeBreedColors(input) {
  if (!Array.isArray(input)) {
    return { numeric: [], hex: [] };
  }

  const numeric = [];
  const hex = [];
  const seen = new Set();

  input.forEach((entry) => {
    let value = null;
    if (typeof entry === "number" && Number.isFinite(entry)) {
      value = Math.max(0, Math.floor(entry));
    } else if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (!trimmed) {
        return;
      }
      if (/^-?\d+$/.test(trimmed)) {
        const parsed = Number(trimmed);
        if (Number.isFinite(parsed)) {
          value = parsed;
        }
      } else {
        const normalizedHex = normalizeColorToHex(trimmed);
        if (normalizedHex) {
          const parsed = parseInt(normalizedHex.replace(/#/g, ""), 16);
          if (Number.isFinite(parsed)) {
            value = parsed;
          }
        }
      }
    }

    if (value === null || !Number.isFinite(value) || seen.has(value)) {
      return;
    }

    seen.add(value);
    numeric.push(value);
    const normalizedHex = normalizeColorToHex(value);
    if (normalizedHex) {
      hex.push(normalizedHex);
    }
  });

  return { numeric, hex };
}

function getBarbofusFaceId(classId, genderKey, fallback) {
  if (!Number.isFinite(classId)) {
    return Number.isFinite(fallback) ? fallback : null;
  }

  const entry = BARBOFUS_FACE_ID_BY_CLASS[classId];
  if (entry && Object.prototype.hasOwnProperty.call(entry, genderKey)) {
    const value = entry[genderKey];
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return Number.isFinite(fallback) ? fallback : null;
}

function normalizeBreedEntry(entry, options = {}) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const {
    language = DEFAULT_LANGUAGE,
    languagePriority = getActiveLocalizationPriority(),
    translator = translate,
  } = options;

  const id = Number(entry.id);
  if (!Number.isFinite(id)) {
    return null;
  }

  const fallbackName = translator(language, "identity.class.fallback", { id }, `Classe ${id}`);
  const name = normalizeTextContent(entry.shortName, languagePriority) || fallbackName;
  const slug = slugify(name) || `breed-${id}`;
  const icon = ensureAbsoluteUrl(entry.img);
  const maleLookId = extractLookIdFromLookString(entry.maleLook) ?? extractLookIdFromUrl(entry?.heads?.male);
  const femaleLookId =
    extractLookIdFromLookString(entry.femaleLook) ?? extractLookIdFromUrl(entry?.heads?.female);
  const maleColors = normalizeBreedColors(entry.maleColors);
  const femaleColors = normalizeBreedColors(entry.femaleColors);
  const maleFaceId = getBarbofusFaceId(id, "male", maleLookId);
  const femaleFaceId = getBarbofusFaceId(id, "female", femaleLookId);

  return {
    id,
    name,
    slug,
    icon,
    sortIndex: Number.isFinite(entry.sortIndex) ? entry.sortIndex : id,
    male: {
      lookId: Number.isFinite(maleLookId) ? maleLookId : null,
      faceId: maleFaceId,
      colors: maleColors,
    },
    female: {
      lookId: Number.isFinite(femaleLookId) ? femaleLookId : null,
      faceId: femaleFaceId,
      colors: femaleColors,
    },
  };
}

function extractBreedEntries(entries) {
  if (Array.isArray(entries)) {
    return entries;
  }

  if (entries && typeof entries === "object") {
    const candidateKeys = ["data", "value", "values", "results", "items", "breeds"];
    for (const key of candidateKeys) {
      if (Array.isArray(entries[key])) {
        return entries[key];
      }
    }

    if (entries.data && typeof entries.data === "object") {
      const nested = extractBreedEntries(entries.data);
      if (nested.length) {
        return nested;
      }
    }
  }

  return [];
}

function normalizeBreedsDataset(entries, options = {}) {
  const dataset = extractBreedEntries(entries);
  if (!dataset.length) {
    return [];
  }

  return dataset
    .map((entry) => normalizeBreedEntry(entry, options))
    .filter(Boolean)
    .sort((a, b) => {
      const aIndex = Number.isFinite(a.sortIndex) ? a.sortIndex : a.id;
      const bIndex = Number.isFinite(b.sortIndex) ? b.sortIndex : b.id;
      return aIndex - bIndex;
    });
}

function flattenImageReference(reference) {
  if (!reference) return null;
  if (typeof reference === "string") {
    return reference;
  }
  if (Array.isArray(reference)) {
    for (const entry of reference) {
      const nested = flattenImageReference(entry);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
  if (typeof reference === "object") {
    for (const key of IMAGE_REFERENCE_KEYS) {
      if (reference[key]) {
        const nested = flattenImageReference(reference[key]);
        if (nested) {
          return nested;
        }
      }
    }
  }
  return null;
}

function resolveItemImageUrl(item) {
  const candidates = [
    item?.img,
    item?.image,
    item?.icon,
    item?.images,
    item?.look?.img,
  ];

  for (const candidate of candidates) {
    const flattened = flattenImageReference(candidate);
    const absolute = ensureAbsoluteUrl(flattened);
    if (absolute) {
      return absolute;
    }
  }

  return null;
}

function buildDofusApiUrls(type, language = DEFAULT_LANGUAGE) {
  const config = ITEM_TYPE_CONFIG[type];
  if (!config) {
    throw new Error(`Type d'objet inconnu: ${type}`);
  }

  const sources = config.requests?.length ? config.requests : [config];

  return sources.map((source) => {
    const params = new URLSearchParams();
    Object.entries(getDefaultDofusQueryParams(language)).forEach(([key, value]) => {
      params.set(key, value);
    });

    const limit = source.limit ?? config.limit ?? DOFUS_DEFAULT_LIMIT;
    params.set("$limit", String(limit));

    const skip = source.skip ?? config.skip;
    if (typeof skip === "number") {
      params.set("$skip", String(skip));
    }

    const typeIds = source.typeIds ?? config.typeIds;
    if (!typeIds || !typeIds.length) {
      throw new Error(`Configuration Dofus invalide pour le type ${type}`);
    }
    typeIds.forEach((id) => {
      params.append("typeId[$in][]", String(id));
    });

    const query = { ...(config.query ?? {}), ...(source.query ?? {}) };
    Object.entries(query).forEach(([key, value]) => {
      params.set(key, value);
    });

    return `${DOFUS_API_BASE_URL}?${params.toString()}`;
  });
}

function buildEncyclopediaUrl(item, fallbackId, language = DEFAULT_LANGUAGE) {
  const ankamaId = item?.ankamaId ?? item?.id ?? item?._id ?? fallbackId;
  if (!ankamaId) {
    return null;
  }
  const normalized = typeof language === "string" && language.trim().length ? language.trim() : DEFAULT_LANGUAGE;
  return `https://dofusdb.fr/${normalized}/database/object/${ankamaId}`;
}

function normalizeBooleanFlag(...values) {
  for (const value of values) {
    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      if (value > 0) {
        return true;
      }
      if (value === 0) {
        return false;
      }
      continue;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (!normalized) {
        continue;
      }
      if (["true", "1", "yes", "y", "oui", "vrai", "si", "sí", "sim", "ja", "verdadeiro"].includes(normalized)) {
        return true;
      }
      if (["false", "0", "no", "n", "non", "faux", "nao", "não", "nein"].includes(normalized)) {
        return false;
      }
    }
  }

  return false;
}

const ITEM_FLAG_CONFIG = {
  cosmetic: {
    icon: "/icons/cosmetic.svg",
    labelKey: "items.flags.cosmetic",
    fallback: "Cosmetic item",
    className: "item-flag--cosmetic",
  },
  colorable: {
    icon: "/icons/colorable.svg",
    labelKey: "items.flags.colorable",
    fallback: "Matches character colors",
    className: "item-flag--colorable",
  },
};

function buildItemFlags(item, translator) {
  if (!item) {
    return [];
  }

  const keys = [];

  if (item.isCosmetic === true) {
    keys.push("cosmetic");
  }

  if (item.isColorable === true) {
    keys.push("colorable");
  }

  return keys
    .map((key) => {
      const config = ITEM_FLAG_CONFIG[key];
      if (!config) {
        return null;
      }
      const label =
        typeof translator === "function"
          ? translator(config.labelKey, undefined, config.fallback ?? key)
          : config.fallback ?? key;
      if (!label || !config.icon) {
        return null;
      }
      return {
        key,
        icon: config.icon,
        label,
        className: config.className ?? null,
      };
    })
    .filter(Boolean);
}

function normalizeDofusItem(rawItem, type, options = {}) {
  const {
    language = DEFAULT_LANGUAGE,
    languagePriority = getActiveLocalizationPriority(),
    translator = translate,
  } = options;

  const name =
    normalizeTextContent(rawItem?.name, languagePriority) ||
    normalizeTextContent(rawItem?.title, languagePriority);
  if (!name) {
    return null;
  }

  const slugSource = normalizeTextContent(rawItem?.slug, languagePriority) || name;
  const fallbackSlug = slugify(slugSource) || slugify(name) || name;
  const rawIdentifier = rawItem?.ankamaId ?? rawItem?.id ?? rawItem?._id ?? fallbackSlug;
  const identifierString = rawIdentifier != null ? String(rawIdentifier) : fallbackSlug;
  const numericIdentifier = Number(rawIdentifier);
  const ankamaId = Number.isFinite(numericIdentifier) ? numericIdentifier : null;
  const normalizedLang = typeof language === "string" && language.trim().length ? language.trim() : DEFAULT_LANGUAGE;
  const encyclopediaUrl =
    buildEncyclopediaUrl(rawItem, rawIdentifier ?? fallbackSlug, normalizedLang) ??
    `https://www.dofus.com/${normalizedLang}/mmorpg/encyclopedie`;
  const imageUrl = resolveItemImageUrl(rawItem);
  const palette = extractPaletteFromItemData(rawItem);
  const paletteSource = palette.length ? "api" : "unknown";
  const rawTypeId = Number.isFinite(Number(rawItem?.typeId)) ? Number(rawItem.typeId) : null;
  const familierCategory =
    type === "familier" && rawTypeId != null
      ? FAMILIER_TYPE_ID_TO_FILTER_KEY.get(rawTypeId) ?? null
      : null;
  const superTypeId = Number.isFinite(Number(rawItem?.type?.superTypeId))
    ? Number(rawItem.type.superTypeId)
    : null;
  const superTypeNameFr =
    typeof rawItem?.type?.superType?.name?.fr === "string"
      ? rawItem.type.superType.name.fr.trim().toLowerCase()
      : null;
  const superTypeNameEn =
    typeof rawItem?.type?.superType?.name?.en === "string"
      ? rawItem.type.superType.name.en.trim().toLowerCase()
      : null;
  const isCosmetic = normalizeBooleanFlag(
    rawItem?.isCosmetic,
    rawItem?.itemSet?.isCosmetic,
    superTypeId === 22 ? true : null,
    superTypeNameFr === "cosmétiques" ? true : null,
    superTypeNameEn === "cosmetics" ? true : null
  );
  const isColorable = normalizeBooleanFlag(
    rawItem?.isColorable,
    rawItem?.appearance?.isColorable,
    rawItem?.type?.isColorable,
    rawItem?.isDyeable,
    rawItem?.dyeable
  );

  return {
    id: `${type}-${identifierString}`,
    name,
    type,
    palette,
    url: encyclopediaUrl,
    imageUrl,
    paletteSource,
    ankamaId,
    typeId: rawTypeId,
    familierCategory,
    isCosmetic,
    isColorable,
    signature: null,
    shape: null,
    tones: null,
    hash: null,
    edges: null,
  };
}

const BRAND_NAME = "KrosPalette";
const MAX_COLORS = 6;
const MAX_DIMENSION = 280;
const BUCKET_SIZE = 24;
const SIGNATURE_GRID_SIZE = 12;
const SHAPE_PROFILE_SIZE = 28;
const HASH_GRID_SIZE = 24;
const EDGE_GRID_SIZE = 28;
const EDGE_ORIENTATION_BINS = 8;
const HUE_BUCKETS = 12;
const HUE_NEUTRAL_INDEX = HUE_BUCKETS;
const MAX_TONE_DISTANCE = 2;
const PALETTE_SCORE_WEIGHT = 0.24;
const SIGNATURE_SCORE_WEIGHT = 0.28;
const SHAPE_SCORE_WEIGHT = 0.16;
const TONE_SCORE_WEIGHT = 0.18;
const HASH_SCORE_WEIGHT = 0.22;
const EDGE_SCORE_WEIGHT = 0.12;
const MAX_COLOR_DISTANCE = Math.sqrt(255 * 255 * 3);
const PALETTE_COVERAGE_THRESHOLD = 56;
const PALETTE_COVERAGE_WEIGHT = 0.32;
const SIGNATURE_CONFIDENCE_DISTANCE = 160;
const SIGNATURE_CONFIDENCE_WEIGHT = 0.24;
const SIGNATURE_STRONG_THRESHOLD = 20;
const SIGNATURE_PERFECT_THRESHOLD = 12;
const MAX_SHAPE_DISTANCE = 1;
const SHAPE_CONFIDENCE_DISTANCE = 0.32;
const SHAPE_CONFIDENCE_WEIGHT = 0.16;
const SHAPE_STRONG_THRESHOLD = 0.18;
const TONE_CONFIDENCE_DISTANCE = 0.72;
const TONE_CONFIDENCE_WEIGHT = 0.18;
const MIN_ALPHA_WEIGHT = 0.05;
const MAX_RECOMMENDATIONS = 12;
const PANEL_ITEMS_LIMIT = 5;
const PROPOSAL_COUNT = 5;
const HASH_CONFIDENCE_DISTANCE = 0.32;
const HASH_CONFIDENCE_WEIGHT = 0.18;
const HASH_STRONG_THRESHOLD = 0.12;
const EDGE_CONFIDENCE_DISTANCE = 0.26;
const EDGE_CONFIDENCE_WEIGHT = 0.12;
const EDGE_STRONG_THRESHOLD = 0.1;
const CURATED_COLOR_SWATCHES = ["#8B5CF6", "#F97316", "#10B981", "#38BDF8", "#F43F5E", "#FACC15"];

const ITEM_TYPE_LABEL_KEYS = {
  coiffe: "itemTypes.coiffe",
  cape: "itemTypes.cape",
  familier: "itemTypes.familier",
  bouclier: "itemTypes.bouclier",
  epauliere: "itemTypes.epauliere",
  costume: "itemTypes.costume",
  ailes: "itemTypes.ailes",
};

const BARBOFUS_BASE_URL = "https://barbofus.com/skinator";
const BARBOFUS_EQUIPMENT_SLOTS = ["6", "7", "8", "9", "10", "11", "12"];
const BARBOFUS_SLOT_BY_TYPE = {
  coiffe: "6",
  cape: "7",
  familier: "8",
  bouclier: "9",
  ailes: "10",
  epauliere: "11",
  costume: "12",
};

const LOOK_PREVIEW_SIZE = 512;
const BARBOFUS_FACE_ID_BY_CLASS = Object.freeze({
  1: { male: 1, female: 9 },
  2: { male: 17, female: 25 },
  3: { male: 33, female: 41 },
  4: { male: 49, female: 57 },
  5: { male: 65, female: 73 },
  6: { male: 81, female: 89 },
  7: { male: 97, female: 105 },
  8: { male: 113, female: 121 },
  9: { male: 129, female: 137 },
  10: { male: 145, female: 153 },
  11: { male: 161, female: 169 },
  12: { male: 177, female: 185 },
  13: { male: 193, female: 201 },
  14: { male: 209, female: 217 },
  15: { male: 225, female: 233 },
  16: { male: 241, female: 249 },
  17: { male: 257, female: 265 },
  18: { male: 273, female: 275 },
  19: { male: 294, female: 302 },
});
const BARBOFUS_DEFAULT_FACE_ENTRY = BARBOFUS_FACE_ID_BY_CLASS[7] ?? {};
const BARBOFUS_DEFAULTS = {
  gender: 1,
  classId: 7,
  lookId: 405,
  faceId: Number.isFinite(BARBOFUS_DEFAULT_FACE_ENTRY.female)
    ? BARBOFUS_DEFAULT_FACE_ENTRY.female
    : 105,
};
const BARBOFUS_GENDER_VALUES = {
  male: 0,
  female: 1,
};
const BARBOFUS_DEFAULT_GENDER_KEY =
  BARBOFUS_DEFAULTS.gender === BARBOFUS_GENDER_VALUES.male ? "male" : "female";
const EMPTY_BREED_COLORS = Object.freeze({ numeric: [], hex: [] });
const BARBOFUS_DEFAULT_BREED = Object.freeze({
  id: BARBOFUS_DEFAULTS.classId,
  name: "Eniripsa",
  slug: "eniripsa",
  icon: null,
  sortIndex: BARBOFUS_DEFAULTS.classId,
  male: {
    lookId: BARBOFUS_DEFAULTS.lookId,
    faceId: Number.isFinite(BARBOFUS_DEFAULT_FACE_ENTRY.male)
      ? BARBOFUS_DEFAULT_FACE_ENTRY.male
      : null,
    colors: EMPTY_BREED_COLORS,
  },
  female: {
    lookId: BARBOFUS_DEFAULTS.lookId,
    faceId: BARBOFUS_DEFAULTS.faceId,
    colors: EMPTY_BREED_COLORS,
  },
});

const LZ_KEY_STR_URI_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";

function getUriSafeCharFromInt(value) {
  return LZ_KEY_STR_URI_SAFE.charAt(value);
}

function _compress(uncompressed, bitsPerChar, getCharFromInt) {
  if (uncompressed == null) {
    return "";
  }

  let i;
  const dictionary = Object.create(null);
  const dictionaryToCreate = Object.create(null);
  let c = "";
  let wc = "";
  let w = "";
  let enlargeIn = 2;
  let dictSize = 3;
  let numBits = 2;
  const data = [];
  let data_val = 0;
  let data_position = 0;

  const pushBits = (value, bits) => {
    for (i = 0; i < bits; i += 1) {
      data_val = (data_val << 1) | (value & 1);
      if (data_position === bitsPerChar - 1) {
        data_position = 0;
        data.push(getCharFromInt(data_val));
        data_val = 0;
      } else {
        data_position += 1;
      }
      value >>= 1;
    }
  };

  const writeDictionaryEntry = (entry) => {
    if (entry.charCodeAt(0) < 256) {
      pushBits(0, numBits);
      pushBits(entry.charCodeAt(0), 8);
    } else {
      pushBits(1, numBits);
      pushBits(entry.charCodeAt(0), 16);
    }
    enlargeIn -= 1;
    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits += 1;
    }
    delete dictionaryToCreate[entry];
  };

  for (let ii = 0; ii < uncompressed.length; ii += 1) {
    c = uncompressed.charAt(ii);
    if (!Object.prototype.hasOwnProperty.call(dictionary, c)) {
      dictionary[c] = dictSize;
      dictSize += 1;
      dictionaryToCreate[c] = true;
    }
    wc = w + c;
    if (Object.prototype.hasOwnProperty.call(dictionary, wc)) {
      w = wc;
    } else {
      if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, w)) {
        writeDictionaryEntry(w);
      } else {
        pushBits(dictionary[w], numBits);
      }

      enlargeIn -= 1;
      if (enlargeIn === 0) {
        enlargeIn = 1 << numBits;
        numBits += 1;
      }

      dictionary[wc] = dictSize;
      dictSize += 1;
      w = String(c);
    }
  }

  if (w !== "") {
    if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, w)) {
      writeDictionaryEntry(w);
    } else {
      pushBits(dictionary[w], numBits);
    }
  }

  pushBits(2, numBits);

  while (true) {
    data_val <<= 1;
    if (data_position === bitsPerChar - 1) {
      data.push(getCharFromInt(data_val));
      break;
    }
    data_position += 1;
  }

  return data.join("");
}

function compressToEncodedURIComponent(input) {
  if (input == null) {
    return "";
  }
  return _compress(input, 6, getUriSafeCharFromInt);
}
function hexToNumeric(hex) {
  const normalized = normalizeColorToHex(hex);
  if (!normalized) {
    return null;
  }
  const numeric = parseInt(normalized.replace(/#/g, ""), 16);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildBarbofusLink(
  items,
  paletteHexes,
  fallbackColorValues = [],
  options = {}
) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const {
    useCustomSkinTone = true,
    classId = null,
    gender = BARBOFUS_DEFAULTS.gender,
    faceId = BARBOFUS_DEFAULTS.faceId,
    classDefaults = [],
  } = options;

  if (!Number.isFinite(classId)) {
    return null;
  }

  const paletteValues = Array.isArray(paletteHexes)
    ? paletteHexes
        .map((hex) => hexToNumeric(hex))
        .filter((value) => Number.isFinite(value))
    : [];

  const defaultColorValues = Array.isArray(classDefaults)
    ? classDefaults.filter((value) => Number.isFinite(value))
    : [];

  const fallbackValues = Array.isArray(fallbackColorValues)
    ? fallbackColorValues.filter((value) => Number.isFinite(value))
    : [];

  const overlayValues = paletteValues.length ? paletteValues : fallbackValues;
  const initialColors = new Array(MAX_ITEM_PALETTE_COLORS).fill(null);

  if (!useCustomSkinTone && defaultColorValues.length) {
    const defaultSkin = defaultColorValues.find((value) => Number.isFinite(value));
    if (defaultSkin !== undefined) {
      initialColors[0] = defaultSkin;
    }
  }

  const startIndex = !useCustomSkinTone && Number.isFinite(initialColors[0]) ? 1 : 0;

  overlayValues.forEach((value) => {
    if (!Number.isFinite(value)) {
      return;
    }
    if (initialColors.includes(value)) {
      return;
    }
    const targetIndex = initialColors.findIndex((entry, index) => entry === null && index >= startIndex);
    if (targetIndex !== -1) {
      initialColors[targetIndex] = value;
    }
  });

  if (initialColors.every((value) => value === null) && defaultColorValues.length) {
    defaultColorValues.forEach((value, index) => {
      if (index < MAX_ITEM_PALETTE_COLORS && Number.isFinite(value)) {
        initialColors[index] = value;
      }
    });
  }

  if (useCustomSkinTone && !defaultColorValues.length && !overlayValues.length) {
    return null;
  }

  const resolvedColors = initialColors.filter((value) => Number.isFinite(value));

  if (!resolvedColors.length && !useCustomSkinTone) {
    const defaultSkin = defaultColorValues.length ? defaultColorValues[0] : null;
    if (defaultSkin !== null) {
      resolvedColors.push(defaultSkin);
    }
  }

  if (!resolvedColors.length) {
    return null;
  }

  const equipment = BARBOFUS_EQUIPMENT_SLOTS.reduce((accumulator, slot) => {
    accumulator[slot] = null;
    return accumulator;
  }, {});

  let hasEquipment = false;

  items.forEach((item) => {
    if (!item) {
      return;
    }
    const slot = BARBOFUS_SLOT_BY_TYPE[item.slotType];
    if (!slot || !item.ankamaId) {
      return;
    }
    equipment[slot] = item.ankamaId;
    hasEquipment = true;
  });

  if (!hasEquipment) {
    return null;
  }

  const payload = {
    1: Number.isFinite(gender) ? gender : BARBOFUS_DEFAULTS.gender,
    2: classId,
    4: resolvedColors,
    5: equipment,
  };

  const resolvedFaceId = Number.isFinite(faceId) ? faceId : null;
  if (resolvedFaceId !== null) {
    payload[3] = resolvedFaceId;
  }

  try {
    const encoded = compressToEncodedURIComponent(JSON.stringify(payload));
    if (!encoded) {
      return null;
    }
    return `${BARBOFUS_BASE_URL}?s=${encoded}`;
  } catch (err) {
    console.error(err);
    return null;
  }
}

function componentToHex(value) {
  const hex = value.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

function rgbToHex(r, g, b) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hslToRgb(h, s, l) {
  const normalizedHue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((normalizedHue / 60) % 2) - 1));
  const m = l - c / 2;

  let rr = 0;
  let gg = 0;
  let bb = 0;

  if (normalizedHue < 60) {
    rr = c;
    gg = x;
  } else if (normalizedHue < 120) {
    rr = x;
    gg = c;
  } else if (normalizedHue < 180) {
    gg = c;
    bb = x;
  } else if (normalizedHue < 240) {
    gg = x;
    bb = c;
  } else if (normalizedHue < 300) {
    rr = x;
    bb = c;
  } else {
    rr = c;
    bb = x;
  }

  const r = Math.round(clamp((rr + m) * 255, 0, 255));
  const g = Math.round(clamp((gg + m) * 255, 0, 255));
  const b = Math.round(clamp((bb + m) * 255, 0, 255));

  return { r, g, b };
}

function adjustHsl(base, deltaH = 0, deltaS = 0, deltaL = 0) {
  return {
    h: (base.h + deltaH + 360) % 360,
    s: clamp(base.s + deltaS, 0, 1),
    l: clamp(base.l + deltaL, 0.04, 0.96),
  };
}

function generatePaletteFromSeed(seedHex) {
  const baseRgb = hexToRgb(seedHex);
  if (!baseRgb) {
    return [];
  }

  const baseHsl = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);
  const variations = [
    adjustHsl(baseHsl, -16, -0.12, -0.24),
    adjustHsl(baseHsl, -6, -0.06, -0.12),
    adjustHsl(baseHsl, 0, 0.02, 0),
    adjustHsl(baseHsl, 10, 0.06, 0.08),
    adjustHsl(baseHsl, 18, 0.08, 0.16),
    adjustHsl(baseHsl, 32, 0.1, 0.2),
  ];

  const seen = new Set();

  return variations
    .map((entry, index) => {
      const { r, g, b } = hslToRgb(entry.h, entry.s, entry.l);
      const hex = rgbToHex(r, g, b);
      return {
        hex,
        rgb: `rgb(${r}, ${g}, ${b})`,
        r,
        g,
        b,
        weight: index === 2 ? 1.4 : 1,
      };
    })
    .filter((entry) => {
      if (seen.has(entry.hex)) {
        return false;
      }
      seen.add(entry.hex);
      return true;
    })
    .slice(0, MAX_COLORS);
}

function adjustHexLightness(hex, deltaL, deltaS = 0) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  const base = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const adjusted = adjustHsl(base, 0, deltaS, deltaL);
  const { r, g, b } = hslToRgb(adjusted.h, adjusted.s, adjusted.l);
  return rgbToHex(r, g, b);
}

function buildGradientFromHex(hex) {
  const normalized = normalizeColorToHex(hex);
  if (!normalized) {
    return "linear-gradient(135deg, #1F2937, #111827)";
  }
  const darker = adjustHexLightness(normalized, -0.2, -0.08);
  const lighter = adjustHexLightness(normalized, 0.18, -0.12);
  return `linear-gradient(135deg, ${darker}, ${normalized}, ${lighter})`;
}

function getImageDimensions(image) {
  if (!image) {
    return { width: MAX_DIMENSION, height: MAX_DIMENSION };
  }

  const width =
    image.naturalWidth || image.videoWidth || image.width || image.clientWidth || MAX_DIMENSION;
  const height =
    image.naturalHeight || image.videoHeight || image.height || image.clientHeight || MAX_DIMENSION;

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

function resolveSourceRect(image, options = {}) {
  if (!image) {
    return null;
  }

  if (options.sourceRect) {
    return options.sourceRect;
  }

  const { width, height } = getImageDimensions(image);
  if (!options.trimTransparent && !options.detectEdges) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  const totalPixels = width * height;
  const brightness = new Float32Array(totalPixels);
  const alphaThreshold = options.alphaThreshold ?? 32;

  let alphaMinX = width;
  let alphaMinY = height;
  let alphaMaxX = -1;
  let alphaMaxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];

      brightness[index] = 0.299 * r + 0.587 * g + 0.114 * b;

      if (options.trimTransparent && a > alphaThreshold) {
        if (x < alphaMinX) alphaMinX = x;
        if (x > alphaMaxX) alphaMaxX = x;
        if (y < alphaMinY) alphaMinY = y;
        if (y > alphaMaxY) alphaMaxY = y;
      }
    }
  }

  const paddingRatio = options.paddingRatio ?? 0.04;

  const withPadding = (rect) => {
    if (!rect) {
      return null;
    }
    const padX = Math.max(2, Math.round(width * paddingRatio));
    const padY = Math.max(2, Math.round(height * paddingRatio));
    const startX = Math.max(0, rect.x - padX);
    const startY = Math.max(0, rect.y - padY);
    const endX = Math.min(width, rect.x + rect.width + padX);
    const endY = Math.min(height, rect.y + rect.height + padY);
    return {
      x: startX,
      y: startY,
      width: Math.max(1, endX - startX),
      height: Math.max(1, endY - startY),
    };
  };

  if (options.trimTransparent && alphaMaxX >= alphaMinX && alphaMaxY >= alphaMinY) {
    return withPadding({
      x: alphaMinX,
      y: alphaMinY,
      width: alphaMaxX - alphaMinX + 1,
      height: alphaMaxY - alphaMinY + 1,
    });
  }

  if (!options.detectEdges) {
    return null;
  }

  const gradientThreshold = options.gradientThreshold ?? 28;
  const minActiveRatio = options.minActiveRatio ?? 0.004;

  let edgeMinX = width;
  let edgeMinY = height;
  let edgeMaxX = -1;
  let edgeMaxY = -1;
  let activeCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const current = brightness[index];

      let gradient = 0;
      if (x < width - 1) {
        gradient += Math.abs(current - brightness[index + 1]);
      }
      if (y < height - 1) {
        gradient += Math.abs(current - brightness[index + width]);
      }

      if (gradient > gradientThreshold) {
        if (x < edgeMinX) edgeMinX = x;
        if (x > edgeMaxX) edgeMaxX = x;
        if (y < edgeMinY) edgeMinY = y;
        if (y > edgeMaxY) edgeMaxY = y;
        activeCount += 1;
      }
    }
  }

  if (edgeMaxX >= edgeMinX && edgeMaxY >= edgeMinY) {
    if (activeCount / totalPixels >= minActiveRatio) {
      return withPadding({
        x: edgeMinX,
        y: edgeMinY,
        width: edgeMaxX - edgeMinX + 1,
        height: edgeMaxY - edgeMinY + 1,
      });
    }
  }

  return null;
}

function drawImageRegion(image, { sourceRect, targetWidth, targetHeight, maxDimension = MAX_DIMENSION } = {}) {
  if (!image) {
    return null;
  }

  const { width: baseWidth, height: baseHeight } = getImageDimensions(image);
  const region = sourceRect ?? null;

  const sx = region ? region.x : 0;
  const sy = region ? region.y : 0;
  const sw = region ? region.width : baseWidth;
  const sh = region ? region.height : baseHeight;

  if (!sw || !sh) {
    return null;
  }

  let width = targetWidth;
  let height = targetHeight;

  if (!width && !height) {
    const ratio = Math.min(1, maxDimension / sw, maxDimension / sh);
    width = Math.max(1, Math.round(sw * ratio));
    height = Math.max(1, Math.round(sh * ratio));
  } else if (width && !height) {
    height = Math.max(1, Math.round((width * sh) / sw));
  } else if (!width && height) {
    width = Math.max(1, Math.round((height * sw) / sh));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  return { canvas, context, width, height };
}

function extractPalette(image, options = {}) {
  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, { sourceRect, maxDimension: MAX_DIMENSION });
  if (!region) {
    return [];
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);

  const buckets = new Map();

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 48) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const key = [
      Math.round(r / BUCKET_SIZE),
      Math.round(g / BUCKET_SIZE),
      Math.round(b / BUCKET_SIZE),
    ].join("-");

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { r: 0, g: 0, b: 0, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
  }

  return Array.from(buckets.values())
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_COLORS)
    .map(({ r, g, b, count }) => {
      const rr = Math.round(r / count);
      const gg = Math.round(g / count);
      const bb = Math.round(b / count);
      return {
        hex: rgbToHex(rr, gg, bb),
        rgb: `rgb(${rr}, ${gg}, ${bb})`,
        r: rr,
        g: gg,
        b: bb,
        weight: count,
      };
    });
}

function computeImageSignature(image, gridSize = SIGNATURE_GRID_SIZE, options = {}) {
  if (!image || gridSize <= 0 || typeof document === "undefined") {
    return [];
  }

  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, {
    sourceRect,
    targetWidth: gridSize,
    targetHeight: gridSize,
  });

  if (!region) {
    return [];
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);

  const signature = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = data[i + 3] / 255;
    signature.push({ r, g, b, a: alpha });
  }

  return signature;
}

function computeShapeProfile(image, gridSize = SHAPE_PROFILE_SIZE, options = {}) {
  if (!image || gridSize <= 0 || typeof document === "undefined") {
    return null;
  }

  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, {
    sourceRect,
    targetWidth: gridSize,
    targetHeight: gridSize,
  });

  if (!region) {
    return null;
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);

  const rows = new Array(height).fill(0);
  const columns = new Array(width).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] / 255;
      rows[y] += alpha;
      columns[x] += alpha;
    }
  }

  const normalize = (values) =>
    values.map((sum) => {
      const normalized = sum / values.length;
      return Number.isFinite(normalized) ? Math.min(Math.max(normalized, 0), 1) : 0;
    });

  const normalizedRows = normalize(rows);
  const normalizedColumns = normalize(columns);
  const occupancy =
    normalizedRows.reduce((accumulator, value) => accumulator + value, 0) / normalizedRows.length;

  return {
    rows: normalizedRows,
    columns: normalizedColumns,
    occupancy: Number.isFinite(occupancy) ? Math.min(Math.max(occupancy, 0), 1) : 0,
  };
}

function computeShapeDistance(shapeA, shapeB) {
  if (!shapeA || !shapeB) {
    return Number.POSITIVE_INFINITY;
  }

  const compareArrays = (a = [], b = []) => {
    const length = Math.min(a.length, b.length);
    if (length === 0) {
      return Number.POSITIVE_INFINITY;
    }

    let total = 0;
    for (let i = 0; i < length; i += 1) {
      const valueA = a[i] ?? 0;
      const valueB = b[i] ?? 0;
      total += Math.abs(valueA - valueB);
    }
    return total / length;
  };

  const rowDistance = compareArrays(shapeA.rows, shapeB.rows);
  const columnDistance = compareArrays(shapeA.columns, shapeB.columns);

  if (!Number.isFinite(rowDistance) && !Number.isFinite(columnDistance)) {
    return Number.POSITIVE_INFINITY;
  }

  const occupancyA = typeof shapeA.occupancy === "number" ? shapeA.occupancy : 0;
  const occupancyB = typeof shapeB.occupancy === "number" ? shapeB.occupancy : 0;
  const occupancyDistance = Math.abs(occupancyA - occupancyB);

  const finiteComponents = [];
  if (Number.isFinite(rowDistance)) finiteComponents.push(rowDistance);
  if (Number.isFinite(columnDistance)) finiteComponents.push(columnDistance);
  finiteComponents.push(occupancyDistance);

  const total = finiteComponents.reduce((accumulator, value) => accumulator + value, 0);
  return total / finiteComponents.length;
}

function computeDifferenceHash(image, hashSize = HASH_GRID_SIZE, options = {}) {
  if (!image || typeof document === "undefined" || hashSize <= 0) {
    return null;
  }

  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, {
    sourceRect,
    targetWidth: hashSize + 1,
    targetHeight: hashSize,
  });

  if (!region) {
    return null;
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);
  const hash = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < hashSize; x += 1) {
      const leftIndex = (y * width + x) * 4;
      const rightIndex = (y * width + (x + 1)) * 4;

      const left =
        0.299 * data[leftIndex] + 0.587 * data[leftIndex + 1] + 0.114 * data[leftIndex + 2];
      const right =
        0.299 * data[rightIndex] + 0.587 * data[rightIndex + 1] + 0.114 * data[rightIndex + 2];

      hash.push(left > right ? "1" : "0");
    }
  }

  return hash.length ? hash.join("") : null;
}

function computeHashDistance(hashA, hashB) {
  if (!hashA || !hashB) {
    return Number.POSITIVE_INFINITY;
  }

  const length = Math.min(hashA.length, hashB.length);
  if (!length) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;
  for (let i = 0; i < length; i += 1) {
    if (hashA.charAt(i) !== hashB.charAt(i)) {
      distance += 1;
    }
  }

  return distance / length;
}

function computeEdgeHistogram(image, gridSize = EDGE_GRID_SIZE, options = {}) {
  if (!image || typeof document === "undefined" || gridSize <= 1) {
    return null;
  }

  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, {
    sourceRect,
    targetWidth: gridSize,
    targetHeight: gridSize,
  });

  if (!region) {
    return null;
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);
  const brightness = new Float32Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    brightness[i] =
      0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }

  const bins = new Array(EDGE_ORIENTATION_BINS).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const center = brightness[index];
      const left = x > 0 ? brightness[index - 1] : center;
      const right = x < width - 1 ? brightness[index + 1] : center;
      const up = y > 0 ? brightness[index - width] : center;
      const down = y < height - 1 ? brightness[index + width] : center;

      const gx = right - left;
      const gy = down - up;
      const magnitude = Math.sqrt(gx * gx + gy * gy);

      if (magnitude < 1) {
        continue;
      }

      const orientation = Math.atan2(gy, gx);
      const normalized = (orientation + Math.PI) / (2 * Math.PI);
      const bin = Math.min(
        EDGE_ORIENTATION_BINS - 1,
        Math.max(0, Math.floor(normalized * EDGE_ORIENTATION_BINS))
      );

      bins[bin] += magnitude;
    }
  }

  const total = bins.reduce((accumulator, value) => accumulator + value, 0);
  if (total <= 0) {
    return null;
  }

  return bins.map((value) => value / total);
}

function computeEdgeDistance(edgesA, edgesB) {
  if (!Array.isArray(edgesA) || !Array.isArray(edgesB)) {
    return Number.POSITIVE_INFINITY;
  }

  const length = Math.min(edgesA.length, edgesB.length);
  if (!length) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  for (let i = 0; i < length; i += 1) {
    const valueA = edgesA[i] ?? 0;
    const valueB = edgesB[i] ?? 0;
    total += Math.abs(valueA - valueB);
  }

  return total / length;
}

function hexToRgb(hex) {
  if (!hex) {
    return null;
  }
  const value = hex.replace("#", "");
  if (value.length !== 6) {
    return null;
  }
  const bigint = parseInt(value, 16);
  if (Number.isNaN(bigint)) {
    return null;
  }
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

function colorDistance(colorA, colorB) {
  const dr = colorA.r - colorB.r;
  const dg = colorA.g - colorB.g;
  const db = colorA.b - colorB.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function rgbToHsl(r, g, b) {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;

  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rr) {
      h = ((gg - bb) / delta) % 6;
    } else if (max === gg) {
      h = (bb - rr) / delta + 2;
    } else {
      h = (rr - gg) / delta + 4;
    }
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return {
    h: (h * 60 + 360) % 360,
    s,
    l,
  };
}

function computeToneHistogramFromPixels(pixels, bucketCount = HUE_BUCKETS) {
  if (!pixels || pixels.length === 0) {
    return null;
  }

  const buckets = new Array(bucketCount + 1).fill(0);
  let total = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha < 0.16) {
      continue;
    }

    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    const { h, s, l } = rgbToHsl(r, g, b);
    const isNeutral = s < 0.18 || l < 0.12 || l > 0.88;

    const weight = alpha * (0.7 + s * 0.6);
    if (!Number.isFinite(weight) || weight <= 0) {
      continue;
    }

    if (isNeutral) {
      buckets[HUE_NEUTRAL_INDEX] += weight;
      total += weight;
      continue;
    }

    const segment = Math.min(bucketCount - 1, Math.floor((h / 360) * bucketCount));
    buckets[segment] += weight;
    total += weight;
  }

  if (total <= 0) {
    return null;
  }

  return buckets.map((value) => value / total);
}

function computeToneDistribution(image, options = {}) {
  if (!image || typeof document === "undefined") {
    return null;
  }

  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, { sourceRect, maxDimension: MAX_DIMENSION });
  if (!region) {
    return null;
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);

  return computeToneHistogramFromPixels(data);
}

function computeToneDistributionFromPalette(palette) {
  if (!palette || !palette.length) {
    return null;
  }

  const buckets = new Array(HUE_BUCKETS + 1).fill(0);
  let total = 0;

  palette.forEach((hex, index) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const weight = 1 / (index + 1);
    if (s < 0.18 || l < 0.12 || l > 0.88) {
      buckets[HUE_NEUTRAL_INDEX] += weight;
    } else {
      const segment = Math.min(HUE_BUCKETS - 1, Math.floor((h / 360) * HUE_BUCKETS));
      buckets[segment] += weight;
    }
    total += weight;
  });

  if (total <= 0) {
    return null;
  }

  return buckets.map((value) => value / total);
}

function computeToneDistance(tonesA, tonesB) {
  if (!Array.isArray(tonesA) || !Array.isArray(tonesB)) {
    return Number.POSITIVE_INFINITY;
  }

  const length = Math.min(tonesA.length, tonesB.length);
  if (!length) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  for (let i = 0; i < length; i += 1) {
    const valueA = tonesA[i] ?? 0;
    const valueB = tonesB[i] ?? 0;
    total += Math.abs(valueA - valueB);
  }

  return total / length;
}

function computeSignatureDistance(signatureA, signatureB) {
  if (!Array.isArray(signatureA) || !Array.isArray(signatureB)) {
    return Number.POSITIVE_INFINITY;
  }

  const length = Math.min(signatureA.length, signatureB.length);
  if (length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  let weightTotal = 0;

  for (let i = 0; i < length; i += 1) {
    const pointA = signatureA[i];
    const pointB = signatureB[i];
    if (!pointA || !pointB) {
      continue;
    }

    const alphaA = typeof pointA.a === "number" ? Math.max(pointA.a, 0) : 1;
    const alphaB = typeof pointB.a === "number" ? Math.max(pointB.a, 0) : 1;
    if (alphaA < MIN_ALPHA_WEIGHT && alphaB < MIN_ALPHA_WEIGHT) {
      continue;
    }

    const weight = Math.max((alphaA + alphaB) / 2, MIN_ALPHA_WEIGHT);
    const dr = (pointA.r ?? 0) - (pointB.r ?? 0);
    const dg = (pointA.g ?? 0) - (pointB.g ?? 0);
    const db = (pointA.b ?? 0) - (pointB.b ?? 0);
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    total += distance * weight;
    weightTotal += weight;
  }

  if (weightTotal <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return total / weightTotal;
}

function scoreItemAgainstPalette(
  item,
  palette,
  referenceSignature,
  referenceShape,
  referenceTones,
  referenceHash,
  referenceEdges
) {
  let paletteScore = Number.POSITIVE_INFINITY;
  let paletteCoverage = 0;
  if (palette.length > 0 && item.palette && item.palette.length > 0) {
    const paletteRgb = palette.map((color) => ({ r: color.r, g: color.g, b: color.b }));
    const itemRgb = item.palette
      .map((hex) => hexToRgb(hex))
      .filter((value) => value !== null);

    if (itemRgb.length > 0) {
      let matchCount = 0;
      const totalDistance = itemRgb.reduce((accumulator, itemColor) => {
        const closestDistance = paletteRgb.reduce((best, paletteColor) => {
          const distance = colorDistance(itemColor, paletteColor);
          return Math.min(best, distance);
        }, Number.POSITIVE_INFINITY);
        if (closestDistance <= PALETTE_COVERAGE_THRESHOLD) {
          matchCount += 1;
        }
        return accumulator + closestDistance;
      }, 0);

      paletteScore = totalDistance / itemRgb.length;
      paletteCoverage = matchCount / itemRgb.length;
    }
  }

  let signatureScore = Number.POSITIVE_INFINITY;
  if (referenceSignature && Array.isArray(referenceSignature) && referenceSignature.length) {
    const itemSignature = Array.isArray(item.signature) ? item.signature : null;
    if (itemSignature && itemSignature.length) {
      signatureScore = computeSignatureDistance(referenceSignature, itemSignature);
    }
  }

  let shapeScore = Number.POSITIVE_INFINITY;
  if (referenceShape && item.shape) {
    shapeScore = computeShapeDistance(referenceShape, item.shape);
  }

  let toneScore = Number.POSITIVE_INFINITY;
  if (referenceTones && item) {
    const itemTones = item.tones ?? computeToneDistributionFromPalette(item.palette);
    if (itemTones) {
      toneScore = computeToneDistance(referenceTones, itemTones);
    }
  }

  let hashScore = Number.POSITIVE_INFINITY;
  if (referenceHash && typeof referenceHash === "string" && referenceHash.length > 0) {
    const itemHash = typeof item.hash === "string" ? item.hash : null;
    if (itemHash && itemHash.length) {
      hashScore = computeHashDistance(referenceHash, itemHash);
    }
  }

  let edgeScore = Number.POSITIVE_INFINITY;
  if (Array.isArray(referenceEdges) && referenceEdges.length) {
    const itemEdges = Array.isArray(item.edges) ? item.edges : null;
    if (itemEdges && itemEdges.length) {
      edgeScore = computeEdgeDistance(referenceEdges, itemEdges);
    }
  }

  const paletteFinite = Number.isFinite(paletteScore);
  const signatureFinite = Number.isFinite(signatureScore);

  const shapeFinite = Number.isFinite(shapeScore);
  const toneFinite = Number.isFinite(toneScore);

  const hashFinite = Number.isFinite(hashScore);
  const edgeFinite = Number.isFinite(edgeScore);

  if (!paletteFinite && !signatureFinite && !shapeFinite && !toneFinite && !hashFinite && !edgeFinite) {
    return Number.POSITIVE_INFINITY;
  }

  const paletteNormalized = paletteFinite
    ? Math.min(paletteScore / MAX_COLOR_DISTANCE, 1)
    : Number.POSITIVE_INFINITY;
  const signatureNormalized = signatureFinite
    ? Math.min(signatureScore / MAX_COLOR_DISTANCE, 1)
    : Number.POSITIVE_INFINITY;
  const shapeNormalized = shapeFinite
    ? Math.min(shapeScore / MAX_SHAPE_DISTANCE, 1)
    : Number.POSITIVE_INFINITY;
  const toneNormalized = toneFinite ? Math.min(toneScore / MAX_TONE_DISTANCE, 1) : Number.POSITIVE_INFINITY;
  const hashNormalized = hashFinite ? Math.min(hashScore, 1) : Number.POSITIVE_INFINITY;
  const edgeNormalized = edgeFinite ? Math.min(edgeScore, 1) : Number.POSITIVE_INFINITY;

  let weightedScore = 0;
  let totalWeight = 0;

  if (paletteFinite) {
    weightedScore += paletteNormalized * PALETTE_SCORE_WEIGHT;
    totalWeight += PALETTE_SCORE_WEIGHT;
  }

  if (signatureFinite) {
    weightedScore += signatureNormalized * SIGNATURE_SCORE_WEIGHT;
    totalWeight += SIGNATURE_SCORE_WEIGHT;
  }

  if (shapeFinite) {
    weightedScore += shapeNormalized * SHAPE_SCORE_WEIGHT;
    totalWeight += SHAPE_SCORE_WEIGHT;
  }

  if (toneFinite) {
    weightedScore += toneNormalized * TONE_SCORE_WEIGHT;
    totalWeight += TONE_SCORE_WEIGHT;
  }

  if (hashFinite) {
    weightedScore += hashNormalized * HASH_SCORE_WEIGHT;
    totalWeight += HASH_SCORE_WEIGHT;
  }

  if (edgeFinite) {
    weightedScore += edgeNormalized * EDGE_SCORE_WEIGHT;
    totalWeight += EDGE_SCORE_WEIGHT;
  }

  if (totalWeight <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  let finalScore = weightedScore / totalWeight;

  if (paletteCoverage > 0) {
    finalScore -= paletteCoverage * PALETTE_COVERAGE_WEIGHT;
  }

  if (signatureFinite) {
    const signatureConfidence = Math.max(0, 1 - signatureScore / SIGNATURE_CONFIDENCE_DISTANCE);
    if (signatureConfidence > 0) {
      finalScore -= signatureConfidence * SIGNATURE_CONFIDENCE_WEIGHT;
    }
    if (signatureScore < SIGNATURE_STRONG_THRESHOLD) {
      finalScore -= 0.08;
    }
    if (signatureScore < SIGNATURE_PERFECT_THRESHOLD) {
      finalScore -= 0.12;
    }
  }

  if (shapeFinite) {
    const shapeConfidence = Math.max(0, 1 - shapeScore / SHAPE_CONFIDENCE_DISTANCE);
    if (shapeConfidence > 0) {
      finalScore -= shapeConfidence * SHAPE_CONFIDENCE_WEIGHT;
    }
    if (shapeScore < SHAPE_STRONG_THRESHOLD) {
      finalScore -= 0.06;
    }
  }

  if (toneFinite) {
    const toneConfidence = Math.max(0, 1 - toneScore / TONE_CONFIDENCE_DISTANCE);
    if (toneConfidence > 0) {
      finalScore -= toneConfidence * TONE_CONFIDENCE_WEIGHT;
    }
    if (toneScore < 0.18) {
      finalScore -= 0.05;
    }
  }

  if (hashFinite) {
    const hashConfidence = Math.max(0, 1 - hashScore / HASH_CONFIDENCE_DISTANCE);
    if (hashConfidence > 0) {
      finalScore -= hashConfidence * HASH_CONFIDENCE_WEIGHT;
    }
    if (hashScore < HASH_STRONG_THRESHOLD) {
      finalScore -= 0.1;
    }
  }

  if (edgeFinite) {
    const edgeConfidence = Math.max(0, 1 - edgeScore / EDGE_CONFIDENCE_DISTANCE);
    if (edgeConfidence > 0) {
      finalScore -= edgeConfidence * EDGE_CONFIDENCE_WEIGHT;
    }
    if (edgeScore < EDGE_STRONG_THRESHOLD) {
      finalScore -= 0.07;
    }
  }

  return Number.isFinite(finalScore) ? finalScore : Number.POSITIVE_INFINITY;
}

function analyzeImage(image, options = {}) {
  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const sharedOptions = { ...options, sourceRect };

  const palette = extractPalette(image, sharedOptions);
  const signature = computeImageSignature(image, SIGNATURE_GRID_SIZE, sharedOptions);
  const shape = computeShapeProfile(image, SHAPE_PROFILE_SIZE, sharedOptions);
  const tones = computeToneDistribution(image, sharedOptions);
  const hash = computeDifferenceHash(image, HASH_GRID_SIZE, sharedOptions);
  const edges = computeEdgeHistogram(image, EDGE_GRID_SIZE, sharedOptions);

  return { palette, signature, shape, tones, hash, edges, sourceRect };
}

function analyzePaletteFromUrl(imageUrl, options = {}) {
  if (!imageUrl || typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.resolve({ palette: [], signature: [], shape: null, tones: null, hash: null, edges: null });
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        const analysis = analyzeImage(image, options);
        resolve(analysis);
      } catch (err) {
        console.error(err);
        resolve({ palette: [], signature: [], shape: null, tones: null, hash: null, edges: null });
      }
    };
    image.onerror = () => {
      resolve({ palette: [], signature: [], shape: null, tones: null, hash: null, edges: null });
    };
    image.src = imageUrl;
  });
}

async function enrichItemsWithPalettes(items, shouldCancel) {
  if (!items.length || (typeof window === "undefined" && typeof document === "undefined")) {
    return items;
  }

  const enriched = await Promise.all(
    items.map(async (item) => {
      if (shouldCancel?.()) {
        return item;
      }

      if (!item.imageUrl) {
        return { ...item, palette: [] };
      }

      const {
        palette: paletteEntries,
        signature,
        shape,
        tones,
        hash,
        edges,
      } = await analyzePaletteFromUrl(item.imageUrl, {
        trimTransparent: true,
        detectEdges: true,
        paddingRatio: 0.05,
      });
      if (shouldCancel?.()) {
        return item;
      }

      const paletteHex = paletteEntries
        .map((entry) => entry.hex)
        .filter((hex, index, array) => hex && array.indexOf(hex) === index)
        .slice(0, MAX_ITEM_PALETTE_COLORS);

      const nextPalette = paletteHex.length ? paletteHex : item.palette ?? [];
      const nextSource = paletteHex.length ? "image" : item.paletteSource ?? "unknown";
      const nextSignature = Array.isArray(signature) && signature.length
        ? signature
        : Array.isArray(item.signature) && item.signature.length
        ? item.signature
        : null;
      const nextShape = shape ?? item.shape ?? null;
      const nextTones = tones ?? item.tones ?? computeToneDistributionFromPalette(nextPalette);
      const nextHash = typeof hash === "string" && hash.length
        ? hash
        : typeof item.hash === "string"
        ? item.hash
        : null;
      const nextEdges = Array.isArray(edges) && edges.length
        ? edges
        : Array.isArray(item.edges) && item.edges.length
        ? item.edges
        : null;

      return {
        ...item,
        palette: nextPalette,
        paletteSource: nextSource,
        signature: nextSignature,
        shape: nextShape,
        tones: nextTones,
        hash: nextHash,
        edges: nextEdges,
      };
    })
  );

  return enriched;
}

export default function Home({ initialBreeds = [] }) {
  const router = useRouter();
  const routerLang = router?.query?.lang;
  const { language, languages: languageOptions, setLanguage, t } = useLanguage();
  const languageRef = useRef(language);
  const skipRouterLanguageEffectRef = useRef(false);
  const languagePriority = useMemo(() => getLanguagePriority(language), [language]);
  useEffect(() => {
    setActiveLocalizationPriority(language);
  }, [language]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    if (!router?.isReady) {
      return;
    }
    const raw = Array.isArray(routerLang) ? routerLang[0] : routerLang;
    const normalized = normalizeLanguage(raw);

    if (skipRouterLanguageEffectRef.current) {
      const isMatchingSelection = normalized
        ? normalized === languageRef.current
        : languageRef.current === DEFAULT_LANGUAGE;
      if (!isMatchingSelection) {
        return;
      }
      skipRouterLanguageEffectRef.current = false;
    }

    if (normalized && normalized !== languageRef.current) {
      setLanguage(normalized);
    }
  }, [router?.isReady, routerLang, setLanguage]);

  const isSyncingLanguageRef = useRef(false);
  useEffect(() => {
    if (!router?.isReady) {
      return;
    }

    const raw = Array.isArray(routerLang) ? routerLang[0] : routerLang;
    const normalized = normalizeLanguage(raw);
    const isDefault = language === DEFAULT_LANGUAGE;
    const isSynced = (isDefault && !normalized) || normalized === language;
    if (isSynced) {
      isSyncingLanguageRef.current = false;
      return;
    }

    if (isSyncingLanguageRef.current) {
      return;
    }

    const nextQuery = { ...router.query };
    if (isDefault) {
      delete nextQuery.lang;
    } else {
      nextQuery.lang = language;
    }

    isSyncingLanguageRef.current = true;
    router
      .replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true })
      .finally(() => {
        isSyncingLanguageRef.current = false;
      });
  }, [language, router, routerLang]);

  const [imageSrc, setImageSrc] = useState(null);
  const [colors, setColors] = useState([]);
  const [imageSignature, setImageSignature] = useState(null);
  const [imageShape, setImageShape] = useState(null);
  const [imageTones, setImageTones] = useState(null);
  const [imageHash, setImageHash] = useState(null);
  const [imageEdges, setImageEdges] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [codeFormat, setCodeFormat] = useState("hex");
  const [toast, setToast] = useState(null);
  const [itemsCatalog, setItemsCatalog] = useState({});
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(null);
  const [panelItemIndexes, setPanelItemIndexes] = useState({});
  const [proposalItemIndexes, setProposalItemIndexes] = useState({});
  const [familierFilters, setFamilierFilters] = useState(() =>
    FAMILIER_FILTERS.reduce((accumulator, filter) => {
      const isDefaultEnabled = filter.key === "pet" || filter.key === "mount";
      accumulator[filter.key] = isDefaultEnabled;
      return accumulator;
    }, {})
  );
  const [itemFlagFilters, setItemFlagFilters] = useState(() =>
    ITEM_FLAG_FILTERS.reduce((accumulator, filter) => {
      accumulator[filter.key] = true;
      return accumulator;
    }, {})
  );
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [inputMode, setInputMode] = useState("image");
  const [selectedColor, setSelectedColor] = useState(null);
  const [activeProposal, setActiveProposal] = useState(0);
  const [lookPreviews, setLookPreviews] = useState({});
  const lookPreviewsRef = useRef({});
  const [downloadingPreviewId, setDownloadingPreviewId] = useState(null);
  const [useCustomSkinTone, setUseCustomSkinTone] = useState(false);
  const [showDetailedMatches, setShowDetailedMatches] = useState(false);
  const [breeds, setBreeds] = useState(() =>
    Array.isArray(initialBreeds) && initialBreeds.length ? initialBreeds : []
  );
  const [breedsLoading, setBreedsLoading] = useState(false);
  const [breedsError, setBreedsError] = useState(null);
  const [selectedBreedId, setSelectedBreedId] = useState(null);
  const [selectedGender, setSelectedGender] = useState(BARBOFUS_DEFAULT_GENDER_KEY);
  const progressHandles = useRef({ frame: null, timeout: null, value: 0 });
  const breedsRequestRef = useRef(null);

  const handleLanguageSelect = useCallback(
    (nextLanguage) => {
      if (!nextLanguage || nextLanguage === languageRef.current) {
        return;
      }
      skipRouterLanguageEffectRef.current = true;
      setLanguage(nextLanguage);
    },
    [setLanguage]
  );

  const isImageMode = inputMode === "image";

  const hasCatalogData = useMemo(
    () => ITEM_TYPES.some((type) => (itemsCatalog[type] ?? []).length > 0),
    [itemsCatalog]
  );

  const activeFamilierFilterCount = useMemo(
    () =>
      FAMILIER_FILTERS.reduce(
        (total, filter) => (familierFilters[filter.key] ? total + 1 : total),
        0
      ),
    [familierFilters]
  );
  const areAllFamilierFiltersDisabled = activeFamilierFilterCount === 0;

  const colorsCount = colors.length;

  const handleFamilierFilterToggle = useCallback((key) => {
    if (!FAMILIER_FILTERS.some((filter) => filter.key === key)) {
      return;
    }

    setFamilierFilters((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }, []);

  const handleItemFlagFilterToggle = useCallback((key) => {
    if (!ITEM_FLAG_FILTERS.some((filter) => filter.key === key)) {
      return;
    }

    setItemFlagFilters((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }, []);

  const activeBreed = useMemo(() => {
    if (!Array.isArray(breeds) || breeds.length === 0) {
      return null;
    }
    if (!Number.isFinite(selectedBreedId)) {
      return null;
    }
    const found = breeds.find((entry) => entry.id === selectedBreedId);
    return found ?? null;
  }, [breeds, selectedBreedId]);

  const activeGenderConfig = useMemo(() => {
    if (!activeBreed) {
      return null;
    }
    const fallback = selectedGender === "male" ? BARBOFUS_DEFAULT_BREED.male : BARBOFUS_DEFAULT_BREED.female;
    return selectedGender === "male" ? activeBreed.male ?? fallback : activeBreed.female ?? fallback;
  }, [activeBreed, selectedGender]);

  const activeClassId = Number.isFinite(activeBreed?.id) ? activeBreed.id : null;
  const activeGenderValue = BARBOFUS_GENDER_VALUES[selectedGender] ?? BARBOFUS_DEFAULTS.gender;
  const activeGenderLabel = selectedGender === "male" ? t("identity.gender.male") : t("identity.gender.female");
  const activeClassDefaults = activeBreed ? activeGenderConfig?.colors?.numeric ?? [] : [];
  const fallbackFaceId = Number.isFinite(activeGenderConfig?.faceId)
    ? activeGenderConfig.faceId
    : Number.isFinite(activeGenderConfig?.lookId)
    ? activeGenderConfig.lookId
    : BARBOFUS_DEFAULTS.faceId;
  const activeClassFaceId = getBarbofusFaceId(activeClassId, selectedGender, fallbackFaceId);

  const fallbackColorValues = useMemo(() => {
    if (!colors.length) {
      return [];
    }
    const seen = new Set();
    const values = [];
    colors.forEach((entry) => {
      const candidate = typeof entry === "string" ? entry : entry?.hex;
      const numeric = hexToNumeric(candidate);
      if (numeric !== null && !seen.has(numeric)) {
        seen.add(numeric);
        values.push(numeric);
      }
    });
    return values;
  }, [colors]);

  const loadBreeds = useCallback(async () => {
    if (typeof fetch !== "function") {
      return;
    }

    if (breedsRequestRef.current && typeof breedsRequestRef.current.abort === "function") {
      try {
        breedsRequestRef.current.abort();
      } catch (err) {
        console.error(err);
      }
    }

    const supportsAbort = typeof AbortController !== "undefined";
    const controller = supportsAbort ? new AbortController() : null;
    if (controller) {
      breedsRequestRef.current = controller;
    } else {
      breedsRequestRef.current = null;
    }
    setBreedsLoading(true);
    setBreedsError(null);

    try {
      const fetchOptions = {
        headers: { Accept: "application/json" },
      };
      if (controller) {
        fetchOptions.signal = controller.signal;
      }

      const response = await fetch(buildBreedsUrl(language), fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();

      if (controller?.signal?.aborted) {
        return;
      }

      const normalized = normalizeBreedsDataset(payload, {
        language,
        languagePriority,
      });
      const dataset = normalized.length ? normalized : [BARBOFUS_DEFAULT_BREED];

      setBreeds(dataset);
      setSelectedBreedId((previous) => {
        if (previous != null && dataset.some((entry) => entry.id === previous)) {
          return previous;
        }
        return null;
      });
    } catch (err) {
      if (controller?.signal?.aborted) {
        return;
      }
      console.error(err);
      setBreedsError(t("errors.breeds"));
      setBreeds([BARBOFUS_DEFAULT_BREED]);
      setSelectedBreedId((previous) =>
        Number.isFinite(previous) && previous === BARBOFUS_DEFAULT_BREED.id ? previous : null
      );
    } finally {
      if (controller && breedsRequestRef.current === controller) {
        setBreedsLoading(false);
        breedsRequestRef.current = null;
      }
      if (!controller) {
        setBreedsLoading(false);
      }
    }
  }, [language, languagePriority, t]);

  const handleRetryBreeds = useCallback(() => {
    loadBreeds();
  }, [loadBreeds]);

  useEffect(() => {
    if (!Array.isArray(initialBreeds) || !initialBreeds.length) {
      return;
    }
    setBreeds((previous) => {
      if (
        previous.length === initialBreeds.length &&
        previous.every((entry, index) => entry.id === (initialBreeds[index]?.id ?? null))
      ) {
        return previous;
      }
      return initialBreeds;
    });
    setSelectedBreedId((previous) => {
      if (initialBreeds.some((entry) => entry.id === previous)) {
        return previous;
      }
      return null;
    });
  }, [initialBreeds]);

  const shouldPreloadBreeds = !Array.isArray(initialBreeds) || initialBreeds.length <= 1;

  useEffect(() => {
    if (shouldPreloadBreeds) {
      loadBreeds();
    }
    return () => {
      const controller = breedsRequestRef.current;
      if (controller && typeof controller.abort === "function") {
        controller.abort();
      }
    };
  }, [loadBreeds, shouldPreloadBreeds]);

  useEffect(() => {
    setShowDetailedMatches(false);
  }, [colors]);

  const applyColorSeed = useCallback(
    (seedHex) => {
      if (!seedHex) {
        setColors([]);
        setImageSignature(null);
        setImageShape(null);
        setImageTones(null);
        setImageHash(null);
        setImageEdges(null);
        setIsProcessing(false);
        setAnalysisProgress(0);
        setCopiedCode(null);
        setToast(null);
        setError(null);
        return;
      }

      const palette = generatePaletteFromSeed(seedHex);
      setColors(palette);
      setImageSignature(null);
      setImageShape(null);
      setImageTones(
        palette.length
          ? computeToneDistributionFromPalette(palette.map((entry) => entry.hex))
          : null
      );
      setImageHash(null);
      setImageEdges(null);
      setIsProcessing(false);
      setAnalysisProgress(0);
      setCopiedCode(null);
      setToast(null);
      setError(null);
    },
    []
  );

  useEffect(() => {
    if (inputMode !== "color") {
      return;
    }

    if (!selectedColor) {
      return;
    }

    applyColorSeed(selectedColor);
    setImageSrc(null);
  }, [applyColorSeed, inputMode, selectedColor]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handles = progressHandles.current;

    if (handles.frame) {
      window.cancelAnimationFrame(handles.frame);
      handles.frame = null;
    }
    if (handles.timeout) {
      window.clearTimeout(handles.timeout);
      handles.timeout = null;
    }

    if (isProcessing) {
      let value = typeof handles.value === "number" && handles.value > 0 ? handles.value : 6;
      value = Math.min(value, 88);
      handles.value = value;
      setAnalysisProgress(value);

      const tick = () => {
        value = Math.min(value + Math.random() * 3.4 + 0.9, 96);
        handles.value = value;
        setAnalysisProgress(value);
        handles.frame = window.requestAnimationFrame(tick);
      };

      handles.frame = window.requestAnimationFrame(tick);
    } else if (imageSrc && colorsCount > 0) {
      handles.value = 100;
      setAnalysisProgress(100);
      handles.timeout = window.setTimeout(() => {
        setAnalysisProgress(0);
        handles.value = 0;
        handles.timeout = null;
      }, 1100);
    } else {
      handles.value = 0;
      setAnalysisProgress(0);
    }

    return () => {
      if (handles.frame) {
        window.cancelAnimationFrame(handles.frame);
        handles.frame = null;
      }
      if (handles.timeout) {
        window.clearTimeout(handles.timeout);
        handles.timeout = null;
      }
    };
  }, [colorsCount, imageSrc, isProcessing]);

  const recommendations = useMemo(() => {
    if (!colors.length || !Number.isFinite(activeClassId)) {
      return null;
    }

    return ITEM_TYPES.reduce((accumulator, type) => {
      let catalogItems = itemsCatalog[type] ?? [];

      if (catalogItems.length) {
        catalogItems = catalogItems.filter((item) => {
          if (!item) {
            return false;
          }

          if (itemFlagFilters.colorable === false && item.isColorable === true) {
            return false;
          }

          if (itemFlagFilters.cosmetic === false && item.isCosmetic === true) {
            return false;
          }

          return true;
        });
      }

      if (type === "familier") {
        const activeFilters = FAMILIER_FILTERS.filter((filter) => familierFilters[filter.key]);
        if (!activeFilters.length) {
          accumulator[type] = [];
          return accumulator;
        }

        const allowedKeys = new Set(activeFilters.map((filter) => filter.key));
        const allowedTypeIds = new Set(
          activeFilters.flatMap((filter) => filter.typeIds)
        );

        catalogItems = catalogItems.filter((item) => {
          if (!item) {
            return false;
          }

          if (item.familierCategory && allowedKeys.has(item.familierCategory)) {
            return true;
          }

          if (Number.isFinite(item.typeId)) {
            return allowedTypeIds.has(item.typeId);
          }

          return allowedKeys.has("pet");
        });
      }

      if (!catalogItems.length) {
        accumulator[type] = [];
        return accumulator;
      }

      const scoredItems = catalogItems
        .map((item) => ({
          item,
          score: scoreItemAgainstPalette(
            item,
            colors,
            imageSignature,
            imageShape,
            imageTones,
            imageHash,
            imageEdges
          ),
        }))
        .sort((a, b) => a.score - b.score);

      const finiteScores = scoredItems.filter(({ score }) => Number.isFinite(score));
      const ranked = finiteScores.length > 0 ? finiteScores : scoredItems;

      accumulator[type] = ranked.slice(0, MAX_RECOMMENDATIONS).map(({ item }) => item);
      return accumulator;
    }, {});
  }, [
    activeClassId,
    colors,
    imageSignature,
    imageShape,
    imageTones,
    imageHash,
    imageEdges,
    itemsCatalog,
    familierFilters,
    itemFlagFilters,
  ]);

  useEffect(() => {
    if (!recommendations) {
      setPanelItemIndexes({});
      setProposalItemIndexes({});
      return;
    }

    setPanelItemIndexes((previous) => {
      const next = {};
      let changed = false;

      ITEM_TYPES.forEach((type) => {
        const pool = recommendations[type] ?? [];
        if (!pool.length) {
          next[type] = [];
          if (Array.isArray(previous?.[type]) && previous[type].length) {
            changed = true;
          }
          return;
        }

        const limit = Math.min(PANEL_ITEMS_LIMIT, pool.length);
        const { indexes, changed: normalizedChanged } = normalizeSelection(previous?.[type], limit, pool.length);
        next[type] = indexes;
        if (normalizedChanged) {
          changed = true;
        }
      });

      const previousKeys = previous ? Object.keys(previous) : [];
      const nextKeys = Object.keys(next);

      if (
        previousKeys.length !== nextKeys.length ||
        previousKeys.some((key) => !(key in next))
      ) {
        changed = true;
      }

      if (!changed) {
        return previous;
      }

      return next;
    });

    setProposalItemIndexes((previous) => {
      const next = {};
      let changed = false;

      ITEM_TYPES.forEach((type) => {
        const pool = recommendations[type] ?? [];
        if (!pool.length) {
          next[type] = [];
          if (Array.isArray(previous?.[type]) && previous[type].length) {
            changed = true;
          }
          return;
        }

        const limit = Math.min(PROPOSAL_COUNT, pool.length);
        const { indexes, changed: normalizedChanged } = normalizeSelection(previous?.[type], limit, pool.length);
        next[type] = indexes;
        if (normalizedChanged) {
          changed = true;
        }
      });

      const previousKeys = previous ? Object.keys(previous) : [];
      const nextKeys = Object.keys(next);

      if (
        previousKeys.length !== nextKeys.length ||
        previousKeys.some((key) => !(key in next))
      ) {
        changed = true;
      }

      if (!changed) {
        return previous;
      }

      return next;
    });
  }, [recommendations]);

  const proposals = useMemo(() => {
    if (!recommendations || !Number.isFinite(activeClassId)) {
      return [];
    }

    const maxLength = Math.max(
      0,
      ...ITEM_TYPES.map((type) => (recommendations[type]?.length ?? 0))
    );

    const total = Math.min(PROPOSAL_COUNT, maxLength || 0);
    const combos = [];
    const subtitleParts = [];
    if (activeBreed?.name) {
      subtitleParts.push(activeBreed.name);
    }
    if (activeGenderLabel) {
      subtitleParts.push(activeGenderLabel);
    }
    const sharedSubtitle = subtitleParts.join(" · ");

    for (let index = 0; index < total; index += 1) {
      const items = ITEM_TYPES.map((type) => {
        const pool = recommendations[type] ?? [];
        if (!pool.length) {
          return null;
        }

        const selections = Array.isArray(proposalItemIndexes?.[type]) ? proposalItemIndexes[type] : [];
        const selectionIndex = selections[index];
        const fallbackIndex =
          Number.isFinite(selectionIndex) && selectionIndex >= 0 && selectionIndex < pool.length
            ? selectionIndex
            : index;

        let pick = null;
        if (pool.length) {
          const startIndex = Math.min(pool.length - 1, Math.max(0, fallbackIndex));
          for (let offset = 0; offset < pool.length; offset += 1) {
            const candidate = pool[(startIndex + offset) % pool.length];
            if (!candidate) {
              continue;
            }
            if (Number.isFinite(candidate.ankamaId)) {
              pick = candidate;
              break;
            }
            if (!pick) {
              pick = candidate;
            }
          }
        }

        if (!pick) {
          return null;
        }

        return { ...pick, slotType: type };
      }).filter(Boolean);

      const hasRenderableEquipment = items.some((item) => Number.isFinite(item.ankamaId));
      if (!hasRenderableEquipment) {
        continue;
      }

      if (!items.length) {
        continue;
      }

      const palette = [];
      const seen = new Set();

      items.forEach((item) => {
        item.palette.forEach((hex) => {
          if (!seen.has(hex)) {
            palette.push(hex);
            seen.add(hex);
          }
        });
      });

      const paletteSample = palette.slice(0, MAX_ITEM_PALETTE_COLORS);
      const lookItemIds = Array.from(
        new Set(
          items
            .map((item) => (Number.isFinite(item.ankamaId) ? Math.trunc(item.ankamaId) : null))
            .filter((value) => Number.isFinite(value))
        )
      ).sort((a, b) => a - b);

      const lookGenderCode =
        activeGenderValue === BARBOFUS_GENDER_VALUES.female ? "f" : "m";
      const barbofusLink = buildBarbofusLink(items, paletteSample, fallbackColorValues, {
        useCustomSkinTone,
        classId: activeClassId,
        gender: activeGenderValue,
        faceId: activeClassFaceId,
        classDefaults: activeClassDefaults,
      });

      const lookColors = (() => {
        const values = [];
        const seenColors = new Set();

        const register = (value) => {
          if (!Number.isFinite(value)) {
            return;
          }
          const normalized = Math.trunc(value);
          if (seenColors.has(normalized)) {
            return;
          }
          seenColors.add(normalized);
          values.push(normalized);
        };

        if (!useCustomSkinTone && Array.isArray(activeClassDefaults) && activeClassDefaults.length) {
          const defaultSkin = activeClassDefaults.find((entry) => Number.isFinite(entry));
          if (defaultSkin !== undefined) {
            register(defaultSkin);
          }
        }

        paletteSample.forEach((hex) => {
          const numeric = hexToNumeric(hex);
          if (numeric !== null) {
            register(numeric);
          }
        });

        fallbackColorValues.forEach(register);

        if (!useCustomSkinTone && Array.isArray(activeClassDefaults) && activeClassDefaults.length) {
          activeClassDefaults.forEach((value, index) => {
            if (index === 0) {
              return;
            }
            register(value);
          });
        }

        return values.slice(0, MAX_ITEM_PALETTE_COLORS);
      })();

      const keyParts = [];
      if (Number.isFinite(activeClassId)) {
        keyParts.push(activeClassId);
      }
      const lookFaceId = Number.isFinite(activeClassFaceId) ? activeClassFaceId : null;
      if (lookFaceId) {
        keyParts.push(`head${lookFaceId}`);
      }
      keyParts.push(lookGenderCode);
      keyParts.push(...lookItemIds);
      lookColors.forEach((value) => {
        keyParts.push(`c${value}`);
      });

      const lookKey = keyParts.length ? keyParts.join("-") : null;

      combos.push({
        id: `proposal-${index}`,
        index,
        items,
        palette: paletteSample,
        heroImage: items.find((item) => item.imageUrl)?.imageUrl ?? null,
        barbofusLink,
        className: activeBreed?.name ?? null,
        classId: Number.isFinite(activeClassId) ? activeClassId : null,
        genderLabel: activeGenderLabel,
        classIcon: activeBreed?.icon ?? null,
        subtitle: sharedSubtitle,
        lookGender: lookGenderCode,
        lookFaceId,
        lookItemIds,
        lookColors,
        lookKey,
      });
    }

    return combos;
  }, [
    activeBreed,
    activeClassDefaults,
    activeClassFaceId,
    activeClassId,
    activeGenderLabel,
    activeGenderValue,
    fallbackColorValues,
    proposalItemIndexes,
    recommendations,
    useCustomSkinTone,
  ]);

  const proposalCount = proposals.length;
  const safeActiveProposalIndex = proposalCount
    ? Math.min(activeProposal, proposalCount - 1)
    : 0;
  const activeProposalDetails = proposalCount ? proposals[safeActiveProposalIndex] : null;
  const activeProposalSubtitle = activeProposalDetails?.subtitle ?? "";
  const activeProposalClassIcon = activeProposalDetails?.classIcon ?? null;

  useEffect(() => {
    if (!proposalCount) {
      if (activeProposal !== 0) {
        setActiveProposal(0);
      }
      return;
    }

    if (activeProposal >= proposalCount) {
      setActiveProposal(0);
    }
  }, [activeProposal, proposalCount]);

  useEffect(() => {
    lookPreviewsRef.current = lookPreviews;
  }, [lookPreviews, t]);

  useEffect(() => {
    if (!proposals.length) {
      setLookPreviews({});
      lookPreviewsRef.current = {};
      return;
    }

    const activeIds = new Set(proposals.map((proposal) => proposal.id));
    setLookPreviews((previous = {}) => {
      const entries = Object.entries(previous).filter(([key]) => activeIds.has(key));
      if (entries.length === Object.keys(previous).length) {
        lookPreviewsRef.current = previous;
        return previous;
      }
      const next = Object.fromEntries(entries);
      lookPreviewsRef.current = next;
      return next;
    });

    const abortController = new AbortController();
    let cancelled = false;

    const loadPreview = async (proposal) => {
      if (
        !proposal ||
        !Array.isArray(proposal.lookItemIds) ||
        proposal.lookItemIds.length === 0 ||
        !Number.isFinite(proposal.classId) ||
        !Number.isFinite(proposal.lookFaceId)
      ) {
        return;
      }

      const existing = lookPreviewsRef.current?.[proposal.id];
      if (
        existing &&
        existing.lookKey === proposal.lookKey &&
        existing.status === "loaded"
      ) {
        return;
      }

      setLookPreviews((previous = {}) => {
        const entry = previous[proposal.id];
        if (
          entry &&
          entry.lookKey === proposal.lookKey &&
          (entry.status === "loaded" || entry.status === "loading")
        ) {
          return previous;
        }

        const next = {
          ...previous,
          [proposal.id]: {
            lookKey: proposal.lookKey,
            status: "loading",
            dataUrl: entry?.dataUrl ?? null,
            rendererUrl: entry?.rendererUrl ?? null,
            base64: entry?.base64 ?? null,
            contentType: entry?.contentType ?? null,
            byteLength: entry?.byteLength ?? null,
            error: null,
          },
        };
        lookPreviewsRef.current = next;
        return next;
      });

      try {
        const params = new URLSearchParams();
        params.set("breedId", String(proposal.classId));
        params.set("gender", proposal.lookGender ?? "m");
        params.set("lang", language);
        params.set("size", String(LOOK_PREVIEW_SIZE));
        if (Number.isFinite(proposal.lookFaceId)) {
          params.set("faceId", String(Math.trunc(proposal.lookFaceId)));
        }
        proposal.lookItemIds.forEach((id) => {
          params.append("itemIds[]", String(id));
        });
        if (Array.isArray(proposal.lookColors) && proposal.lookColors.length) {
          proposal.lookColors.slice(0, MAX_ITEM_PALETTE_COLORS).forEach((value) => {
            if (Number.isFinite(value)) {
              params.append("colors[]", String(Math.trunc(value)));
            }
          });
        }

        const response = await fetch(`/api/look-preview?${params.toString()}`, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = payload?.error ?? `HTTP ${response.status}`;
          throw new Error(message);
        }

        const payload = await response.json();
        if (cancelled) {
          return;
        }

        const contentType = payload?.contentType ?? "image/png";
        const base64 = payload?.base64 ?? null;
        const rendererUrl = payload?.rendererUrl ?? null;
        const byteLength =
          typeof payload?.byteLength === "number" && Number.isFinite(payload.byteLength)
            ? payload.byteLength
            : null;
        const dataUrl =
          payload?.dataUrl ??
          (base64 ? `data:${contentType};base64,${base64}` : rendererUrl ?? null);

        setLookPreviews((previous = {}) => {
          if (cancelled) {
            return previous;
          }

          const next = {
            ...previous,
            [proposal.id]: {
              lookKey: proposal.lookKey,
              status: dataUrl ? "loaded" : "error",
              dataUrl,
              rendererUrl,
              base64,
              contentType,
              byteLength,
            error: dataUrl ? null : payload?.error ?? t("errors.previewUnavailable"),
            },
          };
          lookPreviewsRef.current = next;
          return next;
        });
      } catch (error) {
        if (cancelled || error?.name === "AbortError") {
          return;
        }

        setLookPreviews((previous = {}) => {
          const next = {
            ...previous,
            [proposal.id]: {
              lookKey: proposal.lookKey,
              status: "error",
              dataUrl: null,
              rendererUrl: null,
              base64: null,
              contentType: null,
              byteLength: null,
            error: error?.message ?? t("errors.previewUnavailable"),
            },
          };
          lookPreviewsRef.current = next;
          return next;
        });
      }
    };

    proposals.forEach((proposal) => {
      void loadPreview(proposal);
    });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [language, proposals]);

  const handleNextProposal = useCallback(() => {
    if (!proposalCount) {
      return;
    }
    setActiveProposal((previous) => (previous + 1) % proposalCount);
  }, [proposalCount]);

  const handlePrevProposal = useCallback(() => {
    if (!proposalCount) {
      return;
    }
    setActiveProposal((previous) => (previous - 1 + proposalCount) % proposalCount);
  }, [proposalCount]);

  const handleSelectProposal = useCallback(
    (index) => {
      if (!proposalCount) {
        return;
      }
      setActiveProposal(index);
    },
    [proposalCount]
  );

  const handleLookPreviewError = useCallback((id) => {
    if (!id) {
      return;
    }

    setLookPreviews((previous = {}) => {
      const entry = previous[id];
      if (!entry || entry.status === "error") {
        return previous;
      }

      const nextEntry = {
        ...entry,
        status: "error",
        dataUrl: null,
        rendererUrl: null,
        base64: null,
        contentType: null,
        byteLength: null,
        error: entry?.error ?? t("errors.previewUnavailableDetailed"),
      };

      const next = { ...previous, [id]: nextEntry };
      lookPreviewsRef.current = next;
      return next;
    });
  }, [t]);

  const handleDownloadPreview = useCallback(async (proposal) => {
    if (!proposal) {
      return;
    }

    const lookPreview = lookPreviews?.[proposal.id];
    const hasLookPreview =
      lookPreview?.status === "loaded" &&
      typeof lookPreview?.dataUrl === "string" &&
      lookPreview.dataUrl.length > 0;

    if (!hasLookPreview) {
      return;
    }

    const resolveExtension = (type) => {
      if (!type || typeof type !== "string") {
        return "png";
      }
      const normalized = type.toLowerCase();
      if (normalized.includes("png")) return "png";
      if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
      if (normalized.includes("gif")) return "gif";
      if (normalized.includes("bmp")) return "bmp";
      if (normalized.includes("webp")) return "webp";
      return "png";
    };

    try {
      setDownloadingPreviewId(proposal.id);

      const fallbackName = `skin-${proposal.index + 1}`;
      const baseName = slugify(proposal.className ?? fallbackName) || fallbackName;

      if (hasLookPreview) {
        const response = await fetch(lookPreview.dataUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const responseType = response.headers.get("content-type");
        const contentType = lookPreview.contentType ?? responseType ?? "image/png";
        const blob = await response.blob();
        const extension = resolveExtension(contentType);
        const url = URL.createObjectURL(blob);
        const filename = `${baseName}.${extension}`;

        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

    } catch (error) {
      console.error("Unable to download preview:", error);
      setError(t("errors.previewDownload"));
    } finally {
      setDownloadingPreviewId(null);
    }
  }, [lookPreviews]);

  const toggleDetailedMatches = useCallback(() => {
    setShowDetailedMatches((previous) => !previous);
  }, []);

  const handleRerollItem = useCallback(
    (type, options = {}) => {
      if (!recommendations) {
        return;
      }

      const pool = recommendations[type] ?? [];
      if (!pool.length) {
        return;
      }

      const { proposalIndex = null, panelSlotIndex = null } =
        typeof options === "number" ? { panelSlotIndex: options } : options;

      let nextSelection = null;

      if (Number.isFinite(proposalIndex)) {
        const limit = Math.min(PROPOSAL_COUNT, pool.length);
        if (proposalIndex >= 0 && proposalIndex < limit) {
          setProposalItemIndexes((previous = {}) => {
            const prevIndexes = Array.isArray(previous[type]) ? previous[type] : [];
            const result = cycleItemSelection(prevIndexes, limit, pool.length, proposalIndex);
            nextSelection = result.selection;
            if (!result.changed) {
              return previous;
            }
            return { ...previous, [type]: result.indexes };
          });
        }
      }

      const targetSlot = Number.isFinite(panelSlotIndex)
        ? panelSlotIndex
        : Number.isFinite(proposalIndex)
        ? 0
        : null;

      if (Number.isFinite(targetSlot)) {
        const limit = Math.min(PANEL_ITEMS_LIMIT, pool.length);
        if (targetSlot >= 0 && targetSlot < limit) {
          setPanelItemIndexes((previous = {}) => {
            const prevIndexes = Array.isArray(previous[type]) ? previous[type] : [];
            const result = cycleItemSelection(prevIndexes, limit, pool.length, targetSlot, {
              forcedSelection: Number.isFinite(nextSelection) ? nextSelection : undefined,
            });
            if (!result.changed) {
              return previous;
            }
            return { ...previous, [type]: result.indexes };
          });
        }
      }
    },
    [recommendations]
  );

  const inputRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;
    const controllers = [];

    const loadItems = async () => {
      setItemsLoading(true);
      setItemsError(null);
      const errors = [];

      try {
        const entries = await Promise.all(
          ITEM_TYPES.map(async (type) => {
            try {
              const urls = buildDofusApiUrls(type, language);
              const aggregatedItems = [];

              for (const url of urls) {
                const controller = new AbortController();
                controllers.push(controller);

                try {
                  const response = await fetch(url, {
                    signal: controller.signal,
                    headers: { Accept: "application/json" },
                  });

                  if (!response.ok) {
                    throw new Error(`Requête DofusDB échouée (${response.status})`);
                  }

                  const payload = await response.json();
                  const rawItems = Array.isArray(payload)
                    ? payload
                    : Array.isArray(payload?.data)
                    ? payload.data
                    : Array.isArray(payload?.items)
                    ? payload.items
                    : [];

                  aggregatedItems.push(...rawItems);
                } catch (err) {
                  if (err.name === "AbortError") {
                    continue;
                  }

                  console.error(err);
                  errors.push({ type, error: err });
                }
              }

              if (!aggregatedItems.length) {
                return [type, []];
              }

              const normalizedItems = aggregatedItems
                .map((rawItem) =>
                  normalizeDofusItem(rawItem, type, {
                    language,
                    languagePriority,
                  })
                )
                .filter((item) => item !== null);

              const deduplicatedItems = Array.from(
                normalizedItems.reduce((accumulator, item) => {
                  if (!accumulator.has(item.id)) {
                    accumulator.set(item.id, item);
                  }
                  return accumulator;
                }, new Map()).values()
              );

              const enrichedItems = await enrichItemsWithPalettes(deduplicatedItems, () => isCancelled);

              return [type, enrichedItems];
            } catch (err) {
              if (err.name === "AbortError") {
                return [type, []];
              }

              console.error(err);
              errors.push({ type, error: err });
              return [type, []];
            }
          })
        );

        if (isCancelled) {
          return;
        }

        setItemsCatalog(Object.fromEntries(entries));

        if (errors.length) {
          const message =
            errors.length === ITEM_TYPES.length
              ? t("errors.itemsUnavailable")
              : t("errors.itemsPartial");
          setItemsError(message);
        }
      } catch (err) {
        if (isCancelled) {
          return;
        }

        console.error(err);
        setItemsCatalog({});
        setItemsError(t("errors.itemsUnavailable"));
      } finally {
        if (!isCancelled) {
          setItemsLoading(false);
        }
      }
    };

    loadItems();

    return () => {
      isCancelled = true;
      controllers.forEach((controller) => controller.abort());
    };
  }, [language, languagePriority, t]);

  const handleDataUrl = useCallback((dataUrl) => {
    if (!dataUrl) return;
    setInputMode("image");
    setImageSrc(dataUrl);
    setIsProcessing(true);
    setError(null);
    setCopiedCode(null);
    setImageSignature(null);
    setImageShape(null);
    setImageTones(null);
    setImageHash(null);
    setImageEdges(null);

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const { palette, signature, shape, tones, hash, edges } = analyzeImage(image, {
          trimTransparent: true,
          detectEdges: true,
          gradientThreshold: 32,
          paddingRatio: 0.06,
        });
        setColors(palette);
        setImageSignature(Array.isArray(signature) && signature.length ? signature : null);
        setImageShape(shape);
        setImageTones(Array.isArray(tones) && tones.length ? tones : null);
        setImageHash(typeof hash === "string" && hash.length ? hash : null);
        setImageEdges(Array.isArray(edges) && edges.length ? edges : null);
        if (!palette || palette.length === 0) {
          setError(t("errors.noColors"));
        }
      } catch (err) {
        console.error(err);
        setError(t("errors.paletteExtraction"));
        setColors([]);
        setImageSignature(null);
        setImageShape(null);
        setImageTones(null);
        setImageHash(null);
        setImageEdges(null);
      } finally {
        setIsProcessing(false);
      }
    };
    image.onerror = () => {
      setError(t("errors.corruptedImage"));
      setIsProcessing(false);
      setColors([]);
      setImageSignature(null);
      setImageShape(null);
      setImageTones(null);
      setImageHash(null);
      setImageEdges(null);
    };
    image.src = dataUrl;
  }, [t]);

  const handleFile = useCallback(
    (file) => {
      if (!file || !file.type.startsWith("image/")) {
        setError(t("errors.fileType"));
        setImageSignature(null);
        setImageShape(null);
        setImageTones(null);
        setImageHash(null);
        setImageEdges(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === "string") {
          handleDataUrl(result);
        }
      };
      reader.onerror = () => {
        setError(t("errors.fileRead"));
      };
      reader.readAsDataURL(file);
    },
    [handleDataUrl]
  );

  useEffect(() => {
    const handlePaste = (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            handleFile(file);
            event.preventDefault();
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleFile]);

  useEffect(() => {
    if (!copiedCode) return;
    const timeout = setTimeout(() => setCopiedCode(null), 1500);
    return () => clearTimeout(timeout);
  }, [copiedCode]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(timeout);
  }, [toast]);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      if (!isImageMode) {
        return;
      }
      setIsDragging(false);

      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile, isImageMode]
  );

  const onDragOver = useCallback(
    (event) => {
      if (!isImageMode) {
        return;
      }
      event.preventDefault();
      setIsDragging(true);
    },
    [isImageMode]
  );

  const onDragLeave = useCallback(
    (event) => {
      if (!isImageMode) {
        return;
      }
      event.preventDefault();
      setIsDragging(false);
    },
    [isImageMode]
  );

  const onBrowseClick = useCallback(() => {
    if (!isImageMode) {
      return;
    }
    inputRef.current?.click();
  }, [isImageMode]);

  const onFileInputChange = useCallback(
    (event) => {
      if (!isImageMode) {
        return;
      }
      const file = event.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile, isImageMode]
  );

  const handleColorInput = useCallback((event) => {
    const value = event.target.value;
    if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
      setSelectedColor(value.toUpperCase());
    }
  }, []);

  const handleRandomizeColor = useCallback(() => {
    const random = `#${Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")
      .toUpperCase()}`;
    setInputMode("color");
    setSelectedColor(random);
  }, []);

  const handleSeedClick = useCallback((hex) => {
    if (!hex) {
      return;
    }
    setInputMode("color");
    setSelectedColor(hex.toUpperCase());
  }, []);

  const handleCopy = useCallback(async (value, options = {}) => {
    const { swatch = null } = options;
    const fallbackCopy = (text) => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    };

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof window !== "undefined" &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(value);
      } else {
        fallbackCopy(value);
      }
      setError(null);
      setCopiedCode(value);
      setToast({ id: Date.now(), label: t("toast.colorCopied"), value, swatch });
    } catch (err) {
      console.error(err);
      try {
        fallbackCopy(value);
        setError(null);
        setCopiedCode(value);
        setToast({ id: Date.now(), label: t("toast.colorCopied"), value, swatch });
      } catch (fallbackErr) {
        console.error(fallbackErr);
        setError(t("errors.clipboard"));
      }
    }
  }, [t]);

  const formatThumbStyle = {
    transform:
      codeFormat === "hex" ? "translateX(0%)" : "translateX(calc(100% + 4px))",
  };

  const showProgressBar = isProcessing || analysisProgress > 0;
  const clampedProgress = Math.max(0, Math.min(analysisProgress, 100));
  const safeProgress = Number.isFinite(clampedProgress) ? clampedProgress : 0;
  const displayedProgress = isProcessing
    ? Math.max(safeProgress / 100, 0.05)
    : safeProgress / 100;
  const progressLabel = isProcessing
    ? t("progress.analyzing")
    : safeProgress >= 100
    ? t("progress.completed")
    : t("progress.ready");

  const getTextColor = useCallback((color) => {
    const luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
    return luminance > 155 ? "rgba(15, 23, 42, 0.9)" : "#f8fafc";
  }, []);

  const tagline = useMemo(() => {
    const raw = t("brand.tagline");
    return typeof raw === "string" ? raw.trim() : "";
  }, [t]);

  const pageTitle = tagline ? `${BRAND_NAME} · ${tagline}` : BRAND_NAME;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={t("meta.description")} />
      </Head>
      <main className="page">
        {showProgressBar ? (
          <div className="page-progress" role="status" aria-live="polite">
            <div
              className={`page-progress__indicator${isProcessing ? " page-progress__indicator--busy" : ""}`}
              style={{ transform: `scaleX(${displayedProgress})` }}
            />
            <span className="sr-only">{progressLabel}</span>
          </div>
        ) : null}
        <div className={`toast-tray${toast ? " toast-tray--visible" : ""}`} aria-live="polite">
          {toast ? (
            <div className="toast">
              <span className="toast__glow" aria-hidden="true" />
              <div className="toast__content">
                <span className="toast__icon" aria-hidden="true">✓</span>
                <div className="toast__body">
                  <span className="toast__title">{toast.label}</span>
                  <span className="toast__value">{toast.value}</span>
                </div>
                {toast.swatch ? (
                  <span
                    className="toast__swatch"
                    style={{ backgroundImage: buildGradientFromHex(toast.swatch) }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <header className="hero">
          <h1>{BRAND_NAME}</h1>
          <p className="hero__subtitle">
            Boostez l'apprentissage de notre IA via le{" "}
            <Link href="/skin-lab" className="hero__cta">
              Laboratoire d'entraînement
            </Link>
            .
          </p>
        </header>
        <div className="language-switcher" role="group" aria-label={t("language.selectorAria")}>
          {languageOptions.map((option) => {
            const isActive = option.code === language;
            return (
              <button
                key={option.code}
                type="button"
                className={`language-switcher__option${isActive ? " is-active" : ""}`}
                onClick={() => handleLanguageSelect(option.code)}
                aria-pressed={isActive}
                aria-label={option.accessibleLabel}
                title={option.accessibleLabel}
              >
                <span className="language-switcher__flag" aria-hidden="true">
                  <img src={option.flag} alt="" loading="lazy" />
                </span>
                <span className="language-switcher__code" aria-hidden="true">
                  {option.shortLabel ?? option.code.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>

        <section className="workspace">
          <div className="reference">
            <div className="reference__header">
              <div className="reference__title">
                <h2>{t("workspace.referenceTitle")}</h2>
              </div>
              <div className="input-switch" role="radiogroup" aria-label={t("aria.analysisMode")}>
                <span
                  className="input-switch__thumb"
                  style={{ transform: inputMode === "image" ? "translateX(0%)" : "translateX(100%)" }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className={`input-switch__option${isImageMode ? " is-active" : ""}`}
                  onClick={() => setInputMode("image")}
                  role="radio"
                  aria-checked={isImageMode}
                >
                  {t("workspace.mode.image")}
                </button>
                <button
                  type="button"
                  className={`input-switch__option${!isImageMode ? " is-active" : ""}`}
                  onClick={() => setInputMode("color")}
                  role="radio"
                  aria-checked={!isImageMode}
                >
                  {t("workspace.mode.color")}
                </button>
              </div>
            </div>
            {isImageMode ? (
              <div
                className={`dropzone${isDragging ? " dropzone--active" : ""}${imageSrc ? " dropzone--filled" : ""}`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                role="button"
                tabIndex={0}
                onClick={onBrowseClick}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onBrowseClick();
                  }
                }}
              >
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={t("workspace.dropzone.previewAlt")}
                    className="dropzone__preview"
                  />
                ) : (
                  <div className="dropzone__placeholder">
                    <strong>{t("workspace.dropzone.primary")}</strong>
                    <span>{t("workspace.dropzone.secondary")}</span>
                    <em>{t("workspace.dropzone.formats")}</em>
                    <span className="dropzone__hint">{t("workspace.dropzone.hint")}</span>
                  </div>
                )}
                <input
                  ref={inputRef}
                  className="dropzone__input"
                  type="file"
                  accept="image/*"
                  onChange={onFileInputChange}
                />
              </div>
            ) : (
              <div className="color-picker">
                <div
                  className="color-picker__preview"
                  style={{ backgroundImage: buildGradientFromHex(selectedColor) }}
                >
                  <span className="color-picker__preview-value">{selectedColor ?? "—"}</span>
                </div>
                <div className="color-picker__controls">
                  <label className="color-picker__label sr-only" htmlFor="seed-color">
                    {t("workspace.colorPicker.label")}
                  </label>
                  <div className="color-picker__inputs">
                    <input
                      id="seed-color"
                      className="color-picker__input"
                      type="color"
                      value={selectedColor ?? "#8B5CF6"}
                      onChange={handleColorInput}
                    />
                    <button type="button" className="color-picker__random" onClick={handleRandomizeColor}>
                      {t("workspace.colorPicker.random")}
                    </button>
                  </div>
                  <div className="color-picker__swatch-tray" role="list" aria-label={t("aria.colorSuggestions")}>
                    {CURATED_COLOR_SWATCHES.map((hex) => {
                      const isActive = selectedColor === hex.toUpperCase();
                      return (
                        <button
                          key={hex}
                          type="button"
                          className={`color-picker__swatch${isActive ? " is-active" : ""}`}
                          style={{ backgroundImage: buildGradientFromHex(hex) }}
                          onClick={() => handleSeedClick(hex)}
                          aria-pressed={isActive}
                        >
                          <span className="sr-only">{t("workspace.colorPicker.sr", { hex })}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="palette">
            <div className="palette__header">
              <div className="palette__title">
                <h2>{t("palette.title")}</h2>
              </div>
              <div className="palette__actions">
                {isProcessing ? <span className="badge badge--pulse">{t("palette.badge.analyzing")}</span> : null}
                <div className="format-switch" role="radiogroup" aria-label={t("palette.format.label")}>
                  <span className="format-switch__thumb" style={formatThumbStyle} aria-hidden="true" />
                  <button
                    type="button"
                    className={`format-switch__option${codeFormat === "hex" ? " is-active" : ""}`}
                    onClick={() => setCodeFormat("hex")}
                    role="radio"
                    aria-checked={codeFormat === "hex"}
                  >
                    {t("palette.format.hex")}
                  </button>
                  <button
                    type="button"
                    className={`format-switch__option${codeFormat === "rgb" ? " is-active" : ""}`}
                    onClick={() => setCodeFormat("rgb")}
                    role="radio"
                    aria-checked={codeFormat === "rgb"}
                  >
                    {t("palette.format.rgb")}
                  </button>
                </div>
              </div>
            </div>
            {colors.length > 0 ? (
              <div className="palette__skin-control" role="group" aria-label={t("palette.skin.groupLabel")}>
                <div className="palette__skin-meta">
                  <span className="palette__skin-label">{t("palette.skin.label")}</span>
                </div>
                <div className="palette__skin-options" role="radiogroup" aria-label={t("palette.skin.choicesLabel")}>
                  <button
                    type="button"
                    className={`palette__skin-option${!useCustomSkinTone ? " is-active" : ""}`}
                    onClick={() => setUseCustomSkinTone(false)}
                    role="radio"
                    aria-checked={!useCustomSkinTone}
                  >
                    {t("palette.skin.default")}
                  </button>
                  <button
                    type="button"
                    className={`palette__skin-option${useCustomSkinTone ? " is-active" : ""}`}
                    onClick={() => setUseCustomSkinTone(true)}
                    role="radio"
                    aria-checked={useCustomSkinTone}
                  >
                    {t("palette.skin.custom")}
                  </button>
                </div>
              </div>
            ) : null}
            {error ? <p className="palette__error">{error}</p> : null}
            {colors.length > 0 ? (
              <ul className="palette__list">
                {colors.map((color, index) => {
                  const value = codeFormat === "hex" ? color.hex : color.rgb;
                  const isCopied = copiedCode === value;
                  const textColor = getTextColor(color);
                  return (
                    <li key={`${color.hex}-${index}`} className="palette__item">
                      <button
                        type="button"
                        className={`palette__chip${isCopied ? " is-copied" : ""}`}
                        onClick={() => handleCopy(value, { swatch: color.hex })}
                        style={{ backgroundImage: buildGradientFromHex(color.hex), color: textColor }}
                      >
                        <span className="palette__chip-index">#{String(index + 1).padStart(2, "0")}</span>
                        <span className="palette__chip-value">{value}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="palette__empty">
                <p>{t("palette.empty")}</p>
              </div>
            )}
          </div>
          <div className="identity-card" role="group" aria-label={t("aria.identityCard")}>
            <div className="identity-card__section" role="group" aria-label={t("aria.genderSection")}>
              <span className="identity-card__section-title">{t("identity.gender.sectionTitle")}</span>
              <div className="identity-card__gender" role="radiogroup" aria-label={t("aria.genderGroup")}>
                <button
                  type="button"
                  className={`identity-card__gender-option${selectedGender === "male" ? " is-active" : ""}`}
                  onClick={() => setSelectedGender("male")}
                  role="radio"
                  aria-checked={selectedGender === "male"}
                >
                  <span className="identity-card__gender-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M15 3h6v6m0-6-7.5 7.5m1.5-1.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="identity-card__gender-text">{t("identity.gender.male")}</span>
                </button>
                <button
                  type="button"
                  className={`identity-card__gender-option${selectedGender === "female" ? " is-active" : ""}`}
                  onClick={() => setSelectedGender("female")}
                  role="radio"
                  aria-checked={selectedGender === "female"}
                >
                  <span className="identity-card__gender-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M12 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 12v8m-4-4h8"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="identity-card__gender-text">{t("identity.gender.female")}</span>
                </button>
              </div>
            </div>
            <div className="identity-card__section" role="group" aria-label={t("aria.classSection")}>
              {breedsError ? (
                <div className="identity-card__status identity-card__status--error" role="alert">
                  <span>{breedsError}</span>
                  <button
                    type="button"
                    className="identity-card__retry"
                    onClick={handleRetryBreeds}
                    disabled={breedsLoading}
                  >
                    {t("actions.retry")}
                  </button>
                </div>
              ) : null}
              {breedsLoading ? (
                <div className="identity-card__status" role="status" aria-live="polite">
                  {t("identity.class.loading")}
                </div>
              ) : null}
              <div className="identity-card__grid" role="radiogroup" aria-label={t("aria.classGroup")}>
                {breeds.map((breed) => {
                  if (!Number.isFinite(breed.id)) {
                    return null;
                  }
                  const isActive = breed.id === selectedBreedId;
                  const fallbackLetter = breed.name?.charAt(0)?.toUpperCase() ?? "?";
                  const breedLabel = breed.name ?? t("identity.class.fallback", { id: breed.id });

                  return (
                    <button
                      key={breed.slug ?? `breed-${breed.id}`}
                      type="button"
                      className={`identity-card__chip${isActive ? " is-active" : ""}`}
                      onClick={() => setSelectedBreedId(breed.id)}
                      role="radio"
                      aria-checked={isActive}
                      aria-label={t("identity.class.choose", { name: breedLabel })}
                      title={breedLabel}
                    >
                      <span className="identity-card__chip-icon">
                        {breed.icon ? (
                          <img src={breed.icon} alt="" loading="lazy" />
                        ) : (
                          <span className="identity-card__chip-letter" aria-hidden="true">
                            {fallbackLetter}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              className="identity-card__section"
              role="group"
              aria-label={t("aria.companionSection")}
            >
              <span className="identity-card__section-title">{t("identity.companion.sectionTitle")}</span>
              <div
                className="companion-toggle"
                role="group"
                aria-label={t("aria.companionFilter")}
              >
                {FAMILIER_FILTERS.map((filter) => {
                  const isActive = Boolean(familierFilters[filter.key]);
                  const label = t(filter.labelKey);
                  const title = isActive
                    ? t("companions.toggle.hide", { label: label.toLowerCase() })
                    : t("companions.toggle.show", { label: label.toLowerCase() });
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      className={`companion-toggle__chip${isActive ? " is-active" : ""}`}
                      onClick={() => handleFamilierFilterToggle(filter.key)}
                      aria-pressed={isActive}
                      title={title}
                    >
                      <span className="companion-toggle__indicator" aria-hidden="true">
                        {isActive ? (
                          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M5 10.5 8.2 13.7 15 6.5"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <span className="companion-toggle__dot" />
                        )}
                      </span>
                      <span className="companion-toggle__label">{label}</span>
                    </button>
                  );
                })}
              </div>
              {areAllFamilierFiltersDisabled ? (
                <p className="companion-toggle__empty" role="status">{t("identity.companion.empty")}</p>
              ) : null}
            </div>
            <div
              className="identity-card__section"
              role="group"
              aria-label={t("aria.itemFlagSection")}
            >
              <span className="identity-card__section-title">{t("identity.filters.sectionTitle")}</span>
              <div
                className="companion-toggle companion-toggle--item-flags"
                role="group"
                aria-label={t("aria.itemFlagFilter")}
              >
                {ITEM_FLAG_FILTERS.map((filter) => {
                  const isActive = itemFlagFilters[filter.key] !== false;
                  const label = t(filter.labelKey);
                  const title = isActive
                    ? t("companions.toggle.hide", { label: label.toLowerCase() })
                    : t("companions.toggle.show", { label: label.toLowerCase() });

                  return (
                    <button
                      key={filter.key}
                      type="button"
                      className={`companion-toggle__chip${isActive ? " is-active" : ""}`}
                      onClick={() => handleItemFlagFilterToggle(filter.key)}
                      aria-pressed={isActive}
                      title={title}
                    >
                      <span className="companion-toggle__indicator" aria-hidden="true">
                        {isActive ? (
                          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M5 10.5 8.2 13.7 15 6.5"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <span className="companion-toggle__dot" />
                        )}
                      </span>
                      <span className="companion-toggle__label">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="suggestions">
          {itemsLoading || (itemsError && !showDetailedMatches) ? (
            <div className="suggestions__header">
              {itemsLoading ? (
                <span className="suggestions__inline-status">{t("suggestions.header.updating")}</span>
              ) : null}
              {itemsError && !showDetailedMatches ? (
                <span className="suggestions__inline-status suggestions__inline-status--error">
                  {itemsError}
                </span>
              ) : null}
            </div>
          ) : null}
          {colors.length === 0 ? (
            <div className="suggestions__empty">
              <p>{t("suggestions.empty.start")}</p>
            </div>
          ) : !Number.isFinite(activeClassId) ? (
            <div className="suggestions__status suggestions__status--empty">
              <p>{t("suggestions.empty.identity")}</p>
            </div>
          ) : !hasCatalogData && itemsLoading ? (
            <div className="suggestions__status suggestions__status--loading">
              {t("suggestions.loading.items")}
            </div>
          ) : !hasCatalogData && itemsError ? (
            <div className="suggestions__status suggestions__status--error">{itemsError}</div>
          ) : !hasCatalogData ? (
            <div className="suggestions__status suggestions__status--empty">
              <p>{t("suggestions.empty.catalog")}</p>
            </div>
          ) : (
            <>
              {proposals.length ? (
                <div
                  className={`suggestions__layout${showDetailedMatches ? " has-panel-open" : ""}`}
                >
                  <div className="suggestions__main" aria-live="polite">
                    <div className="skin-carousel__shell">
                      <div className="skin-carousel">
                        <div className="skin-carousel__controls">
                          <button
                            type="button"
                            className="skin-carousel__nav"
                            onClick={handlePrevProposal}
                            disabled={proposalCount <= 1}
                            aria-label={t("aria.carouselPrevious")}
                          >
                            <img
                              src="/icons/arrow-left.svg"
                              alt=""
                              className="skin-carousel__nav-icon"
                              aria-hidden="true"
                            />
                          </button>
                          {(activeProposalSubtitle || proposalCount > 0) ? (
                            <div className="skin-carousel__legend" role="presentation">
                              {activeProposalSubtitle ? (
                                <span className="skin-carousel__subtitle">
                                  {activeProposalClassIcon ? (
                                    <span className="skin-carousel__class-icon" aria-hidden="true">
                                      <img src={activeProposalClassIcon} alt="" loading="lazy" />
                                    </span>
                                  ) : null}
                                  <span>{activeProposalSubtitle}</span>
                                </span>
                              ) : null}
                              {activeProposalSubtitle && proposalCount > 0 ? (
                                <span className="skin-carousel__divider" aria-hidden="true" />
                              ) : null}
                              {proposalCount > 0 ? (
                                <span className="skin-carousel__count">
                                  {t("suggestions.carousel.skinCount", {
                                    current: safeActiveProposalIndex + 1,
                                    total: proposalCount,
                                  })}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="skin-carousel__nav"
                            onClick={handleNextProposal}
                            disabled={proposalCount <= 1}
                            aria-label={t("aria.carouselNext")}
                          >
                            <img
                              src="/icons/arrow-right.svg"
                              alt=""
                              className="skin-carousel__nav-icon"
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                        <div className="skin-carousel__viewport">
                          <div
                            className="skin-carousel__track"
                            style={{ transform: `translateX(-${safeActiveProposalIndex * 100}%)` }}
                          >
                            {proposals.map((proposal) => {
                              const primaryColor = proposal.palette[0] ?? "#1f2937";
                              const canvasBackground = buildGradientFromHex(primaryColor);
                              const lookPreview = lookPreviews?.[proposal.id];
                              const lookLoaded =
                              lookPreview?.status === "loaded" &&
                              typeof lookPreview?.dataUrl === "string" &&
                              lookPreview.dataUrl.length > 0;
                            const lookLoading = lookPreview?.status === "loading";
                              const lookError =
                                lookPreview?.status === "error" && lookPreview?.error
                                  ? lookPreview.error
                                  : lookPreview?.status === "error"
                                ? t("errors.previewUnavailableDetailed")
                                : null;
                              const previewSrc = lookLoaded ? lookPreview.dataUrl : null;
                              const heroSrc = !lookLoaded ? proposal.heroImage ?? null : null;
                              const previewAlt = t("suggestions.render.alt", { index: proposal.index + 1 });
                              return (
                                <article key={proposal.id} className="skin-card">
                                <h3 className="sr-only">{t("suggestions.carousel.proposalTitle", { index: proposal.index + 1 })}</h3>
                                <div className="skin-card__body">
                                  <div
                                    className="skin-card__canvas"
                                    style={{ backgroundImage: canvasBackground }}
                                  >
                                    <div className="skin-card__render">
                                      {lookLoading ? (
                                            <div className="skin-card__loader" role="status" aria-live="polite">
                                              <span className="skin-card__loader-spinner" aria-hidden="true" />
                                              <span className="sr-only">{t("suggestions.render.loading")}</span>
                                            </div>
                                      ) : null}
                                      {lookError && !lookLoading && !lookLoaded ? (
                                        <div className="skin-card__status skin-card__status--error">
                                          {lookError}
                                        </div>
                                      ) : null}
                                      <div className="skin-card__glow" aria-hidden="true" />
                                      {previewSrc ? (
                                        <img
                                          src={previewSrc}
                                          alt={previewAlt}
                                          loading="lazy"
                                          className="skin-card__preview"
                                          onError={() => handleLookPreviewError(proposal.id)}
                                        />
                                      ) : heroSrc ? (
                                        <img
                                          src={heroSrc}
                                          alt={`Aperçu principal de la proposition ${proposal.index + 1}`}
                                          loading="lazy"
                                          className="skin-card__hero"
                                        />
                                      ) : (
                                        <div className="skin-card__placeholder" aria-hidden="true">
                                          Aperçu indisponible
                                        </div>
                                      )}
                                    </div>
                                    <ul className="skin-card__equipment" role="list">
                                      {proposal.items.map((item) => {
                                        const slotLabelKey = ITEM_TYPE_LABEL_KEYS[item.slotType];
                                        const slotLabel = slotLabelKey ? t(slotLabelKey) : item.slotType;
                                        const itemName = item.name ?? slotLabel;
                                        const altText = t("suggestions.render.itemAlt", {
                                          name: item.name ?? slotLabel,
                                        });
                                        const rerollDisabled =
                                          (recommendations?.[item.slotType]?.length ?? 0) <= 1;
                                        const flagEntries = buildItemFlags(item, t);
                                        const overlayFlags = flagEntries.filter((flag) => flag.key !== "colorable");
                                        const flagSummary = flagEntries.map((flag) => flag.label).join(", ");
                                        const overlaySummary = overlayFlags.map((flag) => flag.label).join(", ");
                                        const isColorable = item.isColorable === true;
                                        const triggerClasses = ["skin-card__equipment-trigger"];
                                        if (isColorable) {
                                          triggerClasses.push("skin-card__equipment-trigger--colorable");
                                        }

                                        return (
                                          <li key={`${proposal.id}-${item.id}`} className="skin-card__equipment-slot">
                                            <div className={triggerClasses.join(" ")} tabIndex={0}>
                                              {item.imageUrl ? (
                                                <img
                                                  src={item.imageUrl}
                                                  alt={altText}
                                                  loading="lazy"
                                                  className="skin-card__equipment-icon"
                                                />
                                              ) : (
                                                <span className="skin-card__equipment-fallback">{slotLabel}</span>
                                              )}
                                              {overlayFlags.length ? (
                                                <span
                                                  className="item-flags item-flags--overlay"
                                                  role="img"
                                                  aria-label={overlaySummary || undefined}
                                                  title={overlaySummary || undefined}
                                                >
                                                  {overlayFlags.map((flag) => {
                                                    const classes = ["item-flag", "item-flag--overlay"];
                                                    if (flag.className) {
                                                      classes.push(flag.className);
                                                    }
                                                    return (
                                                      <span
                                                        key={`${proposal.id}-${item.id}-${flag.key}-equip`}
                                                        className={classes.join(" ")}
                                                      >
                                                        <img src={flag.icon} alt="" aria-hidden="true" />
                                                      </span>
                                                    );
                                                  })}
                                                </span>
                                              ) : null}
                                              <div className="skin-card__tooltip" role="tooltip">
                                                {item.imageUrl ? (
                                                  <span className="skin-card__tooltip-thumb" aria-hidden="true">
                                                    <img src={item.imageUrl} alt="" loading="lazy" />
                                                  </span>
                                                ) : null}
                                                <div className="skin-card__tooltip-body">
                                                  <span className="skin-card__tooltip-title">{itemName}</span>
                                                  <span className="skin-card__tooltip-subtitle">{slotLabel}</span>
                                                  {flagEntries.length ? (
                                                    <span className="skin-card__tooltip-flags">{flagSummary}</span>
                                                  ) : null}
                                                </div>
                                              </div>
                                            </div>
                                            <button
                                              type="button"
                                              className="skin-card__reroll"
                                              onClick={() =>
                                                handleRerollItem(item.slotType, {
                                                  proposalIndex: proposal.index,
                                                })
                                              }
                                              title={t("suggestions.render.reroll")}
                                              aria-label={t("aria.itemReroll", {
                                                type: slotLabel,
                                                item: itemName,
                                              })}
                                              disabled={rerollDisabled}
                                            >
                                              <span aria-hidden="true">↻</span>
                                            </button>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                  <div className="skin-card__details">
                                    <ul className="skin-card__swatches" role="list">
                                      {proposal.palette.length ? (
                                        proposal.palette.map((hex) => (
                                          <li key={`${proposal.id}-${hex}`} className="skin-card__swatch">
                                            <button
                                              type="button"
                                              onClick={() => handleCopy(hex, { swatch: hex })}
                                              style={{ backgroundImage: buildGradientFromHex(hex) }}
                                              className="skin-card__swatch-button"
                                            >
                                              <span>{hex}</span>
                                            </button>
                                          </li>
                                        ))
                                      ) : (
                                        <li className="skin-card__swatch skin-card__swatch--empty">
                                          Palette indisponible
                                        </li>
                                      )}
                                    </ul>
                                    <ul className="skin-card__list" role="list">
                                      {proposal.items.map((item) => {
                                        const slotLabelKey = ITEM_TYPE_LABEL_KEYS[item.slotType];
                                        const slotLabel = slotLabelKey ? t(slotLabelKey) : item.slotType;
                                        const itemName = item.name ?? slotLabel;
                                        const rerollDisabled =
                                          (recommendations?.[item.slotType]?.length ?? 0) <= 1;
                                        const flagEntries = buildItemFlags(item, t);
                                        const flagSummary = flagEntries.map((flag) => flag.label).join(", ");
                                        return (
                                          <li key={`${proposal.id}-${item.id}-entry`} className="skin-card__list-item">
                                            <span className="skin-card__list-type">{slotLabel}</span>
                                            <div className="skin-card__list-actions">
                                              <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="skin-card__list-link"
                                              >
                                                {item.imageUrl ? (
                                                  <span className="skin-card__list-thumb" aria-hidden="true">
                                                    <img src={item.imageUrl} alt="" loading="lazy" />
                                                  </span>
                                                ) : null}
                                                <span className="skin-card__list-text">{itemName}</span>
                                                {flagEntries.length ? (
                                                  <span
                                                    className="item-flags item-flags--compact"
                                                    role="img"
                                                    aria-label={flagSummary}
                                                    title={flagSummary}
                                                  >
                                                    {flagEntries.map((flag) => {
                                                      const classes = ["item-flag"];
                                                      if (flag.className) {
                                                        classes.push(flag.className);
                                                      }
                                                      return (
                                                        <span
                                                          key={`${proposal.id}-${item.id}-${flag.key}-list`}
                                                          className={classes.join(" ")}
                                                        >
                                                          <img src={flag.icon} alt="" aria-hidden="true" />
                                                        </span>
                                                      );
                                                    })}
                                                  </span>
                                                ) : null}
                                              </a>
                                              <button
                                                type="button"
                                                className="skin-card__reroll skin-card__reroll--inline"
                                                onClick={() =>
                                                  handleRerollItem(item.slotType, {
                                                    proposalIndex: proposal.index,
                                                  })
                                                }
                                                title={t("suggestions.render.reroll")}
                                                aria-label={t("aria.itemReroll", {
                                                  type: slotLabel,
                                                  item: itemName,
                                                })}
                                                disabled={rerollDisabled}
                                              >
                                                <span aria-hidden="true">↻</span>
                                              </button>
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                    <div className="skin-card__actions">
                                      {lookLoaded ? (
                                        <button
                                          type="button"
                                          onClick={() => handleDownloadPreview(proposal)}
                                          className="skin-card__cta"
                                          disabled={downloadingPreviewId === proposal.id}
                                          aria-busy={downloadingPreviewId === proposal.id}
                                        >
                                          {downloadingPreviewId === proposal.id
                                            ? t("suggestions.render.downloading")
                                            : t("suggestions.render.download")}
                                        </button>
                                      ) : lookLoading ? (
                                        <span className="skin-card__cta skin-card__cta--disabled">
                                          {t("suggestions.render.loading")}
                                        </span>
                                      ) : (
                                        <span className="skin-card__cta skin-card__cta--disabled">
                                          {t("suggestions.render.unavailable")}
                                        </span>
                                      )}
                                      {proposal.barbofusLink ? (
                                        <a
                                          href={proposal.barbofusLink}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="skin-card__cta"
                                        >
                                          {t("suggestions.render.link")}
                                          <span aria-hidden="true" className="skin-card__cta-icon">
                                            ↗
                                          </span>
                                        </a>
                                      ) : (
                                        <span className="skin-card__cta skin-card__cta--disabled">
                                          {t("suggestions.render.linkUnavailable")}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                      <div className="skin-carousel__dots" role="tablist" aria-label={t("aria.carouselDots")}>
                        {proposals.map((proposal, index) => (
                          <button
                            key={`${proposal.id}-dot`}
                            type="button"
                            className={`skin-carousel__dot${index === safeActiveProposalIndex ? " is-active" : ""}`}
                            onClick={() => handleSelectProposal(index)}
                            aria-label={t("aria.carouselDotSelect", { index: index + 1 })}
                            aria-pressed={index === safeActiveProposalIndex}
                          />
                        ))}
                      </div>
                      </div>
                      <button
                        type="button"
                    className={`suggestions__panel-toggle skin-carousel__panel-toggle${showDetailedMatches ? " is-open" : ""}`}
                    onClick={toggleDetailedMatches}
                    aria-expanded={showDetailedMatches}
                    aria-label={
                      showDetailedMatches ? t("aria.panelToggleClose") : t("aria.panelToggleOpen")
                    }
                  >
                    <span className="skin-carousel__panel-toggle-icon" aria-hidden="true" />
                  </button>
                </div>
              </div>
                  <aside
                    className={`suggestions__panel${showDetailedMatches ? " is-open" : ""}`}
                    aria-hidden={!showDetailedMatches}
                  >
                  <div className="suggestions__panel-header">
                      <h3>{t("suggestions.panel.title")}</h3>
                      <button
                        type="button"
                        className="suggestions__panel-close"
                        onClick={toggleDetailedMatches}
                        aria-label={t("aria.panelClose")}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                    {itemsError ? (
                      <p className="suggestions__status suggestions__status--error suggestions__status--inline">
                        {itemsError}
                      </p>
                    ) : null}
                    {itemsLoading ? (
                      <p className="suggestions__status suggestions__status--loading suggestions__status--inline">
                        {t("suggestions.panel.updating")}
                      </p>
                    ) : null}
                    <div className="suggestions__grid">
                      {ITEM_TYPES.map((type) => {
                        const pool = recommendations?.[type] ?? [];
                        const limit = pool.length > 0 ? Math.min(PANEL_ITEMS_LIMIT, pool.length) : 0;
                        const selections = Array.isArray(panelItemIndexes[type])
                          ? panelItemIndexes[type]
                          : [];
                        const items = Array.from({ length: limit }, (_, slotIndex) => {
                          const selectionIndex = selections[slotIndex];
                          const poolIndex =
                            Number.isFinite(selectionIndex) &&
                            selectionIndex >= 0 &&
                            selectionIndex < pool.length
                              ? selectionIndex
                              : slotIndex;

                          if (!pool[poolIndex]) {
                            return null;
                          }

                          return { item: pool[poolIndex], slotIndex };
                        }).filter(Boolean);
                        return (
                          <section key={type} className="suggestions__group">
                            <header className="suggestions__group-header">
                              <span className="suggestions__group-type">
                                {ITEM_TYPE_LABEL_KEYS[type] ? t(ITEM_TYPE_LABEL_KEYS[type]) : type}
                              </span>
                              {items.length > 0 ? (
                                <span className="suggestions__group-badge">{t("suggestions.panel.bestMatch")}</span>
                              ) : null}
                            </header>
                            {items.length === 0 ? (
                              <p className="suggestions__group-empty">{t("suggestions.panel.empty")}</p>
                            ) : (
                              <ul className="suggestions__deck">
                                {items.map(({ item, slotIndex }) => {
                                  const hasPalette = item.palette.length > 0;
                                  const paletteFromImage = item.paletteSource === "image" && hasPalette;
                                  const notes = [];
                                  const typeLabel =
                                    ITEM_TYPE_LABEL_KEYS[type] ? t(ITEM_TYPE_LABEL_KEYS[type]) : type;
                                  const isColorable = item.isColorable === true;
                                  const thumbClasses = ["suggestions__thumb"];
                                  if (isColorable) {
                                    thumbClasses.push("suggestions__thumb--colorable");
                                  }
                                  if (!hasPalette) {
                                    notes.push(t("errors.paletteMissing"));
                                  } else if (!paletteFromImage) {
                                    notes.push(t("errors.paletteEstimated"));
                                  }
                                  if (!item.imageUrl) {
                                    notes.push(t("errors.imageMissing"));
                                  }

                                  return (
                                    <li key={item.id} className="suggestions__card">
                                      <div className={thumbClasses.join(" ")}>
                                        {item.imageUrl ? (
                                          <img
                                            src={item.imageUrl}
                                            alt={t("suggestions.render.itemAlt", { name: item.name })}
                                            loading="lazy"
                                          />
                                        ) : (
                                          <div className="suggestions__thumb-placeholder" aria-hidden="true">
                                            {t("suggestions.thumb.placeholder")}
                                          </div>
                                        )}
                                      </div>
                                      <div className="suggestions__card-body">
                                        <div className="suggestions__card-header">
                                          <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="suggestions__title"
                                          >
                                            {item.name}
                                          </a>
                                        </div>
                                        <div
                                          className={`suggestions__swatches${hasPalette ? "" : " suggestions__swatches--empty"}`}
                                          aria-hidden={hasPalette}
                                        >
                                          {hasPalette ? (
                                            item.palette.map((hex) => (
                                              <span
                                                key={hex}
                                                className="suggestions__swatch"
                                                style={{ backgroundColor: hex }}
                                              />
                                            ))
                                        ) : (
                                            <span className="suggestions__swatch-note">{t("suggestions.palette.unavailable")}</span>
                                          )}
                                        </div>
                                        {notes.length ? (
                                          <div className="suggestions__notes">
                                            {notes.map((note, index) => (
                                              <span key={`${item.id}-note-${index}`} className="suggestions__note">
                                                {note}
                                              </span>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  </aside>
                {showDetailedMatches ? (
                  <button
                    type="button"
                    className="suggestions__panel-backdrop"
                    onClick={toggleDetailedMatches}
                    aria-label={t("aria.panelBackdrop")}
                  >
                    <span className="sr-only">{t("aria.panelBackdrop")}</span>
                  </button>
                ) : null}
                </div>
              ) : (
                <div className="suggestions__status suggestions__status--empty">
                  <p>{t("suggestions.empty.results")}</p>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}

export async function getStaticProps() {
  try {
    if (typeof fetch !== "function") {
      return {
        props: { initialBreeds: [BARBOFUS_DEFAULT_BREED] },
        revalidate: 3600,
      };
    }

    const response = await fetch(buildBreedsUrl(DEFAULT_LANGUAGE), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const dataset = normalizeBreedsDataset(payload, {
      language: DEFAULT_LANGUAGE,
      languagePriority: getLanguagePriority(DEFAULT_LANGUAGE),
    });

    return {
      props: {
        initialBreeds: dataset.length ? dataset : [BARBOFUS_DEFAULT_BREED],
      },
      revalidate: 3600,
    };
  } catch (error) {
    console.error("Unable to prefetch Dofus breeds:", error);
    return {
      props: { initialBreeds: [BARBOFUS_DEFAULT_BREED] },
      revalidate: 3600,
    };
  }
}
