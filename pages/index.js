import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ModelPredictionSection } from "../app/components/ModelPredictionSection";
import { usePredictionLabels } from "../lib/vision/usePredictionLabels";
import {
  DEFAULT_LANGUAGE,
  getLanguagePriority,
  normalizeLanguage,
  translate,
  useLanguage,
} from "../lib/i18n";

const ITEM_TYPES = ["coiffe", "cape", "bouclier", "familier", "epauliere", "costume", "ailes"];
const DOFUS_API_HOST = "https://api.dofusdb.fr";
const DOFUS_API_BASE_URL = `${DOFUS_API_HOST}/items`;
const DEFAULT_LIMIT = 1200;

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
  const normalized = language ?? DEFAULT_LANGUAGE;
  return {
    "typeId[$ne]": "203",
    "$sort": "-id",
    "level[$gte]": "0",
    "level[$lte]": "200",
    lang: normalized,
  };
}

function buildBreedsUrl(language = DEFAULT_LANGUAGE) {
  const normalized = language ?? DEFAULT_LANGUAGE;
  const params = new URLSearchParams();
  params.set("$skip", "0");
  params.set("$limit", "20");
  params.set("lang", normalized);
  return `${DOFUS_API_HOST}/breeds?${params.toString()}`;
}

const FAMILIER_FILTERS = Object.freeze([
  { key: "pet", labelKey: "companions.filters.pet", typeIds: [18, 249] },
  { key: "mount", labelKey: "companions.filters.mount", typeIds: [121, 250] },
  { key: "dragodinde", labelKey: "companions.filters.dragodinde", typeIds: [97] },
  { key: "muldo", labelKey: "companions.filters.muldo", typeIds: [196] },
  { key: "volkorne", labelKey: "companions.filters.volkorne", typeIds: [207] },
]);

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
    requests: FAMILIER_FILTERS.map((filter) => ({
      typeIds: filter.typeIds,
      skip: 0,
      limit: 1200,
    })),
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

const PALETTE_LOADER_COLORS = ["#1bdd8d", "#22d3ee", "#facc15", "#fb923c", "#a855f7"];
const RECAP_BACKGROUND_SRC = "/backgrounds/Destin_du_monde_nuage.png";
const APP_ICON_SRC = "/logo.svg";

const PaletteLoader = ({ label }) => (
  <div className="palette-loader" role="status" aria-live="polite">
    <span className="sr-only">{label}</span>
    <div className="palette-loader__aurora" aria-hidden="true">
      <span className="palette-loader__halo" />
      <div className="palette-loader__spectrum">
        <span className="palette-loader__ring palette-loader__ring--outer" />
        <span className="palette-loader__ring palette-loader__ring--inner" />
        {PALETTE_LOADER_COLORS.map((color, index) => (
          <span
            key={`${color}-${index}`}
            className={`palette-loader__pulse palette-loader__pulse--${index}`}
            style={{
              "--palette-loader-color": color,
              "--palette-loader-index": String(index),
            }}
          />
        ))}
      </div>
      <span className="palette-loader__core" />
    </div>
  </div>
);

const THEME_KEYS = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
  DOFUS: "dofus",
  INTELLIGENT: "intelligent",
});

const THEME_STORAGE_KEY = "krospalette.theme";
const DEFAULT_THEME_KEY = THEME_KEYS.DARK;

const THEME_OPTIONS = [
  { key: THEME_KEYS.DARK, icon: "🌙", labelKey: "theme.option.dark" },
  { key: THEME_KEYS.LIGHT, icon: "☀️", labelKey: "theme.option.light" },
  { key: THEME_KEYS.DOFUS, icon: "🍃", labelKey: "theme.option.dofus" },
  { key: THEME_KEYS.INTELLIGENT, icon: "🧠", labelKey: "theme.option.intelligent" },
];

const SURFACE_VARIABLES = [
  "--surface-1-rgb",
  "--surface-2-rgb",
  "--surface-3-rgb",
  "--surface-4-rgb",
  "--surface-5-rgb",
  "--surface-6-rgb",
  "--surface-7-rgb",
  "--surface-8-rgb",
  "--surface-9-rgb",
  "--surface-10-rgb",
  "--surface-11-rgb",
];

const DARK_SURFACE_VALUES = [
  "5, 8, 22",
  "7, 12, 28",
  "8, 12, 26",
  "8, 12, 28",
  "9, 13, 28",
  "9, 14, 32",
  "10, 17, 32",
  "10, 17, 40",
  "13, 20, 38",
  "15, 23, 42",
  "17, 24, 39",
];

const LIGHT_SURFACE_VALUES = [
  "244, 247, 255",
  "235, 240, 255",
  "228, 235, 250",
  "222, 230, 244",
  "210, 220, 236",
  "196, 206, 224",
  "184, 195, 214",
  "255, 255, 255",
  "228, 236, 246",
  "216, 226, 240",
  "204, 214, 230",
];

const DOFUS_SURFACE_VALUES = [
  "4, 18, 12",
  "6, 24, 16",
  "8, 30, 20",
  "10, 36, 24",
  "12, 42, 28",
  "14, 48, 32",
  "16, 54, 36",
  "18, 60, 40",
  "20, 66, 44",
  "24, 72, 48",
  "28, 78, 52",
];

const DARK_ACCENT_VALUES = {
  "--accent-primary-rgb": "139, 92, 246",
  "--accent-strong-rgb": "168, 85, 247",
  "--accent-soft-rgb": "192, 132, 252",
  "--accent-glow-rgb": "123, 97, 255",
  "--accent-contrast-rgb": "129, 140, 248",
  "--accent-secondary-rgb": "56, 189, 248",
  "--accent-tertiary-rgb": "59, 130, 246",
  "--accent-quaternary-rgb": "96, 165, 250",
  "--accent-indigo-rgb": "99, 102, 241",
  "--accent-sky-rgb": "14, 165, 233",
  "--accent-cool-rgb": "129, 199, 255",
};

const LIGHT_ACCENT_VALUES = {
  "--accent-primary-rgb": "37, 99, 235",
  "--accent-strong-rgb": "29, 78, 216",
  "--accent-soft-rgb": "147, 197, 253",
  "--accent-glow-rgb": "96, 165, 250",
  "--accent-contrast-rgb": "30, 64, 175",
  "--accent-secondary-rgb": "14, 165, 233",
  "--accent-tertiary-rgb": "2, 132, 199",
  "--accent-quaternary-rgb": "56, 189, 248",
  "--accent-indigo-rgb": "79, 70, 229",
  "--accent-sky-rgb": "14, 165, 233",
  "--accent-cool-rgb": "125, 211, 252",
};

const DOFUS_ACCENT_VALUES = {
  "--accent-primary-rgb": "34, 197, 94",
  "--accent-strong-rgb": "250, 204, 21",
  "--accent-soft-rgb": "207, 255, 189",
  "--accent-glow-rgb": "250, 179, 8",
  "--accent-contrast-rgb": "22, 163, 74",
  "--accent-secondary-rgb": "234, 179, 8",
  "--accent-tertiary-rgb": "34, 197, 94",
  "--accent-quaternary-rgb": "13, 148, 136",
  "--accent-indigo-rgb": "180, 83, 9",
  "--accent-sky-rgb": "64, 196, 166",
  "--accent-cool-rgb": "201, 255, 191",
};

function buildSurfaceTokens(values, fallbackValues = DARK_SURFACE_VALUES) {
  const tokens = {};
  SURFACE_VARIABLES.forEach((variable, index) => {
    tokens[variable] = values[index] ?? fallbackValues[index] ?? DARK_SURFACE_VALUES[index];
  });
  return tokens;
}

const STATIC_THEME_TOKENS = {
  [THEME_KEYS.DARK]: {
    ...buildSurfaceTokens(DARK_SURFACE_VALUES),
    "--surface-contrast-rgb": "30, 41, 59",
    "--bg": "#050816",
    "--bg-accent": "radial-gradient(circle at top right, rgba(var(--accent-glow-rgb), 0.18), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-sky-rgb), 0.16), transparent 50%), #050816",
    "--card": "rgba(var(--surface-8-rgb), 0.82)",
    "--card-border": "rgba(var(--text-muted-rgb), 0.18)",
    "--text": "#f8fafc",
    "--text-muted": "#94a3b8",
    "--text-rgb": "248, 250, 252",
    "--text-muted-rgb": "148, 163, 184",
    "--text-soft-rgb": "226, 232, 240",
    "--neutral-strong-rgb": "100, 116, 139",
    "--highlight": "#8b5cf6",
    "--highlight-strong": "#c084fc",
    "--shadow": "0 24px 48px -28px rgba(var(--surface-10-rgb), 0.95)",
    ...DARK_ACCENT_VALUES,
    "--success-rgb": "34, 197, 94",
    "--success-strong-rgb": "16, 185, 129",
    "--success-soft-rgb": "45, 212, 191",
    "--success-pale-rgb": "134, 239, 172",
    "--warning-rgb": "245, 158, 11",
    "--warning-strong-rgb": "250, 204, 21",
    "--warning-soft-rgb": "234, 179, 8",
    "--danger-rgb": "248, 113, 113",
    "--danger-strong-rgb": "239, 68, 68",
    "--danger-dark-rgb": "127, 29, 29",
    "--frost-rgb": "224, 231, 255",
    "--white-rgb": "255, 255, 255",
  },
  [THEME_KEYS.LIGHT]: {
    ...buildSurfaceTokens(LIGHT_SURFACE_VALUES),
    "--surface-contrast-rgb": "30, 41, 59",
    "--bg": "#f4f6fb",
    "--bg-accent": "radial-gradient(circle at top right, rgba(var(--accent-cool-rgb), 0.22), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-secondary-rgb), 0.18), transparent 45%), #f4f6fb",
    "--card": "rgba(var(--surface-8-rgb), 0.92)",
    "--card-border": "rgba(var(--text-muted-rgb), 0.22)",
    "--text": "#0f172a",
    "--text-muted": "#475569",
    "--text-rgb": "15, 23, 42",
    "--text-muted-rgb": "71, 85, 105",
    "--text-soft-rgb": "100, 116, 139",
    "--neutral-strong-rgb": "120, 135, 152",
    "--highlight": "#2563eb",
    "--highlight-strong": "#1d4ed8",
    "--shadow": "0 20px 38px -26px rgba(var(--surface-contrast-rgb), 0.25)",
    ...LIGHT_ACCENT_VALUES,
    "--success-rgb": "34, 197, 94",
    "--success-strong-rgb": "16, 185, 129",
    "--success-soft-rgb": "45, 212, 191",
    "--success-pale-rgb": "134, 239, 172",
    "--warning-rgb": "245, 158, 11",
    "--warning-strong-rgb": "250, 204, 21",
    "--warning-soft-rgb": "234, 179, 8",
    "--danger-rgb": "248, 113, 113",
    "--danger-strong-rgb": "239, 68, 68",
    "--danger-dark-rgb": "127, 29, 29",
    "--frost-rgb": "223, 232, 255",
    "--white-rgb": "255, 255, 255",
  },
  [THEME_KEYS.DOFUS]: {
    ...buildSurfaceTokens(DOFUS_SURFACE_VALUES),
    "--surface-contrast-rgb": "30, 44, 36",
    "--bg": "#04160f",
    "--bg-accent": "radial-gradient(circle at top right, rgba(var(--accent-primary-rgb), 0.2), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-strong-rgb), 0.18), transparent 50%), #04160f",
    "--card": "rgba(var(--surface-8-rgb), 0.84)",
    "--card-border": "rgba(var(--text-muted-rgb), 0.28)",
    "--text": "#f6fff4",
    "--text-muted": "#bdecc5",
    "--text-rgb": "246, 255, 244",
    "--text-muted-rgb": "189, 236, 197",
    "--text-soft-rgb": "214, 242, 220",
    "--neutral-strong-rgb": "112, 154, 126",
    "--highlight": "#22c55e",
    "--highlight-strong": "#f59e0b",
    "--shadow": "0 24px 48px -28px rgba(var(--surface-10-rgb), 0.82)",
    ...DOFUS_ACCENT_VALUES,
    "--success-rgb": "34, 197, 94",
    "--success-strong-rgb": "16, 185, 129",
    "--success-soft-rgb": "45, 212, 191",
    "--success-pale-rgb": "134, 239, 172",
    "--warning-rgb": "245, 158, 11",
    "--warning-strong-rgb": "250, 204, 21",
    "--warning-soft-rgb": "234, 179, 8",
    "--danger-rgb": "248, 113, 113",
    "--danger-strong-rgb": "239, 68, 68",
    "--danger-dark-rgb": "127, 29, 29",
    "--frost-rgb": "210, 255, 220",
    "--white-rgb": "255, 255, 255",
  },
};

const VALID_THEME_KEYS = new Set(Object.values(THEME_KEYS));

function isValidThemeKey(value) {
  return typeof value === "string" && VALID_THEME_KEYS.has(value);
}

const SURFACE_LIGHTNESS_VALUES = [0.04, 0.06, 0.08, 0.1, 0.12, 0.15, 0.18, 0.22, 0.26, 0.3, 0.34];

function toRgbString(rgb) {
  if (!rgb) {
    return null;
  }
  const { r, g, b } = rgb;
  return `${r}, ${g}, ${b}`;
}

function withAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function createSurfacePalette(baseHex) {
  const baseRgb = hexToRgb(baseHex) ?? { r: 56, g: 189, b: 248 };
  const baseHsl = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b);
  return SURFACE_LIGHTNESS_VALUES.map((lightness, index) => {
    const saturation = clamp(baseHsl.s * 0.55 + 0.25 - index * 0.015, 0.25, 0.7);
    const { r, g, b } = hslToRgb(baseHsl.h, saturation, lightness);
    const hex = rgbToHex(r, g, b);
    return { rgb: `${r}, ${g}, ${b}`, hex };
  });
}

function createAccentPalette(primaryHex, secondaryHex, tertiaryHex) {
  const primary = normalizeColorToHex(primaryHex) ?? "#38BDF8";
  const secondary = normalizeColorToHex(secondaryHex) ?? adjustHexLightness(primary, -0.12, 0.12);
  const tertiary = normalizeColorToHex(tertiaryHex) ?? adjustHexLightness(primary, 0.2, -0.16);
  const strong = adjustHexLightness(primary, -0.2, -0.08);
  const soft = adjustHexLightness(primary, 0.26, -0.18);
  const glow = adjustHexLightness(primary, 0.34, -0.24);
  const contrast = adjustHexLightness(primary, -0.28, 0.12);
  const quaternary = adjustHexLightness(secondary, 0.18, -0.1);
  const indigo = adjustHexLightness(primary, -0.12, 0.18);
  const sky = adjustHexLightness(secondary, 0.12, -0.04);
  const cool = adjustHexLightness(tertiary, 0.24, -0.18);

  return {
    primaryHex: primary,
    primaryRgb: toRgbString(hexToRgb(primary)),
    strongHex: strong,
    strongRgb: toRgbString(hexToRgb(strong)),
    softHex: soft,
    softRgb: toRgbString(hexToRgb(soft)),
    glowHex: glow,
    glowRgb: toRgbString(hexToRgb(glow)),
    contrastHex: contrast,
    contrastRgb: toRgbString(hexToRgb(contrast)),
    secondaryHex: secondary,
    secondaryRgb: toRgbString(hexToRgb(secondary)),
    tertiaryHex: tertiary,
    tertiaryRgb: toRgbString(hexToRgb(tertiary)),
    quaternaryHex: quaternary,
    quaternaryRgb: toRgbString(hexToRgb(quaternary)),
    indigoHex: indigo,
    indigoRgb: toRgbString(hexToRgb(indigo)),
    skyHex: sky,
    skyRgb: toRgbString(hexToRgb(sky)),
    coolHex: cool,
    coolRgb: toRgbString(hexToRgb(cool)),
  };
}

function parseRgbString(value) {
  if (!value) {
    return null;
  }
  const parts = String(value)
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
  if (parts.length !== 3) {
    return null;
  }
  return { r: parts[0], g: parts[1], b: parts[2] };
}

function resolveThemeTokens(themeKey, palette) {
  if (themeKey === THEME_KEYS.INTELLIGENT) {
    return buildIntelligentThemeTokens(palette);
  }
  const tokens = STATIC_THEME_TOKENS[themeKey] ?? STATIC_THEME_TOKENS[THEME_KEYS.DARK];
  return { ...tokens };
}

function applyThemeToDocument(themeKey, palette) {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const safeTheme = isValidThemeKey(themeKey) ? themeKey : DEFAULT_THEME_KEY;
  root.setAttribute("data-theme", safeTheme);
  const tokens = resolveThemeTokens(safeTheme, palette);
  Object.entries(tokens).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });
}

function buildIntelligentThemeTokens(palette) {
  const normalizedPalette = Array.isArray(palette)
    ? palette.map((entry) => normalizeColorToHex(entry)).filter(Boolean)
    : [];
  const fallback = STATIC_THEME_TOKENS[THEME_KEYS.DARK];
  const baseHex = normalizedPalette[0] ?? "#38BDF8";
  const secondaryHex = normalizedPalette[1] ?? adjustHexLightness(baseHex, -0.1, 0.1);
  const tertiaryHex = normalizedPalette[2] ?? adjustHexLightness(baseHex, 0.16, -0.12);

  const surfaces = createSurfacePalette(baseHex);
  const accent = createAccentPalette(baseHex, secondaryHex, tertiaryHex);

  const textMutedHex = adjustHexLightness(baseHex, 0.46, -0.4);
  const textSoftHex = adjustHexLightness(baseHex, 0.54, -0.46);
  const neutralStrongHex = adjustHexLightness(baseHex, -0.26, -0.2);

  const textMutedRgb = hexToRgb(textMutedHex) ?? parseRgbString(fallback["--text-muted-rgb"]);
  const textSoftRgb = hexToRgb(textSoftHex) ?? parseRgbString(fallback["--text-soft-rgb"]);
  const neutralStrongRgb = hexToRgb(neutralStrongHex) ?? parseRgbString(fallback["--neutral-strong-rgb"]);

  const surfaceTokens = { ...buildSurfaceTokens(surfaces.map((entry) => entry.rgb)) };
  const baseTokens = { ...fallback, ...surfaceTokens };

  const backgroundHex = surfaces[0]?.hex ?? fallback["--bg"] ?? "#050816";
  const secondaryAccentHex = accent.secondaryHex ?? secondaryHex;
  const glowAccentHex = accent.glowHex ?? accent.primaryHex ?? baseHex;

  const cardSurface = surfaces[7] ?? surfaces[surfaces.length - 4];
  const shadowSurface = surfaces[9] ?? surfaces[surfaces.length - 2];

  if (surfaceTokens["--surface-contrast-rgb"] === undefined) {
    baseTokens["--surface-contrast-rgb"] = accent.contrastRgb ?? fallback["--surface-contrast-rgb"];
  } else {
    baseTokens["--surface-contrast-rgb"] = accent.contrastRgb ?? surfaceTokens["--surface-7-rgb"] ?? fallback["--surface-contrast-rgb"];
  }

  baseTokens["--bg"] = backgroundHex;
  baseTokens["--bg-accent"] = `radial-gradient(circle at top right, ${withAlpha(
    glowAccentHex,
    0.22
  )}, transparent 55%), radial-gradient(circle at bottom left, ${withAlpha(
    secondaryAccentHex ?? backgroundHex,
    0.18
  )}, transparent 50%), ${backgroundHex}`;
  baseTokens["--card"] = cardSurface ? `rgba(${cardSurface.rgb}, 0.85)` : fallback["--card"];
  baseTokens["--card-border"] = textMutedRgb
    ? `rgba(${textMutedRgb.r}, ${textMutedRgb.g}, ${textMutedRgb.b}, 0.26)`
    : fallback["--card-border"];
  baseTokens["--text"] = fallback["--text"];
  baseTokens["--text-muted"] = textMutedRgb
    ? rgbToHex(textMutedRgb.r, textMutedRgb.g, textMutedRgb.b)
    : fallback["--text-muted"];
  baseTokens["--text-rgb"] = fallback["--text-rgb"];
  baseTokens["--text-muted-rgb"] = textMutedRgb
    ? `${textMutedRgb.r}, ${textMutedRgb.g}, ${textMutedRgb.b}`
    : fallback["--text-muted-rgb"];
  baseTokens["--text-soft-rgb"] = textSoftRgb
    ? `${textSoftRgb.r}, ${textSoftRgb.g}, ${textSoftRgb.b}`
    : fallback["--text-soft-rgb"];
  baseTokens["--neutral-strong-rgb"] = neutralStrongRgb
    ? `${neutralStrongRgb.r}, ${neutralStrongRgb.g}, ${neutralStrongRgb.b}`
    : fallback["--neutral-strong-rgb"];
  baseTokens["--highlight"] = accent.primaryHex ?? baseHex;
  baseTokens["--highlight-strong"] = accent.strongHex ?? adjustHexLightness(baseHex, 0.18, -0.08);
  baseTokens["--shadow"] = shadowSurface
    ? `0 24px 48px -28px rgba(${shadowSurface.rgb}, 0.88)`
    : fallback["--shadow"];

  baseTokens["--accent-primary-rgb"] = accent.primaryRgb ?? fallback["--accent-primary-rgb"];
  baseTokens["--accent-strong-rgb"] = accent.strongRgb ?? fallback["--accent-strong-rgb"];
  baseTokens["--accent-soft-rgb"] = accent.softRgb ?? fallback["--accent-soft-rgb"];
  baseTokens["--accent-glow-rgb"] = accent.glowRgb ?? fallback["--accent-glow-rgb"];
  baseTokens["--accent-contrast-rgb"] = accent.contrastRgb ?? fallback["--accent-contrast-rgb"];
  baseTokens["--accent-secondary-rgb"] = accent.secondaryRgb ?? fallback["--accent-secondary-rgb"];
  baseTokens["--accent-tertiary-rgb"] = accent.tertiaryRgb ?? fallback["--accent-tertiary-rgb"];
  baseTokens["--accent-quaternary-rgb"] = accent.quaternaryRgb ?? fallback["--accent-quaternary-rgb"];
  baseTokens["--accent-indigo-rgb"] = accent.indigoRgb ?? fallback["--accent-indigo-rgb"];
  baseTokens["--accent-sky-rgb"] = accent.skyRgb ?? fallback["--accent-sky-rgb"];
  baseTokens["--accent-cool-rgb"] = accent.coolRgb ?? fallback["--accent-cool-rgb"];

  return baseTokens;
}

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

function humanizeBackgroundName(value) {
  if (!value) return "";
  return value
    .toString()
    .replace(/\.png$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value) {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, " ");
}

