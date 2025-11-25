import { DEFAULT_LANGUAGE, normalizeLanguage } from "../i18n";

const DOFUS_API_HOST = "https://api.dofusdb.fr";
const DOFUS_API_BASE_URL = `${DOFUS_API_HOST}/items`;
const BREEDS_ENDPOINT = `${DOFUS_API_HOST}/breeds`;
const DEFAULT_ITEM_LIMIT = 1200;
const CACHE_TTL = 1000 * 60 * 60;

const ITEM_TYPE_CONFIG = Object.freeze({
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
      { typeIds: [18, 249] },
      { typeIds: [121, 250] },
      { typeIds: [97] },
      { typeIds: [196] },
      { typeIds: [207] },
    ],
  },
  epauliere: {
    requests: [{ typeIds: [299], skip: 0, limit: 1200 }],
  },
  costume: {
    requests: [{ typeIds: [199], skip: 0, limit: 1200 }],
  },
  ailes: {
    requests: [{ typeIds: [300], skip: 0, limit: 1200 }],
  },
  bouclier: {
    requests: [
      { typeIds: [82], skip: 0, limit: 1200 },
      { typeIds: [248], skip: 0, limit: 1200 },
    ],
  },
});

const ORDERED_SLOTS = Object.freeze([
  "coiffe",
  "cape",
  "bouclier",
  "costume",
  "epauliere",
  "ailes",
  "familier",
]);

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

const DEFAULT_FACE = BARBOFUS_FACE_ID_BY_CLASS[7] ?? { male: 97, female: 105 };

const HARMONIC_PALETTES = [
  ["#264653", "#2A9D8F", "#E9C46A", "#F4A261", "#E76F51", "#F1FAEE"],
  ["#1B1F3B", "#67568C", "#9E7BB5", "#F7B7A3", "#F7958E", "#F25C54"],
  ["#0B3954", "#087E8B", "#FF5A5F", "#C81D25", "#F3FFE2", "#FFD166"],
  ["#2B2D42", "#8D99AE", "#EDF2F4", "#EF233C", "#D90429", "#F6F7EB"],
  ["#1D3557", "#457B9D", "#A8DADC", "#F1FAEE", "#E5989B", "#FFB4A2"],
  ["#0C0A3E", "#5C5470", "#9F86C0", "#E0B1CB", "#FDEBED", "#FFC857"],
  ["#2E1F27", "#41337A", "#6EA4BF", "#C7EAE4", "#E2E8DD", "#E26D5C"],
  ["#1A1423", "#3D314A", "#684756", "#96705B", "#AB8476", "#D0A98F"],
  ["#0B132B", "#1C2541", "#3A506B", "#5BC0BE", "#6FFFE9", "#F8F9FA"],
  ["#352208", "#674A1A", "#C4972F", "#F6D860", "#F9E4B7", "#E1C699"],
];

const COHESIVE_NEUTRALS = ["#FFFFFF", "#F8F9FA", "#E5E7EB", "#1F2937", "#111827", "#222222", "#000000"];

const breedCache = new Map();
const itemCache = new Map();

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

function getLocalizedText(value, language) {
  if (!value) return null;
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = getLocalizedText(entry, language);
      if (candidate) {
        return candidate;
      }
    }
    return null;
  }
  if (typeof value === "object") {
    if (value[language]) {
      const candidate = getLocalizedText(value[language], language);
      if (candidate) {
        return candidate;
      }
    }
    const first = Object.values(value)[0];
    if (first) {
      return getLocalizedText(first, language);
    }
  }
  return null;
}

