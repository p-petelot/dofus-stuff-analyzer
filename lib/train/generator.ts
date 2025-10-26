import { getCatalog, TRAINING_SLOTS } from "./catalog";
import { clampHue, hslToHex, hexToRgb, labDelta, rgbToHue, shiftHexColor } from "./color";
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

function buildCoherentPalette(
  basePalette: PaletteSummary,
  catalog: Catalog,
  seed: string,
): PaletteSummary {
  const rng = createRng(`${seed}-coherence`);
  const palettePool = uniquePaletteColors(
    catalog.items.flatMap((item) => item.palette.slice(0, 4)),
  );
  const fallbackPrimary = basePalette.colors.primary ?? hslToHex(rng.next() * 360, 0.62, 0.5);
  const primary = palettePool.length ? palettePool[rng.int(palettePool.length)] : fallbackPrimary;
  const primaryHue = hueFromHex(primary);
  const secondary = shiftHexColor(primary, 10 + rng.next() * 8 - 4, -0.05, 0.12);
  const accentCandidate = palettePool.length
    ? palettePool[rng.int(palettePool.length)]
    : shiftHexColor(primary, 160 + rng.next() * 30 - 15, 0.1, 0.02);
  const accent = labDelta(primary, accentCandidate) < 18
    ? shiftHexColor(primary, 150 + rng.next() * 30 - 15, 0.12, 0.04)
    : accentCandidate;
  const detail = shiftHexColor(accent, -8 + rng.next() * 6 - 3, -0.04, 0.08);
  const hair = shiftHexColor(primary, -14 + rng.next() * 10 - 5, -0.08, -0.18);
  const skinBaseHue = clampHue(primaryHue + 38 + rng.next() * 12 - 6);
  const skin = hslToHex(skinBaseHue, 0.32, 0.78);

  return {
    ...basePalette,
    anchorHue: primaryHue,
    colors: {
      hair,
      skin,
      primary,
      secondary,
      accent,
      detail,
    },
  };
}

function pickItem(
  slot: TrainingSlotKey,
  palette: PaletteSummary,
  theme: string | null,
  classKey: string,
  preferJokers: boolean,
  enforceColorCoherence: boolean,
  rngSeed: string,
  options: CatalogItem[],
): CandidateItemPick {
  const rng = createRng(`${rngSeed}-${slot}`);
  const targetColorKey = SLOT_TO_COLOR[slot] ?? "primary";
  const targetColor = palette.colors[targetColorKey] ?? palette.colors.primary;
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
  if (enforceColorCoherence) {
    palette = buildCoherentPalette(palette, catalog, seed);
  }
  const picks: CandidateItemPick[] = [];
  let jokerCount = 0;
  for (const slot of slotCoverage) {
    const options = catalog.bySlot[slot] ?? [];
    const pick = pickItem(
      slot,
      palette,
      theme,
      classKey,
      preferJokers,
      enforceColorCoherence,
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
  return {
    id: seed,
    classKey,
    className: classMetadata?.name ?? fallbackClassName(classKey),
    classIcon: classMetadata?.icon ?? null,
    sex,
    palette,
    slotCoverage,
    items: picks,
    theme,
    jokerCount,
    notes,
    imageUrl: null,
    preview: buildCandidatePreview(classKey, sex, palette, picks),
  };
}
