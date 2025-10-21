import { DEFAULT_LANGUAGE, translate } from "../i18n";
import { slugify, normalizeSearchText } from "../utils/text";
import { MAX_ITEM_PALETTE_COLORS, normalizeColorToHex } from "../utils/color";
import {
  DOFUS_API_BASE_URL,
  DOFUS_API_HOST,
  DEFAULT_LIMIT,
  ITEM_TYPE_CONFIG,
  FAMILIER_TYPE_ID_TO_FILTER_KEY,
  ITEM_FLAG_FILTERS,
} from "./constants";
import { getDefaultDofusQueryParams, getActiveLocalizationPriority, normalizeTextContent } from "./localization";

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

export function ensureAbsoluteUrl(path) {
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

export function flattenImageReference(reference) {
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

export function resolveItemImageUrl(item) {
  const candidates = [item?.img, item?.image, item?.icon, item?.images, item?.look?.img];

  for (const candidate of candidates) {
    const flattened = flattenImageReference(candidate);
    const absolute = ensureAbsoluteUrl(flattened);
    if (absolute) {
      return absolute;
    }
  }

  return null;
}

export function extractPaletteFromItemData(item) {
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

export function buildDofusApiRequests(type, language = DEFAULT_LANGUAGE) {
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
    const initialSkip =
      typeof source.skip === "number" ? source.skip : typeof config.skip === "number" ? config.skip : 0;
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
      limit,
      initialSkip,
    };
  });
}

export function buildEncyclopediaUrl(item, fallbackId, language = DEFAULT_LANGUAGE) {
  const ankamaId = item?.ankamaId ?? item?.id ?? item?._id ?? fallbackId;
  if (!ankamaId) {
    return null;
  }
  const normalized = typeof language === "string" && language.trim().length ? language.trim() : DEFAULT_LANGUAGE;
  return `https://dofusdb.fr/${normalized}/database/object/${ankamaId}`;
}

export function normalizeBooleanFlag(...values) {
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

export const ITEM_FLAG_CONFIG = {
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

export function buildItemFlags(item, translator) {
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

export function normalizeDofusItem(rawItem, type, options = {}) {
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
    searchIndex: normalizeSearchText(name),
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

export { ITEM_FLAG_FILTERS };
