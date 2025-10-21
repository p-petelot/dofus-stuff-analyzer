/**
 * Shared constants that describe the Dofus item catalogue and UI defaults.
 * Centralising them here keeps the page component focused on rendering logic.
 */

export const ITEM_TYPES = ["coiffe", "cape", "bouclier", "familier", "epauliere", "costume", "ailes"];

export const DOFUS_API_HOST = "https://api.dofusdb.fr";
export const DOFUS_API_BASE_URL = `${DOFUS_API_HOST}/items`;
export const DEFAULT_LIMIT = 1200;

export const FAMILIER_FILTERS = Object.freeze([
  { key: "pet", labelKey: "companions.filters.pet", typeIds: [18, 249] },
  { key: "mount", labelKey: "companions.filters.mount", typeIds: [121, 250] },
  { key: "dragodinde", labelKey: "companions.filters.dragodinde", typeIds: [97] },
  { key: "muldo", labelKey: "companions.filters.muldo", typeIds: [196] },
  { key: "volkorne", labelKey: "companions.filters.volkorne", typeIds: [207] },
]);

export const FAMILIER_TYPE_ID_TO_FILTER_KEY = new Map();
FAMILIER_FILTERS.forEach((filter) => {
  filter.typeIds.forEach((typeId) => {
    FAMILIER_TYPE_ID_TO_FILTER_KEY.set(typeId, filter.key);
  });
});

export const ITEM_FLAG_FILTERS = Object.freeze([
  { key: "colorable", labelKey: "items.filters.colorable", flagKey: "isColorable" },
  { key: "cosmetic", labelKey: "items.filters.cosmetic", flagKey: "isCosmetic" },
]);

export const ITEM_TYPE_CONFIG = {
  coiffe: {
    requests: [
      { typeIds: [16], skip: 0, limit: 1200 },
      { typeIds: [246], skip: 0, limit: 1200 },
    ],
  },
  cape: {
    requests: [
      { typeIds: [17], skip: 0, limit: 1200 },
      { typeIds: [247], skip: 0, limit: 1200 },
    ],
  },
  familier: {
    requests: FAMILIER_FILTERS.map((filter) => ({
      typeIds: filter.typeIds,
      skip: 0,
      limit: 1200,
    })),
  },
  epauliere: {
    requests: [{ typeIds: [299], skip: 0, limit: 1200 }],
  },
  costume: {
    requests: [{ typeIds: [199], skip: 0, limit: 1200 }],
  },
  ailes: {
    requests: [{ typeIds: [300], skip: 0, limit: 1200 }],
  },
  bouclier: {
    requests: [
      { typeIds: [82], skip: 0, limit: 1200 },
      { typeIds: [248], skip: 0, limit: 1200 },
    ],
  },
};

export const ITEM_TYPE_LABEL_KEYS = {
  coiffe: "itemTypes.coiffe",
  cape: "itemTypes.cape",
  familier: "itemTypes.familier",
  bouclier: "itemTypes.bouclier",
  epauliere: "itemTypes.epauliere",
  costume: "itemTypes.costume",
  ailes: "itemTypes.ailes",
};

export const OPTIONAL_ITEM_TYPES = Object.freeze(["costume", "ailes"]);
export const OPTIONAL_ITEM_FILTERS = OPTIONAL_ITEM_TYPES.map((type) => ({
  key: type,
  labelKey: ITEM_TYPE_LABEL_KEYS[type] ?? type,
}));

export const PREVIEW_BACKGROUND_MODES = Object.freeze({
  AUTO: "auto",
  RANDOM: "random",
  MANUAL: "manual",
});

export const DEFAULT_FAMILIER_FILTER_STATE = Object.freeze(
  FAMILIER_FILTERS.reduce((accumulator, filter) => {
    const isDefaultEnabled = filter.key === "pet" || filter.key === "mount";
    accumulator[filter.key] = isDefaultEnabled;
    return accumulator;
  }, {})
);

export const DEFAULT_ITEM_FLAG_FILTER_STATE = Object.freeze(
  ITEM_FLAG_FILTERS.reduce((accumulator, filter) => {
    accumulator[filter.key] = true;
    return accumulator;
  }, {})
);

export const DEFAULT_ITEM_SLOT_FILTER_STATE = Object.freeze(
  OPTIONAL_ITEM_TYPES.reduce((accumulator, type) => {
    accumulator[type] = true;
    return accumulator;
  }, {})
);

export const DEFAULT_PREVIEW_BACKGROUND_STATE = Object.freeze({
  enabled: false,
  mode: PREVIEW_BACKGROUND_MODES.AUTO,
  selection: null,
});

export const CURATED_COLOR_SWATCHES = Object.freeze([
  "#8B5CF6",
  "#F97316",
  "#10B981",
  "#38BDF8",
  "#F43F5E",
  "#FACC15",
  "#f368e0",
  "#cc8e35",
]);

export const MAX_RECOMMENDATIONS = 12;
export const PANEL_ITEMS_LIMIT = 5;
export const PROPOSAL_COUNT = 5;
