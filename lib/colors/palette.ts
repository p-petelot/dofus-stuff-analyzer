import { MAX_DELTA_E } from "../config/suggestions";
import {
  DofusPalette,
  FourSlot,
  ImageDataLike,
  Lab,
  Mask,
  Palette,
  PaletteSwatch,
} from "../types";

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function pivotRgb(component: number): number {
  const c = component / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function rgbToXyz(r: number, g: number, b: number): { x: number; y: number; z: number } {
  const rr = pivotRgb(r) * 100;
  const gg = pivotRgb(g) * 100;
  const bb = pivotRgb(b) * 100;
  return {
    x: rr * 0.4124 + gg * 0.3576 + bb * 0.1805,
    y: rr * 0.2126 + gg * 0.7152 + bb * 0.0722,
    z: rr * 0.0193 + gg * 0.1192 + bb * 0.9505,
  };
}

function pivotXyz(component: number): number {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  return component > epsilon ? Math.cbrt(component) : (kappa * component + 16) / 116;
}

function xyzToLab(x: number, y: number, z: number): Lab {
  const refX = 95.047;
  const refY = 100.0;
  const refZ = 108.883;

  const fx = pivotXyz(x / refX);
  const fy = pivotXyz(y / refY);
  const fz = pivotXyz(z / refZ);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function rgbToLab(r: number, g: number, b: number): Lab {
  const { x, y, z } = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

function ensureMaskMatch(masks?: Partial<Record<FourSlot, Mask>>): (x: number, y: number) => boolean {
  if (!masks) {
    return () => true;
  }
  const entries = Object.values(masks).filter(Boolean) as Mask[];
  if (!entries.length) {
    return () => true;
  }
  return (x: number, y: number) => {
    for (const mask of entries) {
      if (x >= mask.width || y >= mask.height) {
        continue;
      }
      const idx = y * mask.width + x;
      if (mask.data[idx] > 0) {
        return true;
      }
    }
    return false;
  };
}

function buildBuckets(img: ImageDataLike, predicate: (x: number, y: number) => boolean) {
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  const { width, height, data } = img;
  const stride = Math.max(1, Math.floor((width * height) / 4096));

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      if (!predicate(x, y)) {
        continue;
      }
      const index = (y * width + x) * 4;
      const alpha = data[index + 3];
      if (alpha < 32) {
        continue;
      }
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const key = `${Math.round(r / 32)}-${Math.round(g / 32)}-${Math.round(b / 32)}`;
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
  }

  return { buckets };
}

function finalizePalette(buckets: Map<string, { r: number; g: number; b: number; count: number }>): PaletteSwatch[] {
  const swatches: PaletteSwatch[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.count === 0) continue;
    const r = bucket.r / bucket.count;
    const g = bucket.g / bucket.count;
    const b = bucket.b / bucket.count;
    const lab = rgbToLab(r, g, b);
    swatches.push({
      hex: rgbToHex(r, g, b),
      lab,
      weight: bucket.count,
    });
  }
  swatches.sort((a, b) => b.weight - a.weight);
  return swatches.slice(0, 6);
}

export function extractPaletteLAB(
  img: ImageDataLike,
  masks?: Partial<Record<FourSlot, Mask>>,
): Palette {
  const predicate = ensureMaskMatch(masks);
  const { buckets } = buildBuckets(img, predicate);
  return { swatches: finalizePalette(buckets) };
}

function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function deltaE2000(c1: Lab, c2: Lab): number {
  const deg360 = degreesToRadians(360);
  const deg180 = degreesToRadians(180);
  const kL = 1;
  const kC = 1;
  const kH = 1;

  const c1Value = Math.sqrt(c1.a * c1.a + c1.b * c1.b);
  const c2Value = Math.sqrt(c2.a * c2.a + c2.b * c2.b);
  const meanC = (c1Value + c2Value) / 2;
  const g = 0.5 * (1 - Math.sqrt(Math.pow(meanC, 7) / (Math.pow(meanC, 7) + Math.pow(25, 7))));
  const a1Prime = (1 + g) * c1.a;
  const a2Prime = (1 + g) * c2.a;
  const c1Prime = Math.sqrt(a1Prime * a1Prime + c1.b * c1.b);
  const c2Prime = Math.sqrt(a2Prime * a2Prime + c2.b * c2.b);
  const meanCPrime = (c1Prime + c2Prime) / 2;

  const h1Prime = Math.atan2(c1.b, a1Prime) + (Math.atan2(c1.b, a1Prime) < 0 ? deg360 : 0);
  const h2Prime = Math.atan2(c2.b, a2Prime) + (Math.atan2(c2.b, a2Prime) < 0 ? deg360 : 0);

  let deltaHPrime = h2Prime - h1Prime;
  if (deltaHPrime > deg180) deltaHPrime -= deg360;
  if (deltaHPrime < -deg180) deltaHPrime += deg360;
  const deltaLPrime = c2.L - c1.L;
  const deltaCPrime = c2Prime - c1Prime;
  const deltaH = 2 * Math.sqrt(c1Prime * c2Prime) * Math.sin(deltaHPrime / 2);

  const meanLPrime = (c1.L + c2.L) / 2;
  const meanHPrime =
    Math.abs(h1Prime - h2Prime) > deg180
      ? (h1Prime + h2Prime + deg360) / 2
      : (h1Prime + h2Prime) / 2;

  const t =
    1 -
    0.17 * Math.cos(meanHPrime - degreesToRadians(30)) +
    0.24 * Math.cos(2 * meanHPrime) +
    0.32 * Math.cos(3 * meanHPrime + degreesToRadians(6)) -
    0.2 * Math.cos(4 * meanHPrime - degreesToRadians(63));

  const deltaTheta = degreesToRadians(30) * Math.exp(-Math.pow((meanHPrime - degreesToRadians(275)) / degreesToRadians(25), 2));
  const rC = 2 * Math.sqrt(Math.pow(meanCPrime, 7) / (Math.pow(meanCPrime, 7) + Math.pow(25, 7)));
  const sL = 1 + (0.015 * Math.pow(meanLPrime - 50, 2)) / Math.sqrt(20 + Math.pow(meanLPrime - 50, 2));
  const sC = 1 + 0.045 * meanCPrime;
  const sH = 1 + 0.015 * meanCPrime * t;
  const rT = -Math.sin(2 * deltaTheta) * rC;

  const deltaE = Math.sqrt(
    Math.pow(deltaLPrime / (kL * sL), 2) +
      Math.pow(deltaCPrime / (kC * sC), 2) +
      Math.pow(deltaH / (kH * sH), 2) +
      rT * (deltaCPrime / (kC * sC)) * (deltaH / (kH * sH)),
  );

  return Number.isFinite(deltaE) ? Math.max(0, deltaE) : MAX_DELTA_E;
}

function ensureColor(hex?: string): string {
  if (!hex) {
    return "#777777";
  }
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return "#777777";
  }
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

export function snapToDofusPalette(palette: Palette): DofusPalette {
  const swatches = [...palette.swatches].sort((a, b) => b.weight - a.weight);
  const primary = ensureColor(swatches[0]?.hex);
  const secondary = ensureColor(swatches[1]?.hex ?? swatches[0]?.hex);
  const tertiary = ensureColor(swatches[2]?.hex ?? swatches[1]?.hex ?? swatches[0]?.hex);
  return { primary, secondary, tertiary };
}
