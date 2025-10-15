import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import DOFUS_ITEMS, { ITEM_TYPES } from "../data/dofusItems";

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
  const value = hex.replace("#", "");
  const bigint = parseInt(value, 16);
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
  if (palette.length === 0) {
    return Number.POSITIVE_INFINITY;
  }

  const paletteRgb = palette.map((color) => ({ r: color.r, g: color.g, b: color.b }));
  const itemRgb = item.palette.map(hexToRgb);

  const totalDistance = itemRgb.reduce((accumulator, itemColor) => {
    const closestDistance = paletteRgb.reduce((best, paletteColor) => {
      const distance = colorDistance(itemColor, paletteColor);
      return Math.min(best, distance);
    }, Number.POSITIVE_INFINITY);
    return accumulator + closestDistance;
  }, 0);

  return totalDistance / itemRgb.length;
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

  const recommendations = useMemo(() => {
    if (!colors.length) {
      return null;
    }

    return ITEM_TYPES.reduce((accumulator, type) => {
      const scoredItems = DOFUS_ITEMS.filter((item) => item.type === type)
        .map((item) => ({
          item,
          score: scoreItemAgainstPalette(item, colors),
        }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 2)
        .map(({ item }) => item);

      return { ...accumulator, [type]: scoredItems };
    }, {});
  }, [colors]);

  const inputRef = useRef(null);

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
            ) : (
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
                          {items.map((item) => (
                            <li key={item.id} className="suggestions__item">
                              <div className="suggestions__swatches" aria-hidden="true">
                                {item.palette.map((hex) => (
                                  <span
                                    key={hex}
                                    className="suggestions__swatch"
                                    style={{ backgroundColor: hex }}
                                  />
                                ))}
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
                                <p className="suggestions__description">{item.description}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