function normalizeColorToHex(color) {
  if (color === null || color === undefined) {
    return null;
  }
  if (typeof color === "number" && Number.isFinite(color)) {
    const hex = Math.max(0, Math.floor(color)).toString(16).padStart(6, "0");
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

function hexToRgb(hex) {
  if (!hex) return null;
  const normalized = normalizeColorToHex(hex);
  if (!normalized) return null;
  const stripped = normalized.replace("#", "");
  const bigint = parseInt(stripped, 16);
  if (!Number.isFinite(bigint)) {
    return null;
  }
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function rgbToHsl({ r, g, b }) {
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return null;
  }
  const rn = clamp(r / 255, 0, 1);
  const gn = clamp(g / 255, 0, 1);
  const bn = clamp(b / 255, 0, 1);
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = (gn - bn) / delta + (gn < bn ? 6 : 0);
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
  }
  const l = (max + min) / 2;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
  }
  return {
    h: (h + 360) % 360,
    s: clamp(s * 100, 0, 100),
    l: clamp(l * 100, 0, 100),
  };
}

function hueToRgb(p, q, t) {
  let temp = t;
  if (temp < 0) temp += 1;
  if (temp > 1) temp -= 1;
  if (temp < 1 / 6) return p + (q - p) * 6 * temp;
  if (temp < 1 / 2) return q;
  if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = clamp(s / 100, 0, 1);
  const ln = clamp(l / 100, 0, 1);
  if (sn === 0) {
    const value = Math.round(ln * 255);
    return { r: value, g: value, b: value };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const r = Math.round(hueToRgb(p, q, hn + 1 / 3) * 255);
  const g = Math.round(hueToRgb(p, q, hn) * 255);
  const b = Math.round(hueToRgb(p, q, hn - 1 / 3) * 255);
  return { r, g, b };
}

function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  const toHex = (value) => value.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function adjustHexColor(hex, adjustments = {}) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return normalizeColorToHex(hex);
  }
  const hsl = rgbToHsl(rgb);
  if (!hsl) {
    return normalizeColorToHex(hex);
  }
  const next = {
    h: (hsl.h + (adjustments.h ?? 0) + 360) % 360,
    s: clamp(hsl.s + (adjustments.s ?? 0), 4, 96),
    l: clamp(hsl.l + (adjustments.l ?? 0), 6, 94),
  };
  return normalizeColorToHex(hslToHex(next.h, next.s, next.l));
}

function deriveAnalogousPalette(seedHex) {
  const seed = normalizeColorToHex(seedHex) ?? "#2A9D8F";
  const base = hexToRgb(seed);
  if (!base) {
    return pickPalette();
  }
  const offsets = [0, 10, -10, 18, -18, 6];
  return offsets.map((shift, index) => {
    const lightAdjust = index === 0 ? 0 : index % 2 === 0 ? -8 : 8;
    const satAdjust = index === offsets.length - 1 ? -10 : -4;
    return adjustHexColor(seed, {
      h: shift,
      s: satAdjust,
      l: lightAdjust,
    });
  });
}

function colorDistance(a, b) {
  if (!a || !b) {
    return Number.POSITIVE_INFINITY;
  }
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
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
  return palette.slice(0, 6);
}

function buildEncyclopediaUrl(item, fallbackId, language = DEFAULT_LANGUAGE) {
  const ankamaId = item?.ankamaId ?? item?.id ?? fallbackId;
  if (!ankamaId) {
    return null;
  }
  const normalized = typeof language === "string" && language.trim().length ? language.trim() : DEFAULT_LANGUAGE;
  return `https://dofusdb.fr/${normalized}/database/object/${ankamaId}`;
}

