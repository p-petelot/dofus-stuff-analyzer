import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useLanguage } from "../../lib/i18n";
import { useLockBody } from "../../app/components/hooks/useLockBody";

const DEFAULT_COUNT = 12;

function GalleryLoader({ message }) {
  return (
    <div className="gallery-loader" role="status" aria-live="polite">
      <span className="gallery-loader__icon" aria-hidden="true">
        <img src="/logo.svg" alt="" />
      </span>
      <span>{message}</span>
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
        <span className="gallery-card__number">#{(skin.displayNumber ?? skin.number).toString().padStart(2, "0")}</span>
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
  useLockBody(Boolean(selection));

  useEffect(() => {
    if (!selection) {
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

  if (!selection) {
    return null;
  }

  const { skin, preview } = selection;
  const displayNumber = (skin.displayNumber ?? skin.number).toString().padStart(2, "0");

  return (
    <div className="gallery-modal" role="dialog" aria-modal="true" aria-labelledby="gallery-modal-title">
      <div className="gallery-modal__backdrop" onClick={onClose} aria-hidden="true" />
      <div className="gallery-modal__content" role="document">
        <header className="gallery-modal__header">
          <div>
            <p className="gallery-modal__eyebrow">Skin #{displayNumber}</p>
            <h2 id="gallery-modal-title">{skin.className}</h2>
          </div>
          <button type="button" className="gallery-modal__close" onClick={onClose} ref={closeButtonRef}>
            <span aria-hidden="true">×</span>
            <span className="sr-only">Fermer</span>
          </button>
        </header>

        <div className="gallery-modal__body">
          <div className="gallery-modal__layout">
            <section className="gallery-modal__section gallery-modal__section--palette" aria-label="Palette de couleurs">
              <h3>Palette du skin</h3>
              <ul className="gallery-modal__palette">
                {skin.palette?.hex?.map((hex, index) => (
                  <li key={`${hex}-${index}`}>
                    <span className="gallery-modal__swatch" style={{ backgroundColor: hex }} aria-hidden="true" />
                    <span>{hex}</span>
                  </li>
                ))}
              </ul>
            </section>

            <div className="gallery-modal__preview">
              {preview?.src ? (
                <img src={preview.src} alt={`Aperçu détaillé skin ${skin.className}`} />
              ) : (
                <div className="gallery-modal__placeholder">Aperçu indisponible</div>
              )}
            </div>

            <section className="gallery-modal__section gallery-modal__section--items" aria-label="Équipement sélectionné">
              <h3>Équipement harmonisé</h3>
              <ul className="gallery-modal__items">
                {skin.items?.map((item) => (
                  <li key={`${item.slot}-${item.ankamaId}`}>
                    {item.icon ? (
                      <img src={item.icon} alt="" aria-hidden="true" loading="lazy" />
                    ) : (
                      <span className="gallery-modal__item-placeholder" aria-hidden="true">
                        {item.slot.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div>
                      <p className="gallery-modal__item-name">{item.name}</p>
                      <p className="gallery-modal__item-slot">{item.slot}</p>
                      {item.href ? (
                        <a href={item.href} target="_blank" rel="noreferrer" className="gallery-modal__item-link">
                          Voir sur DofusDB
                        </a>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GalleryCollectionsPage() {
  const { language } = useLanguage();
  const [skins, setSkins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [refreshIndex, setRefreshIndex] = useState(0);
  const [selection, setSelection] = useState(null);
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
        const params = new URLSearchParams();
        params.set("lang", language);
        params.set("count", String(DEFAULT_COUNT));
        const response = await fetch(`/api/gallery?${params.toString()}`);
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error ?? `HTTP ${response.status}`);
        }
        const payload = await response.json();
        const dataset = Array.isArray(payload?.skins) ? payload.skins : [];
        setSkins((prev) => {
          const base = append ? prev : [];
          const startIndex = append ? totalCountRef.current : 0;
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
    [language],
  );

  useEffect(() => {
    fetchGallery();
  }, [fetchGallery, refreshIndex]);

  const handleRefresh = useCallback(() => {
    setRefreshIndex((value) => value + 1);
  }, []);

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
        rootMargin: "600px 0px",
        threshold: 0.1,
      },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
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
        <title>Galerie IA | KrosPalette</title>
        <meta
          name="description"
          content="Découvrez une sélection de skins générés automatiquement grâce aux palettes harmonisées de KrosPalette."
        />
      </Head>
      <main className="page gallery-page">
        <div className="gallery-shell">
          <header className="gallery-header">
            <Link href="/collections" className="gallery-breadcrumb">
              ← Collections
            </Link>
            <h1>Galerie générée par l'IA</h1>
            <p>
              Explorez des combinaisons de couleurs et d'équipements sélectionnés automatiquement pour correspondre à une
              palette harmonieuse. Cliquez sur un skin pour découvrir les détails de sa composition.
            </p>
            <div className="gallery-actions">
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
