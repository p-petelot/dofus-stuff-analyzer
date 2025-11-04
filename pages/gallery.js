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
  STATIC_GALLERY_BREEDS,
  STATIC_GALLERY_ITEMS,
  resolveStaticItemUrl,
} from "../lib/gallery/static-data";

const ITEM_TYPES = ["coiffe", "cape", "bouclier", "familier", "epauliere", "costume", "ailes"];
const DOFUS_API_HOST = "https://api.dofusdb.fr";
const DOFUS_API_BASE_URL = `${DOFUS_API_HOST}/items`;
const DEFAULT_LIMIT = 200;
const MAX_ITEM_PALETTE_COLORS = 6;
const DEFAULT_LOOK_ANIMATION = 0;
const DEFAULT_LOOK_DIRECTION = 1;
const LOOK_PREVIEW_SIZE = 512;
const SKIN_SOUFF_BASE_URL = "https://skin.souff.fr/";
const BARBOFUS_BASE_URL = "https://barbofus.com/skinator";
const BARBOFUS_GENDER_VALUES = { male: 0, female: 1 };
const BARBOFUS_SLOT_BY_TYPE = {
  coiffe: "6",
  cape: "7",
  familier: "8",
  bouclier: "9",
  ailes: "10",
  epauliere: "11",
  costume: "12",
};

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

const BARBOFUS_DEFAULT_FACE = BARBOFUS_FACE_ID_BY_CLASS[7] ?? { male: 97, female: 105 };

const ITEM_TYPE_CONFIG = {
  coiffe: {
    requests: [
      { typeIds: [16], limit: DEFAULT_LIMIT },
      { typeIds: [246], limit: DEFAULT_LIMIT },
    ],
  },
  cape: {
    requests: [
      { typeIds: [17], limit: DEFAULT_LIMIT },
      { typeIds: [247], limit: DEFAULT_LIMIT },
    ],
  },
  familier: {
    requests: [
      { typeIds: [18, 249], limit: DEFAULT_LIMIT },
      { typeIds: [121, 250], limit: DEFAULT_LIMIT },
      { typeIds: [97], limit: DEFAULT_LIMIT },
      { typeIds: [196], limit: DEFAULT_LIMIT },
      { typeIds: [207], limit: DEFAULT_LIMIT },
    ],
  },
  epauliere: {
    requests: [{ typeIds: [299], limit: DEFAULT_LIMIT }],
  },
  costume: {
    requests: [{ typeIds: [199], limit: DEFAULT_LIMIT }],
  },
  ailes: {
    requests: [{ typeIds: [300], limit: DEFAULT_LIMIT }],
  },
  bouclier: {
    requests: [
      { typeIds: [82], limit: DEFAULT_LIMIT },
      { typeIds: [248], limit: DEFAULT_LIMIT },
    ],
  },
};

const DEFAULT_LOOK_DIRECTIONS = [0, 1, 2, 3, 4, 5, 6, 7];

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