function buildDefaultQuery(language = DEFAULT_LANGUAGE) {
  const normalized = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
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
    Object.entries(buildDefaultQuery(language)).forEach(([key, value]) => {
      params.set(key, value);
    });
    const limit = source.limit ?? config.limit ?? DEFAULT_ITEM_LIMIT;
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

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} pour ${url}`);
  }
  return response.json();
}

async function loadBreeds(language = DEFAULT_LANGUAGE) {
  const normalized = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const cacheKey = normalized;
  const cached = breedCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  const params = new URLSearchParams();
  params.set("$skip", "0");
  params.set("$limit", "50");
  params.set("lang", normalized);
  const payload = await fetchJson(`${BREEDS_ENDPOINT}?${params.toString()}`);
  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.breeds)
    ? payload.breeds
    : [];
  const dataset = entries
    .map((entry) => {
      const id = Number(entry?.id);
      if (!Number.isFinite(id)) {
        return null;
      }
      const name =
        getLocalizedText(entry?.shortName, normalized) ||
        getLocalizedText(entry?.name, normalized) ||
        `Classe ${id}`;
      const icon =
        ensureAbsoluteUrl(entry?.img) ||
        ensureAbsoluteUrl(entry?.image) ||
        ensureAbsoluteUrl(entry?.heads?.male) ||
        ensureAbsoluteUrl(entry?.heads?.female);
      return { id, name, icon };
    })
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
  breedCache.set(cacheKey, { timestamp: Date.now(), data: dataset });
  return dataset;
}

async function loadItems(language = DEFAULT_LANGUAGE) {
  const normalized = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const cacheKey = normalized;
  const cached = itemCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  const result = {};
  await Promise.all(
    Object.keys(ITEM_TYPE_CONFIG).map(async (slot) => {
      const requests = buildDofusApiRequests(slot, normalized);
      const collected = [];
      for (const request of requests) {
        try {
          const payload = await fetchJson(request.url);
          const entries = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.items)
            ? payload.items
            : [];
          entries.forEach((item) => {
            const ankamaId = Number(item?.ankamaId ?? item?.id ?? item?._id);
            if (!Number.isFinite(ankamaId)) {
              return;
            }
            const name =
              getLocalizedText(item?.name, normalized) ||
              getLocalizedText(item?.title, normalized) ||
              `Objet ${ankamaId}`;
            const icon = ensureAbsoluteUrl(item?.img ?? item?.image ?? item?.icon);
            const palette = extractPaletteFromItemData(item);
            collected.push({
              slot,
              ankamaId,
              name,
              icon,
              palette,
              href: buildEncyclopediaUrl(item, ankamaId, normalized),
            });
          });
        } catch (error) {
          console.error("Impossible de charger les objets", slot, error);
        }
      }
      result[slot] = collected;
    }),
  );
  itemCache.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

function scoreItemPalette(itemPalette, targetPalette, targetSignature) {
  if (!Array.isArray(itemPalette) || !itemPalette.length) {
    return Number.POSITIVE_INFINITY;
  }
  const targetRgb = targetPalette.map((hex) => hexToRgb(hex)).filter(Boolean);
  const itemRgb = itemPalette.map((hex) => hexToRgb(hex)).filter(Boolean);
  if (!targetRgb.length || !itemRgb.length) {
    return Number.POSITIVE_INFINITY;
  }
  const total = targetRgb.reduce((acc, target) => {
    let best = Number.POSITIVE_INFINITY;
    itemRgb.forEach((candidate) => {
      const distance = colorDistance(target, candidate);
      if (distance < best) {
        best = distance;
      }
    });
    return acc + best;
  }, 0);
  const baseScore = total / targetRgb.length;
  const paletteSignature = buildPaletteSignature(itemPalette);
  const tonePenalty = toneDistance(paletteSignature, targetSignature);
  if (Number.isFinite(tonePenalty)) {
    if (tonePenalty > 140) {
      return Number.POSITIVE_INFINITY;
    }
    return baseScore + tonePenalty * 2.8;
  }
  return baseScore;
}

function selectToneSeedColor(palette, fallbackPalette) {
  const normalized = Array.isArray(palette)
    ? palette.map((value) => normalizeColorToHex(value)).filter(Boolean)
    : [];
  const fallback = Array.isArray(fallbackPalette)
    ? fallbackPalette.map((value) => normalizeColorToHex(value)).filter(Boolean)
    : [];
  if (normalized.length) {
    const weighted = normalized
      .map((hex) => ({
        hex,
        hsl: rgbToHsl(hexToRgb(hex)),
      }))
      .filter((entry) => entry.hsl)
      .sort((a, b) => b.hsl.s - a.hsl.s || a.hsl.l - b.hsl.l);
    if (weighted.length) {
      return weighted[0].hex;
    }
  }
  return fallback[0] ?? "#2A9D8F";
}

function buildToneLockedPalette(seedPalette, fallbackPalette) {
  const toneSeed = selectToneSeedColor(seedPalette, fallbackPalette);
  const analogous = deriveAnalogousPalette(toneSeed);
  const additional = [
    adjustHexColor(toneSeed, { l: 10, s: -6 }),
    adjustHexColor(toneSeed, { h: 6, l: -8 }),
    adjustHexColor(toneSeed, { h: -6, l: 6 }),
  ].filter(Boolean);

  const pool = [toneSeed, ...analogous, ...additional, ...(seedPalette ?? []), ...(fallbackPalette ?? [])]
    .map((value) => normalizeColorToHex(value))
    .filter(Boolean);

  const unique = [];
  pool.forEach((hex) => {
    if (!unique.includes(hex)) {
      unique.push(hex);
    }
  });

  if (!unique.length) {
    unique.push(...pickPalette());
  }

  while (unique.length < 6) {
    const variant = adjustHexColor(toneSeed, { h: unique.length * 8, l: unique.length % 2 === 0 ? -6 : 6 });
    if (!variant || unique.includes(variant)) {
      break;
    }
    unique.push(variant);
  }

  return normalizePaletteNumeric(unique.slice(0, 6));
}

function craftHarmonizedPalette(seedPalette, fallbackPalette) {
  const palette = buildToneLockedPalette(seedPalette, fallbackPalette);
  return palette.hex;
}

function chooseItemsForPalette(paletteHex, itemsByType, options = {}) {
  const { anchor, preferred } = options;
  const result = [];
  const usedIds = new Set();
  if (anchor?.ankamaId) {
    usedIds.add(anchor.ankamaId);
  }
  const targetSignature = buildPaletteSignature(paletteHex);

  const orderedSlots = [
    ...ORDERED_SLOTS,
    ...Object.keys(itemsByType).filter((slot) => !ORDERED_SLOTS.includes(slot)),
  ];

  orderedSlots.forEach((slot) => {
    const entries = itemsByType[slot];
    if (!Array.isArray(entries) || !entries.length) {
      return;
    }

    if (anchor && anchor.slot === slot) {
      result.push(anchor);
      return;
    }

    const scored = entries
      .map((item) => ({
        ...item,
        slot,
        score: scoreItemPalette(item.palette ?? [], paletteHex, targetSignature),
      }))
      .filter((entry) => !usedIds.has(entry.ankamaId))
      .sort((a, b) => a.score - b.score);

    const viable = scored.filter((entry) => Number.isFinite(entry.score));
    const closeMatches = viable.filter((entry) => entry.score <= 88);
    const source = closeMatches.length ? closeMatches : viable.length ? viable : scored;
    if (!source.length) {
      return;
    }

    const preferredEntry = preferred instanceof Map ? preferred.get(slot) : null;
    if (preferredEntry && !usedIds.has(preferredEntry.ankamaId)) {
      result.push(preferredEntry);
      usedIds.add(preferredEntry.ankamaId);
      return;
    }

    const windowSize = Math.min(source.length, 140);
    const pool = source.slice(0, windowSize);
    if (!pool.length) {
      return;
    }
    const bias = 0.55;
    const weightedIndex = Math.floor(Math.pow(Math.random(), bias) * pool.length);
    const choice = pool[weightedIndex] ?? pool[0];
    if (choice) {
      usedIds.add(choice.ankamaId);
      result.push({ slot, ...choice });
    }
  });

  return result;
}

function pickAnchorItem(itemsByType, targetPalette) {
  const targetSignature = buildPaletteSignature(targetPalette);
  const candidates = [];
  Object.entries(itemsByType).forEach(([slot, entries]) => {
    if (!Array.isArray(entries)) {
      return;
    }
    entries.forEach((item) => {
      if (Array.isArray(item?.palette) && item.palette.length) {
        const normalized = item.palette
          .map((value) => normalizeColorToHex(value))
          .filter(Boolean);
        if (normalized.length) {
          candidates.push({ ...item, slot, palette: normalized });
        }
      }
    });
  });
  if (!candidates.length) {
    return null;
  }
  const weighted = candidates.map((entry) => {
    const tone = buildPaletteSignature(entry.palette);
    const distance = toneDistance(tone, targetSignature);
    const closeness = Number.isFinite(distance)
      ? Math.max(0.35, Math.pow(Math.max(0, 180 - distance) / 180, 1.4))
      : 0.55;
    return {
      entry,
      weight: Math.max(1.2, entry.palette.length * 0.9) * (1 + closeness),
    };
  });
  const totalWeight = weighted.reduce((acc, item) => acc + item.weight, 0);
  let pick = Math.random() * totalWeight;
  for (const item of weighted) {
    if (pick < item.weight) {
      return item.entry;
    }
    pick -= item.weight;
  }
  return weighted[weighted.length - 1].entry;
}

function aggregatePaletteFromItems(items, fallbackPalette) {
  const weights = new Map();
  items.forEach((item) => {
    const palette = Array.isArray(item?.palette) ? item.palette : [];
    palette.forEach((hex, index) => {
      const normalized = normalizeColorToHex(hex);
      if (!normalized) {
        return;
      }
      const current = weights.get(normalized) ?? 0;
      const bonus = palette.length - index;
      weights.set(normalized, current + bonus);
    });
  });

  let ordered = Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([hex]) => hex);

  const fallback = Array.isArray(fallbackPalette) ? fallbackPalette : [];
  fallback.forEach((hex) => {
    const normalized = normalizeColorToHex(hex);
    if (normalized && !ordered.includes(normalized)) {
      ordered.push(normalized);
    }
  });

  if (!ordered.length) {
    ordered = fallback.length ? fallback.slice() : pickPalette();
  }

  const harmonized = craftHarmonizedPalette(ordered, fallback);
  return normalizePaletteNumeric(harmonized);
}

function buildPaletteSignature(palette) {
  const normalized = Array.isArray(palette)
    ? palette
        .map((entry) => normalizeColorToHex(entry))
        .map((entry) => hexToRgb(entry))
        .filter(Boolean)
    : [];

  if (!normalized.length) {
    return null;
  }

  let sin = 0;
  let cos = 0;
  let sat = 0;
  let light = 0;
  normalized.forEach((value) => {
    const hsl = rgbToHsl(value);
    if (!hsl) {
      return;
    }
    const rad = (hsl.h * Math.PI) / 180;
    sin += Math.sin(rad);
    cos += Math.cos(rad);
    sat += hsl.s;
    light += hsl.l;
  });

  const count = normalized.length;
  const hue = (Math.atan2(sin / count, cos / count) * 180) / Math.PI;
  return {
    h: (hue + 360) % 360,
    s: sat / count,
    l: light / count,
  };
}

function toneDistance(signatureA, signatureB) {
  if (!signatureA || !signatureB) {
    return null;
  }

  const hueDiff = Math.min(Math.abs(signatureA.h - signatureB.h), 360 - Math.abs(signatureA.h - signatureB.h));
  const satDiff = Math.abs(signatureA.s - signatureB.s);
  const lightDiff = Math.abs(signatureA.l - signatureB.l);
  return hueDiff * 1.6 + satDiff * 0.9 + lightDiff * 0.6;
}

function buildPreferredItemMap(items, paletteHex) {
  const preferred = new Map();
  const paletteSignature = buildPaletteSignature(paletteHex);
  if (!Array.isArray(items)) {
    return preferred;
  }
  items.forEach((item) => {
    const score = scoreItemPalette(item?.palette ?? [], paletteHex, paletteSignature);
    if (Number.isFinite(score) && score <= 120 && item?.slot) {
      preferred.set(item.slot, { ...item, score });
    }
  });
  return preferred;
}

function getFaceIdForClass(classId, gender) {
  const entry = BARBOFUS_FACE_ID_BY_CLASS[classId];
  if (entry) {
    if (gender === "f" && Number.isFinite(entry.female)) {
      return entry.female;
    }
    if (gender === "m" && Number.isFinite(entry.male)) {
      return entry.male;
    }
  }
  if (gender === "f" && Number.isFinite(DEFAULT_FACE.female)) {
    return DEFAULT_FACE.female;
  }
  if (gender === "m" && Number.isFinite(DEFAULT_FACE.male)) {
    return DEFAULT_FACE.male;
  }
  return Number.isFinite(DEFAULT_FACE.female) ? DEFAULT_FACE.female : 105;
}

function pickPalette() {
  const base = HARMONIC_PALETTES[Math.floor(Math.random() * HARMONIC_PALETTES.length)];
  if (!base) {
    return ["#2A9D8F", "#E9C46A", "#F4A261", "#E76F51", "#1D3557", "#F1FAEE"];
  }
  const shifted = base.map((hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      return hex;
    }
    const factor = 1 + (Math.random() * 0.18 - 0.09);
    const r = Math.max(0, Math.min(255, Math.round(rgb.r * factor)));
    const g = Math.max(0, Math.min(255, Math.round(rgb.g * factor)));
    const b = Math.max(0, Math.min(255, Math.round(rgb.b * factor)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0").toUpperCase()}`;
  });
  return shifted;
}

