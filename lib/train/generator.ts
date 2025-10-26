import { getCatalog, TRAINING_SLOTS } from "./catalog";
import { clampHue, hslToHex, hexToRgb, labDelta, rgbToHue } from "./color";
import { createRng, shuffleInPlace, weightedSample, jitter } from "./random";
import type { Rng } from "./random";
import type {
  CandidateItemPick,
  Catalog,
  CatalogItem,
  GenParams,
  GeneratedCandidate,
  PaletteHarmony,
  PaletteSummary,
  PaletteSource,
  TrainingSlotKey,
} from "./types";
import { buildCandidatePreview, AVAILABLE_CLASS_KEYS, getClassPreviewConfig } from "./look";

const SLOT_TO_COLOR: Record<TrainingSlotKey, keyof PaletteSummary["colors"]> = {
  coiffe: "hair",
  cape: "primary",
  bouclier: "accent",
  familier: "detail",
  epauliere: "secondary",
  costume: "primary",
  ailes: "accent",
};

const COHERENCE_BASE_SLOT_PRIORITY: TrainingSlotKey[] = [
  "costume",
  "cape",
  "coiffe",
  "epauliere",
];

const COHERENCE_MAX_ANCHORS = 3;
const COHERENCE_LAB_STRICT = 26;
const COHERENCE_LAB_SOFT = 38;

const CLASS_NAME_OVERRIDES: Record<string, string> = {
  feca: "Féca",
  osamodas: "Osamodas",
  enutrof: "Enutrof",
  sram: "Sram",
  xelor: "Xélor",
  ecaflip: "Ecaflip",
  eniripsa: "Eniripsa",
  iop: "Iop",
  cra: "Crâ",
  sadida: "Sadida",
  sacrieur: "Sacrieur",
  pandawa: "Pandawa",
  roublard: "Roublard",
  zobal: "Zobal",
  steamer: "Steamer",
  eliotrope: "Eliotrope",
  huppermage: "Huppermage",
  ouginak: "Ouginak",
  forgelance: "Forgelance",
};

const HARMONIES: PaletteHarmony[] = ["triad", "split", "analogous", "complementary"];
const DEFAULT_PALETTE_SOURCE: PaletteSource = "random";

interface CoherenceAnchor {
  slot: TrainingSlotKey;
  item: CatalogItem;
}

interface PaletteContext {
  source: PaletteSource;
  harmony: PaletteHarmony;
  theme: string | null;
  seed: string;
  anchorHue: number;
}

function buildPalette(ctx: PaletteContext): PaletteSummary {
  const rng = createRng(ctx.seed);
  const baseHue = clampHue(ctx.anchorHue + jitter(0, 6, rng));
  const { harmony } = ctx;
  let offsets: number[];
  switch (harmony) {
    case "triad":
      offsets = [0, 120, 240];
      break;
    case "split":
      offsets = [0, 150, 210];
      break;
    case "analogous":
      offsets = [0, 25, -20];
      break;
    case "complementary":
      offsets = [0, 180, 30];
      break;
    default:
      offsets = [0, 120, 240];
  }
  const hairHue = clampHue(baseHue + offsets[0]);
  const primaryHue = clampHue(baseHue + offsets[1]);
  const secondaryHue = clampHue(baseHue + offsets[2]);
  const accentHue = clampHue(baseHue + offsets[1] / 2 + jitter(0, 12, rng));
  const skinHue = clampHue(baseHue + 35 + jitter(0, 8, rng));
  const detailHue = clampHue(accentHue + 45 + jitter(0, 10, rng));
  const palette: PaletteSummary = {
    source: ctx.source,
    harmony: ctx.harmony,
    seed: ctx.seed,
    anchorHue: baseHue,
    colors: {
      hair: hslToHex(hairHue, 0.55, 0.45),
      skin: hslToHex(skinHue, 0.38, 0.72),
      primary: hslToHex(primaryHue, 0.6, 0.46),
      secondary: hslToHex(secondaryHue, 0.58, 0.42),
      accent: hslToHex(accentHue, 0.66, 0.52),
      detail: hslToHex(detailHue, 0.55, 0.48),
    },
  };
  return palette;
}

function hueFromHex(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHue(r, g, b);
}

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function selectTheme(candidateThemes: string[], source: PaletteSource, rngSeed: string): string | null {
  if (!candidateThemes.length || source === "random") {
    return null;
  }
  const rng = createRng(rngSeed);
  return candidateThemes[rng.int(candidateThemes.length)] ?? null;
}