function ensureAbsoluteUrl(path) {
  if (!path || typeof path !== "string") {
    return null;
  }
  const trimmed = path.trim();
  if (!trimmed) {
    return null;
  }
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

function scorePaletteMatch(basePalette, candidatePalette) {
  if (!Array.isArray(basePalette) || !basePalette.length) {
    return Number.POSITIVE_INFINITY;
  }
  if (!Array.isArray(candidatePalette) || !candidatePalette.length) {
    return Number.POSITIVE_INFINITY;
  }
  const baseRgb = basePalette.map((hex) => hexToRgb(hex)).filter(Boolean);
  const candidateRgb = candidatePalette.map((hex) => hexToRgb(hex)).filter(Boolean);
  if (!baseRgb.length || !candidateRgb.length) {
    return Number.POSITIVE_INFINITY;
  }
  let total = 0;
  candidateRgb.forEach((color) => {
    let best = Number.POSITIVE_INFINITY;
    baseRgb.forEach((reference) => {
      const distance = colorDistance(color, reference);
      if (distance < best) {
        best = distance;
      }
    });
    total += best;
  });
  return total / candidateRgb.length;
}

function buildLookPalette(basePalette, variantIndex = 0) {
  if (!Array.isArray(basePalette) || basePalette.length === 0) {
    return [];
  }
  const normalized = basePalette.map((hex) => normalizeColorToHex(hex)).filter(Boolean);
  const unique = Array.from(new Set(normalized));
  if (variantIndex <= 0) {
    return unique.slice(0, MAX_ITEM_PALETTE_COLORS);
  }
  const rotation = variantIndex % unique.length;
  const rotated = unique.slice(rotation).concat(unique.slice(0, rotation));
  return rotated.slice(0, MAX_ITEM_PALETTE_COLORS);
}

function hexToNumeric(hex) {
  const normalized = normalizeColorToHex(hex);
  if (!normalized) {
    return null;
  }
  const numeric = parseInt(normalized.replace(/#/g, ""), 16);
  return Number.isFinite(numeric) ? numeric : null;
}

function getSouffSexCode(gender) {
  if (gender === "f") {
    return 1;
  }
  if (gender === "m") {
    return 0;
  }
  return null;
}

function buildSouffLink({ classId, faceId, gender, itemIds, colors, animation, direction } = {}) {
  if (!Number.isFinite(classId) || !Number.isFinite(faceId)) {
    return null;
  }
  const sex = getSouffSexCode(gender);
  if (sex === null) {
    return null;
  }
  const normalizedItems = Array.isArray(itemIds)
    ? itemIds.map((value) => (Number.isFinite(value) ? Math.trunc(value) : null)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (!normalizedItems.length) {
    return null;
  }
  const normalizedColors = Array.isArray(colors)
    ? colors.map((value) => (Number.isFinite(value) ? Math.trunc(value) : null)).filter((value) => Number.isFinite(value) && value >= 0)
    : [];
  if (!normalizedColors.length) {
    return null;
  }
  const animationCode = Number.isFinite(animation) ? Math.max(0, Math.trunc(animation)) : 0;
  const directionCode = Number.isFinite(direction) ? Math.max(0, Math.min(7, Math.trunc(direction))) : 0;
  const payload = [
    Math.trunc(classId),
    Math.trunc(faceId),
    sex,
    normalizedItems,
    normalizedColors,
    directionCode,
    0,
    [],
    animationCode,
  ];
  const serialized = JSON.stringify(payload);
  if (!serialized) {
    return null;
  }
  let base64 = "";
  if (typeof Buffer !== "undefined") {
    base64 = Buffer.from(serialized, "utf8").toString("base64");
  } else if (typeof btoa === "function") {
    try {
      base64 = btoa(serialized);
    } catch (error) {
      base64 = "";
    }
  }
  if (!base64) {
    return null;
  }
  return `${SKIN_SOUFF_BASE_URL}?look=${encodeURIComponent(base64)}`;
}

const LZ_KEY_STR_URI_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
const LZ_BASE_REVERSE_DICTIONARY = Object.create(null);

function getUriSafeCharFromInt(value) {
  return LZ_KEY_STR_URI_SAFE.charAt(value);
}

function getUriSafeValueFromChar(character) {
  if (!character) {
    return 0;
  }
  const cacheKey = LZ_KEY_STR_URI_SAFE;
  if (!Object.prototype.hasOwnProperty.call(LZ_BASE_REVERSE_DICTIONARY, cacheKey)) {
    const map = Object.create(null);
    for (let index = 0; index < LZ_KEY_STR_URI_SAFE.length; index += 1) {
      map[LZ_KEY_STR_URI_SAFE.charAt(index)] = index;
    }
    LZ_BASE_REVERSE_DICTIONARY[cacheKey] = map;
  }
  const dictionary = LZ_BASE_REVERSE_DICTIONARY[cacheKey];
  if (!Object.prototype.hasOwnProperty.call(dictionary, character)) {
    return 0;
  }
  return dictionary[character];
}

function compressToEncodedURIComponent(input) {
  if (input == null) {
    return "";
  }
  const dictionary = {};
  const dictionaryToCreate = {};
  const data = Array.from(String(input));
  const enlargeInStart = 2;
  let numBits = 2;
  let enlargeIn = enlargeInStart;
  let dictSize = 3;
  let w = "";
  const result = [];
  const getWc = (char) => `${w}${char}`;

  const pushBits = (bits, value) => {
    for (let i = 0; i < bits; i += 1) {
      const bit = value & (1 << i);
      result.push(bit ? 1 : 0);
    }
  };

  for (let i = 0; i < data.length; i += 1) {
    const c = data[i];
    if (!Object.prototype.hasOwnProperty.call(dictionary, c)) {
      dictionary[c] = dictSize;
      dictSize += 1;
      dictionaryToCreate[c] = true;
    }
    const wc = getWc(c);
    if (Object.prototype.hasOwnProperty.call(dictionary, wc)) {
      w = wc;
    } else {
      if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, w)) {
        const charCode = w.charCodeAt(0);
        if (charCode < 256) {
          pushBits(numBits, 0);
          pushBits(8, charCode);
        } else {
          pushBits(numBits, 1);
          pushBits(16, charCode);
        }
        enlargeIn -= 1;
        if (enlargeIn === 0) {
          enlargeIn = 1 << numBits;
          numBits += 1;
        }
        delete dictionaryToCreate[w];
      } else {
        pushBits(numBits, dictionary[w]);
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
      const charCode = w.charCodeAt(0);
      if (charCode < 256) {
        pushBits(numBits, 0);
        pushBits(8, charCode);
      } else {
        pushBits(numBits, 1);
        pushBits(16, charCode);
      }
      delete dictionaryToCreate[w];
    } else {
      pushBits(numBits, dictionary[w]);
    }
  }

  pushBits(numBits, 2);

  let encoded = "";
  let buffer = 0;
  let bitsInBuffer = 0;
  result.forEach((bit) => {
    buffer = (buffer << 1) | bit;
    bitsInBuffer += 1;
    if (bitsInBuffer === 6) {
      encoded += getUriSafeCharFromInt(buffer);
      buffer = 0;
      bitsInBuffer = 0;
    }
  });
  if (bitsInBuffer > 0) {
    buffer <<= 6 - bitsInBuffer;
    encoded += getUriSafeCharFromInt(buffer);
  }
  return encoded;
}

function buildBarbofusLink(items, paletteHexes, { classId, gender, faceId } = {}) {
  if (!Array.isArray(items) || !items.length || !Number.isFinite(classId)) {
    return null;
  }
  const payload = {
    1: Number.isFinite(classId) ? Math.trunc(classId) : 7,
    2: Number.isFinite(faceId) ? Math.trunc(faceId) : null,
    3: BARBOFUS_GENDER_VALUES[gender === "f" ? "female" : "male"],
    4: items
      .map((item) => ({ slot: BARBOFUS_SLOT_BY_TYPE[item.slotType] ?? null, id: item.ankamaId }))
      .filter((entry) => entry.slot && Number.isFinite(entry.id))
      .map((entry) => ({ s: entry.slot, i: Math.trunc(entry.id) })),
    5: paletteHexes
      .map((hex) => hexToNumeric(hex))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.trunc(value)),
  };
  if (!payload[4].length || !payload[5].length) {
    return null;
  }
  const encoded = compressToEncodedURIComponent(JSON.stringify(payload));
  if (!encoded) {
    return null;
  }
  return `${BARBOFUS_BASE_URL}?s=${encoded}`;
}

function normalizeLookDirection(value, fallback = DEFAULT_LOOK_DIRECTION) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 7) {
    return 7;
  }
  return numeric;
}

