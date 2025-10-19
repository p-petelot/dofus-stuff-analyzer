import { SLOTS } from "../config/suggestions";
import { deltaE2000, hexToLab } from "../colors/colorEngine";
import type { CandidateRef, Lab, SlotKey } from "../types";

export interface SuggestPaletteInput {
  colors: string[];
  theme?: string;
}

export interface SuggestOptions {
  classFilter?: string;
  theme?: string;
  slotsNeeded?: SlotKey[];
  preferJokers?: boolean;
  perSlot?: number;
}

export interface ItemSuggestionBreakdown {
  color: number;
  theme: number;
  diversity: number;
  slot: number;
  joker: number;
  deltaE: number;
}

export interface ItemSuggestion {
  item: CandidateRef;
  score: number;
  breakdown: ItemSuggestionBreakdown;
  note: string;
}

export interface SuggestDebugInfo {
  palette: SuggestPaletteInput;
  slotsEvaluated: Record<SlotKey, number>;
  rawScores: Record<
    SlotKey,
    Array<{ itemId: number; score: number; breakdown: ItemSuggestionBreakdown }>
  >;
}

export interface SuggestResult {
  picks: Record<SlotKey, ItemSuggestion[]>;
  debug: SuggestDebugInfo;
}

const FALLBACK_COLOUR = "#C8C5BE";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normaliseHex(hex: string): string | null {
  if (!hex) return null;
  const cleaned = hex.trim().replace(/^#/, "");
  if (![3, 6].includes(cleaned.length)) return null;
  if (!/^[0-9a-fA-F]+$/.test(cleaned)) return null;
  return `#${cleaned.length === 3 ? cleaned.split("").map((c) => c.repeat(2)).join("") : cleaned}`.toUpperCase();
}

function pairwiseAverageDelta(colors: string[]): number {
  const labs = colors.map((hex) => hexToLab(hex));
  if (labs.length < 2) {
    return 0;
  }
  let total = 0;
  let count = 0;
  for (let i = 0; i < labs.length; i += 1) {
    for (let j = i + 1; j < labs.length; j += 1) {
      total += deltaE2000(labs[i], labs[j]);
      count += 1;
    }
  }
  return count ? total / count : 0;
}

function isColorizable(item: CandidateRef): boolean {
  const tags = item.tags ?? [];
  const palette = item.palette ?? [];
  return (
    tags.some((tag) => /joker|coloris|teinture|dye/i.test(tag)) ||
    palette.some((entry) => /joker/i.test(entry))
  );
}

function describeHue(hex: string): string {
  const clean = normaliseHex(hex) ?? FALLBACK_COLOUR;
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
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

  if (s < 0.15) {
    if (l > 0.75) return "ivoire";
    if (l < 0.3) return "charbon";
    return "gris";
  }

  const hue = (h + 360) % 360;
  if (hue < 15 || hue >= 345) return "rouge";
  if (hue < 45) return "orangé";
  if (hue < 70) return "doré";
  if (hue < 150) return "vert";
  if (hue < 190) return "turquoise";
  if (hue < 230) return "bleu";
  if (hue < 270) return "indigo";
  if (hue < 310) return "violet";
  return "magenta";
}

function buildNote(item: CandidateRef, colorHex: string, joker: boolean): string {
  const descriptor = describeHue(colorHex);
  const action = joker ? "s’adapte" : "complète";
  return `${item.label} ${action} à vos tons ${descriptor}.`;
}

function resolvePaletteColours(input: SuggestPaletteInput): string[] {
  const colors = (input.colors ?? []).map((hex) => normaliseHex(hex)).filter((hex): hex is string => Boolean(hex));
  if (!colors.length) {
    return [FALLBACK_COLOUR];
  }
  return colors;
}

export function suggestItems(
  palette: SuggestPaletteInput,
  items: CandidateRef[],
  options: SuggestOptions = {},
): SuggestResult {
  const paletteColours = resolvePaletteColours(palette);
  const paletteLabs = paletteColours.map((hex) => hexToLab(hex));
  const perSlotLimit = clamp(options.perSlot ?? 3, 1, 5);
  const targetSlots = new Set(options.slotsNeeded && options.slotsNeeded.length ? options.slotsNeeded : SLOTS);
  const preferredTheme = (options.theme ?? palette.theme)?.toLowerCase();
  const preferredClass = options.classFilter?.toLowerCase();

  const filteredItems = items.filter((item) => {
    if (!targetSlots.has(item.slot)) {
      return false;
    }
    if (preferredClass) {
      return (item.tags ?? []).some((tag) => tag.toLowerCase() === `class:${preferredClass}`);
    }
    return true;
  });

  const perSlotRaw: Record<
    SlotKey,
    Array<{ item: CandidateRef; score: number; breakdown: ItemSuggestionBreakdown; bestColor: string }>
  > = Object.fromEntries(
    SLOTS.map((slot) => [slot, []]),
  ) as Record<SlotKey, Array<{ item: CandidateRef; score: number; breakdown: ItemSuggestionBreakdown; bestColor: string }>>;

  for (const item of filteredItems) {
    const paletteEntries = (item.palette ?? [])
      .map((hex) => normaliseHex(hex))
      .filter((hex): hex is string => Boolean(hex));
    if (!paletteEntries.length) {
      paletteEntries.push(FALLBACK_COLOUR);
    }

    const itemLabs = paletteEntries.map((hex) => hexToLab(hex));
    const deltas = paletteLabs.map((target) => Math.min(...itemLabs.map((lab) => deltaE2000(target, lab))));
    const avgDelta = deltas.reduce((acc, value) => acc + value, 0) / Math.max(deltas.length, 1);
    const minDelta = Math.min(...deltas);
    const maxDelta = Math.max(...deltas);
    const colorScore = 30 * (1 - clamp(avgDelta / 60, 0, 1));

    let themeScore = 0;
    if (preferredTheme) {
      const matches = (item.tags ?? []).filter((tag) => tag.toLowerCase() === preferredTheme).length;
      themeScore = clamp(matches, 0, 1) * 20;
    }

    const diversitySpread = pairwiseAverageDelta(paletteEntries);
    const diversityScore = paletteEntries.length === 1 ? 8 : 20 * clamp(diversitySpread / 60, 0, 1);

    const slotScore = targetSlots.has(item.slot) ? 15 : 0;

    const colorizable = isColorizable(item);
    const fillsGap = maxDelta > 22;
    let jokerScore = 0;
    if (colorizable && fillsGap) {
      jokerScore = options.preferJokers ? 20 : 15;
    } else if (colorizable && options.preferJokers) {
      jokerScore = 5;
    }

    const totalScore = clamp(colorScore + themeScore + diversityScore + slotScore + jokerScore, 0, 100);

    const bestIndex = deltas.indexOf(minDelta);
    const bestColor = paletteColours[bestIndex >= 0 ? bestIndex : 0] ?? paletteColours[0];

    const breakdown: ItemSuggestionBreakdown = {
      color: colorScore,
      theme: themeScore,
      diversity: diversityScore,
      slot: slotScore,
      joker: jokerScore,
      deltaE: minDelta,
    };

    perSlotRaw[item.slot].push({ item, score: totalScore, breakdown, bestColor });
  }

  const picks = Object.fromEntries(SLOTS.map((slot) => [slot, [] as ItemSuggestion[]])) as Record<SlotKey, ItemSuggestion[]>;
  const slotsEvaluated = Object.fromEntries(SLOTS.map((slot) => [slot, perSlotRaw[slot].length])) as Record<SlotKey, number>;

  for (const slot of SLOTS) {
    const candidates = perSlotRaw[slot];
    if (!candidates.length) continue;
    candidates.sort((a, b) => b.score - a.score);
    const selectedLabs: Array<{ lab: Lab; itemId: number }> = [];

    for (const candidate of candidates) {
      if (picks[slot].length >= perSlotLimit) break;
      const { item, breakdown } = candidate;
      const paletteLab = hexToLab(candidate.bestColor);
      const penalty = selectedLabs.length
        ? Math.max(
            0,
            1 -
              Math.min(
                ...selectedLabs.map(({ lab }) => deltaE2000(lab, paletteLab)),
                Number.POSITIVE_INFINITY,
              ) /
                40,
          ) * 20
        : 0;
      const adjustedDiversity = clamp(breakdown.diversity - penalty, 0, 20);
      const adjustedScore = clamp(
        breakdown.color + breakdown.theme + adjustedDiversity + breakdown.slot + breakdown.joker,
        0,
        100,
      );

      const joker = breakdown.joker > 0;
      const note = buildNote(item, candidate.bestColor, joker);

      picks[slot].push({
        item,
        score: adjustedScore,
        breakdown: { ...breakdown, diversity: adjustedDiversity },
        note,
      });

      selectedLabs.push({ lab: paletteLab, itemId: item.itemId });
    }

    picks[slot].sort((a, b) => b.score - a.score);
  }

  const rawScores: Record<
    SlotKey,
    Array<{ itemId: number; score: number; breakdown: ItemSuggestionBreakdown }>
  > = Object.fromEntries(
    SLOTS.map((slot) => [
      slot,
      perSlotRaw[slot]
        .sort((a, b) => b.score - a.score)
        .slice(0, perSlotLimit * 2)
        .map(({ item, score, breakdown }) => ({ itemId: item.itemId, score, breakdown })),
    ]),
  ) as Record<SlotKey, Array<{ itemId: number; score: number; breakdown: ItemSuggestionBreakdown }>>;

  return {
    picks,
    debug: {
      palette: { colors: paletteColours, theme: preferredTheme ?? undefined },
      slotsEvaluated,
      rawScores,
    },
  };
}

