import { ImageDataLike } from "../types";

function normalizeVector(values: number[]): number[] {
  const sumSquares = values.reduce((acc, value) => acc + value * value, 0);
  if (sumSquares <= 0) {
    return values.map(() => 0);
  }
  const norm = Math.sqrt(sumSquares);
  return values.map((value) => value / norm);
}

function computeColorHistogram(patch: ImageDataLike, bins = 8): number[] {
  const histogram = new Array(bins * 3).fill(0);
  const { data } = patch;
  const step = Math.max(1, Math.floor((patch.width * patch.height) / 2048));
  let index = 0;
  let count = 0;

  while (index < data.length) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const a = data[index + 3];
    if (a > 32) {
      const rBin = Math.min(bins - 1, Math.floor((r / 256) * bins));
      const gBin = Math.min(bins - 1, Math.floor((g / 256) * bins));
      const bBin = Math.min(bins - 1, Math.floor((b / 256) * bins));
      histogram[rBin] += 1;
      histogram[bins + gBin] += 1;
      histogram[2 * bins + bBin] += 1;
      count += 1;
    }
    index += step * 4;
  }

  if (count === 0) {
    return histogram;
  }

  return histogram.map((value) => value / count);
}

function grayscaleAt(data: Uint8ClampedArray, idx: number): number {
  const r = data[idx];
  const g = data[idx + 1];
  const b = data[idx + 2];
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function computeEdgeMap(patch: ImageDataLike): Float32Array {
  const { width, height, data } = patch;
  const result = new Float32Array(width * height);
  const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      let gx = 0;
      let gy = 0;
      let kernelIndex = 0;

      for (let ky = -1; ky <= 1; ky += 1) {
        for (let kx = -1; kx <= 1; kx += 1) {
          const px = x + kx;
          const py = y + ky;
          const idx = (py * width + px) * 4;
          const intensity = grayscaleAt(data, idx);
          gx += intensity * sobelX[kernelIndex];
          gy += intensity * sobelY[kernelIndex];
          kernelIndex += 1;
        }
      }

      const magnitude = Math.sqrt(gx * gx + gy * gy);
      result[y * width + x] = magnitude;
    }
  }

  return result;
}

function structuralSimilarity(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) {
    return 0;
  }

  let meanA = 0;
  let meanB = 0;
  for (let i = 0; i < length; i += 1) {
    meanA += a[i];
    meanB += b[i];
  }
  meanA /= length;
  meanB /= length;

  let varianceA = 0;
  let varianceB = 0;
  let covariance = 0;
  for (let i = 0; i < length; i += 1) {
    const diffA = a[i] - meanA;
    const diffB = b[i] - meanB;
    varianceA += diffA * diffA;
    varianceB += diffB * diffB;
    covariance += diffA * diffB;
  }

  varianceA /= length - 1 || 1;
  varianceB /= length - 1 || 1;
  covariance /= length - 1 || 1;

  const c1 = 0.01 * 0.01 * 255 * 255;
  const c2 = 0.03 * 0.03 * 255 * 255;

  const numerator = (2 * meanA * meanB + c1) * (2 * covariance + c2);
  const denominator = (meanA * meanA + meanB * meanB + c1) * (varianceA + varianceB + c2);

  if (denominator === 0) {
    return 0;
  }

  return Math.max(-1, Math.min(1, numerator / denominator));
}

function computeOrientationHistogram(patch: ImageDataLike, bins = 8): number[] {
  const { width, height, data } = patch;
  const histogram = new Array(bins).fill(0);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const centerIdx = (y * width + x) * 4;
      const left = grayscaleAt(data, centerIdx - 4);
      const right = grayscaleAt(data, centerIdx + 4);
      const top = grayscaleAt(data, centerIdx - width * 4);
      const bottom = grayscaleAt(data, centerIdx + width * 4);

      const gx = right - left;
      const gy = bottom - top;
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      if (magnitude < 1) {
        continue;
      }

      let angle = Math.atan2(gy, gx);
      if (angle < 0) {
        angle += Math.PI * 2;
      }
      const bin = Math.min(bins - 1, Math.floor((angle / (Math.PI * 2)) * bins));
      histogram[bin] += magnitude;
    }
  }

  const total = histogram.reduce((acc, value) => acc + value, 0);
  if (total === 0) {
    return histogram;
  }
  return histogram.map((value) => value / total);
}

export async function computeClipEmbedding(patch: ImageDataLike): Promise<number[]> {
  const histogram = computeColorHistogram(patch, 8);
  return normalizeVector(histogram);
}

export function edgeSsim(patch: ImageDataLike, template: ImageDataLike): number {
  const patchEdges = computeEdgeMap(patch);
  const templateEdges = computeEdgeMap(template);
  const similarity = structuralSimilarity(patchEdges, templateEdges);
  return Math.max(0, Math.min(1, (similarity + 1) / 2));
}

export function orbMatchRatio(patch: ImageDataLike, template: ImageDataLike): number {
  const patchHist = computeOrientationHistogram(patch, 8);
  const templateHist = computeOrientationHistogram(template, 8);
  const normalizedPatch = normalizeVector(patchHist);
  const normalizedTemplate = normalizeVector(templateHist);

  let dot = 0;
  for (let i = 0; i < normalizedPatch.length; i += 1) {
    dot += normalizedPatch[i] * normalizedTemplate[i];
  }

  return Math.max(0, Math.min(1, (dot + 1) / 2));
}
