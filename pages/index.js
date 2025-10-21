import { useCallback, useEffect, useMemo, useRef, useState, useId } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import {
  DEFAULT_LANGUAGE,
  getLanguagePriority,
  normalizeLanguage,
  useLanguage,
} from "../lib/i18n";
import {
  ITEM_TYPES,
  FAMILIER_FILTERS,
  ITEM_FLAG_FILTERS,
  DEFAULT_FAMILIER_FILTER_STATE,
  DEFAULT_ITEM_FLAG_FILTER_STATE,
  DEFAULT_ITEM_SLOT_FILTER_STATE,
  DEFAULT_PREVIEW_BACKGROUND_STATE,
  PREVIEW_BACKGROUND_MODES,
  ITEM_TYPE_LABEL_KEYS,
  OPTIONAL_ITEM_FILTERS,
  OPTIONAL_ITEM_TYPES,
  CURATED_COLOR_SWATCHES,
  MAX_RECOMMENDATIONS,
  PANEL_ITEMS_LIMIT,
  PROPOSAL_COUNT,
} from "../lib/dofus/constants";
import {
  setActiveLocalizationPriority,
  getActiveLocalizationPriority,
} from "../lib/dofus/localization";
import { buildBreedsUrl, normalizeBreedsDataset } from "../lib/dofus/breeds";
import { buildDofusApiRequests, normalizeDofusItem, buildItemFlags } from "../lib/dofus/items";
import {
  buildBarbofusLink,
  BARBOFUS_DEFAULTS,
  BARBOFUS_GENDER_VALUES,
  BARBOFUS_DEFAULT_GENDER_KEY,
  BARBOFUS_DEFAULT_BREED,
  LOOK_PREVIEW_SIZE,
  BARBOFUS_SLOT_BY_TYPE,
  getBarbofusFaceId,
} from "../lib/barbofus";
import {
  generatePaletteFromSeed,
  buildGradientFromHex,
  buildLookPalette,
  MAX_ITEM_PALETTE_COLORS,
  normalizeColorToHex,
  hexToRgb,
} from "../lib/utils/color";
import { slugify, humanizeBackgroundName, normalizeSearchText, normalizeWhitespace } from "../lib/utils/text";
import { normalizeSelection, cycleItemSelection } from "../lib/utils/selection";
import {
  analyzeImage,
  analyzePaletteFromUrl,
  enrichItemsWithPalettes,
  computeToneDistributionFromPalette,
} from "../lib/analysis/image";
import { scoreItemAgainstPalette } from "../lib/analysis/scoring";

function hasFilterDifferences(current, defaults) {
  if (!current || !defaults) {
    return false;
  }

  const keys = Object.keys(defaults);
  for (const key of keys) {
    if ((current[key] ?? false) !== defaults[key]) {
      return true;
    }
  }

  return false;
}