function normalizeWhitespace(value) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value) {
  if (!value) {
    return "";
  }
  return normalizeWhitespace(String(value))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
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

function hasFilterDifferences(current, defaults) {
  if (!current || !defaults) {
    return false;
  }

  const keys = Object.keys(defaults);
  for (const key of keys) {
    if ((current[key] ?? false) !== defaults[key]) {
      return true;
    }
  }

  return false;
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

function getSouffSexCode(gender) {
  if (typeof gender !== "string") {
    return null;
  }

  const normalized = gender.trim().toLowerCase();
  if (normalized === "f" || normalized === "female") {
    return 1;
  }
  if (normalized === "m" || normalized === "male") {
    return 0;
  }

  return null;
}

function buildSouffLink({
  classId,
  faceId,
  gender,
  itemIds,
  colors,
  animation,
  direction,
} = {}) {
  if (!Number.isFinite(classId) || !Number.isFinite(faceId)) {
    return null;
  }

  const sex = getSouffSexCode(gender);
  if (sex === null) {
    return null;
  }

  const normalizedItems = Array.isArray(itemIds)
    ? itemIds
        .map((value) => (Number.isFinite(value) ? Math.trunc(value) : null))
        .filter((value) => Number.isFinite(value) && value > 0)
    : [];

  if (!normalizedItems.length) {
    return null;
  }

  const normalizedColors = Array.isArray(colors)
    ? colors
        .map((value) => (Number.isFinite(value) ? Math.trunc(value) : null))
        .filter((value) => Number.isFinite(value) && value >= 0)
    : [];

  if (!normalizedColors.length) {
    return null;
  }

  const animationCode = Number.isFinite(animation)
    ? Math.max(0, Math.trunc(animation))
    : 0;
  const directionCode = Number.isFinite(direction)
    ? Math.max(0, Math.min(7, Math.trunc(direction)))
    : 0;

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
    const initialSkip = typeof source.skip === "number" ? source.skip : typeof config.skip === "number" ? config.skip : 0;
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
const DEFAULT_PROPOSAL_COUNT = 5;
const MAX_PROPOSAL_COUNT = 48;
const INPUT_MODE_LABEL_KEYS = {
  image: "workspace.mode.image",
  color: "workspace.mode.color",
  items: "workspace.mode.items",
};
const HASH_CONFIDENCE_DISTANCE = 0.32;
const HASH_CONFIDENCE_WEIGHT = 0.18;
const HASH_STRONG_THRESHOLD = 0.12;
const EDGE_CONFIDENCE_DISTANCE = 0.26;
const EDGE_CONFIDENCE_WEIGHT = 0.12;
const EDGE_STRONG_THRESHOLD = 0.1;
const CURATED_COLOR_SWATCHES = [
  "#8B5CF6",
  "#F97316",
  "#10B981",
  "#38BDF8",
  "#F43F5E",
  "#FACC15",
  "#F368E0",
  "#CC8E35",
];

const ITEM_TYPE_LABEL_KEYS = {
  coiffe: "itemTypes.coiffe",
  cape: "itemTypes.cape",
  familier: "itemTypes.familier",
  bouclier: "itemTypes.bouclier",
  epauliere: "itemTypes.epauliere",
  costume: "itemTypes.costume",
  ailes: "itemTypes.ailes",
};

const OPTIONAL_ITEM_TYPES = Object.freeze(["costume", "ailes"]);
const OPTIONAL_ITEM_FILTERS = OPTIONAL_ITEM_TYPES.map((type) => ({
  key: type,
  labelKey: ITEM_TYPE_LABEL_KEYS[type] ?? type,
}));

const PREVIEW_BACKGROUND_MODES = Object.freeze({
  AUTO: "auto",
  RANDOM: "random",
  MANUAL: "manual",
});

const DEFAULT_FAMILIER_FILTER_STATE = Object.freeze(
  FAMILIER_FILTERS.reduce((accumulator, filter) => {
    const isDefaultEnabled = filter.key === "pet" || filter.key === "mount";
    accumulator[filter.key] = isDefaultEnabled;
    return accumulator;
  }, {})
);

const DEFAULT_ITEM_FLAG_FILTER_STATE = Object.freeze(
  ITEM_FLAG_FILTERS.reduce((accumulator, filter) => {
    accumulator[filter.key] = true;
    return accumulator;
  }, {})
);

const DEFAULT_ITEM_SLOT_FILTER_STATE = Object.freeze(
  OPTIONAL_ITEM_TYPES.reduce((accumulator, type) => {
    accumulator[type] = true;
    return accumulator;
  }, {})
);

const DEFAULT_PREVIEW_BACKGROUND_STATE = Object.freeze({
  enabled: false,
  mode: PREVIEW_BACKGROUND_MODES.AUTO,
  selection: null,
});

const DEFAULT_LOOK_ANIMATION = 0;
const DEFAULT_LOOK_DIRECTION = 1;

const ALL_LOOK_DIRECTIONS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]);
const LOOK_DIRECTION_OPTIONS = Object.freeze([
  { value: 0, labelKey: "identity.preview.direction.right", rotation: 90 },
  { value: 1, labelKey: "identity.preview.direction.bottomRight", rotation: 135 },
  { value: 2, labelKey: "identity.preview.direction.bottom", rotation: 180 },
  { value: 3, labelKey: "identity.preview.direction.bottomLeft", rotation: 225 },
  { value: 4, labelKey: "identity.preview.direction.left", rotation: 270 },
  { value: 5, labelKey: "identity.preview.direction.topLeft", rotation: 315 },
  { value: 6, labelKey: "identity.preview.direction.top", rotation: 0 },
  { value: 7, labelKey: "identity.preview.direction.topRight", rotation: 45 },
]);

const COMBAT_POSE_DISABLED_DIRECTIONS = Object.freeze([0, 2, 4, 6]);

const LOOK_DIRECTION_BY_VALUE = new Map(
  LOOK_DIRECTION_OPTIONS.map((option) => [option.value, option])
);

const DIRECTION_DRAG_THRESHOLD = 28;

function normalizeLookDirection(value, fallback = DEFAULT_LOOK_DIRECTION) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  const numeric = Math.trunc(value);
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 7) {
    return 7;
  }
  return numeric;
}

function areNumericArraysEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

function areLookPreviewDescriptorsEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  return (
    a.baseKey === b.baseKey &&
    a.classId === b.classId &&
    a.lookGender === b.lookGender &&
    a.lookFaceId === b.lookFaceId &&
    a.lookAnimation === b.lookAnimation &&
    areNumericArraysEqual(a.lookItemIds, b.lookItemIds) &&
    areNumericArraysEqual(a.lookColors, b.lookColors)
  );
}

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

const SKIN_SOUFF_BASE_URL = "https://skin.souff.fr/";
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

function SkinCardPreviewComparison({
  withSrc,
  withoutSrc,
  withAlt,
  withoutAlt,
  sliderLabel,
  withLabel,
  withoutLabel,
  onWithError,
  onWithoutError,
}) {
  const [showWithout, setShowWithout] = useState(false);
  const releaseListenersRef = useRef(null);
  const activeInputRef = useRef(null);
  const toggleButtonRef = useRef(null);

  const removeWindowListeners = useCallback(() => {
    if (typeof window === "undefined") {
      releaseListenersRef.current = null;
      return;
    }
    if (Array.isArray(releaseListenersRef.current)) {
      releaseListenersRef.current.forEach(({ target = window, type, listener, options }) => {
        target.removeEventListener(type, listener, options);
      });
    }
    releaseListenersRef.current = null;
  }, []);

  const endHold = useCallback(
    (options) => {
      const inputSource = activeInputRef.current;

      setShowWithout(false);
      activeInputRef.current = null;
      removeWindowListeners();

      if (
        options?.shouldBlur !== false &&
        inputSource &&
        inputSource !== "keyboard" &&
        toggleButtonRef.current &&
        typeof toggleButtonRef.current.blur === "function"
      ) {
        toggleButtonRef.current.blur();
      }
    },
    [removeWindowListeners]
  );

  useEffect(() => endHold({ shouldBlur: false }), [withSrc, withoutSrc, endHold]);

  useEffect(() => () => removeWindowListeners(), [removeWindowListeners]);

  const startHold = useCallback(
    (event, source) => {
      if (activeInputRef.current && activeInputRef.current !== source) {
        return;
      }

      activeInputRef.current = source;

      if (
        source === "pointer" &&
        typeof event?.currentTarget?.setPointerCapture === "function" &&
        typeof event?.pointerId === "number"
      ) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (error) {
          // Some browsers may throw if the pointer is already captured; ignore.
        }
      }

      removeWindowListeners();
      setShowWithout(true);

      if (typeof window === "undefined") {
        return;
      }

      const release = () => {
        endHold();
      };

      const listeners = [];
      const captureOptions = { capture: true };

      if (source === "pointer") {
        listeners.push({ type: "pointerup", listener: release, options: captureOptions });
        listeners.push({ type: "pointercancel", listener: release, options: captureOptions });
      } else if (source === "touch") {
        listeners.push({ type: "touchend", listener: release, options: captureOptions });
        listeners.push({ type: "touchcancel", listener: release, options: captureOptions });
      } else {
        listeners.push({ type: "mouseup", listener: release, options: captureOptions });
        listeners.push({ type: "mouseleave", listener: release, options: captureOptions });
      }

      listeners.push({ type: "blur", listener: release });

      if (typeof document !== "undefined") {
        listeners.push({ target: document, type: "visibilitychange", listener: () => {
          if (document.visibilityState === "hidden") {
            release();
          }
        }});
      }

      listeners.forEach(({ target = window, type, listener, options }) => {
        target.addEventListener(type, listener, options);
      });

      releaseListenersRef.current = listeners;
    },
    [endHold, removeWindowListeners]
  );

  const handlePointerDown = useCallback(
    (event) => {
      if (typeof event?.button === "number" && event.button !== 0) {
        return;
      }
      startHold(event, "pointer");
    },
    [startHold]
  );

  const handleMouseDown = useCallback(
    (event) => {
      if (typeof event?.button === "number" && event.button !== 0) {
        return;
      }
      startHold(event, "mouse");
    },
    [startHold]
  );

  const handleTouchStart = useCallback(
    (event) => {
      startHold(event, "touch");
    },
    [startHold]
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (!event) {
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        activeInputRef.current = "keyboard";
        setShowWithout(true);
      }
    },
    []
  );

  const handleKeyUp = useCallback(
    (event) => {
      if (!event) {
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        endHold({ shouldBlur: false });
      }
    },
    [endHold]
  );

  const buttonLabelText =
    typeof sliderLabel === "string" && sliderLabel.trim().length
      ? sliderLabel.trim()
      : undefined;

  const fallbackLabelParts = [];
  if (typeof withoutLabel === "string" && withoutLabel.trim().length) {
    fallbackLabelParts.push(withoutLabel.trim());
  }
  if (typeof withLabel === "string" && withLabel.trim().length) {
    fallbackLabelParts.push(withLabel.trim());
  }

  const fallbackLabel = fallbackLabelParts.length
    ? fallbackLabelParts.join(" → ")
    : "Afficher sans stuff";

  const accessibleLabel = buttonLabelText ?? fallbackLabel;

  return (
    <div className={`skin-card__comparison${showWithout ? " skin-card__comparison--without" : ""}`}>
      <div className="skin-card__comparison-toggle">
        <button
          ref={toggleButtonRef}
          type="button"
          title={accessibleLabel}
          className={`skin-card__comparison-toggle-button${
            showWithout ? " skin-card__comparison-toggle-button--active" : ""
          }`}
          onPointerDown={handlePointerDown}
          onPointerUp={() => endHold()}
          onPointerCancel={() => endHold()}
          onMouseDown={handleMouseDown}
          onMouseUp={() => endHold()}
          onTouchStart={handleTouchStart}
          onTouchEnd={() => endHold()}
          onTouchCancel={() => endHold()}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBlur={() => endHold({ shouldBlur: false })}
          aria-pressed={showWithout}
        >
          <span className="skin-card__comparison-toggle-icon" aria-hidden="true">
            <svg
              className="skin-card__comparison-toggle-eye"
              viewBox="0 0 24 16"
              xmlns="http://www.w3.org/2000/svg"
              focusable="false"
            >
              <path
                d="M12 1.5c-4.87 0-9.1 3-11.21 7.37a.9.9 0 0 0 0 .76C2.9 13.99 7.13 17 12 17s9.1-3.01 11.21-7.37a.9.9 0 0 0 0-.76C21.1 4.5 16.87 1.5 12 1.5Zm0 13.1c-3.77 0-7.24-2.17-9.13-5.57C4.76 5.63 8.23 3.5 12 3.5s7.24 2.13 9.13 5.53C19.24 12.43 15.77 14.6 12 14.6Zm0-9.1a3.6 3.6 0 1 0 3.6 3.6A3.6 3.6 0 0 0 12 5.5Zm0 5.4a1.8 1.8 0 1 1 1.8-1.8A1.8 1.8 0 0 1 12 10.9Z"
                fill="currentColor"
                fillRule="evenodd"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <span className="sr-only">{accessibleLabel}</span>
        </button>
      </div>
      <div className="skin-card__comparison-stage">
        <img
          src={withSrc}
          alt={withAlt}
          className="skin-card__preview-image skin-card__preview-image--with"
          draggable={false}
          onError={onWithError}
        />
        <img
          src={withoutSrc}
          alt={withoutAlt}
          className="skin-card__preview-image skin-card__preview-image--without"
          draggable={false}
          onError={onWithoutError}
        />
      </div>
    </div>
  );
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

function _decompress(length, resetValue, getNextValue) {
  if (length === 0) {
    return "";
  }

  const dictionary = [];
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let entry = "";
  const result = [];
  let w;
  let bits;
  let resb;
  let maxpower;
  let power;
  let c;
  const data = {
    value: getNextValue(0),
    position: resetValue,
    index: 1,
  };

  const readBits = (bitCount) => {
    let bitsValue = 0;
    let max = 1 << bitCount;
    let bitPower = 1;
    while (bitPower !== max) {
      resb = data.value & data.position;
      data.position >>= 1;
      if (data.position === 0) {
        data.position = resetValue;
        data.value = getNextValue(data.index);
        data.index += 1;
      }
      bitsValue |= (resb > 0 ? 1 : 0) * bitPower;
      bitPower <<= 1;
    }
    return bitsValue;
  };

  for (let i = 0; i < 3; i += 1) {
    dictionary[i] = i;
  }

  bits = readBits(2);
  switch (bits) {
    case 0:
      c = String.fromCharCode(readBits(8));
      break;
    case 1:
      c = String.fromCharCode(readBits(16));
      break;
    case 2:
    default:
      return "";
  }

  dictionary[3] = c;
  w = c;
  result.push(c);

  while (true) {
    if (data.index > length) {
      return result.join("");
    }

    bits = readBits(numBits);

    switch (bits) {
      case 0:
        dictionary[dictSize] = String.fromCharCode(readBits(8));
        dictSize += 1;
        c = dictSize - 1;
        enlargeIn -= 1;
        break;
      case 1:
        dictionary[dictSize] = String.fromCharCode(readBits(16));
        dictSize += 1;
        c = dictSize - 1;
        enlargeIn -= 1;
        break;
      case 2:
        return result.join("");
      default:
        c = bits;
        break;
    }

    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits += 1;
    }

    if (dictionary[c]) {
      entry = dictionary[c];
    } else if (c === dictSize) {
      entry = w + w.charAt(0);
    } else {
      return result.join("");
    }

    result.push(entry);
    dictionary[dictSize] = w + entry.charAt(0);
    dictSize += 1;
    enlargeIn -= 1;
    w = entry;

    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits += 1;
    }
  }
}

function compressToEncodedURIComponent(input) {
  if (input == null) {
    return "";
  }
  return _compress(input, 6, getUriSafeCharFromInt);
}

function decompressFromEncodedURIComponent(input) {
  if (input == null) {
    return "";
  }
  const normalized = String(input).replace(/ /g, "+");
  return _decompress(normalized.length, 32, (index) =>
    getUriSafeValueFromChar(normalized.charAt(index))
  );
}

const SKIN_SHARE_VERSION = 1;

function buildSkinShareDescriptor(proposal, options = {}) {
  if (!proposal || !Number.isFinite(proposal.classId)) {
    return null;
  }

  const { useCustomSkinTone = false, referenceColors = [] } = options;

  const gender = proposal.lookGender === "f" ? "f" : "m";
  const lookColors = Array.isArray(proposal.lookColors)
    ? proposal.lookColors
        .map((value) => {
          const numeric = Number(value);
          return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
        })
        .filter((value) => value !== null)
    : [];

  if (!lookColors.length) {
    return null;
  }

  const itemDescriptors = {};
  let hasItems = false;

  if (Array.isArray(proposal.items)) {
    proposal.items.forEach((item) => {
      if (!item || !item.slotType) {
        return;
      }
      const entry = {};
      if (Number.isFinite(item.ankamaId)) {
        entry.a = Math.trunc(item.ankamaId);
      }
      if (item.id) {
        entry.i = item.id;
      }
      if (!Object.keys(entry).length) {
        return;
      }
      itemDescriptors[item.slotType] = entry;
      hasItems = true;
    });
  }

  if (!hasItems) {
    return null;
  }

  const descriptor = {
    v: SKIN_SHARE_VERSION,
    c: Math.trunc(proposal.classId),
    g: gender,
    o: lookColors,
    i: itemDescriptors,
    u: useCustomSkinTone ? 1 : 0,
  };

  if (Number.isFinite(proposal.lookFaceId)) {
    descriptor.f = Math.trunc(proposal.lookFaceId);
  }
  if (Number.isFinite(proposal.lookAnimation)) {
    descriptor.a = Math.trunc(proposal.lookAnimation);
  }
  if (Number.isFinite(proposal.lookDirection)) {
    descriptor.d = normalizeLookDirection(proposal.lookDirection);
  }

  const palette = Array.isArray(proposal.palette)
    ? proposal.palette.map((hex) => normalizeColorToHex(hex)).filter(Boolean)
    : [];
  if (palette.length) {
    descriptor.p = palette;
  }

  const referencePalette = Array.isArray(referenceColors)
    ? referenceColors.map((hex) => normalizeColorToHex(hex)).filter(Boolean)
    : [];
  if (referencePalette.length) {
    descriptor.r = referencePalette;
  }

  return descriptor;
}

function encodeSkinShareDescriptor(descriptor) {
  if (!descriptor) {
    return null;
  }
  try {
    const payload = JSON.stringify(descriptor);
    const encoded = compressToEncodedURIComponent(payload);
    return encoded || null;
  } catch (err) {
    console.error(err);
    return null;
  }
}

function decodeSkinShareDescriptor(encoded) {
  if (typeof encoded !== "string" || !encoded.trim()) {
    return null;
  }

  try {
    const decompressed = decompressFromEncodedURIComponent(encoded.trim());
    if (!decompressed) {
      return null;
    }

    const raw = JSON.parse(decompressed);
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const version = Number(raw.v ?? SKIN_SHARE_VERSION);
    if (!Number.isFinite(version) || version < 1 || version > SKIN_SHARE_VERSION) {
      return null;
    }

    const classId = Number(raw.c);
    if (!Number.isFinite(classId)) {
      return null;
    }

    const rawColors = Array.isArray(raw.o) ? raw.o : [];
    const lookColors = rawColors
      .map((value) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? Math.trunc(numeric) : null;
      })
      .filter((value) => value !== null);

    if (!lookColors.length) {
      return null;
    }

    const rawItems = raw.i && typeof raw.i === "object" ? raw.i : {};
    const items = {};
    Object.entries(rawItems).forEach(([slot, descriptor]) => {
      if (!ITEM_TYPES.includes(slot)) {
        return;
      }
      if (!descriptor || typeof descriptor !== "object") {
        return;
      }
      const entry = {};
      const ankamaId = Number(descriptor.a);
      if (Number.isFinite(ankamaId)) {
        entry.a = Math.trunc(ankamaId);
      }
      if (descriptor.i !== undefined && descriptor.i !== null) {
        if (typeof descriptor.i === "string" && descriptor.i.trim()) {
          entry.i = descriptor.i.trim();
        } else {
          const numericId = Number(descriptor.i);
          if (Number.isFinite(numericId)) {
            entry.i = Math.trunc(numericId);
          }
        }
      }
      if (Object.keys(entry).length) {
        items[slot] = entry;
      }
    });

    if (!Object.keys(items).length) {
      return null;
    }

    const descriptor = {
      version: Math.trunc(version),
      classId: Math.trunc(classId),
      gender: raw.g === "f" ? "f" : "m",
      lookColors,
      items,
    };

    if (Number.isFinite(raw.f)) {
      descriptor.faceId = Math.trunc(raw.f);
    }
    if (Number.isFinite(raw.a)) {
      descriptor.animation = Math.trunc(raw.a);
    }
    if (Number.isFinite(raw.d)) {
      descriptor.direction = normalizeLookDirection(raw.d);
    }

    const palette = Array.isArray(raw.p)
      ? raw.p.map((hex) => normalizeColorToHex(hex)).filter(Boolean)
      : [];
    if (palette.length) {
      descriptor.palette = palette;
    }

    const referencePalette = Array.isArray(raw.r)
      ? raw.r.map((hex) => normalizeColorToHex(hex)).filter(Boolean)
      : [];
    if (referencePalette.length) {
      descriptor.referenceColors = referencePalette;
    }

    if (raw.u === 1 || raw.u === true || raw.u === "1") {
      descriptor.useCustomSkinTone = true;
    } else if (raw.u === 0 || raw.u === false || raw.u === "0") {
      descriptor.useCustomSkinTone = false;
    }

    return descriptor;
  } catch (err) {
    console.error(err);
    return null;
  }
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

function loadImageElement(src) {
  if (!src || typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.reject(new Error("Image element unavailable"));
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image"));
    image.src = src;
  });
}

function buildQrCodeUrl(data, options = {}) {
  if (!data) {
    return null;
  }

  const size = Math.max(120, Math.min(600, Math.trunc(options.size ?? 240)));
  const margin = Math.max(0, Math.min(8, Math.trunc(options.margin ?? 1)));
  const dark = typeof options.dark === "string" ? options.dark : "#0b1224";
  const light = typeof options.light === "string" ? options.light : "#f8fafc";

  const params = new URLSearchParams();
  params.set("text", data);
  params.set("size", String(size));
  params.set("margin", String(margin));
  params.set("format", "png");
  params.set("dark", dark);
  params.set("light", light);

  return `https://quickchart.io/qr?${params.toString()}`;
}

