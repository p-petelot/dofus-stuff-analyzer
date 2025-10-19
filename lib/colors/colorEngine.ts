import type { ImageDataLike, Lab, Mask } from "../types";

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface DominantColor {
  hex: string;
  rgb: RGB;
  lab: Lab;
  weight: number;
}

export type HarmonyType = "complementary" | "triad" | "split" | "analogous";

export interface GeneratedPalette {
  type: HarmonyType;
  name: string;
  colors: string[];
}

export type AmbienceKey =
  | "feu"
  | "eau"
  | "air"
  | "terre"
  | "ombre"
  | "lumiere"
  | "neutre";

export interface AmbienceResult {
  theme: AmbienceKey;
  confidence: number;
  scores: Record<AmbienceKey, number>;
  anchors: DominantColor[];
}

const REF_X = 0.95047;
const REF_Y = 1;
const REF_Z = 1.08883;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    const [r, g, b] = clean.split("").map((char) => parseInt(char.repeat(2), 16));
    return { r, g, b };
  }
  const [r, g, b] = clean.match(/.{1,2}/g)?.map((part) => parseInt(part, 16)) ?? [0, 0, 0];
  return { r, g, b };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const srgb = [r, g, b].map((value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const [R, G, B] = srgb;
  const X = R * 0.4124 + G * 0.3576 + B * 0.1805;
  const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const Z = R * 0.0193 + G * 0.1192 + B * 0.9505;
  const xyz = [X / REF_X, Y / REF_Y, Z / REF_Z].map((value) =>
    value > 0.008856 ? Math.pow(value, 1 / 3) : 7.787 * value + 16 / 116,
  );
  const [fx, fy, fz] = xyz;
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function hexToLab(hex: string): Lab {
  const { r, g, b } = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

export function labToRgb(lab: Lab): RGB {
  const fy = (lab.L + 16) / 116;
  const fx = lab.a / 500 + fy;
  const fz = fy - lab.b / 200;

  const xyz = [fx, fy, fz].map((value) => {
    const valueCubed = Math.pow(value, 3);
    return valueCubed > 0.008856 ? valueCubed : (value - 16 / 116) / 7.787;
  });
  const [xr, yr, zr] = xyz;
  const X = xr * REF_X;
  const Y = yr * REF_Y;
  const Z = zr * REF_Z;

  const linearR = X * 3.2406 + Y * -1.5372 + Z * -0.4986;
  const linearG = X * -0.9689 + Y * 1.8758 + Z * 0.0415;
  const linearB = X * 0.0557 + Y * -0.204 + Z * 1.057;

  const convert = (value: number) => {
    const v = clamp(value, 0, 1);
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  };

  return {
    r: Math.round(clamp(convert(linearR) * 255, 0, 255)),
    g: Math.round(clamp(convert(linearG) * 255, 0, 255)),
    b: Math.round(clamp(convert(linearB) * 255, 0, 255)),
  };
}

export function labToHex(lab: Lab): string {
  return rgbToHex(labToRgb(lab));
}

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

function rgbToHsl(rgb: RGB): { h: number; s: number; l: number } {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      default:
        h = ((r - g) / d + 4) * 60;
        break;
    }
  }
  return { h: (h + 360) % 360, s: clamp(s, 0, 1), l: clamp(l, 0, 1) };
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const light = clamp(l, 0, 1);

  if (sat === 0) {
    const value = Math.round(light * 255);
    return { r: value, g: value, b: value };
  }

  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (hue < 60) {
    r = c;
    g = x;
  } else if (hue < 120) {
    r = x;
    g = c;
  } else if (hue < 180) {
    g = c;
    b = x;
  } else if (hue < 240) {
    g = x;
    b = c;
  } else if (hue < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function wrapHue(h: number): number {
  const result = h % 360;
  return result < 0 ? result + 360 : result;
}

function pickInitialCentroids(samples: Lab[], k: number): Lab[] {
  const centroids: Lab[] = [];
  const step = Math.max(1, Math.floor(samples.length / k));
  for (let i = 0; i < k; i += 1) {
    centroids.push(samples[Math.min(i * step, samples.length - 1)]);
  }
  return centroids;
}

function averageLab(values: Lab[]): Lab {
  if (!values.length) {
    return { L: 60, a: 0, b: 0 };
  }
  const total = values.reduce(
    (acc, value) => ({
      L: acc.L + value.L,
      a: acc.a + value.a,
      b: acc.b + value.b,
    }),
    { L: 0, a: 0, b: 0 },
  );
  return { L: total.L / values.length, a: total.a / values.length, b: total.b / values.length };
}

export interface DominantColorOptions {
  k?: number;
  maxIterations?: number;
  sampleStride?: number;
  mask?: Mask;
}

export function extractDominantColors(
  image: ImageDataLike,
  options: DominantColorOptions = {},
): DominantColor[] {
  const { k = 4, maxIterations = 8, sampleStride = 4, mask } = options;
  const clampedK = clamp(Math.round(k), 3, 5);

  const labs: Lab[] = [];

  for (let y = 0; y < image.height; y += sampleStride) {
    for (let x = 0; x < image.width; x += sampleStride) {
      const idx = y * image.width + x;
      const offset = idx * 4;
      if (mask && mask[idx] === 0) continue;
      const r = image.data[offset];
      const g = image.data[offset + 1];
      const b = image.data[offset + 2];
      const alpha = image.data[offset + 3];
      if (alpha < 64) continue;
      const lab = rgbToLab(r, g, b);
      labs.push(lab);
    }
  }

  if (!labs.length) {
    const fallback = { L: 60, a: 0, b: 0 };
    return [
      {
        lab: fallback,
        rgb: labToRgb(fallback),
        hex: labToHex(fallback),
        weight: 1,
      },
    ];
  }

  let centroids = pickInitialCentroids(labs, clampedK);
  const assignments = new Array(labs.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter += 1) {
    let moved = false;
    for (let i = 0; i < labs.length; i += 1) {
      const lab = labs[i];
      let bestIdx = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centroids.length; c += 1) {
        const distance = deltaE2000(lab, centroids[c]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIdx = c;
        }
      }
      if (assignments[i] !== bestIdx) {
        assignments[i] = bestIdx;
        moved = true;
      }
    }

    if (!moved && iter > 0) {
      break;
    }

    const groups: Lab[][] = Array.from({ length: centroids.length }, () => []);
    for (let i = 0; i < labs.length; i += 1) {
      groups[assignments[i]].push(labs[i]);
    }
    centroids = groups.map((group) => (group.length ? averageLab(group) : centroids[0]));
  }

  const counts = Array.from({ length: centroids.length }, () => 0);
  for (const assignment of assignments) {
    counts[assignment] += 1;
  }

  const total = counts.reduce((acc, value) => acc + value, 0) || 1;

  const result: DominantColor[] = centroids.map((lab, index) => {
    const weight = counts[index] / total;
    const rgb = labToRgb(lab);
    return {
      lab,
      rgb,
      hex: labToHex(lab),
      weight,
    };
  });

  return result
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, clampedK);
}

export function buildPalettes(seeds: string[] | DominantColor[]): GeneratedPalette[] {
  const seedList = Array.isArray(seeds)
    ? seeds.map((seed) => (typeof seed === "string" ? seed : seed.hex))
    : [];
  const baseHex = seedList.length ? seedList[0] : "#C8C5BE";
  const baseRgb = hexToRgb(baseHex);
  const baseHsl = rgbToHsl(baseRgb);
  const paletteFactory = (type: HarmonyType, hues: number[], name: string): GeneratedPalette => {
    const colors = hues.map((hue) => {
      const colorRgb = hslToRgb(hue, baseHsl.s === 0 ? 0.35 : baseHsl.s, baseHsl.l);
      return rgbToHex(colorRgb);
    });
    return { type, name, colors: Array.from(new Set(colors)) };
  };

  return [
    paletteFactory("complementary", [baseHsl.h, wrapHue(baseHsl.h + 180)], "Complémentaire"),
    paletteFactory(
      "triad",
      [baseHsl.h, wrapHue(baseHsl.h + 120), wrapHue(baseHsl.h + 240)],
      "Triade",
    ),
    paletteFactory(
      "split",
      [wrapHue(baseHsl.h + 150), baseHsl.h, wrapHue(baseHsl.h - 150)],
      "Complémentaires divisées",
    ),
    paletteFactory(
      "analogous",
      [wrapHue(baseHsl.h - 30), baseHsl.h, wrapHue(baseHsl.h + 30)],
      "Analogues",
    ),
  ];
}

const HUE_THEMES: Array<{ key: Exclude<AmbienceKey, "neutre" | "ombre" | "lumiere">; hue: number; range: number }> = [
  { key: "feu", hue: 20, range: 45 },
  { key: "eau", hue: 200, range: 55 },
  { key: "air", hue: 45, range: 50 },
  { key: "terre", hue: 110, range: 45 },
];

function scoreHue(theme: { hue: number; range: number }, hue: number): number {
  const diff = Math.min(Math.abs(hue - theme.hue), 360 - Math.abs(hue - theme.hue));
  return Math.max(0, 1 - diff / theme.range);
}

export function inferAmbienceFromImage(image: ImageDataLike): AmbienceResult {
  const anchors = extractDominantColors(image, { k: 4 });
  const hues = anchors.map((anchor) => rgbToHsl(anchor.rgb));
  const averageLightness = anchors.reduce((acc, anchor) => acc + anchor.lab.L * anchor.weight, 0);
  const averageSaturation = hues.reduce((acc, entry, index) => acc + entry.s * anchors[index].weight, 0);

  const scores: Record<AmbienceKey, number> = {
    feu: 0,
    eau: 0,
    air: 0,
    terre: 0,
    ombre: 0,
    lumiere: 0,
    neutre: 0,
  };

  if (averageLightness < 28) {
    scores.ombre = 1 - averageLightness / 100;
  }
  if (averageLightness > 70 && averageSaturation < 0.25) {
    scores.lumiere = Math.min(1, (averageLightness - 60) / 40 + (0.3 - averageSaturation));
  }

  for (let i = 0; i < hues.length; i += 1) {
    const { h, s } = hues[i];
    for (const theme of HUE_THEMES) {
      const weight = anchors[i]?.weight ?? 0;
      scores[theme.key] += scoreHue(theme, h) * weight * clamp(s + 0.1, 0, 1);
    }
  }

  scores.neutre = averageSaturation < 0.2 ? 1 - averageSaturation : 0.05;

  const themeEntries = Object.entries(scores) as Array<[AmbienceKey, number]>;
  themeEntries.sort((a, b) => b[1] - a[1]);
  let [bestKey, bestScore] = themeEntries[0];
  if (bestKey === "neutre" && averageSaturation >= 0.25) {
    const alternative = themeEntries.find(([key]) => key !== "neutre");
    if (alternative) {
      [bestKey, bestScore] = alternative;
    }
  }
  const secondScore = themeEntries.find(([key]) => key !== bestKey)?.[1] ?? 0;
  const confidence = clamp(bestScore - secondScore * 0.6, 0, 1);

  return { theme: bestKey, confidence, scores, anchors };
}

export interface MergePalettesOptions {
  maxSize?: number;
  deltaThreshold?: number;
}

export function mergePalettes(
  palettes: GeneratedPalette[],
  options: MergePalettesOptions = {},
): string[] {
  const { maxSize = 8, deltaThreshold = 12 } = options;
  const merged: DominantColor[] = [];

  const threshold = clamp(deltaThreshold, 4, 30);

  for (const palette of palettes) {
    for (const hex of palette.colors) {
      const lab = hexToLab(hex);
      const isFarEnough = merged.every((entry) => deltaE2000(entry.lab, lab) > threshold);
      if (isFarEnough) {
        merged.push({
          hex,
          lab,
          rgb: hexToRgb(hex),
          weight: 1 / maxSize,
        });
      }
      if (merged.length >= maxSize) {
        break;
      }
    }
    if (merged.length >= maxSize) {
      break;
    }
  }

  return merged.map((entry) => entry.hex);
}