export default function Home({ initialBreeds = [], previewBackgrounds: initialPreviewBackgrounds = [] }) {
  const router = useRouter();
  const routerLang = router?.query?.lang;
  const { language, languages: languageOptions, setLanguage, t } = useLanguage();
  const languageRef = useRef(language);
  const skipRouterLanguageEffectRef = useRef(false);
  const languagePriority = useMemo(() => getLanguagePriority(language), [language]);
  useEffect(() => {
    setActiveLocalizationPriority(language);
  }, [language]);

  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  useEffect(() => {
    if (!router?.isReady) {
      return;
    }
    const raw = Array.isArray(routerLang) ? routerLang[0] : routerLang;
    const normalized = normalizeLanguage(raw);

    if (skipRouterLanguageEffectRef.current) {
      const isMatchingSelection = normalized
        ? normalized === languageRef.current
        : languageRef.current === DEFAULT_LANGUAGE;
      if (!isMatchingSelection) {
        return;
      }
      skipRouterLanguageEffectRef.current = false;
    }

    if (normalized && normalized !== languageRef.current) {
      setLanguage(normalized);
    }
  }, [router?.isReady, routerLang, setLanguage]);

  const isSyncingLanguageRef = useRef(false);
  useEffect(() => {
    if (!router?.isReady) {
      return;
    }

    const raw = Array.isArray(routerLang) ? routerLang[0] : routerLang;
    const normalized = normalizeLanguage(raw);
    const isDefault = language === DEFAULT_LANGUAGE;
    const isSynced = (isDefault && !normalized) || normalized === language;
    if (isSynced) {
      isSyncingLanguageRef.current = false;
      return;
    }

    if (isSyncingLanguageRef.current) {
      return;
    }

    const nextQuery = { ...router.query };
    if (isDefault) {
      delete nextQuery.lang;
    } else {
      nextQuery.lang = language;
    }

    isSyncingLanguageRef.current = true;
    router
      .replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true })
      .finally(() => {
        isSyncingLanguageRef.current = false;
      });
  }, [language, router, routerLang]);

  const [imageSrc, setImageSrc] = useState(null);
  const [colors, setColors] = useState([]);
  const [imageSignature, setImageSignature] = useState(null);
  const [imageShape, setImageShape] = useState(null);
  const [imageTones, setImageTones] = useState(null);
  const [imageHash, setImageHash] = useState(null);
  const [imageEdges, setImageEdges] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [toast, setToast] = useState(null);
  const [itemsCatalog, setItemsCatalog] = useState({});
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(null);
  const [panelItemIndexes, setPanelItemIndexes] = useState({});
  const [proposalItemIndexes, setProposalItemIndexes] = useState({});
  const [familierFilters, setFamilierFilters] = useState(() => ({
    ...DEFAULT_FAMILIER_FILTER_STATE,
  }));
  const [itemFlagFilters, setItemFlagFilters] = useState(() => ({
    ...DEFAULT_ITEM_FLAG_FILTER_STATE,
  }));
  const [itemSlotFilters, setItemSlotFilters] = useState(() => ({
    ...DEFAULT_ITEM_SLOT_FILTER_STATE,
  }));
  const [selectedItemsBySlot, setSelectedItemsBySlot] = useState(() =>
    ITEM_TYPES.reduce((accumulator, type) => {
      accumulator[type] = null;
      return accumulator;
    }, {})
  );
  const [activeItemSlot, setActiveItemSlot] = useState(null);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [inputMode, setInputMode] = useState("image");
  const [selectedColor, setSelectedColor] = useState(null);
  const [activeProposal, setActiveProposal] = useState(0);
  const [lookPreviews, setLookPreviews] = useState({});
  const lookPreviewsRef = useRef({});
  const [downloadingPreviewId, setDownloadingPreviewId] = useState(null);
  const [useCustomSkinTone, setUseCustomSkinTone] = useState(false);
  const [showDetailedMatches, setShowDetailedMatches] = useState(false);
  const [breeds, setBreeds] = useState(() =>
    Array.isArray(initialBreeds) && initialBreeds.length ? initialBreeds : []
  );
  const [breedsLoading, setBreedsLoading] = useState(false);
  const [breedsError, setBreedsError] = useState(null);
  const [selectedBreedId, setSelectedBreedId] = useState(null);
  const [selectedGender, setSelectedGender] = useState(BARBOFUS_DEFAULT_GENDER_KEY);
  const progressHandles = useRef({ frame: null, timeout: null, value: 0 });
  const breedsRequestRef = useRef(null);
  const previewBackgroundOptions = useMemo(
    () =>
      Array.isArray(initialPreviewBackgrounds)
        ? initialPreviewBackgrounds
            .filter((entry) => entry && entry.id && entry.src)
            .map((entry) => ({
              id: entry.id,
              label: entry.label ?? humanizeBackgroundName(entry.id),
              src: entry.src,
            }))
        : [],
    [initialPreviewBackgrounds]
  );
  const [isPreviewBackgroundEnabled, setPreviewBackgroundEnabled] = useState(
    DEFAULT_PREVIEW_BACKGROUND_STATE.enabled
  );
  const [previewBackgroundMode, setPreviewBackgroundMode] = useState(
    DEFAULT_PREVIEW_BACKGROUND_STATE.mode
  );
  const [selectedPreviewBackgroundId, setSelectedPreviewBackgroundId] = useState(
    DEFAULT_PREVIEW_BACKGROUND_STATE.selection
  );
  const [randomPreviewBackgroundAssignments, setRandomPreviewBackgroundAssignments] = useState(
    {}
  );
  const [previewBackgroundSwatches, setPreviewBackgroundSwatches] = useState({});
  const previewBackgroundById = useMemo(() => {
    const map = new Map();
    previewBackgroundOptions.forEach((entry) => {
      if (entry && entry.id) {
        map.set(entry.id, entry);
      }
    });
    return map;
  }, [previewBackgroundOptions]);
  const hasPreviewBackgroundOptions = previewBackgroundOptions.length > 0;

  useEffect(() => {
    if (hasPreviewBackgroundOptions) {
      return;
    }
    if (isPreviewBackgroundEnabled) {
      setPreviewBackgroundEnabled(false);
    }
    if (previewBackgroundMode !== DEFAULT_PREVIEW_BACKGROUND_STATE.mode) {
      setPreviewBackgroundMode(DEFAULT_PREVIEW_BACKGROUND_STATE.mode);
    }
    if (selectedPreviewBackgroundId !== DEFAULT_PREVIEW_BACKGROUND_STATE.selection) {
      setSelectedPreviewBackgroundId(DEFAULT_PREVIEW_BACKGROUND_STATE.selection);
    }
    if (Object.keys(randomPreviewBackgroundAssignments).length) {
      setRandomPreviewBackgroundAssignments({});
    }
  }, [
    hasPreviewBackgroundOptions,
    isPreviewBackgroundEnabled,
    previewBackgroundMode,
    randomPreviewBackgroundAssignments,
    selectedPreviewBackgroundId,
  ]);

  useEffect(() => {
    if (!selectedPreviewBackgroundId) {
      return;
    }
    if (!previewBackgroundById.has(selectedPreviewBackgroundId)) {
      setSelectedPreviewBackgroundId(DEFAULT_PREVIEW_BACKGROUND_STATE.selection);
    }
  }, [previewBackgroundById, selectedPreviewBackgroundId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!hasPreviewBackgroundOptions) {
      setPreviewBackgroundSwatches({});
      return;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      setPreviewBackgroundSwatches({});
      return;
    }

    let cancelled = false;

    const loadAverageColor = (background) =>
      new Promise((resolve) => {
        if (!background?.id || !background?.src) {
          resolve({ id: background?.id ?? null, hex: null });
          return;
        }

        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => {
          try {
            const width = Math.max(1, image.naturalWidth || image.width || 1);
            const height = Math.max(1, image.naturalHeight || image.height || 1);
            canvas.width = width;
            canvas.height = height;
            context.clearRect(0, 0, width, height);
            context.drawImage(image, 0, 0, width, height);
            const imageData = context.getImageData(0, 0, width, height);
            const { data } = imageData;
            let totalWeight = 0;
            let r = 0;
            let g = 0;
            let b = 0;
            for (let index = 0; index < data.length; index += 4) {
              const alpha = data[index + 3] / 255;
              if (alpha <= 0) {
                continue;
              }
              const weight = alpha;
              totalWeight += weight;
              r += data[index] * weight;
              g += data[index + 1] * weight;
              b += data[index + 2] * weight;
            }
            if (totalWeight === 0) {
              resolve({ id: background.id, hex: null });
              return;
            }
            const averageR = Math.round(r / totalWeight);
            const averageG = Math.round(g / totalWeight);
            const averageB = Math.round(b / totalWeight);
            const hex = `#${averageR.toString(16).padStart(2, "0")}${averageG
              .toString(16)
              .padStart(2, "0")}${averageB.toString(16).padStart(2, "0")}`.toUpperCase();
            resolve({ id: background.id, hex });
          } catch (error) {
            resolve({ id: background.id, hex: null });
          }
        };
        image.onerror = () => resolve({ id: background.id, hex: null });
        image.src = background.src;
      });

    Promise.all(previewBackgroundOptions.map((background) => loadAverageColor(background))).then(
      (entries) => {
        if (cancelled) {
          return;
        }
        const next = {};
        entries.forEach((entry) => {
          if (entry?.id && entry?.hex) {
            next[entry.id] = entry.hex;
          }
        });
        setPreviewBackgroundSwatches(next);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [hasPreviewBackgroundOptions, previewBackgroundOptions]);

  const handleLanguageSelect = useCallback(
    (nextLanguage) => {
      if (!nextLanguage || nextLanguage === languageRef.current) {
        return;
      }
      skipRouterLanguageEffectRef.current = true;
      setLanguage(nextLanguage);
    },
    [setLanguage]
  );

  const isImageMode = inputMode === "image";
  const isColorMode = inputMode === "color";
  const isItemsMode = inputMode === "items";

  const hasCatalogData = useMemo(
    () => ITEM_TYPES.some((type) => (itemsCatalog[type] ?? []).length > 0),
    [itemsCatalog]
  );

  const activeFamilierFilterCount = useMemo(
    () =>
      FAMILIER_FILTERS.reduce(
        (total, filter) => (familierFilters[filter.key] ? total + 1 : total),
        0
      ),
    [familierFilters]
  );
  const areAllFamilierFiltersDisabled = activeFamilierFilterCount === 0;

  const hasCustomFilters = useMemo(
    () =>
      hasFilterDifferences(familierFilters, DEFAULT_FAMILIER_FILTER_STATE) ||
      hasFilterDifferences(itemFlagFilters, DEFAULT_ITEM_FLAG_FILTER_STATE) ||
      hasFilterDifferences(itemSlotFilters, DEFAULT_ITEM_SLOT_FILTER_STATE),
    [familierFilters, itemFlagFilters, itemSlotFilters]
  );

  const hasCustomPreviewBackgroundSettings = useMemo(
    () =>
      isPreviewBackgroundEnabled !== DEFAULT_PREVIEW_BACKGROUND_STATE.enabled ||
      previewBackgroundMode !== DEFAULT_PREVIEW_BACKGROUND_STATE.mode ||
      (previewBackgroundMode === PREVIEW_BACKGROUND_MODES.MANUAL &&
        selectedPreviewBackgroundId !== DEFAULT_PREVIEW_BACKGROUND_STATE.selection),
    [isPreviewBackgroundEnabled, previewBackgroundMode, selectedPreviewBackgroundId]
  );

  const [areFiltersExpanded, setFiltersExpanded] = useState(false);
  const [arePreviewBackgroundOptionsExpanded, setPreviewBackgroundOptionsExpanded] =
    useState(false);
  const filtersContentId = useId();
  const previewBackgroundContentId = useId();
  const filtersCardClassName = useMemo(() => {
    const classes = ["filters-card"];
    if (areFiltersExpanded) {
      classes.push("is-expanded");
    }
    if (hasCustomFilters) {
      classes.push("filters-card--active");
    }
    return classes.join(" ");
  }, [areFiltersExpanded, hasCustomFilters]);

  const previewBackgroundCardClassName = useMemo(() => {
    const classes = ["filters-card", "filters-card--preview"];
    if (arePreviewBackgroundOptionsExpanded) {
      classes.push("is-expanded");
    }
    if (hasCustomPreviewBackgroundSettings) {
      classes.push("filters-card--active");
    }
    return classes.join(" ");
  }, [arePreviewBackgroundOptionsExpanded, hasCustomPreviewBackgroundSettings]);

  const referenceClassName = useMemo(() => {
    const classes = ["reference"];
    if (isItemsMode) {
      classes.push("reference--items");
      if (activeItemSlot) {
        classes.push("reference--items-panel-open");
      }
    }
    return classes.join(" ");
  }, [activeItemSlot, isItemsMode]);

  const colorsCount = colors.length;

  const selectedItemHexes = useMemo(() => {
    const seen = new Set();
    const collected = [];
    ITEM_TYPES.forEach((type) => {
      const item = selectedItemsBySlot?.[type];
      if (!item || !Array.isArray(item.palette)) {
        return;
      }
      item.palette.forEach((value) => {
        const normalized = normalizeColorToHex(value);
        if (!normalized || seen.has(normalized)) {
          return;
        }
        seen.add(normalized);
        collected.push(normalized);
      });
    });
    return collected.slice(0, MAX_ITEM_PALETTE_COLORS);
  }, [selectedItemsBySlot]);

  const selectedItemPalette = useMemo(() => {
    const entries = [];
    const seen = new Set();
    selectedItemHexes.forEach((hex) => {
      const normalized = normalizeColorToHex(hex);
      if (!normalized || seen.has(normalized)) {
        return;
      }
      const rgb = hexToRgb(normalized);
      if (!rgb) {
        return;
      }
      seen.add(normalized);
      entries.push({
        hex: normalized,
        rgb: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        weight: 1,
      });
    });
    return entries.slice(0, MAX_ITEM_PALETTE_COLORS);
  }, [selectedItemHexes]);

  const filteredItemOptions = useMemo(() => {
    if (!activeItemSlot) {
      return [];
    }
    const pool = itemsCatalog?.[activeItemSlot] ?? [];
    const normalizedQuery = normalizeSearchText(itemSearchQuery);
    if (!normalizedQuery) {
      return pool;
    }
    return pool.filter((item) => {
      if (!item) {
        return false;
      }
      if (item.searchIndex) {
        return item.searchIndex.includes(normalizedQuery);
      }
      return normalizeSearchText(item.name).includes(normalizedQuery);
    });
  }, [activeItemSlot, itemSearchQuery, itemsCatalog]);

  const activeSlotTotalCount = activeItemSlot
    ? Array.isArray(itemsCatalog?.[activeItemSlot])
      ? itemsCatalog[activeItemSlot].length
      : 0
    : 0;
  const activeSlotFilteredCount = activeItemSlot ? filteredItemOptions.length : 0;
  const hasActiveSearch = Boolean(
    activeItemSlot && normalizeWhitespace(itemSearchQuery ?? "").length
  );
  const showFilteredCount =
    Boolean(activeItemSlot) &&
    hasActiveSearch &&
    activeSlotFilteredCount !== activeSlotTotalCount;
  const activeSlotCountLabel = activeItemSlot
    ? t(showFilteredCount ? "items.selector.countFiltered" : "items.selector.countTotal", {
        count: activeSlotFilteredCount,
        total: activeSlotTotalCount,
      })
    : "";

  const hasSelectedItems = useMemo(
    () => ITEM_TYPES.some((type) => Boolean(selectedItemsBySlot?.[type])),
    [selectedItemsBySlot]
  );

  const analysisModes = useMemo(
    () => [
      { key: "image", labelKey: "workspace.mode.image" },
      { key: "color", labelKey: "workspace.mode.color" },
      { key: "items", labelKey: "workspace.mode.items" },
    ],
    []
  );

  const handleFiltersToggle = useCallback(() => {
    setFiltersExpanded((value) => !value);
  }, []);

  const handlePreviewBackgroundCardToggle = useCallback(() => {
    setPreviewBackgroundOptionsExpanded((value) => !value);
  }, []);

  useEffect(() => {
    if (hasCustomFilters) {
      setFiltersExpanded(true);
    }
  }, [hasCustomFilters]);

  useEffect(() => {
    if (hasCustomPreviewBackgroundSettings) {
      setPreviewBackgroundOptionsExpanded(true);
    }
  }, [hasCustomPreviewBackgroundSettings]);

  const handleFamilierFilterToggle = useCallback((key) => {
    if (!FAMILIER_FILTERS.some((filter) => filter.key === key)) {
      return;
    }

    setFamilierFilters((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }, []);

  const handleItemFlagFilterToggle = useCallback((key) => {
    if (!ITEM_FLAG_FILTERS.some((filter) => filter.key === key)) {
      return;
    }

    setItemFlagFilters((previous) => ({
      ...previous,
      [key]: !previous[key],
    }));
  }, []);

  const handleItemSlotFilterToggle = useCallback((key) => {
    if (!OPTIONAL_ITEM_TYPES.includes(key)) {
      return;
    }

    setItemSlotFilters((previous = {}) => ({
      ...previous,
      [key]: previous[key] === false ? true : false,
    }));
  }, []);

  const handleOpenItemSlot = useCallback(
    (slot) => {
      if (!ITEM_TYPES.includes(slot)) {
        return;
      }
      if (itemSlotFilters?.[slot] === false) {
        return;
      }
      setInputMode("items");
      setActiveItemSlot(slot);
    },
    [itemSlotFilters, setInputMode]
  );

  const handleClearItemSlot = useCallback((slot) => {
    if (!ITEM_TYPES.includes(slot)) {
      return;
    }
    setSelectedItemsBySlot((previous = {}) => {
      if (!previous?.[slot]) {
        return previous;
      }
      return { ...previous, [slot]: null };
    });
  }, []);

  const handleSelectItemForSlot = useCallback(
    (slot, item) => {
      if (!ITEM_TYPES.includes(slot) || !item) {
        return;
      }
      if (itemSlotFilters?.[slot] === false) {
        return;
      }
      setInputMode("items");
      setSelectedItemsBySlot((previous = {}) => {
        const current = previous?.[slot];
        if (current) {
          const sameId = current.id && item.id && current.id === item.id;
          const sameAnkama =
            Number.isFinite(current?.ankamaId) &&
            Number.isFinite(item.ankamaId) &&
            current.ankamaId === item.ankamaId;
          if (sameId || sameAnkama) {
            return previous;
          }
        }
        return { ...previous, [slot]: item };
      });
    },
    [itemSlotFilters, setInputMode]
  );

  const handleCloseItemPanel = useCallback(() => {
    setActiveItemSlot(null);
  }, []);

  const handleItemSearchChange = useCallback((event) => {
    const value = event?.target?.value ?? "";
    setItemSearchQuery(value);
  }, []);

  const activeBreed = useMemo(() => {
    if (!Array.isArray(breeds) || breeds.length === 0) {
      return null;
    }
    if (!Number.isFinite(selectedBreedId)) {
      return null;
    }
    const found = breeds.find((entry) => entry.id === selectedBreedId);
    return found ?? null;
  }, [breeds, selectedBreedId]);

  const activeGenderConfig = useMemo(() => {
    if (!activeBreed) {
      return null;
    }
    const fallback = selectedGender === "male" ? BARBOFUS_DEFAULT_BREED.male : BARBOFUS_DEFAULT_BREED.female;
    return selectedGender === "male" ? activeBreed.male ?? fallback : activeBreed.female ?? fallback;
  }, [activeBreed, selectedGender]);

  const activeClassId = Number.isFinite(activeBreed?.id) ? activeBreed.id : null;
  const activeGenderValue = BARBOFUS_GENDER_VALUES[selectedGender] ?? BARBOFUS_DEFAULTS.gender;
  const activeGenderLabel = selectedGender === "male" ? t("identity.gender.male") : t("identity.gender.female");
  const activeClassDefaults = activeBreed ? activeGenderConfig?.colors?.numeric ?? [] : [];
  const fallbackFaceId = Number.isFinite(activeGenderConfig?.faceId)
    ? activeGenderConfig.faceId
    : Number.isFinite(activeGenderConfig?.lookId)
    ? activeGenderConfig.lookId
    : BARBOFUS_DEFAULTS.faceId;
  const activeClassFaceId = getBarbofusFaceId(activeClassId, selectedGender, fallbackFaceId);

  const fallbackColorValues = useMemo(() => {
    if (!colors.length) {
      return [];
    }
    const seen = new Set();
    const values = [];
    colors.forEach((entry) => {
      const candidate = typeof entry === "string" ? entry : entry?.hex;
      const numeric = hexToNumeric(candidate);
      if (numeric !== null && !seen.has(numeric)) {
        seen.add(numeric);
        values.push(numeric);
      }
    });
    return values;
  }, [colors]);

  const loadBreeds = useCallback(async () => {
    if (typeof fetch !== "function") {
      return;
    }

    if (breedsRequestRef.current && typeof breedsRequestRef.current.abort === "function") {
      try {
        breedsRequestRef.current.abort();
      } catch (err) {
        console.error(err);
      }
    }

    const supportsAbort = typeof AbortController !== "undefined";
    const controller = supportsAbort ? new AbortController() : null;
    if (controller) {
      breedsRequestRef.current = controller;
    } else {
      breedsRequestRef.current = null;
    }
    setBreedsLoading(true);
    setBreedsError(null);

    try {
      const fetchOptions = {
        headers: { Accept: "application/json" },
      };
      if (controller) {
        fetchOptions.signal = controller.signal;
      }

      const response = await fetch(buildBreedsUrl(language), fetchOptions);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();

      if (controller?.signal?.aborted) {
        return;
      }

      const normalized = normalizeBreedsDataset(payload, {
        language,
        languagePriority,
      });
      const dataset = normalized.length ? normalized : [BARBOFUS_DEFAULT_BREED];

      setBreeds(dataset);
      setSelectedBreedId((previous) => {
        if (previous != null && dataset.some((entry) => entry.id === previous)) {
          return previous;
        }
        return null;
      });
    } catch (err) {
      if (controller?.signal?.aborted) {
        return;
      }
      console.error(err);
      setBreedsError(t("errors.breeds"));
      setBreeds([BARBOFUS_DEFAULT_BREED]);
      setSelectedBreedId((previous) =>
        Number.isFinite(previous) && previous === BARBOFUS_DEFAULT_BREED.id ? previous : null
      );
    } finally {
      if (controller && breedsRequestRef.current === controller) {
        setBreedsLoading(false);
        breedsRequestRef.current = null;
      }
      if (!controller) {
        setBreedsLoading(false);
      }
    }
  }, [language, languagePriority, t]);

  const handleRetryBreeds = useCallback(() => {
    loadBreeds();
  }, [loadBreeds]);

  useEffect(() => {
    if (!Array.isArray(initialBreeds) || !initialBreeds.length) {
      return;
    }
    setBreeds((previous) => {
      if (
        previous.length === initialBreeds.length &&
        previous.every((entry, index) => entry.id === (initialBreeds[index]?.id ?? null))
      ) {
        return previous;
      }
      return initialBreeds;
    });
    setSelectedBreedId((previous) => {
      if (initialBreeds.some((entry) => entry.id === previous)) {
        return previous;
      }
      return null;
    });
  }, [initialBreeds]);

  const shouldPreloadBreeds = !Array.isArray(initialBreeds) || initialBreeds.length <= 1;

  useEffect(() => {
    if (shouldPreloadBreeds) {
      loadBreeds();
    }
    return () => {
      const controller = breedsRequestRef.current;
      if (controller && typeof controller.abort === "function") {
        controller.abort();
      }
    };
  }, [loadBreeds, shouldPreloadBreeds]);

  useEffect(() => {
    setShowDetailedMatches(false);
  }, [colors]);

  useEffect(() => {
    if (!isItemsMode) {
      return;
    }

    if (!selectedItemPalette.length) {
      setColors([]);
      setImageSignature(null);
      setImageShape(null);
      setImageTones(null);
      setImageHash(null);
      setImageEdges(null);
      setIsProcessing(false);
      setAnalysisProgress(0);
      setCopiedCode(null);
      setToast(null);
      setError(null);
      return;
    }

    setColors(selectedItemPalette);
    setImageSignature(null);
    setImageShape(null);
    setImageTones(
      computeToneDistributionFromPalette(selectedItemPalette.map((entry) => entry.hex))
    );
    setImageHash(null);
    setImageEdges(null);
    setIsProcessing(false);
    setAnalysisProgress(0);
    setCopiedCode(null);
    setToast(null);
    setError(null);
  }, [
    isItemsMode,
    selectedItemPalette,
    setColors,
    setImageSignature,
    setImageShape,
    setImageTones,
    setImageHash,
    setImageEdges,
    setIsProcessing,
    setAnalysisProgress,
    setCopiedCode,
    setToast,
    setError,
  ]);

  const applyColorSeed = useCallback(
    (seedHex) => {
      if (!seedHex) {
        setColors([]);
        setImageSignature(null);
        setImageShape(null);
        setImageTones(null);
        setImageHash(null);
        setImageEdges(null);
        setIsProcessing(false);
        setAnalysisProgress(0);
        setCopiedCode(null);
        setToast(null);
        setError(null);
        return;
      }

      const palette = generatePaletteFromSeed(seedHex);
      setColors(palette);
      setImageSignature(null);
      setImageShape(null);
      setImageTones(
        palette.length
          ? computeToneDistributionFromPalette(palette.map((entry) => entry.hex))
          : null
      );
      setImageHash(null);
      setImageEdges(null);
      setIsProcessing(false);
      setAnalysisProgress(0);
      setCopiedCode(null);
      setToast(null);
      setError(null);
    },
    []
  );

  useEffect(() => {
    if (inputMode !== "color") {
      return;
    }

    if (!selectedColor) {
      return;
    }

    applyColorSeed(selectedColor);
    setImageSrc(null);
  }, [applyColorSeed, inputMode, selectedColor]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handles = progressHandles.current;

    if (handles.frame) {
      window.cancelAnimationFrame(handles.frame);
      handles.frame = null;
    }
    if (handles.timeout) {
      window.clearTimeout(handles.timeout);
      handles.timeout = null;
    }

    if (isProcessing) {
      let value = typeof handles.value === "number" && handles.value > 0 ? handles.value : 6;
      value = Math.min(value, 88);
      handles.value = value;
      setAnalysisProgress(value);

      const tick = () => {
        value = Math.min(value + Math.random() * 3.4 + 0.9, 96);
        handles.value = value;
        setAnalysisProgress(value);
        handles.frame = window.requestAnimationFrame(tick);
      };

      handles.frame = window.requestAnimationFrame(tick);
    } else if (imageSrc && colorsCount > 0) {
      handles.value = 100;
      setAnalysisProgress(100);
      handles.timeout = window.setTimeout(() => {
        setAnalysisProgress(0);
        handles.value = 0;
        handles.timeout = null;
      }, 1100);
    } else {
      handles.value = 0;
      setAnalysisProgress(0);
    }

    return () => {
      if (handles.frame) {
        window.cancelAnimationFrame(handles.frame);
        handles.frame = null;
      }
      if (handles.timeout) {
        window.clearTimeout(handles.timeout);
        handles.timeout = null;
      }
    };
  }, [colorsCount, imageSrc, isProcessing]);

  const recommendations = useMemo(() => {
    if (!colors.length || !Number.isFinite(activeClassId)) {
      return null;
    }

    return ITEM_TYPES.reduce((accumulator, type) => {
      const isSlotEnabled = itemSlotFilters?.[type] !== false;
      const lockedItemCandidate = selectedItemsBySlot?.[type] ?? null;
      const lockedItem = isSlotEnabled ? lockedItemCandidate : null;

      if (!isSlotEnabled) {
        accumulator[type] = [];
        return accumulator;
      }

      let catalogItems = itemsCatalog[type] ?? [];

      if (catalogItems.length) {
        catalogItems = catalogItems.filter((item) => {
          if (!item) {
            return false;
          }

          if (itemFlagFilters.colorable === false && item.isColorable === true) {
            return false;
          }

          if (itemFlagFilters.cosmetic === false && item.isCosmetic === true) {
            return false;
          }

          return true;
        });
      }

      if (type === "familier") {
        const activeFilters = FAMILIER_FILTERS.filter((filter) => familierFilters[filter.key]);
        if (!activeFilters.length) {
          accumulator[type] = [];
          return accumulator;
        }

        const allowedKeys = new Set(activeFilters.map((filter) => filter.key));
        const allowedTypeIds = new Set(
          activeFilters.flatMap((filter) => filter.typeIds)
        );

        catalogItems = catalogItems.filter((item) => {
          if (!item) {
            return false;
          }

          if (item.familierCategory && allowedKeys.has(item.familierCategory)) {
            return true;
          }

          if (Number.isFinite(item.typeId)) {
            return allowedTypeIds.has(item.typeId);
          }

          return allowedKeys.has("pet");
        });
      }

      if (!catalogItems.length) {
        accumulator[type] = [];
        return accumulator;
      }

      const scoredItems = catalogItems
        .map((item) => ({
          item,
          score: scoreItemAgainstPalette(
            item,
            colors,
            imageSignature,
            imageShape,
            imageTones,
            imageHash,
            imageEdges
          ),
        }))
        .sort((a, b) => a.score - b.score);

      const finiteScores = scoredItems.filter(({ score }) => Number.isFinite(score));
      const rankedEntries = finiteScores.length > 0 ? finiteScores : scoredItems;
      let rankedItems = rankedEntries.map(({ item }) => item);

      if (lockedItem) {
        const matchIndex = rankedItems.findIndex((candidate) => {
          if (!candidate) {
            return false;
          }
          if (candidate.id && lockedItem.id && candidate.id === lockedItem.id) {
            return true;
          }
          if (
            Number.isFinite(candidate.ankamaId) &&
            Number.isFinite(lockedItem.ankamaId) &&
            candidate.ankamaId === lockedItem.ankamaId
          ) {
            return true;
          }
          return false;
        });

        if (matchIndex !== -1) {
          const [matched] = rankedItems.splice(matchIndex, 1);
          rankedItems = [matched, ...rankedItems];
        } else {
          rankedItems = [lockedItem, ...rankedItems];
        }
      }

      const seenIds = new Set();
      accumulator[type] = rankedItems
        .filter((item) => {
          if (!item) {
            return false;
          }
          const key = item.id ?? (Number.isFinite(item.ankamaId) ? `ankama-${item.ankamaId}` : null);
          if (key && seenIds.has(key)) {
            return false;
          }
          if (key) {
            seenIds.add(key);
          }
          return true;
        })
        .slice(0, MAX_RECOMMENDATIONS);
      return accumulator;
    }, {});
  }, [
    activeClassId,
    colors,
    imageSignature,
    imageShape,
    imageTones,
    imageHash,
    imageEdges,
    itemsCatalog,
    familierFilters,
    itemFlagFilters,
    itemSlotFilters,
    selectedItemsBySlot,
  ]);

  useEffect(() => {
    if (!recommendations) {
      setPanelItemIndexes({});
      setProposalItemIndexes({});
      return;
    }

    setPanelItemIndexes((previous) => {
      const next = {};
      let changed = false;

      ITEM_TYPES.forEach((type) => {
        const pool = recommendations[type] ?? [];
        if (!pool.length) {
          next[type] = [];
          if (Array.isArray(previous?.[type]) && previous[type].length) {
            changed = true;
          }
          return;
        }

        const limit = Math.min(PANEL_ITEMS_LIMIT, pool.length);
        const { indexes, changed: normalizedChanged } = normalizeSelection(previous?.[type], limit, pool.length);
        next[type] = indexes;
        if (normalizedChanged) {
          changed = true;
        }
      });

      const previousKeys = previous ? Object.keys(previous) : [];
      const nextKeys = Object.keys(next);

      if (
        previousKeys.length !== nextKeys.length ||
        previousKeys.some((key) => !(key in next))
      ) {
        changed = true;
      }

      if (!changed) {
        return previous;
      }

      return next;
    });

    setProposalItemIndexes((previous) => {
      const next = {};
      let changed = false;

      ITEM_TYPES.forEach((type) => {
        const pool = recommendations[type] ?? [];
        if (!pool.length) {
          next[type] = [];
          if (Array.isArray(previous?.[type]) && previous[type].length) {
            changed = true;
          }
          return;
        }

        const limit = Math.min(PROPOSAL_COUNT, pool.length);
        const { indexes, changed: normalizedChanged } = normalizeSelection(previous?.[type], limit, pool.length);
        next[type] = indexes;
        if (normalizedChanged) {
          changed = true;
        }
      });

      const previousKeys = previous ? Object.keys(previous) : [];
      const nextKeys = Object.keys(next);

      if (
        previousKeys.length !== nextKeys.length ||
        previousKeys.some((key) => !(key in next))
      ) {
        changed = true;
      }

      if (!changed) {
        return previous;
      }

      return next;
    });
  }, [recommendations]);

  const proposals = useMemo(() => {
    if (!recommendations || !Number.isFinite(activeClassId)) {
      return [];
    }

    const maxLength = Math.max(
      0,
      ...ITEM_TYPES.map((type) => (recommendations[type]?.length ?? 0))
    );

    const total = Math.min(PROPOSAL_COUNT, maxLength || 0);
    const combos = [];
    const subtitleParts = [];
    if (activeBreed?.name) {
      subtitleParts.push(activeBreed.name);
    }
    if (activeGenderLabel) {
      subtitleParts.push(activeGenderLabel);
    }
    const sharedSubtitle = subtitleParts.join(" · ");

    for (let index = 0; index < total; index += 1) {
      const items = ITEM_TYPES.map((type) => {
        const pool = recommendations[type] ?? [];
        const lockedItem = selectedItemsBySlot?.[type] ?? null;
        if (!pool.length) {
          if (lockedItem) {
            return { ...lockedItem, slotType: type };
          }
          return null;
        }

        const selections = Array.isArray(proposalItemIndexes?.[type]) ? proposalItemIndexes[type] : [];
        const selectionIndex = selections[index];
        const fallbackIndex =
          Number.isFinite(selectionIndex) && selectionIndex >= 0 && selectionIndex < pool.length
            ? selectionIndex
            : index;

        let pick = null;

        if (lockedItem) {
          pick =
            pool.find((candidate) => {
              if (!candidate) {
                return false;
              }
              if (candidate.id && lockedItem.id && candidate.id === lockedItem.id) {
                return true;
              }
              if (
                Number.isFinite(candidate.ankamaId) &&
                Number.isFinite(lockedItem.ankamaId) &&
                candidate.ankamaId === lockedItem.ankamaId
              ) {
                return true;
              }
              return false;
            }) ?? lockedItem;
        } else if (pool.length) {
          const startIndex = Math.min(pool.length - 1, Math.max(0, fallbackIndex));
          for (let offset = 0; offset < pool.length; offset += 1) {
            const candidate = pool[(startIndex + offset) % pool.length];
            if (!candidate) {
              continue;
            }
            if (Number.isFinite(candidate.ankamaId)) {
              pick = candidate;
              break;
            }
            if (!pick) {
              pick = candidate;
            }
          }
        }

        if (!pick) {
          return null;
        }

        return { ...pick, slotType: type };
      }).filter(Boolean);

      const hasRenderableEquipment = items.some((item) => Number.isFinite(item.ankamaId));
      if (!hasRenderableEquipment) {
        continue;
      }

      if (!items.length) {
        continue;
      }

      const palette = [];
      const seen = new Set();

      items.forEach((item) => {
        item.palette.forEach((hex) => {
          if (!seen.has(hex)) {
            palette.push(hex);
            seen.add(hex);
          }
        });
      });

      const paletteSample = buildLookPalette(palette, index);
      const lookItemIds = Array.from(
        new Set(
          items
            .map((item) => (Number.isFinite(item.ankamaId) ? Math.trunc(item.ankamaId) : null))
            .filter((value) => Number.isFinite(value))
        )
      ).sort((a, b) => a - b);

      const lookGenderCode =
        activeGenderValue === BARBOFUS_GENDER_VALUES.female ? "f" : "m";
      const barbofusLink = buildBarbofusLink(items, paletteSample, fallbackColorValues, {
        useCustomSkinTone,
        classId: activeClassId,
        gender: activeGenderValue,
        faceId: activeClassFaceId,
        classDefaults: activeClassDefaults,
      });

      const lookColors = (() => {
        const values = [];
        const seenColors = new Set();

        const register = (value) => {
          if (!Number.isFinite(value)) {
            return;
          }
          const normalized = Math.trunc(value);
          if (seenColors.has(normalized)) {
            return;
          }
          seenColors.add(normalized);
          values.push(normalized);
        };

        if (!useCustomSkinTone && Array.isArray(activeClassDefaults) && activeClassDefaults.length) {
          const defaultSkin = activeClassDefaults.find((entry) => Number.isFinite(entry));
          if (defaultSkin !== undefined) {
            register(defaultSkin);
          }
        }

        paletteSample.forEach((hex) => {
          const numeric = hexToNumeric(hex);
          if (numeric !== null) {
            register(numeric);
          }
        });

        fallbackColorValues.forEach(register);

        if (!useCustomSkinTone && Array.isArray(activeClassDefaults) && activeClassDefaults.length) {
          activeClassDefaults.forEach((value, index) => {
            if (index === 0) {
              return;
            }
            register(value);
          });
        }

        return values.slice(0, MAX_ITEM_PALETTE_COLORS);
      })();

      const keyParts = [];
      if (Number.isFinite(activeClassId)) {
        keyParts.push(activeClassId);
      }
      const lookFaceId = Number.isFinite(activeClassFaceId) ? activeClassFaceId : null;
      if (lookFaceId) {
        keyParts.push(`head${lookFaceId}`);
      }
      keyParts.push(lookGenderCode);
      keyParts.push(...lookItemIds);
      lookColors.forEach((value) => {
        keyParts.push(`c${value}`);
      });

      const lookKey = keyParts.length ? keyParts.join("-") : null;

      combos.push({
        id: `proposal-${index}`,
        index,
        items,
        palette: paletteSample,
        heroImage: items.find((item) => item.imageUrl)?.imageUrl ?? null,
        barbofusLink,
        className: activeBreed?.name ?? null,
        classId: Number.isFinite(activeClassId) ? activeClassId : null,
        genderLabel: activeGenderLabel,
        classIcon: activeBreed?.icon ?? null,
        subtitle: sharedSubtitle,
        lookGender: lookGenderCode,
        lookFaceId,
        lookItemIds,
        lookColors,
        lookKey,
      });
    }

    return combos;
  }, [
    activeBreed,
    activeClassDefaults,
    activeClassFaceId,
    activeClassId,
    activeGenderLabel,
    activeGenderValue,
    fallbackColorValues,
    proposalItemIndexes,
    recommendations,
    selectedItemsBySlot,
    useCustomSkinTone,
  ]);

  const previewBackgroundAutoByProposal = useMemo(() => {
    if (!previewBackgroundOptions.length) {
      return new Map();
    }

    const backgroundsWithColor = previewBackgroundOptions
      .map((entry) => {
        const swatch = previewBackgroundSwatches?.[entry.id] ?? null;
        const rgb = swatch ? hexToRgb(swatch) : null;
        return { entry, rgb };
      })
      .filter((background) => background.entry?.id && background.rgb);

    if (!backgroundsWithColor.length) {
      return new Map();
    }

    const map = new Map();

    proposals.forEach((proposal) => {
      if (!proposal?.id) {
        return;
      }

      const palette = Array.isArray(proposal.palette) ? proposal.palette : [];
      const paletteColors = palette
        .map((hex) => normalizeColorToHex(hex))
        .map((normalized) => (normalized ? hexToRgb(normalized) : null))
        .filter(Boolean);

      if (!paletteColors.length) {
        const fallback = backgroundsWithColor[proposal.index % backgroundsWithColor.length];
        if (fallback?.entry?.id) {
          map.set(proposal.id, fallback.entry.id);
        }
        return;
      }

      let bestBackground = null;
      let bestScore = Number.POSITIVE_INFINITY;

      backgroundsWithColor.forEach((background) => {
        const score =
          paletteColors.reduce((total, color) => total + colorDistance(background.rgb, color), 0) /
          paletteColors.length;
        if (score < bestScore) {
          bestScore = score;
          bestBackground = background.entry;
        }
      });

      if (bestBackground?.id) {
        map.set(proposal.id, bestBackground.id);
      }
    });

    return map;
  }, [previewBackgroundOptions, previewBackgroundSwatches, proposals]);

  useEffect(() => {
    if (
      previewBackgroundMode !== PREVIEW_BACKGROUND_MODES.RANDOM ||
      !isPreviewBackgroundEnabled ||
      !previewBackgroundOptions.length ||
      !proposals.length
    ) {
      setRandomPreviewBackgroundAssignments((previous = {}) => {
        if (!previous || Object.keys(previous).length === 0) {
          return previous;
        }
        return {};
      });
      return;
    }

    setRandomPreviewBackgroundAssignments(() => {
      const assignments = {};
      proposals.forEach((proposal) => {
        if (!proposal?.id) {
          return;
        }
        const option =
          previewBackgroundOptions[
            Math.floor(Math.random() * previewBackgroundOptions.length)
          ];
        if (option?.id) {
          assignments[proposal.id] = option.id;
        }
      });
      return assignments;
    });
  }, [
    isPreviewBackgroundEnabled,
    previewBackgroundMode,
    previewBackgroundOptions,
    proposals,
  ]);

  const proposalCount = proposals.length;
  const safeActiveProposalIndex = proposalCount
    ? Math.min(activeProposal, proposalCount - 1)
    : 0;
  const activeProposalDetails = proposalCount ? proposals[safeActiveProposalIndex] : null;
  const activeProposalSubtitle = activeProposalDetails?.subtitle ?? "";
  const activeProposalClassIcon = activeProposalDetails?.classIcon ?? null;

  useEffect(() => {
    if (!proposalCount) {
      if (activeProposal !== 0) {
        setActiveProposal(0);
      }
      return;
    }

    if (activeProposal >= proposalCount) {
      setActiveProposal(0);
    }
  }, [activeProposal, proposalCount]);

  useEffect(() => {
    lookPreviewsRef.current = lookPreviews;
  }, [lookPreviews, t]);

  useEffect(() => {
    if (!proposals.length) {
      lookPreviewsRef.current = {};
      setLookPreviews((previous = {}) => {
        if (!previous || Object.keys(previous).length === 0) {
          return previous;
        }
        return {};
      });
      return;
    }

    const activeIds = new Set(proposals.map((proposal) => proposal.id));
    setLookPreviews((previous = {}) => {
      const entries = Object.entries(previous).filter(([key]) => activeIds.has(key));
      if (entries.length === Object.keys(previous).length) {
        lookPreviewsRef.current = previous;
        return previous;
      }
      const next = Object.fromEntries(entries);
      lookPreviewsRef.current = next;
      return next;
    });

    const abortController = new AbortController();
    let cancelled = false;

    const loadPreview = async (proposal) => {
      if (
        !proposal ||
        !Array.isArray(proposal.lookItemIds) ||
        proposal.lookItemIds.length === 0 ||
        !Number.isFinite(proposal.classId) ||
        !Number.isFinite(proposal.lookFaceId)
      ) {
        return;
      }

      const existing = lookPreviewsRef.current?.[proposal.id];
      if (
        existing &&
        existing.lookKey === proposal.lookKey &&
        existing.status === "loaded"
      ) {
        return;
      }

      setLookPreviews((previous = {}) => {
        const entry = previous[proposal.id];
        if (
          entry &&
          entry.lookKey === proposal.lookKey &&
          (entry.status === "loaded" || entry.status === "loading")
        ) {
          return previous;
        }

        const next = {
          ...previous,
          [proposal.id]: {
            lookKey: proposal.lookKey,
            status: "loading",
            dataUrl: entry?.dataUrl ?? null,
            rendererUrl: entry?.rendererUrl ?? null,
            base64: entry?.base64 ?? null,
            contentType: entry?.contentType ?? null,
            byteLength: entry?.byteLength ?? null,
            error: null,
          },
        };
        lookPreviewsRef.current = next;
        return next;
      });

      try {
        const params = new URLSearchParams();
        params.set("breedId", String(proposal.classId));
        params.set("gender", proposal.lookGender ?? "m");
        params.set("lang", language);
        params.set("size", String(LOOK_PREVIEW_SIZE));
        if (Number.isFinite(proposal.lookFaceId)) {
          params.set("faceId", String(Math.trunc(proposal.lookFaceId)));
        }
        proposal.lookItemIds.forEach((id) => {
          params.append("itemIds[]", String(id));
        });
        if (Array.isArray(proposal.lookColors) && proposal.lookColors.length) {
          proposal.lookColors.slice(0, MAX_ITEM_PALETTE_COLORS).forEach((value) => {
            if (Number.isFinite(value)) {
              params.append("colors[]", String(Math.trunc(value)));
            }
          });
        }

        const response = await fetch(`/api/look-preview?${params.toString()}`, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const message = payload?.error ?? `HTTP ${response.status}`;
          throw new Error(message);
        }

        const payload = await response.json();
        if (cancelled) {
          return;
        }

        const contentType = payload?.contentType ?? "image/png";
        const base64 = payload?.base64 ?? null;
        const rendererUrl = payload?.rendererUrl ?? null;
        const byteLength =
          typeof payload?.byteLength === "number" && Number.isFinite(payload.byteLength)
            ? payload.byteLength
            : null;
        const dataUrl =
          payload?.dataUrl ??
          (base64 ? `data:${contentType};base64,${base64}` : rendererUrl ?? null);

        setLookPreviews((previous = {}) => {
          if (cancelled) {
            return previous;
          }

          const next = {
            ...previous,
            [proposal.id]: {
              lookKey: proposal.lookKey,
              status: dataUrl ? "loaded" : "error",
              dataUrl,
              rendererUrl,
              base64,
              contentType,
              byteLength,
            error: dataUrl ? null : payload?.error ?? t("errors.previewUnavailable"),
            },
          };
          lookPreviewsRef.current = next;
          return next;
        });
      } catch (error) {
        if (cancelled || error?.name === "AbortError") {
          return;
        }

        setLookPreviews((previous = {}) => {
          const next = {
            ...previous,
            [proposal.id]: {
              lookKey: proposal.lookKey,
              status: "error",
              dataUrl: null,
              rendererUrl: null,
              base64: null,
              contentType: null,
              byteLength: null,
            error: error?.message ?? t("errors.previewUnavailable"),
            },
          };
          lookPreviewsRef.current = next;
          return next;
        });
      }
    };

    proposals.forEach((proposal) => {
      void loadPreview(proposal);
    });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [language, proposals, t]);

  const handleNextProposal = useCallback(() => {
    if (!proposalCount) {
      return;
    }
    setActiveProposal((previous) => (previous + 1) % proposalCount);
  }, [proposalCount]);

  const handlePrevProposal = useCallback(() => {
    if (!proposalCount) {
      return;
    }
    setActiveProposal((previous) => (previous - 1 + proposalCount) % proposalCount);
  }, [proposalCount]);

  const handleSelectProposal = useCallback(
    (index) => {
      if (!proposalCount) {
        return;
      }
      setActiveProposal(index);
    },
    [proposalCount]
  );

  const handleLookPreviewError = useCallback((id) => {
    if (!id) {
      return;
    }

    setLookPreviews((previous = {}) => {
      const entry = previous[id];
      if (!entry || entry.status === "error") {
        return previous;
      }

      const nextEntry = {
        ...entry,
        status: "error",
        dataUrl: null,
        rendererUrl: null,
        base64: null,
        contentType: null,
        byteLength: null,
        error: entry?.error ?? t("errors.previewUnavailableDetailed"),
      };

      const next = { ...previous, [id]: nextEntry };
      lookPreviewsRef.current = next;
      return next;
    });
  }, [t]);

  const handleDownloadPreview = useCallback(async (proposal) => {
    if (!proposal) {
      return;
    }

    const lookPreview = lookPreviews?.[proposal.id];
    const hasLookPreview =
      lookPreview?.status === "loaded" &&
      typeof lookPreview?.dataUrl === "string" &&
      lookPreview.dataUrl.length > 0;

    if (!hasLookPreview) {
      return;
    }

    const resolveExtension = (type) => {
      if (!type || typeof type !== "string") {
        return "png";
      }
      const normalized = type.toLowerCase();
      if (normalized.includes("png")) return "png";
      if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
      if (normalized.includes("gif")) return "gif";
      if (normalized.includes("bmp")) return "bmp";
      if (normalized.includes("webp")) return "webp";
      return "png";
    };

    try {
      setDownloadingPreviewId(proposal.id);

      const defaultLabel = t("suggestions.render.defaultName", { index: proposal.index + 1 });
      const fallbackName = proposal.className ?? defaultLabel;
      const baseName =
        slugify(fallbackName) || slugify(defaultLabel) || `proposition-${proposal.index + 1}`;

      if (hasLookPreview) {
        const response = await fetch(lookPreview.dataUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const responseType = response.headers.get("content-type");
        const contentType = lookPreview.contentType ?? responseType ?? "image/png";
        const blob = await response.blob();
        const extension = resolveExtension(contentType);
        const url = URL.createObjectURL(blob);
        const filename = `${baseName}.${extension}`;

        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }

    } catch (error) {
      console.error("Unable to download preview:", error);
      setError(t("errors.previewDownload"));
    } finally {
      setDownloadingPreviewId(null);
    }
  }, [lookPreviews]);

  const toggleDetailedMatches = useCallback(() => {
    setShowDetailedMatches((previous) => !previous);
  }, []);

  const handleRerollItem = useCallback(
    (type, options = {}) => {
      if (!recommendations) {
        return;
      }

      const pool = recommendations[type] ?? [];
      if (selectedItemsBySlot?.[type]) {
        return;
      }
      if (!pool.length) {
        return;
      }

      const { proposalIndex = null, panelSlotIndex = null } =
        typeof options === "number" ? { panelSlotIndex: options } : options;

      let nextSelection = null;

      if (Number.isFinite(proposalIndex)) {
        const limit = Math.min(PROPOSAL_COUNT, pool.length);
        if (proposalIndex >= 0 && proposalIndex < limit) {
          setProposalItemIndexes((previous = {}) => {
            const prevIndexes = Array.isArray(previous[type]) ? previous[type] : [];
            const result = cycleItemSelection(prevIndexes, limit, pool.length, proposalIndex);
            nextSelection = result.selection;
            if (!result.changed) {
              return previous;
            }
            return { ...previous, [type]: result.indexes };
          });
        }
      }

      const targetSlot = Number.isFinite(panelSlotIndex)
        ? panelSlotIndex
        : Number.isFinite(proposalIndex)
        ? 0
        : null;

      if (Number.isFinite(targetSlot)) {
        const limit = Math.min(PANEL_ITEMS_LIMIT, pool.length);
        if (targetSlot >= 0 && targetSlot < limit) {
          setPanelItemIndexes((previous = {}) => {
            const prevIndexes = Array.isArray(previous[type]) ? previous[type] : [];
            const result = cycleItemSelection(prevIndexes, limit, pool.length, targetSlot, {
              forcedSelection: Number.isFinite(nextSelection) ? nextSelection : undefined,
            });
            if (!result.changed) {
              return previous;
            }
            return { ...previous, [type]: result.indexes };
          });
        }
      }
    },
    [recommendations, selectedItemsBySlot]
  );

  const inputRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;
    const controllers = [];

    const loadItems = async () => {
      setItemsLoading(true);
      setItemsError(null);
      const errors = [];

      try {
        const entries = await Promise.all(
          ITEM_TYPES.map(async (type) => {
            try {
              const requests = buildDofusApiRequests(type, language);
              const aggregatedItems = [];

              for (const request of requests) {
                const { url, limit, initialSkip } = request;
                let skip = Number.isFinite(initialSkip) ? initialSkip : 0;
                let expectedTotal = null;
                let pageLimit = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT;

                while (true) {
                  const pageUrl = new URL(url);
                  if (Number.isFinite(pageLimit) && pageLimit > 0) {
                    pageUrl.searchParams.set("$limit", String(pageLimit));
                  }
                  pageUrl.searchParams.set("$skip", String(skip));

                  const controller = new AbortController();
                  controllers.push(controller);

                  try {
                    const response = await fetch(pageUrl.toString(), {
                      signal: controller.signal,
                      headers: { Accept: "application/json" },
                    });

                    if (!response.ok) {
                      throw new Error(`Requête DofusDB échouée (${response.status})`);
                    }

                    const payload = await response.json();
                    const rawItems = Array.isArray(payload)
                      ? payload
                      : Array.isArray(payload?.data)
                      ? payload.data
                      : Array.isArray(payload?.items)
                      ? payload.items
                      : [];

                    if (!Array.isArray(rawItems) || rawItems.length === 0) {
                      break;
                    }

                    aggregatedItems.push(...rawItems);

                    const payloadTotal = Number(payload?.total);
                    if (Number.isFinite(payloadTotal) && payloadTotal >= 0) {
                      expectedTotal = payloadTotal;
                    }

                    const payloadLimit = Number(payload?.limit);
                    if (Number.isFinite(payloadLimit) && payloadLimit > 0) {
                      pageLimit = payloadLimit;
                    }

                    const step = Number.isFinite(pageLimit) && pageLimit > 0 ? pageLimit : rawItems.length;
                    if (!Number.isFinite(step) || step <= 0) {
                      break;
                    }

                    skip += step;

                    if (expectedTotal !== null && skip >= expectedTotal) {
                      break;
                    }

                    if ((expectedTotal === null || !Number.isFinite(expectedTotal)) && rawItems.length < step) {
                      break;
                    }
                  } catch (err) {
                    if (err.name === "AbortError") {
                      break;
                    }

                    console.error(err);
                    errors.push({ type, error: err });
                    break;
                  }
                }
              }

              if (!aggregatedItems.length) {
                return [type, []];
              }

              const normalizedItems = aggregatedItems
                .map((rawItem) =>
                  normalizeDofusItem(rawItem, type, {
                    language,
                    languagePriority,
                  })
                )
                .filter((item) => item !== null);

              const deduplicatedItems = Array.from(
                normalizedItems.reduce((accumulator, item) => {
                  if (!accumulator.has(item.id)) {
                    accumulator.set(item.id, item);
                  }
                  return accumulator;
                }, new Map()).values()
              );

              const enrichedItems = await enrichItemsWithPalettes(deduplicatedItems, () => isCancelled);

              return [type, enrichedItems];
            } catch (err) {
              if (err.name === "AbortError") {
                return [type, []];
              }

              console.error(err);
              errors.push({ type, error: err });
              return [type, []];
            }
          })
        );

        if (isCancelled) {
          return;
        }

        setItemsCatalog(Object.fromEntries(entries));

        if (errors.length) {
          const message =
            errors.length === ITEM_TYPES.length
              ? t("errors.itemsUnavailable")
              : t("errors.itemsPartial");
          setItemsError(message);
        }
      } catch (err) {
        if (isCancelled) {
          return;
        }

        console.error(err);
        setItemsCatalog({});
        setItemsError(t("errors.itemsUnavailable"));
      } finally {
        if (!isCancelled) {
          setItemsLoading(false);
        }
      }
    };

    loadItems();

    return () => {
      isCancelled = true;
      controllers.forEach((controller) => controller.abort());
    };
  }, [language, languagePriority, t]);

  useEffect(() => {
    setSelectedItemsBySlot((previous = {}) => {
      let changed = false;
      const next = { ...previous };
      ITEM_TYPES.forEach((type) => {
        const selected = previous?.[type] ?? null;
        if (!selected) {
          return;
        }
        const pool = itemsCatalog?.[type] ?? [];
        const match =
          pool.find((candidate) => {
            if (!candidate) {
              return false;
            }
            if (candidate.id && selected.id && candidate.id === selected.id) {
              return true;
            }
            if (
              Number.isFinite(candidate.ankamaId) &&
              Number.isFinite(selected.ankamaId) &&
              candidate.ankamaId === selected.ankamaId
            ) {
              return true;
            }
            return false;
          }) ?? null;

        if (!match) {
          next[type] = null;
          changed = true;
        } else if (match !== selected) {
          next[type] = match;
          changed = true;
        }
      });

      return changed ? next : previous;
    });
  }, [itemsCatalog]);

  useEffect(() => {
    setSelectedItemsBySlot((previous = {}) => {
      let changed = false;
      const next = { ...previous };
      OPTIONAL_ITEM_TYPES.forEach((type) => {
        if (itemSlotFilters?.[type] === false && next[type]) {
          next[type] = null;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [itemSlotFilters]);

  useEffect(() => {
    if (activeItemSlot && itemSlotFilters?.[activeItemSlot] === false) {
      setActiveItemSlot(null);
    }
  }, [activeItemSlot, itemSlotFilters]);

  useEffect(() => {
    if (!isItemsMode) {
      setActiveItemSlot(null);
      setItemSearchQuery("");
    }
  }, [isItemsMode]);

  useEffect(() => {
    if (!isItemsMode) {
      return;
    }

    setImageSrc((previous) => (previous === null ? previous : null));
  }, [isItemsMode]);

  useEffect(() => {
    setItemSearchQuery("");
  }, [activeItemSlot]);

  const handleDataUrl = useCallback((dataUrl) => {
    if (!dataUrl) return;
    setInputMode("image");
    setImageSrc(dataUrl);
    setIsProcessing(true);
    setError(null);
    setCopiedCode(null);
    setImageSignature(null);
    setImageShape(null);
    setImageTones(null);
    setImageHash(null);
    setImageEdges(null);

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const { palette, signature, shape, tones, hash, edges } = analyzeImage(image, {
          trimTransparent: true,
          detectEdges: true,
          gradientThreshold: 32,
          paddingRatio: 0.06,
        });
        setColors(palette);
        setImageSignature(Array.isArray(signature) && signature.length ? signature : null);
        setImageShape(shape);
        setImageTones(Array.isArray(tones) && tones.length ? tones : null);
        setImageHash(typeof hash === "string" && hash.length ? hash : null);
        setImageEdges(Array.isArray(edges) && edges.length ? edges : null);
        if (!palette || palette.length === 0) {
          setError(t("errors.noColors"));
        }
      } catch (err) {
        console.error(err);
        setError(t("errors.paletteExtraction"));
        setColors([]);
        setImageSignature(null);
        setImageShape(null);
        setImageTones(null);
        setImageHash(null);
        setImageEdges(null);
      } finally {
        setIsProcessing(false);
      }
    };
    image.onerror = () => {
      setError(t("errors.corruptedImage"));
      setIsProcessing(false);
      setColors([]);
      setImageSignature(null);
      setImageShape(null);
      setImageTones(null);
      setImageHash(null);
      setImageEdges(null);
    };
    image.src = dataUrl;
  }, [t]);

  const handleFile = useCallback(
    (file) => {
      if (!file || !file.type.startsWith("image/")) {
        setError(t("errors.fileType"));
        setImageSignature(null);
        setImageShape(null);
        setImageTones(null);
        setImageHash(null);
        setImageEdges(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === "string") {
          handleDataUrl(result);
        }
      };
      reader.onerror = () => {
        setError(t("errors.fileRead"));
      };
      reader.readAsDataURL(file);
    },
    [handleDataUrl]
  );

  useEffect(() => {
    if (!isImageMode) {
      return undefined;
    }

    const handlePaste = (event) => {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            handleFile(file);
            event.preventDefault();
            break;
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleFile, isImageMode]);

  useEffect(() => {
    if (!copiedCode) return;
    const timeout = setTimeout(() => setCopiedCode(null), 1500);
    return () => clearTimeout(timeout);
  }, [copiedCode]);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(timeout);
  }, [toast]);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      if (!isImageMode) {
        return;
      }
      setIsDragging(false);

      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile, isImageMode]
  );

  const onDragOver = useCallback(
    (event) => {
      if (!isImageMode) {
        return;
      }
      event.preventDefault();
      setIsDragging(true);
    },
    [isImageMode]
  );

  const onDragLeave = useCallback(
    (event) => {
      if (!isImageMode) {
        return;
      }
      event.preventDefault();
      setIsDragging(false);
    },
    [isImageMode]
  );

  const onBrowseClick = useCallback(() => {
    if (!isImageMode) {
      return;
    }
    inputRef.current?.click();
  }, [isImageMode]);

  const onFileInputChange = useCallback(
    (event) => {
      if (!isImageMode) {
        return;
      }
      const file = event.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile, isImageMode]
  );

  const handleColorInput = useCallback((event) => {
    const value = event.target.value;
    if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
      setSelectedColor(value.toUpperCase());
    }
  }, []);

  const handleRandomizeColor = useCallback(() => {
    const random = `#${Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")
      .toUpperCase()}`;
    setInputMode("color");
    setSelectedColor(random);
  }, []);

  const handleSeedClick = useCallback((hex) => {
    if (!hex) {
      return;
    }
    setInputMode("color");
    setSelectedColor(hex.toUpperCase());
  }, []);

  const handleCopy = useCallback(async (value, options = {}) => {
    const { swatch = null } = options;
    const fallbackCopy = (text) => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.top = "-1000px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    };

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard &&
        typeof window !== "undefined" &&
        window.isSecureContext
      ) {
        await navigator.clipboard.writeText(value);
      } else {
        fallbackCopy(value);
      }
      setError(null);
      setCopiedCode(value);
      setToast({ id: Date.now(), label: t("toast.colorCopied"), value, swatch });
    } catch (err) {
      console.error(err);
      try {
        fallbackCopy(value);
        setError(null);
        setCopiedCode(value);
        setToast({ id: Date.now(), label: t("toast.colorCopied"), value, swatch });
      } catch (fallbackErr) {
        console.error(fallbackErr);
        setError(t("errors.clipboard"));
      }
    }
  }, [t]);

  const showProgressBar = isProcessing || analysisProgress > 0;
  const clampedProgress = Math.max(0, Math.min(analysisProgress, 100));
  const safeProgress = Number.isFinite(clampedProgress) ? clampedProgress : 0;
  const displayedProgress = isProcessing
    ? Math.max(safeProgress / 100, 0.05)
    : safeProgress / 100;
  const progressLabel = isProcessing
    ? t("progress.analyzing")
    : safeProgress >= 100
    ? t("progress.completed")
    : t("progress.ready");

  const getTextColor = useCallback((color) => {
    const luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
    return luminance > 155 ? "rgba(15, 23, 42, 0.9)" : "#f8fafc";
  }, []);

  const tagline = useMemo(() => {
    const raw = t("brand.tagline");
    return typeof raw === "string" ? raw.trim() : "";
  }, [t]);

  const pageTitle = tagline ? `${BRAND_NAME} · ${tagline}` : BRAND_NAME;

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
        <meta name="description" content={t("meta.description")} />
      </Head>
      <main className="page">
        {showProgressBar ? (
          <div className="page-progress" role="status" aria-live="polite">
            <div
              className={`page-progress__indicator${isProcessing ? " page-progress__indicator--busy" : ""}`}
              style={{ transform: `scaleX(${displayedProgress})` }}
            />
            <span className="sr-only">{progressLabel}</span>
          </div>
        ) : null}
        <div className={`toast-tray${toast ? " toast-tray--visible" : ""}`} aria-live="polite">
          {toast ? (
            <div className="toast">
              <span className="toast__glow" aria-hidden="true" />
              <div className="toast__content">
                <span className="toast__icon" aria-hidden="true">✓</span>
                <div className="toast__body">
                  <span className="toast__title">{toast.label}</span>
                  <span className="toast__value">{toast.value}</span>
                </div>
                {toast.swatch ? (
                  <span
                    className="toast__swatch"
                    style={{ backgroundImage: buildGradientFromHex(toast.swatch) }}
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <header className="hero">
          <h1>{BRAND_NAME}</h1>
        </header>
        <div className="language-switcher" role="group" aria-label={t("language.selectorAria")}>
          {languageOptions.map((option) => {
            const isActive = option.code === language;
            return (
              <button
                key={option.code}
                type="button"
                className={`language-switcher__option${isActive ? " is-active" : ""}`}
                onClick={() => handleLanguageSelect(option.code)}
                aria-pressed={isActive}
                aria-label={option.accessibleLabel}
                title={option.accessibleLabel}
              >
                <span className="language-switcher__flag" aria-hidden="true">
                  <img src={option.flag} alt="" loading="lazy" />
                </span>
                <span className="language-switcher__code" aria-hidden="true">
                  {option.shortLabel ?? option.code.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>

        <section className="workspace">
          <div className={referenceClassName}>
            <div className="reference__header">
              <div className="reference__title">
                <h2>{t("workspace.referenceTitle")}</h2>
              </div>
              <div
                className="input-switch"
                role="radiogroup"
                aria-label={t("aria.analysisMode")}
              >
                {analysisModes.map((mode) => {
                  const isActive = inputMode === mode.key;
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      className={`input-switch__option${isActive ? " is-active" : ""}`}
                      onClick={() => setInputMode(mode.key)}
                      role="radio"
                      aria-checked={isActive}
                    >
                      {t(mode.labelKey)}
                    </button>
                  );
                })}
              </div>
            </div>
            {isImageMode ? (
              <div
                className={`dropzone${isDragging ? " dropzone--active" : ""}${imageSrc ? " dropzone--filled" : ""}`}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                role="button"
                tabIndex={0}
                onClick={onBrowseClick}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onBrowseClick();
                  }
                }}
              >
                {imageSrc ? (
                  <img
                    src={imageSrc}
                    alt={t("workspace.dropzone.previewAlt")}
                    className="dropzone__preview"
                  />
                ) : (
                  <div className="dropzone__placeholder">
                    <strong>{t("workspace.dropzone.primary")}</strong>
                    <span>{t("workspace.dropzone.secondary")}</span>
                    <em>{t("workspace.dropzone.formats")}</em>
                    <span className="dropzone__hint">{t("workspace.dropzone.hint")}</span>
                  </div>
                )}
                <input
                  ref={inputRef}
                  className="dropzone__input"
                  type="file"
                  accept="image/*"
                  onChange={onFileInputChange}
                />
              </div>
            ) : isColorMode ? (
              <div className="color-picker">
                <div
                  className="color-picker__preview"
                  style={{ backgroundImage: buildGradientFromHex(selectedColor) }}
                >
                  <span className="color-picker__preview-value">{selectedColor ?? "—"}</span>
                </div>
                <div className="color-picker__controls">
                  <label className="color-picker__label sr-only" htmlFor="seed-color">
                    {t("workspace.colorPicker.label")}
                  </label>
                  <div className="color-picker__inputs">
                    <input
                      id="seed-color"
                      className="color-picker__input"
                      type="color"
                      value={selectedColor ?? "#8B5CF6"}
                      onChange={handleColorInput}
                    />
                    <button type="button" className="color-picker__random" onClick={handleRandomizeColor}>
                      {t("workspace.colorPicker.random")}
                    </button>
                  </div>
                  <div className="color-picker__swatch-tray" role="list" aria-label={t("aria.colorSuggestions")}>
                    {CURATED_COLOR_SWATCHES.map((hex) => {
                      const isActive = selectedColor === hex.toUpperCase();
                      return (
                        <button
                          key={hex}
                          type="button"
                          className={`color-picker__swatch${isActive ? " is-active" : ""}`}
                          style={{ backgroundImage: buildGradientFromHex(hex) }}
                          onClick={() => handleSeedClick(hex)}
                          aria-pressed={isActive}
                        >
                          <span className="sr-only">{t("workspace.colorPicker.sr", { hex })}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="item-selector">
                <div className="item-selector__grid" role="list">
                  {ITEM_TYPES.map((type) => {
                    const slotLabel = ITEM_TYPE_LABEL_KEYS[type] ? t(ITEM_TYPE_LABEL_KEYS[type]) : type;
                    const selection = selectedItemsBySlot?.[type] ?? null;
                    const isActive = activeItemSlot === type;
                    const isSlotEnabled = itemSlotFilters?.[type] !== false;
                    const slotClasses = ["item-slot"];
                    if (isActive) {
                      slotClasses.push("item-slot--active");
                    }
                    if (selection) {
                      slotClasses.push("item-slot--filled");
                    }
                    if (!isSlotEnabled) {
                      slotClasses.push("item-slot--disabled");
                    }
                    return (
                      <div key={type} className={slotClasses.join(" ")} role="listitem">
                        <button
                          type="button"
                          className="item-slot__button"
                          onClick={() => handleOpenItemSlot(type)}
                          aria-pressed={isActive && isSlotEnabled}
                          disabled={!isSlotEnabled}
                          aria-disabled={!isSlotEnabled}
                          title={!isSlotEnabled ? t("items.selector.disabled") : undefined}
                        >
                          {!isSlotEnabled ? (
                            <span className="item-slot__placeholder item-slot__placeholder--disabled">
                              <span className="item-slot__label">{slotLabel}</span>
                              <span className="item-slot__note">{t("items.selector.disabled")}</span>
                            </span>
                          ) : selection ? (
                            <>
                              <span className="item-slot__media" aria-hidden={selection.imageUrl ? "true" : undefined}>
                                {selection.imageUrl ? (
                                  <img src={selection.imageUrl} alt="" loading="lazy" />
                                ) : (
                                  <span className="item-slot__fallback">{slotLabel}</span>
                                )}
                              </span>
                              <span className="item-slot__name">{selection.name}</span>
                            </>
                          ) : (
                            <span className="item-slot__placeholder">
                              <span className="item-slot__icon" aria-hidden="true">＋</span>
                              <span className="item-slot__label">{slotLabel}</span>
                            </span>
                          )}
                        </button>
                        {selection && isSlotEnabled ? (
                          <button
                            type="button"
                            className="item-slot__clear"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleClearItemSlot(type);
                            }}
                            aria-label={t("aria.itemSlotClear", { type: slotLabel })}
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                {activeItemSlot ? (
                  <div className="item-selector__panel is-open">
                    <div className="item-selector__panel-header">
                      <div className="item-selector__panel-title">
                        <h3>
                          {t("items.selector.title", {
                            type:
                              ITEM_TYPE_LABEL_KEYS[activeItemSlot]
                                ? t(ITEM_TYPE_LABEL_KEYS[activeItemSlot])
                                : activeItemSlot,
                          })}
                        </h3>
                        {selectedItemsBySlot?.[activeItemSlot] ? (
                          <span className="item-selector__panel-badge">
                            {t("items.selector.lockedBadge")}
                          </span>
                        ) : null}
                      </div>
                      <div className="item-selector__panel-meta">
                        <span
                          className={`item-selector__panel-count${
                            showFilteredCount ? " item-selector__panel-count--filtered" : ""
                          }`}
                        >
                          {activeSlotCountLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="item-selector__panel-close"
                        onClick={handleCloseItemPanel}
                        aria-label={t("aria.closeItemPanel")}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                    <div className="item-selector__search">
                      <label className="sr-only" htmlFor="item-search">
                        {t("items.selector.searchLabel")}
                      </label>
                      <input
                        id="item-search"
                        type="search"
                        value={itemSearchQuery}
                        onChange={handleItemSearchChange}
                        placeholder={t("items.selector.searchPlaceholder")}
                      />
                    </div>
                    <div className="item-selector__list" role="list">
                      {itemsLoading && filteredItemOptions.length === 0 ? (
                        <p className="item-selector__status">{t("items.selector.loading")}</p>
                      ) : null}
                      {itemsError && filteredItemOptions.length === 0 ? (
                        <p className="item-selector__status item-selector__status--error">{itemsError}</p>
                      ) : null}
                      {!itemsLoading && filteredItemOptions.length === 0 ? (
                        <p className="item-selector__status">{t("items.selector.empty")}</p>
                      ) : null}
                      {filteredItemOptions.length > 0 ? (
                        <ul>
                          {filteredItemOptions.map((item) => {
                            const isSelected =
                              Boolean(selectedItemsBySlot?.[activeItemSlot]) &&
                              ((selectedItemsBySlot[activeItemSlot]?.id &&
                                item.id === selectedItemsBySlot[activeItemSlot].id) ||
                                (Number.isFinite(selectedItemsBySlot[activeItemSlot]?.ankamaId) &&
                                  Number.isFinite(item.ankamaId) &&
                                  selectedItemsBySlot[activeItemSlot].ankamaId === item.ankamaId));
                            const optionClasses = ["item-option"];
                            if (isSelected) {
                              optionClasses.push("item-option--selected");
                            }
                            return (
                              <li key={item.id} className={optionClasses.join(" ")}>
                                <button
                                  type="button"
                                  onClick={() => handleSelectItemForSlot(activeItemSlot, item)}
                                  aria-pressed={isSelected}
                                >
                                  <span className="item-option__media" aria-hidden="true">
                                    {item.imageUrl ? (
                                      <img src={item.imageUrl} alt="" loading="lazy" />
                                    ) : (
                                      <span className="item-option__fallback">
                                        {ITEM_TYPE_LABEL_KEYS[activeItemSlot]
                                          ? t(ITEM_TYPE_LABEL_KEYS[activeItemSlot])
                                          : activeItemSlot}
                                      </span>
                                    )}
                                  </span>
                                  <span className="item-option__details">
                                    <span className="item-option__name">{item.name}</span>
                                    {item.palette.length ? (
                                      <span className="item-option__swatches" aria-hidden="true">
                                        {item.palette.slice(0, 4).map((hex) => (
                                          <span
                                            key={`${item.id}-${hex}`}
                                            className="item-option__swatch"
                                            style={{ backgroundColor: hex }}
                                          />
                                        ))}
                                      </span>
                                    ) : null}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="item-selector__empty">
                    {t("items.selector.hint")}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="palette">
            <div className="palette__header">
              <div className="palette__title">
                <h2>{t("palette.title")}</h2>
              </div>
              <div className="palette__actions">
                {isProcessing ? <span className="badge badge--pulse">{t("palette.badge.analyzing")}</span> : null}
                {colors.length > 0 ? (
                  <div
                    className="palette__skin-options"
                    role="radiogroup"
                    aria-label={t("palette.skin.groupLabel")}
                  >
                    <button
                      type="button"
                      className={`palette__skin-option${!useCustomSkinTone ? " is-active" : ""}`}
                      onClick={() => setUseCustomSkinTone(false)}
                      role="radio"
                      aria-checked={!useCustomSkinTone}
                    >
                      {t("palette.skin.default")}
                    </button>
                    <button
                      type="button"
                      className={`palette__skin-option${useCustomSkinTone ? " is-active" : ""}`}
                      onClick={() => setUseCustomSkinTone(true)}
                      role="radio"
                      aria-checked={useCustomSkinTone}
                    >
                      {t("palette.skin.custom")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {error ? <p className="palette__error">{error}</p> : null}
            {colors.length > 0 ? (
              <ul className="palette__list">
                {colors.map((color, index) => {
                  const value = color.hex;
                  const isCopied = copiedCode === value;
                  const textColor = getTextColor(color);
                  return (
                    <li key={`${color.hex}-${index}`} className="palette__item">
                      <button
                        type="button"
                        className={`palette__chip${isCopied ? " is-copied" : ""}`}
                        onClick={() => handleCopy(value, { swatch: color.hex })}
                        style={{ backgroundImage: buildGradientFromHex(color.hex), color: textColor }}
                      >
                        <span className="palette__chip-index">#{String(index + 1).padStart(2, "0")}</span>
                        <span className="palette__chip-value">{value}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="palette__empty">
                <p>{t("palette.empty")}</p>
              </div>
            )}
          </div>
          <div className="identity-card" role="group" aria-label={t("aria.identityCard")}>
            <div className="identity-card__section" role="group" aria-label={t("aria.genderSection")}>
              <span className="identity-card__section-title">{t("identity.gender.sectionTitle")}</span>
              <div className="identity-card__gender" role="radiogroup" aria-label={t("aria.genderGroup")}>
                <button
                  type="button"
                  className={`identity-card__gender-option${selectedGender === "male" ? " is-active" : ""}`}
                  onClick={() => setSelectedGender("male")}
                  role="radio"
                  aria-checked={selectedGender === "male"}
                >
                  <span className="identity-card__gender-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M15 3h6v6m0-6-7.5 7.5m1.5-1.5a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="identity-card__gender-text">{t("identity.gender.male")}</span>
                </button>
                <button
                  type="button"
                  className={`identity-card__gender-option${selectedGender === "female" ? " is-active" : ""}`}
                  onClick={() => setSelectedGender("female")}
                  role="radio"
                  aria-checked={selectedGender === "female"}
                >
                  <span className="identity-card__gender-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M12 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 12v8m-4-4h8"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="identity-card__gender-text">{t("identity.gender.female")}</span>
                </button>
              </div>
            </div>
            <div className="identity-card__section" role="group" aria-label={t("aria.classSection")}>
              {breedsError ? (
                <div className="identity-card__status identity-card__status--error" role="alert">
                  <span>{breedsError}</span>
                  <button
                    type="button"
                    className="identity-card__retry"
                    onClick={handleRetryBreeds}
                    disabled={breedsLoading}
                  >
                    {t("actions.retry")}
                  </button>
                </div>
              ) : null}
              {breedsLoading ? (
                <div className="identity-card__status" role="status" aria-live="polite">
                  {t("identity.class.loading")}
                </div>
              ) : null}
              <div className="identity-card__grid" role="radiogroup" aria-label={t("aria.classGroup")}>
                {breeds.map((breed) => {
                  if (!Number.isFinite(breed.id)) {
                    return null;
                  }
                  const isActive = breed.id === selectedBreedId;
                  const fallbackLetter = breed.name?.charAt(0)?.toUpperCase() ?? "?";
                  const breedLabel = breed.name ?? t("identity.class.fallback", { id: breed.id });

                  return (
                    <button
                      key={breed.slug ?? `breed-${breed.id}`}
                      type="button"
                      className={`identity-card__chip${isActive ? " is-active" : ""}`}
                      onClick={() => setSelectedBreedId(breed.id)}
                      role="radio"
                      aria-checked={isActive}
                      aria-label={t("identity.class.choose", { name: breedLabel })}
                      title={breedLabel}
                    >
                      <span className="identity-card__chip-icon">
                        {breed.icon ? (
                          <img src={breed.icon} alt="" loading="lazy" />
                        ) : (
                          <span className="identity-card__chip-letter" aria-hidden="true">
                            {fallbackLetter}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="filters-card-stack">
            <aside className={filtersCardClassName} role="group" aria-label={t("aria.filtersCard")}>
              <button
                type="button"
                className="filters-card__toggle"
                onClick={handleFiltersToggle}
                aria-expanded={areFiltersExpanded}
                aria-controls={filtersContentId}
              >
                <span className="sr-only">{t("filters.card.title")}</span>
                {hasCustomFilters ? <span className="filters-card__toggle-indicator" aria-hidden="true" /> : null}
                <span className="filters-card__toggle-glyph" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M3.5 4.25h13m-11 0 3.75 5.25v5.25l3-1.5v-3.75l3.75-5.25"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span
                  className={`filters-card__toggle-arrow${areFiltersExpanded ? " is-open" : ""}`}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" fill="none">
                    <path
                      d="M4 2.5 8 6l-4 3.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
              <div className="filters-card__content" id={filtersContentId} hidden={!areFiltersExpanded}>
              <div className="filters-card__header">
                <h2>{t("filters.card.title")}</h2>
              </div>
              <div
                className="filters-card__section"
                role="group"
                aria-label={t("aria.companionSection")}
              >
                <span className="filters-card__section-title">{t("identity.companion.sectionTitle")}</span>
                <div className="companion-toggle" role="group" aria-label={t("aria.companionFilter")}>
                  {FAMILIER_FILTERS.map((filter) => {
                    const isActive = familierFilters[filter.key] !== false;
                    const label = t(filter.labelKey);
                    const title = isActive
                      ? t("companions.toggle.hide", { label: label.toLowerCase() })
                      : t("companions.toggle.show", { label: label.toLowerCase() });

                    return (
                      <button
                        key={filter.key}
                        type="button"
                        className={`companion-toggle__chip${isActive ? " is-active" : ""}`}
                        onClick={() => handleFamilierFilterToggle(filter.key)}
                        aria-pressed={isActive}
                        title={title}
                      >
                        <span className="companion-toggle__indicator" aria-hidden="true">
                          {isActive ? (
                            <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path
                                d="M5 10.5 8.2 13.7 15 6.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <span className="companion-toggle__dot" />
                          )}
                        </span>
                        <span className="companion-toggle__label">{label}</span>
                      </button>
                    );
                  })}
                </div>
                {areAllFamilierFiltersDisabled ? (
                  <p className="companion-toggle__empty" role="status">{t("identity.companion.empty")}</p>
                ) : null}
              </div>
              <div
                className="filters-card__section"
                role="group"
                aria-label={t("aria.itemFlagSection")}
              >
                <span className="filters-card__section-title">{t("identity.filters.sectionTitle")}</span>
                <div
                  className="companion-toggle companion-toggle--item-flags"
                  role="group"
                  aria-label={t("aria.itemFlagFilter")}
                >
                  {ITEM_FLAG_FILTERS.map((filter) => {
                    const isActive = itemFlagFilters[filter.key] !== false;
                    const label = t(filter.labelKey);
                    const title = isActive
                      ? t("companions.toggle.hide", { label: label.toLowerCase() })
                      : t("companions.toggle.show", { label: label.toLowerCase() });

                    return (
                      <button
                        key={filter.key}
                        type="button"
                        className={`companion-toggle__chip${isActive ? " is-active" : ""}`}
                        onClick={() => handleItemFlagFilterToggle(filter.key)}
                        aria-pressed={isActive}
                        title={title}
                      >
                        <span className="companion-toggle__indicator" aria-hidden="true">
                          {isActive ? (
                            <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path
                                d="M5 10.5 8.2 13.7 15 6.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <span className="companion-toggle__dot" />
                          )}
                        </span>
                        <span className="companion-toggle__label">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div
                className="filters-card__section"
                role="group"
                aria-label={t("aria.optionalItemFilter")}
              >
                <span className="filters-card__section-title">{t("identity.filters.optionalTitle")}</span>
                <div
                  className="companion-toggle companion-toggle--item-slots"
                  role="group"
                  aria-label={t("aria.optionalItemFilter")}
                >
                  {OPTIONAL_ITEM_FILTERS.map((filter) => {
                    const isActive = itemSlotFilters[filter.key] !== false;
                    const label = t(filter.labelKey);
                    const title = isActive
                      ? t("companions.toggle.hide", { label: label.toLowerCase() })
                      : t("companions.toggle.show", { label: label.toLowerCase() });

                    return (
                      <button
                        key={filter.key}
                        type="button"
                        className={`companion-toggle__chip${isActive ? " is-active" : ""}`}
                        onClick={() => handleItemSlotFilterToggle(filter.key)}
                        aria-pressed={isActive}
                        title={title}
                      >
                        <span className="companion-toggle__indicator" aria-hidden="true">
                          {isActive ? (
                            <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path
                                d="M5 10.5 8.2 13.7 15 6.5"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <span className="companion-toggle__dot" />
                          )}
                        </span>
                        <span className="companion-toggle__label">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              </div>
            </aside>
            <aside
              className={previewBackgroundCardClassName}
              role="group"
              aria-label={t("aria.previewBackgroundCard")}
            >
              <button
                type="button"
                className="filters-card__toggle"
                onClick={handlePreviewBackgroundCardToggle}
                aria-expanded={arePreviewBackgroundOptionsExpanded}
                aria-controls={previewBackgroundContentId}
              >
                <span className="sr-only">{t("previewBackground.card.title")}</span>
                {hasCustomPreviewBackgroundSettings ? (
                  <span className="filters-card__toggle-indicator" aria-hidden="true" />
                ) : null}
                <span className="filters-card__toggle-glyph" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect
                      x="3.25"
                      y="4"
                      width="13.5"
                      height="9.5"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    />
                    <path
                      d="m5.5 11 3-3a1 1 0 0 1 1.5.05l2.35 3.05 1.4-1.4 2.25 2.25"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="7.25" cy="6.75" r="0.9" fill="currentColor" />
                  </svg>
                </span>
                <span
                  className={`filters-card__toggle-arrow${
                    arePreviewBackgroundOptionsExpanded ? " is-open" : ""
                  }`}
                  aria-hidden="true"
                >
                  <svg viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg" fill="none">
                    <path
                      d="M4 2.5 8 6l-4 3.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
              <div
                className="filters-card__content"
                id={previewBackgroundContentId}
                hidden={!arePreviewBackgroundOptionsExpanded}
              >
                <div className="filters-card__header">
                  <h2>{t("previewBackground.card.title")}</h2>
                </div>
                <div
                  className="filters-card__section"
                  role="group"
                  aria-label={t("aria.previewBackgroundSection")}
                >
                  <span className="filters-card__section-title">
                    {t("identity.previewBackground.sectionTitle")}
                  </span>
                  <div
                    className="companion-toggle companion-toggle--preview-background"
                    role="group"
                    aria-label={t("aria.previewBackgroundToggle")}
                  >
                    <button
                      type="button"
                      className={`companion-toggle__chip${
                        isPreviewBackgroundEnabled ? " is-active" : ""
                      }`}
                      onClick={() => {
                        if (!hasPreviewBackgroundOptions) {
                          return;
                        }
                        setPreviewBackgroundEnabled((previous) => !previous);
                      }}
                      aria-pressed={isPreviewBackgroundEnabled}
                      title={
                        isPreviewBackgroundEnabled
                          ? t("identity.previewBackground.disable")
                          : t("identity.previewBackground.enable")
                      }
                      disabled={!hasPreviewBackgroundOptions}
                    >
                      <span className="companion-toggle__indicator" aria-hidden="true">
                        {isPreviewBackgroundEnabled ? (
                          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M5 10.5 8.2 13.7 15 6.5"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        ) : (
                          <span className="companion-toggle__dot" />
                        )}
                      </span>
                      <span className="companion-toggle__label">
                        {t("identity.previewBackground.toggleLabel")}
                      </span>
                    </button>
                  </div>
                  {!hasPreviewBackgroundOptions ? (
                    <p className="preview-background-picker__empty">
                      {t("identity.previewBackground.empty")}
                    </p>
                  ) : null}
                  {hasPreviewBackgroundOptions && isPreviewBackgroundEnabled ? (
                    <div
                      className="preview-background-picker"
                      role="radiogroup"
                      aria-label={t("aria.previewBackgroundPicker")}
                    >
                      <button
                        type="button"
                        className={`preview-background-picker__option${
                          previewBackgroundMode === PREVIEW_BACKGROUND_MODES.AUTO ? " is-active" : ""
                        } preview-background-picker__option--auto`}
                        onClick={() => setPreviewBackgroundMode(PREVIEW_BACKGROUND_MODES.AUTO)}
                        role="radio"
                        aria-checked={previewBackgroundMode === PREVIEW_BACKGROUND_MODES.AUTO}
                        aria-label={t("identity.previewBackground.chooseAuto")}
                        style={{
                          backgroundImage:
                            "linear-gradient(135deg, rgba(99, 102, 241, 0.72), rgba(14, 165, 233, 0.72))",
                        }}
                      >
                        <span className="preview-background-picker__label">
                          {t("identity.previewBackground.auto")}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={`preview-background-picker__option${
                          previewBackgroundMode === PREVIEW_BACKGROUND_MODES.RANDOM ? " is-active" : ""
                        } preview-background-picker__option--random`}
                        onClick={() => setPreviewBackgroundMode(PREVIEW_BACKGROUND_MODES.RANDOM)}
                        role="radio"
                        aria-checked={previewBackgroundMode === PREVIEW_BACKGROUND_MODES.RANDOM}
                        aria-label={t("identity.previewBackground.chooseRandom")}
                        style={{
                          backgroundImage:
                            "linear-gradient(135deg, rgba(236, 72, 153, 0.72), rgba(59, 130, 246, 0.72))",
                        }}
                      >
                        <span className="preview-background-picker__label">
                          {t("identity.previewBackground.random")}
                        </span>
                      </button>
                      {previewBackgroundOptions.map((background) => {
                        const isActive =
                          previewBackgroundMode === PREVIEW_BACKGROUND_MODES.MANUAL &&
                          selectedPreviewBackgroundId === background.id;
                        const ariaLabel = t("identity.previewBackground.choose", {
                          label: background.label,
                        });
                        return (
                          <button
                            key={background.id}
                            type="button"
                            className={`preview-background-picker__option${
                              isActive ? " is-active" : ""
                            }`}
                            onClick={() => {
                              setPreviewBackgroundMode(PREVIEW_BACKGROUND_MODES.MANUAL);
                              setSelectedPreviewBackgroundId(background.id);
                            }}
                            role="radio"
                            aria-checked={isActive}
                            aria-label={ariaLabel}
                            style={{ backgroundImage: `url(${background.src})` }}
                          >
                            <span className="preview-background-picker__label">{background.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section className="suggestions">
          {itemsLoading || (itemsError && !showDetailedMatches) ? (
            <div className="suggestions__header">
              {itemsLoading ? (
                <span className="suggestions__inline-status">{t("suggestions.header.updating")}</span>
              ) : null}
              {itemsError && !showDetailedMatches ? (
                <span className="suggestions__inline-status suggestions__inline-status--error">
                  {itemsError}
                </span>
              ) : null}
            </div>
          ) : null}
          {colors.length === 0 ? (
            <div className="suggestions__empty">
              <p>
                {isItemsMode
                  ? hasSelectedItems
                    ? t("suggestions.empty.itemsPalette")
                    : t("suggestions.empty.items")
                  : t("suggestions.empty.start")}
              </p>
            </div>
          ) : !Number.isFinite(activeClassId) ? (
            <div className="suggestions__status suggestions__status--empty">
              <p>{t("suggestions.empty.identity")}</p>
            </div>
          ) : !hasCatalogData && itemsLoading ? (
            <div className="suggestions__status suggestions__status--loading">
              {t("suggestions.loading.items")}
            </div>
          ) : !hasCatalogData && itemsError ? (
            <div className="suggestions__status suggestions__status--error">{itemsError}</div>
          ) : !hasCatalogData ? (
            <div className="suggestions__status suggestions__status--empty">
              <p>{t("suggestions.empty.catalog")}</p>
            </div>
          ) : (
            <>
              {proposals.length ? (
                <div
                  className={`suggestions__layout${showDetailedMatches ? " has-panel-open" : ""}`}
                >
                  <div className="suggestions__main" aria-live="polite">
                    <div className="skin-carousel__shell">
                      <div className="skin-carousel">
                        <div className="skin-carousel__controls">
                          <button
                            type="button"
                            className="skin-carousel__nav"
                            onClick={handlePrevProposal}
                            disabled={proposalCount <= 1}
                            aria-label={t("aria.carouselPrevious")}
                          >
                            <img
                              src="/icons/arrow-left.svg"
                              alt=""
                              className="skin-carousel__nav-icon"
                              aria-hidden="true"
                            />
                          </button>
                          {(activeProposalSubtitle || proposalCount > 0) ? (
                            <div className="skin-carousel__legend" role="presentation">
                              {activeProposalSubtitle ? (
                                <span className="skin-carousel__subtitle">
                                  {activeProposalClassIcon ? (
                                    <span className="skin-carousel__class-icon" aria-hidden="true">
                                      <img src={activeProposalClassIcon} alt="" loading="lazy" />
                                    </span>
                                  ) : null}
                                  <span>{activeProposalSubtitle}</span>
                                </span>
                              ) : null}
                              {activeProposalSubtitle && proposalCount > 0 ? (
                                <span className="skin-carousel__divider" aria-hidden="true" />
                              ) : null}
                              {proposalCount > 0 ? (
                                <span className="skin-carousel__count">
                                  {t("suggestions.carousel.skinCount", {
                                    current: safeActiveProposalIndex + 1,
                                    total: proposalCount,
                                  })}
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            className="skin-carousel__nav"
                            onClick={handleNextProposal}
                            disabled={proposalCount <= 1}
                            aria-label={t("aria.carouselNext")}
                          >
                            <img
                              src="/icons/arrow-right.svg"
                              alt=""
                              className="skin-carousel__nav-icon"
                              aria-hidden="true"
                            />
                          </button>
                        </div>
                        <div className="skin-carousel__viewport">
                          <div
                            className="skin-carousel__track"
                            style={{ transform: `translateX(-${safeActiveProposalIndex * 100}%)` }}
                          >
                            {proposals.map((proposal) => {
                              const primaryColor = proposal.palette[0] ?? "#1f2937";
                              const canvasBackground = buildGradientFromHex(primaryColor);
                              const lookPreview = lookPreviews?.[proposal.id];
                              const lookLoaded =
                                lookPreview?.status === "loaded" &&
                                typeof lookPreview?.dataUrl === "string" &&
                                lookPreview.dataUrl.length > 0;
                              const lookLoading = lookPreview?.status === "loading";
                              const lookError =
                                lookPreview?.status === "error" && lookPreview?.error
                                  ? lookPreview.error
                                  : lookPreview?.status === "error"
                                ? t("errors.previewUnavailableDetailed")
                                : null;
                              const previewSrc = lookLoaded ? lookPreview.dataUrl : null;
                              const heroSrc = !lookLoaded ? proposal.heroImage ?? null : null;
                              const previewAlt = t("suggestions.render.alt", { index: proposal.index + 1 });
                              const autoBackgroundId = previewBackgroundAutoByProposal.get(proposal.id);
                              const autoBackground = autoBackgroundId
                                ? previewBackgroundById.get(autoBackgroundId)
                                : null;
                              let preferredBackground = null;
                              if (previewBackgroundMode === PREVIEW_BACKGROUND_MODES.MANUAL) {
                                preferredBackground = selectedPreviewBackgroundId
                                  ? previewBackgroundById.get(selectedPreviewBackgroundId)
                                  : null;
                                if (!preferredBackground) {
                                  preferredBackground = autoBackground;
                                }
                              } else if (previewBackgroundMode === PREVIEW_BACKGROUND_MODES.RANDOM) {
                                const randomBackgroundId =
                                  randomPreviewBackgroundAssignments?.[proposal.id] ?? null;
                                preferredBackground = randomBackgroundId
                                  ? previewBackgroundById.get(randomBackgroundId)
                                  : null;
                                if (!preferredBackground) {
                                  preferredBackground = autoBackground;
                                }
                              } else {
                                preferredBackground = autoBackground;
                              }
                              const fallbackBackground = isPreviewBackgroundEnabled
                                ? previewBackgroundOptions[proposal.index % previewBackgroundOptions.length] ?? null
                                : null;
                              const activeBackground = isPreviewBackgroundEnabled
                                ? preferredBackground ?? fallbackBackground
                                : null;
                              const canvasStyle = activeBackground
                                ? {
                                    backgroundImage: `url(${activeBackground.src})`,
                                    backgroundColor: primaryColor,
                                  }
                                : { backgroundImage: canvasBackground };
                              return (
                                <article key={proposal.id} className="skin-card">
                                  <h3 className="sr-only">{t("suggestions.carousel.proposalTitle", { index: proposal.index + 1 })}</h3>
                                  <div className="skin-card__body">
                                    <div
                                      className="skin-card__canvas"
                                      style={canvasStyle}
                                    >
                                    <div className="skin-card__render">
                                      {lookLoading ? (
                                            <div className="skin-card__loader" role="status" aria-live="polite">
                                              <span className="skin-card__loader-spinner" aria-hidden="true" />
                                              <span className="sr-only">{t("suggestions.render.loading")}</span>
                                            </div>
                                      ) : null}
                                      {lookError && !lookLoading && !lookLoaded ? (
                                        <div className="skin-card__status skin-card__status--error">
                                          {lookError}
                                        </div>
                                      ) : null}
                                      <div className="skin-card__glow" aria-hidden="true" />
                                      {previewSrc ? (
                                        <img
                                          src={previewSrc}
                                          alt={previewAlt}
                                          loading="lazy"
                                          className="skin-card__preview"
                                          onError={() => handleLookPreviewError(proposal.id)}
                                        />
                                      ) : heroSrc ? (
                                        <img
                                          src={heroSrc}
                                          alt={`Aperçu principal de la proposition ${proposal.index + 1}`}
                                          loading="lazy"
                                          className="skin-card__hero"
                                        />
                                      ) : (
                                        <div className="skin-card__placeholder" aria-hidden="true">
                                          Aperçu indisponible
                                        </div>
                                      )}
                                    </div>
                                    <ul className="skin-card__equipment" role="list">
                                      {proposal.items.map((item) => {
                                        const slotLabelKey = ITEM_TYPE_LABEL_KEYS[item.slotType];
                                        const slotLabel = slotLabelKey ? t(slotLabelKey) : item.slotType;
                                        const itemName = item.name ?? slotLabel;
                                        const altText = t("suggestions.render.itemAlt", {
                                          name: item.name ?? slotLabel,
                                        });
                                        const rerollDisabled =
                                          (recommendations?.[item.slotType]?.length ?? 0) <= 1 ||
                                          Boolean(selectedItemsBySlot?.[item.slotType]);
                                        const flagEntries = buildItemFlags(item, t);
                                        const overlayFlags = flagEntries.filter((flag) => flag.key !== "colorable");
                                        const flagSummary = flagEntries.map((flag) => flag.label).join(", ");
                                        const overlaySummary = overlayFlags.map((flag) => flag.label).join(", ");
                                        const isColorable = item.isColorable === true;
                                        const triggerClasses = ["skin-card__equipment-trigger"];
                                        if (isColorable) {
                                          triggerClasses.push("skin-card__equipment-trigger--colorable");
                                        }

                                        return (
                                          <li key={`${proposal.id}-${item.id}`} className="skin-card__equipment-slot">
                                            <div className={triggerClasses.join(" ")} tabIndex={0}>
                                              {item.imageUrl ? (
                                                <img
                                                  src={item.imageUrl}
                                                  alt={altText}
                                                  loading="lazy"
                                                  className="skin-card__equipment-icon"
                                                />
                                              ) : (
                                                <span className="skin-card__equipment-fallback">{slotLabel}</span>
                                              )}
                                              {overlayFlags.length ? (
                                                <span
                                                  className="item-flags item-flags--overlay"
                                                  role="img"
                                                  aria-label={overlaySummary || undefined}
                                                  title={overlaySummary || undefined}
                                                >
                                                  {overlayFlags.map((flag) => {
                                                    const classes = ["item-flag", "item-flag--overlay"];
                                                    if (flag.className) {
                                                      classes.push(flag.className);
                                                    }
                                                    return (
                                                      <span
                                                        key={`${proposal.id}-${item.id}-${flag.key}-equip`}
                                                        className={classes.join(" ")}
                                                      >
                                                        <img src={flag.icon} alt="" aria-hidden="true" />
                                                      </span>
                                                    );
                                                  })}
                                                </span>
                                              ) : null}
                                              <div className="skin-card__tooltip" role="tooltip">
                                                {item.imageUrl ? (
                                                  <span className="skin-card__tooltip-thumb" aria-hidden="true">
                                                    <img src={item.imageUrl} alt="" loading="lazy" />
                                                  </span>
                                                ) : null}
                                                <div className="skin-card__tooltip-body">
                                                  <span className="skin-card__tooltip-title">{itemName}</span>
                                                  <span className="skin-card__tooltip-subtitle">{slotLabel}</span>
                                                  {flagEntries.length ? (
                                                    <span className="skin-card__tooltip-flags">{flagSummary}</span>
                                                  ) : null}
                                                </div>
                                              </div>
                                            </div>
                                            <button
                                              type="button"
                                              className="skin-card__reroll"
                                              onClick={() =>
                                                handleRerollItem(item.slotType, {
                                                  proposalIndex: proposal.index,
                                                })
                                              }
                                              title={t("suggestions.render.reroll")}
                                              aria-label={t("aria.itemReroll", {
                                                type: slotLabel,
                                                item: itemName,
                                              })}
                                              disabled={rerollDisabled}
                                            >
                                              <span aria-hidden="true">↻</span>
                                            </button>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                  </div>
                                  <div className="skin-card__details">
                                    <ul className="skin-card__swatches" role="list">
                                      {proposal.palette.length ? (
                                        proposal.palette.map((hex) => (
                                          <li key={`${proposal.id}-${hex}`} className="skin-card__swatch">
                                            <button
                                              type="button"
                                              onClick={() => handleCopy(hex, { swatch: hex })}
                                              style={{ backgroundImage: buildGradientFromHex(hex) }}
                                              className="skin-card__swatch-button"
                                            >
                                              <span>{hex}</span>
                                            </button>
                                          </li>
                                        ))
                                      ) : (
                                        <li className="skin-card__swatch skin-card__swatch--empty">
                                          Palette indisponible
                                        </li>
                                      )}
                                    </ul>
                                    <ul className="skin-card__list" role="list">
                                      {proposal.items.map((item) => {
                                        const slotLabelKey = ITEM_TYPE_LABEL_KEYS[item.slotType];
                                        const slotLabel = slotLabelKey ? t(slotLabelKey) : item.slotType;
                                        const itemName = item.name ?? slotLabel;
                                        const rerollDisabled =
                                          (recommendations?.[item.slotType]?.length ?? 0) <= 1 ||
                                          Boolean(selectedItemsBySlot?.[item.slotType]);
                                        const flagEntries = buildItemFlags(item, t);
                                        const flagSummary = flagEntries.map((flag) => flag.label).join(", ");
                                        return (
                                          <li key={`${proposal.id}-${item.id}-entry`} className="skin-card__list-item">
                                            <span className="skin-card__list-type">{slotLabel}</span>
                                            <div className="skin-card__list-actions">
                                              <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="skin-card__list-link"
                                              >
                                                {item.imageUrl ? (
                                                  <span className="skin-card__list-thumb" aria-hidden="true">
                                                    <img src={item.imageUrl} alt="" loading="lazy" />
                                                  </span>
                                                ) : null}
                                                <span className="skin-card__list-text">{itemName}</span>
                                                {flagEntries.length ? (
                                                  <span
                                                    className="item-flags item-flags--compact"
                                                    role="img"
                                                    aria-label={flagSummary}
                                                    title={flagSummary}
                                                  >
                                                    {flagEntries.map((flag) => {
                                                      const classes = ["item-flag"];
                                                      if (flag.className) {
                                                        classes.push(flag.className);
                                                      }
                                                      return (
                                                        <span
                                                          key={`${proposal.id}-${item.id}-${flag.key}-list`}
                                                          className={classes.join(" ")}
                                                        >
                                                          <img src={flag.icon} alt="" aria-hidden="true" />
                                                        </span>
                                                      );
                                                    })}
                                                  </span>
                                                ) : null}
                                              </a>
                                              <button
                                                type="button"
                                                className="skin-card__reroll skin-card__reroll--inline"
                                                onClick={() =>
                                                  handleRerollItem(item.slotType, {
                                                    proposalIndex: proposal.index,
                                                  })
                                                }
                                                title={t("suggestions.render.reroll")}
                                                aria-label={t("aria.itemReroll", {
                                                  type: slotLabel,
                                                  item: itemName,
                                                })}
                                                disabled={rerollDisabled}
                                              >
                                                <span aria-hidden="true">↻</span>
                                              </button>
                                            </div>
                                          </li>
                                        );
                                      })}
                                    </ul>
                                    <div className="skin-card__actions">
                                      {lookLoaded ? (
                                        <button
                                          type="button"
                                          onClick={() => handleDownloadPreview(proposal)}
                                          className="skin-card__cta"
                                          disabled={downloadingPreviewId === proposal.id}
                                          aria-busy={downloadingPreviewId === proposal.id}
                                        >
                                          {downloadingPreviewId === proposal.id
                                            ? t("suggestions.render.downloading")
                                            : t("suggestions.render.download")}
                                        </button>
                                      ) : lookLoading ? (
                                        <span className="skin-card__cta skin-card__cta--disabled">
                                          {t("suggestions.render.loading")}
                                        </span>
                                      ) : (
                                        <span className="skin-card__cta skin-card__cta--disabled">
                                          {t("suggestions.render.unavailable")}
                                        </span>
                                      )}
                                      {proposal.barbofusLink ? (
                                        <a
                                          href={proposal.barbofusLink}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="skin-card__cta"
                                        >
                                          {t("suggestions.render.link")}
                                          <span aria-hidden="true" className="skin-card__cta-icon">
                                            ↗
                                          </span>
                                        </a>
                                      ) : (
                                        <span className="skin-card__cta skin-card__cta--disabled">
                                          {t("suggestions.render.linkUnavailable")}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </div>
                      <div className="skin-carousel__dots" role="tablist" aria-label={t("aria.carouselDots")}>
                        {proposals.map((proposal, index) => (
                          <button
                            key={`${proposal.id}-dot`}
                            type="button"
                            className={`skin-carousel__dot${index === safeActiveProposalIndex ? " is-active" : ""}`}
                            onClick={() => handleSelectProposal(index)}
                            aria-label={t("aria.carouselDotSelect", { index: index + 1 })}
                            aria-pressed={index === safeActiveProposalIndex}
                          />
                        ))}
                      </div>
                      </div>
                      <button
                        type="button"
                    className={`suggestions__panel-toggle skin-carousel__panel-toggle${showDetailedMatches ? " is-open" : ""}`}
                    onClick={toggleDetailedMatches}
                    aria-expanded={showDetailedMatches}
                    aria-label={
                      showDetailedMatches ? t("aria.panelToggleClose") : t("aria.panelToggleOpen")
                    }
                  >
                    <span className="skin-carousel__panel-toggle-icon" aria-hidden="true" />
                  </button>
                </div>
              </div>
                  <aside
                    className={`suggestions__panel${showDetailedMatches ? " is-open" : ""}`}
                    aria-hidden={!showDetailedMatches}
                  >
                  <div className="suggestions__panel-header">
                      <h3>{t("suggestions.panel.title")}</h3>
                      <button
                        type="button"
                        className="suggestions__panel-close"
                        onClick={toggleDetailedMatches}
                        aria-label={t("aria.panelClose")}
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </div>
                    {itemsError ? (
                      <p className="suggestions__status suggestions__status--error suggestions__status--inline">
                        {itemsError}
                      </p>
                    ) : null}
                    {itemsLoading ? (
                      <p className="suggestions__status suggestions__status--loading suggestions__status--inline">
                        {t("suggestions.panel.updating")}
                      </p>
                    ) : null}
                    <div className="suggestions__grid">
                      {ITEM_TYPES.map((type) => {
                        const pool = recommendations?.[type] ?? [];
                        const limit = pool.length > 0 ? Math.min(PANEL_ITEMS_LIMIT, pool.length) : 0;
                        const selections = Array.isArray(panelItemIndexes[type])
                          ? panelItemIndexes[type]
                          : [];
                        const items = Array.from({ length: limit }, (_, slotIndex) => {
                          const selectionIndex = selections[slotIndex];
                          const poolIndex =
                            Number.isFinite(selectionIndex) &&
                            selectionIndex >= 0 &&
                            selectionIndex < pool.length
                              ? selectionIndex
                              : slotIndex;

                          if (!pool[poolIndex]) {
                            return null;
                          }

                          return { item: pool[poolIndex], slotIndex };
                        }).filter(Boolean);
                        return (
                          <section key={type} className="suggestions__group">
                            <header className="suggestions__group-header">
                              <span className="suggestions__group-type">
                                {ITEM_TYPE_LABEL_KEYS[type] ? t(ITEM_TYPE_LABEL_KEYS[type]) : type}
                              </span>
                              {items.length > 0 ? (
                                <span className="suggestions__group-badge">{t("suggestions.panel.bestMatch")}</span>
                              ) : null}
                            </header>
                            {items.length === 0 ? (
                              <p className="suggestions__group-empty">{t("suggestions.panel.empty")}</p>
                            ) : (
                              <ul className="suggestions__deck">
                                {items.map(({ item }) => {
                                  const hasPalette = item.palette.length > 0;
                                  const paletteFromImage = item.paletteSource === "image" && hasPalette;
                                  const notes = [];
                                  const isColorable = item.isColorable === true;
                                  const thumbClasses = ["suggestions__thumb"];
                                  if (isColorable) {
                                    thumbClasses.push("suggestions__thumb--colorable");
                                  }
                                  if (!hasPalette) {
                                    notes.push(t("errors.paletteMissing"));
                                  } else if (!paletteFromImage) {
                                    notes.push(t("errors.paletteEstimated"));
                                  }
                                  if (!item.imageUrl) {
                                    notes.push(t("errors.imageMissing"));
                                  }
                                  const lockedSelection = selectedItemsBySlot?.[type];
                                  const isLocked = Boolean(lockedSelection) &&
                                    ((lockedSelection?.id && item.id === lockedSelection.id) ||
                                      (Number.isFinite(lockedSelection?.ankamaId) &&
                                        Number.isFinite(item.ankamaId) &&
                                        lockedSelection.ankamaId === item.ankamaId));
                                  const cardClasses = ["suggestions__card"];
                                  if (isLocked) {
                                    cardClasses.push("suggestions__card--locked");
                                  }

                                  return (
                                    <li key={item.id} className={cardClasses.join(" ")}>
                                      <div className={thumbClasses.join(" ")}>
                                        {item.imageUrl ? (
                                          <img
                                            src={item.imageUrl}
                                            alt={t("suggestions.render.itemAlt", { name: item.name })}
                                            loading="lazy"
                                          />
                                        ) : (
                                          <div className="suggestions__thumb-placeholder" aria-hidden="true">
                                            {t("suggestions.thumb.placeholder")}
                                          </div>
                                        )}
                                      </div>
                                      <div className="suggestions__card-body">
                                        <div className="suggestions__card-header">
                                          <a
                                            href={item.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="suggestions__title"
                                          >
                                            {item.name}
                                          </a>
                                          {isLocked ? (
                                            <span className="suggestions__badge suggestions__badge--locked">
                                              {t("items.selector.lockedBadge")}
                                            </span>
                                          ) : null}
                                        </div>
                                        <div
                                          className={`suggestions__swatches${hasPalette ? "" : " suggestions__swatches--empty"}`}
                                          aria-hidden={hasPalette}
                                        >
                                          {hasPalette ? (
                                            item.palette.map((hex) => (
                                              <span
                                                key={hex}
                                                className="suggestions__swatch"
                                                style={{ backgroundColor: hex }}
                                              />
                                            ))
                                        ) : (
                                            <span className="suggestions__swatch-note">{t("suggestions.palette.unavailable")}</span>
                                          )}
                                        </div>
                                        {notes.length ? (
                                          <div className="suggestions__notes">
                                            {notes.map((note, index) => (
                                              <span key={`${item.id}-note-${index}`} className="suggestions__note">
                                                {note}
                                              </span>
                                            ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  </aside>
                {showDetailedMatches ? (
                  <button
                    type="button"
                    className="suggestions__panel-backdrop"
                    onClick={toggleDetailedMatches}
                    aria-label={t("aria.panelBackdrop")}
                  >
                    <span className="sr-only">{t("aria.panelBackdrop")}</span>
                  </button>
                ) : null}
                </div>
              ) : (
                <div className="suggestions__status suggestions__status--empty">
                  <p>{t("suggestions.empty.results")}</p>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}

async function loadPreviewBackgroundsFromDisk() {
  try {
    const path = await import("path");
    const { readdir } = await import("fs/promises");
    const backgroundsDir = path.join(process.cwd(), "public", "backgrounds");
    const entries = await readdir(backgroundsDir, { withFileTypes: true }).catch(() => []);

    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    const seen = new Set();
    const items = entries
      .filter((entry) => {
        if (!entry) {
          return false;
        }
        if (typeof entry.isFile === "function") {
          return entry.isFile() && typeof entry.name === "string" && entry.name.toLowerCase().endsWith(".png");
        }
        if (typeof entry === "string") {
          return entry.toLowerCase().endsWith(".png");
        }
        return false;
      })
      .map((entry, index) => {
        const fileName = typeof entry === "string" ? entry : entry.name;
        const label = humanizeBackgroundName(fileName) || fileName.replace(/\.png$/i, "") || `Background ${
          index + 1
        }`;
        const baseSlug = slugify(label) || slugify(fileName) || `background-${index + 1}`;
        let id = baseSlug || `background-${index + 1}`;
        let attempt = 1;
        while (seen.has(id)) {
          id = `${baseSlug}-${attempt}`;
          attempt += 1;
        }
        seen.add(id);
        return {
          id,
          label,
          src: `/backgrounds/${fileName}`,
        };
      })
      .filter((entry) => entry?.id && entry?.src);

    return items.sort((a, b) => a.label.localeCompare(b.label, "fr", { sensitivity: "base" }));
  } catch (error) {
    console.error("Unable to load preview backgrounds:", error);
    return [];
  }
}

export async function getStaticProps() {
  const previewBackgrounds = await loadPreviewBackgroundsFromDisk();
  try {
    if (typeof fetch !== "function") {
      return {
        props: { initialBreeds: [BARBOFUS_DEFAULT_BREED], previewBackgrounds },
        revalidate: 3600,
      };
    }

    const response = await fetch(buildBreedsUrl(DEFAULT_LANGUAGE), {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const dataset = normalizeBreedsDataset(payload, {
      language: DEFAULT_LANGUAGE,
      languagePriority: getLanguagePriority(DEFAULT_LANGUAGE),
    });

    return {
      props: {
        initialBreeds: dataset.length ? dataset : [BARBOFUS_DEFAULT_BREED],
        previewBackgrounds,
      },
      revalidate: 3600,
    };
  } catch (error) {
    console.error("Unable to prefetch Dofus breeds:", error);
    return {
      props: { initialBreeds: [BARBOFUS_DEFAULT_BREED], previewBackgrounds },
      revalidate: 3600,
    };
  }
}
