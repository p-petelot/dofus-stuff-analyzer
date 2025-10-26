import { ROI, SLOTS } from "../config/suggestions";
import type {
  BoundingBox,
  DofusColorSlots,
  DofusPalette,
  ImageDataLike,
  Lab,
  Mask,
  Palette,
  SlotKey,
  VisualZoneKey,
  ColorSlotKey,
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

const VISUAL_ZONE_KEYS: VisualZoneKey[] = ["hair", "skin", "outfit", "accent"];

const ZONE_BOUNDS: Record<Exclude<VisualZoneKey, "accent">, { yMin: number; yMax: number }> = {
  hair: { yMin: 0, yMax: 0.25 },
  skin: { yMin: 0.25, yMax: 0.48 },
  outfit: { yMin: 0.5, yMax: 0.75 },
};

const ACCENT_DELTA_THRESHOLD = 8;

const FALLBACK_LAB: Lab = { L: 60, a: 0, b: 0 };

function reorderOutfitPalette(palette: Palette): Palette {
  const unique: Lab[] = [];
  for (const lab of [palette.primary, palette.secondary, palette.tertiary]) {
    if (!unique.some((entry) => deltaE2000(entry, lab) < 1)) {
      unique.push(lab);
    }
  }
  unique.sort((a, b) => b.b - a.b);
  const primary = unique[0] ?? FALLBACK_LAB;
  const secondary = unique[1] ?? primary;
  const tertiary = unique[2] ?? unique[1] ?? primary;
  return { primary, secondary, tertiary };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rgbToLab(r: number, g: number, b: number): Lab {
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

function hexToLab(hex: string): Lab {
  const [r, g, b] = hex
    .replace("#", "")
    .match(/.{1,2}/g)!
    .map((part) => parseInt(part, 16));
  return rgbToLab(r, g, b);
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

function zoneFilter(
  zone: Exclude<VisualZoneKey, "accent">,
  height: number,
): (x: number, y: number) => boolean {
  const bounds = ZONE_BOUNDS[zone];
  const minY = Math.floor(bounds.yMin * height);
  const maxY = Math.ceil(bounds.yMax * height);
  return (_x: number, y: number) => y >= minY && y < maxY;
}

export function extractVisualZonePalettes(
  img512: ImageDataLike,
  mask: Mask,
): Record<VisualZoneKey, Palette> {
  const globalBuckets = collectLabs(img512, mask, () => true);
  const globalPalette = bucketsToPalette(globalBuckets);

  const zonePalettes = {} as Record<VisualZoneKey, Palette>;

  for (const zone of ["hair", "skin", "outfit"] as const) {
    const buckets = collectLabs(img512, mask, zoneFilter(zone, img512.height));
    const palette = bucketsToPalette(buckets);
    zonePalettes[zone] = zone === "outfit" ? reorderOutfitPalette(palette) : palette;
  }

  const accentCandidates = [
    globalPalette.primary,
    globalPalette.secondary,
    globalPalette.tertiary,
  ];

  const anchorColours = [
    zonePalettes.hair.primary,
    zonePalettes.skin.primary,
    zonePalettes.outfit.primary,
  ];

  const accentLab =
    accentCandidates.find((candidate) =>
      anchorColours.every((anchor) => deltaE2000(candidate, anchor) >= ACCENT_DELTA_THRESHOLD),
    ) ?? zonePalettes.outfit.tertiary ?? globalPalette.tertiary;

  zonePalettes.accent = {
    primary: accentLab,
    secondary: zonePalettes.outfit.secondary,
    tertiary: zonePalettes.outfit.tertiary,
  };

  return zonePalettes;
}

export function snapVisualZonesToDofus(
  zones: Record<VisualZoneKey, Palette>,
): Record<VisualZoneKey, DofusPalette> {
  const result = {} as Record<VisualZoneKey, DofusPalette>;
  for (const zone of VISUAL_ZONE_KEYS) {
    const palette = zones[zone];
    result[zone] = paletteToDofus(palette);
  }
  return result;
}

export function buildDofusColorSlots(zones: Record<VisualZoneKey, DofusPalette>): DofusColorSlots {
  const slots: Record<ColorSlotKey, string> = {
    1: zones.hair.primary,
    2: zones.skin.primary,
    3: zones.outfit.primary,
    4: zones.outfit.secondary ?? zones.outfit.primary,
    5: zones.accent.primary ?? zones.outfit.tertiary ?? zones.outfit.primary,
  };

  const byZone: Record<VisualZoneKey, string> = {
    hair: slots[1],
    skin: slots[2],
    outfit: slots[3],
    accent: slots[5],
  };

  return { slots, byZone };
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

export function paletteToDofus(palette: Palette): DofusPalette {
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

/**
 * Compute the ΔE2000 difference between two Lab colours.
 * Implementation adapted from the CIEDE2000 reference formula.
 */
export function deltaE2000(a: Lab, b: Lab): number {
  const rad2deg = (rad: number) => (180 * rad) / Math.PI;
  const deg2rad = (deg: number) => (Math.PI * deg) / 180;

  const C1 = Math.sqrt(a.a * a.a + a.b * a.b);
  const C2 = Math.sqrt(b.a * b.a + b.b * b.b);
  const avgC = (C1 + C2) / 2;
  const avgC7 = Math.pow(avgC, 7);
  const twentyFive7 = Math.pow(25, 7);
  const G = 0.5 * (1 - Math.sqrt(avgC7 / (avgC7 + twentyFive7)));
  const a1p = (1 + G) * a.a;
  const a2p = (1 + G) * b.a;
  const C1p = Math.sqrt(a1p * a1p + a.b * a.b);
  const C2p = Math.sqrt(a2p * a2p + b.b * b.b);
  const avgCp = (C1p + C2p) / 2;
  const h1p = Math.atan2(a.b, a1p) % (2 * Math.PI);
  const h2p = Math.atan2(b.b, a2p) % (2 * Math.PI);
  const h1 = h1p >= 0 ? h1p : h1p + 2 * Math.PI;
  const h2 = h2p >= 0 ? h2p : h2p + 2 * Math.PI;
  let deltahp = h2 - h1;
  if (Math.abs(deltahp) > Math.PI) {
    deltahp -= Math.sign(deltahp) * 2 * Math.PI;
  }
  const deltaLp = b.L - a.L;
  const deltaCp = C2p - C1p;
  const deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(deltahp / 2);
  const avgLp = (a.L + b.L) / 2;
  const avgHp = Math.abs(h1 - h2) > Math.PI ? (h1 + h2 + 2 * Math.PI) / 2 : (h1 + h2) / 2;
  const T =
    1 -
    0.17 * Math.cos(avgHp - deg2rad(30)) +
    0.24 * Math.cos(2 * avgHp) +
    0.32 * Math.cos(3 * avgHp + deg2rad(6)) -
    0.2 * Math.cos(4 * avgHp - deg2rad(63));
  const deltaTheta = deg2rad(30) * Math.exp(-Math.pow((rad2deg(avgHp) - 275) / 25, 2));
  const avgCp7 = Math.pow(avgCp, 7);
  const Rc = 2 * Math.sqrt(avgCp7 / (avgCp7 + twentyFive7));
  const Sl = 1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const Sc = 1 + 0.045 * avgCp;
  const Sh = 1 + 0.015 * avgCp * T;
  const Rt = -Math.sin(2 * deltaTheta) * Rc;
  return Math.sqrt(
    Math.pow(deltaLp / Sl, 2) +
      Math.pow(deltaCp / Sc, 2) +
      Math.pow(deltaHp / Sh, 2) +
      Rt * (deltaCp / Sc) * (deltaHp / Sh),
  );
}
