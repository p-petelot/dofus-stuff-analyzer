import type { Lab } from "../types";
import { deltaE2000 } from "../colors/palette";

export function clampHue(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function hexToRgb(hex: string): [number, number, number] {
  const sanitized = hex.replace(/[^0-9a-fA-F]/g, "");
  if (sanitized.length !== 6) {
    return [128, 128, 128];
  }
  const r = parseInt(sanitized.slice(0, 2), 16);
  const g = parseInt(sanitized.slice(2, 4), 16);
  const b = parseInt(sanitized.slice(4, 6), 16);
  return [r, g, b];
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function rgbToHue(r: number, g: number, b: number): number {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;
  if (delta === 0) {
    return 0;
  }
  let hue = 0;
  switch (max) {
    case rf:
      hue = ((gf - bf) / delta) % 6;
      break;
    case gf:
      hue = (bf - rf) / delta + 2;
      break;
    default:
      hue = (rf - gf) / delta + 4;
      break;
  }
  hue *= 60;
  if (hue < 0) hue += 360;
  return hue;
}

export function paletteToHues(palette: string[]): number[] {
  if (!Array.isArray(palette) || palette.length === 0) {
    return [0];
  }
  return palette.map((hex) => {
    const [r, g, b] = hexToRgb(hex);
    return clampHue(rgbToHue(r, g, b));
  });
}

export function hslToHex(h: number, s: number, l: number): string {
  const hue = clampHue(h) / 360;
  const satur = clamp01(s);
  const light = clamp01(l);
  const q = light < 0.5 ? light * (1 + satur) : light + satur - light * satur;
  const p = 2 * light - q;
  const convert = (t: number): string => {
    let temp = t;
    if (temp < 0) temp += 1;
    if (temp > 1) temp -= 1;
    if (temp < 1 / 6) return Math.round((p + (q - p) * 6 * temp) * 255).toString(16).padStart(2, "0");
    if (temp < 1 / 2) return Math.round(q * 255).toString(16).padStart(2, "0");
    if (temp < 2 / 3) return Math.round((p + (q - p) * (2 / 3 - temp) * 6) * 255).toString(16).padStart(2, "0");
    return Math.round(p * 255).toString(16).padStart(2, "0");
  };
  const r = convert(hue + 1 / 3);
  const g = convert(hue);
  const b = convert(hue - 1 / 3);
  return `#${r}${g}${b}`.toUpperCase();
}

export function hexToLab(hex: string): Lab {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const srgb = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const [R, G, B] = srgb;
  const X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  const refX = 0.95047;
  const refY = 1;
  const refZ = 1.08883;
  const xyz = [X / refX, Y / refY, Z / refZ].map((value) =>
    value > 0.008856 ? Math.pow(value, 1 / 3) : 7.787 * value + 16 / 116,
  );
  const [fx, fy, fz] = xyz;
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labDelta(hexA: string, hexB: string): number {
  return deltaE2000(hexToLab(hexA), hexToLab(hexB));
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;
  let hue = 0;
  if (delta !== 0) {
    switch (max) {
      case rf:
        hue = ((gf - bf) / delta) % 6;
        break;
      case gf:
        hue = (bf - rf) / delta + 2;
        break;
      default:
        hue = (rf - gf) / delta + 4;
        break;
    }
    hue *= 60;
    if (hue < 0) {
      hue += 360;
    }
  }
  const light = (max + min) / 2;
  let satur = 0;
  if (delta !== 0) {
    satur = light > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  }
  return { h: clampHue(hue), s: clamp01(satur), l: clamp01(light) };
}

export function hexToHsl(hex: string): Hsl {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function shiftHexColor(hex: string, deltaH = 0, deltaS = 0, deltaL = 0): string {
  const { h, s, l } = hexToHsl(hex);
  const nextH = clampHue(h + deltaH);
  const nextS = clamp01(s + deltaS);
  const nextL = clamp01(l + deltaL);
  return hslToHex(nextH, nextS, nextL);
}
