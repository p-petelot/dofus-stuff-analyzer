export const STATIC_GALLERY_BREEDS = [
  { id: 1, name: "Féca", icon: null },
  { id: 2, name: "Osamodas", icon: null },
  { id: 3, name: "Enutrof", icon: null },
  { id: 4, name: "Sram", icon: null },
  { id: 5, name: "Xélor", icon: null },
  { id: 6, name: "Ecaflip", icon: null },
  { id: 7, name: "Eniripsa", icon: null },
  { id: 8, name: "Iop", icon: null },
  { id: 9, name: "Cra", icon: null },
  { id: 10, name: "Sadida", icon: null },
  { id: 11, name: "Sacrieur", icon: null },
  { id: 12, name: "Pandawa", icon: null },
  { id: 13, name: "Roublard", icon: null },
  { id: 14, name: "Zobal", icon: null },
  { id: 15, name: "Steamer", icon: null },
  { id: 16, name: "Eliotrope", icon: null },
  { id: 17, name: "Huppermage", icon: null },
  { id: 18, name: "Ouginak", icon: null },
  { id: 19, name: "Forgelance", icon: null },
];

const palette = {
  aurora: ["#F3E8FF", "#C084FC", "#7C3AED", "#4C1D95"],
  abyss: ["#DBEAFE", "#60A5FA", "#2563EB", "#1E3A8A"],
  ember: ["#FEE2E2", "#F97316", "#DC2626", "#7F1D1D"],
  verdant: ["#DCFCE7", "#34D399", "#059669", "#064E3B"],
  dusk: ["#E0E7FF", "#818CF8", "#4338CA", "#1E1B4B"],
  sand: ["#FEF3C7", "#FACC15", "#D97706", "#78350F"],
  frost: ["#ECFEFF", "#67E8F9", "#0EA5E9", "#075985"],
};

function item(type, ankamaId, slug, name, paletteKey, options = {}) {
  return {
    id: `${type}-${ankamaId}`,
    type,
    ankamaId,
    slug,
    name,
    palette: [...(palette[paletteKey] ?? palette.aurora)],
    imageUrl: options.imageUrl ?? null,
    url: options.url ?? null,
    paletteSource: "static",
  };
}

export const STATIC_GALLERY_ITEMS = {
  coiffe: [
    item("coiffe", 22258, "couronne-aurore", "Couronne Aurore", "aurora"),
    item("coiffe", 20704, "masque-sramourai", "Masque Sramourai", "sand"),
    item("coiffe", 19682, "capuche-glourseleste", "Capuche du Glourséleste", "frost"),
    item("coiffe", 21534, "casque-sentinelle", "Casque du Sentinelle", "dusk"),
    item("coiffe", 18547, "coiffe-elem", "Coiffe Élem", "verdant"),
    item("coiffe", 23223, "heaume-forgelave", "Heaume Forgelave", "ember"),
  ],
  cape: [
    item("cape", 22259, "manteau-aurore", "Manteau Aurore", "aurora"),
    item("cape", 20705, "cape-sramourai", "Cape Sramouraï", "sand"),
    item("cape", 19683, "cape-glourseleste", "Cape du Glourséleste", "frost"),
    item("cape", 21535, "drap-sentinelle", "Drap du Sentinelle", "dusk"),
    item("cape", 18548, "cape-elem", "Cape Élem", "verdant"),
    item("cape", 23224, "cape-forgelave", "Cape Forgelave", "ember"),
  ],
  bouclier: [
    item("bouclier", 20021, "bouclier-abyssal", "Bouclier Abyssal", "abyss"),
    item("bouclier", 22260, "bouclier-aurore", "Bouclier Aurore", "aurora"),
    item("bouclier", 21536, "bouclier-sentinelle", "Bouclier Sentinelle", "dusk"),
    item("bouclier", 18549, "bouclier-elem", "Bouclier Élem", "verdant"),
    item("bouclier", 20706, "bouclier-sramourai", "Bouclier Sramouraï", "sand"),
    item("bouclier", 23225, "bouclier-forgelave", "Bouclier Forgelave", "ember"),
  ],
  familier: [
    item("familier", 10164, "dragoune-doree", "Dragoune Dorée", "aurora"),
    item("familier", 10165, "bwakt-gris", "Bwakt Gris", "dusk"),
    item("familier", 10166, "phorror", "Phorror", "frost"),
    item("familier", 10167, "chachatte", "Chachatte", "sand"),
    item("familier", 10168, "wabbit-cale", "Wabbit Calé", "verdant"),
    item("familier", 10169, "miniminotot", "Miniminotot", "ember"),
  ],
  epauliere: [
    item("epauliere", 30001, "epaulieres-aurorales", "Épaulières Aurorales", "aurora"),
    item("epauliere", 30002, "epaulieres-sram", "Épaulières du Sram", "sand"),
    item("epauliere", 30003, "epaulieres-glours", "Épaulières Gloursonnes", "frost"),
    item("epauliere", 30004, "epaulieres-sentinelle", "Épaulières Sentinelle", "dusk"),
    item("epauliere", 30005, "epaulieres-elem", "Épaulières Élémentaires", "verdant"),
    item("epauliere", 30006, "epaulieres-forgelave", "Épaulières Forgelave", "ember"),
  ],
  costume: [
    item("costume", 19901, "parure-aurore", "Parure Aurore", "aurora"),
    item("costume", 19902, "parure-sram", "Parure Sram", "sand"),
    item("costume", 19903, "parure-glours", "Parure Glours", "frost"),
    item("costume", 19904, "parure-sentinelle", "Parure Sentinelle", "dusk"),
    item("costume", 19905, "parure-elem", "Parure Élémentaire", "verdant"),
    item("costume", 19906, "parure-forgelave", "Parure Forgelave", "ember"),
  ],
  ailes: [
    item("ailes", 30021, "ailes-cristal", "Ailes de Cristal", "aurora"),
    item("ailes", 30022, "ailes-sable", "Ailes de Sable", "sand"),
    item("ailes", 30023, "ailes-glace", "Ailes de Glace", "frost"),
    item("ailes", 30024, "ailes-nocturnes", "Ailes Nocturnes", "dusk"),
    item("ailes", 30025, "ailes-sylvestres", "Ailes Sylvestres", "verdant"),
    item("ailes", 30026, "ailes-braise", "Ailes de Braise", "ember"),
  ],
};

export function resolveStaticItemUrl(language, type, slug) {
  if (!slug) {
    return null;
  }
  return `https://www.dofus.com/${language}/mmorpg/encyclopedie/${type}/${slug}`;
}
