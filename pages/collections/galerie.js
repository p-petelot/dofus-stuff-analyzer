import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useLanguage } from "../../lib/i18n";
import { useLockBody } from "../../app/components/hooks/useLockBody";

const DEFAULT_COUNT = 12;

const BARBOFUS_BASE_URL = "https://barbofus.com/skinator";
const BARBOFUS_EQUIPMENT_SLOTS = ["6", "7", "8", "9", "10", "11", "12"];
const BARBOFUS_SLOT_BY_SLOT = {
  coiffe: "6",
  cape: "7",
  familier: "8",
  bouclier: "9",
  ailes: "10",
  epauliere: "11",
  costume: "12",
};
const BARBOFUS_GENDER_VALUES = { male: 0, female: 1 };

const SLOT_ORDER = ["coiffe", "cape", "bouclier", "costume", "epauliere", "ailes", "familier"];

const SLOT_LABELS = {
  coiffe: "Coiffe",
  cape: "Cape",
  bouclier: "Bouclier",
  costume: "Costume",
  epauliere: "Épaulières",
  ailes: "Ailes", // Ailes lumineuses / ornements
  familier: "Familier & montures",
};

const PALETTE_LOADER_COLORS = ["#1bdd8d", "#22d3ee", "#facc15", "#fb923c", "#a855f7"];

const CREATIVE_COLOR_PRESETS = [
  "#8B5CF6",
  "#7C3AED",
  "#0EA5A6",
  "#06B6D4",
  "#F97316",
  "#FACC15",
  "#3B82F6",
  "#EC4899",
  "#22C55E",
];

function slotSortValue(slot) {
  const index = SLOT_ORDER.indexOf(slot);
  return index === -1 ? SLOT_ORDER.length + 1 : index;
}

function formatSlotLabel(slot) {
  if (!slot) {
    return "Équipement";
  }
  const key = slot.toLowerCase();
  if (SLOT_LABELS[key]) {
    return SLOT_LABELS[key];
  }
  return `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

function normalizeHex(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const hex = Math.max(0, Math.floor(value)).toString(16).padStart(6, "0");
    return `#${hex.toUpperCase()}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
      const normalized = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
      return `#${normalized.toUpperCase()}`;
    }
    if (/^\d+$/.test(trimmed)) {
      return normalizeHex(Number(trimmed));
    }
  }
  return null;
}

function hexToRgb(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return null;
  }
  const value = parseInt(normalized.slice(1), 16);
  if (!Number.isFinite(value)) {
    return null;
  }
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function hexToNumeric(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return null;
  }
  const value = parseInt(normalized.slice(1), 16);
  return Number.isFinite(value) ? value : null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

const LZ_KEY_STR_URI_SAFE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$";
const LZ_BASE_REVERSE_DICTIONARY = Object.create(null);

function getUriSafeCharFromInt(value) {
  return LZ_KEY_STR_URI_SAFE.charAt(value);
}

function getUriSafeValueFromChar(character) {
  if (!character) {
    return 0;
  }
  const cacheKey = LZ_KEY_STR_URI_SAFE;
  if (!Object.prototype.hasOwnProperty.call(LZ_BASE_REVERSE_DICTIONARY, cacheKey)) {
    const map = Object.create(null);
    for (let index = 0; index < LZ_KEY_STR_URI_SAFE.length; index += 1) {
      map[LZ_KEY_STR_URI_SAFE.charAt(index)] = index;
    }
    LZ_BASE_REVERSE_DICTIONARY[cacheKey] = map;
  }
  const dictionary = LZ_BASE_REVERSE_DICTIONARY[cacheKey];
  if (!Object.prototype.hasOwnProperty.call(dictionary, character)) {
    return 0;
  }
  return dictionary[character];
}