async function loadQrCodeImage(data, options = {}) {
  try {
    const url = buildQrCodeUrl(data, options);
    if (!url) {
      return null;
    }
    const image = await loadImageElement(url);
    return image;
  } catch (error) {
    console.error(error);
    return null;
  }
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

function shiftHexTone(hex, delta) {
  const normalized = normalizeColorToHex(hex);
  if (!normalized) {
    return null;
  }
  const rgb = hexToRgb(normalized);
  if (!rgb) {
    return normalized;
  }
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const adjustedLightness = clamp(l + delta, 0, 1);
  const saturationDelta = delta > 0 ? delta * 0.35 : delta * 0.25;
  const adjustedSaturation = clamp(s + saturationDelta, 0, 1);
  const { r, g, b } = hslToRgb(h, adjustedSaturation, adjustedLightness);
  return rgbToHex(Math.round(r), Math.round(g), Math.round(b));
}

function buildLookPalette(basePalette, variantIndex = 0) {
  if (!Array.isArray(basePalette) || basePalette.length === 0) {
    return [];
  }

  const normalizedBase = basePalette
    .map((hex) => normalizeColorToHex(hex))
    .filter(Boolean);

  if (!normalizedBase.length) {
    return [];
  }

  const uniqueBase = Array.from(new Set(normalizedBase));

  if (variantIndex <= 0) {
    return uniqueBase.slice(0, MAX_ITEM_PALETTE_COLORS);
  }

  const rotation = variantIndex % uniqueBase.length;
  const rotated = uniqueBase.slice(rotation).concat(uniqueBase.slice(0, rotation));

  const amplitude = Math.min(0.12, 0.05 + variantIndex * 0.02);
  const direction = variantIndex % 2 === 0 ? 1 : -1;

  const adjusted = rotated
    .slice(0, MAX_ITEM_PALETTE_COLORS * 2)
    .map((hex, index) => {
      const weight = 1 - Math.min(index, 4) * 0.12;
      const delta = direction * amplitude * weight;
      const shifted = shiftHexTone(hex, delta);
      return normalizeColorToHex(shifted) ?? normalizeColorToHex(hex);
    })
    .filter(Boolean);

  const seen = new Set();
  const result = [];
  adjusted.forEach((hex) => {
    if (!hex || seen.has(hex)) {
      return;
    }
    seen.add(hex);
    result.push(hex);
  });

  if (result.length < MAX_ITEM_PALETTE_COLORS) {
    uniqueBase.forEach((hex) => {
      if (result.length >= MAX_ITEM_PALETTE_COLORS) {
        return;
      }
      if (!seen.has(hex)) {
        seen.add(hex);
        result.push(hex);
      }
    });
  }

  return result.slice(0, MAX_ITEM_PALETTE_COLORS);
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

function sanitizeInputMode(value, allowedModes = Object.keys(INPUT_MODE_LABEL_KEYS)) {
  const allowed = Array.isArray(allowedModes)
    ? allowedModes.filter((mode) => mode in INPUT_MODE_LABEL_KEYS)
    : Object.keys(INPUT_MODE_LABEL_KEYS);
  if (allowed.length === 0) {
    return "image";
  }
  if (allowed.includes(value)) {
    return value;
  }
  return allowed[0];
}

export default function Home({
  initialBreeds = [],
  previewBackgrounds: initialPreviewBackgrounds = [],
  defaultInputMode = "image",
  allowedInputModes = Object.keys(INPUT_MODE_LABEL_KEYS),
  identitySelectionMode = "manual",
  proposalLayout = "carousel",
  proposalCount: requestedProposalCount = DEFAULT_PROPOSAL_COUNT,
  colorSuggestions = CURATED_COLOR_SWATCHES,
  showModelPrediction = true,
  showIdentityHint = true,
  layoutVariant = "default",
}) {
  const router = useRouter();
  const routerLang = router?.query?.lang;
  const { language, languages: languageOptions, setLanguage, t } = useLanguage();
  const languageRef = useRef(language);
  const languageMenuRef = useRef(null);
  const themeMenuRef = useRef(null);
  const [isLanguageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [isThemeMenuOpen, setThemeMenuOpen] = useState(false);
  const skipRouterLanguageEffectRef = useRef(false);
  const closePreferenceMenus = useCallback(() => {
    setThemeMenuOpen(false);
    setLanguageMenuOpen(false);
  }, []);
  const handleThemeTriggerClick = useCallback(() => {
    setThemeMenuOpen((previous) => {
      const next = !previous;
      if (!previous) {
        setLanguageMenuOpen(false);
      }
      return next;
    });
  }, []);
  const handleLanguageTriggerClick = useCallback(() => {
    setLanguageMenuOpen((previous) => {
      const next = !previous;
      if (!previous) {
        setThemeMenuOpen(false);
      }
      return next;
    });
  }, []);
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

  const [theme, setTheme] = useState(DEFAULT_THEME_KEY);
  const themeHydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme && isValidThemeKey(storedTheme)) {
      setTheme(storedTheme);
    }
    themeHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!themeHydratedRef.current || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== THEME_KEYS.INTELLIGENT) {
      applyThemeToDocument(theme);
    }
  }, [theme]);

  const themeOptions = useMemo(
    () =>
      THEME_OPTIONS.map((option) => {
        const label = t(option.labelKey);
        const normalizedLabel = typeof label === "string" ? label : "";
        return { ...option, label: normalizedLabel, accessibleLabel: normalizedLabel };
      }),
    [t]
  );

  const themeSelectorLabel = t("theme.selectorAria");
  const themeSelectorAria = typeof themeSelectorLabel === "string" ? themeSelectorLabel : "";
  const languageSelectorLabel = t("language.selectorAria");
  const languageSelectorAria = typeof languageSelectorLabel === "string" ? languageSelectorLabel : "";
  const predictionLabels = usePredictionLabels(t);
  const activeThemeOption = useMemo(
    () => themeOptions.find((option) => option.key === theme) ?? null,
    [themeOptions, theme]
  );
  const activeLanguageOption = useMemo(
    () => languageOptions.find((option) => option.code === language) ?? null,
    [languageOptions, language]
  );

  const handleThemeSelect = useCallback(
    (nextTheme) => {
      if (!isValidThemeKey(nextTheme) || nextTheme === theme) {
        closePreferenceMenus();
        return;
      }
      setTheme(nextTheme);
      closePreferenceMenus();
    },
    [closePreferenceMenus, theme]
  );

  const [imageSrc, setImageSrc] = useState(null);
  const [colors, setColors] = useState([]);
  const [imageSignature, setImageSignature] = useState(null);
  const [imageShape, setImageShape] = useState(null);
  const [imageTones, setImageTones] = useState(null);
  const [imageHash, setImageHash] = useState(null);
  const [imageEdges, setImageEdges] = useState(null);
  const [modelResult, setModelResult] = useState(null);
  const [modelError, setModelError] = useState(null);
  const [isPredicting, setIsPredicting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [toast, setToast] = useState(null);
  const [itemsCatalog, setItemsCatalog] = useState({});
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(null);
  const [panelItemIndexes, setPanelItemIndexes] = useState({});
  const [proposalItemIndexes, setProposalItemIndexes] = useState({});
  const [familierFilters, setFamilierFilters] = useState(() => ({
    ...DEFAULT_FAMILIER_FILTER_STATE,
  }));
  const [itemFlagFilters, setItemFlagFilters] = useState(() => ({
    ...DEFAULT_ITEM_FLAG_FILTER_STATE,
  }));
  const [itemSlotFilters, setItemSlotFilters] = useState(() => ({
    ...DEFAULT_ITEM_SLOT_FILTER_STATE,
  }));
  const [selectedItemsBySlot, setSelectedItemsBySlot] = useState(() =>
    ITEM_TYPES.reduce((accumulator, type) => {
      accumulator[type] = null;
      return accumulator;
    }, {})
  );
  const [activeItemSlot, setActiveItemSlot] = useState(null);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const normalizedInputModes = useMemo(() => {
    const options = Array.isArray(allowedInputModes)
      ? allowedInputModes.filter((mode) => mode in INPUT_MODE_LABEL_KEYS)
      : Object.keys(INPUT_MODE_LABEL_KEYS);
    return options.length ? options : Object.keys(INPUT_MODE_LABEL_KEYS);
  }, [allowedInputModes]);

  const normalizedDefaultInputMode = useMemo(
    () => sanitizeInputMode(defaultInputMode, normalizedInputModes),
    [defaultInputMode, normalizedInputModes]
  );

  const [inputMode, setInputMode] = useState(normalizedDefaultInputMode);
  const [selectedColor, setSelectedColor] = useState(null);
  const curatedColorSuggestions = useMemo(() => {
    if (!Array.isArray(colorSuggestions)) {
      return CURATED_COLOR_SWATCHES;
    }
    const cleaned = colorSuggestions
      .map((value) => (typeof value === "string" ? value.trim().toUpperCase() : ""))
      .filter(Boolean);
    if (!cleaned.length) {
      return CURATED_COLOR_SWATCHES;
    }
    const unique = [];
    cleaned.forEach((value) => {
      if (!unique.includes(value)) {
        unique.push(value);
      }
    });
    return unique;
  }, [colorSuggestions]);

  useEffect(() => {
    setInputMode((previous) => sanitizeInputMode(previous, normalizedInputModes));
  }, [normalizedInputModes]);

  useEffect(() => {
    setInputMode(normalizedDefaultInputMode);
  }, [normalizedDefaultInputMode]);
  const [activeProposal, setActiveProposal] = useState(0);
  const [lookPreviews, setLookPreviews] = useState({});
  const lookPreviewsRef = useRef({});
  const lookPreviewRequestsRef = useRef(new Map());
  const appliedShareTokenRef = useRef(null);
  const pendingSharedItemsRef = useRef(null);
  const directionDragStateRef = useRef({
    active: false,
    pointerId: null,
    lastX: 0,
    remainder: 0,
  });
  const isUnmountedRef = useRef(false);
  const modalTransitionTimerRef = useRef(null);
  const [lookAnimation, setLookAnimation] = useState(DEFAULT_LOOK_ANIMATION);
  const [lookDirection, setLookDirection] = useState(DEFAULT_LOOK_DIRECTION);
  const [downloadingPreviewId, setDownloadingPreviewId] = useState(null);
  const [copyingPreviewId, setCopyingPreviewId] = useState(null);
  const [supportsImageClipboard, setSupportsImageClipboard] = useState(false);
  const [exportingRecapId, setExportingRecapId] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const hasSupport =
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.write === "function" &&
      typeof window.ClipboardItem !== "undefined";

    setSupportsImageClipboard(Boolean(hasSupport));
  }, []);

  useEffect(() => {
    if (lookAnimation !== 2) {
      return;
    }

    setLookDirection((previous) => {
      const normalized = normalizeLookDirection(previous);
      if (COMBAT_POSE_DISABLED_DIRECTIONS.includes(normalized)) {
        return DEFAULT_LOOK_DIRECTION;
      }
      return previous;
    });
  }, [lookAnimation]);
  const [useCustomSkinTone, setUseCustomSkinTone] = useState(false);
  const [showDetailedMatches, setShowDetailedMatches] = useState(false);
  const [breeds, setBreeds] = useState(() =>
    Array.isArray(initialBreeds) && initialBreeds.length ? initialBreeds : []
  );
  const [breedsLoading, setBreedsLoading] = useState(false);
  const [breedsError, setBreedsError] = useState(null);
  const [selectedBreedId, setSelectedBreedId] = useState(null);
  const [selectedGender, setSelectedGender] = useState(BARBOFUS_DEFAULT_GENDER_KEY);
  const isIdentityRandom = identitySelectionMode === "random";
  const isGridLayout = proposalLayout === "grid";
  const isInspirationLayout = layoutVariant === "inspiration";
  const [modalProposalId, setModalProposalId] = useState(null);
  const [modalTransitionDirection, setModalTransitionDirection] = useState(null);
  const proposalLimit = Math.max(
    1,
    Math.min(
      MAX_PROPOSAL_COUNT,
      Math.round(requestedProposalCount || DEFAULT_PROPOSAL_COUNT)
    )
  );

  useEffect(() => {
    if (!modelResult || !modelResult.prediction) {
      return;
    }

    const predictedBreed = modelResult.prediction.breed;
    if (Number.isFinite(predictedBreed)) {
      setSelectedBreedId(predictedBreed);
    }

    const predictedGender = modelResult.prediction.sex === 1 ? "female" : "male";
    setSelectedGender(predictedGender);

    if (Array.isArray(modelResult.colors) && modelResult.colors.length) {
      const palette = modelResult.colors
        .map((value) => {
          const hex = normalizeColorToHex(value);
          if (!hex) {
            return null;
          }
          const rgb = hexToRgb(hex) ?? { r: 0, g: 0, b: 0 };
          return {
            hex,
            rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
            r: rgb.r,
            g: rgb.g,
            b: rgb.b,
            weight: 1,
            source: "model",
          };
        })
        .filter(Boolean);
      if (palette.length) {
        setColors(palette);
        setSelectedColor((previous) => palette[0]?.hex ?? previous);
        setUseCustomSkinTone(true);
      }
    }
  }, [modelResult]);

  const progressHandles = useRef({ frame: null, timeout: null, value: 0 });
  const breedsRequestRef = useRef(null);
  const previewBackgroundOptions = useMemo(
    () =>
      Array.isArray(initialPreviewBackgrounds)
        ? initialPreviewBackgrounds
            .filter((entry) => entry && entry.id && entry.src)
            .map((entry) => ({
              id: entry.id,
              label: entry.label ?? humanizeBackgroundName(entry.id),
              src: entry.src,
            }))
        : [],
    [initialPreviewBackgrounds]
  );
  const [isPreviewBackgroundEnabled, setPreviewBackgroundEnabled] = useState(
    DEFAULT_PREVIEW_BACKGROUND_STATE.enabled
  );
  const [previewBackgroundMode, setPreviewBackgroundMode] = useState(
    DEFAULT_PREVIEW_BACKGROUND_STATE.mode
  );
  const [selectedPreviewBackgroundId, setSelectedPreviewBackgroundId] = useState(
    DEFAULT_PREVIEW_BACKGROUND_STATE.selection
  );
  const [randomPreviewBackgroundAssignments, setRandomPreviewBackgroundAssignments] = useState(
    {}
  );
  const [previewBackgroundSwatches, setPreviewBackgroundSwatches] = useState({});
  const previewBackgroundById = useMemo(() => {
    const map = new Map();
    previewBackgroundOptions.forEach((entry) => {
      if (entry && entry.id) {
        map.set(entry.id, entry);
      }
    });
    return map;
  }, [previewBackgroundOptions]);
  const hasPreviewBackgroundOptions = previewBackgroundOptions.length > 0;

  useEffect(() => {
    if (hasPreviewBackgroundOptions) {
      return;
    }
    if (isPreviewBackgroundEnabled) {
      setPreviewBackgroundEnabled(false);
    }
    if (previewBackgroundMode !== DEFAULT_PREVIEW_BACKGROUND_STATE.mode) {
      setPreviewBackgroundMode(DEFAULT_PREVIEW_BACKGROUND_STATE.mode);
    }
    if (selectedPreviewBackgroundId !== DEFAULT_PREVIEW_BACKGROUND_STATE.selection) {
      setSelectedPreviewBackgroundId(DEFAULT_PREVIEW_BACKGROUND_STATE.selection);
    }
    if (Object.keys(randomPreviewBackgroundAssignments).length) {
      setRandomPreviewBackgroundAssignments({});
    }
  }, [
    hasPreviewBackgroundOptions,
    isPreviewBackgroundEnabled,
    previewBackgroundMode,
    randomPreviewBackgroundAssignments,
    selectedPreviewBackgroundId,
  ]);

  useEffect(() => {
    if (!selectedPreviewBackgroundId) {
      return;
    }
    if (!previewBackgroundById.has(selectedPreviewBackgroundId)) {
      setSelectedPreviewBackgroundId(DEFAULT_PREVIEW_BACKGROUND_STATE.selection);
    }
  }, [previewBackgroundById, selectedPreviewBackgroundId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!hasPreviewBackgroundOptions) {
      setPreviewBackgroundSwatches({});
      return;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      setPreviewBackgroundSwatches({});
      return;
    }

    let cancelled = false;

    const loadAverageColor = (background) =>
      new Promise((resolve) => {
        if (!background?.id || !background?.src) {
          resolve({ id: background?.id ?? null, hex: null });
          return;
        }

        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          try {
            const width = Math.max(1, image.naturalWidth || image.width || 1);
            const height = Math.max(1, image.naturalHeight || image.height || 1);
            canvas.width = width;
            canvas.height = height;
            context.clearRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);
            const imageData = context.getImageData(0, 0, width, height);
            const { data } = imageData;
            let totalWeight = 0;
            let r = 0;
            let g = 0;
            let b = 0;
            for (let index = 0; index < data.length; index += 4) {
              const alpha = data[index + 3] / 255;
              if (alpha <= 0) {
                continue;
              }
              const weight = alpha;
              totalWeight += weight;
              r += data[index] * weight;
              g += data[index + 1] * weight;
              b += data[index + 2] * weight;
            }
            if (totalWeight === 0) {
              resolve({ id: background.id, hex: null });
              return;
            }
            const averageR = Math.round(r / totalWeight);
            const averageG = Math.round(g / totalWeight);
            const averageB = Math.round(b / totalWeight);
            const hex = `#${averageR.toString(16).padStart(2, "0")}${averageG
              .toString(16)
              .padStart(2, "0")}${averageB.toString(16).padStart(2, "0")}`.toUpperCase();
            resolve({ id: background.id, hex });
          } catch (error) {
            resolve({ id: background.id, hex: null });
          }
        };
        image.onerror = () => resolve({ id: background.id, hex: null });
        image.src = background.src;
      });

    Promise.all(previewBackgroundOptions.map((background) => loadAverageColor(background))).then(
      (entries) => {
        if (cancelled) {
          return;
        }
        const next = {};
        entries.forEach((entry) => {
          if (entry?.id && entry?.hex) {
            next[entry.id] = entry.hex;
          }
        });
        setPreviewBackgroundSwatches(next);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [hasPreviewBackgroundOptions, previewBackgroundOptions]);

  const handleLanguageSelect = useCallback(
    (nextLanguage) => {
      if (!nextLanguage || nextLanguage === languageRef.current) {
        closePreferenceMenus();
        return;
      }
      skipRouterLanguageEffectRef.current = true;
      setLanguage(nextLanguage);
      closePreferenceMenus();
    },
    [closePreferenceMenus, setLanguage]
  );

  useEffect(() => {
    if (typeof document === "undefined" || (!isThemeMenuOpen && !isLanguageMenuOpen)) {
      return;
    }
    const handlePointerDown = (event) => {
      const target = event?.target;
      if (
        (themeMenuRef.current && themeMenuRef.current.contains(target)) ||
        (languageMenuRef.current && languageMenuRef.current.contains(target))
      ) {
        return;
      }
      closePreferenceMenus();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [closePreferenceMenus, isLanguageMenuOpen, isThemeMenuOpen]);
  useEffect(() => {
    if (typeof document === "undefined" || (!isThemeMenuOpen && !isLanguageMenuOpen)) {
      return;
    }
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closePreferenceMenus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePreferenceMenus, isLanguageMenuOpen, isThemeMenuOpen]);

  const isImageMode = inputMode === "image";
  const isColorMode = inputMode === "color";
  const isItemsMode = inputMode === "items";

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

  const hasCustomFilters = useMemo(
    () =>
      hasFilterDifferences(familierFilters, DEFAULT_FAMILIER_FILTER_STATE) ||
      hasFilterDifferences(itemFlagFilters, DEFAULT_ITEM_FLAG_FILTER_STATE) ||
      hasFilterDifferences(itemSlotFilters, DEFAULT_ITEM_SLOT_FILTER_STATE),
    [familierFilters, itemFlagFilters, itemSlotFilters]
  );

  const hasCustomPreviewSettings = useMemo(
    () =>
      lookAnimation !== DEFAULT_LOOK_ANIMATION ||
      normalizeLookDirection(lookDirection) !== DEFAULT_LOOK_DIRECTION ||
      isPreviewBackgroundEnabled !== DEFAULT_PREVIEW_BACKGROUND_STATE.enabled ||
      previewBackgroundMode !== DEFAULT_PREVIEW_BACKGROUND_STATE.mode ||
      (previewBackgroundMode === PREVIEW_BACKGROUND_MODES.MANUAL &&
        selectedPreviewBackgroundId !== DEFAULT_PREVIEW_BACKGROUND_STATE.selection),
    [
      isPreviewBackgroundEnabled,
      lookAnimation,
      lookDirection,
      previewBackgroundMode,
      selectedPreviewBackgroundId,
    ]
  );

  const filtersPanelClassName = useMemo(() => {
    const classes = ["filters-panel"];
    if (hasCustomFilters || hasCustomPreviewSettings) {
      classes.push("filters-panel--active");
    }
    return classes.join(" ");
  }, [hasCustomFilters, hasCustomPreviewSettings]);

  const referenceClassName = useMemo(() => {
    const classes = ["reference"];
    if (isItemsMode) {
      classes.push("reference--items");
      if (activeItemSlot) {
        classes.push("reference--items-panel-open");
      }
    }
    return classes.join(" ");
  }, [activeItemSlot, isItemsMode]);

  const colorsCount = colors.length;

  const selectedItemHexes = useMemo(() => {
    const seen = new Set();
    const collected = [];
    ITEM_TYPES.forEach((type) => {
      const item = selectedItemsBySlot?.[type];
      if (!item || !Array.isArray(item.palette)) {
        return;
      }
      item.palette.forEach((value) => {
        const normalized = normalizeColorToHex(value);
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        collected.push(normalized);
      });
    });
    return collected.slice(0, MAX_COLORS);
  }, [selectedItemsBySlot]);

  const selectedItemPalette = useMemo(() => {
    const entries = [];
    const seen = new Set();
    selectedItemHexes.forEach((hex) => {
      const normalized = normalizeColorToHex(hex);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      const rgb = hexToRgb(normalized);
      if (!rgb) {
        return;
      }
      seen.add(normalized);
      entries.push({
        hex: normalized,
        rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        weight: 1,
      });
    });
    return entries.slice(0, MAX_COLORS);
  }, [selectedItemHexes]);

  const filteredItemOptions = useMemo(() => {
    if (!activeItemSlot) {
      return [];
    }
    const pool = itemsCatalog?.[activeItemSlot] ?? [];
    const normalizedQuery = normalizeSearchText(itemSearchQuery);
    if (!normalizedQuery) {
      return pool;
    }
    return pool.filter((item) => {
      if (!item) {
        return false;
      }
      if (item.searchIndex) {
        return item.searchIndex.includes(normalizedQuery);
      }
      return normalizeSearchText(item.name).includes(normalizedQuery);
    });
  }, [activeItemSlot, itemSearchQuery, itemsCatalog]);

  const activeSlotTotalCount = activeItemSlot
    ? Array.isArray(itemsCatalog?.[activeItemSlot])
      ? itemsCatalog[activeItemSlot].length
      : 0
    : 0;
  const activeSlotFilteredCount = activeItemSlot ? filteredItemOptions.length : 0;
  const hasActiveSearch = Boolean(
    activeItemSlot && normalizeWhitespace(itemSearchQuery ?? "").length
  );
  const showFilteredCount =
    Boolean(activeItemSlot) &&
    hasActiveSearch &&
    activeSlotFilteredCount !== activeSlotTotalCount;
  const activeSlotCountLabel = activeItemSlot
    ? t(showFilteredCount ? "items.selector.countFiltered" : "items.selector.countTotal", {
        count: activeSlotFilteredCount,
        total: activeSlotTotalCount,
      })
    : "";

  const hasSelectedItems = useMemo(
    () => ITEM_TYPES.some((type) => Boolean(selectedItemsBySlot?.[type])),
    [selectedItemsBySlot]
  );

  const analysisModes = useMemo(
    () =>
      normalizedInputModes.map((mode) => ({
        key: mode,
        labelKey: INPUT_MODE_LABEL_KEYS[mode],
      })),
    [normalizedInputModes]
  );

  const hasMultipleAnalysisModes = analysisModes.length > 1;

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

  const handleItemSlotFilterToggle = useCallback((key) => {
    if (!OPTIONAL_ITEM_TYPES.includes(key)) {
      return;
    }

    setItemSlotFilters((previous = {}) => ({
      ...previous,
      [key]: previous[key] === false ? true : false,
    }));
  }, []);

  const handleOpenItemSlot = useCallback(
    (slot) => {
      if (!ITEM_TYPES.includes(slot)) {
        return;
      }
      if (itemSlotFilters?.[slot] === false) {
        return;
      }
      setInputMode("items");
      setActiveItemSlot(slot);
    },
    [itemSlotFilters, setInputMode]
  );

  const handleClearItemSlot = useCallback((slot) => {
    if (!ITEM_TYPES.includes(slot)) {
      return;
    }
    setSelectedItemsBySlot((previous = {}) => {
      if (!previous?.[slot]) {
        return previous;
      }
      return { ...previous, [slot]: null };
    });
  }, []);

  const handleSelectItemForSlot = useCallback(
    (slot, item) => {
      if (!ITEM_TYPES.includes(slot) || !item) {
        return;
      }
      if (itemSlotFilters?.[slot] === false) {
        return;
      }
      setInputMode("items");
      setSelectedItemsBySlot((previous = {}) => {
        const current = previous?.[slot];
        if (current) {
          const sameId = current.id && item.id && current.id === item.id;
          const sameAnkama =
            Number.isFinite(current?.ankamaId) &&
            Number.isFinite(item.ankamaId) &&
            current.ankamaId === item.ankamaId;
          if (sameId || sameAnkama) {
            return previous;
          }
        }
        return { ...previous, [slot]: item };
      });
    },
    [itemSlotFilters, setInputMode]
  );

  const handleCloseItemPanel = useCallback(() => {
    setActiveItemSlot(null);
  }, []);

  const handleItemSearchChange = useCallback((event) => {
    const value = event?.target?.value ?? "";
    setItemSearchQuery(value);
  }, []);

  const rerollIdentity = useCallback(() => {
    if (!isIdentityRandom || !Array.isArray(breeds) || breeds.length === 0) {
      return;
    }

    const randomBreed = breeds[Math.floor(Math.random() * breeds.length)];
    const randomGender = Math.random() > 0.5 ? "male" : "female";

    if (Number.isFinite(randomBreed?.id)) {
      setSelectedBreedId(randomBreed.id);
    }
    setSelectedGender(randomGender);
  }, [breeds, isIdentityRandom]);

  useEffect(() => {
    if (!isIdentityRandom) {
      return;
    }
    if (!Array.isArray(breeds) || breeds.length === 0) {
      return;
    }
    if (Number.isFinite(selectedBreedId)) {
      return;
    }
    rerollIdentity();
  }, [breeds, isIdentityRandom, rerollIdentity, selectedBreedId]);

  useEffect(() => {
    if (!isIdentityRandom || !colors.length) {
      return;
    }
    rerollIdentity();
  }, [colors, isIdentityRandom, rerollIdentity]);

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

  const getShareDescriptor = useCallback(
    (proposal) =>
      buildSkinShareDescriptor(proposal, {
        useCustomSkinTone,
        referenceColors: colors,
      }),
    [useCustomSkinTone, colors]
  );

  const applySharedSkin = useCallback(
    (descriptor) => {
      if (!descriptor) {
        return;
      }

      if (Number.isFinite(descriptor.classId)) {
        setSelectedBreedId(descriptor.classId);
      }

      if (descriptor.gender === "f" || descriptor.gender === "m") {
        setSelectedGender(descriptor.gender === "f" ? "female" : "male");
      }

      if (descriptor.useCustomSkinTone !== undefined) {
        setUseCustomSkinTone(Boolean(descriptor.useCustomSkinTone));
      }

      const referencePalette = Array.isArray(descriptor.referenceColors)
        ? descriptor.referenceColors.map((hex) => normalizeColorToHex(hex)).filter(Boolean)
        : [];
      const palette = referencePalette.length
        ? referencePalette
        : Array.isArray(descriptor.palette)
        ? descriptor.palette.map((hex) => normalizeColorToHex(hex)).filter(Boolean)
        : [];
      const fallbackPalette =
        !palette.length && Array.isArray(descriptor.lookColors)
          ? descriptor.lookColors
              .map((value) => normalizeColorToHex(value))
              .filter((hex) => typeof hex === "string" && hex.length)
          : [];
      const resolvedPalette = palette.length ? palette : fallbackPalette;

      if (resolvedPalette.length) {
        const paletteObjects = resolvedPalette
          .map((value) => {
            const normalizedHex = normalizeColorToHex(value);
            if (!normalizedHex) {
              return null;
            }
            const rgb = hexToRgb(normalizedHex);
            if (!rgb) {
              return null;
            }
            return {
              hex: normalizedHex,
              rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
              r: rgb.r,
              g: rgb.g,
              b: rgb.b,
              weight: 1,
            };
          })
          .filter(Boolean);

        if (paletteObjects.length) {
          setInputMode("color");
          setSelectedColor(paletteObjects[0].hex);
          setColors(paletteObjects);
        }
      }

      if (Number.isFinite(descriptor.animation)) {
        setLookAnimation(descriptor.animation);
      }

      if (Number.isFinite(descriptor.direction)) {
        setLookDirection(normalizeLookDirection(descriptor.direction));
      }

      if (descriptor.items && typeof descriptor.items === "object") {
        const requiredOptionalSlots = {};
        OPTIONAL_ITEM_TYPES.forEach((slot) => {
          if (descriptor.items[slot]) {
            requiredOptionalSlots[slot] = true;
          }
        });

        if (Object.keys(requiredOptionalSlots).length) {
          setItemSlotFilters((previous = {}) => {
            let changed = false;
            const next = { ...previous };
            Object.entries(requiredOptionalSlots).forEach(([slot]) => {
              if (next[slot] === false) {
                next[slot] = true;
                changed = true;
              }
            });
            return changed ? next : previous;
          });
        }

        pendingSharedItemsRef.current = { ...descriptor.items };
      } else {
        pendingSharedItemsRef.current = null;
      }

      setActiveProposal(0);
    },
    [
      setSelectedBreedId,
      setSelectedGender,
      setUseCustomSkinTone,
      setInputMode,
      setSelectedColor,
      setColors,
      setLookAnimation,
      setLookDirection,
      setItemSlotFilters,
      setActiveProposal,
    ]
  );

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

  useEffect(() => {
    if (!router?.isReady) {
      return;
    }

    const rawSkin = router?.query?.skin;
    const token = Array.isArray(rawSkin) ? rawSkin[0] : rawSkin;

    if (!token) {
      appliedShareTokenRef.current = null;
      return;
    }

    if (appliedShareTokenRef.current === token) {
      return;
    }

    const descriptor = decodeSkinShareDescriptor(token);
    appliedShareTokenRef.current = token;

    if (!descriptor) {
      setError(t("errors.shareLink"));
      return;
    }

    applySharedSkin(descriptor);
  }, [router?.isReady, router?.query?.skin, applySharedSkin, t, setError]);

  useEffect(() => {
    if (!isItemsMode) {
      return;
    }

    if (!selectedItemPalette.length) {
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

    setColors(selectedItemPalette);
    setImageSignature(null);
    setImageShape(null);
    setImageTones(
      computeToneDistributionFromPalette(selectedItemPalette.map((entry) => entry.hex))
    );
    setImageHash(null);
    setImageEdges(null);
    setIsProcessing(false);
    setAnalysisProgress(0);
    setCopiedCode(null);
    setToast(null);
    setError(null);
  }, [
    isItemsMode,
    selectedItemPalette,
    setColors,
    setImageSignature,
    setImageShape,
    setImageTones,
    setImageHash,
    setImageEdges,
    setIsProcessing,
    setAnalysisProgress,
    setCopiedCode,
    setToast,
    setError,
  ]);

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
    const recommendationCap = isInspirationLayout
      ? Math.max(MAX_RECOMMENDATIONS, proposalLimit)
      : MAX_RECOMMENDATIONS;

    if (!colors.length || !Number.isFinite(activeClassId)) {
      return null;
    }

    return ITEM_TYPES.reduce((accumulator, type) => {
      const isSlotEnabled = itemSlotFilters?.[type] !== false;
      const lockedItemCandidate = selectedItemsBySlot?.[type] ?? null;
      const lockedItem = isSlotEnabled ? lockedItemCandidate : null;

      if (!isSlotEnabled) {
        accumulator[type] = [];
        return accumulator;
      }

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
      const rankedEntries = finiteScores.length > 0 ? finiteScores : scoredItems;
      let rankedItems = rankedEntries.map(({ item }) => item);

      if (lockedItem) {
        const matchIndex = rankedItems.findIndex((candidate) => {
          if (!candidate) {
            return false;
          }
          if (candidate.id && lockedItem.id && candidate.id === lockedItem.id) {
            return true;
          }
          if (
            Number.isFinite(candidate.ankamaId) &&
            Number.isFinite(lockedItem.ankamaId) &&
            candidate.ankamaId === lockedItem.ankamaId
          ) {
            return true;
          }
          return false;
        });

        if (matchIndex !== -1) {
          const [matched] = rankedItems.splice(matchIndex, 1);
          rankedItems = [matched, ...rankedItems];
        } else {
          rankedItems = [lockedItem, ...rankedItems];
        }
      }

      const seenIds = new Set();
      accumulator[type] = rankedItems
        .filter((item) => {
          if (!item) {
            return false;
          }
          const key = item.id ?? (Number.isFinite(item.ankamaId) ? `ankama-${item.ankamaId}` : null);
          if (key && seenIds.has(key)) {
            return false;
          }
          if (key) {
            seenIds.add(key);
          }
          return true;
        })
        .slice(0, recommendationCap);
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
    itemSlotFilters,
    selectedItemsBySlot,
    isInspirationLayout,
    proposalLimit,
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

        const limit = Math.min(proposalLimit, pool.length);
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

  const inspirationIdentities = useMemo(() => {
    if (!isInspirationLayout || !Array.isArray(breeds) || breeds.length === 0) {
      return null;
    }

    const availableBreeds = breeds.filter((breed) => Number.isFinite(breed?.id));

    if (!availableBreeds.length) {
      return null;
    }

    return Array.from({ length: proposalLimit }, () => {
      const randomBreed = availableBreeds[Math.floor(Math.random() * availableBreeds.length)];
      const randomGender = Math.random() > 0.5 ? "female" : "male";

      return {
        breedId: randomBreed.id,
        gender: randomGender,
      };
    });
  }, [breeds, colors, isInspirationLayout, proposalLimit]);

  const proposals = useMemo(() => {
    if (!recommendations || !Number.isFinite(activeClassId)) {
      return [];
    }

    const maxLength = Math.max(
      0,
      ...ITEM_TYPES.map((type) => (recommendations[type]?.length ?? 0))
    );

    const total = Math.min(proposalLimit, maxLength || 0);
    const combos = [];

    for (let index = 0; index < total; index += 1) {
      const items = ITEM_TYPES.map((type) => {
        const pool = recommendations[type] ?? [];
        const lockedItem = selectedItemsBySlot?.[type] ?? null;
        if (!pool.length) {
          if (lockedItem) {
            return { ...lockedItem, slotType: type };
          }
          return null;
        }

        const selections = Array.isArray(proposalItemIndexes?.[type]) ? proposalItemIndexes[type] : [];
        const selectionIndex = selections[index];
        const fallbackIndex =
          Number.isFinite(selectionIndex) && selectionIndex >= 0 && selectionIndex < pool.length
            ? selectionIndex
            : index;

        let pick = null;

        if (lockedItem) {
          pick =
            pool.find((candidate) => {
              if (!candidate) {
                return false;
              }
              if (candidate.id && lockedItem.id && candidate.id === lockedItem.id) {
                return true;
              }
              if (
                Number.isFinite(candidate.ankamaId) &&
                Number.isFinite(lockedItem.ankamaId) &&
                candidate.ankamaId === lockedItem.ankamaId
              ) {
                return true;
              }
              return false;
            }) ?? lockedItem;
        } else if (pool.length) {
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

      const inspirationIdentity = inspirationIdentities?.[index] ?? null;
      const inspirationBreed = inspirationIdentity
        ? breeds.find((breed) => Number.isFinite(breed?.id) && breed.id === inspirationIdentity.breedId)
        : null;
      const proposalBreed = isInspirationLayout ? inspirationBreed ?? activeBreed : activeBreed;
      const proposalGender =
        isInspirationLayout && inspirationIdentity?.gender ? inspirationIdentity.gender : selectedGender;
      const proposalGenderLabel =
        proposalGender === "female" ? t("identity.gender.female") : t("identity.gender.male");
      const proposalGenderFallback =
        proposalGender === "male" ? BARBOFUS_DEFAULT_BREED.male : BARBOFUS_DEFAULT_BREED.female;
      const proposalGenderConfig = (() => {
        if (proposalBreed) {
          return proposalGender === "male"
            ? proposalBreed.male ?? proposalGenderFallback
            : proposalBreed.female ?? proposalGenderFallback;
        }

        if (activeGenderConfig) {
          return activeGenderConfig;
        }

        return proposalGenderFallback;
      })();
      const proposalClassId = Number.isFinite(proposalBreed?.id) ? proposalBreed.id : activeClassId;
      const proposalClassDefaults = proposalGenderConfig?.colors?.numeric ?? activeClassDefaults ?? [];
      const proposalFallbackFaceId = Number.isFinite(proposalGenderConfig?.faceId)
        ? proposalGenderConfig.faceId
        : Number.isFinite(proposalGenderConfig?.lookId)
        ? proposalGenderConfig.lookId
        : BARBOFUS_DEFAULTS.faceId;
      const lookFaceId = getBarbofusFaceId(proposalClassId, proposalGender, proposalFallbackFaceId);
      const lookGenderValue = BARBOFUS_GENDER_VALUES[proposalGender] ?? BARBOFUS_DEFAULTS.gender;
      const lookGenderCode = lookGenderValue === BARBOFUS_GENDER_VALUES.female ? "f" : "m";
      const proposalSubtitleParts = [];
      if (proposalBreed?.name) {
        proposalSubtitleParts.push(proposalBreed.name);
      }
      if (proposalGenderLabel) {
        proposalSubtitleParts.push(proposalGenderLabel);
      }
      const sharedSubtitle = proposalSubtitleParts.join(" · ");

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

      const paletteSample = buildLookPalette(palette, index);
      const lookItemIds = Array.from(
        new Set(
          items
            .map((item) => (Number.isFinite(item.ankamaId) ? Math.trunc(item.ankamaId) : null))
            .filter((value) => Number.isFinite(value))
        )
      ).sort((a, b) => a - b);

      const barbofusLink = buildBarbofusLink(items, paletteSample, fallbackColorValues, {
        useCustomSkinTone,
        classId: proposalClassId,
        gender: lookGenderValue,
        faceId: lookFaceId,
        classDefaults: proposalClassDefaults,
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

        if (!useCustomSkinTone && Array.isArray(proposalClassDefaults) && proposalClassDefaults.length) {
          const defaultSkin = proposalClassDefaults.find((entry) => Number.isFinite(entry));
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

        if (!useCustomSkinTone && Array.isArray(proposalClassDefaults) && proposalClassDefaults.length) {
          proposalClassDefaults.forEach((value, index) => {
            if (index === 0) {
              return;
            }
            register(value);
          });
        }

        return values.slice(0, MAX_ITEM_PALETTE_COLORS);
      })();

      const baseKeyParts = [];
      if (Number.isFinite(proposalClassId)) {
        baseKeyParts.push(proposalClassId);
      }
      const baseLookFaceId = Number.isFinite(lookFaceId) ? lookFaceId : null;
      if (baseLookFaceId) {
        baseKeyParts.push(`head${baseLookFaceId}`);
      }
      baseKeyParts.push(lookGenderCode);
      const itemKeyParts = lookItemIds.map((value) => String(value));
      const colorKeyParts = [];
      lookColors.forEach((value) => {
        colorKeyParts.push(`c${value}`);
      });
      const animationCode = Number.isFinite(lookAnimation)
        ? Math.trunc(lookAnimation)
        : DEFAULT_LOOK_ANIMATION;
      const baseWithoutItemsParts = [...baseKeyParts, ...colorKeyParts, `a${animationCode}`];
      const lookBaseKeyNoStuff = baseWithoutItemsParts.length
        ? baseWithoutItemsParts.join("-")
        : null;
      const baseWithItemsParts = [...baseKeyParts, ...itemKeyParts, ...colorKeyParts, `a${animationCode}`];
      const lookBaseKey = baseWithItemsParts.length
        ? baseWithItemsParts.join("-")
        : lookBaseKeyNoStuff;
      const directionCode = normalizeLookDirection(lookDirection);
      const lookKey = lookBaseKey ? `${lookBaseKey}-d${directionCode}` : null;
      const lookKeyNoStuff = lookBaseKeyNoStuff ? `${lookBaseKeyNoStuff}-d${directionCode}` : null;
      const souffLink = buildSouffLink({
        classId: proposalClassId,
        faceId: baseLookFaceId,
        gender: lookGenderCode,
        itemIds: lookItemIds,
        colors: lookColors,
        animation: animationCode,
        direction: directionCode,
      });

      combos.push({
        id: `proposal-${index}`,
        index,
        items,
        palette: paletteSample,
        heroImage: items.find((item) => item.imageUrl)?.imageUrl ?? null,
        barbofusLink,
        souffLink,
        className: proposalBreed?.name ?? null,
        classId: Number.isFinite(proposalClassId) ? proposalClassId : null,
        genderLabel: proposalGenderLabel,
        classIcon: proposalBreed?.icon ?? null,
        subtitle: sharedSubtitle,
        lookGender: lookGenderCode,
        lookFaceId,
        lookItemIds,
        lookColors,
        lookBaseKey,
        lookKey,
        lookBaseKeyNoStuff,
        lookKeyNoStuff,
        lookAnimation: animationCode,
        lookDirection: directionCode,
      });
    }

    return combos;
  }, [
    activeBreed,
    activeClassDefaults,
    activeClassId,
    activeGenderConfig,
    fallbackColorValues,
    inspirationIdentities,
    isInspirationLayout,
    breeds,
    proposalItemIndexes,
    recommendations,
    selectedGender,
    selectedItemsBySlot,
    t,
    useCustomSkinTone,
    lookAnimation,
    lookDirection,
  ]);

  const modalProposal = useMemo(
    () => proposals.find((proposal) => proposal.id === modalProposalId) ?? null,
    [modalProposalId, proposals]
  );

  const modalProposalIndex = useMemo(
    () => (modalProposalId ? proposals.findIndex((proposal) => proposal.id === modalProposalId) : -1),
    [modalProposalId, proposals]
  );

  useEffect(() => {
    if (!modalProposalId) {
      setModalTransitionDirection(null);
      if (modalTransitionTimerRef.current) {
        clearTimeout(modalTransitionTimerRef.current);
        modalTransitionTimerRef.current = null;
      }
    }
  }, [modalProposalId]);

  const lookPreviewDescriptors = useMemo(() => {
    if (!Array.isArray(proposals) || proposals.length === 0) {
      return [];
    }

    const descriptors = [];
    const seen = new Set();

    proposals.forEach((proposal) => {
      if (!Number.isFinite(proposal?.classId) || !Number.isFinite(proposal?.lookFaceId)) {
        return;
      }

      const colors = Array.isArray(proposal.lookColors)
        ? proposal.lookColors.filter((value) => Number.isFinite(value)).slice(0, MAX_ITEM_PALETTE_COLORS)
        : [];
      const normalizedItemIds = Array.isArray(proposal.lookItemIds)
        ? proposal.lookItemIds.filter((value) => Number.isFinite(value))
        : [];

      const descriptorEntries = [];

      if (proposal?.lookBaseKeyNoStuff) {
        descriptorEntries.push({ baseKey: proposal.lookBaseKeyNoStuff, itemIds: [] });
      }

      if (proposal?.lookBaseKey && normalizedItemIds.length) {
        descriptorEntries.push({ baseKey: proposal.lookBaseKey, itemIds: normalizedItemIds });
      }

      descriptorEntries.forEach((entry) => {
        if (!entry.baseKey || seen.has(entry.baseKey)) {
          return;
        }

        descriptors.push({
          baseKey: entry.baseKey,
          classId: proposal.classId,
          lookGender: typeof proposal.lookGender === "string" ? proposal.lookGender : "m",
          lookFaceId: proposal.lookFaceId,
          lookItemIds: entry.itemIds,
          lookColors: colors,
          lookAnimation: proposal.lookAnimation,
        });
        seen.add(entry.baseKey);
      });
    });

    return descriptors;
  }, [proposals]);

  const previewBackgroundAutoByProposal = useMemo(() => {
    if (!previewBackgroundOptions.length) {
      return new Map();
    }

    const backgroundsWithColor = previewBackgroundOptions
      .map((entry) => {
        const swatch = previewBackgroundSwatches?.[entry.id] ?? null;
        const rgb = swatch ? hexToRgb(swatch) : null;
        return { entry, rgb };
      })
      .filter((background) => background.entry?.id && background.rgb);

    if (!backgroundsWithColor.length) {
      return new Map();
    }

    const map = new Map();

    proposals.forEach((proposal) => {
      if (!proposal?.id) {
        return;
      }

      const palette = Array.isArray(proposal.palette) ? proposal.palette : [];
      const paletteColors = palette
        .map((hex) => normalizeColorToHex(hex))
        .map((normalized) => (normalized ? hexToRgb(normalized) : null))
        .filter(Boolean);

      if (!paletteColors.length) {
        const fallback = backgroundsWithColor[proposal.index % backgroundsWithColor.length];
        if (fallback?.entry?.id) {
          map.set(proposal.id, fallback.entry.id);
        }
        return;
      }

      let bestBackground = null;
      let bestScore = Number.POSITIVE_INFINITY;

      backgroundsWithColor.forEach((background) => {
        const score =
          paletteColors.reduce((total, color) => total + colorDistance(background.rgb, color), 0) /
          paletteColors.length;
        if (score < bestScore) {
          bestScore = score;
          bestBackground = background.entry;
        }
      });

      if (bestBackground?.id) {
        map.set(proposal.id, bestBackground.id);
      }
    });

    return map;
  }, [previewBackgroundOptions, previewBackgroundSwatches, proposals]);

  useEffect(() => {
    if (
      previewBackgroundMode !== PREVIEW_BACKGROUND_MODES.RANDOM ||
      !isPreviewBackgroundEnabled ||
      !previewBackgroundOptions.length ||
      !proposals.length
    ) {
      setRandomPreviewBackgroundAssignments((previous = {}) => {
        if (!previous || Object.keys(previous).length === 0) {
          return previous;
        }
        return {};
      });
      return;
    }

    setRandomPreviewBackgroundAssignments(() => {
      const assignments = {};
      proposals.forEach((proposal) => {
        if (!proposal?.id) {
          return;
        }
        const option =
          previewBackgroundOptions[
            Math.floor(Math.random() * previewBackgroundOptions.length)
          ];
        if (option?.id) {
          assignments[proposal.id] = option.id;
        }
      });
      return assignments;
    });
  }, [
    isPreviewBackgroundEnabled,
    previewBackgroundMode,
    previewBackgroundOptions,
    proposals,
  ]);

  const proposalCount = proposals.length;
  const safeActiveProposalIndex = proposalCount
    ? Math.min(activeProposal, proposalCount - 1)
    : 0;
  const activeProposalDetails = proposalCount ? proposals[safeActiveProposalIndex] : null;
  const activeProposalSubtitle = activeProposalDetails?.subtitle ?? "";
  const activeProposalClassIcon = activeProposalDetails?.classIcon ?? null;
  const activeProposalPalette = activeProposalDetails?.palette;
  const activeDirectionValue = normalizeLookDirection(lookDirection);
  const activeDirectionOption = LOOK_DIRECTION_BY_VALUE.get(activeDirectionValue);
  const activeDirectionLabel = activeDirectionOption ? t(activeDirectionOption.labelKey) : "";
  const directionAnnouncement = activeDirectionLabel
    ? t("identity.preview.direction.announce", { direction: activeDirectionLabel })
    : "";
  const previewDirectionDescription = `${t("aria.previewDirectionControl")}${
    activeDirectionLabel ? ` - ${activeDirectionLabel}` : ""
  }. ${t("identity.preview.direction.hint")}`;
  const comparisonSliderLabelRaw = t("suggestions.render.comparisonAria");
  const comparisonSliderLabel =
    typeof comparisonSliderLabelRaw === "string" && comparisonSliderLabelRaw.trim().length
      ? comparisonSliderLabelRaw
      : "Drag to compare without gear and with gear";
  const noStuffLabelRaw = t("suggestions.render.noStuffLabel");
  const noStuffLabel =
    typeof noStuffLabelRaw === "string" && noStuffLabelRaw.trim().length
      ? noStuffLabelRaw
      : "No Stuff";
  const stuffLabelRaw = t("suggestions.render.stuffLabel");
  const stuffLabel =
    typeof stuffLabelRaw === "string" && stuffLabelRaw.trim().length ? stuffLabelRaw : "Stuff";

  const adaptiveThemePalette = useMemo(() => {
    if (Array.isArray(activeProposalPalette) && activeProposalPalette.length) {
      return activeProposalPalette;
    }
    if (Array.isArray(colors) && colors.length) {
      return colors.map((entry) => normalizeColorToHex(entry?.hex)).filter(Boolean);
    }
    return null;
  }, [activeProposalPalette, colors]);

  const suggestionsAccentStyle = useMemo(() => {
    const palette = Array.isArray(activeProposalPalette)
      ? activeProposalPalette
      : [];
    const paletteHex = palette
      .map((value) => normalizeColorToHex(value))
      .find(Boolean);
    const fallbackHex = colors
      .map((entry) => normalizeColorToHex(entry?.hex))
      .find(Boolean);
    const accentHex = paletteHex ?? fallbackHex ?? null;
    const accentRgb = accentHex ? hexToRgb(accentHex) : null;
    const { r, g, b } = accentRgb ?? { r: 56, g: 189, b: 248 };
    return {
      boxShadow: `0 24px 44px -30px rgba(${r}, ${g}, ${b}, 0.55)`,
      outline: `2px solid rgba(${r}, ${g}, ${b}, 0.38)`,
    };
  }, [activeProposalPalette, colors]);

  const viewportClasses = `skin-carousel__viewport${
    isGridLayout ? " skin-carousel__viewport--grid" : ""
  }`;
  const trackClasses = `skin-carousel__track${isGridLayout ? " skin-grid" : ""}`;
  const trackStyle = isGridLayout
    ? undefined
    : { transform: `translateX(-${safeActiveProposalIndex * 100}%)` };

  useEffect(() => {
    if (theme === THEME_KEYS.INTELLIGENT) {
      applyThemeToDocument(theme, adaptiveThemePalette);
    }
  }, [adaptiveThemePalette, theme]);

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
  }, [lookPreviews]);

  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      lookPreviewRequestsRef.current.forEach((entry) => {
        try {
          if (entry?.controller && typeof entry.controller.abort === "function") {
            entry.controller.abort();
          }
        } catch (error) {
          if (typeof console !== "undefined" && typeof console.error === "function") {
            console.error(error);
          }
        }
      });
      lookPreviewRequestsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!lookPreviewDescriptors.length) {
      return;
    }

    setLookPreviews((previous = {}) => {
      let changed = false;
      const next = { ...previous };

      lookPreviewDescriptors.forEach((descriptor) => {
        const baseKey = descriptor.baseKey;
        const existing = next[baseKey];
        if (!existing) {
          next[baseKey] = {
            descriptor: { ...descriptor },
            directions: {},
          };
          changed = true;
          return;
        }

        if (!areLookPreviewDescriptorsEqual(existing.descriptor, descriptor)) {
          next[baseKey] = {
            ...existing,
            descriptor: { ...descriptor },
          };
          changed = true;
        }
      });

      if (!changed) {
        return previous;
      }

      lookPreviewsRef.current = next;
      return next;
    });
  }, [lookPreviewDescriptors]);

  const ensureLookPreviewDirection = useCallback(
    async (descriptor, direction) => {
      if (!descriptor || !descriptor.baseKey) {
        return null;
      }

      const baseKey = descriptor.baseKey;
      const normalizedDirection = normalizeLookDirection(direction);
      const currentGroup = lookPreviewsRef.current?.[baseKey];
      const currentEntry = currentGroup?.directions?.[normalizedDirection];

      if (currentEntry?.status === "loaded") {
        return currentEntry;
      }

      const requestKey = `${baseKey}::${normalizedDirection}`;
      const inflight = lookPreviewRequestsRef.current.get(requestKey);
      if (inflight?.promise) {
        return inflight.promise;
      }

      if (!Number.isFinite(descriptor.classId) || !Number.isFinite(descriptor.lookFaceId)) {
        return null;
      }

      const itemIds = Array.isArray(descriptor.lookItemIds)
        ? descriptor.lookItemIds.filter((value) => Number.isFinite(value))
        : [];

      setLookPreviews((previous = {}) => {
        const existingGroup = previous[baseKey];
        const descriptorToStore = existingGroup?.descriptor ?? descriptor;
        const existingDirections = existingGroup?.directions ?? {};
        const existingDirectionEntry = existingDirections[normalizedDirection];

        if (existingDirectionEntry?.status === "loading" && inflight?.promise) {
          return previous;
        }

        const nextDirectionEntry = {
          status: "loading",
          dataUrl: existingDirectionEntry?.dataUrl ?? null,
          rendererUrl: existingDirectionEntry?.rendererUrl ?? null,
          base64: existingDirectionEntry?.base64 ?? null,
          contentType: existingDirectionEntry?.contentType ?? null,
          byteLength: existingDirectionEntry?.byteLength ?? null,
          error: null,
          updatedAt: Date.now(),
        };

        const nextGroup = {
          baseKey,
          descriptor: descriptorToStore,
          directions: {
            ...existingDirections,
            [normalizedDirection]: nextDirectionEntry,
          },
        };

        const next = { ...previous, [baseKey]: nextGroup };
        lookPreviewsRef.current = next;
        return next;
      });

      const params = new URLSearchParams();
      params.set("breedId", String(descriptor.classId));
      params.set("gender", descriptor.lookGender ?? "m");
      params.set("lang", language);
      params.set("size", String(LOOK_PREVIEW_SIZE));
      const animationValue = Number.isFinite(descriptor.lookAnimation)
        ? Math.trunc(descriptor.lookAnimation)
        : DEFAULT_LOOK_ANIMATION;
      params.set("animation", String(animationValue));
      params.set("direction", String(normalizedDirection));
      if (Number.isFinite(descriptor.lookFaceId)) {
        params.set("faceId", String(Math.trunc(descriptor.lookFaceId)));
      }
      itemIds.forEach((id) => {
        params.append("itemIds[]", String(id));
      });
      if (Array.isArray(descriptor.lookColors) && descriptor.lookColors.length) {
        descriptor.lookColors.slice(0, MAX_ITEM_PALETTE_COLORS).forEach((value) => {
          if (Number.isFinite(value)) {
            params.append("colors[]", String(Math.trunc(value)));
          }
        });
      }

      const controller = new AbortController();
      const request = { controller };

      const fetchPromise = (async () => {
        try {
          const response = await fetch(`/api/look-preview?${params.toString()}`, {
            signal: controller.signal,
          });
          if (!response.ok) {
            const payload = await response.json().catch(() => null);
            const message = payload?.error ?? `HTTP ${response.status}`;
            throw new Error(message);
          }

          const payload = await response.json();
          if (controller.signal.aborted || isUnmountedRef.current) {
            return null;
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
            const existingGroup = previous[baseKey];
            if (!existingGroup) {
              return previous;
            }
            const existingDirections = existingGroup.directions ?? {};
            const existingDirectionEntry = existingDirections[normalizedDirection] ?? {};
            const nextDirectionEntry = {
              ...existingDirectionEntry,
              status: dataUrl ? "loaded" : "error",
              dataUrl,
              rendererUrl,
              base64,
              contentType,
              byteLength,
              error: dataUrl ? null : payload?.error ?? t("errors.previewUnavailable"),
              updatedAt: Date.now(),
            };
            const nextGroup = {
              ...existingGroup,
              descriptor: areLookPreviewDescriptorsEqual(existingGroup.descriptor, descriptor)
                ? existingGroup.descriptor
                : { ...descriptor },
              directions: {
                ...existingDirections,
                [normalizedDirection]: nextDirectionEntry,
              },
            };
            const next = { ...previous, [baseKey]: nextGroup };
            lookPreviewsRef.current = next;
            return next;
          });

          return dataUrl ? payload : null;
        } catch (error) {
          if (controller.signal.aborted || isUnmountedRef.current) {
            return null;
          }

          const message = error instanceof Error ? error.message : String(error);

          setLookPreviews((previous = {}) => {
            const existingGroup = previous[baseKey];
            if (!existingGroup) {
              return previous;
            }
            const existingDirections = existingGroup.directions ?? {};
            const existingDirectionEntry = existingDirections[normalizedDirection] ?? {};
            const nextDirectionEntry = {
              ...existingDirectionEntry,
              status: "error",
              dataUrl: null,
              rendererUrl: null,
              base64: null,
              contentType: null,
              byteLength: null,
              error: message || t("errors.previewUnavailable"),
              updatedAt: Date.now(),
            };
            const nextGroup = {
              ...existingGroup,
              descriptor: areLookPreviewDescriptorsEqual(existingGroup.descriptor, descriptor)
                ? existingGroup.descriptor
                : { ...descriptor },
              directions: {
                ...existingDirections,
                [normalizedDirection]: nextDirectionEntry,
              },
            };
            const next = { ...previous, [baseKey]: nextGroup };
            lookPreviewsRef.current = next;
            return next;
          });

          return null;
        } finally {
          lookPreviewRequestsRef.current.delete(requestKey);
        }
      })();

      request.promise = fetchPromise;
      lookPreviewRequestsRef.current.set(requestKey, request);

      await fetchPromise;
      return fetchPromise;
    },
    [language, t]
  );

  useEffect(() => {
    if (!lookPreviewDescriptors.length) {
      return;
    }

    const timeoutHandles = [];
    const activeDirection = normalizeLookDirection(lookDirection);

    lookPreviewDescriptors.forEach((descriptor) => {
      const orderedDirections = [
        activeDirection,
        ...ALL_LOOK_DIRECTIONS.filter((value) => value !== activeDirection),
      ];

      orderedDirections.forEach((direction, index) => {
        if (index === 0) {
          void ensureLookPreviewDirection(descriptor, direction);
        } else {
          const handle = setTimeout(() => {
            void ensureLookPreviewDirection(descriptor, direction);
          }, index * 120);
          timeoutHandles.push(handle);
        }
      });
    });

    return () => {
      timeoutHandles.forEach((handle) => clearTimeout(handle));
    };
  }, [ensureLookPreviewDirection, lookPreviewDescriptors, lookDirection]);

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

  const handleModalNavigate = useCallback(
    (direction) => {
      if (!isInspirationLayout || modalProposalIndex === -1 || proposals.length <= 1) {
        return;
      }

      const nextIndex = (modalProposalIndex + direction + proposals.length) % proposals.length;
      const nextProposal = proposals[nextIndex];
      if (nextProposal?.id) {
        if (modalTransitionTimerRef.current) {
          clearTimeout(modalTransitionTimerRef.current);
          modalTransitionTimerRef.current = null;
        }

        setModalTransitionDirection(direction > 0 ? "next" : "prev");
        modalTransitionTimerRef.current = window.setTimeout(() => {
          setModalTransitionDirection(null);
          modalTransitionTimerRef.current = null;
        }, 320);
        setModalProposalId(nextProposal.id);
      }
    },
    [isInspirationLayout, modalProposalIndex, modalTransitionTimerRef, proposals]
  );

  const handleModalPrev = useCallback(() => handleModalNavigate(-1), [handleModalNavigate]);

  const handleModalNext = useCallback(() => handleModalNavigate(1), [handleModalNavigate]);

  const handleSelectProposal = useCallback(
    (index) => {
      if (!proposalCount) {
        return;
      }
      setActiveProposal(index);
    },
    [proposalCount]
  );

  const handleLookPreviewError = useCallback(
    (baseKey, direction) => {
      if (!baseKey) {
        return;
      }

      const directionValue = normalizeLookDirection(direction);

      setLookPreviews((previous = {}) => {
        const group = previous[baseKey];
        if (!group) {
          return previous;
        }

        const currentEntry = group.directions?.[directionValue];
        if (!currentEntry || currentEntry.status === "error") {
          return previous;
        }

        const nextDirectionEntry = {
          ...currentEntry,
          status: "error",
          dataUrl: null,
          rendererUrl: null,
          base64: null,
          contentType: null,
          byteLength: null,
          error: currentEntry?.error ?? t("errors.previewUnavailableDetailed"),
          updatedAt: Date.now(),
        };

        const nextGroup = {
          ...group,
          directions: {
            ...group.directions,
            [directionValue]: nextDirectionEntry,
          },
        };

        const next = { ...previous, [baseKey]: nextGroup };
        lookPreviewsRef.current = next;
        return next;
      });
    },
    [t]
  );

  const handleDownloadPreview = useCallback(
    async (proposal) => {
      if (!proposal) {
        return;
      }

      const activeDirection = normalizeLookDirection(lookDirection);
      const lookPreviewGroup = proposal.lookBaseKey
        ? lookPreviews?.[proposal.lookBaseKey]
        : null;
      const lookPreview = lookPreviewGroup?.directions?.[activeDirection] ?? null;
      const hasLookPreview =
        typeof lookPreview?.dataUrl === "string" && lookPreview.dataUrl.length > 0;

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

        const defaultLabel = t("suggestions.render.defaultName", { index: proposal.index + 1 });
        const fallbackName = proposal.className ?? defaultLabel;
        const baseName =
          slugify(fallbackName) || slugify(defaultLabel) || `proposition-${proposal.index + 1}`;

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
      } catch (error) {
        console.error("Unable to download preview:", error);
        setError(t("errors.previewDownload"));
      } finally {
        setDownloadingPreviewId(null);
      }
    },
    [lookDirection, lookPreviews, t]
  );

  const handleCopyPreview = useCallback(
    async (proposal) => {
      if (!proposal || !supportsImageClipboard) {
        setError(t("errors.previewCopy"));
        return;
      }

      if (typeof navigator === "undefined" || typeof window === "undefined") {
        setError(t("errors.previewCopy"));
        return;
      }

      const clipboard = navigator.clipboard;
      const ClipboardItemClass = window.ClipboardItem;
      if (!clipboard || typeof clipboard.write !== "function" || typeof ClipboardItemClass !== "function") {
        setError(t("errors.previewCopy"));
        return;
      }

      const activeDirection = normalizeLookDirection(lookDirection);
      const lookPreviewGroup = proposal.lookBaseKey
        ? lookPreviews?.[proposal.lookBaseKey]
        : null;
      const lookPreview = lookPreviewGroup?.directions?.[activeDirection] ?? null;
      const hasLookPreview =
        typeof lookPreview?.dataUrl === "string" && lookPreview.dataUrl.length > 0;

      if (!hasLookPreview) {
        setError(t("errors.previewCopy"));
        return;
      }

      try {
        setCopyingPreviewId(proposal.id);

        const response = await fetch(lookPreview.dataUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const contentType = lookPreview.contentType || blob.type || "image/png";
        const clipboardItem = new ClipboardItemClass({ [contentType]: blob });
        await clipboard.write([clipboardItem]);

        const toastLabelRaw = t("toast.previewCopied");
        let toastLabel = "";
        if (typeof toastLabelRaw === "string") {
          toastLabel = toastLabelRaw.trim().length ? toastLabelRaw.trim() : toastLabelRaw;
        }
        setError(null);
        setToast({
          id: Date.now(),
          label: toastLabel,
          value: null,
          swatch: null,
        });
      } catch (error) {
        console.error("Unable to copy preview:", error);
        setError(t("errors.previewCopy"));
      } finally {
        setCopyingPreviewId(null);
      }
    },
    [lookDirection, lookPreviews, supportsImageClipboard, t, setToast, setError]
  );

  const handleCopy = useCallback(async (value, options = {}) => {
    const { swatch = null, toastKey = "toast.colorCopied", hideValue = false } = options;
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
      const toastLabelRaw = t(toastKey);
      const fallbackLabelRaw = t("toast.colorCopied");
      const toastLabel =
        typeof toastLabelRaw === "string" && toastLabelRaw.trim().length
          ? toastLabelRaw
          : typeof fallbackLabelRaw === "string" && fallbackLabelRaw.trim().length
          ? fallbackLabelRaw
          : "";
      setError(null);
      setCopiedCode(value);
      setToast({
        id: Date.now(),
        label: toastLabel,
        value: hideValue ? null : value,
        swatch,
      });
    } catch (err) {
      console.error(err);
      try {
        fallbackCopy(value);
        const toastLabelRaw = t(toastKey);
        const fallbackLabelRaw = t("toast.colorCopied");
        const toastLabel =
          typeof toastLabelRaw === "string" && toastLabelRaw.trim().length
            ? toastLabelRaw
            : typeof fallbackLabelRaw === "string" && fallbackLabelRaw.trim().length
            ? fallbackLabelRaw
            : "";
        setError(null);
        setCopiedCode(value);
        setToast({
          id: Date.now(),
          label: toastLabel,
          value: hideValue ? null : value,
          swatch,
        });
      } catch (fallbackErr) {
        console.error(fallbackErr);
        setError(t("errors.clipboard"));
      }
    }
  }, [t]);

  const handleShareSkin = useCallback(
    (proposal) => {
      if (!proposal) {
        return;
      }

      if (typeof window === "undefined") {
        setError(t("errors.shareLink"));
        return;
      }

      const descriptor = getShareDescriptor(proposal);
      if (!descriptor) {
        setError(t("errors.shareLink"));
        return;
      }

      const encoded = encodeSkinShareDescriptor(descriptor);
      if (!encoded) {
        setError(t("errors.shareLink"));
        return;
      }

      try {
        const shareUrl = new URL(window.location.href);
        shareUrl.searchParams.set("skin", encoded);
        handleCopy(shareUrl.toString(), { toastKey: "toast.shareLinkCopied", hideValue: true });
      } catch (err) {
        console.error(err);
        setError(t("errors.shareLink"));
      }
    },
    [getShareDescriptor, handleCopy, t, setError]
  );

  const handleExportRecap = useCallback(
    async (proposal) => {
      if (!proposal) {
        setError(t("errors.recapExport"));
        return;
      }

      const activeDirection = normalizeLookDirection(lookDirection);
      const lookPreviewGroup = proposal.lookBaseKey
        ? lookPreviews?.[proposal.lookBaseKey]
        : null;
      const lookPreview = lookPreviewGroup?.directions?.[activeDirection] ?? null;
      const previewSrc =
        typeof lookPreview?.dataUrl === "string" && lookPreview.dataUrl.length > 0
          ? lookPreview.dataUrl
          : null;

      if (!previewSrc) {
        setError(t("errors.recapExport"));
        return;
      }

      try {
        setExportingRecapId(proposal.id);

        const [previewImage, recapBackground, appIcon, classIcon, barbofusQrCode, barbofusIcon] = await Promise.all([
          loadImageElement(previewSrc),
          loadImageElement(RECAP_BACKGROUND_SRC).catch(() => null),
          loadImageElement(APP_ICON_SRC).catch(() => null),
          proposal.classIcon ? loadImageElement(proposal.classIcon).catch(() => null) : Promise.resolve(null),
          proposal.barbofusLink
            ? loadQrCodeImage(proposal.barbofusLink, {
                size: 152,
                margin: 0,
                dark: "#0d1a24",
                light: "#e6f2f3",
              }).catch(() => null)
            : Promise.resolve(null),
          loadImageElement("/icons/barbofus.svg").catch(() => null),
        ]);
        const primaryColor = normalizeColorToHex(proposal.palette?.[0]) ?? "#1F2937";
        const darker = adjustHexLightness(primaryColor, -0.2, -0.08);
        const lighter = adjustHexLightness(primaryColor, 0.18, -0.12);

        const canvas = document.createElement("canvas");
        const width = 1280;
        const height = 720;
        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          throw new Error("Canvas unavailable");
        }

        if (recapBackground) {
          const { width: bgW, height: bgH } = getImageDimensions(recapBackground);
          const bgRatio = Math.max(width / bgW, height / bgH);
          const drawW = Math.ceil(bgW * bgRatio);
          const drawH = Math.ceil(bgH * bgRatio);
          const dx = Math.round((width - drawW) / 2);
          const dy = Math.round((height - drawH) / 2);
          context.drawImage(recapBackground, dx, dy, drawW, drawH);
        } else {
          const gradient = context.createLinearGradient(0, 0, width, height);
          gradient.addColorStop(0, darker);
          gradient.addColorStop(0.5, primaryColor);
          gradient.addColorStop(1, lighter);
          context.fillStyle = gradient;
          context.fillRect(0, 0, width, height);
        }

        const vignette = context.createLinearGradient(0, 0, 0, height);
        vignette.addColorStop(0, "rgba(6, 10, 24, 0.36)");
        vignette.addColorStop(1, "rgba(6, 10, 24, 0.56)");
        context.fillStyle = vignette;
        context.fillRect(0, 0, width, height);

        const { width: previewWidth, height: previewHeight } = getImageDimensions(previewImage);
        const previewMaxWidth = width * 0.42;
        const previewMaxHeight = height * 0.82;
        const previewRatio = Math.min(previewMaxWidth / previewWidth, previewMaxHeight / previewHeight, 1);
        const previewDrawWidth = Math.max(1, Math.round(previewWidth * previewRatio));
        const previewDrawHeight = Math.max(1, Math.round(previewHeight * previewRatio));
        const previewX = Math.round(width * 0.2);
        const previewY = Math.round((height - previewDrawHeight) / 2);
        context.shadowColor = withAlpha(primaryColor, 0.28);
        context.shadowBlur = 24;
        context.drawImage(previewImage, previewX, previewY, previewDrawWidth, previewDrawHeight);
        context.shadowBlur = 0;

        const panelX = Math.round(width * 0.52);
        const panelY = Math.round(height * 0.085);
        const panelWidth = Math.round(width * 0.39);
        const panelHeight = Math.round(height * 0.82);
        const panelRadius = 20;
        context.fillStyle = "rgba(5, 8, 18, 0.78)";
        context.beginPath();
        context.moveTo(panelX + panelRadius, panelY);
        context.lineTo(panelX + panelWidth - panelRadius, panelY);
        context.quadraticCurveTo(panelX + panelWidth, panelY, panelX + panelWidth, panelY + panelRadius);
        context.lineTo(panelX + panelWidth, panelY + panelHeight - panelRadius);
        context.quadraticCurveTo(
          panelX + panelWidth,
          panelY + panelHeight,
          panelX + panelWidth - panelRadius,
          panelY + panelHeight
        );
        context.lineTo(panelX + panelRadius, panelY + panelHeight);
        context.quadraticCurveTo(panelX, panelY + panelHeight, panelX, panelY + panelHeight - panelRadius);
        context.lineTo(panelX, panelY + panelRadius);
        context.quadraticCurveTo(panelX, panelY, panelX + panelRadius, panelY);
        context.closePath();
        context.fill();

        const title = proposal.className ?? t("suggestions.render.defaultName", { index: proposal.index + 1 });

        const drawRoundedRect = (ctx, x, y, w, h, radius) => {
          const r = Math.min(radius, w / 2, h / 2);
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + w - r, y);
          ctx.quadraticCurveTo(x + w, y, x + w, y + r);
          ctx.lineTo(x + w, y + h - r);
          ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
          ctx.lineTo(x + r, y + h);
          ctx.quadraticCurveTo(x, y + h, x, y + h - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.closePath();
        };

        const textOnColor = (hex) => {
          const normalized = normalizeColorToHex(hex);
          if (!normalized) {
            return "rgba(15, 23, 42, 0.9)";
          }
          const value = normalized.replace("#", "");
          const r = parseInt(value.slice(0, 2), 16) / 255;
          const g = parseInt(value.slice(2, 4), 16) / 255;
          const b = parseInt(value.slice(4, 6), 16) / 255;
          const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          return luminance > 0.55 ? "rgba(15, 23, 42, 0.9)" : "rgba(255, 255, 255, 0.94)";
        };

        const genderSymbol = proposal.lookGender === "f" ? "f" : "m";
        const genderPath = new Path2D(
          genderSymbol === "f"
            ? "M12 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 12v8m-4-4h8"
            : "M15 3h6v6m0-6-7.5 7.5m1.5-1.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z"
        );

        const drawBadge = (x, y, size, render) => {
          drawRoundedRect(context, x, y, size, size, size * 0.3);
          context.fillStyle = "rgba(255, 255, 255, 0.08)";
          context.fill();
          context.strokeStyle = "rgba(255, 255, 255, 0.96)";
          context.lineWidth = 1.5;
          // context.stroke();
          render(x, y, size);
        };

        const badgeSize = 60;
        const badgeY = panelY + 10;
        const badgeX = panelX + 24;
        if (classIcon) {
          drawBadge(badgeX, badgeY, badgeSize, (x, y, size) => {
            const padding = 12;
            const drawW = size - padding * 2;
            const drawH = size - padding * 2;
            const ratio = Math.min(drawW / classIcon.width, drawH / classIcon.height, 1);
            const w = Math.round(classIcon.width * ratio);
            const h = Math.round(classIcon.height * ratio);
            const dx = x + Math.round((size - w) / 2);
            const dy = y + Math.round((size - h) / 2);
            context.drawImage(classIcon, dx, dy, w, h);
          });
        }
        
        /*
        drawBadge(badgeX + badgeSize, badgeY + 2, 44, (x, y, size) => {
          context.save();
          context.translate(x + size / 2, y + size / 2);
          const scale = (size * 1) / 24;
          context.scale(scale, scale);
          context.strokeStyle = "rgba(255, 255, 255, 0.92)";
          context.lineWidth = 1.6;
          context.lineCap = "round";
          context.lineJoin = "round";
          //context.stroke(genderPath);
          context.restore();
        });
        */

        let blockY = badgeY + badgeSize + 26;

        const palette = Array.isArray(proposal.palette)
          ? proposal.palette.map((hex) => normalizeColorToHex(hex)).filter(Boolean).slice(0, MAX_ITEM_PALETTE_COLORS)
          : [];
        const swatchWidth = 148;
        const swatchHeight = 42;
        const swatchGap = 10;
        const swatchesPerRow = 3;
        const swatchRows = Math.ceil(palette.length / swatchesPerRow) || 1;
        for (let index = 0; index < palette.length; index += 1) {
          const col = index % swatchesPerRow;
          const row = Math.floor(index / swatchesPerRow);
          const x = panelX + 20 + col * (swatchWidth + swatchGap);
          const y = blockY + row * (swatchHeight + swatchGap);
          const hex = palette[index] ?? primaryColor;
          drawRoundedRect(context, x, y, swatchWidth, swatchHeight, 14);
          context.fillStyle = withAlpha(hex, 0.72);
          context.fill();
          context.strokeStyle = "rgba(255, 255, 255, 0.12)";
          context.lineWidth = 1.5;
          context.stroke();

          context.beginPath();
          context.arc(x + 18, y + swatchHeight / 2, 9, 0, Math.PI * 2);
          context.fillStyle = hex;
          context.fill();
          context.strokeStyle = "rgba(255, 255, 255, 0.2)";
          context.stroke();

          context.fillStyle = textOnColor(hex);
          context.font = "700 15px 'Inter', system-ui, -apple-system, sans-serif";
          context.fillText(hex.toUpperCase(), x + 38, y + swatchHeight / 2 + 5);
        }
        blockY += swatchRows * (swatchHeight + swatchGap) + 16;

        const itemsLabel = t("workspace.mode.items");
        context.fillStyle = "rgba(255, 255, 255, 0.86)";
        context.font = "600 17px 'Inter', system-ui, -apple-system, sans-serif";
        context.fillText(itemsLabel, panelX + 24, blockY + 24);
        blockY += 38;

        const fallbackSlot = (slotType) => {
          const key = ITEM_TYPE_LABEL_KEYS[slotType];
          return key ? t(key) : slotType ?? "";
        };

        const defaultItems = Array.isArray(proposal.items) ? proposal.items.slice(0, ITEM_TYPES.length) : [];
        const itemsWithImages = await Promise.all(
          defaultItems.map(async (item) => {
            if (!item?.imageUrl) {
              return { item, image: null };
            }
            try {
              const image = await loadImageElement(item.imageUrl);
              return { item, image };
            } catch (error) {
              return { item, image: null };
            }
          })
        );

        const footerSafeY = panelY + panelHeight - 36;
        const availableHeight = Math.max(120, footerSafeY - blockY);
        const itemGap = 10;
        const itemsCount = Math.max(1, itemsWithImages.length);
        const itemStep = Math.max(46, Math.floor(availableHeight / itemsCount));
        const rowHeight = Math.max(40, itemStep - 6);
        const itemIconSize = Math.max(34, Math.min(50, rowHeight - 12));

        for (let index = 0; index < itemsWithImages.length; index += 1) {
          const entry = itemsWithImages[index];
          const y = blockY + index * itemStep;
          const rowX = panelX + 18;
          const rowWidth = panelWidth - 36;
          // drawRoundedRect(context, rowX, y - 4, rowWidth, rowHeight + 10, 14);
          context.fillStyle = "rgba(255, 255, 255, 0.07)";
          context.fill();
          context.strokeStyle = "rgba(255, 255, 255, 0.1)";
          context.stroke();

          const iconX = panelX + 32;
          const iconY = y + Math.max(4, Math.floor((rowHeight - itemIconSize) / 2));
          const slotLabel = fallbackSlot(entry.item?.slotType);
          const itemName = entry.item?.name ?? slotLabel;
          const paletteSample = normalizeColorToHex(entry.item?.palette?.[0]) ?? primaryColor;

          drawRoundedRect(context, iconX - 4, iconY - 4, itemIconSize + 8, itemIconSize + 8, 14);
          context.fillStyle = withAlpha(paletteSample, 0.32);
          context.fill();
          context.strokeStyle = "rgba(255, 255, 255, 0.18)";
          context.stroke();

          if (entry.image) {
            const { width: iconW, height: iconH } = getImageDimensions(entry.image);
            const ratio = Math.min(itemIconSize / iconW, itemIconSize / iconH, 1);
            const drawW = Math.round(iconW * ratio);
            const drawH = Math.round(iconH * ratio);
            const dx = iconX + Math.round((itemIconSize - drawW) / 2);
            const dy = iconY + Math.round((itemIconSize - drawH) / 2);
            context.drawImage(entry.image, dx, dy, drawW, drawH);
          }

          context.fillStyle = "rgba(255, 255, 255, 0.94)";
          context.font = "700 17px 'Inter', system-ui, -apple-system, sans-serif";
          context.fillText(itemName, iconX + itemIconSize + 14, iconY + Math.round(itemIconSize / 2) + 7);
        }

        if (barbofusQrCode) {
          const qrSize = 140;
          const qrPadding = 9;
          const framePadding = 10;
          const frameSize = qrSize + qrPadding * 2;
          const ctaHeight = 32;
          const ctaGap = 10;
          const cardWidth = frameSize + framePadding * 2;
          const cardHeight = frameSize + framePadding * 2 + ctaGap + ctaHeight;
          const cardRadius = 16;
          const frameRadius = 14;
          const innerRadius = 12;
          const ctaRadius = 16;
          const cardX = Math.round(width * 0.036);
          const cardY = height - cardHeight - Math.round(height * 0.05);

          context.save();
          context.shadowColor = withAlpha(primaryColor, 0.35);
          context.shadowBlur = 14;
          drawRoundedRect(context, cardX, cardY, cardWidth, cardHeight, cardRadius);
          context.fillStyle = withAlpha("#131331", 0.92);
          context.fill();
          context.restore();

          const frameX = cardX + framePadding;
          const frameY = cardY + framePadding;
          drawRoundedRect(context, frameX, frameY, frameSize, frameSize, frameRadius);
          context.fillStyle = "#f8fafc";
          context.fill();
          context.strokeStyle = "rgba(142, 174, 178, 0.4)";
          context.lineWidth = 2;
          context.stroke();

          const qrX = frameX + qrPadding;
          const qrY = frameY + qrPadding;
          drawRoundedRect(context, qrX, qrY, qrSize, qrSize, innerRadius);
          context.fillStyle = "#f8fafc";
          context.fill();
          context.drawImage(barbofusQrCode, qrX, qrY, qrSize, qrSize);

          const ctaWidth = frameSize;
          const ctaX = cardX + Math.round((cardWidth - ctaWidth) / 2);
          const ctaY = frameY + frameSize + ctaGap;
          drawRoundedRect(context, ctaX, ctaY, ctaWidth, ctaHeight, ctaRadius);
          const ctaGradient = context.createLinearGradient(ctaX, ctaY, ctaX + ctaWidth, ctaY + ctaHeight);
          ctaGradient.addColorStop(0, "#4747B8");
          ctaGradient.addColorStop(1, "#4747B8");
          context.fillStyle = ctaGradient;
          context.fill();

          const iconSize = 20;
          const iconX = ctaX + 14;
          const iconY = ctaY + Math.round((ctaHeight - iconSize) / 2);
          if (barbofusIcon) {
            context.drawImage(barbofusIcon, iconX, iconY, iconSize, iconSize);
          } else {
            context.fillStyle = "#f6fbfc";
            drawRoundedRect(context, iconX, iconY, iconSize, iconSize, 6);
            context.fill();
            context.fillStyle = "#FF0000";
            context.fillRect(iconX + 5, iconY + 5, 3, 3);
            context.fillRect(iconX + 12, iconY + 5, 3, 3);
            context.fillRect(iconX + 5, iconY + 12, 3, 3);
            context.fillRect(iconX + 12, iconY + 12, 3, 3);
          }

          const barbofusCta = "Barbofus";
          context.fillStyle = "#f6fbfc";
          context.font = "700 15px 'Inter', system-ui, -apple-system, sans-serif";
          context.fillText(barbofusCta, iconX + iconSize + 10, ctaY + Math.round(ctaHeight / 2) + 5);
        }

        if (appIcon) {
          const footerSize = 34;
          const dx = panelX + panelWidth - footerSize + 42;
          const dy = panelY + panelHeight - footerSize + 30;
          context.globalAlpha = 0.9;
          context.drawImage(appIcon, dx, dy, footerSize, footerSize);
          context.globalAlpha = 1;
        }

        const filenameBase =
          slugify(title) || slugify(t("suggestions.render.defaultName", { index: proposal.index + 1 })) || "recap-skin";
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob((value) => {
            if (value) {
              resolve(value);
            } else {
              reject(new Error("Unable to build blob"));
            }
          }, "image/png");
        });

        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `${filenameBase}-recap.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);
      } catch (error) {
        console.error(error);
        setError(t("errors.recapExport"));
      } finally {
        setExportingRecapId(null);
      }
    },
    [lookDirection, lookPreviews, setError, t]
  );

  const rotateLookDirection = useCallback(
    (step) => {
      const total = ALL_LOOK_DIRECTIONS.length;
      setLookDirection((previous) => {
        const current = normalizeLookDirection(previous);
        let next = (current + step + total) % total;
        if (lookAnimation === 2) {
          let attempts = 0;
          while (COMBAT_POSE_DISABLED_DIRECTIONS.includes(next) && attempts < total) {
            next = (next + step + total) % total;
            attempts += 1;
          }
        }
        return next;
      });
    },
    [lookAnimation]
  );

  const resetDirectionDragState = useCallback(() => {
    directionDragStateRef.current = {
      active: false,
      pointerId: null,
      lastX: 0,
      remainder: 0,
    };
  }, []);

  const handleDirectionPointerDown = useCallback((event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const target = event.currentTarget;
    if (typeof target.focus === "function") {
      target.focus({ preventScroll: true });
    }

    if (typeof target.setPointerCapture === "function") {
      try {
        target.setPointerCapture(event.pointerId);
      } catch (_error) {
        // Ignore capture errors.
      }
    }

    directionDragStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      lastX: Number.isFinite(event.clientX) ? event.clientX : 0,
      remainder: 0,
    };

    if (event.pointerType === "touch") {
      event.preventDefault();
    }
  }, []);

  const handleDirectionPointerMove = useCallback(
    (event) => {
      const state = directionDragStateRef.current;
      if (!state.active || state.pointerId !== event.pointerId) {
        return;
      }

      if (!Number.isFinite(event.clientX)) {
        return;
      }

      const deltaX = event.clientX - state.lastX;
      state.lastX = event.clientX;

      if (!Number.isFinite(deltaX) || deltaX === 0) {
        return;
      }

      state.remainder += deltaX;
      const threshold = DIRECTION_DRAG_THRESHOLD;
      let steps = 0;

      while (state.remainder >= threshold) {
        steps += 1;
        state.remainder -= threshold;
      }

      while (state.remainder <= -threshold) {
        steps -= 1;
        state.remainder += threshold;
      }

      if (steps !== 0) {
        rotateLookDirection(steps);
      }

      if (event.pointerType === "touch") {
        event.preventDefault();
      }
    },
    [rotateLookDirection]
  );

  const handleDirectionPointerUp = useCallback(
    (event) => {
      const state = directionDragStateRef.current;
      if (!state.active || state.pointerId !== event.pointerId) {
        return;
      }

      const target = event.currentTarget;
      if (typeof target.releasePointerCapture === "function") {
        try {
          target.releasePointerCapture(event.pointerId);
        } catch (_error) {
          // Ignore release errors.
        }
      }

      resetDirectionDragState();

      if (event.pointerType === "touch") {
        event.preventDefault();
      }
    },
    [resetDirectionDragState]
  );

  const handleDirectionPointerCancel = useCallback(
    (event) => {
      const state = directionDragStateRef.current;
      if (!state.active || state.pointerId !== event.pointerId) {
        return;
      }

      const target = event.currentTarget;
      if (typeof target.releasePointerCapture === "function") {
        try {
          target.releasePointerCapture(event.pointerId);
        } catch (_error) {
          // Ignore release errors.
        }
      }

      resetDirectionDragState();
    },
    [resetDirectionDragState]
  );

  const handleDirectionKeyDown = useCallback(
    (event) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        rotateLookDirection(-1);
        return;
      }

      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        rotateLookDirection(1);
      }
    },
    [rotateLookDirection]
  );

  const toggleDetailedMatches = useCallback(() => {
    setShowDetailedMatches((previous) => !previous);
  }, []);

  const handleRerollItem = useCallback(
    (type, options = {}) => {
      if (!recommendations) {
        return;
      }

      const pool = recommendations[type] ?? [];
      if (selectedItemsBySlot?.[type]) {
        return;
      }
      if (!pool.length) {
        return;
      }

      const { proposalIndex = null, panelSlotIndex = null } =
        typeof options === "number" ? { panelSlotIndex: options } : options;

      let nextSelection = null;

      if (Number.isFinite(proposalIndex)) {
        const limit = Math.min(proposalLimit, pool.length);
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
    [recommendations, selectedItemsBySlot]
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
              const requests = buildDofusApiRequests(type, language);
              const aggregatedItems = [];

              for (const request of requests) {
                const { url, limit, initialSkip } = request;
                let skip = Number.isFinite(initialSkip) ? initialSkip : 0;
                let expectedTotal = null;
                let pageLimit = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT;

                while (true) {
                  const pageUrl = new URL(url);
                  if (Number.isFinite(pageLimit) && pageLimit > 0) {
                    pageUrl.searchParams.set("$limit", String(pageLimit));
                  }
                  pageUrl.searchParams.set("$skip", String(skip));

                  const controller = new AbortController();
                  controllers.push(controller);

                  try {
                    const response = await fetch(pageUrl.toString(), {
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

                    if (!Array.isArray(rawItems) || rawItems.length === 0) {
                      break;
                    }

                    aggregatedItems.push(...rawItems);

                    const payloadTotal = Number(payload?.total);
                    if (Number.isFinite(payloadTotal) && payloadTotal >= 0) {
                      expectedTotal = payloadTotal;
                    }

                    const payloadLimit = Number(payload?.limit);
                    if (Number.isFinite(payloadLimit) && payloadLimit > 0) {
                      pageLimit = payloadLimit;
                    }

                    const step = Number.isFinite(pageLimit) && pageLimit > 0 ? pageLimit : rawItems.length;
                    if (!Number.isFinite(step) || step <= 0) {
                      break;
                    }

                    skip += step;

                    if (expectedTotal !== null && skip >= expectedTotal) {
                      break;
                    }

                    if ((expectedTotal === null || !Number.isFinite(expectedTotal)) && rawItems.length < step) {
                      break;
                    }
                  } catch (err) {
                    if (err.name === "AbortError") {
                      break;
                    }

                    console.error(err);
                    errors.push({ type, error: err });
                    break;
                  }
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

  useEffect(() => {
    setSelectedItemsBySlot((previous = {}) => {
      let changed = false;
      const next = { ...previous };
      ITEM_TYPES.forEach((type) => {
        const selected = previous?.[type] ?? null;
        if (!selected) {
          return;
        }
        const pool = itemsCatalog?.[type] ?? [];
        const match =
          pool.find((candidate) => {
            if (!candidate) {
              return false;
            }
            if (candidate.id && selected.id && candidate.id === selected.id) {
              return true;
            }
            if (
              Number.isFinite(candidate.ankamaId) &&
              Number.isFinite(selected.ankamaId) &&
              candidate.ankamaId === selected.ankamaId
            ) {
              return true;
            }
            return false;
          }) ?? null;

        if (!match) {
          next[type] = null;
          changed = true;
        } else if (match !== selected) {
          next[type] = match;
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [itemsCatalog]);

  useEffect(() => {
    const pending = pendingSharedItemsRef.current;
    if (!pending) {
      return;
    }

    const entries = Object.entries(pending);
    if (!entries.length) {
      pendingSharedItemsRef.current = null;
      return;
    }

    const updates = {};
    const remaining = {};

    entries.forEach(([slot, descriptor]) => {
      if (!ITEM_TYPES.includes(slot)) {
        return;
      }

      const pool = itemsCatalog?.[slot];
      if (!Array.isArray(pool) || pool.length === 0) {
        remaining[slot] = descriptor;
        return;
      }

      const ankamaId = Number(descriptor?.a);
      let match = Number.isFinite(ankamaId)
        ? pool.find(
            (item) =>
              Number.isFinite(item?.ankamaId) && Math.trunc(item.ankamaId) === Math.trunc(ankamaId)
          )
        : null;

      if (!match && descriptor && descriptor.i !== undefined && descriptor.i !== null) {
        const descriptorId = descriptor.i;
        if (typeof descriptorId === "string" && descriptorId.trim()) {
          const trimmedId = descriptorId.trim();
          match = pool.find((item) => item?.id === trimmedId);
        } else {
          const numericId = Number(descriptorId);
          if (Number.isFinite(numericId)) {
            const normalizedId = Math.trunc(numericId);
            match = pool.find(
              (item) => Number.isFinite(item?.id) && Math.trunc(item.id) === normalizedId
            );
          }
        }
      }

      if (match) {
        updates[slot] = match;
      } else {
        remaining[slot] = descriptor;
      }
    });

    if (Object.keys(updates).length) {
      setSelectedItemsBySlot((previous = {}) => {
        let changed = false;
        const next = { ...previous };
        Object.entries(updates).forEach(([slot, item]) => {
          if (next[slot] !== item) {
            next[slot] = item;
            changed = true;
          }
        });
        return changed ? next : previous;
      });
    }

    pendingSharedItemsRef.current = Object.keys(remaining).length ? remaining : null;
  }, [itemsCatalog, setSelectedItemsBySlot]);

  useEffect(() => {
    setSelectedItemsBySlot((previous = {}) => {
      let changed = false;
      const next = { ...previous };
      OPTIONAL_ITEM_TYPES.forEach((type) => {
        if (itemSlotFilters?.[type] === false && next[type]) {
          next[type] = null;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [itemSlotFilters]);

  useEffect(() => {
    if (activeItemSlot && itemSlotFilters?.[activeItemSlot] === false) {
      setActiveItemSlot(null);
    }
  }, [activeItemSlot, itemSlotFilters]);

  useEffect(() => {
    if (!isItemsMode) {
      setActiveItemSlot(null);
      setItemSearchQuery("");
    }
  }, [isItemsMode]);

  useEffect(() => {
    if (!isItemsMode) {
      return;
    }

    setImageSrc((previous) => (previous === null ? previous : null));
  }, [isItemsMode]);

  useEffect(() => {
    setItemSearchQuery("");
  }, [activeItemSlot]);

  const runModelPrediction = useCallback(
    async (dataUrl) => {
      if (!dataUrl) return;
      setIsPredicting(true);
      setModelError(null);
      setModelResult(null);
      try {
        const response = await fetch("/api/vision/predict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl }),
        });
        if (!response.ok) {
          let message;
          try {
            const payload = await response.json();
            message = payload?.error;
          } catch (err) {
            message = null;
          }
          const fallback = t("vision.prediction.error");
          throw new Error(message || (typeof fallback === "string" ? fallback : "Prediction failed"));
        }
        const payload = await response.json();
        setModelResult(payload);
      } catch (err) {
        console.error(err);
        const fallback = t("vision.prediction.error");
        const message = err?.message || (typeof fallback === "string" ? fallback : "Prediction failed");
        setModelError(message);
      } finally {
        setIsPredicting(false);
      }
    },
    [t],
  );

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
    runModelPrediction(dataUrl);

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
  }, [runModelPrediction, t]);

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
    if (!isImageMode) {
      return undefined;
    }

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
  }, [handleFile, isImageMode]);

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

  useEffect(() => {
    return () => {
      if (modalTransitionTimerRef.current) {
        clearTimeout(modalTransitionTimerRef.current);
        modalTransitionTimerRef.current = null;
      }
    };
  }, []);

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

  const companionFiltersContent = (
    <>
      <span className="filters-panel__section-title">{t("identity.companion.sectionTitle")}</span>
      <div className="companion-toggle" role="group" aria-label={t("aria.companionFilter")}>
        {FAMILIER_FILTERS.map((filter) => {
          const isActive = familierFilters[filter.key] !== false;
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
    </>
  );

  const companionFiltersPanel = (
    <div className="filters-panel inspiration-companion" role="group" aria-label={t("aria.companionSection")}>
      <div className="filters-panel__section" role="group" aria-label={t("aria.companionSection")}>
        {companionFiltersContent}
      </div>
    </div>
  );

  const itemFiltersSection = (
    <div className="filters-panel__section" role="group" aria-label={t("aria.itemFlagSection")}>
      <span className="filters-panel__section-title">{t("identity.filters.sectionTitle")}</span>
      <div className="companion-toggle companion-toggle--item-flags" role="group" aria-label={t("aria.itemFlagFilter")}>\
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
  );

  const optionalItemsSection = (
    <div className="filters-panel__section" role="group" aria-label={t("aria.itemSlotSection")}>
      <span className="filters-panel__section-title">{t("identity.filters.optionalTitle")}</span>
      <div className="item-slot-toggle" role="group" aria-label={t("aria.itemSlotFilter")}>\
        {OPTIONAL_ITEM_FILTERS.map((filter) => {
          const label = filter.labelKey ? t(filter.labelKey) : filter.key;
          const isActive = itemSlotFilters[filter.key] !== false;
          const title = isActive
            ? t("companions.toggle.hide", { label: label.toLowerCase() })
            : t("companions.toggle.show", { label: label.toLowerCase() });

          return (
            <button
              key={filter.key}
              type="button"
              className={`item-slot-toggle__chip${isActive ? " is-active" : ""}`}
              onClick={() => handleItemSlotFilterToggle(filter.key)}
              aria-pressed={isActive}
              title={title}
            >
              <span className="item-slot-toggle__indicator" aria-hidden="true">
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
                  <span className="item-slot-toggle__dot" />
                )}
              </span>
              <span className="item-slot-toggle__label">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const previewBackgroundSection = (
    <div
      className="filters-panel__section"
      role="group"
      aria-label={t("aria.previewBackgroundSection")}
    >
      <span className="filters-panel__section-title">{t("identity.previewBackground.sectionTitle")}</span>
      <div
        className="companion-toggle companion-toggle--preview-animation"
        role="group"
        aria-label={t("aria.combatPoseToggle")}
      >
        <button
          type="button"
          className={`companion-toggle__chip${lookAnimation === 2 ? " is-active" : ""}`}
          onClick={() => {
            setLookDirection(DEFAULT_LOOK_DIRECTION);
            setLookAnimation((previous) => (previous === 2 ? DEFAULT_LOOK_ANIMATION : 2));
          }}
          aria-pressed={lookAnimation === 2}
          title={t("identity.preview.combatPose")}
        >
          <span className="companion-toggle__indicator" aria-hidden="true">
            {lookAnimation === 2 ? (
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
          <span className="companion-toggle__label">{t("identity.preview.combatPose")}</span>
        </button>
      </div>
      <div
        className="companion-toggle companion-toggle--preview-background"
        role="group"
        aria-label={t("aria.previewBackgroundToggle")}
      >
        <button
          type="button"
          className={`companion-toggle__chip${isPreviewBackgroundEnabled ? " is-active" : ""}`}
          onClick={() => {
            if (!hasPreviewBackgroundOptions) {
              return;
            }
            setPreviewBackgroundEnabled((previous) => !previous);
          }}
          aria-pressed={isPreviewBackgroundEnabled}
          title={
            isPreviewBackgroundEnabled
              ? t("identity.previewBackground.disable")
              : t("identity.previewBackground.enable")
          }
          disabled={!hasPreviewBackgroundOptions}
        >
          <span className="companion-toggle__indicator" aria-hidden="true">
            {isPreviewBackgroundEnabled ? (
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
          <span className="companion-toggle__label">{t("identity.previewBackground.toggleLabel")}</span>
        </button>
      </div>
      {!hasPreviewBackgroundOptions ? (
        <p className="preview-background-picker__empty">{t("identity.previewBackground.empty")}</p>
      ) : null}
      {hasPreviewBackgroundOptions && isPreviewBackgroundEnabled ? (
        <div
          className="preview-background-picker"
          role="radiogroup"
          aria-label={t("aria.previewBackgroundPicker")}
        >
          <button
            type="button"
            className={`preview-background-picker__option${
              previewBackgroundMode === PREVIEW_BACKGROUND_MODES.AUTO ? " is-active" : ""
            } preview-background-picker__option--auto`}
            onClick={() => setPreviewBackgroundMode(PREVIEW_BACKGROUND_MODES.AUTO)}
            role="radio"
            aria-checked={previewBackgroundMode === PREVIEW_BACKGROUND_MODES.AUTO}
            aria-label={t("identity.previewBackground.chooseAuto")}
            style={{
              backgroundImage:
                "linear-gradient(135deg, rgba(99, 102, 241, 0.72), rgba(14, 165, 233, 0.72))",
            }}
          >
            <span className="preview-background-picker__label">{t("identity.previewBackground.auto")}</span>
          </button>
          <button
            type="button"
            className={`preview-background-picker__option${
              previewBackgroundMode === PREVIEW_BACKGROUND_MODES.RANDOM ? " is-active" : ""
            } preview-background-picker__option--random`}
            onClick={() => setPreviewBackgroundMode(PREVIEW_BACKGROUND_MODES.RANDOM)}
            role="radio"
            aria-checked={previewBackgroundMode === PREVIEW_BACKGROUND_MODES.RANDOM}
            aria-label={t("identity.previewBackground.chooseRandom")}
            style={{
              backgroundImage:
                "linear-gradient(135deg, rgba(236, 72, 153, 0.72), rgba(59, 130, 246, 0.72))",
            }}
          >
            <span className="preview-background-picker__label">{t("identity.previewBackground.random")}</span>
          </button>
          {previewBackgroundOptions.map((background) => {
            const isActive =
              previewBackgroundMode === PREVIEW_BACKGROUND_MODES.MANUAL &&
              selectedPreviewBackgroundId === background.id;
            const ariaLabel = t("identity.previewBackground.choose", { label: background.label });
            return (
              <button
                key={background.id}
                type="button"
                className={`preview-background-picker__option${isActive ? " is-active" : ""}`}
                onClick={() => {
                  setPreviewBackgroundMode(PREVIEW_BACKGROUND_MODES.MANUAL);
                  setSelectedPreviewBackgroundId(background.id);
                }}
                role="radio"
                aria-checked={isActive}
                aria-label={ariaLabel}
                style={{ backgroundImage: `url(${background.src})` }}
              >
                <span className="preview-background-picker__label">{background.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  const renderFiltersGroup = (includeCompanion = true) => (
    <div
      className={`filters-panel__group${hasCustomFilters ? " is-active" : ""}`}
      role="group"
      aria-label={t("aria.filtersCard")}
    >
      {includeCompanion ? (
        <div className="filters-panel__section" role="group" aria-label={t("aria.companionSection")}>
          {companionFiltersContent}
        </div>
      ) : null}
      {itemFiltersSection}
      {optionalItemsSection}
    </div>
  );

  const renderPreviewGroup = () => (
    <div
      className={`filters-panel__group filters-panel__group--preview${
        hasCustomPreviewSettings ? " is-active" : ""
      }`}
      role="group"
      aria-label={t("aria.previewBackgroundCard")}
    >
      {previewBackgroundSection}
    </div>
  );

  const inspirationFiltersPanel = (
    <div className="inspiration-top-panels__filters-grid">
      {companionFiltersPanel}
      <div
        className={`${filtersPanelClassName} inspiration-filters`}
        role="group"
        aria-label={t("aria.filtersCard")}
      >
        {renderFiltersGroup(false)}
        {renderPreviewGroup()}
      </div>
    </div>
  );

  const renderPaletteSection = () => (
    <div className="palette">
      <div className="palette__header">
        <div className="palette__title">
          <h2>{t("palette.title")}</h2>
        </div>
        <div className="palette__actions">
          {isProcessing ? <span className="badge badge--pulse">{t("palette.badge.analyzing")}</span> : null}
          {colors.length > 0 ? (
            <div className="palette__skin-options" role="radiogroup" aria-label={t("palette.skin.groupLabel")}>
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
          ) : null}
        </div>
      </div>
      {error ? <p className="palette__error">{error}</p> : null}
      {colors.length > 0 ? (
        <ul className="palette__list">
          {colors.map((color, index) => {
            const value = color.hex;
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
  );

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
                  {toast.value ? (
                    <span className="toast__value">{toast.value}</span>
                  ) : null}
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
        <header className="hero" aria-hidden="true">
          <h1 className="sr-only">{BRAND_NAME}</h1>
        </header>
        <div className="workspace-layout">
          <section
            className={`workspace${layoutVariant === "inspiration" ? " workspace--inspiration" : ""}`}
          >
          <div className={referenceClassName}>
            <div className="reference__header">
              <div className="reference__title">
                <h2>{t("workspace.referenceTitle")}</h2>
              </div>
              {hasMultipleAnalysisModes ? (
                <div
                  className="input-switch"
                  role="radiogroup"
                  aria-label={t("aria.analysisMode")}
                >
                  {analysisModes.map((mode) => {
                    const isActive = inputMode === mode.key;
                    return (
                      <button
                        key={mode.key}
                        type="button"
                        className={`input-switch__option${isActive ? " is-active" : ""}`}
                        onClick={() => setInputMode(mode.key)}
                        role="radio"
                        aria-checked={isActive}
                      >
                        {t(mode.labelKey)}
                      </button>
                    );
                  })}
                </div>
              ) : null}
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
            ) : isColorMode ? (
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
                    {curatedColorSuggestions.map((hex) => {
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
            ) : (
              <div className="item-selector">
                <div className="item-selector__grid" role="list">
                  {ITEM_TYPES.map((type) => {
                    const slotLabel = ITEM_TYPE_LABEL_KEYS[type] ? t(ITEM_TYPE_LABEL_KEYS[type]) : type;
                    const selection = selectedItemsBySlot?.[type] ?? null;
                    const isActive = activeItemSlot === type;
                    const isSlotEnabled = itemSlotFilters?.[type] !== false;
                    const slotClasses = ["item-slot"];
                    if (isActive) {
                      slotClasses.push("item-slot--active");
                    }
                    if (selection) {
                      slotClasses.push("item-slot--filled");
                    }
                    if (!isSlotEnabled) {
                      slotClasses.push("item-slot--disabled");
                    }
                    return (
                      <div key={type} className={slotClasses.join(" ")} role="listitem">
                        <button
                          type="button"
                          className="item-slot__button"
                          onClick={() => handleOpenItemSlot(type)}
                          aria-pressed={isActive && isSlotEnabled}
                          disabled={!isSlotEnabled}
                          aria-disabled={!isSlotEnabled}
                          title={!isSlotEnabled ? t("items.selector.disabled") : undefined}
                        >
                          {!isSlotEnabled ? (
                            <span className="item-slot__placeholder item-slot__placeholder--disabled">
                              <span className="item-slot__label">{slotLabel}</span>
                              <span className="item-slot__note">{t("items.selector.disabled")}</span>
                            </span>
                          ) : selection ? (
                            <>
                              <span className="item-slot__media" aria-hidden={selection.imageUrl ? "true" : undefined}>
                                {selection.imageUrl ? (
                                  <img src={selection.imageUrl} alt="" loading="lazy" />
                                ) : (
                                  <span className="item-slot__fallback">{slotLabel}</span>
                                )}
                              </span>
                              <span className="item-slot__name">{selection.name}</span>
                            </>
                          ) : (
                            <span className="item-slot__placeholder">
                              <span className="item-slot__icon" aria-hidden="true">＋</span>
                              <span className="item-slot__label">{slotLabel}</span>
                            </span>
                          )}
                        </button>
                        {selection && isSlotEnabled ? (
                          <button
                            type="button"
                            className="item-slot__clear"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleClearItemSlot(type);
                            }}
                            aria-label={t("aria.itemSlotClear", { type: slotLabel })}
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {activeItemSlot ? (
                  <div className="item-selector__panel is-open">
                    <div className="item-selector__panel-header">
                      <div className="item-selector__panel-title">
                        <h3>
                          {t("items.selector.title", {
                            type:
                              ITEM_TYPE_LABEL_KEYS[activeItemSlot]
                                ? t(ITEM_TYPE_LABEL_KEYS[activeItemSlot])
                                : activeItemSlot,
                          })}
                        </h3>
                        {selectedItemsBySlot?.[activeItemSlot] ? (
                          <span className="item-selector__panel-badge">
                            {t("items.selector.lockedBadge")}
                          </span>
                        ) : null}
                      </div>
                      <div className="item-selector__panel-meta">
                        <span
                          className={`item-selector__panel-count${
                            showFilteredCount ? " item-selector__panel-count--filtered" : ""
                          }`}
                        >
                          {activeSlotCountLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="item-selector__panel-close"
                        onClick={handleCloseItemPanel}
                        aria-label={t("aria.closeItemPanel")}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                    <div className="item-selector__search">
                      <label className="sr-only" htmlFor="item-search">
                        {t("items.selector.searchLabel")}
                      </label>
                      <input
                        id="item-search"
                        type="search"
                        value={itemSearchQuery}
                        onChange={handleItemSearchChange}
                        placeholder={t("items.selector.searchPlaceholder")}
                      />
                    </div>
                    <div className="item-selector__list" role="list">
                      {itemsLoading && filteredItemOptions.length === 0 ? (
                        <p className="item-selector__status">{t("items.selector.loading")}</p>
                      ) : null}
                      {itemsError && filteredItemOptions.length === 0 ? (
                        <p className="item-selector__status item-selector__status--error">{itemsError}</p>
                      ) : null}
                      {!itemsLoading && filteredItemOptions.length === 0 ? (
                        <p className="item-selector__status">{t("items.selector.empty")}</p>
                      ) : null}
                      {filteredItemOptions.length > 0 ? (
                        <ul>
                          {filteredItemOptions.map((item) => {
                            const isSelected =
                              Boolean(selectedItemsBySlot?.[activeItemSlot]) &&
                              ((selectedItemsBySlot[activeItemSlot]?.id &&
                                item.id === selectedItemsBySlot[activeItemSlot].id) ||
                                (Number.isFinite(selectedItemsBySlot[activeItemSlot]?.ankamaId) &&
                                  Number.isFinite(item.ankamaId) &&
                                  selectedItemsBySlot[activeItemSlot].ankamaId === item.ankamaId));
                            const optionClasses = ["item-option"];
                            if (isSelected) {
                              optionClasses.push("item-option--selected");
                            }
                            return (
                              <li key={item.id} className={optionClasses.join(" ")}>
                                <button
                                  type="button"
                                  onClick={() => handleSelectItemForSlot(activeItemSlot, item)}
                                  aria-pressed={isSelected}
                                >
                                  <span className="item-option__media" aria-hidden="true">
                                    {item.imageUrl ? (
                                      <img src={item.imageUrl} alt="" loading="lazy" />
                                    ) : (
                                      <span className="item-option__fallback">
                                        {ITEM_TYPE_LABEL_KEYS[activeItemSlot]
                                          ? t(ITEM_TYPE_LABEL_KEYS[activeItemSlot])
                                          : activeItemSlot}
                                      </span>
                                    )}
                                  </span>
                                  <span className="item-option__details">
                                    <span className="item-option__name">{item.name}</span>
                                    {item.palette.length ? (
                                      <span className="item-option__swatches" aria-hidden="true">
                                        {item.palette.slice(0, 4).map((hex) => (
                                          <span
                                            key={`${item.id}-${hex}`}
                                            className="item-option__swatch"
                                            style={{ backgroundColor: hex }}
                                          />
                                        ))}
                                      </span>
                                    ) : null}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="item-selector__empty">
                    {t("items.selector.hint")}
                  </div>
                )}
              </div>
            )}
          </div>

          {isInspirationLayout ? (
            <div className="inspiration-top-panels">
              {renderPaletteSection()}
              <div className="inspiration-top-panels__filters">{inspirationFiltersPanel}</div>
            </div>
          ) : (
            renderPaletteSection()
          )}

          {showModelPrediction ? (
            <ModelPredictionSection
              result={modelResult}
              isLoading={isPredicting}
              error={modelError}
              placeholder={predictionLabels.placeholder}
              labels={predictionLabels}
            />
          ) : null}

          <div className="suggestions" style={suggestionsAccentStyle}>
            {directionAnnouncement ? (
              <span className="sr-only" aria-live="polite">
                {directionAnnouncement}
              </span>
            ) : null}
          {isIdentityRandom ? (
            !isInspirationLayout ? (
              <div
                className="identity-card suggestions__identity-card identity-card--summary"
                role="status"
                aria-live="polite"
              >
                <div className="identity-card__summary">
                  <h3>Inspiration aléatoire</h3>
                  {showIdentityHint ? (
                    <p>Classe et sexe sont choisis automatiquement pour chaque skin proposé.</p>
                  ) : null}
                  {activeBreed ? (
                    <p className="identity-card__summary-active">
                      {activeBreed.name} · {activeGenderLabel}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="identity-card__reroll"
                  onClick={rerollIdentity}
                  disabled={breedsLoading || !breeds.length}
                >
                  Relancer l'identité
                </button>
              </div>
            ) : null
          ) : (
            <div
              className="identity-card suggestions__identity-card"
              role="group"
              aria-label={t("aria.identityCard")}
            >
                <div className="identity-card__selectors">
                  <div
                    className="identity-card__gender-wrapper"
                    role="group"
                    aria-label={t("aria.genderSection")}
                  >
                    <div
                      className={`identity-card__gender${selectedGender === "female" ? " is-female" : ""}`}
                      role="radiogroup"
                      aria-label={t("aria.genderGroup")}
                    >
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
                  <div
                    className="identity-card__class-wrapper"
                    role="group"
                    aria-label={t("aria.classSection")}
                  >
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
                </div>
              </div>
            )}
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
              <p>
                {isItemsMode
                  ? hasSelectedItems
                    ? t("suggestions.empty.itemsPalette")
                    : t("suggestions.empty.items")
                  : t("suggestions.empty.start")}
              </p>
            </div>
          ) : !Number.isFinite(activeClassId) ? (
            <div className="suggestions__status suggestions__status--empty">
              <p>{t("suggestions.empty.identity")}</p>
            </div>
        ) : !hasCatalogData && itemsLoading ? (
          <div className="suggestions__status suggestions__status--loading">
            <PaletteLoader label={t("suggestions.loading.items")} />
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
                        <div className={viewportClasses}>
                          <div className={trackClasses} style={trackStyle}>
                            {proposals.map((proposal) => {
                              const primaryColor = proposal.palette[0] ?? "#1f2937";
                              const canvasBackground = buildGradientFromHex(primaryColor);
                              const lookPreviewGroup = proposal.lookBaseKey
                                ? lookPreviews?.[proposal.lookBaseKey]
                                : null;
                              const lookPreview = lookPreviewGroup?.directions?.[activeDirectionValue] ?? null;
                              const previewSrc =
                                typeof lookPreview?.dataUrl === "string" && lookPreview.dataUrl.length > 0
                                  ? lookPreview.dataUrl
                                  : null;
                              const lookLoaded = Boolean(previewSrc);
                              const lookLoading =
                                lookPreview?.status === "loading" && !previewSrc;
                              const lookError =
                                lookPreview?.status === "error"
                                  ? lookPreview?.error ?? t("errors.previewUnavailableDetailed")
                                  : null;
                              const heroSrc = !lookLoaded ? proposal.heroImage ?? null : null;
                              const previewAlt = t("suggestions.render.alt", { index: proposal.index + 1 });
                              const baseLookPreviewGroup = proposal.lookBaseKeyNoStuff
                                ? lookPreviews?.[proposal.lookBaseKeyNoStuff]
                                : null;
                              const baseLookPreview =
                                baseLookPreviewGroup?.directions?.[activeDirectionValue] ?? null;
                              const noStuffSrc =
                                typeof baseLookPreview?.dataUrl === "string" &&
                                baseLookPreview.dataUrl.length > 0
                                  ? baseLookPreview.dataUrl
                                  : null;
                              const showComparison = Boolean(previewSrc && noStuffSrc);
                              const noStuffAlt = showComparison
                                ? `${previewAlt} — ${noStuffLabel}`
                                : previewAlt;
                              const autoBackgroundId = previewBackgroundAutoByProposal.get(proposal.id);
                              const autoBackground = autoBackgroundId
                                ? previewBackgroundById.get(autoBackgroundId)
                                : null;
                              let preferredBackground = null;
                              if (previewBackgroundMode === PREVIEW_BACKGROUND_MODES.MANUAL) {
                                preferredBackground = selectedPreviewBackgroundId
                                  ? previewBackgroundById.get(selectedPreviewBackgroundId)
                                  : null;
                                if (!preferredBackground) {
                                  preferredBackground = autoBackground;
                                }
                              } else if (previewBackgroundMode === PREVIEW_BACKGROUND_MODES.RANDOM) {
                                const randomBackgroundId =
                                  randomPreviewBackgroundAssignments?.[proposal.id] ?? null;
                                preferredBackground = randomBackgroundId
                                  ? previewBackgroundById.get(randomBackgroundId)
                                  : null;
                                if (!preferredBackground) {
                                  preferredBackground = autoBackground;
                                }
                              } else {
                                preferredBackground = autoBackground;
                              }
                              const fallbackBackground = isPreviewBackgroundEnabled
                                ? previewBackgroundOptions[proposal.index % previewBackgroundOptions.length] ?? null
                                : null;
                              const activeBackground = isPreviewBackgroundEnabled
                                ? preferredBackground ?? fallbackBackground
                                : null;
                              const canShareSkin = Boolean(getShareDescriptor(proposal));
                              const isDownloadingPreview = downloadingPreviewId === proposal.id;
                              const downloadCtaLabel = isDownloadingPreview
                                ? t("suggestions.render.downloading")
                                : t("suggestions.render.download");
                              const barbofusCtaLabel = t("suggestions.render.link");
                              const souffCtaLabel = t("suggestions.render.souff");
                              const shareCtaLabel = t("suggestions.render.share");
                              const souffUnavailableLabel = t("suggestions.render.souffUnavailable");
                              const copySkinCtaLabel = t("suggestions.render.copySkin");
                              const copySkinUnavailableLabel = t("suggestions.render.copySkinUnavailable");
                              const isCopyingPreview = copyingPreviewId === proposal.id;
                              const canCopySkinImage = supportsImageClipboard && lookLoaded;
                              const recapCtaLabel =
                                exportingRecapId === proposal.id
                                  ? t("suggestions.render.downloading")
                                  : t("suggestions.render.recap");
                              const recapUnavailableLabel = t("suggestions.render.recapUnavailable");
                              const isExportingRecap = exportingRecapId === proposal.id;
                              const canvasStyle = activeBackground
                                ? {
                                    backgroundImage: `url(${activeBackground.src})`,
                                    backgroundColor: primaryColor,
                                  }
                                : { backgroundImage: canvasBackground };
                              const isActiveModal = modalProposalId === proposal.id;
                              const showDetails = !isInspirationLayout || isActiveModal;
                              const cardClasses = ["skin-card"];
                              const openDetailsLabel =
                                typeof t("suggestions.render.openDetails") === "string"
                                  ? t("suggestions.render.openDetails")
                                  : "Voir le détail";
                              const closeLabel =
                                typeof t("aria.close") === "string" ? t("aria.close") : "Fermer";
                              const proposalClassName =
                                proposalBreed?.name ||
                                (Number.isFinite(proposalClassId)
                                  ? t("identity.class.fallback", { id: proposalClassId })
                                  : null);
                              const inspirationIdentityLabel = isInspirationLayout
                                ? [proposalClassName, proposalGenderLabel].filter(Boolean).join(" · ")
                                : "";
                              const proposalClassInitial = proposalClassName
                                ? proposalClassName.charAt(0).toUpperCase()
                                : "?";
                              if (!showDetails) {
                                cardClasses.push("skin-card--compact");
                              }
                              if (isActiveModal && isInspirationLayout) {
                                cardClasses.push("skin-card--modal");
                                if (modalTransitionDirection) {
                                  cardClasses.push(`skin-card--slide-${modalTransitionDirection}`);
                                }
                              }

                                  return (
                                    <article key={proposal.id} className={cardClasses.join(" ")}>
                                      {isActiveModal && isInspirationLayout && proposalCount > 1 ? (
                                        <>
                                          <button
                                            type="button"
                                            className="skin-card__modal-arrow skin-card__modal-arrow--prev"
                                            onClick={handleModalPrev}
                                            aria-label={t("aria.carouselPrevious")}
                                          >
                                            <span aria-hidden="true">←</span>
                                          </button>
                                          <button
                                            type="button"
                                            className="skin-card__modal-arrow skin-card__modal-arrow--next"
                                            onClick={handleModalNext}
                                            aria-label={t("aria.carouselNext")}
                                          >
                                            <span aria-hidden="true">→</span>
                                          </button>
                                        </>
                                      ) : null}
                                      <div className="skin-card__header">
                                        {isInspirationLayout ? (
                                          <div
                                            className="skin-card__identity-badges"
                                            aria-label={inspirationIdentityLabel || undefined}
                                          >
                                            <div className="skin-card__badge">#{proposal.index + 1}</div>
                                            <span className="skin-card__identity-chip">
                                              {proposalBreed?.icon ? (
                                                <img src={proposalBreed.icon} alt="" />
                                              ) : (
                                                <span
                                                  className="skin-card__identity-initial"
                                                  aria-hidden="true"
                                                >
                                                  {proposalClassInitial}
                                                </span>
                                              )}
                                              {proposalClassName ? (
                                                <span className="sr-only">{proposalClassName}</span>
                                              ) : null}
                                            </span>
                                            <span
                                              className={`skin-card__gender-icon skin-card__gender-icon--${proposalGender}`}
                                              aria-hidden="true"
                                            >
                                              {proposalGender === "female" ? (
                                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                  <path
                                                    d="M12 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 12v8m-4-4h8"
                                                    stroke="currentColor"
                                                    strokeWidth="1.6"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                  />
                                                </svg>
                                              ) : (
                                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                  <path
                                                    d="M15 3h6v6m0-6-7.5 7.5m1.5-1.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z"
                                                    stroke="currentColor"
                                                    strokeWidth="1.6"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                  />
                                                </svg>
                                              )}
                                              {proposalGenderLabel ? (
                                                <span className="sr-only">{proposalGenderLabel}</span>
                                              ) : null}
                                            </span>
                                          </div>
                                        ) : (
                                          <div className="skin-card__badge">#{proposal.index + 1}</div>
                                        )}
                                        <h3 className="sr-only">{t("suggestions.carousel.proposalTitle", { index: proposal.index + 1 })}</h3>
                                        {isActiveModal ? (
                                          <div className="skin-card__modal-actions">
                                            {proposalCount > 1 ? (
                                              <div
                                                className="skin-card__modal-nav"
                                                role="group"
                                                aria-label={t("aria.carouselDots")}
                                              >
                                                <button
                                                  type="button"
                                                  className="skin-card__modal-nav-button"
                                                  onClick={handleModalPrev}
                                                  aria-label={t("aria.carouselPrevious")}
                                                >
                                                  <span aria-hidden="true">←</span>
                                                </button>
                                                <button
                                                  type="button"
                                                  className="skin-card__modal-nav-button"
                                                  onClick={handleModalNext}
                                                  aria-label={t("aria.carouselNext")}
                                                >
                                                  <span aria-hidden="true">→</span>
                                                </button>
                                              </div>
                                            ) : null}
                                            <button
                                              type="button"
                                              className="skin-card__close"
                                              onClick={() => setModalProposalId(null)}
                                              aria-label={closeLabel}
                                            >
                                              <span aria-hidden="true">×</span>
                                            </button>
                                          </div>
                                        ) : null}
                                      </div>
                                      <div className="skin-card__body">
                                        <div
                                          className="skin-card__canvas"
                                      style={canvasStyle}
                                    >
                                      <div
                                        className={`skin-card__render${showComparison ? " skin-card__render--with-toggle" : ""}`}
                                      >
                                        {lookError && !lookLoading && !lookLoaded ? (
                                          <div className="skin-card__status skin-card__status--error">
                                            {lookError}
                                          </div>
                                        ) : null}
                                        <div className="skin-card__glow" aria-hidden="true" />
                                        <div
                                          className="skin-card__preview"
                                          role="group"
                                          aria-label={previewDirectionDescription}
                                          title={t("identity.preview.direction.hint")}
                                          tabIndex={0}
                                          onPointerDown={handleDirectionPointerDown}
                                          onPointerMove={handleDirectionPointerMove}
                                          onPointerUp={handleDirectionPointerUp}
                                          onPointerCancel={handleDirectionPointerCancel}
                                          onKeyDown={handleDirectionKeyDown}
                                        >
                                          {showComparison ? (
                                            <SkinCardPreviewComparison
                                              withSrc={previewSrc}
                                              withoutSrc={noStuffSrc}
                                              withAlt={previewAlt}
                                              withoutAlt={noStuffAlt}
                                              sliderLabel={comparisonSliderLabel}
                                              withLabel={stuffLabel}
                                              withoutLabel={noStuffLabel}
                                              onWithError={() =>
                                                handleLookPreviewError(
                                                  proposal.lookBaseKey,
                                                  activeDirectionValue
                                                )
                                              }
                                              onWithoutError={
                                                proposal.lookBaseKeyNoStuff
                                                  ? () =>
                                                      handleLookPreviewError(
                                                        proposal.lookBaseKeyNoStuff,
                                                        activeDirectionValue
                                                      )
                                                  : undefined
                                              }
                                            />
                                          ) : previewSrc ? (
                                            <img
                                              src={previewSrc}
                                              alt={previewAlt}
                                              loading="lazy"
                                              className="skin-card__preview-image skin-card__preview-image--standalone"
                                              onError={() =>
                                                handleLookPreviewError(proposal.lookBaseKey, activeDirectionValue)
                                              }
                                              draggable={false}
                                            />
                                          ) : heroSrc ? (
                                            <div
                                              className={`skin-card__hero-stage${lookLoading ? " is-loading" : ""}`}
                                            >
                                              <img
                                                src={heroSrc}
                                                alt={`Aperçu principal de la proposition ${proposal.index + 1}`}
                                                loading="lazy"
                                                className="skin-card__hero"
                                                draggable={false}
                                              />
                                            </div>
                                          ) : (
                                            <div className="skin-card__placeholder" aria-hidden="true">
                                              Aperçu indisponible
                                            </div>
                                          )}
                                          {activeDirectionOption ? (
                                            <div className="skin-card__direction-overlay" aria-hidden="true">
                                              <span className="skin-card__direction-label">
                                                {activeDirectionLabel}
                                              </span>
                                              <svg
                                                className="skin-card__direction-indicator"
                                                viewBox="0 0 20 20"
                                                fill="none"
                                                xmlns="http://www.w3.org/2000/svg"
                                                focusable="false"
                                                style={{
                                                  transform: `rotate(${activeDirectionOption.rotation}deg)`,
                                                }}
                                              >
                                                <path
                                                  d="M10 3.5 10 16.5"
                                                  stroke="currentColor"
                                                  strokeWidth="1.6"
                                                  strokeLinecap="round"
                                                />
                                                <path
                                                  d="M6.2 7.3 10 3.5l3.8 3.8"
                                                  stroke="currentColor"
                                                  strokeWidth="1.6"
                                                  strokeLinecap="round"
                                                  strokeLinejoin="round"
                                                />
                                              </svg>
                                            </div>
                                          ) : null}
                                        </div>
                                      </div>
                                      {showDetails ? (
                                        <ul className="skin-card__equipment" role="list">
                                      {proposal.items.map((item) => {
                                        const slotLabelKey = ITEM_TYPE_LABEL_KEYS[item.slotType];
                                        const slotLabel = slotLabelKey ? t(slotLabelKey) : item.slotType;
                                        const itemName = item.name ?? slotLabel;
                                        const altText = t("suggestions.render.itemAlt", {
                                          name: item.name ?? slotLabel,
                                        });
                                        const rerollDisabled =
                                          (recommendations?.[item.slotType]?.length ?? 0) <= 1 ||
                                          Boolean(selectedItemsBySlot?.[item.slotType]);
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
                                      ) : null}
                                  </div>
                                  {showDetails ? (
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
                                            (recommendations?.[item.slotType]?.length ?? 0) <= 1 ||
                                            Boolean(selectedItemsBySlot?.[item.slotType]);
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
                                            disabled={isDownloadingPreview}
                                            aria-busy={isDownloadingPreview}
                                            title={downloadCtaLabel}
                                            aria-label={downloadCtaLabel}
                                          >
                                            <span className="skin-card__cta-icon" aria-hidden="true">
                                              <img src="/icons/download.svg" alt="" />
                                            </span>
                                            <span className="sr-only">{downloadCtaLabel}</span>
                                          </button>
                                        ) : lookLoading ? (
                                          <button
                                            type="button"
                                            className="skin-card__cta skin-card__cta--disabled"
                                            disabled
                                            aria-busy="true"
                                            title={t("suggestions.render.loading")}
                                            aria-label={t("suggestions.render.loading")}
                                          >
                                            <span className="skin-card__cta-icon" aria-hidden="true">
                                              <img src="/icons/download.svg" alt="" />
                                            </span>
                                            <span className="sr-only">{t("suggestions.render.loading")}</span>
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            className="skin-card__cta skin-card__cta--disabled"
                                            disabled
                                            title={t("suggestions.render.unavailable")}
                                            aria-label={t("suggestions.render.unavailable")}
                                          >
                                            <span className="skin-card__cta-icon" aria-hidden="true">
                                              <img src="/icons/download.svg" alt="" />
                                            </span>
                                            <span className="sr-only">{t("suggestions.render.unavailable")}</span>
                                          </button>
                                        )}
                                        {proposal.barbofusLink ? (
                                          <a
                                            href={proposal.barbofusLink}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="skin-card__cta"
                                            title={barbofusCtaLabel}
                                            aria-label={barbofusCtaLabel}
                                          >
                                            <span className="skin-card__cta-icon" aria-hidden="true">
                                              <img src="/icons/barbofus.svg" alt="" />
                                            </span>
                                            <span className="sr-only">{barbofusCtaLabel}</span>
                                          </a>
                                        ) : (
                                          <span className="skin-card__cta skin-card__cta--disabled">
                                            {t("suggestions.render.linkUnavailable")}
                                          </span>
                                        )}
                                        {proposal.souffLink ? (
                                          <a
                                            href={proposal.souffLink}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="skin-card__cta"
                                            title={souffCtaLabel}
                                            aria-label={souffCtaLabel}
                                          >
                                            <span className="skin-card__cta-icon" aria-hidden="true">
                                              <img src="/icons/souff.svg" alt="" />
                                            </span>
                                            <span className="sr-only">{souffCtaLabel}</span>
                                          </a>
                                        ) : (
                                          <span className="skin-card__cta skin-card__cta--disabled">
                                            {souffUnavailableLabel}
                                          </span>
                                        )}
                                        {canCopySkinImage ? (
                                          <button
                                            type="button"
                                            className="skin-card__cta"
                                            onClick={() => handleCopyPreview(proposal)}
                                            title={copySkinCtaLabel}
                                            aria-label={copySkinCtaLabel}
                                            disabled={isCopyingPreview}
                                            aria-busy={isCopyingPreview}
                                          >
                                            <span className="skin-card__cta-icon" aria-hidden="true">
                                              <img src="/icons/copy.svg" alt="" />
                                            </span>
                                            <span className="sr-only">{copySkinCtaLabel}</span>
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            className="skin-card__cta skin-card__cta--disabled"
                                            disabled
                                            title={copySkinUnavailableLabel}
                                            aria-label={copySkinUnavailableLabel}
                                          >
                                            <span className="skin-card__cta-icon" aria-hidden="true">
                                              <img src="/icons/copy.svg" alt="" />
                                            </span>
                                            <span className="sr-only">{copySkinUnavailableLabel}</span>
                                          </button>
                                        )}
                                        {lookLoaded ? (
                                          <button
                                            type="button"
                                            className="skin-card__cta"
                                            onClick={() => handleExportRecap(proposal)}
                                            title={recapCtaLabel}
                                            aria-label={recapCtaLabel}
                                            disabled={isExportingRecap}
                                            aria-busy={isExportingRecap}
                                          >
                                            <span className="skin-card__cta-icon" aria-hidden="true">
                                              <img src="/icons/download.svg" alt="" />
                                            </span>
                                            <span className="sr-only">{recapCtaLabel}</span>
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            className="skin-card__cta skin-card__cta--disabled"
                                            disabled
                                            title={recapUnavailableLabel}
                                            aria-label={recapUnavailableLabel}
                                          >
                                            <span className="skin-card__cta-icon" aria-hidden="true">
                                              <img src="/icons/download.svg" alt="" />
                                            </span>
                                            <span className="sr-only">{recapUnavailableLabel}</span>
                                          </button>
                                        )}
                                        {canShareSkin ? (
                                          <button
                                            type="button"
                                            className="skin-card__cta"
                                            onClick={() => handleShareSkin(proposal)}
                                            title={shareCtaLabel}
                                            aria-label={shareCtaLabel}
                                          >
                                            <span className="skin-card__cta-icon" aria-hidden="true">
                                              <img src="/icons/share.svg" alt="" />
                                            </span>
                                            <span className="sr-only">{shareCtaLabel}</span>
                                          </button>
                                        ) : (
                                          <span className="skin-card__cta skin-card__cta--disabled">
                                            {t("suggestions.render.shareUnavailable")}
                                          </span>
                                        )}
                                      </div>
                                </div>
                                ) : (
                                  <div className="skin-card__details skin-card__details--compact">
                                    <div className="skin-card__compact-meta">
                                      {isInspirationLayout && inspirationIdentityLabel ? (
                                        <p className="skin-card__identity-summary">{inspirationIdentityLabel}</p>
                                      ) : null}
                                      <button
                                        type="button"
                                        className="skin-card__cta skin-card__cta--primary"
                                        onClick={() => setModalProposalId(proposal.id)}
                                      >
                                          {openDetailsLabel}
                                        </button>
                                    </div>
                                  </div>
                                )}
                                </div>
                                    </article>
                                  );
                                })}
                        </div>
                      </div>
                        {!isGridLayout ? (
                          <div className="skin-carousel__pagination">
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
                            <div className="skin-carousel__indicator">
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
                            </div>
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
                        ) : null}
                    </div>
                    <button
                      type="button"
                      className={`suggestions__panel-toggle skin-carousel__panel-toggle${
                        showDetailedMatches ? " is-open" : ""
                      }`}
                      onClick={toggleDetailedMatches}
                      aria-expanded={showDetailedMatches}
                      aria-label={
                        showDetailedMatches
                          ? t("aria.panelToggleClose")
                          : t("aria.panelToggleOpen")
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
                                {items.map(({ item }) => {
                                  const hasPalette = item.palette.length > 0;
                                  const paletteFromImage = item.paletteSource === "image" && hasPalette;
                                  const notes = [];
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
                                  const lockedSelection = selectedItemsBySlot?.[type];
                                  const isLocked = Boolean(lockedSelection) &&
                                    ((lockedSelection?.id && item.id === lockedSelection.id) ||
                                      (Number.isFinite(lockedSelection?.ankamaId) &&
                                        Number.isFinite(item.ankamaId) &&
                                        lockedSelection.ankamaId === item.ankamaId));
                                  const cardClasses = ["suggestions__card"];
                                  if (isLocked) {
                                    cardClasses.push("suggestions__card--locked");
                                  }

                                  return (
                                    <li key={item.id} className={cardClasses.join(" ")}>
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
                                          {isLocked ? (
                                            <span className="suggestions__badge suggestions__badge--locked">
                                              {t("items.selector.lockedBadge")}
                                            </span>
                                          ) : null}
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
                {isInspirationLayout && modalProposalId ? (
                  <button
                    type="button"
                    className="skin-modal__backdrop"
                    onClick={() => setModalProposalId(null)}
                    aria-label={typeof t("aria.close") === "string" ? t("aria.close") : "Fermer"}
                  >
                    <span className="sr-only">{typeof t("aria.close") === "string" ? t("aria.close") : "Fermer"}</span>
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
          </div>
          {!isInspirationLayout ? (
            <section className={filtersPanelClassName}>
              {renderFiltersGroup()}
              {renderPreviewGroup()}
            </section>
          ) : null}
        </section>

          
        </div>
      </main>
    </>
  );
}

async function loadPreviewBackgroundsFromDisk() {
  try {
    const path = await import("path");
    const { readdir } = await import("fs/promises");
    const backgroundsDir = path.join(process.cwd(), "public", "backgrounds");
    const entries = await readdir(backgroundsDir, { withFileTypes: true }).catch(() => []);

    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    const seen = new Set();
    const items = entries
      .filter((entry) => {
        if (!entry) {
          return false;
        }
        if (typeof entry.isFile === "function") {
          return entry.isFile() && typeof entry.name === "string" && entry.name.toLowerCase().endsWith(".png");
        }
        if (typeof entry === "string") {
          return entry.toLowerCase().endsWith(".png");
        }
        return false;
      })
      .map((entry, index) => {
        const fileName = typeof entry === "string" ? entry : entry.name;
        const label = humanizeBackgroundName(fileName) || fileName.replace(/\.png$/i, "") || `Background ${
          index + 1
        }`;
        const baseSlug = slugify(label) || slugify(fileName) || `background-${index + 1}`;
        let id = baseSlug || `background-${index + 1}`;
        let attempt = 1;
        while (seen.has(id)) {
          id = `${baseSlug}-${attempt}`;
          attempt += 1;
        }
        seen.add(id);
        return {
          id,
          label,
          src: `/backgrounds/${fileName}`,
        };
      })
      .filter((entry) => entry?.id && entry?.src);

    return items.sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  } catch (error) {
    console.error("Unable to load preview backgrounds:", error);
    return [];
  }
}

export async function getStaticProps() {
  const previewBackgrounds = await loadPreviewBackgroundsFromDisk();
  try {
    if (typeof fetch !== "function") {
      return {
        props: { initialBreeds: [BARBOFUS_DEFAULT_BREED], previewBackgrounds },
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
        previewBackgrounds,
      },
      revalidate: 3600,
    };
  } catch (error) {
    console.error("Unable to prefetch Dofus breeds:", error);
    return {
      props: { initialBreeds: [BARBOFUS_DEFAULT_BREED], previewBackgrounds },
      revalidate: 3600,
    };
  }
}