function getDefaultDofusQueryParams(language = DEFAULT_LANGUAGE) {
  const normalized = normalizeLanguage(language ?? DEFAULT_LANGUAGE);
  return {
    "typeId[$ne]": "203",
    "$sort": "-id",
    "level[$gte]": "0",
    "level[$lte]": "200",
    lang: normalized,
  };
}

function buildDofusApiRequests(type, language = DEFAULT_LANGUAGE) {
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
    const limit = source.limit ?? config.limit ?? DEFAULT_LIMIT;
    params.set("$limit", String(limit));
    params.set("$skip", "0");
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
    return {
      url: `${DOFUS_API_BASE_URL}?${params.toString()}`,
    };
  });
}

async function fetchItemsForType(type, language, languagePriority) {
  const requests = buildDofusApiRequests(type, language);
  const aggregated = [];
  for (const request of requests) {
    try {
      const response = await fetch(request.url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const rawItems = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.items)
        ? payload.items
        : [];
      aggregated.push(...rawItems);
    } catch (error) {
      console.error(error);
    }
  }
  const normalized = aggregated
    .map((raw) => normalizeDofusItem(raw, type, language, languagePriority))
    .filter(Boolean);
  const deduplicated = Array.from(
    normalized.reduce((map, item) => {
      if (!map.has(item.id)) {
        map.set(item.id, item);
      }
      return map;
    }, new Map()).values(),
  );
  if (deduplicated.length > 0) {
    return deduplicated;
  }

  const normalizedLanguage = normalizeLanguage(language);
  const fallbackItems = (STATIC_GALLERY_ITEMS[type] ?? []).map((entry) => ({
    ...entry,
    url: entry.url ?? resolveStaticItemUrl(normalizedLanguage, type, entry.slug),
  }));
  if (!fallbackItems.length) {
    console.warn(`Aucun objet disponible pour le type ${type}`);
  }
  return fallbackItems;
}