function _compress(uncompressed, bitsPerChar, getCharFromInt) {
  if (uncompressed == null) {
    return "";
  }

  let i;
  const dictionary = Object.create(null);
  const dictionaryToCreate = Object.create(null);
  let c = "";
  let wc = "";
  let w = "";
  let enlargeIn = 2;
  let dictSize = 3;
  let numBits = 2;
  const data = [];
  let data_val = 0;
  let data_position = 0;

  const pushBits = (value, bits) => {
    for (i = 0; i < bits; i += 1) {
      data_val = (data_val << 1) | (value & 1);
      if (data_position === bitsPerChar - 1) {
        data_position = 0;
        data.push(getCharFromInt(data_val));
        data_val = 0;
      } else {
        data_position += 1;
      }
      value >>= 1;
    }
  };

  for (let ii = 0; ii < uncompressed.length; ii += 1) {
    c = uncompressed.charAt(ii);
    if (!Object.prototype.hasOwnProperty.call(dictionary, c)) {
      dictionary[c] = dictSize;
      dictSize += 1;
      dictionaryToCreate[c] = true;
    }

    wc = w + c;
    if (Object.prototype.hasOwnProperty.call(dictionary, wc)) {
      w = wc;
    } else {
      if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, w)) {
        const code = w.charCodeAt(0);
        if (code < 256) {
          pushBits(0, numBits);
          pushBits(code, 8);
        } else {
          pushBits(1, numBits);
          pushBits(code, 16);
        }
        enlargeIn -= 1;
        if (enlargeIn === 0) {
          enlargeIn = 1 << numBits;
          numBits += 1;
        }
        delete dictionaryToCreate[w];
      } else {
        pushBits(dictionary[w], numBits);
      }

      enlargeIn -= 1;
      if (enlargeIn === 0) {
        enlargeIn = 1 << numBits;
        numBits += 1;
      }

      dictionary[wc] = dictSize;
      dictSize += 1;
      w = String(c);
    }
  }

  if (w !== "") {
    if (Object.prototype.hasOwnProperty.call(dictionaryToCreate, w)) {
      const code = w.charCodeAt(0);
      if (code < 256) {
        pushBits(0, numBits);
        pushBits(code, 8);
      } else {
        pushBits(1, numBits);
        pushBits(code, 16);
      }
      enlargeIn -= 1;
      if (enlargeIn === 0) {
        enlargeIn = 1 << numBits;
        numBits += 1;
      }
      delete dictionaryToCreate[w];
    } else {
      pushBits(dictionary[w], numBits);
    }

    enlargeIn -= 1;
    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits += 1;
    }
  }

  pushBits(2, numBits);

  while (true) {
    data_val <<= 1;
    if (data_position === bitsPerChar - 1) {
      data.push(getCharFromInt(data_val));
      break;
    }
    data_position += 1;
  }

  return data.join("");
}

function compressToEncodedURIComponent(input) {
  if (input == null) {
    return "";
  }
  return _compress(input, 6, getUriSafeCharFromInt);
}

function rgbToHsl({ r, g, b }) {
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
    return null;
  }
  const rn = clamp(r / 255, 0, 1);
  const gn = clamp(g / 255, 0, 1);
  const bn = clamp(b / 255, 0, 1);
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) {
      h = (gn - bn) / delta + (gn < bn ? 6 : 0);
    } else if (max === gn) {
      h = (bn - rn) / delta + 2;
    } else {
      h = (rn - gn) / delta + 4;
    }
    h *= 60;
  }
  const l = (max + min) / 2;
  let s = 0;
  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
  }
  return {
    h: (h + 360) % 360,
    s: clamp(s * 100, 0, 100),
    l: clamp(l * 100, 0, 100),
  };
}

function hueToRgb(p, q, t) {
  let temp = t;
  if (temp < 0) temp += 1;
  if (temp > 1) temp -= 1;
  if (temp < 1 / 6) return p + (q - p) * 6 * temp;
  if (temp < 1 / 2) return q;
  if (temp < 2 / 3) return p + (q - p) * (2 / 3 - temp) * 6;
  return p;
}

