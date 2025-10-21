import { DEFAULT_LANGUAGE, translate } from "../i18n";
import { slugify } from "../utils/text";
import { normalizeColorToHex } from "../utils/color";
import { DOFUS_API_HOST } from "./constants";
import { getActiveLocalizationPriority, normalizeTextContent } from "./localization";
import { ensureAbsoluteUrl } from "./items";
import { getBarbofusFaceId } from "../barbofus";

export function buildBreedsUrl(language = DEFAULT_LANGUAGE) {
  const normalized = language ?? DEFAULT_LANGUAGE;
  const params = new URLSearchParams();
  params.set("$skip", "0");
  params.set("$limit", "20");
  params.set("lang", normalized);
  return `${DOFUS_API_HOST}/breeds?${params.toString()}`;
}

export function normalizeBreedColors(input) {
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

export function extractLookIdFromLookString(value) {
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

export function extractLookIdFromUrl(url) {
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

export function normalizeBreedEntry(entry, options = {}) {
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
  const maleLookId =
    extractLookIdFromLookString(entry.maleLook) ?? extractLookIdFromUrl(entry?.heads?.male);
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

export function extractBreedEntries(entries) {
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

export function normalizeBreedsDataset(entries, options = {}) {
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
