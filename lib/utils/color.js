/**
 * Utility helpers related to color manipulation and palette generation.
 *
 * The module centralizes low level helpers that were previously in the main
 * page component. Splitting them out keeps the UI file readable while making
 * the pure functions easier to test in isolation.
 */

export const MAX_ITEM_PALETTE_COLORS = 6;

/**
 * Normalizes a color value into a hexadecimal representation.
 * Accepts numeric, string or object inputs similar to the Dofus API payloads.
 */
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

/**
 * Converts an RGB triplet to a hexadecimal color string.
 */
export function rgbToHex(r, g, b) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Converts an HSL triplet to its RGB counterpart.
 */
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

/**
 * Converts an RGB color to its HSL representation.
 */
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

/**
 * Converts a hexadecimal color to an RGB triplet.
 */
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

/**
 * Converts a hexadecimal string to its numeric representation when possible.
 */
export function hexToNumeric(hex) {
  const normalized = normalizeColorToHex(hex);
  if (!normalized) {
    return null;
  }
  const numeric = parseInt(normalized.replace(/#/g, ""), 16);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Generates a palette around a seed hexadecimal color, used when the user
 * selects a single color instead of uploading an image.
 */
export function generatePaletteFromSeed(seedHex) {
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
    .slice(0, MAX_ITEM_PALETTE_COLORS);
}

function adjustHsl(base, deltaH = 0, deltaS = 0, deltaL = 0) {
  return {
    h: (base.h + deltaH + 360) % 360,
    s: clamp(base.s + deltaS, 0, 1),
    l: clamp(base.l + deltaL, 0.04, 0.96),
  };
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

/**
 * Returns a gradient that can be used as a vibrant background for a swatch.
 */
export function buildGradientFromHex(hex) {
  const normalized = normalizeColorToHex(hex);
  if (!normalized) {
    return "linear-gradient(135deg, #1F2937, #111827)";
  }
  const darker = adjustHexLightness(normalized, -0.2, -0.08);
  const lighter = adjustHexLightness(normalized, 0.18, -0.12);
  return `linear-gradient(135deg, ${darker}, ${normalized}, ${lighter})`;
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

/**
 * Builds palette variations used to preview equipment on the Barbofus viewer.
 */
export function buildLookPalette(basePalette, variantIndex = 0) {
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

/**
 * Returns the euclidean distance between two RGB colors.
 */
export function colorDistance(colorA, colorB) {
  const dr = colorA.r - colorB.r;
  const dg = colorA.g - colorB.g;
  const db = colorA.b - colorB.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
