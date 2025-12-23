export const SUPPORTED_LANGUAGES = {
  fr: {
    label: "Français",
    locales: ["fr", "fr-FR", "fr-CA"],
  },
  en: {
    label: "English",
    locales: ["en", "en-US", "en-GB", "en-CA", "en-AU"],
  },
  es: {
    label: "Español",
    locales: ["es", "es-ES", "es-MX", "es-AR"],
  },
  pt: {
    label: "Português",
    locales: ["pt", "pt-PT", "pt-BR"],
  },
  de: {
    label: "Deutsch",
    locales: ["de", "de-DE", "de-AT", "de-CH"],
  },
};

export const DEFAULT_LANGUAGE = "fr";

const LANGUAGE_VARIANT_KEYS = {
  fr: ["fr", "fr_fr", "fr-fr", "frFR", "frca", "fr-ca", "fr_fr"],
  en: ["en", "en_us", "en-gb", "en-uk", "en-ca", "en-au", "en_nz"],
  es: ["es", "es_es", "es-mx", "es_ar", "es-latam"],
  de: ["de", "de_de", "de-at", "de-ch"],
  pt: ["pt", "pt_pt", "pt-br"],
};

function normalizeVariantKey(value) {
  if (!value || typeof value !== "string") return null;
  return value.trim().toLowerCase().replace(/\s+/g, "").replace(/-/g, "_");
}

export function normalizeLanguage(input) {
  const normalized = normalizeVariantKey(input);
  if (!normalized) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(SUPPORTED_LANGUAGES, normalized)) {
    return normalized;
  }

  for (const [code, variants] of Object.entries(LANGUAGE_VARIANT_KEYS)) {
    if (variants.includes(normalized)) {
      return code;
    }
  }

  for (const [code, info] of Object.entries(SUPPORTED_LANGUAGES)) {
    if (info.locales?.some((locale) => normalizeVariantKey(locale) === normalized)) {
      return code;
    }
  }

  return null;
}

export function getLanguagePriority(language = DEFAULT_LANGUAGE) {
  const normalized = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const defaults = LANGUAGE_VARIANT_KEYS[DEFAULT_LANGUAGE] ?? [];
  const base = LANGUAGE_VARIANT_KEYS[normalized] ?? [];
  const english = LANGUAGE_VARIANT_KEYS.en ?? [];
  return Array.from(new Set([...base, normalized, ...defaults, DEFAULT_LANGUAGE, ...english, "en"]));
}

export function translate(language, key, _params, fallback) {
  const normalized = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const translations = TRANSLATIONS[normalized];
  if (translations && Object.prototype.hasOwnProperty.call(translations, key)) {
    return translations[key];
  }
  return fallback ?? key;
}

const TRANSLATIONS = {
  fr: {
    "identity.class.fallback": "Classe {id}",
  },
  en: {
    "identity.class.fallback": "Class {id}",
  },
};
