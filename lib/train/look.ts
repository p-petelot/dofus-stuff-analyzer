import type { CandidateItemPick, CandidatePreviewDescriptor, PaletteSummary, TrainingSex } from "./types";

interface ClassPreviewConfig {
  breedId: number;
  maleFaceId: number;
  femaleFaceId: number;
}

const CLASS_PREVIEW_CONFIG: Record<string, ClassPreviewConfig> = Object.freeze({
  feca: { breedId: 1, maleFaceId: 1, femaleFaceId: 9 },
  osamodas: { breedId: 2, maleFaceId: 17, femaleFaceId: 25 },
  enutrof: { breedId: 3, maleFaceId: 33, femaleFaceId: 41 },
  sram: { breedId: 4, maleFaceId: 49, femaleFaceId: 57 },
  xelor: { breedId: 5, maleFaceId: 65, femaleFaceId: 73 },
  ecaflip: { breedId: 6, maleFaceId: 81, femaleFaceId: 89 },
  eniripsa: { breedId: 7, maleFaceId: 97, femaleFaceId: 105 },
  iop: { breedId: 8, maleFaceId: 113, femaleFaceId: 121 },
  cra: { breedId: 9, maleFaceId: 129, femaleFaceId: 137 },
  sadida: { breedId: 10, maleFaceId: 145, femaleFaceId: 153 },
  sacrieur: { breedId: 11, maleFaceId: 161, femaleFaceId: 169 },
  pandawa: { breedId: 12, maleFaceId: 177, femaleFaceId: 185 },
  roublard: { breedId: 13, maleFaceId: 193, femaleFaceId: 201 },
  zobal: { breedId: 14, maleFaceId: 209, femaleFaceId: 217 },
  steamer: { breedId: 15, maleFaceId: 225, femaleFaceId: 233 },
  eliotrope: { breedId: 16, maleFaceId: 241, femaleFaceId: 249 },
  huppermage: { breedId: 17, maleFaceId: 257, femaleFaceId: 265 },
  ouginak: { breedId: 18, maleFaceId: 273, femaleFaceId: 275 },
  forgelance: { breedId: 19, maleFaceId: 294, femaleFaceId: 302 },
});

const DEFAULT_DIRECTION = 1;
const DEFAULT_ANIMATION = 0;

function normalizeHex(hex: string | null | undefined): string | null {
  if (!hex) {
    return null;
  }
  const trimmed = hex.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }
  return normalized.toUpperCase();
}

function hexToColorInt(hex: string | null | undefined): number | null {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return null;
  }
  const parsed = parseInt(normalized, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractItemIds(items: CandidateItemPick[]): number[] {
  return Array.from(
    new Set(
      items
        .map((pick) => (Number.isFinite(pick.item?.id) ? Number(pick.item?.id) : null))
        .filter((value): value is number => Number.isFinite(value) && value > 0),
    ),
  );
}

function normalizeClassKey(classKey: string): string {
  if (typeof classKey !== "string") {
    return "";
  }
  return classKey.trim().toLowerCase();
}

export function buildCandidatePreview(
  classKey: string,
  sex: TrainingSex,
  palette: PaletteSummary,
  items: CandidateItemPick[],
): CandidatePreviewDescriptor | null {
  const normalizedKey = normalizeClassKey(classKey);
  const config = CLASS_PREVIEW_CONFIG[normalizedKey];
  if (!config) {
    return null;
  }

  const colors = [
    hexToColorInt(palette.colors.hair),
    hexToColorInt(palette.colors.skin),
    hexToColorInt(palette.colors.outfitPrimary),
    hexToColorInt(palette.colors.outfitSecondary ?? palette.colors.outfitPrimary),
    hexToColorInt(palette.colors.accent),
  ].filter((value): value is number => Number.isFinite(value));

  if (!colors.length) {
    return null;
  }

  const itemIds = extractItemIds(items);
  const faceId = sex === "female" ? config.femaleFaceId : config.maleFaceId;
  if (!Number.isFinite(faceId)) {
    return null;
  }

  return {
    classId: config.breedId,
    faceId,
    gender: sex,
    colors,
    itemIds,
    animation: DEFAULT_ANIMATION,
    direction: DEFAULT_DIRECTION,
  };
}

export function getClassPreviewConfig(classKey: string): ClassPreviewConfig | null {
  const normalizedKey = normalizeClassKey(classKey);
  return CLASS_PREVIEW_CONFIG[normalizedKey] ?? null;
}
