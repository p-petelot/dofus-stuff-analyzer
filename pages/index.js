import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";

const ITEM_TYPES = ["coiffe", "cape", "familier", "bouclier"];
const DOFUS_API_HOST = "https://api.dofusdb.fr";
const DOFUS_API_BASE_URL = `${DOFUS_API_HOST}/items`;
const DEFAULT_LIMIT = 10;
const DEFAULT_DOFUS_QUERY_PARAMS = {
  "typeId[$ne]": "203",
  "$sort": "-id",
  "level[$gte]": "0",
  "level[$lte]": "200",
  lang: "fr",
};

const ITEM_TYPE_CONFIG = {
  coiffe: { typeIds: [82, 16], skip: 10, encyclopediaPath: "equipements" },
  cape: { typeIds: [17], skip: 10, encyclopediaPath: "equipements" },
  familier: { typeIds: [18], skip: 20, encyclopediaPath: "familiers" },
  bouclier: { typeIds: [82], skip: 0, encyclopediaPath: "equipements" },
};

const MAX_ITEM_PALETTE_COLORS = 6;
const IMAGE_REFERENCE_KEYS = [
  "url",
  "href",
  "img",
  "image",
  "icon",
  "fullSize",
  "large",
  "medium",
  "small",
  "src",
];

function slugify(value) {
  if (!value) return "";
  return value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

function stripHtml(value) {
  if (!value) return "";
  return value.replace(/<[^>]*>/g, " ");
}

function normalizeWhitespace(value) {
  if (!value) return "";
  return value.replace(/\s+/g, " ").trim();
}

function pickLocalizedValue(value) {
  if (!value) return "";
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => pickLocalizedValue(entry)).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    const priorityKeys = ["fr", "fr_fr", "frFr", "en", "en_us", "enUs"];
    for (const key of priorityKeys) {
      if (value[key]) {
        const candidate = pickLocalizedValue(value[key]);
        if (candidate) {
          return candidate;
        }
      }
    }
    const first = Object.values(value)[0];
    return pickLocalizedValue(first);
  }
  return "";
}

function normalizeTextContent(value) {
  const extracted = pickLocalizedValue(value);
  if (!extracted) {
    return "";
  }
  return normalizeWhitespace(stripHtml(extracted));
}

function normalizeColorToHex(color) {
  if (color === null || color === undefined) {
    return null;
  }

  if (typeof color === "number" && Number.isFinite(color)) {
    const hex = Math.max(0, Math.floor(color)).toString(16).padStart(6, "0").slice(-6);
    return `#${hex.toUpperCase()}`;
  }

  if (typeof color === "string") {
    const trimmed = color.trim();
    if (!trimmed) return null;
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    const hexMatch = trimmed.match(/[0-9a-fA-F]{6}/);
    if (hexMatch) {
      return `#${hexMatch[0].toUpperCase()}`;
    }
    if (/^\d+$/.test(trimmed)) {
      return normalizeColorToHex(Number(trimmed));
    }
  }

  if (typeof color === "object") {
    if (color.hex) return normalizeColorToHex(color.hex);
    if (color.value) return normalizeColorToHex(color.value);
    if (color.color) return normalizeColorToHex(color.color);
  }

  return null;
}

