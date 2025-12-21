// Utility helpers to normalize and manipulate color values throughout the app.
// Centralizing this logic keeps the page component lighter and easier to follow.

export const MAX_COLORS = 6;

const SURFACE_LIGHTNESS_VALUES = [
  0.04,
  0.06,
  0.08,
  0.1,
  0.12,
  0.15,
  0.18,
  0.22,
  0.26,
  0.3,
  0.34,
];

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function componentToHex(value) {
  const hex = value.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

export function rgbToHex(r, g, b) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
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

export function adjustHsl(base, deltaH = 0, deltaS = 0, deltaL = 0) {
  return {
    h: (base.h + deltaH + 360) % 360,
    s: clamp(base.s + deltaS, 0, 1),
    l: clamp(base.l + deltaL, 0.04, 0.96),
  };
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
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return hex;
  }
  const base = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const adjusted = adjustHsl(base, 0, deltaS, deltaL);
  const { r, g, b } = hslToRgb(adjusted.h, adjusted.s, adjusted.l);
  return rgbToHex(r, g, b);
}

export function withAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function createSurfacePalette(baseHex) {
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

export function toRgbString(rgb) {
  if (!rgb) {
    return null;
  }
  const { r, g, b } = rgb;
  return `${r}, ${g}, ${b}`;
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

export function buildGradientFromHex(hex) {
  const normalized = normalizeColorToHex(hex);
  if (!normalized) {
    return "linear-gradient(135deg, #1F2937, #111827)";
  }
  const darker = adjustHexLightness(normalized, -0.2, -0.08);
  const lighter = adjustHexLightness(normalized, 0.18, -0.12);
  return `linear-gradient(135deg, ${darker}, ${normalized}, ${lighter})`;
}

export function generatePaletteFromSeed(seedHex) {
  const baseHex = normalizeColorToHex(seedHex);
  if (!baseHex) {
    return [];
  }
  const baseRgb = hexToRgb(baseHex);
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

  return [
    {
      hex: baseHex,
      rgb: `rgb(${baseRgb.r}, ${baseRgb.g}, ${baseRgb.b})`,
      r: baseRgb.r,
      g: baseRgb.g,
      b: baseRgb.b,
      weight: 1.6,
    },
    ...variations.map((entry, index) => {
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
    }),
  ]
    .filter((entry) => {
      if (seen.has(entry.hex)) {
        return false;
      }
      seen.add(entry.hex);
      return true;
    })
    .slice(0, MAX_COLORS);
}

