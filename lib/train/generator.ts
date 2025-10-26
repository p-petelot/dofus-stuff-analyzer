import { getCatalog, TRAINING_SLOTS } from "./catalog";
import { clampHue, hslToHex, hexToRgb, rgbToHue } from "./color";
import { createRng, shuffleInPlace, weightedSample, jitter } from "./random";
import type {
  CandidateItemPick,
  CatalogItem,
  GenParams,
  GeneratedCandidate,
  PaletteHarmony,
  PaletteSummary,
  PaletteSource,
  TrainingSlotKey,
} from "./types";
import { buildCandidatePreview } from "./look";

const SLOT_TO_COLOR: Record<TrainingSlotKey, keyof PaletteSummary["colors"]> = {
  coiffe: "hair",
  cape: "primary",
  bouclier: "accent",
  familier: "detail",
  epauliere: "secondary",
  costume: "primary",
  ailes: "accent",
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

function pickItem(
  slot: TrainingSlotKey,
  palette: PaletteSummary,
  theme: string | null,
  classKey: string,
  preferJokers: boolean,
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
    const weight = Math.max(0.01, hueScore * themeScore * jokerScore * colorableScore * rarityScore);
    return { item, weight, minDistance };
  });
  scored.sort((a, b) => b.weight - a.weight);
  const top = scored.slice(0, Math.min(12, scored.length));
  const totalWeight = top.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng.next() * (totalWeight || 1);
  for (const entry of top) {
    roll -= entry.weight;
    if (roll <= 0) {
      return { slot, item: entry.item, assignedColor: targetColor, isJoker: entry.item.isJoker };
    }
  }
  const fallback = top[0];
  return { slot, item: fallback.item, assignedColor: targetColor, isJoker: fallback.item.isJoker };
}

function fallbackClassName(key: string): string {
  if (typeof key !== "string" || !key.trim()) {
    return "Classe inconnue";
  }
  const trimmed = key.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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
  const palette = buildPalette({
    source: paletteSource,
    harmony,
    theme,
    seed: `${seed}-palette`,
    anchorHue,
  });
  const preferJokers = Boolean(params?.preferJokers);
  const picks: CandidateItemPick[] = [];
  let jokerCount = 0;
  for (const slot of slotCoverage) {
    const options = catalog.bySlot[slot] ?? [];
    const pick = pickItem(slot, palette, theme, classKey, preferJokers, seed, options);
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