function normalizePaletteNumeric(palette) {
  const hex = palette.slice(0, 6);
  while (hex.length < 6) {
    hex.push(hex[hex.length % palette.length] ?? "#2A9D8F");
  }
  const numeric = hex.map((value) => {
    const normalized = normalizeColorToHex(value);
    if (!normalized) {
      return null;
    }
    return parseInt(normalized.replace("#", ""), 16);
  });
  return { hex, numeric: numeric.filter((value) => Number.isFinite(value)) };
}

function buildCohesivePaletteRoles(paletteHex) {
  const normalized = Array.isArray(paletteHex)
    ? paletteHex.map((value) => normalizeColorToHex(value)).filter(Boolean)
    : [];
  const unique = [];
  normalized.forEach((hex) => {
    if (!unique.includes(hex)) {
      unique.push(hex);
    }
  });
  if (!unique.length) {
    unique.push(...pickPalette());
  }

  const swatches = unique
    .map((hex) => ({ hex, hsl: rgbToHsl(hexToRgb(hex)) }))
    .filter((entry) => entry.hsl);
  const ordered = swatches.sort((a, b) => {
    if (b.hsl.s !== a.hsl.s) return b.hsl.s - a.hsl.s;
    const aBalance = Math.abs(a.hsl.l - 48);
    const bBalance = Math.abs(b.hsl.l - 48);
    return aBalance - bBalance;
  });

  const primary = ordered[0]?.hex ?? unique[0];
  const secondary =
    ordered.find((entry) => entry.hex !== primary && Math.abs(entry.hsl.l - ordered[0].hsl.l) >= 6)?.hex ??
    ordered[1]?.hex ??
    unique[1] ??
    primary;

  const accentCandidate = ordered
    .filter((entry) => entry.hex !== primary && entry.hex !== secondary)
    .sort((a, b) => {
      const aContrast = Math.abs(a.hsl.l - ordered[0].hsl.l) + Math.abs(a.hsl.h - ordered[0].hsl.h) * 0.6;
      const bContrast = Math.abs(b.hsl.l - ordered[0].hsl.l) + Math.abs(b.hsl.h - ordered[0].hsl.h) * 0.6;
      if (bContrast !== aContrast) return bContrast - aContrast;
      return b.hsl.s - a.hsl.s;
    })[0]?.hex;
  const accent = accentCandidate ?? secondary ?? primary;

  const neutrals = COHESIVE_NEUTRALS.slice();
  const primaryLight = ordered[0]?.hsl?.l ?? 50;
  const neutralDark = primaryLight > 60 ? "#111827" : "#E5E7EB";
  const neutralBright = primaryLight > 60 ? "#FFFFFF" : "#1F2937";

  return {
    primary,
    secondary,
    accent,
    neutrals: Array.from(new Set([neutralDark, neutralBright, ...neutrals])),
  };
}

