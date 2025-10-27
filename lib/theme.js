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

const VALID_THEME_KEYS = new Set(Object.values(THEME_KEYS));

export function isValidThemeKey(value) {
  return typeof value === "string" && VALID_THEME_KEYS.has(value);
}

const SURFACE_LIGHTNESS_VALUES = [0.04, 0.06, 0.08, 0.1, 0.12, 0.15, 0.18, 0.22, 0.26, 0.3, 0.34];

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function rgbToHex(r, g, b) {
  const toHex = (component) => {
    const clamped = Math.max(0, Math.min(255, Math.round(component)));
    return clamped.toString(16).padStart(2, "0");
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hslToRgb(h, s, l) {
  const hueToRgb = (p, q, t) => {
    let value = t;
    if (value < 0) value += 1;
    if (value > 1) value -= 1;
    if (value < 1 / 6) return p + (q - p) * 6 * value;
    if (value < 1 / 2) return q;
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
    return p;
  };

  let r;
  let g;
  let b;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hueToRgb(p, q, h + 1 / 3);
    g = hueToRgb(p, q, h);
    b = hueToRgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
}

export function rgbToHsl(r, g, b) {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h;
  let s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      default:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return { h, s, l };
}

export function hexToRgb(hex) {
  if (typeof hex !== "string") {
    return null;
  }
  const normalized = hex.trim();
  if (!/^#?[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  const value = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  const bigint = parseInt(value, 16);
  if (!Number.isFinite(bigint)) {
    return null;
  }
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

export function toRgbString(rgb) {
  if (!rgb) {
    return null;
  }
  const { r, g, b } = rgb;
  return `${r}, ${g}, ${b}`;
}

export function withAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
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

export function adjustHexLightness(hex, deltaL, deltaS = 0) {
  const normalized = normalizeColorToHex(hex);
  if (!normalized) {
    return null;
  }

  const rgb = hexToRgb(normalized);
  if (!rgb) {
    return normalized;
  }

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const nextLightness = clamp(hsl.l + deltaL, 0, 1);
  const nextSaturation = clamp(hsl.s + deltaS, 0, 1);
  const { r, g, b } = hslToRgb(hsl.h, nextSaturation, nextLightness);
  return rgbToHex(r, g, b);
}

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
    "--bg-accent":
      "radial-gradient(circle at top right, rgba(var(--accent-glow-rgb), 0.18), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-sky-rgb), 0.16), transparent 50%), #050816",
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
    "--bg-accent":
      "radial-gradient(circle at top right, rgba(var(--accent-cool-rgb), 0.22), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-secondary-rgb), 0.18), transparent 45%), #f4f6fb",
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
    "--bg-accent":
      "radial-gradient(circle at top right, rgba(var(--accent-primary-rgb), 0.2), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-strong-rgb), 0.18), transparent 50%), #04160f",
    "--card": "rgba(var(--surface-8-rgb), 0.84)",
    "--card-border": "rgba(var(--text-muted-rgb), 0.28)",
    "--text": "#f6fff4",
    "--text-muted": "#bdecc5",
    "--text-rgb": "246, 255, 244",
    "--text-muted-rgb": "189, 236, 197",
    "--text-soft-rgb": "215, 246, 220",
    "--neutral-strong-rgb": "87, 117, 104",
    "--highlight": "#22c55e",
    "--highlight-strong": "#16a34a",
    "--shadow": "0 24px 44px -32px rgba(var(--surface-contrast-rgb), 0.85)",
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
    "--frost-rgb": "223, 232, 255",
    "--white-rgb": "255, 255, 255",
  },
};

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

export function createAccentPalette(primaryHex, secondaryHex, tertiaryHex) {
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

export function parseRgbString(value) {
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

export function resolveThemeTokens(themeKey, palette) {
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

  baseTokens["--highlight"] = accent.primaryHex ?? fallback["--highlight"];
  baseTokens["--highlight-strong"] = accent.strongHex ?? adjustHexLightness(baseHex, 0.18, -0.08);
  baseTokens["--shadow"] = shadowSurface
    ? `0 26px 48px -34px rgba(${shadowSurface.rgb}, 0.78)`
    : fallback["--shadow"];

  return baseTokens;
}

export { STATIC_THEME_TOKENS };
