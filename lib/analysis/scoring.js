import { colorDistance, hexToRgb } from "../utils/color";
import {
  computeToneDistributionFromPalette,
  computeToneDistance,
  computeShapeDistance,
  computeHashDistance,
  computeEdgeDistance,
} from "./image";

export const MAX_TONE_DISTANCE = 2;
const PALETTE_SCORE_WEIGHT = 0.24;
const SIGNATURE_SCORE_WEIGHT = 0.28;
const SHAPE_SCORE_WEIGHT = 0.16;
const TONE_SCORE_WEIGHT = 0.18;
const HASH_SCORE_WEIGHT = 0.22;
const EDGE_SCORE_WEIGHT = 0.12;
const MAX_COLOR_DISTANCE = Math.sqrt(255 * 255 * 3);
const PALETTE_COVERAGE_THRESHOLD = 56;
const PALETTE_COVERAGE_WEIGHT = 0.32;
const SIGNATURE_CONFIDENCE_DISTANCE = 160;
const SIGNATURE_CONFIDENCE_WEIGHT = 0.24;
const SIGNATURE_STRONG_THRESHOLD = 20;
const SIGNATURE_PERFECT_THRESHOLD = 12;
const MAX_SHAPE_DISTANCE = 1;
const SHAPE_CONFIDENCE_DISTANCE = 0.32;
const SHAPE_CONFIDENCE_WEIGHT = 0.16;
const SHAPE_STRONG_THRESHOLD = 0.18;
const TONE_CONFIDENCE_DISTANCE = 0.72;
const TONE_CONFIDENCE_WEIGHT = 0.18;
const MIN_ALPHA_WEIGHT = 0.05;
const HASH_CONFIDENCE_DISTANCE = 0.32;
const HASH_CONFIDENCE_WEIGHT = 0.18;
const HASH_STRONG_THRESHOLD = 0.12;
const EDGE_CONFIDENCE_DISTANCE = 0.26;
const EDGE_CONFIDENCE_WEIGHT = 0.12;
const EDGE_STRONG_THRESHOLD = 0.1;

