import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";

const ITEM_TYPES = ["coiffe", "cape", "bouclier", "familier"];
const DOFUS_API_HOST = "https://api.dofusdb.fr";
const DOFUS_API_BASE_URL = `${DOFUS_API_HOST}/items`;
const DEFAULT_LIMIT = 1200;
const DEFAULT_DOFUS_QUERY_PARAMS = {
  "typeId[$ne]": "203",
  "$sort": "-id",
  "level[$gte]": "0",
  "level[$lte]": "200",
  lang: "fr",
};

const ITEM_TYPE_CONFIG = {
  coiffe: {
    requests: [
      { typeIds: [16], skip: 0, limit: 1200 },
      { typeIds: [246], skip: 0, limit: 1200 },
    ],
  },
  cape: {
    requests: [
      { typeIds: [17], skip: 0, limit: 1200 },
      { typeIds: [247], skip: 0, limit: 1200 },
    ],
  },
  familier: {
    requests: [
      { typeIds: [18], skip: 0, limit: 1200 },
      { typeIds: [249], skip: 0, limit: 1200 },
    ],
  },
  bouclier: {
    requests: [
      { typeIds: [82], skip: 0, limit: 1200 },
      { typeIds: [248], skip: 0, limit: 1200 },
    ],
  },
};

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

function pickLocalizedValue(value) {
  if (!value) return "";
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => pickLocalizedValue(entry)).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    const priorityKeys = ["fr", "fr_fr", "frFr", "en", "en_us", "enUs"];
    for (const key of priorityKeys) {
      if (value[key]) {
        const candidate = pickLocalizedValue(value[key]);
        if (candidate) {
          return candidate;
        }
      }
    }
    const first = Object.values(value)[0];
    return pickLocalizedValue(first);
  }
  return "";
}