function alignAnchorHue(
  source: PaletteSource,
  theme: string | null,
  catalogItems: CatalogItem[],
  fallbackSeed: string,
): number {
  if (source === "theme" && theme) {
    const themed = catalogItems.filter((item) => item.themeTags.includes(theme));
    if (themed.length) {
      const hues = themed.flatMap((item) => item.hues);
      const average = hues.reduce((sum, hue) => sum + hue, 0) / hues.length;
      return clampHue(average);
    }
  }
  return clampHue(createRng(fallbackSeed).next() * 360);
}

function findClosestColor(item: CatalogItem | null | undefined, targetHue: number, fallbackColor: string): string {
  if (!item || item.palette.length === 0) {
    return fallbackColor;
  }
  let closest = item.palette[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  item.palette.forEach((color) => {
    const hue = hueFromHex(color);
    const distance = hueDistance(hue, targetHue);
    if (distance < bestDistance) {
      bestDistance = distance;
      closest = color;
    }
  });
  return closest ?? fallbackColor;
}

function uniquePaletteColors(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    if (typeof value !== "string") {
      return;
    }
    const normalized = value.startsWith("#") ? value.toUpperCase() : `#${value.toUpperCase()}`;
    if (/^#[0-9A-F]{6}$/.test(normalized) && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  });
  return result;
}

function derivePaletteFromItem(baseItem: CatalogItem, palette: PaletteSummary): PaletteSummary {
  const unique = uniquePaletteColors(baseItem.palette);
  if (!unique.length) {
    return palette;
  }
  const [c0, c1, c2, c3, c4] = unique;
  const resolvedSkin = palette.colors.skin;
  return {
    ...palette,
    colors: {
      hair: c0 ?? palette.colors.hair,
      skin: resolvedSkin,
      primary: c1 ?? c0 ?? palette.colors.primary,
      secondary: c2 ?? c1 ?? palette.colors.secondary,
      accent: c3 ?? c2 ?? palette.colors.accent,
      detail: c4 ?? c3 ?? c2 ?? palette.colors.detail,
    },
  };
}

function chooseRepresentativeColor(colors: string[], fallback: string): string {
  const unique = uniquePaletteColors(colors);
  if (!unique.length) {
    return fallback;
  }
  if (unique.length === 1) {
    return unique[0];
  }
  let best = unique[0];
  let bestScore = Number.POSITIVE_INFINITY;
  unique.forEach((candidate) => {
    const total = unique.reduce((sum, color) => sum + labDelta(candidate, color), 0);
    if (total < bestScore) {
      bestScore = total;
      best = candidate;
    }
  });
  return best ?? fallback;
}

function harmonizePaletteWithPicks(
  palette: PaletteSummary,
  picks: CandidateItemPick[],
): { palette: PaletteSummary; picks: CandidateItemPick[] } {
  const paletteBySlot: Partial<Record<keyof PaletteSummary["colors"], string[]>> = {};
  picks.forEach((pick) => {
    const colorKey = SLOT_TO_COLOR[pick.slot];
    if (!colorKey) {
      return;
    }
    const bucket = paletteBySlot[colorKey] ?? [];
    bucket.push(pick.assignedColor);
    paletteBySlot[colorKey] = bucket;
  });

  const harmonizedColors: PaletteSummary["colors"] = { ...palette.colors };
  (Object.keys(paletteBySlot) as (keyof PaletteSummary["colors"])[]).forEach((key) => {
    const source = paletteBySlot[key];
    if (!source || !source.length) {
      return;
    }
    harmonizedColors[key] = chooseRepresentativeColor(source, harmonizedColors[key]);
  });

  const adjustedPicks = picks.map((pick) => {
    const colorKey = SLOT_TO_COLOR[pick.slot];
    if (!colorKey) {
      return pick;
    }
    const targetHex = harmonizedColors[colorKey];
    if (!targetHex) {
      return pick;
    }
    if (!pick.item) {
      return { ...pick, assignedColor: targetHex };
    }
    const targetHue = hueFromHex(targetHex);
    const assignedColor = findClosestColor(pick.item, targetHue, targetHex);
    return { ...pick, assignedColor };
  });

  return {
    palette: {
      ...palette,
      colors: harmonizedColors,
    },
    picks: adjustedPicks,
  };
}

function selectCoherenceAnchors(
  slots: TrainingSlotKey[],
  catalog: Catalog,
  rng: Rng,
): CoherenceAnchor[] {
  const ordered = [
    ...COHERENCE_BASE_SLOT_PRIORITY.filter((slot) => slots.includes(slot)),
    ...slots.filter((slot) => !COHERENCE_BASE_SLOT_PRIORITY.includes(slot)),
  ];
  const anchors: CoherenceAnchor[] = [];
  const seenIds = new Set<number>();
  for (const slot of ordered) {
    if (anchors.length >= COHERENCE_MAX_ANCHORS) {
      break;
    }
    const options = catalog.bySlot[slot];
    if (!options || options.length === 0) {
      continue;
    }
    const paletteRich = options.filter((item) => item.palette.length >= 2);
    const remainder = options.filter((item) => item.palette.length < 2);
    const sorted = [...paletteRich, ...remainder].sort((a, b) => {
      const paletteDiff = (b.palette.length || 0) - (a.palette.length || 0);
      if (paletteDiff !== 0) {
        return paletteDiff;
      }
      const colorableDiff = Number(b.isColorable) - Number(a.isColorable);
      if (colorableDiff !== 0) {
        return colorableDiff;
      }
      return (b.rarity ?? 0) - (a.rarity ?? 0);
    });
    const selectionPool: CatalogItem[] = [];
    for (const entry of sorted) {
      if (seenIds.has(entry.id)) {
        continue;
      }
      selectionPool.push(entry);
      if (selectionPool.length >= 24) {
        break;
      }
    }
    if (!selectionPool.length) {
      continue;
    }
    const candidate = selectionPool[rng.int(selectionPool.length)];
    if (candidate) {
      anchors.push({ slot, item: candidate });
      seenIds.add(candidate.id);
    }
  }
  return anchors;
}

function buildCoherencePlan(
  slots: TrainingSlotKey[],
  basePalette: PaletteSummary,
  anchors: CoherenceAnchor[],
): { palette: PaletteSummary; targets: Record<TrainingSlotKey, string> } {
  if (!anchors.length) {
    const targets: Record<TrainingSlotKey, string> = {};
    slots.forEach((slot) => {
      const colorKey = SLOT_TO_COLOR[slot] ?? "primary";
      targets[slot] = basePalette.colors[colorKey] ?? basePalette.colors.primary;
    });
    return { palette: basePalette, targets };
  }

  const colors: PaletteSummary["colors"] = { ...basePalette.colors };
  const targets: Record<TrainingSlotKey, string> = {};
  const colorPool = uniquePaletteColors([
    ...anchors.flatMap((entry) => entry.item.palette),
    basePalette.colors.hair,
    basePalette.colors.primary,
    basePalette.colors.secondary,
    basePalette.colors.accent,
    basePalette.colors.detail,
  ]);

  const order: Array<{ key: keyof PaletteSummary["colors"]; index: number }> = [
    { key: "hair", index: 0 },
    { key: "primary", index: 1 },
    { key: "secondary", index: 2 },
    { key: "accent", index: 3 },
    { key: "detail", index: 4 },
  ];
  order.forEach(({ key, index }) => {
    const candidate = colorPool[index] ?? colorPool[colorPool.length - 1];
    if (candidate) {
      colors[key] = candidate;
    }
  });

  anchors.forEach((anchor) => {
    const colorKey = SLOT_TO_COLOR[anchor.slot] ?? "primary";
    const chosen = chooseRepresentativeColor(anchor.item.palette, colors[colorKey]);
    colors[colorKey] = chosen;
    targets[anchor.slot] = chosen;
  });

  if (targets.coiffe) {
    colors.hair = targets.coiffe;
  }

  slots.forEach((slot) => {
    if (targets[slot]) {
      return;
    }
    const colorKey = SLOT_TO_COLOR[slot] ?? "primary";
    targets[slot] = colors[colorKey] ?? basePalette.colors.primary;
  });

  return {
    palette: {
      ...basePalette,
      colors,
    },
    targets,
  };
}

function pickItem(
  slot: TrainingSlotKey,
  palette: PaletteSummary,
  theme: string | null,
  classKey: string,
  preferJokers: boolean,
  enforceColorCoherence: boolean,
  targetOverrides: Partial<Record<TrainingSlotKey, string>> | null,
  rngSeed: string,
  options: CatalogItem[],
): CandidateItemPick {
  const rng = createRng(`${rngSeed}-${slot}`);
  const targetColorKey = SLOT_TO_COLOR[slot] ?? "primary";
  const override = targetOverrides?.[slot];
  const targetColor = override ?? palette.colors[targetColorKey] ?? palette.colors.primary;
  const targetHue = hueFromHex(targetColor);
  const pool = options.filter((item) => {
    if (!item) return false;
    const normalizedTags = item.classTags
      .map((tag) =>
        tag
          .toString()
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ""),
      )
      .filter(Boolean);
    if (!normalizedTags.length || normalizedTags.includes("toutes")) {
      return true;
    }
    const normalizedClassKey = classKey
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    return normalizedTags.includes(normalizedClassKey);
  });
  if (!pool.length) {
    return { slot, item: null, assignedColor: targetColor, isJoker: false };
  }
  const scored = pool.map((item) => {
    const hues = item.hues.length ? item.hues : [targetHue];
    const minDistance = Math.min(...hues.map((hue) => hueDistance(hue, targetHue)));
    const hueScore = 1 - Math.min(minDistance, 180) / 180;
    const themeScore = theme && item.themeTags.includes(theme) ? 1.15 : 1;
    const jokerScore = item.isJoker ? (preferJokers ? 1.2 : 1.05) : 1;
    const colorableScore = item.isColorable ? 1.05 : 1;
    const rarityScore = item.rarity ? 1 + Math.min(item.rarity, 5) * 0.01 : 1;
    const labDistances = item.palette.length
      ? item.palette.map((hex) => labDelta(hex, targetColor))
      : [labDelta(targetColor, targetColor)];
    const minLabDistance = Math.min(...labDistances);
    const coherenceScore = enforceColorCoherence
      ? Math.max(0.12, 1 - Math.min(minLabDistance, 60) / 60)
      : 1;
    const weight = Math.max(
      0.01,
      hueScore * themeScore * jokerScore * colorableScore * rarityScore * coherenceScore,
    );
    return { item, weight, minDistance, labDistance: minLabDistance };
  });
  scored.sort((a, b) => b.weight - a.weight);
  const top = scored.slice(0, Math.min(12, scored.length));
  if (enforceColorCoherence) {
    const strictMatches = scored
      .filter((entry) => entry.labDistance <= COHERENCE_LAB_STRICT)
      .sort((a, b) => a.labDistance - b.labDistance || b.weight - a.weight);
    const softMatches = strictMatches.length
      ? strictMatches
      : scored
          .filter((entry) => entry.labDistance <= COHERENCE_LAB_SOFT)
          .sort((a, b) => a.labDistance - b.labDistance || b.weight - a.weight);
    const selection = (strictMatches.length ? strictMatches : softMatches.length ? softMatches : scored)[0];
    const item = selection?.item ?? pool[0];
    const assignedColor = item ? findClosestColor(item, targetHue, targetColor) : targetColor;
    return { slot, item: item ?? null, assignedColor, isJoker: Boolean(item?.isJoker) };
  }

  const totalWeight = top.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.next() * (totalWeight || 1);
  for (const entry of top) {
    roll -= entry.weight;
    if (roll <= 0) {
      const assignedColor = findClosestColor(entry.item, targetHue, targetColor);
      return { slot, item: entry.item, assignedColor, isJoker: entry.item.isJoker };
    }
  }
  const fallback = top[0];
  const assignedColor = findClosestColor(fallback.item, targetHue, targetColor);
  return { slot, item: fallback.item, assignedColor, isJoker: fallback.item.isJoker };
}

function fallbackClassName(key: string): string {
  if (typeof key !== "string" || !key.trim()) {
    return "Classe inconnue";
  }
  const trimmed = key.trim();
  const normalized = trimmed.toLowerCase();
  if (CLASS_NAME_OVERRIDES[normalized]) {
    return CLASS_NAME_OVERRIDES[normalized];
  }
  const breedMatch = normalized.match(/^breed-(\d+)$/);
  if (breedMatch) {
    const breedId = Number(breedMatch[1]);
    const matchedKey = AVAILABLE_CLASS_KEYS.find((candidate) => {
      const config = getClassPreviewConfig(candidate);
      return config?.breedId === breedId;
    });
    if (matchedKey) {
      return CLASS_NAME_OVERRIDES[matchedKey] ?? matchedKey.charAt(0).toUpperCase() + matchedKey.slice(1);
    }
    return `Classe ${breedId}`;
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export async function generateCandidate(params?: GenParams): Promise<GeneratedCandidate> {
  const catalog = await getCatalog();
  const seed = `${Date.now().toString(36)}-${Math.random().toString(16).slice(2)}`;
  const rng = createRng(seed);
  const availableClasses = catalog.classes.length ? catalog.classes : ["iop", "cra", "eniripsa"];
  const classDistribution = params?.classDist ?? Object.fromEntries(
    availableClasses.map((cls) => [cls, 1 / availableClasses.length]),
  );
  const classKey = weightedSample(classDistribution, rng) || availableClasses[0];
  const classMetadata = catalog.classMetadata[classKey];
  const sexDistribution = params?.sexDist ?? { male: 0.5, female: 0.5 };
  const sexRoll = rng.next();
  const sex = sexRoll < (sexDistribution.male ?? 0.5) ? "male" : "female";
  const coverage = params?.slotCoverage?.length ? params.slotCoverage : TRAINING_SLOTS.slice();
  const slotCoverage = shuffleInPlace([...coverage], rng);
  const paletteSource = params?.paletteMode ?? DEFAULT_PALETTE_SOURCE;
  const theme = selectTheme(catalog.themes, paletteSource, `${seed}-theme`);
  let harmony: PaletteHarmony;
  if (params?.paletteBias) {
    const weights = { ...params.paletteBias } as Record<PaletteHarmony, number>;
    for (const key of HARMONIES) {
      if (!(key in weights)) {
        weights[key] = 1 / HARMONIES.length;
      }
    }
    const normalized = Object.fromEntries(
      HARMONIES.map((key) => [key, Math.max(0.001, weights[key])]),
    ) as Record<PaletteHarmony, number>;
    const total = HARMONIES.reduce((sum, key) => sum + normalized[key], 0);
    let roll = rng.next() * total;
    harmony = HARMONIES[0];
    for (const key of HARMONIES) {
      roll -= normalized[key];
      if (roll <= 0) {
        harmony = key;
        break;
      }
    }
  } else {
    harmony = HARMONIES[rng.int(HARMONIES.length)] ?? "triad";
  }
  const anchorHue = alignAnchorHue(paletteSource, theme, catalog.items, `${seed}-anchor`);
  let palette = buildPalette({
    source: paletteSource,
    harmony,
    theme,
    seed: `${seed}-palette`,
    anchorHue,
  });
  const preferJokers = Boolean(params?.preferJokers);
  const enforceColorCoherence = Boolean(params?.enforceColorCoherence);
  let anchorMap: Partial<Record<TrainingSlotKey, CatalogItem>> = {};
  let coherenceTargets: Record<TrainingSlotKey, string> | null = null;
  if (enforceColorCoherence) {
    const anchors = selectCoherenceAnchors(slotCoverage, catalog, rng);
    if (anchors.length) {
      anchorMap = anchors.reduce<Partial<Record<TrainingSlotKey, CatalogItem>>>((acc, entry) => {
        acc[entry.slot] = entry.item;
        return acc;
      }, {});
      const plan = buildCoherencePlan(slotCoverage, palette, anchors);
      palette = plan.palette;
      coherenceTargets = plan.targets;
    }
  }
  const picks: CandidateItemPick[] = [];
  let jokerCount = 0;
  for (const slot of slotCoverage) {
    const options = catalog.bySlot[slot] ?? [];
    const anchorItem = anchorMap[slot];
    if (enforceColorCoherence && anchorItem) {
      const colorKey = SLOT_TO_COLOR[slot] ?? "primary";
      const targetColor =
        (coherenceTargets && coherenceTargets[slot]) ??
        palette.colors[colorKey] ??
        palette.colors.primary;
      const targetHue = hueFromHex(targetColor);
      const assignedColor = findClosestColor(anchorItem, targetHue, targetColor);
      const pick = {
        slot,
        item: anchorItem,
        assignedColor,
        isJoker: Boolean(anchorItem.isJoker),
      };
      picks.push(pick);
      if (pick.isJoker) {
        jokerCount += 1;
      }
      continue;
    }
    const pick = pickItem(
      slot,
      palette,
      theme,
      classKey,
      preferJokers,
      enforceColorCoherence,
      coherenceTargets,
      seed,
      options,
    );
    picks.push(pick);
    if (pick.isJoker) {
      jokerCount += 1;
    }
  }
  const notes: string[] = [];
  if (theme) {
    notes.push(`Palette orientée thème ${theme}.`);
  }
  if (jokerCount > 0) {
    notes.push(`${jokerCount} joker(s) intégrés pour équilibrer la palette.`);
  }
  if (enforceColorCoherence) {
    notes.push("Palette harmonisée avec les teintes des équipements sélectionnés.");
  }
  let finalPalette = palette;
  let finalPicks = picks;
  if (enforceColorCoherence) {
    const harmonized = harmonizePaletteWithPicks(palette, picks);
    finalPalette = harmonized.palette;
    finalPicks = harmonized.picks;
  }
  return {
    id: seed,
    classKey,
    className: classMetadata?.name ?? fallbackClassName(classKey),
    classIcon: classMetadata?.icon ?? null,
    sex,
    palette: finalPalette,
    slotCoverage,
    items: finalPicks,
    theme,
    jokerCount,
    notes,
    imageUrl: null,
    preview: buildCandidatePreview(classKey, sex, finalPalette, finalPicks),
  };
}
