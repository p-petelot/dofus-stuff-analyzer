import { MAX_ITEM_PALETTE_COLORS, rgbToHex, hexToRgb, rgbToHsl } from "../utils/color";

export const MAX_DIMENSION = 280;
export const BUCKET_SIZE = 24;
export const SIGNATURE_GRID_SIZE = 12;
export const SHAPE_PROFILE_SIZE = 28;
export const HASH_GRID_SIZE = 24;
export const EDGE_GRID_SIZE = 28;
export const EDGE_ORIENTATION_BINS = 8;
export const HUE_BUCKETS = 12;
export const HUE_NEUTRAL_INDEX = HUE_BUCKETS;

function getImageDimensions(image) {
  if (!image) {
    return { width: MAX_DIMENSION, height: MAX_DIMENSION };
  }

  const width =
    image.naturalWidth || image.videoWidth || image.width || image.clientWidth || MAX_DIMENSION;
  const height =
    image.naturalHeight || image.videoHeight || image.height || image.clientHeight || MAX_DIMENSION;

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

export function resolveSourceRect(image, options = {}) {
  if (!image) {
    return null;
  }

  if (options.sourceRect) {
    return options.sourceRect;
  }

  const { width, height } = getImageDimensions(image);
  if (!options.trimTransparent && !options.detectEdges) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  const totalPixels = width * height;
  const brightness = new Float32Array(totalPixels);
  const alphaThreshold = options.alphaThreshold ?? 32;

  let alphaMinX = width;
  let alphaMinY = height;
  let alphaMaxX = -1;
  let alphaMaxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const offset = index * 4;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const a = data[offset + 3];

      brightness[index] = 0.299 * r + 0.587 * g + 0.114 * b;

      if (options.trimTransparent && a > alphaThreshold) {
        if (x < alphaMinX) alphaMinX = x;
        if (x > alphaMaxX) alphaMaxX = x;
        if (y < alphaMinY) alphaMinY = y;
        if (y > alphaMaxY) alphaMaxY = y;
      }
    }
  }

  const paddingRatio = options.paddingRatio ?? 0.04;

  const withPadding = (rect) => {
    if (!rect) {
      return null;
    }
    const padX = Math.max(2, Math.round(width * paddingRatio));
    const padY = Math.max(2, Math.round(height * paddingRatio));
    const startX = Math.max(0, rect.x - padX);
    const startY = Math.max(0, rect.y - padY);
    const endX = Math.min(width, rect.x + rect.width + padX);
    const endY = Math.min(height, rect.y + rect.height + padY);
    return {
      x: startX,
      y: startY,
      width: Math.max(1, endX - startX),
      height: Math.max(1, endY - startY),
    };
  };

  if (options.trimTransparent && alphaMaxX >= alphaMinX && alphaMaxY >= alphaMinY) {
    return withPadding({
      x: alphaMinX,
      y: alphaMinY,
      width: alphaMaxX - alphaMinX + 1,
      height: alphaMaxY - alphaMinY + 1,
    });
  }

  if (!options.detectEdges) {
    return null;
  }

  const gradientThreshold = options.gradientThreshold ?? 28;
  const minActiveRatio = options.minActiveRatio ?? 0.004;

  let edgeMinX = width;
  let edgeMinY = height;
  let edgeMaxX = -1;
  let edgeMaxY = -1;
  let activeCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const current = brightness[index];

      let gradient = 0;
      if (x < width - 1) {
        gradient += Math.abs(current - brightness[index + 1]);
      }
      if (y < height - 1) {
        gradient += Math.abs(current - brightness[index + width]);
      }

      if (gradient > gradientThreshold) {
        if (x < edgeMinX) edgeMinX = x;
        if (x > edgeMaxX) edgeMaxX = x;
        if (y < edgeMinY) edgeMinY = y;
        if (y > edgeMaxY) edgeMaxY = y;
        activeCount += 1;
      }
    }
  }

  if (edgeMaxX >= edgeMinX && edgeMaxY >= edgeMinY) {
    if (activeCount / totalPixels >= minActiveRatio) {
      return withPadding({
        x: edgeMinX,
        y: edgeMinY,
        width: edgeMaxX - edgeMinX + 1,
        height: edgeMaxY - edgeMinY + 1,
      });
    }
  }

  return null;
}