function computeSignatureDistance(signatureA, signatureB) {
  if (!Array.isArray(signatureA) || !Array.isArray(signatureB)) {
    return Number.POSITIVE_INFINITY;
  }

  const length = Math.min(signatureA.length, signatureB.length);
  if (length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  let total = 0;
  let weightTotal = 0;

  for (let i = 0; i < length; i += 1) {
    const pointA = signatureA[i];
    const pointB = signatureB[i];
    if (!pointA || !pointB) {
      continue;
    }

    const alphaA = typeof pointA.a === "number" ? Math.max(pointA.a, 0) : 1;
    const alphaB = typeof pointB.a === "number" ? Math.max(pointB.a, 0) : 1;
    if (alphaA < MIN_ALPHA_WEIGHT && alphaB < MIN_ALPHA_WEIGHT) {
      continue;
    }

    const weight = Math.max((alphaA + alphaB) / 2, MIN_ALPHA_WEIGHT);
    const dr = (pointA.r ?? 0) - (pointB.r ?? 0);
    const dg = (pointA.g ?? 0) - (pointB.g ?? 0);
    const db = (pointA.b ?? 0) - (pointB.b ?? 0);
    const distance = Math.sqrt(dr * dr + dg * dg + db * db);
    total += distance * weight;
    weightTotal += weight;
  }

  if (weightTotal <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  return total / weightTotal;
}

export function scoreItemAgainstPalette(
  item,
  palette,
  referenceSignature,
  referenceShape,
  referenceTones,
  referenceHash,
  referenceEdges
) {
  let paletteScore = Number.POSITIVE_INFINITY;
  let paletteCoverage = 0;
  if (palette.length > 0 && item.palette && item.palette.length > 0) {
    const paletteRgb = palette.map((color) => ({ r: color.r, g: color.g, b: color.b }));
    const itemRgb = item.palette
      .map((hex) => hexToRgb(hex))
      .filter((value) => value !== null);

    if (itemRgb.length > 0) {
      let matchCount = 0;
      const totalDistance = itemRgb.reduce((accumulator, itemColor) => {
        const closestDistance = paletteRgb.reduce((best, paletteColor) => {
          const distance = colorDistance(itemColor, paletteColor);
          return Math.min(best, distance);
        }, Number.POSITIVE_INFINITY);
        if (closestDistance <= PALETTE_COVERAGE_THRESHOLD) {
          matchCount += 1;
        }
        return accumulator + closestDistance;
      }, 0);

      paletteScore = totalDistance / itemRgb.length;
      paletteCoverage = matchCount / itemRgb.length;
    }
  }

  let signatureScore = Number.POSITIVE_INFINITY;
  if (referenceSignature && Array.isArray(referenceSignature) && referenceSignature.length) {
    const itemSignature = Array.isArray(item.signature) ? item.signature : null;
    if (itemSignature && itemSignature.length) {
      signatureScore = computeSignatureDistance(referenceSignature, itemSignature);
    }
  }

  let shapeScore = Number.POSITIVE_INFINITY;
  if (referenceShape && item.shape) {
    shapeScore = computeShapeDistance(referenceShape, item.shape);
  }

  let toneScore = Number.POSITIVE_INFINITY;
  if (referenceTones && item) {
    const itemTones = item.tones ?? computeToneDistributionFromPalette(item.palette);
    if (itemTones) {
      toneScore = computeToneDistance(referenceTones, itemTones);
    }
  }

  let hashScore = Number.POSITIVE_INFINITY;
  if (referenceHash && typeof referenceHash === "string" && referenceHash.length > 0) {
    const itemHash = typeof item.hash === "string" ? item.hash : null;
    if (itemHash && itemHash.length) {
      hashScore = computeHashDistance(referenceHash, itemHash);
    }
  }

  let edgeScore = Number.POSITIVE_INFINITY;
  if (Array.isArray(referenceEdges) && referenceEdges.length) {
    const itemEdges = Array.isArray(item.edges) ? item.edges : null;
    if (itemEdges && itemEdges.length) {
      edgeScore = computeEdgeDistance(referenceEdges, itemEdges);
    }
  }

  const paletteFinite = Number.isFinite(paletteScore);
  const signatureFinite = Number.isFinite(signatureScore);

  const shapeFinite = Number.isFinite(shapeScore);
  const toneFinite = Number.isFinite(toneScore);

  const hashFinite = Number.isFinite(hashScore);
  const edgeFinite = Number.isFinite(edgeScore);

  if (!paletteFinite && !signatureFinite && !shapeFinite && !toneFinite && !hashFinite && !edgeFinite) {
    return Number.POSITIVE_INFINITY;
  }

  const paletteNormalized = paletteFinite
    ? Math.min(paletteScore / MAX_COLOR_DISTANCE, 1)
    : Number.POSITIVE_INFINITY;
  const signatureNormalized = signatureFinite
    ? Math.min(signatureScore / MAX_COLOR_DISTANCE, 1)
    : Number.POSITIVE_INFINITY;
  const shapeNormalized = shapeFinite
    ? Math.min(shapeScore / MAX_SHAPE_DISTANCE, 1)
    : Number.POSITIVE_INFINITY;
  const toneNormalized = toneFinite ? Math.min(toneScore / MAX_TONE_DISTANCE, 1) : Number.POSITIVE_INFINITY;
  const hashNormalized = hashFinite ? Math.min(hashScore, 1) : Number.POSITIVE_INFINITY;
  const edgeNormalized = edgeFinite ? Math.min(edgeScore, 1) : Number.POSITIVE_INFINITY;

  let weightedScore = 0;
  let totalWeight = 0;

  if (paletteFinite) {
    weightedScore += paletteNormalized * PALETTE_SCORE_WEIGHT;
    totalWeight += PALETTE_SCORE_WEIGHT;
  }

  if (signatureFinite) {
    weightedScore += signatureNormalized * SIGNATURE_SCORE_WEIGHT;
    totalWeight += SIGNATURE_SCORE_WEIGHT;
  }

  if (shapeFinite) {
    weightedScore += shapeNormalized * SHAPE_SCORE_WEIGHT;
    totalWeight += SHAPE_SCORE_WEIGHT;
  }

  if (toneFinite) {
    weightedScore += toneNormalized * TONE_SCORE_WEIGHT;
    totalWeight += TONE_SCORE_WEIGHT;
  }

  if (hashFinite) {
    weightedScore += hashNormalized * HASH_SCORE_WEIGHT;
    totalWeight += HASH_SCORE_WEIGHT;
  }

  if (edgeFinite) {
    weightedScore += edgeNormalized * EDGE_SCORE_WEIGHT;
    totalWeight += EDGE_SCORE_WEIGHT;
  }

  if (totalWeight <= 0) {
    return Number.POSITIVE_INFINITY;
  }

  let finalScore = weightedScore / totalWeight;

  if (paletteCoverage > 0) {
    finalScore -= paletteCoverage * PALETTE_COVERAGE_WEIGHT;
  }

  if (signatureFinite) {
    const signatureConfidence = Math.max(0, 1 - signatureScore / SIGNATURE_CONFIDENCE_DISTANCE);
    if (signatureConfidence > 0) {
      finalScore -= signatureConfidence * SIGNATURE_CONFIDENCE_WEIGHT;
    }
    if (signatureScore < SIGNATURE_STRONG_THRESHOLD) {
      finalScore -= 0.08;
    }
    if (signatureScore < SIGNATURE_PERFECT_THRESHOLD) {
      finalScore -= 0.12;
    }
  }

  if (shapeFinite) {
    const shapeConfidence = Math.max(0, 1 - shapeScore / SHAPE_CONFIDENCE_DISTANCE);
    if (shapeConfidence > 0) {
      finalScore -= shapeConfidence * SHAPE_CONFIDENCE_WEIGHT;
    }
    if (shapeScore < SHAPE_STRONG_THRESHOLD) {
      finalScore -= 0.06;
    }
  }

  if (toneFinite) {
    const toneConfidence = Math.max(0, 1 - toneScore / TONE_CONFIDENCE_DISTANCE);
    if (toneConfidence > 0) {
      finalScore -= toneConfidence * TONE_CONFIDENCE_WEIGHT;
    }
    if (toneScore < 0.18) {
      finalScore -= 0.05;
    }
  }

  if (hashFinite) {
    const hashConfidence = Math.max(0, 1 - hashScore / HASH_CONFIDENCE_DISTANCE);
    if (hashConfidence > 0) {
      finalScore -= hashConfidence * HASH_CONFIDENCE_WEIGHT;
    }
    if (hashScore < HASH_STRONG_THRESHOLD) {
      finalScore -= 0.1;
    }
  }

  if (edgeFinite) {
    const edgeConfidence = Math.max(0, 1 - edgeScore / EDGE_CONFIDENCE_DISTANCE);
    if (edgeConfidence > 0) {
      finalScore -= edgeConfidence * EDGE_CONFIDENCE_WEIGHT;
    }
    if (edgeScore < EDGE_STRONG_THRESHOLD) {
      finalScore -= 0.07;
    }
  }

  return Number.isFinite(finalScore) ? finalScore : Number.POSITIVE_INFINITY;
}
