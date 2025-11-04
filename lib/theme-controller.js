// Theme controller extracted for shared use across the navbar and legacy pages.
// This is largely duplicated from the existing page implementation so the
// navbar can drive the same theming tokens without rewriting the original page.

export const THEME_KEYS = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
  DOFUS: "dofus",
  INTELLIGENT: "intelligent",
});

export const THEME_STORAGE_KEY = "krospalette.theme";
export const DEFAULT_THEME_KEY = THEME_KEYS.DARK;

export const THEME_OPTIONS = [
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
  "--accent-primary-rgb": "139, 92, 246",
  "--accent-strong-rgb": "124, 58, 237",
  "--accent-soft-rgb": "196, 181, 253",
  "--accent-glow-rgb": "139, 92, 246",
  "--accent-contrast-rgb": "91, 33, 182",
  "--accent-secondary-rgb": "59, 130, 246",
  "--accent-tertiary-rgb": "56, 189, 248",
  "--accent-quaternary-rgb": "14, 165, 233",
  "--accent-indigo-rgb": "99, 102, 241",
  "--accent-sky-rgb": "56, 189, 248",
  "--accent-cool-rgb": "129, 199, 255",
};

const DOFUS_ACCENT_VALUES = {
  "--accent-primary-rgb": "34, 197, 94",
  "--accent-strong-rgb": "21, 128, 61",
  "--accent-soft-rgb": "74, 222, 128",
  "--accent-glow-rgb": "134, 239, 172",
  "--accent-contrast-rgb": "13, 148, 136",
  "--accent-secondary-rgb": "34, 197, 94",
  "--accent-tertiary-rgb": "45, 212, 191",
  "--accent-quaternary-rgb": "16, 185, 129",
  "--accent-indigo-rgb": "16, 185, 129",
  "--accent-sky-rgb": "45, 212, 191",
  "--accent-cool-rgb": "134, 239, 172",
};

function buildSurfaceTokens(values, fallbackValues = DARK_SURFACE_VALUES) {
  const resolved = Array.isArray(values) && values.length === SURFACE_VARIABLES.length
    ? values
    : fallbackValues;

  return SURFACE_VARIABLES.reduce((tokens, variable, index) => {
    const value = resolved[index] ?? fallbackValues[index];
    tokens[variable] = value;
    return tokens;
  }, {});
}

