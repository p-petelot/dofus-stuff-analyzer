import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import type { GeneratedCandidate } from "../lib/train/types";
import { SLOTS } from "../lib/config/suggestions";

interface RandomResponse {
  candidates: GeneratedCandidate[];
}

const DEFAULT_BATCH_SIZE = 12;
const MIN_COUNT = 4;
const MAX_COUNT = 48;
const COUNT_STEP = 4;
const SLOT_ORDER = SLOTS;
const SKELETON_ITEMS = SLOT_ORDER.length;

type TrainingCardEntry = GeneratedCandidate | null;

function clampCount(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.min(Math.max(Math.round(value), MIN_COUNT), MAX_COUNT);
}

function resolveClassName(candidate: GeneratedCandidate): string {
  if (candidate.className && candidate.className.trim()) {
    return candidate.className.trim();
  }
  if (candidate.classKey && candidate.classKey.trim()) {
    const trimmed = candidate.classKey.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  return "Classe inconnue";
}

function formatSexLabel(sex: GeneratedCandidate["sex"]): string {
  return sex === "female" ? "Féminin" : "Masculin";
}

function buildPaletteEntries(candidate: GeneratedCandidate): Array<{ key: string; color: string }> {
  return Object.entries(candidate.palette.colors).map(([key, color]) => ({
    key,
    color,
  }));
}

function formatGenerationLabel(generation: number): string {
  const padded = generation.toString().padStart(2, "0");
  return `#${padded}`;
}

function getItemInitial(label: string | null | undefined): string {
  if (typeof label !== "string" || !label.trim()) {
    return "?";
  }
  const trimmed = label.trim();
  return trimmed.charAt(0).toUpperCase();
}

function TrainingCard({ candidate, index }: { candidate: TrainingCardEntry; index: number }): JSX.Element {
  const isLoading = !candidate;

  if (!candidate) {
    return (
      <article className="training-card training-card--loading" aria-busy="true">
        <div className="training-card__visual-block">
          <div className="training-card__visual">
            <span className="skeleton-block skeleton-block--image" />
          </div>
          <div className="training-card__palette-column" aria-hidden="true">
            {Array.from({ length: SKELETON_ITEMS }).map((_, paletteIndex) => (
              <span key={`palette-skeleton-${paletteIndex}`} className="skeleton-dot skeleton-dot--tall" />
            ))}
          </div>
        </div>
        <div className="training-card__meta training-card__meta--loading" aria-hidden="true">
          <span className="skeleton-line skeleton-line--title" />
          <span className="skeleton-line skeleton-line--subtitle" />
        </div>
        <ul className="training-card__items-strip" aria-hidden="true">
          {Array.from({ length: SKELETON_ITEMS }).map((_, itemIndex) => (
            <li key={`item-skeleton-${itemIndex}`}>
              <span className="skeleton-chip" />
            </li>
          ))}
        </ul>
        <div className="training-card__details training-card__details--loading" aria-hidden="true">
          <span className="skeleton-line skeleton-line--subtitle" />
        </div>
      </article>
    );
  }

  const className = resolveClassName(candidate);
  const paletteEntries = buildPaletteEntries(candidate);
  const generationNumber = candidate.generation ?? index + 1;
  const generationLabel = formatGenerationLabel(generationNumber);
  const paletteTitle = `Palette générée pour ${className}`;
  const orderedItems = [...candidate.items].sort((a, b) => {
    const aIndex = SLOT_ORDER.indexOf(a.slot);
    const bIndex = SLOT_ORDER.indexOf(b.slot);
    const safeA = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex;
    const safeB = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex;
    return safeA - safeB;
  });

  return (
    <article className="training-card" aria-busy={isLoading}>
      <div className="training-card__visual-block">
        <div className="training-card__visual">
          {candidate.imageUrl ? (
            <img
              src={candidate.imageUrl}
              alt={`Aperçu de skin pour ${className} (${formatSexLabel(candidate.sex)})`}
              loading="lazy"
            />
          ) : (
            <div className="training-card__visual-fallback">Rendu indisponible</div>
          )}
        </div>
        <div className="training-card__palette-column" aria-label={paletteTitle}>
          {paletteEntries.map(({ key, color }) => (
            <span
              key={`${candidate.id}-palette-${key}`}
              className="training-card__palette-dot"
              style={{ backgroundColor: color }}
              title={`${key} : ${color}`}
              aria-label={`${key} : ${color}`}
            />
          ))}
        </div>
      </div>
      <div className="training-card__meta">
        <div className="training-card__class-chip">
          <span className="training-card__class-icon" aria-hidden="true">
            {candidate.classIcon ? (
              <img src={candidate.classIcon} alt="" loading="lazy" />
            ) : (
              <span>{getItemInitial(className)}</span>
            )}
          </span>
          <div className="training-card__class-meta">
            <span className="training-card__class-name">{className}</span>
            <span className="training-card__sex-label">{formatSexLabel(candidate.sex)}</span>
          </div>
        </div>
        <span className="training-card__generation" aria-label={`Génération ${generationNumber}`}>
          {generationLabel}
        </span>
      </div>
      <ul className="training-card__items-strip" aria-label="Équipements choisis">
        {orderedItems.map((pick) => {
          const label = pick.item?.label ?? "Aucun objet";
          const tooltip = label;
          return (
            <li key={`${candidate.id}-${pick.slot}`}>
              <span
                className="training-card__item-chip"
                style={{ borderColor: pick.assignedColor }}
                title={tooltip}
                aria-label={tooltip}
                data-tooltip={tooltip}
                tabIndex={0}
              >
                {pick.item?.imageUrl ? (
                  <img src={pick.item.imageUrl} alt="" loading="lazy" />
                ) : (
                  <span className="training-card__item-initial">{getItemInitial(label)}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {candidate.notes.length ? (
        <div className="training-card__details">
          <ul className="training-card__notes" aria-label="Remarques">
            {candidate.notes.map((note, noteIndex) => (
              <li key={`${candidate.id}-note-${noteIndex}`}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export default function TrainingPage(): JSX.Element {
  const [desiredCount, setDesiredCount] = useState(DEFAULT_BATCH_SIZE);
  const [cards, setCards] = useState<TrainingCardEntry[]>(() =>
    Array.from({ length: DEFAULT_BATCH_SIZE }, () => null),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const [batchId, setBatchId] = useState(0);
  const [coherentColors, setCoherentColors] = useState(false);

  const regenerate = useCallback(
    async (count: number) => {
      const clamped = clampCount(count);
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setBatchId(requestId);
      setLoading(true);
      setError(null);
      setCards(Array.from({ length: clamped }, () => null));
      try {
        const response = await fetch("/api/train/random", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: clamped, coherentColors }),
        });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as RandomResponse;
        if (requestId !== requestIdRef.current) {
          return;
        }
        setCards(Array.isArray(payload.candidates) ? payload.candidates : []);
      } catch (err) {
        if (requestId !== requestIdRef.current) {
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setCards([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [coherentColors],
  );

  useEffect(() => {
    void regenerate(DEFAULT_BATCH_SIZE);
  }, [regenerate]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void regenerate(desiredCount);
    },
    [desiredCount, regenerate],
  );

  const handleSliderChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const next = clampCount(Number(event.target.value));
    setDesiredCount(next);
  }, []);

  const handleNumberChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (Number.isNaN(value)) {
      return;
    }
    setDesiredCount(clampCount(value));
  }, []);

  const handleCoherenceChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setCoherentColors(event.target.checked);
  }, []);

  return (
    <>
      <Head>
        <title>Galerie de skins — Génération aléatoire</title>
      </Head>
      <main className="training-page">
      <section className="training-hero">
        <div className="training-hero__content">
          <span className="training-hero__eyebrow">Galerie</span>
          <h1>Galerie de skins</h1>
          <p>Découvre des rendus Dofus générés aléatoirement et ajuste la galerie en fonction de tes envies.</p>
          <Link href="/" className="training-hero__back-link">
            ← Retour à l&apos;accueil
          </Link>
        </div>
          <form className="training-hero__controls" onSubmit={handleSubmit}>
            <div className="training-hero__row">
              <label htmlFor="training-count" className="training-hero__label">
                Nombre de skins
              </label>
              <div className="training-hero__count-input">
                <input
                  type="number"
                  min={MIN_COUNT}
                  max={MAX_COUNT}
                  step={COUNT_STEP}
                  value={desiredCount}
                  onChange={handleNumberChange}
                  aria-label="Nombre de skins"
                />
                <span>skins</span>
              </div>
            </div>
            <input
              id="training-count"
              type="range"
              min={MIN_COUNT}
              max={MAX_COUNT}
              step={COUNT_STEP}
              value={desiredCount}
              onChange={handleSliderChange}
              aria-label="Nombre de skins à générer"
            />
            <label className="training-hero__checkbox">
              <input type="checkbox" checked={coherentColors} onChange={handleCoherenceChange} />
              <span>Cohérence visuelle</span>
            </label>
            <button type="submit" className="training-button" disabled={loading}>
              {loading ? "Génération en cours…" : "Actualiser la galerie"}
            </button>
            {error ? <p className="training-error">Erreur: {error}</p> : null}
          </form>
        </section>
        <section className="training-grid" aria-live="polite">
          {cards.length === 0 && !loading ? (
            <p className="training-empty">Aucun rendu à afficher pour le moment.</p>
          ) : null}
          {cards.map((entry, index) => (
            <TrainingCard
              key={entry ? entry.id : `skeleton-${batchId}-${index}`}
              candidate={entry}
              index={index}
            />
          ))}
        </section>
      </main>
    </>
  );
}