function buildSlotPalette(slot, roles) {
  const { primary, secondary, accent, neutrals } = roles;
  const neutralDark = neutrals.find(
    (hex) => hex === "#111827" || hex === "#1F2937" || hex === "#222222" || hex === "#000000",
  );
  const neutralLight = neutrals.find((hex) => hex === "#FFFFFF" || hex === "#F8F9FA" || hex === "#E5E7EB");
  const baseNeutral = neutralDark ?? neutralLight;
  const metal = neutralLight ?? neutralDark;
  const paletteBySlot = {
    coiffe: [primary, secondary, accent, baseNeutral],
    cape: [primary, secondary, baseNeutral, accent],
    bouclier: [secondary, primary, metal, accent],
    costume: [primary, secondary, accent, baseNeutral],
    epauliere: [secondary, primary, accent, baseNeutral],
    ailes: [primary, accent, secondary, baseNeutral],
    familier: [primary, accent, secondary, baseNeutral],
  };
  const palette = paletteBySlot[slot] ?? [primary, secondary, accent, baseNeutral];
  return palette.filter(Boolean).slice(0, 6);
}

function applyPaletteRolesToItems(items, roles) {
  return Array.isArray(items)
    ? items.map((item) => ({
        ...item,
        palette: buildSlotPalette(item.slot, roles),
      }))
    : [];
}