function normalizeDofusItem(rawItem, type, language, languagePriority) {
  const nameCandidates = [];
  if (rawItem?.name) {
    if (typeof rawItem.name === "string") {
      nameCandidates.push(rawItem.name);
    } else if (typeof rawItem.name === "object") {
      const priority = Array.isArray(languagePriority) && languagePriority.length
        ? languagePriority
        : getLanguagePriority(language);
      for (const key of priority) {
        if (rawItem.name[key]) {
          nameCandidates.push(String(rawItem.name[key]));
          break;
        }
      }
      if (!nameCandidates.length) {
        const fallback = Object.values(rawItem.name)[0];
        if (fallback) {
          nameCandidates.push(String(fallback));
        }
      }
    }
  }
  if (!nameCandidates.length && rawItem?.title) {
    if (typeof rawItem.title === "string") {
      nameCandidates.push(rawItem.title);
    } else if (typeof rawItem.title === "object") {
      const priority = Array.isArray(languagePriority) && languagePriority.length
        ? languagePriority
        : getLanguagePriority(language);
      for (const key of priority) {
        if (rawItem.title[key]) {
          nameCandidates.push(String(rawItem.title[key]));
          break;
        }
      }
      if (!nameCandidates.length) {
        const fallback = Object.values(rawItem.title)[0];
        if (fallback) {
          nameCandidates.push(String(fallback));
        }
      }
    }
  }
  const name = nameCandidates.length ? nameCandidates[0] : null;
  if (!name) {
    return null;
  }
  const ankamaId = Number.isFinite(Number(rawItem?.ankamaId))
    ? Number(rawItem.ankamaId)
    : Number.isFinite(Number(rawItem?.id))
    ? Number(rawItem.id)
    : Number.isFinite(Number(rawItem?._id))
    ? Number(rawItem._id)
    : null;
  if (!Number.isFinite(ankamaId)) {
    return null;
  }
  const palette = extractPaletteFromItemData(rawItem);
  if (!palette.length) {
    return null;
  }
  const imageUrl = ensureAbsoluteUrl(rawItem?.img) || ensureAbsoluteUrl(rawItem?.image);
  const slug = slugify(name) || `${type}-${ankamaId}`;
  const url = `https://www.dofus.com/${normalizeLanguage(language)}/mmorpg/encyclopedie/${type}/${slug}`;
  return {
    id: `${type}-${ankamaId}`,
    name,
    type,
    palette,
    ankamaId,
    imageUrl,
    url,
    slug,
    familierCategory: rawItem?.typeId ?? null,
    paletteSource: "api",
  };
}

