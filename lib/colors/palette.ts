import { ROI, SLOTS } from "../config/suggestions";
import {
  deltaE2000,
  hexToLab,
  rgbToLab,
} from "./colorEngine";
import type {
  BoundingBox,
  DofusPalette,
  ImageDataLike,
  Lab,
  Mask,
  Palette,
  SlotKey,
} from "../types";

const DOFUS_HEX = [
  "#F5D142",
  "#A1D25A",
  "#57B8FF",
  "#FF7A5A",
  "#E0A0FF",
  "#3C3C3C",
  "#F2F2F2",
  "#D66BFF",
  "#F9A602",
  "#6AD1E3",
  "#F1628B",
  "#9E7A4F",
];

interface LabAccumulator {
  count: number;
  L: number;
  a: number;
  b: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function valueSaturation(r: number, g: number, b: number): { value: number; saturation: number } {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const value = max;
  const saturation = max === 0 ? 0 : (max - min) / max;
  return { value, saturation };
}

function accumulateLab(acc: Map<string, LabAccumulator>, lab: Lab): void {
  const key = `${Math.round(lab.L / 10)}_${Math.round(lab.a / 20)}_${Math.round(lab.b / 20)}`;
  const bucket = acc.get(key);
  if (bucket) {
    bucket.count += 1;
    bucket.L += lab.L;
    bucket.a += lab.a;
    bucket.b += lab.b;
  } else {
    acc.set(key, { count: 1, L: lab.L, a: lab.a, b: lab.b });
  }
}

function bucketsToPalette(buckets: Map<string, LabAccumulator>): Palette {
  const sorted = Array.from(buckets.values()).sort((a, b) => b.count - a.count);
  const ensureLab = (entry?: LabAccumulator): Lab => {
    if (!entry || entry.count === 0) {
      return { L: 60, a: 0, b: 0 };
    }
    return { L: entry.L / entry.count, a: entry.a / entry.count, b: entry.b / entry.count };
  };
  return {
    primary: ensureLab(sorted[0]),
    secondary: ensureLab(sorted[1] ?? sorted[0]),
    tertiary: ensureLab(sorted[2] ?? sorted[0]),
  };
}

function collectLabs(
  img: ImageDataLike,
  mask: Mask,
  filter: (x: number, y: number) => boolean,
): Map<string, LabAccumulator> {
  const acc = new Map<string, LabAccumulator>();
  for (let y = 0; y < img.height; y += 1) {
    for (let x = 0; x < img.width; x += 1) {
      if (!filter(x, y)) continue;
      const idx = y * img.width + x;
      if (mask[idx] === 0) continue;
      const offset = idx * 4;
      const r = img.data[offset];
      const g = img.data[offset + 1];
      const b = img.data[offset + 2];
      const { value, saturation } = valueSaturation(r, g, b);
      if (value < 0.15 || saturation < 0.1) continue;
      const lab = rgbToLab(r, g, b);
      accumulateLab(acc, lab);
    }
  }
  if (acc.size === 0) {
    accumulateLab(acc, { L: 60, a: 0, b: 0 });
  }
  return acc;
}

/** Extract a LAB palette for the whole normalized image. */
export function extractPaletteLABGlobal(img512: ImageDataLike, mask: Mask): Palette {
  const buckets = collectLabs(img512, mask, () => true);
  return bucketsToPalette(buckets);
}

function bboxFilter(box: BoundingBox, width: number, height: number, x: number, y: number): boolean {
  return x >= Math.floor(box.x) &&
    x < Math.ceil(box.x + box.w) &&
    y >= Math.floor(box.y) &&
    y < Math.ceil(box.y + box.h) &&
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height;
}

/** Extract LAB palettes for each ROI slot individually. */
export function extractPaletteLABBySlot(
  img512: ImageDataLike,
  boxes: Record<SlotKey, BoundingBox>,
  mask: Mask,
): Record<SlotKey, Palette> {
  const result = {} as Record<SlotKey, Palette>;
  for (const slot of SLOTS) {
    const box = boxes[slot] ?? {
      x: ROI[slot].x * img512.width,
      y: ROI[slot].y * img512.height,
      w: ROI[slot].w * img512.width,
      h: ROI[slot].h * img512.height,
    };
    const buckets = collectLabs(img512, mask, (x, y) => bboxFilter(box, img512.width, img512.height, x, y));
    result[slot] = bucketsToPalette(buckets);
  }
  return result;
}

const DOFUS_LAB = DOFUS_HEX.map((hex) => ({ hex, lab: hexToLab(hex) }));

function nearestDofusColour(lab: Lab): string {
  let best = DOFUS_LAB[0].hex;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const entry of DOFUS_LAB) {
    const delta = deltaE2000(lab, entry.lab);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = entry.hex;
    }
  }
  return best;
}

function paletteToDofus(palette: Palette): DofusPalette {
  return {
    primary: nearestDofusColour(palette.primary),
    secondary: nearestDofusColour(palette.secondary),
    tertiary: nearestDofusColour(palette.tertiary),
  };
}

/** Snap a global palette to the nearest colours of the curated Dofus palette. */
export function snapToDofusPalette(palette: Palette): DofusPalette;
/** Snap per-slot palettes to the curated Dofus palette. */
export function snapToDofusPalette(palette: Record<SlotKey, Palette>): Record<SlotKey, DofusPalette>;
export function snapToDofusPalette(
  palette: Palette | Record<SlotKey, Palette>,
): DofusPalette | Record<SlotKey, DofusPalette> {
  if ("primary" in palette) {
    return paletteToDofus(palette);
  }
  const result = {} as Record<SlotKey, DofusPalette>;
  for (const slot of SLOTS) {
    result[slot] = paletteToDofus(palette[slot]);
  }
  return result;
}

export { deltaE2000 } from "./colorEngine";