function hslToRgb(h, s, l) {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = clamp(s / 100, 0, 1);
  const ln = clamp(l / 100, 0, 1);
  if (sn === 0) {
    const value = Math.round(ln * 255);
    return { r: value, g: value, b: value };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const r = Math.round(hueToRgb(p, q, hn + 1 / 3) * 255);
  const g = Math.round(hueToRgb(p, q, hn) * 255);
  const b = Math.round(hueToRgb(p, q, hn - 1 / 3) * 255);
  return { r, g, b };
}

function hslToHex(h, s, l) {
  const { r, g, b } = hslToRgb(h, s, l);
  const toHex = (value) => value.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function adjustHexColor(hex, adjustments = {}) {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return normalizeHex(hex);
  }
  const hsl = rgbToHsl(rgb);
  if (!hsl) {
    return normalizeHex(hex);
  }
  const next = {
    h: (hsl.h + (adjustments.h ?? 0) + 360) % 360,
    s: clamp(hsl.s + (adjustments.s ?? 0), 6, 96),
    l: clamp(hsl.l + (adjustments.l ?? 0), 8, 94),
  };
  return normalizeHex(hslToHex(next.h, next.s, next.l));
}

function buildGradientFromHex(hex) {
  const normalized = normalizeHex(hex);
  if (!normalized) {
    return "linear-gradient(135deg, #1F2937, #0F172A)";
  }
  const darker = adjustHexColor(normalized, { l: -16, s: 8 });
  const lighter = adjustHexColor(normalized, { l: 14, s: -6 });
  return `linear-gradient(135deg, ${darker}, ${normalized}, ${lighter})`;
}

async function copyColorToClipboard(value) {
  if (typeof window === "undefined") {
    throw new Error("Clipboard indisponible côté serveur");
  }
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const successful = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!successful) {
    throw new Error("Échec de la copie dans le presse-papiers");
  }
}

function PaletteLoader({ label }) {
  return (
    <div className="palette-loader" role="presentation" aria-hidden="true">
      <span className="palette-loader__aurora">
        <span className="palette-loader__halo" />
        <span className="palette-loader__spectrum">
          <span className="palette-loader__ring palette-loader__ring--outer" />
          <span className="palette-loader__ring palette-loader__ring--inner" />
          {PALETTE_LOADER_COLORS.map((color, index) => (
            <span
              key={`${color}-${index}`}
              className={`palette-loader__pulse palette-loader__pulse--${index}`}
              style={{
                "--palette-loader-color": color,
                "--palette-loader-index": String(index),
              }}
            />
          ))}
        </span>
        <span className="palette-loader__core" />
      </span>
      <span className="sr-only">{label}</span>
    </div>
  );
}

function GalleryLoader({ message }) {
  return (
    <div className="gallery-loader" role="status" aria-live="polite">
      <PaletteLoader label={message ?? "Chargement"} />
      {message ? <span className="gallery-loader__message">{message}</span> : null}
    </div>
  );
}

function classNames(...parts) {
  return parts.filter(Boolean).join(" ");
}

function genderLabel(gender) {
  if (gender === "f") {
    return "Féminin";
  }
  return "Masculin";
}

function genderSymbol(gender) {
  return gender === "f" ? "♀" : "♂";
}

function buildBarbofusLinkFromSkin(skin) {
  const paletteHexes = Array.isArray(skin?.palette?.hex) ? skin.palette.hex.slice(0, 6) : [];
  const paletteValues = paletteHexes.map((hex) => hexToNumeric(hex)).filter((value) => Number.isFinite(value));

  const equipment = BARBOFUS_EQUIPMENT_SLOTS.reduce((accumulator, slot) => {
    accumulator[slot] = null;
    return accumulator;
  }, {});

  let hasEquipment = false;
  const items = Array.isArray(skin?.items) ? skin.items : [];
  items.forEach((item) => {
    const slot = BARBOFUS_SLOT_BY_SLOT[item?.slot];
    const ankamaId = Number(item?.ankamaId);
    if (slot && Number.isFinite(ankamaId)) {
      equipment[slot] = ankamaId;
      hasEquipment = true;
    }
  });

  if (!hasEquipment || !Number.isFinite(skin?.classId)) {
    return null;
  }

  const gender = skin.gender === "f" ? BARBOFUS_GENDER_VALUES.female : BARBOFUS_GENDER_VALUES.male;
  const payload = {
    1: gender,
    2: Math.trunc(skin.classId),
    4: paletteValues,
    5: equipment,
  };

  const faceId = Number(skin?.faceId);
  if (Number.isFinite(faceId)) {
    payload[3] = faceId;
  }

  const encoded = compressToEncodedURIComponent(JSON.stringify(payload));
  return encoded ? `${BARBOFUS_BASE_URL}?s=${encoded}` : null;
}