async function fetchBreeds(language, languagePriority) {
  const params = new URLSearchParams();
  params.set("$skip", "0");
  params.set("$limit", "40");
  params.set("lang", normalizeLanguage(language));
  try {
    const response = await fetch(`${DOFUS_API_HOST}/breeds?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    const entries = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.items)
      ? payload.items
      : [];
    const normalized = entries
      .map((entry) => normalizeBreedEntry(entry, language, languagePriority))
      .filter(Boolean);
    if (normalized.length > 0) {
      return normalized;
    }
    console.warn("Impossible de récupérer les classes via l'API, utilisation du jeu statique");
    return STATIC_GALLERY_BREEDS.map((breed) => ({ ...breed }));
  } catch (error) {
    console.error(error);
    return STATIC_GALLERY_BREEDS.map((breed) => ({ ...breed }));
  }
}

function normalizeBreedEntry(entry, language, languagePriority) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const id = Number(entry.id);
  if (!Number.isFinite(id)) {
    return null;
  }
  const priority = Array.isArray(languagePriority) && languagePriority.length
    ? languagePriority
    : getLanguagePriority(language);
  const pickName = (value) => {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value === "object") {
      for (const key of priority) {
        if (value[key]) {
          return String(value[key]);
        }
      }
      const fallback = Object.values(value)[0];
      return fallback ? String(fallback) : null;
    }
    return null;
  };
  const name = pickName(entry.shortName) || pickName(entry.name) || `Classe ${id}`;
  const icon = ensureAbsoluteUrl(entry.img);
  return {
    id,
    name,
    icon,
  };
}

async function loadCatalog(language, languagePriority) {
  const entries = await Promise.all(
    ITEM_TYPES.map(async (type) => {
      const items = await fetchItemsForType(type, language, languagePriority);
      return [type, items];
    }),
  );
  return Object.fromEntries(entries);
}

function pickRandom(array) {
  if (!Array.isArray(array) || !array.length) {
    return null;
  }
  const index = Math.floor(Math.random() * array.length);
  return array[index];
}

function selectItemForSlot(slot, basePalette, catalog, forbiddenIds = new Set()) {
  const pool = Array.isArray(catalog?.[slot]) ? catalog[slot] : [];
  if (!pool.length) {
    return null;
  }
  const scored = pool
    .filter((item) => Array.isArray(item.palette) && item.palette.length && !forbiddenIds.has(item.ankamaId))
    .map((item) => ({ item, score: scorePaletteMatch(basePalette, item.palette) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 12);
  if (!scored.length) {
    return null;
  }
  const choice = pickRandom(scored.slice(0, Math.min(5, scored.length))) ?? scored[0];
  return choice.item;
}

function buildGalleryEntry({
  catalog,
  breeds,
  index,
  language,
  t,
}) {
  const breed = pickRandom(breeds);
  if (!breed) {
    return null;
  }
  const gender = Math.random() < 0.5 ? "m" : "f";
  const genderKey = gender === "f" ? "female" : "male";
  const faceEntry = BARBOFUS_FACE_ID_BY_CLASS[breed.id] ?? BARBOFUS_DEFAULT_FACE;
  const faceId = faceEntry?.[genderKey] ?? BARBOFUS_DEFAULT_FACE[genderKey] ?? null;

  const basePool = Array.isArray(catalog.costume) && catalog.costume.length
    ? catalog.costume
    : Array.isArray(catalog.coiffe)
    ? catalog.coiffe
    : [];
  const baseItem = pickRandom(basePool.filter((item) => item.palette.length >= 2));
  if (!baseItem) {
    return null;
  }
  const selectedItems = [];
  const seenIds = new Set();
  const basePalette = [...baseItem.palette];
  selectedItems.push({ ...baseItem, slotType: "costume" });
  seenIds.add(baseItem.ankamaId);

  ITEM_TYPES.forEach((slot) => {
    if (slot === "costume") {
      return;
    }
    const candidate = selectItemForSlot(slot, basePalette, catalog, seenIds);
    if (candidate) {
      selectedItems.push({ ...candidate, slotType: slot });
      seenIds.add(candidate.ankamaId);
      candidate.palette.forEach((hex) => {
        if (!basePalette.includes(hex)) {
          basePalette.push(hex);
        }
      });
    }
  });

  const palette = buildLookPalette(basePalette, index % 4);
  if (!palette.length) {
    return null;
  }
  const lookColors = palette
    .map((hex) => hexToNumeric(hex))
    .filter((value, i, array) => Number.isFinite(value) && array.indexOf(value) === i)
    .slice(0, MAX_ITEM_PALETTE_COLORS);
  if (!lookColors.length) {
    return null;
  }
  const lookItemIds = Array.from(new Set(selectedItems.map((item) => item.ankamaId).filter(Number.isFinite))).sort(
    (a, b) => a - b,
  );
  if (!lookItemIds.length) {
    return null;
  }
  const classLabel = breed.name;
  const genderLabel = gender === "f" ? t("gallery.gender.female") : t("gallery.gender.male");
  const subtitle = `${classLabel} · ${genderLabel}`;
  const title = t("gallery.entryTitle", { index: index + 1, className: classLabel });
  const barbofusLink = buildBarbofusLink(selectedItems, palette, {
    classId: breed.id,
    gender,
    faceId,
  });
  const souffLink = buildSouffLink({
    classId: breed.id,
    faceId,
    gender,
    itemIds: lookItemIds,
    colors: lookColors,
    animation: DEFAULT_LOOK_ANIMATION,
    direction: DEFAULT_LOOK_DIRECTION,
  });
  const lookBaseKey = `${breed.id}-${gender}-${lookItemIds.join("-")}-${lookColors.join("-")}`;
  return {
    id: `${breed.id}-${gender}-${lookBaseKey}-${index}`,
    title,
    subtitle,
    palette,
    items: selectedItems,
    classId: breed.id,
    className: classLabel,
    classIcon: breed.icon,
    lookGender: gender,
    lookFaceId: faceId,
    lookItemIds,
    lookColors,
    lookAnimation: DEFAULT_LOOK_ANIMATION,
    lookDirection: DEFAULT_LOOK_DIRECTION,
    lookBaseKey,
    barbofusLink,
    souffLink,
  };
}

async function requestLookPreview(descriptor, direction, language) {
  const params = new URLSearchParams();
  params.set("breedId", String(descriptor.classId));
  params.set("gender", descriptor.lookGender);
  params.set("lang", normalizeLanguage(language));
  params.set("size", String(LOOK_PREVIEW_SIZE));
  params.set("animation", String(Number.isFinite(descriptor.lookAnimation) ? descriptor.lookAnimation : DEFAULT_LOOK_ANIMATION));
  params.set("direction", String(normalizeLookDirection(direction)));
  if (Number.isFinite(descriptor.lookFaceId)) {
    params.set("faceId", String(Math.trunc(descriptor.lookFaceId)));
  }
  descriptor.lookItemIds.forEach((id) => {
    if (Number.isFinite(id)) {
      params.append("itemIds[]", String(Math.trunc(id)));
    }
  });
  descriptor.lookColors.slice(0, MAX_ITEM_PALETTE_COLORS).forEach((value) => {
    if (Number.isFinite(value)) {
      params.append("colors[]", String(Math.trunc(value)));
    }
  });
  const response = await fetch(`/api/look-preview?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const payload = await response.json();
  const contentType = payload?.contentType ?? "image/png";
  const base64 = payload?.base64 ?? null;
  if (payload?.dataUrl) {
    return payload.dataUrl;
  }
  if (base64) {
    return `data:${contentType};base64,${base64}`;
  }
  return payload?.rendererUrl ?? null;
}

function GalleryCard({ entry, onSelect }) {
  return (
    <button type="button" className="gallery-card" onClick={() => onSelect(entry)}>
      <div className="gallery-card__preview">
        {entry.preview ? (
          <img src={entry.preview} alt="" loading="lazy" />
        ) : (
          <div className="gallery-card__preview--placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="gallery-card__meta">
        <span className="gallery-card__title">{entry.title}</span>
        {entry.subtitle ? <span className="gallery-card__subtitle">{entry.subtitle}</span> : null}
      </div>
    </button>
  );
}

function DirectionSelector({
  directions = DEFAULT_LOOK_DIRECTIONS,
  activeDirection,
  onSelect,
  t,
}) {
  return (
    <div className="skin-card__direction" role="group" aria-label={t("gallery.direction.label")}>
      {directions.map((value) => (
        <button
          key={`direction-${value}`}
          type="button"
          className={`skin-card__direction-btn${value === activeDirection ? " is-active" : ""}`}
          onClick={() => onSelect(value)}
          aria-pressed={value === activeDirection}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

function GalleryDetail({ entry, onClose, language, t }) {
  const [activeDirection, setActiveDirection] = useState(entry.lookDirection ?? DEFAULT_LOOK_DIRECTION);
  const [previews, setPreviews] = useState(() => ({ [activeDirection]: entry.preview ?? null }));
  const [loadingDirections, setLoadingDirections] = useState(() => new Set());
  const [errorDirections, setErrorDirections] = useState(() => (entry.preview ? {} : { [activeDirection]: true }));

  useEffect(() => {
    setActiveDirection(entry.lookDirection ?? DEFAULT_LOOK_DIRECTION);
    setPreviews({ [entry.lookDirection ?? DEFAULT_LOOK_DIRECTION]: entry.preview ?? null });
    setLoadingDirections(new Set());
    setErrorDirections(entry.preview ? {} : { [entry.lookDirection ?? DEFAULT_LOOK_DIRECTION]: true });
  }, [entry]);

  const handleDirection = useCallback(
    async (direction) => {
      const normalized = normalizeLookDirection(direction);
      setActiveDirection(normalized);
      setErrorDirections((previous) => ({ ...previous, [normalized]: false }));
      setPreviews((previous) => {
        if (previous[normalized]) {
          return previous;
        }
        return { ...previous };
      });
      setLoadingDirections((previous) => new Set(previous).add(normalized));
      try {
        const preview = await requestLookPreview(entry, normalized, language);
        setPreviews((previous) => ({ ...previous, [normalized]: preview }));
      } catch (error) {
        console.error(error);
        setErrorDirections((previous) => ({ ...previous, [normalized]: true }));
      } finally {
        setLoadingDirections((previous) => {
          const next = new Set(previous);
          next.delete(normalized);
          return next;
        });
      }
    },
    [entry, language],
  );

  const activePreview = previews[activeDirection] ?? null;
  const lookLoaded = Boolean(activePreview);

  const handleDownload = useCallback(() => {
    if (!activePreview) {
      return;
    }
    const link = document.createElement("a");
    link.href = activePreview;
    link.download = `${entry.lookBaseKey || entry.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [activePreview, entry.id, entry.lookBaseKey]);

  const handleCopy = useCallback(async () => {
    if (
      !activePreview ||
      typeof navigator?.clipboard?.write === "undefined" ||
      typeof ClipboardItem === "undefined"
    ) {
      return;
    }
    try {
      const data = await fetch(activePreview);
      const blob = await data.blob();
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
    } catch (error) {
      console.error(error);
    }
  }, [activePreview]);

  const handleShare = useCallback(async () => {
    if (!navigator?.share || !activePreview) {
      return;
    }
    try {
      await navigator.share({
        title: entry.title,
        text: entry.subtitle,
        url: entry.barbofusLink ?? entry.souffLink ?? window.location.href,
      });
    } catch (error) {
      console.error(error);
    }
  }, [activePreview, entry.barbofusLink, entry.souffLink, entry.subtitle, entry.title]);

  return (
    <div className="gallery-detail" role="dialog" aria-modal="true">
      <div className="gallery-detail__content">
        <button type="button" className="gallery-detail__close" onClick={onClose}>
          {t("gallery.close")}
        </button>
        <div className="gallery-detail__preview">
          {lookLoaded ? (
            <img src={activePreview} alt={entry.title} />
          ) : (
            <div className="gallery-detail__preview--placeholder" aria-hidden="true" />
          )}
        </div>
        <DirectionSelector
          directions={DEFAULT_LOOK_DIRECTIONS}
          activeDirection={activeDirection}
          onSelect={handleDirection}
          t={t}
        />
        {errorDirections[activeDirection] ? (
          <p className="gallery-detail__error">{t("errors.previewUnavailable")}</p>
        ) : null}
        <div className="gallery-detail__meta">
          <h2>{entry.title}</h2>
          {entry.subtitle ? <p>{entry.subtitle}</p> : null}
          <div className="skin-card__palette">
            <ul className="skin-card__swatches">
              {entry.palette.map((hex) => (
                <li key={`${entry.id}-${hex}`} className="skin-card__swatch">
                  <span style={{ backgroundColor: hex }} aria-label={hex} />
                </li>
              ))}
            </ul>
          </div>
          <div className="skin-card__equipment">
            <h3>{t("gallery.itemsTitle")}</h3>
            <ul className="skin-card__equipment-list">
              {entry.items.map((item) => (
                <li key={`${entry.id}-${item.id}`} className="skin-card__equipment-slot">
                  <a href={item.url} target="_blank" rel="noreferrer" className="skin-card__equipment-link">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" /> : null}
                    <span>
                      <strong>{item.name}</strong>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="skin-card__actions">
            <button type="button" className="skin-card__cta" onClick={handleDownload} disabled={!lookLoaded}>
              <span className="skin-card__cta-icon" aria-hidden="true">
                <img src="/icons/download.svg" alt="" />
              </span>
              <span className="sr-only">{t("gallery.actions.download")}</span>
            </button>
            {entry.barbofusLink ? (
              <a
                href={entry.barbofusLink}
                target="_blank"
                rel="noreferrer"
                className="skin-card__cta"
                title={t("gallery.actions.barbofus")}
              >
                <span className="skin-card__cta-icon" aria-hidden="true">
                  <img src="/icons/barbofus.svg" alt="" />
                </span>
                <span className="sr-only">{t("gallery.actions.barbofus")}</span>
              </a>
            ) : (
              <span className="skin-card__cta skin-card__cta--disabled">{t("gallery.actions.unavailable")}</span>
            )}
            {entry.souffLink ? (
              <a
                href={entry.souffLink}
                target="_blank"
                rel="noreferrer"
                className="skin-card__cta"
                title={t("gallery.actions.souff")}
              >
                <span className="skin-card__cta-icon" aria-hidden="true">
                  <img src="/icons/souff.svg" alt="" />
                </span>
                <span className="sr-only">{t("gallery.actions.souff")}</span>
              </a>
            ) : (
              <span className="skin-card__cta skin-card__cta--disabled">{t("gallery.actions.unavailable")}</span>
            )}
            <button type="button" className="skin-card__cta" onClick={handleCopy} disabled={!lookLoaded}>
              <span className="skin-card__cta-icon" aria-hidden="true">
                <img src="/icons/copy.svg" alt="" />
              </span>
              <span className="sr-only">{t("gallery.actions.copy")}</span>
            </button>
            <button type="button" className="skin-card__cta" onClick={handleShare}>
              <span className="skin-card__cta-icon" aria-hidden="true">
                <img src="/icons/share.svg" alt="" />
              </span>
              <span className="sr-only">{t("gallery.actions.share")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GalleryPage() {
  const { language, t } = useLanguage();
  const languagePriority = useMemo(() => getLanguagePriority(language), [language]);
  const [catalog, setCatalog] = useState(null);
  const [breeds, setBreeds] = useState([]);
  const [entries, setEntries] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const loaderRef = useRef(null);
  const router = useRouter();
  const generationIndexRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [catalogData, breedsData] = await Promise.all([
          loadCatalog(language, languagePriority),
          fetchBreeds(language, languagePriority),
        ]);
        if (cancelled) {
          return;
        }
        setCatalog(catalogData);
        setBreeds(breedsData.length ? breedsData : [{
          id: 7,
          name: translate(language, "identity.class.fallback", { id: 7 }, "Eniripsa"),
          icon: null,
        }]);
        setEntries([]);
        generationIndexRef.current = 0;
        setHasMore(true);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError(t("errors.itemsUnavailable"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [language, languagePriority, t]);

  const loadBatch = useCallback(
    async (batchSize = 12) => {
      if (!catalog || !breeds.length || loadingMore) {
        return;
      }
      setLoadingMore(true);
      const generated = [];
      let safety = 0;
      while (generated.length < batchSize && safety < batchSize * 4) {
        const index = generationIndexRef.current + generated.length;
        const entry = buildGalleryEntry({ catalog, breeds, index, language, t });
        if (entry) {
          try {
            const preview = await requestLookPreview(entry, entry.lookDirection, language);
            generated.push({ ...entry, preview });
          } catch (err) {
            console.error(err);
            generated.push({ ...entry, preview: null });
          }
        }
        safety += 1;
      }
      generationIndexRef.current += generated.length;
      setEntries((previous) => [...previous, ...generated]);
      if (generated.length < batchSize) {
        setHasMore(false);
      }
      setLoadingMore(false);
    },
    [breeds, catalog, language, loadingMore, t],
  );

  useEffect(() => {
    if (!catalog || !breeds.length) {
      return;
    }
    loadBatch(16);
  }, [catalog, breeds, loadBatch]);

  useEffect(() => {
    if (!hasMore) {
      return;
    }
    const observer = new IntersectionObserver(
      (entriesList) => {
        if (!loadingMore && entriesList.some((entry) => entry.isIntersecting)) {
          loadBatch(12);
        }
      },
      { rootMargin: "256px" },
    );
    const node = loaderRef.current;
    if (node) {
      observer.observe(node);
    }
    return () => {
      if (node) {
        observer.unobserve(node);
      }
      observer.disconnect();
    };
  }, [hasMore, loadBatch, loadingMore]);

  const pageTitle = useMemo(() => `${t("brand.name")} · ${t("gallery.title")}`, [t]);

  const handleSelect = useCallback(
    (entry) => {
      setSelected(entry);
      if (entry && typeof window !== "undefined") {
        window.location.hash = entry.id;
      }
    },
    [],
  );

  const handleClose = useCallback(() => {
    setSelected(null);
    if (typeof window !== "undefined" && router.asPath.includes("#")) {
      window.history.replaceState(null, "", router.asPath.split("#")[0]);
    }
  }, [router]);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <main className="gallery-page">
        <header className="gallery-page__header">
          <div className="gallery-page__headline">
            <h1>{t("gallery.title")}</h1>
            <p className="gallery-page__lead">{t("gallery.lead")}</p>
          </div>
          <nav className="gallery-page__nav" aria-label={t("navigation.label")}>
            <Link href="/" className="gallery-page__nav-link">
              {t("navigation.analyzer")}
            </Link>
            <Link href="/gallery" className="gallery-page__nav-link" aria-current="page">
              {t("navigation.gallery")}
            </Link>
          </nav>
        </header>
        {loading ? (
          <div className="gallery-page__loader" aria-live="polite">
            <span className="gallery-page__loader-bar" />
            <span className="sr-only">{t("gallery.loading")}</span>
          </div>
        ) : error ? (
          <p className="gallery-page__error">{error}</p>
        ) : null}
        <section className="gallery-grid" aria-live="polite">
          {entries.map((entry) => (
            <GalleryCard key={entry.id} entry={entry} onSelect={handleSelect} />
          ))}
        </section>
        {hasMore ? (
          <div
            className="gallery-page__loader"
            ref={loaderRef}
            aria-hidden={loadingMore ? "false" : "true"}
          >
            <span className="gallery-page__loader-bar" />
            <span className="sr-only">{t("gallery.loading")}</span>
          </div>
        ) : null}
      </main>
      {selected ? (
        <GalleryDetail entry={selected} onClose={handleClose} language={language} t={t} />
      ) : null}
    </>
  );
}