function extractPaletteFromItemData(item) {
  const palette = [];
  const seen = new Set();

  const register = (value) => {
    const hex = normalizeColorToHex(value);
    if (!hex || seen.has(hex)) {
      return;
    }
    seen.add(hex);
    palette.push(hex);
  };

  const sources = [
    item?.appearance?.colors,
    item?.look?.colors,
    item?.colors,
    item?.palette,
    item?.color,
    item?.visual?.colors,
  ];

  sources.forEach((source) => {
    if (!source) return;
    if (Array.isArray(source)) {
      source.forEach(register);
      return;
    }
    if (typeof source === "object") {
      Object.values(source).forEach(register);
      return;
    }
    register(source);
  });

  if (typeof item?.look === "string") {
    const hexMatches = item.look.match(/#?[0-9a-fA-F]{6}/g);
    if (hexMatches) {
      hexMatches.forEach(register);
    } else {
      const numericMatches = item.look.match(/\b\d{3,}\b/g);
      if (numericMatches) {
        numericMatches.forEach((match) => register(Number(match)));
      }
    }
  }

  return palette.slice(0, MAX_ITEM_PALETTE_COLORS);
}

function ensureAbsoluteUrl(path) {
  if (!path) return null;
  if (typeof path !== "string") return null;

  const trimmed = path.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (trimmed.startsWith("/")) {
    return `${DOFUS_API_HOST}${trimmed}`;
  }
  return `${DOFUS_API_HOST}/${trimmed}`;
}

function flattenImageReference(reference) {
  if (!reference) return null;
  if (typeof reference === "string") {
    return reference;
  }
  if (Array.isArray(reference)) {
    for (const entry of reference) {
      const nested = flattenImageReference(entry);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
  if (typeof reference === "object") {
    for (const key of IMAGE_REFERENCE_KEYS) {
      if (reference[key]) {
        const nested = flattenImageReference(reference[key]);
        if (nested) {
          return nested;
        }
      }
    }
  }
  return null;
}

function resolveItemImageUrl(item) {
  const candidates = [
    item?.img,
    item?.image,
    item?.icon,
    item?.images,
    item?.look?.img,
  ];

  for (const candidate of candidates) {
    const flattened = flattenImageReference(candidate);
    const absolute = ensureAbsoluteUrl(flattened);
    if (absolute) {
      return absolute;
    }
  }

  return null;
}

function buildDofusApiUrl(type) {
  const config = ITEM_TYPE_CONFIG[type];
  if (!config) {
    throw new Error(`Type d'objet inconnu: ${type}`);
  }

  const params = new URLSearchParams();
  Object.entries(DEFAULT_DOFUS_QUERY_PARAMS).forEach(([key, value]) => {
    params.set(key, value);
  });
  params.set("$limit", String(config.limit ?? DEFAULT_LIMIT));
  if (typeof config.skip === "number") {
    params.set("$skip", String(config.skip));
  }
  config.typeIds.forEach((id) => {
    params.append("typeId[$in][]", String(id));
  });
  if (config.query) {
    Object.entries(config.query).forEach(([key, value]) => {
      params.set(key, value);
    });
  }

  return `${DOFUS_API_BASE_URL}?${params.toString()}`;
}

function buildEncyclopediaUrl(type, item, slug, fallbackId) {
  const config = ITEM_TYPE_CONFIG[type];
  const ankamaId = item?.ankamaId ?? item?.id ?? item?._id ?? fallbackId;
  if (!ankamaId) {
    return null;
  }
  const slugCandidate = slug || slugify(pickLocalizedValue(item?.slug) || pickLocalizedValue(item?.name) || ankamaId);
  const safeSlug = slugCandidate || String(ankamaId);
  const basePath = config?.encyclopediaPath ?? "equipements";
  return `https://www.dofus.com/fr/mmorpg/encyclopedie/${basePath}/${ankamaId}-${safeSlug}`;
}

function normalizeDofusItem(item, type) {
  const name = normalizeTextContent(item?.name) || normalizeTextContent(item?.title);
  if (!name) {
    return null;
  }

  const slugSource = normalizeTextContent(item?.slug) || name;
  const slug = slugify(slugSource) || slugify(name);
  const ankamaId = item?.ankamaId ?? item?.id ?? item?._id ?? slug;
  const encyclopediaUrl = buildEncyclopediaUrl(type, item, slug, ankamaId) ??
    "https://www.dofus.com/fr/mmorpg/encyclopedie";
  const imageUrl = resolveItemImageUrl(item);
  const palette = extractPaletteFromItemData(item);
  const paletteSource = palette.length ? "api" : "unknown";

  return {
    id: `${type}-${ankamaId}`,
    name,
    type,
    palette,
    url: encyclopediaUrl,
    imageUrl,
    paletteSource,
  };
}

const BRAND_NAME = "KrosPalette";
const MAX_COLORS = 6;
const MAX_DIMENSION = 280;
const BUCKET_SIZE = 24;

function componentToHex(value) {
  const hex = value.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

function rgbToHex(r, g, b) {
  return `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;
}

function extractPalette(image) {
  const canvas = document.createElement("canvas");
  const ratio = Math.min(
    1,
    MAX_DIMENSION / (image.width || MAX_DIMENSION),
    MAX_DIMENSION / (image.height || MAX_DIMENSION)
  );

  const width = Math.max(1, Math.round((image.width || MAX_DIMENSION) * ratio));
  const height = Math.max(1, Math.round((image.height || MAX_DIMENSION) * ratio));

  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return [];
  }

  context.drawImage(image, 0, 0, width, height);
  const { data } = context.getImageData(0, 0, width, height);

  const buckets = new Map();

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 48) continue;

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const key = [
      Math.round(r / BUCKET_SIZE),
      Math.round(g / BUCKET_SIZE),
      Math.round(b / BUCKET_SIZE),
    ].join("-");

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { r: 0, g: 0, b: 0, count: 0 };
      buckets.set(key, bucket);
    }

    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count += 1;
  }

  return Array.from(buckets.values())
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_COLORS)
    .map(({ r, g, b, count }) => {
      const rr = Math.round(r / count);
      const gg = Math.round(g / count);
      const bb = Math.round(b / count);
      return {
        hex: rgbToHex(rr, gg, bb),
        rgb: `rgb(${rr}, ${gg}, ${bb})`,
        r: rr,
        g: gg,
        b: bb,
        weight: count,
      };
    });
}

function hexToRgb(hex) {
  if (!hex) {
    return null;
  }
  const value = hex.replace("#", "");
  if (value.length !== 6) {
    return null;
  }
  const bigint = parseInt(value, 16);
  if (Number.isNaN(bigint)) {
    return null;
  }
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

function colorDistance(colorA, colorB) {
  const dr = colorA.r - colorB.r;
  const dg = colorA.g - colorB.g;
  const db = colorA.b - colorB.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function scoreItemAgainstPalette(item, palette) {
  if (palette.length === 0 || !item.palette || item.palette.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const paletteRgb = palette.map((color) => ({ r: color.r, g: color.g, b: color.b }));
  const itemRgb = item.palette
    .map((hex) => hexToRgb(hex))
    .filter((value) => value !== null);

  if (itemRgb.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const totalDistance = itemRgb.reduce((accumulator, itemColor) => {
    const closestDistance = paletteRgb.reduce((best, paletteColor) => {
      const distance = colorDistance(itemColor, paletteColor);
      return Math.min(best, distance);
    }, Number.POSITIVE_INFINITY);
    return accumulator + closestDistance;
  }, 0);

  return totalDistance / itemRgb.length;
}

function analyzePaletteFromUrl(imageUrl) {
  if (!imageUrl || typeof window === "undefined" || typeof Image === "undefined") {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = () => {
      try {
        const palette = extractPalette(image);
        resolve(palette);
      } catch (err) {
        console.error(err);
        resolve([]);
      }
    };
    image.onerror = () => {
      resolve([]);
    };
    image.src = imageUrl;
  });
}

async function enrichItemsWithPalettes(items, shouldCancel) {
  if (!items.length || (typeof window === "undefined" && typeof document === "undefined")) {
    return items;
  }

  const enriched = await Promise.all(
    items.map(async (item) => {
      if (shouldCancel?.()) {
        return item;
      }

      if (!item.imageUrl) {
        return { ...item, palette: [] };
      }

      const paletteEntries = await analyzePaletteFromUrl(item.imageUrl);
      if (shouldCancel?.()) {
        return item;
      }

      const paletteHex = paletteEntries
        .map((entry) => entry.hex)
        .filter((hex, index, array) => hex && array.indexOf(hex) === index)
        .slice(0, MAX_ITEM_PALETTE_COLORS);

      if (!paletteHex.length) {
        return {
          ...item,
          palette: item.palette ?? [],
          paletteSource: item.paletteSource ?? "unknown",
        };
      }

      return { ...item, palette: paletteHex, paletteSource: "image" };
    })
  );

  return enriched;
}

export default function Home() {
  const [imageSrc, setImageSrc] = useState(null);
  const [colors, setColors] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [codeFormat, setCodeFormat] = useState("hex");
  const [toast, setToast] = useState(null);
  const [itemsCatalog, setItemsCatalog] = useState({});
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState(null);

  const hasCatalogData = useMemo(
    () => ITEM_TYPES.some((type) => (itemsCatalog[type] ?? []).length > 0),
    [itemsCatalog]
  );

  const recommendations = useMemo(() => {
    if (!colors.length) {
      return null;
    }

    return ITEM_TYPES.reduce((accumulator, type) => {
      const catalogItems = itemsCatalog[type] ?? [];
      if (!catalogItems.length) {
        accumulator[type] = [];
        return accumulator;
      }

      const scoredItems = catalogItems
        .map((item) => ({
          item,
          score: scoreItemAgainstPalette(item, colors),
        }))
        .sort((a, b) => a.score - b.score);

      const finiteScores = scoredItems.filter(({ score }) => Number.isFinite(score));
      const ranked = finiteScores.length > 0 ? finiteScores : scoredItems;

      accumulator[type] = ranked.slice(0, 2).map(({ item }) => item);
      return accumulator;
    }, {});
  }, [colors, itemsCatalog]);

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
            const controller = new AbortController();
            controllers.push(controller);

            try {
              const response = await fetch(buildDofusApiUrl(type), {
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

              const normalizedItems = rawItems
                .map((rawItem) => normalizeDofusItem(rawItem, type))
                .filter((item) => item !== null);

              const enrichedItems = await enrichItemsWithPalettes(normalizedItems, () => isCancelled);

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
              ? "Impossible de récupérer les objets Dofus pour le moment."
              : "Certaines catégories d'objets n'ont pas pu être chargées.";
          setItemsError(message);
        }
      } catch (err) {
        if (isCancelled) {
          return;
        }

        console.error(err);
        setItemsCatalog({});
        setItemsError("Impossible de récupérer les objets Dofus pour le moment.");
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
  }, []);

  const handleDataUrl = useCallback((dataUrl) => {
    if (!dataUrl) return;
    setImageSrc(dataUrl);
    setIsProcessing(true);
    setError(null);
    setCopiedCode(null);

    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const palette = extractPalette(image);
        setColors(palette);
        if (palette.length === 0) {
          setError("Aucune couleur dominante détectée.");
        }
      } catch (err) {
        console.error(err);
        setError("Impossible d'extraire les couleurs de cette image.");
        setColors([]);
      } finally {
        setIsProcessing(false);
      }
    };
    image.onerror = () => {
      setError("L'image semble corrompue ou illisible.");
      setIsProcessing(false);
      setColors([]);
    };
    image.src = dataUrl;
  }, []);

  const handleFile = useCallback(
    (file) => {
      if (!file || !file.type.startsWith("image/")) {
        setError("Merci de choisir un fichier image.");
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
        setError("Lecture du fichier impossible.");
      };
      reader.readAsDataURL(file);
    },
    [handleDataUrl]
  );

  useEffect(() => {
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
  }, [handleFile]);

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
      setIsDragging(false);

      const files = event.dataTransfer?.files;
      if (files && files.length > 0) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const onBrowseClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onFileInputChange = useCallback(
    (event) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleCopy = useCallback(async (value) => {
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
      setToast({ id: Date.now(), label: "Couleur copiée", value });
    } catch (err) {
      console.error(err);
      try {
        fallbackCopy(value);
        setError(null);
        setCopiedCode(value);
        setToast({ id: Date.now(), label: "Couleur copiée", value });
      } catch (fallbackErr) {
        console.error(fallbackErr);
        setError("Impossible de copier dans le presse-papiers.");
      }
    }
  }, []);

  const formatThumbStyle = {
    transform:
      codeFormat === "hex" ? "translateX(0%)" : "translateX(calc(100% + 4px))",
  };

  const getRingPosition = useCallback((index, total) => {
    if (total <= 1) {
      return { left: "50%", top: "50%" };
    }

    if (index === 0) {
      return { left: "50%", top: "50%" };
    }

    const orbitCount = total - 1;
    const radius = orbitCount <= 2 ? 24 : orbitCount === 3 ? 28 : orbitCount === 4 ? 32 : 34;
    const angle = ((index - 1) / orbitCount) * 360 - 90;
    const radians = (angle * Math.PI) / 180;
    const x = 50 + radius * Math.cos(radians);
    const y = 50 + radius * Math.sin(radians);

    return {
      left: `${x}%`,
      top: `${y}%`,
    };
  }, []);

  const getTextColor = useCallback((color) => {
    const luminance = 0.299 * color.r + 0.587 * color.g + 0.114 * color.b;
    return luminance > 155 ? "rgba(15, 23, 42, 0.9)" : "#f8fafc";
  }, []);

  return (
    <>
      <Head>
        <title>{`${BRAND_NAME} · Studio de skins Dofus`}</title>
        <meta
          name="description"
          content="KrosPalette extrait les couleurs dominantes de tes images pour composer des skins Dofus harmonieux."
        />
      </Head>
      <main className="page">
        <div className={`toast-tray${toast ? " toast-tray--visible" : ""}`} aria-live="polite">
          {toast ? (
            <div className="toast">
              <span className="toast__icon" aria-hidden="true">✓</span>
              <div className="toast__body">
                <span className="toast__title">{toast.label}</span>
                <span className="toast__value">{toast.value}</span>
              </div>
            </div>
          ) : null}
        </div>
        <header className="hero">
          <h1>{BRAND_NAME}</h1>
          <p>
            Dépose, colle ou importe une image de référence pour capturer instantanément les teintes qui
            sublimeront ton prochain skin Dofus.
          </p>
        </header>

        <section className="workspace">
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
              <img src={imageSrc} alt="Aperçu de la référence importée" className="dropzone__preview" />
            ) : (
              <div className="dropzone__placeholder">
                <strong>Glisse ton visuel ici</strong>
                <span>… ou colle-le directement depuis ton presse-papiers</span>
                <em>Formats acceptés : PNG, JPG, WebP, GIF statique</em>
              </div>
            )}
            <input
              ref={inputRef}
              className="dropzone__input"
              type="file"
              accept="image/*"
              onChange={onFileInputChange}
            />
            <div className="dropzone__hint">Cliquer ouvre l'explorateur de fichiers</div>
          </div>

          <div className="palette">
            <div className="palette__header">
              <div className="palette__title">
                <h2>Palette extraite</h2>
                <p className="palette__caption">
                  Sélectionne un format et clique sur une nuance pour la copier.
                </p>
              </div>
              <div className="palette__actions">
                {isProcessing ? <span className="badge badge--pulse">Analyse en cours…</span> : null}
                <div className="format-switch" role="radiogroup" aria-label="Format des codes couleur">
                  <span className="format-switch__thumb" style={formatThumbStyle} aria-hidden="true" />
                  <button
                    type="button"
                    className={`format-switch__option${codeFormat === "hex" ? " is-active" : ""}`}
                    onClick={() => setCodeFormat("hex")}
                    role="radio"
                    aria-checked={codeFormat === "hex"}
                  >
                    Hexa
                  </button>
                  <button
                    type="button"
                    className={`format-switch__option${codeFormat === "rgb" ? " is-active" : ""}`}
                    onClick={() => setCodeFormat("rgb")}
                    role="radio"
                    aria-checked={codeFormat === "rgb"}
                  >
                    RGB
                  </button>
                </div>
              </div>
            </div>
            {error ? <p className="palette__error">{error}</p> : null}
            {colors.length > 0 ? (
              <ul className="palette__ring">
                {colors.map((color, index) => {
                  const value = codeFormat === "hex" ? color.hex : color.rgb;
                  const position = getRingPosition(index, colors.length);
                  const textColor = getTextColor(color);
                  const isCopied = copiedCode === value;

                  return (
                    <li
                      key={`${color.hex}-${index}`}
                      className="palette__ring-item"
                      style={position}
                    >
                      <button
                        type="button"
                        className={`swatch-hex${isCopied ? " is-copied" : ""}`}
                        onClick={() => handleCopy(value)}
                        style={{ backgroundColor: color.hex, color: textColor }}
                        title="Cliquer pour copier"
                      >
                        <span className="swatch-hex__value">{value}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className="palette__empty">
                <p>
                  Dépose une image pour révéler automatiquement ses teintes dominantes. Les codes Hex et RGB
                  sont prêts à être copiés.
                </p>
              </div>
            )}
          </div>
          <div className="suggestions">
          <div className="suggestions__header">
            <h2>Correspondances Dofus</h2>
            <p>
              Une sélection d&apos;objets inspirée des couleurs extraites afin d&apos;harmoniser ton skin avec l&apos;image de
              référence.
            </p>
          </div>
          {colors.length === 0 ? (
            <div className="suggestions__empty">
              <p>Importe d&apos;abord une image pour générer des propositions personnalisées.</p>
            </div>
          ) : !hasCatalogData && itemsLoading ? (
            <div className="suggestions__status suggestions__status--loading">
              Chargement des objets Dofus…
            </div>
          ) : !hasCatalogData && itemsError ? (
            <div className="suggestions__status suggestions__status--error">{itemsError}</div>
          ) : !hasCatalogData ? (
            <div className="suggestions__status suggestions__status--empty">
              <p>Aucun objet n&apos;a pu être récupéré pour le moment.</p>
            </div>
          ) : (
            <>
              {itemsError ? (
                <p className="suggestions__status suggestions__status--error suggestions__status--inline">
                  {itemsError}
                </p>
              ) : null}
              {itemsLoading ? (
                <p className="suggestions__status suggestions__status--loading suggestions__status--inline">
                  Mise à jour des suggestions…
                </p>
              ) : null}
              <div className="suggestions__grid">
                {ITEM_TYPES.map((type) => {
                  const items = recommendations?.[type] ?? [];
                  return (
                    <section key={type} className="suggestions__group">
                      <header className="suggestions__group-header">
                        <span className="suggestions__group-type">{type}</span>
                      </header>
                      {items.length === 0 ? (
                        <p className="suggestions__group-empty">Aucune correspondance probante pour cette teinte.</p>
                      ) : (
                        <ul className="suggestions__list">
                          {items.map((item) => {
                            const hasPalette = item.palette.length > 0;
                            const paletteFromImage = item.paletteSource === "image" && hasPalette;
                            let paletteNote = null;
                            if (!hasPalette) {
                              paletteNote = "Palette non détectée sur l'illustration.";
                            } else if (!paletteFromImage) {
                              paletteNote = "Palette estimée à partir des données DofusDB.";
                            }

                            return (
                              <li key={item.id} className="suggestions__item">
                                <div className="suggestions__media">
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={`Illustration de ${item.name}`}
                                      className="suggestions__image"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <div className="suggestions__image suggestions__image--placeholder" aria-hidden="true">
                                      Aperçu indisponible
                                    </div>
                                  )}
                                  <div className="suggestions__swatches" aria-hidden={hasPalette}>
                                    {hasPalette ? (
                                      item.palette.map((hex) => (
                                        <span
                                          key={hex}
                                          className="suggestions__swatch"
                                          style={{ backgroundColor: hex }}
                                        />
                                      ))
                                    ) : (
                                      <span className="suggestions__swatch-note">Palette indisponible</span>
                                    )}
                                  </div>
                                </div>
                                <div className="suggestions__content">
                                  <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="suggestions__title"
                                  >
                                    {item.name}
                                  </a>
                                  {paletteNote ? <span className="suggestions__note">{paletteNote}</span> : null}
                                  {!item.imageUrl ? (
                                    <span className="suggestions__note">Illustration manquante sur DofusDB.</span>
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
            </>
          )}
        </div>
        </section>
      </main>
    </>
  );
}