function buildPreviewParams(skin, language) {
  const params = new URLSearchParams();
  params.set("breedId", String(skin.classId));
  params.set("gender", skin.gender);
  params.set("faceId", String(skin.faceId));
  params.set("lang", language);
  params.set("size", "512");
  params.set("direction", "1");
  params.set("animation", "0");
  const colors = Array.isArray(skin.palette?.numeric) ? skin.palette.numeric : [];
  colors.slice(0, 6).forEach((value) => {
    if (Number.isFinite(value)) {
      params.append("colors[]", String(Math.trunc(value)));
    }
  });
  const items = Array.isArray(skin.items) ? skin.items : [];
  items.forEach((item) => {
    const ankamaId = Number(item?.ankamaId);
    if (Number.isFinite(ankamaId) && ankamaId > 0) {
      params.append("itemIds[]", String(Math.trunc(ankamaId)));
    }
  });
  return params;
}

function GalleryCard({ skin, language, onSelect }) {
  const [status, setStatus] = useState("loading");
  const [preview, setPreview] = useState(null);
  const abortRef = useRef(null);
  const mainColor = normalizeHex(skin?.primaryColor ?? skin?.palette?.hex?.[0]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => {};
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setPreview(null);

    const params = buildPreviewParams(skin, language);

    fetch(`/api/look-preview?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? `HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        if (controller.signal.aborted) {
          return;
        }
        const dataUrl = payload?.dataUrl ?? payload?.rendererUrl ?? null;
        if (dataUrl) {
          setPreview({
            src: dataUrl,
            warnings: payload?.warnings ?? [],
            renderer: payload?.renderer ?? null,
          });
          setStatus("loaded");
        } else {
          throw new Error(payload?.error ?? "Aperçu indisponible");
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        console.error("gallery preview error", error);
        setStatus("error");
        setPreview({
          src: null,
          error: error instanceof Error ? error.message : String(error),
          warnings: [],
        });
      });

    return () => {
      controller.abort();
      abortRef.current = null;
    };
  }, [skin, language]);

  const handleClick = useCallback(() => {
    onSelect({ skin, preview });
  }, [onSelect, skin, preview]);

  return (
    <button
      type="button"
      className={classNames("gallery-card", status === "loading" && "gallery-card--loading")}
      onClick={handleClick}
      aria-label={`Skin ${(skin.displayNumber ?? skin.number)} - ${skin.className}`}
    >
      <div className="gallery-card__preview">
        {status === "loaded" && preview?.src ? (
          <img src={preview.src} alt={`Aperçu skin ${skin.className}`} loading="lazy" />
        ) : (
          <div className="gallery-card__placeholder" aria-hidden="true">
            {status === "error" ? "Aperçu indisponible" : "Chargement..."}
          </div>
        )}
      </div>
      <div className="gallery-card__meta">
        <div className="gallery-card__meta-left">
          {mainColor ? <span className="gallery-card__swatch" style={{ backgroundColor: mainColor }} /> : null}
          <span className="gallery-card__number">#{(skin.displayNumber ?? skin.number).toString().padStart(2, "0")}</span>
        </div>
        <div className="gallery-card__identity">
          {skin.classIcon ? (
            <img
              src={skin.classIcon}
              alt=""
              className="gallery-card__icon"
              loading="lazy"
              aria-hidden="true"
            />
          ) : (
            <span className="gallery-card__icon gallery-card__icon--fallback" aria-hidden="true">
              {skin.className.charAt(0)}
            </span>
          )}
          <div className="gallery-card__identity-text">
            <span className="gallery-card__class">{skin.className}</span>
            <span className="gallery-card__gender">
              <span aria-hidden="true">{genderSymbol(skin.gender)}</span>
              <span className="sr-only">{genderLabel(skin.gender)}</span>
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function GalleryModal({ selection, onClose }) {
  const closeButtonRef = useRef(null);
  const copyTimeoutRef = useRef(null);
  const [copyState, setCopyState] = useState({ hex: null, status: "idle" });
  useLockBody(Boolean(selection));

  useEffect(() => {
    if (!selection) {
      window.clearTimeout(copyTimeoutRef.current ?? undefined);
      return () => {};
    }
    const handleKey = (event) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    const timer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 20);
    return () => {
      document.removeEventListener("keydown", handleKey);
      window.clearTimeout(timer);
    };
  }, [selection, onClose]);

  useEffect(() => () => {
    window.clearTimeout(copyTimeoutRef.current ?? undefined);
  }, []);

  useEffect(() => {
    if (!selection) {
      setCopyState({ hex: null, status: "idle" });
    }
  }, [selection]);

  const swatches = useMemo(() => {
    const palette = selection?.skin?.palette?.hex;
    if (!Array.isArray(palette)) {
      return [];
    }
    return palette.slice(0, 6).map((entry) => normalizeHex(entry) ?? entry);
  }, [selection]);

  const orderedItems = useMemo(() => {
    const items = selection?.skin?.items;
    if (!Array.isArray(items)) {
      return [];
    }
    return [...items].sort((a, b) => slotSortValue(a.slot) - slotSortValue(b.slot));
  }, [selection]);

  const barbofusLink = useMemo(() => buildBarbofusLinkFromSkin(selection?.skin), [selection]);

  const handleCopyColor = useCallback(
    async (value) => {
      const normalized = normalizeHex(value);
      if (!normalized) {
        return;
      }
      try {
        await copyColorToClipboard(normalized);
        setCopyState({ hex: normalized, status: "success" });
      } catch (error) {
        console.error("gallery copy error", error);
        setCopyState({ hex: normalized, status: "error" });
      } finally {
        window.clearTimeout(copyTimeoutRef.current ?? undefined);
        copyTimeoutRef.current = window.setTimeout(() => {
          setCopyState({ hex: null, status: "idle" });
        }, 1800);
      }
    },
    [],
  );

  if (!selection) {
    return null;
  }

  const { skin, preview } = selection;
  const displayNumber = (skin.displayNumber ?? skin.number).toString().padStart(2, "0");
  const announcement =
    copyState.status === "success"
      ? `${copyState.hex} copié dans le presse-papiers`
      : copyState.status === "error"
      ? `Impossible de copier ${copyState.hex}`
      : "";

  return (
    <div className="gallery-modal" role="dialog" aria-modal="true" aria-labelledby="gallery-modal-title">
      <div className="gallery-modal__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="gallery-modal__content" role="document">
        <header className="gallery-modal__header">
          <div>
            <p className="gallery-modal__eyebrow">Skin #{displayNumber} - {skin.className}</p>
          </div>
          <button type="button" className="gallery-modal__close" onClick={onClose} ref={closeButtonRef}>
            <span aria-hidden="true">×</span>
            <span className="sr-only">Fermer</span>
          </button>
        </header>

        <div className="gallery-modal__body">
          <div className="gallery-modal__columns">
            <section className="gallery-modal__preview" aria-label="Aperçu du skin">
              <h3 className="sr-only">Aperçu du skin</h3>
              <div className="gallery-modal__swatch-section">
                {swatches.length ? (
                  <ul className="gallery-modal__swatches" role="list">
                    {swatches.map((hex, index) => {
                      const normalized = normalizeHex(hex) ?? hex;
                      const state =
                        copyState.status === "success" && copyState.hex === normalized
                          ? "copied"
                          : copyState.status === "error" && copyState.hex === normalized
                          ? "error"
                          : undefined;
                      return (
                        <li key={`${normalized}-${index}`} className="gallery-modal__swatch">
                          <button
                            type="button"
                            className="skin-card__swatch-button gallery-modal__swatch-button"
                            style={{ backgroundImage: buildGradientFromHex(normalized) }}
                            onClick={() => handleCopyColor(hex)}
                            data-state={state}
                          >
                            <span>{normalized}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="gallery-modal__empty">Aucune couleur disponible pour ce skin.</p>
                )}
              </div>
              <div className="gallery-modal__preview-frame">
                {preview?.src ? (
                  <img src={preview.src} alt={`Aperçu détaillé skin ${skin.className}`} />
                ) : (
                  <div className="gallery-modal__placeholder">Aperçu indisponible</div>
                )}
              </div>
            </section>

            <section className="gallery-modal__details" aria-label="Palette et équipement sélectionnés">
              

              <div className="gallery-modal__items-section">
                {orderedItems.length ? (
                  <ul className="gallery-modal__items" role="list">
                    {orderedItems.map((item) => {
                      const slotLabel = formatSlotLabel(item.slot);
                      const icon = item.icon ? (
                        <img src={item.icon} alt="" loading="lazy" className="gallery-modal__item-icon" />
                      ) : (
                        <span className="gallery-modal__item-icon gallery-modal__item-icon--fallback" aria-hidden="true">
                          {slotLabel.charAt(0)}
                        </span>
                      );
                      const nameNode = item.href ? (
                        <a href={item.href} target="_blank" rel="noreferrer" className="gallery-modal__item-name">
                          {item.name}
                        </a>
                      ) : (
                        <span className="gallery-modal__item-name gallery-modal__item-name--static">{item.name}</span>
                      );
                      return (
                        <li key={`${item.slot}-${item.ankamaId}`} className="gallery-modal__item">
                          {icon}
                          <div className="gallery-modal__item-info">
                            {nameNode}
                            <span className="gallery-modal__item-slot">{slotLabel}</span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="gallery-modal__empty">Aucun équipement n'a pu être synchronisé.</p>
                )}
              </div>

              <div className="gallery-modal__actions">
                {barbofusLink ? (
                  <a
                    className="skin-card__cta"
                    href={barbofusLink}
                    target="_blank"
                    rel="noreferrer"
                    title="Ouvrir dans Barbofus"
                  >
                    <span className="skin-card__cta-icon" aria-hidden="true">
                      <img src="/icons/barbofus.svg" alt="" />
                    </span>
                    <span className="sr-only">Ouvrir dans Barbofus</span>
                  </a>
                ) : (
                  <span className="skin-card__cta skin-card__cta--disabled">Barbofus indisponible</span>
                )}
              </div>
            </section>
          </div>
          {announcement ? (
            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const DEFAULT_PAGE_CONFIG = {
  pageTitle: "Galerie IA | KrosPalette",
  pageDescription:
    "Découvrez une sélection de skins générés automatiquement grâce aux palettes harmonisées de KrosPalette.",
  eyebrow: "Galerie IA",
  heroTitle: "Inspirations colorées générées automatiquement",
  heroDescription:
    "Laissez l'algorithme imaginer pour vous des associations d'équipements et de palettes. Cliquez pour explorer les détails et récupérer vos palettes préférées.",
  colorLabel: "Couleur",
  defaultCount: DEFAULT_COUNT,
};

export function GalleryCollectionsView({ config = {} }) {
  const pageConfig = { ...DEFAULT_PAGE_CONFIG, ...config };
  const { language } = useLanguage();
  const [skins, setSkins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [selection, setSelection] = useState(null);
  const [referenceColor, setReferenceColor] = useState(null);
  const loadMoreRef = useRef(null);
  const totalCountRef = useRef(0);
  const inFlightRef = useRef(false);

  const fetchGallery = useCallback(
    async ({ append = false } = {}) => {
      if (inFlightRef.current) {
        return;
      }
      inFlightRef.current = true;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        totalCountRef.current = 0;
      }
      setError(null);
      try {
        const startIndex = append ? totalCountRef.current : 0;
        const params = new URLSearchParams();
        params.set("lang", language);
        params.set("count", String(pageConfig.defaultCount ?? DEFAULT_COUNT));
        params.set("offset", String(startIndex));
        if (referenceColor) {
          params.set("color", referenceColor);
        }
        const response = await fetch(`/api/gallery?${params.toString()}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? `HTTP ${response.status}`);
        }
        const payload = await response.json();
        const dataset = Array.isArray(payload?.skins) ? payload.skins : [];
        setSkins((prev) => {
          const base = append ? prev : [];
          const mapped = dataset.map((skin, index) => ({
            ...skin,
            displayNumber: startIndex + index + 1,
          }));
          totalCountRef.current = startIndex + mapped.length;
          return append ? [...base, ...mapped] : mapped;
        });
      } catch (err) {
        console.error("gallery page error", err);
        if (append) {
          setError((current) => current);
        } else {
          setError(err instanceof Error ? err.message : String(err));
          setSkins([]);
        }
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoading(false);
        }
        inFlightRef.current = false;
      }
    },
    [language, referenceColor, pageConfig.defaultCount],
  );

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery, refreshIndex]);

  const handleColorChange = useCallback((value) => {
    const normalized = normalizeHex(value);
    if (!normalized) {
      setReferenceColor(null);
      setRefreshIndex((current) => current + 1);
      return;
    }
    setReferenceColor(normalized);
    setRefreshIndex((current) => current + 1);
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshIndex((value) => value + 1);
  }, []);

  const handleRandomColor = useCallback(() => {
    const choice = CREATIVE_COLOR_PRESETS[Math.floor(Math.random() * CREATIVE_COLOR_PRESETS.length)];
    handleColorChange(choice);
  }, [handleColorChange]);

  const handleSelect = useCallback((entry) => {
    setSelection(entry);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelection(null);
  }, []);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node) {
      return () => {};
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            fetchGallery({ append: true });
          }
        });
      },
      {
        root: null,
        rootMargin: "800px 0px 800px 0px",
        threshold: 0,
      },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [fetchGallery]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => {};
    }
    let ticking = false;
    const handleScroll = () => {
      if (ticking) {
        return;
      }
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        if (inFlightRef.current) {
          return;
        }
        const root = document.documentElement || document.body;
        if (!root) {
          return;
        }
        const scrollTop = root.scrollTop || window.pageYOffset || 0;
        const clientHeight = root.clientHeight || window.innerHeight || 0;
        const scrollHeight = root.scrollHeight || document.body.scrollHeight || 0;
        if (scrollHeight - (scrollTop + clientHeight) < 720) {
          fetchGallery({ append: true });
        }
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, [fetchGallery]);

  const content = useMemo(() => {
    if (loading) {
      return <GalleryLoader message="Génération de nouvelles palettes..." />;
    }
    if (error) {
      return (
        <div className="gallery-status gallery-status--error" role="alert">
          <p>Impossible de récupérer la galerie.</p>
          <p>{error}</p>
          <button type="button" onClick={handleRefresh} className="gallery-refresh">
            Réessayer
          </button>
        </div>
      );
    }
    if (!skins.length) {
      return (
        <div className="gallery-status" role="status">
          <p>Aucune création générée pour le moment.</p>
          <button type="button" onClick={handleRefresh} className="gallery-refresh">
            Régénérer
          </button>
        </div>
      );
    }
    return (
      <>
        <div className="gallery-grid" aria-live="polite">
          {skins.map((skin) => (
            <GalleryCard key={`${skin.id}-${skin.displayNumber}`} skin={skin} language={language} onSelect={handleSelect} />
          ))}
        </div>
        <div className="gallery-loadmore">
          {loadingMore ? <GalleryLoader message="Inspiration en cours..." /> : null}
          <div ref={loadMoreRef} className="gallery-loadmore__sentinel" aria-hidden="true" />
        </div>
      </>
    );
  }, [loading, error, skins, handleRefresh, language, handleSelect, loadingMore]);

  return (
    <>
      <Head>
        <title>{pageConfig.pageTitle}</title>
        <meta name="description" content={pageConfig.pageDescription} />
      </Head>
      <main className="page gallery-page">
        <div className="gallery-shell">
          <header className="gallery-header">
            <Link href="/collections" className="gallery-breadcrumb">
              ← Collections
            </Link>
            <h1>{pageConfig.heroTitle}</h1>
            <p>{pageConfig.heroDescription}</p>
            <div className="gallery-actions">
              <div className="gallery-color-picker" role="group" aria-label="Référence couleur">
                <div className="gallery-color-picker__header">
                  <span className="gallery-color-picker__label">Référence créative</span>
                  <span className="gallery-color-picker__hint">{pageConfig.colorLabel}</span>
                </div>
                <div className="gallery-color-picker__controls">
                  <label className="gallery-color-picker__input">
                    <span
                      className="gallery-color-picker__preview"
                      style={{ backgroundImage: buildGradientFromHex(referenceColor || "#7C3AED") }}
                    />
                    <input
                      type="color"
                      value={referenceColor || "#7C3AED"}
                      aria-label="Choisir une couleur de référence"
                      onChange={(event) => handleColorChange(event.target.value)}
                    />
                  </label>
                  <button type="button" className="gallery-random" onClick={handleRandomColor}>
                    Nuance aléatoire
                  </button>
                  <div className="gallery-color-picker__swatches" role="listbox" aria-label="Nuances suggérées">
                    {CREATIVE_COLOR_PRESETS.map((hex) => {
                      const active = referenceColor === hex;
                      return (
                        <button
                          key={hex}
                          type="button"
                          className={classNames("gallery-color-picker__swatch", active && "is-active")}
                          style={{ backgroundColor: hex }}
                          aria-label={`Sélectionner la teinte ${hex}`}
                          aria-pressed={active}
                          onClick={() => handleColorChange(hex)}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
              <button type="button" onClick={handleRefresh} className="gallery-refresh" disabled={loading}>
                {loading ? "Génération en cours..." : "Régénérer la galerie"}
              </button>
            </div>
          </header>

          {content}
        </div>
      </main>
      <GalleryModal selection={selection} onClose={handleCloseModal} />
    </>
  );
}

export default function GalleryCollectionsPage() {
  return <GalleryCollectionsView />;
}
