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
const MAX_RECOMMENDATIONS = 1;
const HASH_CONFIDENCE_DISTANCE = 0.32;
const HASH_CONFIDENCE_WEIGHT = 0.18;
const HASH_STRONG_THRESHOLD = 0.12;
const EDGE_CONFIDENCE_DISTANCE = 0.26;
const EDGE_CONFIDENCE_WEIGHT = 0.12;
const EDGE_STRONG_THRESHOLD = 0.1;

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

export default function Home() {
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
  }, [colors, imageSignature, imageShape, imageTones, imageHash, imageEdges, itemsCatalog]);

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
          setError("Aucune couleur dominante détectée.");
        }
      } catch (err) {
        console.error(err);
        setError("Impossible d'extraire les couleurs de cette image.");
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
      setError("L'image semble corrompue ou illisible.");
      setIsProcessing(false);
      setColors([]);
      setImageSignature(null);
      setImageShape(null);
      setImageTones(null);
      setImageHash(null);
      setImageEdges(null);
    };
    image.src = dataUrl;
  }, []);

  const handleFile = useCallback(
    (file) => {
      if (!file || !file.type.startsWith("image/")) {
        setError("Merci de choisir un fichier image.");
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

  const showProgressBar = isProcessing || analysisProgress > 0;
  const clampedProgress = Math.max(0, Math.min(analysisProgress, 100));
  const safeProgress = Number.isFinite(clampedProgress) ? clampedProgress : 0;
  const displayedProgress = isProcessing
    ? Math.max(safeProgress / 100, 0.05)
    : safeProgress / 100;
  const progressLabel = isProcessing
    ? "Analyse de l'image en cours"
    : safeProgress >= 100
    ? "Analyse terminée"
    : "Analyse prête";

  const getRingPosition = useCallback((index, total) => {
    if (total <= 1) {
      return { left: "50%", top: "50%" };
    }

    if (index === 0) {
      return { left: "50%", top: "50%" };
    }

    const orbitCount = total - 1;
    const radius =
      orbitCount <= 2 ? 20 : orbitCount === 3 ? 24 : orbitCount === 4 ? 27 : 30;
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
