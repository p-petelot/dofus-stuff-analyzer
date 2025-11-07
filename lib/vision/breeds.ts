export const BREED_NAMES: Record<number, string> = {
  1: "Feca",
  2: "Osamodas",
  3: "Enutrof",
  4: "Sram",
  5: "Xelor",
  6: "Ecaflip",
  7: "Eniripsa",
  8: "Iop",
  9: "Cra",
  10: "Sadida",
  11: "Sacrieur",
  12: "Pandawa",
  13: "Roublard",
  14: "Zobal",
  15: "Steamer",
  16: "Eliotrope",
  17: "Huppermage",
  18: "Ouginak",
  20: "Forgelance",
};

export function getBreedName(id: number) {
  return BREED_NAMES[id] ?? `Classe ${id}`;
}

export function formatModelHex(color: number) {
  return `#${color.toString(16).padStart(6, "0")}`;
}
