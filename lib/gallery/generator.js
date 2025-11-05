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

function scoreItemPalette(itemPalette, targetPalette) {
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
  return total / targetRgb.length;
}

function chooseItemsForPalette(paletteHex, itemsByType) {
  const result = [];
  Object.entries(itemsByType).forEach(([slot, entries]) => {
    if (!Array.isArray(entries) || !entries.length) {
      return;
    }
    const scored = entries
      .map((item) => ({
        ...item,
        score: scoreItemPalette(item.palette ?? [], paletteHex),
      }))
      .sort((a, b) => a.score - b.score);
    const viable = scored.filter((entry) => Number.isFinite(entry.score));
    const source = viable.length ? viable : scored;
    const windowSize = Math.min(source.length, 48);
    const pool = source.slice(0, windowSize);
    if (!pool.length) {
      return;
    }
    const bias = 1.3;
    const weightedIndex = Math.floor(Math.pow(Math.random(), bias) * pool.length);
    const choice = pool[weightedIndex] ?? pool[0];
    result.push({ slot, ...choice });
  });
  return result;
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
    const palette = normalizePaletteNumeric(pickPalette());
    const items = chooseItemsForPalette(palette.hex, itemsByType);
    const faceId = getFaceIdForClass(breed.id, gender);
    skins.push({
      id: `${breed.id}-${index}-${Date.now()}`,
      number: index + 1,
      classId: breed.id,
      className: breed.name,
      classIcon: breed.icon,
      gender,
      faceId,
      palette,
      items,
    });
  }
  return skins;
}

export async function getGalleryData(options = {}) {
  return generateGallerySkins(options);
}

