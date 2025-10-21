import { DEFAULT_LANGUAGE, getLanguagePriority } from "../i18n";
import { normalizeWhitespace, stripHtml } from "../utils/text";

let activeLocalizationPriority = getLanguagePriority();

export function setActiveLocalizationPriority(language) {
  activeLocalizationPriority = getLanguagePriority(language);
}

export function getActiveLocalizationPriority() {
  if (!Array.isArray(activeLocalizationPriority) || activeLocalizationPriority.length === 0) {
    activeLocalizationPriority = getLanguagePriority();
  }
  return activeLocalizationPriority;
}

export function getDefaultDofusQueryParams(language = DEFAULT_LANGUAGE) {
  const normalized = language ?? DEFAULT_LANGUAGE;
  return {
    "typeId[$ne]": "203",
    "$sort": "-id",
    "level[$gte]": "0",
    "level[$lte]": "200",
    lang: normalized,
  };
}

export function pickLocalizedValue(value, languagePriority = getActiveLocalizationPriority()) {
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

export function normalizeTextContent(value, languagePriority = getActiveLocalizationPriority()) {
  const extracted = pickLocalizedValue(value, languagePriority);
  if (!extracted) {
    return "";
  }
  return normalizeWhitespace(stripHtml(extracted));
}
