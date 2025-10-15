import { useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";

const BRAND_NAME = "KrosPalette";
const MAX_COLORS = 10;
const MAX_DIMENSION = 320;
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

export default function Home() {
  const [imageSrc, setImageSrc] = useState(null);
  const [colors, setColors] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);
  const [codeFormat, setCodeFormat] = useState("hex");

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
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCode(value);
    } catch (err) {
      console.error(err);
      setError("Impossible de copier dans le presse-papiers.");
    }
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
                <p className="palette__caption">Cliquer sur une nuance copie le code sélectionné.</p>
              </div>
              <div className="palette__actions">
                {isProcessing ? <span className="badge badge--pulse">Analyse en cours…</span> : null}
                <div className="palette__format" role="radiogroup" aria-label="Format des codes couleur">
                  <button
                    type="button"
                    className={`format-toggle${codeFormat === "hex" ? " is-active" : ""}`}
                    onClick={() => setCodeFormat("hex")}
                    role="radio"
                    aria-checked={codeFormat === "hex"}
                  >
                    Hexa
                  </button>
                  <button
                    type="button"
                    className={`format-toggle${codeFormat === "rgb" ? " is-active" : ""}`}
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
              <ul className="palette__list">
                {colors.map((color) => {
                  const value = codeFormat === "hex" ? color.hex : color.rgb;
                  return (
                    <li key={color.hex} className="swatch">
                      <div
                        className="swatch__preview"
                        style={{ backgroundColor: color.hex }}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        className="code"
                        onClick={() => handleCopy(value)}
                      >
                        <span className="code__info">
                          <span className="code__label">{codeFormat === "hex" ? "Hex" : "RGB"}</span>
                          <span className="code__value">{value}</span>
                        </span>
                        <span className="code__hint">Cliquer pour copier</span>
                        {copiedCode === value ? <span className="code__copied">Copié !</span> : null}
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
        </section>
      </main>
    </>
  );
}