export function drawImageRegion(
  image,
  { sourceRect, targetWidth, targetHeight, maxDimension = MAX_DIMENSION } = {}
) {
  if (!image) {
    return null;
  }

  const { width: baseWidth, height: baseHeight } = getImageDimensions(image);
  const region = sourceRect ?? null;

  const sx = region ? region.x : 0;
  const sy = region ? region.y : 0;
  const sw = region ? region.width : baseWidth;
  const sh = region ? region.height : baseHeight;

  if (!sw || !sh) {
    return null;
  }

  let width = targetWidth;
  let height = targetHeight;

  if (!width && !height) {
    const ratio = Math.min(1, maxDimension / sw, maxDimension / sh);
    width = Math.max(1, Math.round(sw * ratio));
    height = Math.max(1, Math.round(sh * ratio));
  } else if (width && !height) {
    height = Math.max(1, Math.round((width * sh) / sw));
  } else if (!width && height) {
    width = Math.max(1, Math.round((height * sw) / sh));
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }

  context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  return { canvas, context, width, height };
}

export function extractPalette(image, options = {}) {
  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, { sourceRect, maxDimension: MAX_DIMENSION });
  if (!region) {
    return [];
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);

  const buckets = new Map();

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 48) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const key = [
      Math.round(r / BUCKET_SIZE),
      Math.round(g / BUCKET_SIZE),
      Math.round(b / BUCKET_SIZE),
    ].join("-");

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

  return Array.from(buckets.values())
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_ITEM_PALETTE_COLORS)
    .map(({ r, g, b, count }) => {
      const rr = Math.round(r / count);
      const gg = Math.round(g / count);
      const bb = Math.round(b / count);
      return {
        hex: rgbToHex(rr, gg, bb),
        rgb: `rgb(${rr}, ${gg}, ${bb})`,
        r: rr,
        g: gg,
        b: bb,
        weight: count,
      };
    });
}

export function computeImageSignature(image, gridSize = SIGNATURE_GRID_SIZE, options = {}) {
  if (!image || gridSize <= 0 || typeof document === "undefined") {
    return [];
  }

  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, {
    sourceRect,
    targetWidth: gridSize,
    targetHeight: gridSize,
  });

  if (!region) {
    return [];
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);

  const signature = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = data[i + 3] / 255;
    signature.push({ r, g, b, a: alpha });
  }

  return signature;
}

export function computeShapeProfile(image, gridSize = SHAPE_PROFILE_SIZE, options = {}) {
  if (!image || gridSize <= 0 || typeof document === "undefined") {
    return null;
  }

  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, {
    sourceRect,
    targetWidth: gridSize,
    targetHeight: gridSize,
  });

  if (!region) {
    return null;
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);

  const rows = new Array(height).fill(0);
  const columns = new Array(width).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] / 255;
      rows[y] += alpha;
      columns[x] += alpha;
    }
  }

  const normalize = (values) =>
    values.map((sum) => {
      const normalized = sum / values.length;
      return Number.isFinite(normalized) ? Math.min(Math.max(normalized, 0), 1) : 0;
    });

  const normalizedRows = normalize(rows);
  const normalizedColumns = normalize(columns);
  const occupancy =
    normalizedRows.reduce((accumulator, value) => accumulator + value, 0) / normalizedRows.length;

  return {
    rows: normalizedRows,
    columns: normalizedColumns,
    occupancy: Number.isFinite(occupancy) ? Math.min(Math.max(occupancy, 0), 1) : 0,
  };
}

export function computeShapeDistance(shapeA, shapeB) {
  if (!shapeA || !shapeB) {
    return Number.POSITIVE_INFINITY;
  }

  const compareArrays = (a = [], b = []) => {
    const length = Math.min(a.length, b.length);
    if (length === 0) {
      return Number.POSITIVE_INFINITY;
    }

    let total = 0;
    for (let i = 0; i < length; i += 1) {
      const valueA = a[i] ?? 0;
      const valueB = b[i] ?? 0;
      total += Math.abs(valueA - valueB);
    }
    return total / length;
  };

  const rowDistance = compareArrays(shapeA.rows, shapeB.rows);
  const columnDistance = compareArrays(shapeA.columns, shapeB.columns);

  if (!Number.isFinite(rowDistance) && !Number.isFinite(columnDistance)) {
    return Number.POSITIVE_INFINITY;
  }

  const occupancyA = typeof shapeA.occupancy === "number" ? shapeA.occupancy : 0;
  const occupancyB = typeof shapeB.occupancy === "number" ? shapeB.occupancy : 0;
  const occupancyDistance = Math.abs(occupancyA - occupancyB);

  const finiteComponents = [];
  if (Number.isFinite(rowDistance)) finiteComponents.push(rowDistance);
  if (Number.isFinite(columnDistance)) finiteComponents.push(columnDistance);
  finiteComponents.push(occupancyDistance);

  const total = finiteComponents.reduce((accumulator, value) => accumulator + value, 0);
  return total / finiteComponents.length;
}