export async function generateGallerySkins({ language = DEFAULT_LANGUAGE, count = 9 } = {}) {
  const normalized = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const [breeds, itemsByType] = await Promise.all([loadBreeds(normalized), loadItems(normalized)]);
  if (!Array.isArray(breeds) || !breeds.length) {
    throw new Error("Aucune classe disponible");
  }
  const skins = [];
  const total = Math.max(1, Math.min(24, Math.trunc(count)));
  for (let index = 0; index < total; index += 1) {
    const breed = breeds[Math.floor(Math.random() * breeds.length)];
    const gender = Math.random() > 0.5 ? "f" : "m";
    const basePaletteSeed = pickPalette();
    const anchor = pickAnchorItem(itemsByType, basePaletteSeed);
    const basePaletteValues = Array.isArray(anchor?.palette) && anchor.palette.length ? anchor.palette : basePaletteSeed;
    const normalizedBase = Array.isArray(basePaletteValues)
      ? basePaletteValues.map((value) => normalizeColorToHex(value)).filter(Boolean)
      : [];
    const harmonizedSeed = buildToneLockedPalette(normalizedBase, pickPalette());
    const initialPalette = harmonizedSeed;
    const initialItems = chooseItemsForPalette(initialPalette.hex, itemsByType, { anchor });
    const aggregatedPalette = aggregatePaletteFromItems(initialItems, initialPalette.hex);
    const preferred = buildPreferredItemMap(initialItems, aggregatedPalette.hex);
    const items = chooseItemsForPalette(aggregatedPalette.hex, itemsByType, { anchor, preferred });
    const finalPalette = aggregatePaletteFromItems(items, aggregatedPalette.hex);
    const paletteRoles = buildCohesivePaletteRoles(finalPalette.hex);
    const recoloredItems = applyPaletteRolesToItems(items, paletteRoles);
    const cohesivePalette = normalizePaletteNumeric([
      paletteRoles.primary,
      paletteRoles.secondary,
      paletteRoles.accent,
      ...(paletteRoles.neutrals ?? []),
    ]);
    const faceId = getFaceIdForClass(breed.id, gender);
    skins.push({
      id: `${breed.id}-${index}-${Date.now()}`,
      number: index + 1,
      classId: breed.id,
      className: breed.name,
      classIcon: breed.icon,
      gender,
      faceId,
      palette: cohesivePalette,
      items: recoloredItems,
    });
  }
  return skins;
}

export async function getGalleryData(options = {}) {
  return generateGallerySkins(options);
}