const STATIC_THEME_TOKENS = {
  [THEME_KEYS.DARK]: {
    ...buildSurfaceTokens(DARK_SURFACE_VALUES),
    "--surface-contrast-rgb": "17, 24, 39",
    "--bg": "#050816",
    "--bg-accent": "radial-gradient(circle at top right, rgba(var(--accent-glow-rgb), 0.18), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-sky-rgb), 0.16), transparent 50%), #050816",
    "--card": "rgba(var(--surface-8-rgb), 0.82)",
    "--card-border": "rgba(var(--text-muted-rgb), 0.24)",
    "--text": "#f8fafc",
    "--text-muted": "#94a3b8",
    "--text-rgb": "248, 250, 252",
    "--text-muted-rgb": "148, 163, 184",
    "--text-soft-rgb": "203, 213, 225",
    "--neutral-strong-rgb": "148, 163, 184",
    "--highlight": "#a855f7",
    "--highlight-strong": "#6366f1",
    "--shadow": "0 24px 48px -28px rgba(var(--surface-10-rgb), 0.9)",
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
    "--frost-rgb": "148, 163, 184",
    "--white-rgb": "255, 255, 255",
  },
  [THEME_KEYS.LIGHT]: {
    ...buildSurfaceTokens(LIGHT_SURFACE_VALUES, LIGHT_SURFACE_VALUES),
    "--surface-contrast-rgb": "41, 46, 66",
    "--bg": "#f4f7ff",
    "--bg-accent": "radial-gradient(circle at top right, rgba(var(--accent-primary-rgb), 0.18), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-strong-rgb), 0.12), transparent 50%), #f4f7ff",
    "--card": "rgba(var(--surface-8-rgb), 0.86)",
    "--card-border": "rgba(var(--text-muted-rgb), 0.2)",
    "--text": "#111827",
    "--text-muted": "#4b5563",
    "--text-rgb": "17, 24, 39",
    "--text-muted-rgb": "75, 85, 99",
    "--text-soft-rgb": "100, 116, 139",
    "--neutral-strong-rgb": "82, 90, 112",
    "--highlight": "#a855f7",
    "--highlight-strong": "#6366f1",
    "--shadow": "0 18px 40px -24px rgba(15, 23, 42, 0.28)",
    ...LIGHT_ACCENT_VALUES,
    "--success-rgb": "22, 163, 74",
    "--success-strong-rgb": "34, 197, 94",
    "--success-soft-rgb": "74, 222, 128",
    "--success-pale-rgb": "187, 247, 208",
    "--warning-rgb": "234, 179, 8",
    "--warning-strong-rgb": "250, 204, 21",
    "--warning-soft-rgb": "251, 191, 36",
    "--danger-rgb": "220, 38, 38",
    "--danger-strong-rgb": "248, 113, 113",
    "--danger-dark-rgb": "153, 27, 27",
    "--frost-rgb": "226, 232, 240",
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

export function isValidThemeKey(value) {
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

export function applyThemeToDocument(themeKey, palette) {
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

export function buildIntelligentThemeTokens(palette) {
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
    baseTokens["--surface-contrast-rgb"] =
      accent.contrastRgb ?? surfaceTokens["--surface-7-rgb"] ?? fallback["--surface-contrast-rgb"];
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
  baseTokens["--text-muted"] = textMutedHex ?? fallback["--text-muted"];
  baseTokens["--text-muted-rgb"] = textMutedRgb
    ? `${textMutedRgb.r}, ${textMutedRgb.g}, ${textMutedRgb.b}`
    : fallback["--text-muted-rgb"];
  baseTokens["--text-soft-rgb"] = textSoftRgb
    ? `${textSoftRgb.r}, ${textSoftRgb.g}, ${textSoftRgb.b}`
    : fallback["--text-soft-rgb"];
  baseTokens["--neutral-strong-rgb"] = neutralStrongRgb
    ? `${neutralStrongRgb.r}, ${neutralStrongRgb.g}, ${neutralStrongRgb.b}`
    : fallback["--neutral-strong-rgb"];

  if (accent.primaryRgb) {
    baseTokens["--accent-primary-rgb"] = accent.primaryRgb;
  }
  if (accent.strongRgb) {
    baseTokens["--accent-strong-rgb"] = accent.strongRgb;
  }
  if (accent.softRgb) {
    baseTokens["--accent-soft-rgb"] = accent.softRgb;
  }
  if (accent.glowRgb) {
    baseTokens["--accent-glow-rgb"] = accent.glowRgb;
  }
  if (accent.contrastRgb) {
    baseTokens["--accent-contrast-rgb"] = accent.contrastRgb;
  }
  if (accent.secondaryRgb) {
    baseTokens["--accent-secondary-rgb"] = accent.secondaryRgb;
  }
  if (accent.tertiaryRgb) {
    baseTokens["--accent-tertiary-rgb"] = accent.tertiaryRgb;
  }
  if (accent.quaternaryRgb) {
    baseTokens["--accent-quaternary-rgb"] = accent.quaternaryRgb;
  }
  if (accent.indigoRgb) {
    baseTokens["--accent-indigo-rgb"] = accent.indigoRgb;
  }
  if (accent.skyRgb) {
    baseTokens["--accent-sky-rgb"] = accent.skyRgb;
  }
  if (accent.coolRgb) {
    baseTokens["--accent-cool-rgb"] = accent.coolRgb;
  }

  return baseTokens;
}

export function normalizeColorToHex(color) {
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

function componentToHex(value) {
  const hex = value.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

function rgbToHex(r, g, b) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function hslToRgb(h, s, l) {
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

export function adjustHexLightness(hex, deltaL, deltaS = 0) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const adjusted = {
    h: (hsl.h + 360) % 360,
    s: clamp(hsl.s + deltaS, 0, 1),
    l: clamp(hsl.l + deltaL, 0, 1),
  };
  const { r, g, b } = hslToRgb(adjusted.h, adjusted.s, adjusted.l);
  return rgbToHex(r, g, b);
}

export function hexToRgb(hex) {
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

export function rgbToHsl(r, g, b) {
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

export function loadStoredTheme() {
  if (typeof window === "undefined") {
    return DEFAULT_THEME_KEY;
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return isValidThemeKey(stored) ? stored : DEFAULT_THEME_KEY;
}

export function persistTheme(themeKey) {
  if (typeof window === "undefined") {
    return;
  }
  if (!isValidThemeKey(themeKey)) {
    return;
  }
  window.localStorage.setItem(THEME_STORAGE_KEY, themeKey);
}