export function computeDifferenceHash(image, hashSize = HASH_GRID_SIZE, options = {}) {
  if (!image || typeof document === "undefined" || hashSize <= 0) {
    return null;
  }

  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, {
    sourceRect,
    targetWidth: hashSize + 1,
    targetHeight: hashSize,
  });

  if (!region) {
    return null;
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);
  const hash = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < hashSize; x += 1) {
      const leftIndex = (y * width + x) * 4;
      const rightIndex = (y * width + (x + 1)) * 4;

      const left = 0.299 * data[leftIndex] + 0.587 * data[leftIndex + 1] + 0.114 * data[leftIndex + 2];
      const right = 0.299 * data[rightIndex] + 0.587 * data[rightIndex + 1] + 0.114 * data[rightIndex + 2];

      hash.push(left > right ? "1" : "0");
    }
  }

  return hash.length ? hash.join("") : null;
}

export function computeHashDistance(hashA, hashB) {
  if (!hashA || !hashB) {
    return Number.POSITIVE_INFINITY;
  }

  const length = Math.min(hashA.length, hashB.length);
  if (!length) {
    return Number.POSITIVE_INFINITY;
  }

  let distance = 0;
  for (let i = 0; i < length; i += 1) {
    if (hashA.charAt(i) !== hashB.charAt(i)) {
      distance += 1;
    }
  }

  return distance / length;
}

export function computeEdgeHistogram(image, gridSize = EDGE_GRID_SIZE, options = {}) {
  if (!image || typeof document === "undefined" || gridSize <= 1) {
    return null;
  }

  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, {
    sourceRect,
    targetWidth: gridSize,
    targetHeight: gridSize,
  });

  if (!region) {
    return null;
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);
  const brightness = new Float32Array(width * height);

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    brightness[i] = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
  }

  const bins = new Array(EDGE_ORIENTATION_BINS).fill(0);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const center = brightness[index];
      const left = x > 0 ? brightness[index - 1] : center;
      const right = x < width - 1 ? brightness[index + 1] : center;
      const up = y > 0 ? brightness[index - width] : center;
      const down = y < height - 1 ? brightness[index + width] : center;

      const gx = right - left;
      const gy = down - up;
      const magnitude = Math.sqrt(gx * gx + gy * gy);

      if (magnitude < 1) {
        continue;
      }

      const orientation = Math.atan2(gy, gx);
      const normalized = (orientation + Math.PI) / (2 * Math.PI);
      const bin = Math.min(
        EDGE_ORIENTATION_BINS - 1,
        Math.max(0, Math.floor(normalized * EDGE_ORIENTATION_BINS))
      );

      bins[bin] += magnitude;
    }
  }

  const total = bins.reduce((accumulator, value) => accumulator + value, 0);
  if (total <= 0) {
    return null;
  }

  return bins.map((value) => value / total);
}

export function computeEdgeDistance(edgesA, edgesB) {
  if (!Array.isArray(edgesA) || !Array.isArray(edgesB)) {
    return Number.POSITIVE_INFINITY;
  }

  const length = Math.min(edgesA.length, edgesB.length);
  if (!length) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  for (let i = 0; i < length; i += 1) {
    const valueA = edgesA[i] ?? 0;
    const valueB = edgesB[i] ?? 0;
    total += Math.abs(valueA - valueB);
  }

  return total / length;
}

export function computeToneHistogramFromPixels(pixels, bucketCount = HUE_BUCKETS) {
  if (!pixels || pixels.length === 0) {
    return null;
  }

  const buckets = new Array(bucketCount + 1).fill(0);
  let total = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3] / 255;
    if (alpha < 0.16) {
      continue;
    }

    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];

    const { h, s, l } = rgbToHsl(r, g, b);
    const isNeutral = s < 0.18 || l < 0.12 || l > 0.88;

    const weight = alpha * (0.7 + s * 0.6);
    if (!Number.isFinite(weight) || weight <= 0) {
      continue;
    }

    if (isNeutral) {
      buckets[HUE_NEUTRAL_INDEX] += weight;
      total += weight;
      continue;
    }

    const segment = Math.min(bucketCount - 1, Math.floor((h / 360) * bucketCount));
    buckets[segment] += weight;
    total += weight;
  }

  if (total <= 0) {
    return null;
  }

  return buckets.map((value) => value / total);
}

export function computeToneDistribution(image, options = {}) {
  if (!image || typeof document === "undefined") {
    return null;
  }

  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const region = drawImageRegion(image, { sourceRect, maxDimension: MAX_DIMENSION });
  if (!region) {
    return null;
  }

  const { context, width, height } = region;
  const { data } = context.getImageData(0, 0, width, height);

  return computeToneHistogramFromPixels(data);
}