function normalizeTextContent(value) {
  const extracted = pickLocalizedValue(value);
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

function buildDofusApiUrls(type) {
  const config = ITEM_TYPE_CONFIG[type];
  if (!config) {
    throw new Error(`Type d'objet inconnu: ${type}`);
  }

  const sources = config.requests?.length ? config.requests : [config];

  return sources.map((source) => {
    const params = new URLSearchParams();
    Object.entries(DEFAULT_DOFUS_QUERY_PARAMS).forEach(([key, value]) => {
      params.set(key, value);
    });

    const limit = source.limit ?? config.limit ?? DEFAULT_LIMIT;
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

function buildEncyclopediaUrl(item, fallbackId) {
  const ankamaId = item?.ankamaId ?? item?.id ?? item?._id ?? fallbackId;
  if (!ankamaId) {
    return null;
  }
  return `https://dofusdb.fr/fr/database/object/${ankamaId}`;
}

function normalizeDofusItem(item, type) {
  const name = normalizeTextContent(item?.name) || normalizeTextContent(item?.title);
  if (!name) {
    return null;
  }

  const slugSource = normalizeTextContent(item?.slug) || name;
  const fallbackSlug = slugify(slugSource) || slugify(name) || name;
  const rawIdentifier = item?.ankamaId ?? item?.id ?? item?._id ?? fallbackSlug;
  const identifierString = rawIdentifier != null ? String(rawIdentifier) : fallbackSlug;
  const numericIdentifier = Number(rawIdentifier);
  const ankamaId = Number.isFinite(numericIdentifier) ? numericIdentifier : null;
  const encyclopediaUrl = buildEncyclopediaUrl(item, rawIdentifier ?? fallbackSlug) ??
    "https://www.dofus.com/fr/mmorpg/encyclopedie";
  const imageUrl = resolveItemImageUrl(item);
  const palette = extractPaletteFromItemData(item);
  const paletteSource = palette.length ? "api" : "unknown";

  return {
    id: `${type}-${identifierString}`,
    name,
    type,
    palette,
    url: encyclopediaUrl,
    imageUrl,
    paletteSource,
    ankamaId,
    signature: null,
    shape: null,
  };
}

const BRAND_NAME = "KrosPalette";
const MAX_COLORS = 6;
const MAX_DIMENSION = 280;
const BUCKET_SIZE = 24;
const SIGNATURE_GRID_SIZE = 10;
const SHAPE_PROFILE_SIZE = 28;
const PALETTE_SCORE_WEIGHT = 0.38;
const SIGNATURE_SCORE_WEIGHT = 0.37;
const SHAPE_SCORE_WEIGHT = 0.25;
const MAX_COLOR_DISTANCE = Math.sqrt(255 * 255 * 3);
const PALETTE_COVERAGE_THRESHOLD = 56;
const PALETTE_COVERAGE_WEIGHT = 0.32;
const SIGNATURE_CONFIDENCE_DISTANCE = 160;
const SIGNATURE_CONFIDENCE_WEIGHT = 0.22;
const SIGNATURE_STRONG_THRESHOLD = 24;
const SIGNATURE_PERFECT_THRESHOLD = 14;
const MAX_SHAPE_DISTANCE = 1;
const SHAPE_CONFIDENCE_DISTANCE = 0.32;
const SHAPE_CONFIDENCE_WEIGHT = 0.16;
const SHAPE_STRONG_THRESHOLD = 0.18;
const MIN_ALPHA_WEIGHT = 0.05;
const MAX_RECOMMENDATIONS = 1;

const ITEM_TYPE_LABELS = {
  coiffe: "Coiffe",
  cape: "Cape",
  familier: "Familier",
  bouclier: "Bouclier",
};

const BARBOFUS_BASE_URL = "https://barbofus.com/skinator";
const BARBOFUS_CLASS_IDS = {
  feca: 1,
  osamodas: 2,
  enutrof: 3,
  eniripsa: 7,
};
const BARBOFUS_DEFAULTS = {
  gender: 1,
  classId: BARBOFUS_CLASS_IDS.eniripsa,
  lookId: 405,
};
const BARBOFUS_EQUIPMENT_SLOTS = ["6", "7", "8", "9", "10", "11", "12", "13"];
const BARBOFUS_SLOT_BY_TYPE = {
  coiffe: "6",
  cape: "7",
  familier: "8",
  bouclier: "9",
};

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

function componentToHex(value) {
  const hex = value.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

function rgbToHex(r, g, b) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function extractPalette(image) {
  const canvas = document.createElement("canvas");
  const ratio = Math.min(
    1,
    MAX_DIMENSION / (image.width || MAX_DIMENSION),
    MAX_DIMENSION / (image.height || MAX_DIMENSION)
  );

  const width = Math.max(1, Math.round((image.width || MAX_DIMENSION) * ratio));
  const height = Math.max(1, Math.round((image.height || MAX_DIMENSION) * ratio));

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return [];
  }

  context.drawImage(image, 0, 0, width, height);
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

function computeImageSignature(image, gridSize = SIGNATURE_GRID_SIZE) {
  if (!image || gridSize <= 0 || typeof document === "undefined") {
    return [];
  }

  const canvas = document.createElement("canvas");
  canvas.width = gridSize;
  canvas.height = gridSize;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return [];
  }

  context.drawImage(image, 0, 0, gridSize, gridSize);
  const { data } = context.getImageData(0, 0, gridSize, gridSize);

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

function computeShapeProfile(image, gridSize = SHAPE_PROFILE_SIZE) {
  if (!image || gridSize <= 0 || typeof document === "undefined") {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = gridSize;
  canvas.height = gridSize;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0, gridSize, gridSize);
  const { data } = context.getImageData(0, 0, gridSize, gridSize);

  const rows = new Array(gridSize).fill(0);
  const columns = new Array(gridSize).fill(0);

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const index = (y * gridSize + x) * 4;
      const alpha = data[index + 3] / 255;
      rows[y] += alpha;
      columns[x] += alpha;
    }
  }

  const normalize = (values) =>
    values.map((sum) => {
      const normalized = sum / gridSize;
      return Number.isFinite(normalized) ? Math.min(Math.max(normalized, 0), 1) : 0;
    });

  const normalizedRows = normalize(rows);
  const normalizedColumns = normalize(columns);
  const occupancy =
    normalizedRows.reduce((accumulator, value) => accumulator + value, 0) / gridSize;

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

function scoreItemAgainstPalette(item, palette, referenceSignature, referenceShape) {
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

  const paletteFinite = Number.isFinite(paletteScore);
  const signatureFinite = Number.isFinite(signatureScore);

  const shapeFinite = Number.isFinite(shapeScore);

  if (!paletteFinite && !signatureFinite && !shapeFinite) {
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

  return Number.isFinite(finalScore) ? finalScore : Number.POSITIVE_INFINITY;
}

function analyzePaletteFromUrl(imageUrl) {
  if (!imageUrl || typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.resolve({ palette: [], signature: [], shape: null });
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        const palette = extractPalette(image);
        const signature = computeImageSignature(image);
        const shape = computeShapeProfile(image);
        resolve({ palette, signature, shape });
      } catch (err) {
        console.error(err);
        resolve({ palette: [], signature: [], shape: null });
      }
    };
    image.onerror = () => {
      resolve({ palette: [], signature: [], shape: null });
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

      const { palette: paletteEntries, signature, shape } = await analyzePaletteFromUrl(item.imageUrl);
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

      return {
        ...item,
        palette: nextPalette,
        paletteSource: nextSource,
        signature: nextSignature,
        shape: nextShape,
      };
    })
  );

  return enriched;
}

export default function Home() {
  const [imageSrc, setImageSrc] = useState(null);
  const [colors, setColors] = useState([]);
  const [imageSignature, setImageSignature] = useState(null);
  const [imageShape, setImageShape] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [codeFormat, setCodeFormat] = useState("hex");
  const [toast, setToast] = useState(null);
  const [itemsCatalog, setItemsCatalog] = useState({});
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const progressHandles = useRef({ frame: null, timeout: null, value: 0 });

  const hasCatalogData = useMemo(
    () => ITEM_TYPES.some((type) => (itemsCatalog[type] ?? []).length > 0),
    [itemsCatalog]
  );

  const colorsCount = colors.length;

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
      value = Math.min(value, 90);
      handles.value = value;
      setAnalysisProgress(value);

      const tick = () => {
        value = Math.min(value + Math.random() * 6 + 2, 94);
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
      }, 700);
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
    if (!colors.length) {
      return null;
    }

    return ITEM_TYPES.reduce((accumulator, type) => {
      const catalogItems = itemsCatalog[type] ?? [];
      if (!catalogItems.length) {
        accumulator[type] = [];
        return accumulator;
      }

      const scoredItems = catalogItems
        .map((item) => ({
          item,
          score: scoreItemAgainstPalette(item, colors, imageSignature, imageShape),
        }))
        .sort((a, b) => a.score - b.score);

      const finiteScores = scoredItems.filter(({ score }) => Number.isFinite(score));
      const ranked = finiteScores.length > 0 ? finiteScores : scoredItems;

      accumulator[type] = ranked.slice(0, MAX_RECOMMENDATIONS).map(({ item }) => item);
      return accumulator;
    }, {});
  }, [colors, imageSignature, imageShape, itemsCatalog]);

  const barbofusLink = useMemo(() => {
    if (!colors.length || !recommendations) {
      return null;
    }

    const colorValues = colors
      .map((entry) => {
        if (!entry?.hex) return null;
        const numeric = parseInt(entry.hex.replace(/#/g, ""), 16);
        return Number.isFinite(numeric) ? numeric : null;
      })
      .filter((value) => value !== null);

    if (!colorValues.length) {
      return null;
    }

    const equipment = BARBOFUS_EQUIPMENT_SLOTS.reduce((accumulator, slot) => {
      accumulator[slot] = null;
      return accumulator;
    }, {});

    let hasEquipment = false;

    ITEM_TYPES.forEach((type) => {
      const slot = BARBOFUS_SLOT_BY_TYPE[type];
      if (!slot) {
        return;
      }

      const item = recommendations[type]?.find((entry) => entry?.ankamaId);
      if (!item?.ankamaId) {
        return;
      }

      equipment[slot] = item.ankamaId;
      hasEquipment = true;
    });

    if (!hasEquipment) {
      return null;
    }

    const payload = {
      1: BARBOFUS_DEFAULTS.gender,
      2: BARBOFUS_DEFAULTS.classId,
      3: BARBOFUS_DEFAULTS.lookId,
      4: colorValues,
      5: equipment,
    };

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
  }, [colors, recommendations]);

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
              const urls = buildDofusApiUrls(type);
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
                .map((rawItem) => normalizeDofusItem(rawItem, type))
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
              ? "Impossible de récupérer les objets Dofus pour le moment."
              : "Certaines catégories d'objets n'ont pas pu être chargées.";
          setItemsError(message);
        }
      } catch (err) {
        if (isCancelled) {
          return;
        }

        console.error(err);
        setItemsCatalog({});
        setItemsError("Impossible de récupérer les objets Dofus pour le moment.");
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
  }, []);

  const handleDataUrl = useCallback((dataUrl) => {
    if (!dataUrl) return;
    setImageSrc(dataUrl);
    setIsProcessing(true);
    setError(null);
    setCopiedCode(null);
    setImageSignature(null);
    setImageShape(null);

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const palette = extractPalette(image);
        const signature = computeImageSignature(image);
        const shape = computeShapeProfile(image);
        setColors(palette);
        setImageSignature(signature.length ? signature : null);
        setImageShape(shape);
        if (palette.length === 0) {
          setError("Aucune couleur dominante détectée.");
        }
      } catch (err) {
        console.error(err);
        setError("Impossible d'extraire les couleurs de cette image.");
        setColors([]);
        setImageSignature(null);
        setImageShape(null);
      } finally {
        setIsProcessing(false);
      }
    };
    image.onerror = () => {
      setError("L'image semble corrompue ou illisible.");
      setIsProcessing(false);
      setColors([]);
      setImageSignature(null);
      setImageShape(null);
    };
    image.src = dataUrl;
  }, []);

  const handleFile = useCallback(
    (file) => {
      if (!file || !file.type.startsWith("image/")) {
        setError("Merci de choisir un fichier image.");
        setImageSignature(null);
        setImageShape(null);
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
        setError("Lecture du fichier impossible.");
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
      setIsDragging(false);

      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const onBrowseClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onFileInputChange = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleCopy = useCallback(async (value) => {
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
      setToast({ id: Date.now(), label: "Couleur copiée", value });
    } catch (err) {
      console.error(err);
      try {
        fallbackCopy(value);
        setError(null);
        setCopiedCode(value);
        setToast({ id: Date.now(), label: "Couleur copiée", value });
      } catch (fallbackErr) {
        console.error(fallbackErr);
        setError("Impossible de copier dans le presse-papiers.");
      }
    }
  }, []);

  const formatThumbStyle = {
    transform:
      codeFormat === "hex" ? "translateX(0%)" : "translateX(calc(100% + 4px))",
  };

  const getRingPosition = useCallback((index, total) => {
    if (total <= 1) {
      return { left: "50%", top: "50%" };
    }

    if (index === 0) {
      return { left: "50%", top: "50%" };
    }

    const orbitCount = total - 1;
    const radius = orbitCount <= 2 ? 24 : orbitCount === 3 ? 28 : orbitCount === 4 ? 32 : 34;
    const angle = ((index - 1) / orbitCount) * 360 - 90;
    const radians = (angle * Math.PI) / 180;
    const x = 50 + radius * Math.cos(radians);
    const y = 50 + radius * Math.sin(radians);

    return {
      left: `${x}%`,
      top: `${y}%`,
    };
  }, []);

  const getTextColor = useCallback((color) => {
    const luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
    return luminance > 155 ? "rgba(15, 23, 42, 0.9)" : "#f8fafc";
  }, []);

  return (
    <>
      <Head>
        <title>{`${BRAND_NAME} · Studio de skins Dofus`}</title>
        <meta
          name="description"
          content="KrosPalette extrait les couleurs dominantes de tes images pour composer des skins Dofus harmonieux."
        />
      </Head>
      <main className="page">
        <div className={`toast-tray${toast ? " toast-tray--visible" : ""}`} aria-live="polite">
          {toast ? (
            <div className="toast">
              <span className="toast__icon" aria-hidden="true">✓</span>
              <div className="toast__body">
                <span className="toast__title">{toast.label}</span>
                <span className="toast__value">{toast.value}</span>
              </div>
            </div>
          ) : null}
        </div>
        <header className="hero">
          <h1>{BRAND_NAME}</h1>
        </header>

        <section className="workspace">
          {(isProcessing || analysisProgress > 0) && (
            <div className="workspace__progress" role="status" aria-live="polite">
              <div className={`progress-bar${isProcessing ? " progress-bar--active" : ""}`}>
                <div className="progress-bar__track">
                  <div
                    className="progress-bar__indicator"
                    style={{ width: `${Math.min(100, Math.max(analysisProgress, 0))}%` }}
                  />
                  <span className="progress-bar__glow" />
                </div>
                <span className="progress-bar__label">
                  {isProcessing
                    ? "Analyse de l'image…"
                    : analysisProgress >= 100
                    ? "Analyse terminée"
                    : "Analyse prête"}
                </span>
              </div>
            </div>
          )}
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
              <img src={imageSrc} alt="Aperçu de la référence importée" className="dropzone__preview" />
            ) : (
              <div className="dropzone__placeholder">
                <strong>Glisse ton visuel ici</strong>
                <span>… ou colle-le directement depuis ton presse-papiers</span>
                <em>Formats acceptés : PNG, JPG, WebP, GIF statique</em>
              </div>
            )}
            <input
              ref={inputRef}
              className="dropzone__input"
              type="file"
              accept="image/*"
              onChange={onFileInputChange}
            />
            <div className="dropzone__hint">Cliquer ouvre l'explorateur de fichiers</div>
          </div>

          <div className="palette">
            <div className="palette__header">
              <div className="palette__title">
                <h2>Palette extraite</h2>
              </div>
              <div className="palette__actions">
                {isProcessing ? <span className="badge badge--pulse">Analyse en cours…</span> : null}
                <div className="format-switch" role="radiogroup" aria-label="Format des codes couleur">
                  <span className="format-switch__thumb" style={formatThumbStyle} aria-hidden="true" />
                  <button
                    type="button"
                    className={`format-switch__option${codeFormat === "hex" ? " is-active" : ""}`}
                    onClick={() => setCodeFormat("hex")}
                    role="radio"
                    aria-checked={codeFormat === "hex"}
                  >
                    Hexa
                  </button>
                  <button
                    type="button"
                    className={`format-switch__option${codeFormat === "rgb" ? " is-active" : ""}`}
                    onClick={() => setCodeFormat("rgb")}
                    role="radio"
                    aria-checked={codeFormat === "rgb"}
                  >
                    RGB
                  </button>
                </div>
              </div>
            </div>
            {error ? <p className="palette__error">{error}</p> : null}
            {colors.length > 0 ? (
              <ul className="palette__ring">
                {colors.map((color, index) => {
                  const value = codeFormat === "hex" ? color.hex : color.rgb;
                  const position = getRingPosition(index, colors.length);
                  const textColor = getTextColor(color);
                  const isCopied = copiedCode === value;

                  return (
                    <li
                      key={`${color.hex}-${index}`}
                      className="palette__ring-item"
                      style={position}
                    >
                      <button
                        type="button"
                        className={`swatch-hex${isCopied ? " is-copied" : ""}`}
                        onClick={() => handleCopy(value)}
                        style={{ backgroundColor: color.hex, color: textColor }}
                        title="Cliquer pour copier"
                      >
                        <span className="swatch-hex__value">{value}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="palette__empty">
                <p>
                  Dépose une image pour révéler automatiquement ses teintes dominantes. Les codes Hex et RGB
                  sont prêts à être copiés.
                </p>
              </div>
            )}
          </div>
        </section>

        <section className="suggestions">
          <div className="suggestions__header">
            <div className="suggestions__intro">
              <h2>Correspondances Dofus</h2>
            </div>
            {barbofusLink ? (
              <a
                className="suggestions__cta"
                href={barbofusLink}
                target="_blank"
                rel="noreferrer"
              >
                Tester sur Barbofus
                <span aria-hidden="true" className="suggestions__cta-icon">
                  ↗
                </span>
              </a>
            ) : null}
          </div>
          {colors.length === 0 ? (
            <div className="suggestions__empty">
              <p>Importe d&apos;abord une image pour générer des propositions personnalisées.</p>
            </div>
          ) : !hasCatalogData && itemsLoading ? (
            <div className="suggestions__status suggestions__status--loading">
              Chargement des objets Dofus…
            </div>
          ) : !hasCatalogData && itemsError ? (
            <div className="suggestions__status suggestions__status--error">{itemsError}</div>
          ) : !hasCatalogData ? (
            <div className="suggestions__status suggestions__status--empty">
              <p>Aucun objet n&apos;a pu être récupéré pour le moment.</p>
            </div>
          ) : (
            <>
              {itemsError ? (
                <p className="suggestions__status suggestions__status--error suggestions__status--inline">
                  {itemsError}
                </p>
              ) : null}
              {itemsLoading ? (
                <p className="suggestions__status suggestions__status--loading suggestions__status--inline">
                  Mise à jour des suggestions…
                </p>
              ) : null}
              <div className="suggestions__grid">
                {ITEM_TYPES.map((type) => {
                  const items = recommendations?.[type] ?? [];
                  return (
                    <section key={type} className="suggestions__group">
                      <header className="suggestions__group-header">
                        <span className="suggestions__group-type">{ITEM_TYPE_LABELS[type] ?? type}</span>
                        {items.length > 0 ? (
                          <span className="suggestions__group-badge">Meilleur match</span>
                        ) : null}
                      </header>
                      {items.length === 0 ? (
                        <p className="suggestions__group-empty">Aucune correspondance probante pour cette teinte.</p>
                      ) : (
                        <ul className="suggestions__deck">
                          {items.map((item) => {
                            const hasPalette = item.palette.length > 0;
                            const paletteFromImage = item.paletteSource === "image" && hasPalette;
                            const notes = [];
                            if (!hasPalette) {
                              notes.push("Palette non détectée sur l'illustration.");
                            } else if (!paletteFromImage) {
                              notes.push("Palette estimée à partir des données DofusDB.");
                            }
                            if (!item.imageUrl) {
                              notes.push("Illustration manquante sur DofusDB.");
                            }

                            return (
                              <li key={item.id} className="suggestions__card">
                                <div className="suggestions__thumb">
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={`Illustration de ${item.name}`}
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="suggestions__thumb-placeholder" aria-hidden="true">
                                      Aperçu indisponible
                                    </div>
                                  )}
                                </div>
                                <div className="suggestions__card-body">
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="suggestions__title"
                                  >
                                    {item.name}
                                  </a>
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
                                      <span className="suggestions__swatch-note">Palette indisponible</span>
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
            </>
          )}
        </section>
      </main>
    </>
  );
}
