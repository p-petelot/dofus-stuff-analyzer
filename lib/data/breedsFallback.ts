export interface FallbackBreedEntry {
  id: number;
  shortName: Record<string, string> | string;
  name?: Record<string, string> | string;
  slug?: Record<string, string> | string;
  img?: string | null;
  maleLook?: string | null;
  femaleLook?: string | null;
  maleColors?: Array<number | string>;
  femaleColors?: Array<number | string>;
  heads?: {
    male?: string | null;
    female?: string | null;
  };
  sortIndex?: number;
}

const DEFAULT_COLOR_SET = [0x6b7280, 0x475569, 0x0ea5e9, 0x1d4ed8, 0xf59e0b, 0x10b981];

function buildEntry(id: number, label: string): FallbackBreedEntry {
  return {
    id,
    shortName: { fr: label },
    name: { fr: label },
    slug: { fr: label },
    img: null,
    maleLook: null,
    femaleLook: null,
    maleColors: DEFAULT_COLOR_SET,
    femaleColors: DEFAULT_COLOR_SET,
    sortIndex: id,
  };
}

export const DOFUS_BREEDS_FALLBACK: FallbackBreedEntry[] = [
  buildEntry(1, "Féca"),
  buildEntry(2, "Osamodas"),
  buildEntry(3, "Enutrof"),
  buildEntry(4, "Sram"),
  buildEntry(5, "Xélor"),
  buildEntry(6, "Ecaflip"),
  buildEntry(7, "Eniripsa"),
  buildEntry(8, "Iop"),
  buildEntry(9, "Crâ"),
  buildEntry(10, "Sadida"),
  buildEntry(11, "Sacrieur"),
  buildEntry(12, "Pandawa"),
  buildEntry(13, "Roublard"),
  buildEntry(14, "Zobal"),
  buildEntry(15, "Steamer"),
  buildEntry(16, "Eliotrope"),
  buildEntry(17, "Huppermage"),
  buildEntry(18, "Ouginak"),
  buildEntry(19, "Forgelance"),
];

export function getFallbackBreeds(): FallbackBreedEntry[] {
  return DOFUS_BREEDS_FALLBACK.map((entry) => ({ ...entry }));
}