export function computeToneDistributionFromPalette(palette) {
  if (!palette || !palette.length) {
    return null;
  }

  const buckets = new Array(HUE_BUCKETS + 1).fill(0);
  let total = 0;

  palette.forEach((hex, index) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return;
    const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
    const weight = 1 / (index + 1);
    if (s < 0.18 || l < 0.12 || l > 0.88) {
      buckets[HUE_NEUTRAL_INDEX] += weight;
    } else {
      const segment = Math.min(HUE_BUCKETS - 1, Math.floor((h / 360) * HUE_BUCKETS));
      buckets[segment] += weight;
    }
    total += weight;
  });

  if (total <= 0) {
    return null;
  }

  return buckets.map((value) => value / total);
}

export function computeToneDistance(tonesA, tonesB) {
  if (!Array.isArray(tonesA) || !Array.isArray(tonesB)) {
    return Number.POSITIVE_INFINITY;
  }

  const length = Math.min(tonesA.length, tonesB.length);
  if (!length) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  for (let i = 0; i < length; i += 1) {
    const valueA = tonesA[i] ?? 0;
    const valueB = tonesB[i] ?? 0;
    total += Math.abs(valueA - valueB);
  }

  return total / length;
}

export function analyzeImage(image, options = {}) {
  const sourceRect = options.sourceRect ?? resolveSourceRect(image, options);
  const sharedOptions = { ...options, sourceRect };

  const palette = extractPalette(image, sharedOptions);
  const signature = computeImageSignature(image, SIGNATURE_GRID_SIZE, sharedOptions);
  const shape = computeShapeProfile(image, SHAPE_PROFILE_SIZE, sharedOptions);
  const tones = computeToneDistribution(image, sharedOptions);
  const hash = computeDifferenceHash(image, HASH_GRID_SIZE, sharedOptions);
  const edges = computeEdgeHistogram(image, EDGE_GRID_SIZE, sharedOptions);

  return { palette, signature, shape, tones, hash, edges, sourceRect };
}

export function analyzePaletteFromUrl(imageUrl, options = {}) {
  if (!imageUrl || typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.resolve({ palette: [], signature: [], shape: null, tones: null, hash: null, edges: null });
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        const analysis = analyzeImage(image, options);
        resolve(analysis);
      } catch (err) {
        console.error(err);
        resolve({ palette: [], signature: [], shape: null, tones: null, hash: null, edges: null });
      }
    };
    image.onerror = () => {
      resolve({ palette: [], signature: [], shape: null, tones: null, hash: null, edges: null });
    };
    image.src = imageUrl;
  });
}

export async function enrichItemsWithPalettes(items, shouldCancel) {
  if (!items.length || (typeof window === "undefined" && typeof document === "undefined")) {
    return items;
  }

  const enriched = await Promise.all(
    items.map(async (item) => {
      if (shouldCancel?.()) {
        return item;
      }

      if (!item.imageUrl) {
        return { ...item, palette: [] };
      }

      const {
        palette: paletteEntries,
        signature,
        shape,
        tones,
        hash,
        edges,
      } = await analyzePaletteFromUrl(item.imageUrl, {
        trimTransparent: true,
        detectEdges: true,
        paddingRatio: 0.05,
      });
      if (shouldCancel?.()) {
        return item;
      }

      const paletteHex = paletteEntries
        .map((entry) => entry.hex)
        .filter((hex, index, array) => hex && array.indexOf(hex) === index)
        .slice(0, MAX_ITEM_PALETTE_COLORS);

      const nextPalette = paletteHex.length ? paletteHex : item.palette ?? [];
      const nextSource = paletteHex.length ? "image" : item.paletteSource ?? "unknown";
      const nextSignature = Array.isArray(signature) && signature.length
        ? signature
        : Array.isArray(item.signature) && item.signature.length
        ? item.signature
        : null;
      const nextShape = shape ?? item.shape ?? null;
      const nextTones = tones ?? item.tones ?? computeToneDistributionFromPalette(nextPalette);
      const nextHash = typeof hash === "string" && hash.length
        ? hash
        : typeof item.hash === "string"
        ? item.hash
        : null;
      const nextEdges = Array.isArray(edges) && edges.length
        ? edges
        : Array.isArray(item.edges) && item.edges.length
        ? item.edges
        : null;

      return {
        ...item,
        palette: nextPalette,
        paletteSource: nextSource,
        signature: nextSignature,
        shape: nextShape,
        tones: nextTones,
        hash: nextHash,
        edges: nextEdges,
      };
    })
  );

  return enriched;
}
