/** @typedef {import("../types").ImageDataLike} ImageDataLike */
/** @typedef {import("../types").Palette} Palette */
/** @typedef {import("../types").Lab} Lab */
/** @typedef {import("../types").Mask} Mask */
/** @typedef {import("../types").FourSlot} FourSlot */

const MAX_DELTA_E = 100;

function rgbToLab(r, g, b) {
  const pivot = (value) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const rr = pivot(r);
  const gg = pivot(g);
  const bb = pivot(b);
  const x = rr * 0.4124 + gg * 0.3576 + bb * 0.1805;
  const y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
  const z = rr * 0.0193 + gg * 0.1192 + bb * 0.9505;
  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;
  const fx = xyzPivot(x / refX);
  const fy = xyzPivot(y / refY);
  const fz = xyzPivot(z / refZ);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function xyzPivot(value) {
  const epsilon = 216 / 24389;
  const kappa = 24389 / 27;
  return value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116;
}

function hexToLab(hex) {
  const normalized = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return { L: 50, a: 0, b: 0 };
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return rgbToLab(r, g, b);
}

function labToHex({ L, a, b }) {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const fx3 = fx ** 3;
  const fy3 = fy ** 3;
  const fz3 = fz ** 3;
  const epsilon = 216 / 24389;
  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;
  const xr = fx3 > epsilon ? fx3 : (116 * fx - 16) / 24389 * 27;
  const yr = fy3 > epsilon ? fy3 : (116 * fy - 16) / 24389 * 27;
  const zr = fz3 > epsilon ? fz3 : (116 * fz - 16) / 24389 * 27;
  const x = xr * refX;
  const y = yr * refY;
  const z = zr * refZ;
  const r = xyzToRgb(3.2406 * x - 1.5372 * y - 0.4986 * z);
  const g = xyzToRgb(-0.9689 * x + 1.8758 * y + 0.0415 * z);
  const bl = xyzToRgb(0.0557 * x - 0.204 * y + 1.057 * z);
  return `#${[r, g, bl]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function xyzToRgb(value) {
  return value <= 0.0031308 ? value * 12.92 * 255 : (1.055 * value ** (1 / 2.4) - 0.055) * 255;
}

function bucketsFromImage(img, predicate) {
  const buckets = new Map();
  const stride = Math.max(1, Math.floor((img.width * img.height) / 4096));
  for (let y = 0; y < img.height; y += stride) {
    for (let x = 0; x < img.width; x += stride) {
      if (!predicate(x, y)) continue;
      const index = (y * img.width + x) * 4;
      if (img.data[index + 3] < 32) continue;
      const r = img.data[index];
      const g = img.data[index + 1];
      const b = img.data[index + 2];
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
  return buckets;
}

function maskPredicate(masks) {
  if (!masks) return () => true;
  const entries = Object.values(masks).filter(Boolean);
  if (!entries.length) return () => true;
  return (x, y) => {
    for (const mask of entries) {
      if (!mask) continue;
      if (x < mask.width && y < mask.height) {
        const idx = y * mask.width + x;
        if (mask.data[idx] > 0) return true;
      }
    }
    return false;
  };
}

function toPalette(buckets) {
  const colors = Array.from(buckets.values())
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({
      r: bucket.r / bucket.count,
      g: bucket.g / bucket.count,
      b: bucket.b / bucket.count,
      weight: bucket.count,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3);
  const entries = colors.length ? colors : [{ r: 200, g: 200, b: 200, weight: 1 }];
  while (entries.length < 3) {
    entries.push(entries[entries.length - 1]);
  }
  const [primary, secondary, tertiary] = entries.map((color) => rgbToLab(color.r, color.g, color.b));
  return { primary, secondary, tertiary };
}

/**
 * Extract a LAB palette from the normalised image using optional slot masks.
 * @param {ImageDataLike} img
 * @param {Partial<Record<FourSlot, Mask>>} [masks]
 * @returns {Palette}
 */
export function extractPaletteLAB(img, masks) {
  const predicate = maskPredicate(masks);
  const buckets = bucketsFromImage(img, predicate);
  return toPalette(buckets);
}

/**
 * Compute the CIE ΔE2000 distance between two LAB colors.
 * @param {Lab} c1
 * @param {Lab} c2
 * @returns {number}
 */
export function deltaE2000(c1, c2) {
  const avgLp = (c1.L + c2.L) / 2;
  const c1ab = Math.sqrt(c1.a * c1.a + c1.b * c1.b);
  const c2ab = Math.sqrt(c2.a * c2.a + c2.b * c2.b);
  const avgC = (c1ab + c2ab) / 2;
  const g = 0.5 * (1 - Math.sqrt(Math.pow(avgC, 7) / (Math.pow(avgC, 7) + Math.pow(25, 7))));
  const a1p = (1 + g) * c1.a;
  const a2p = (1 + g) * c2.a;
  const c1p = Math.sqrt(a1p * a1p + c1.b * c1.b);
  const c2p = Math.sqrt(a2p * a2p + c2.b * c2.b);
  const avgCp = (c1p + c2p) / 2;
  const h1p = Math.atan2(c1.b, a1p) + Math.PI * 2;
  const h2p = Math.atan2(c2.b, a2p) + Math.PI * 2;
  const hpDiff = Math.abs(h1p - h2p);
  const avgHp = hpDiff > Math.PI ? (h1p + h2p + Math.PI * 2) / 2 : (h1p + h2p) / 2;
  const t =
    1 -
    0.17 * Math.cos(avgHp - Math.PI / 6) +
    0.24 * Math.cos(2 * avgHp) +
    0.32 * Math.cos(3 * avgHp + Math.PI / 30) -
    0.2 * Math.cos(4 * avgHp - 63 * (Math.PI / 180));
  const deltaHp =
    hpDiff <= Math.PI
      ? h2p - h1p
      : h2p <= h1p
      ? h2p - h1p + 2 * Math.PI
      : h2p - h1p - 2 * Math.PI;
  const deltaLp = c2.L - c1.L;
  const deltaCp = c2p - c1p;
  const deltaHpPrime = 2 * Math.sqrt(c1p * c2p) * Math.sin(deltaHp / 2);
  const sl = 1 + (0.015 * Math.pow(avgLp - 50, 2)) / Math.sqrt(20 + Math.pow(avgLp - 50, 2));
  const sc = 1 + 0.045 * avgCp;
  const sh = 1 + 0.015 * avgCp * t;
  const deltaTheta =
    30 * (Math.PI / 180) * Math.exp(-(Math.pow((avgHp * 180) / Math.PI - 275, 2) / Math.pow(25, 2)));
  const rc = 2 * Math.sqrt(Math.pow(avgCp, 7) / (Math.pow(avgCp, 7) + Math.pow(25, 7)));
  const rt = -rc * Math.sin(2 * deltaTheta);
  const kl = 1;
  const kc = 1;
  const kh = 1;
  const termL = deltaLp / (kl * sl);
  const termC = deltaCp / (kc * sc);
  const termH = deltaHpPrime / (kh * sh);
  return Math.sqrt(termL ** 2 + termC ** 2 + termH ** 2 + rt * termC * termH);
}

const DOFUS_CANON = [
  "#E7C37A",
  "#4C6074",
  "#2A1E10",
  "#F5E6D3",
  "#6D3829",
  "#B58B52",
  "#F0C75E",
  "#593514",
  "#8D531F",
];

/**
 * Map a free palette to the nearest Dofus triad.
 * @param {Palette} palette
 * @returns {{ primary: string; secondary: string; tertiary: string }}
 */
export function snapToDofusPalette(palette) {
  const candidates = DOFUS_CANON.map((hex) => ({ hex, lab: hexToLab(hex) }));
  const swatches = [palette.primary, palette.secondary, palette.tertiary];
  const result = swatches.map((color) => {
    let best = candidates[0];
    let bestDelta = Infinity;
    for (const candidate of candidates) {
      const delta = deltaE2000(color, candidate.lab);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = candidate;
      }
    }
    return best.hex;
  });
  return { primary: result[0], secondary: result[1], tertiary: result[2] };
}

export { rgbToLab };
