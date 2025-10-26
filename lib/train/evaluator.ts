import { labDelta, paletteToHues } from "./color";
import type { EvaluationBreakdown, GeneratedCandidate } from "./types";

const HARMONY_WEIGHT = 35;
const CONTRAST_WEIGHT = 20;
const DIVERSITY_WEIGHT = 15;
const SLOT_COMPLETION_WEIGHT = 10;
const STYLE_WEIGHT = 10;
const JOKER_WEIGHT = 10;

function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  const clamped = Math.max(min, Math.min(max, value));
  return (clamped - min) / (max - min);
}

function evaluateHarmony(candidate: GeneratedCandidate): { value: number; notes: string[] } {
  let sum = 0;
  let count = 0;
  const notes: string[] = [];
  for (const pick of candidate.items) {
    if (!pick.item) {
      notes.push(`${pick.slot} sans item → pénalité harmonie.`);
      continue;
    }
    const target = pick.assignedColor;
    const palette = pick.item.palette.length ? pick.item.palette : [target];
    const best = Math.min(...palette.map((colour) => labDelta(colour, target)));
    const contribution = Math.max(0, 1 - best / 50);
    sum += contribution;
    count += 1;
    if (best > 35) {
      notes.push(`${pick.item.label} s'éloigne de la palette (ΔE ${best.toFixed(1)}).`);
    }
  }
  if (!count) {
    return { value: 0, notes };
  }
  const score = (sum / count) * HARMONY_WEIGHT;
  return { value: score, notes };
}

function evaluateContrast(candidate: GeneratedCandidate): { value: number; notes: string[] } {
  const { colors } = candidate.palette;
  const hairSkin = labDelta(colors.hair, colors.skin);
  const outfitSkin = labDelta(colors.outfitPrimary, colors.skin);
  const hairOutfit = labDelta(colors.hair, colors.outfitPrimary);
  const contrastAverage = (hairSkin + outfitSkin + hairOutfit) / 3;
  const normalized = normalize(contrastAverage, 10, 45);
  const score = normalized * CONTRAST_WEIGHT;
  const notes: string[] = [];
  if (contrastAverage < 20) {
    notes.push("Contraste faible entre cheveux, peau et tenue.");
  }
  return { value: score, notes };
}

function evaluateDiversity(candidate: GeneratedCandidate): { value: number; notes: string[] } {
  const hues = candidate.items
    .filter((pick) => pick.item)
    .map((pick) => paletteToHues(pick.item?.palette ?? [pick.assignedColor]))
    .flat();
  if (!hues.length) {
    return { value: 0, notes: ["Aucune teinte détectée pour la diversité."] };
  }
  let totalDistance = 0;
  let comparisons = 0;
  for (let i = 0; i < hues.length; i += 1) {
    for (let j = i + 1; j < hues.length; j += 1) {
      const diff = Math.abs(hues[i] - hues[j]);
      const wrapped = diff > 180 ? 360 - diff : diff;
      totalDistance += wrapped;
      comparisons += 1;
    }
  }
  const average = comparisons ? totalDistance / comparisons : 0;
  const normalized = normalize(average, 15, 120);
  const score = normalized * DIVERSITY_WEIGHT;
  const notes: string[] = [];
  if (average < 30) {
    notes.push("Palette très homogène → penser à varier les teintes.");
  }
  return { value: score, notes };
}

function evaluateSlotCompletion(candidate: GeneratedCandidate): { value: number; notes: string[] } {
  const filled = candidate.items.filter((pick) => pick.item).length;
  const coverage = candidate.items.length ? filled / candidate.items.length : 0;
  const score = coverage * SLOT_COMPLETION_WEIGHT;
  const notes: string[] = [];
  if (coverage < 1) {
    const missing = candidate.items.filter((pick) => !pick.item).map((pick) => pick.slot);
    if (missing.length) {
      notes.push(`Slots manquants: ${missing.join(", ")}.`);
    }
  }
  return { value: score, notes };
}

function evaluateStyle(candidate: GeneratedCandidate): { value: number; notes: string[] } {
  if (!candidate.theme) {
    return { value: STYLE_WEIGHT * 0.5, notes: ["Aucun thème ciblé → score neutre."] };
  }
  const themedCount = candidate.items.filter((pick) => pick.item?.themeTags.includes(candidate.theme!)).length;
  const total = candidate.items.filter((pick) => pick.item).length;
  if (!total) {
    return { value: 0, notes: ["Pas d'items pour vérifier la cohérence de thème."] };
  }
  const ratio = themedCount / total;
  const score = ratio * STYLE_WEIGHT;
  const notes: string[] = [];
  if (ratio < 0.4) {
    notes.push(`Thème ${candidate.theme} peu représenté (${Math.round(ratio * 100)}%).`);
  }
  return { value: score, notes };
}

function evaluateJoker(candidate: GeneratedCandidate): { value: number; notes: string[] } {
  if (!candidate.jokerCount) {
    return { value: 0, notes: [] };
  }
  const jokerPicks = candidate.items.filter((pick) => pick.isJoker && pick.item);
  const bridging = jokerPicks.reduce((sum, pick) => {
    if (!pick.item) return sum;
    const palette = pick.item.palette.length ? pick.item.palette : [pick.assignedColor];
    const best = Math.min(...palette.map((colour) => labDelta(colour, pick.assignedColor)));
    const utility = Math.max(0, 1 - best / 80);
    return sum + utility;
  }, 0);
  const normalized = Math.min(1, bridging / Math.max(1, candidate.jokerCount));
  const score = normalized * JOKER_WEIGHT;
  const notes: string[] = [`Jokers utilisés: ${candidate.jokerCount}.`];
  if (normalized < 0.5) {
    notes.push("Les jokers n'apportent pas encore assez de contraste.");
  }
  return { value: score, notes };
}

export function evaluateCandidate(candidate: GeneratedCandidate): EvaluationBreakdown {
  const components = [
    evaluateHarmony(candidate),
    evaluateContrast(candidate),
    evaluateDiversity(candidate),
    evaluateSlotCompletion(candidate),
    evaluateStyle(candidate),
    evaluateJoker(candidate),
  ];
  const score = components.reduce((sum, component) => sum + component.value, 0);
  const breakdown: Record<string, number> = {
    harmony: components[0].value,
    contrast: components[1].value,
    diversity: components[2].value,
    slotCompleteness: components[3].value,
    styleConsistency: components[4].value,
    jokerUtility: components[5].value,
  };
  const notes = components.flatMap((component) => component.notes);
  return { score, breakdown, notes };
}
