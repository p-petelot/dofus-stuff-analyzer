import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import type { CandidateItemPick, GeneratedCandidate } from "../lib/train/types";

interface RandomResponse {
  candidates: GeneratedCandidate[];
}

const DEFAULT_BATCH_SIZE = 12;

function formatClassName(classKey: string): string {
  if (typeof classKey !== "string" || classKey.trim().length === 0) {
    return "Classe inconnue";
  }
  const normalized = classKey.trim().toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatSexLabel(sex: GeneratedCandidate["sex"]): string {
  return sex === "female" ? "Féminin" : "Masculin";
}

function formatSlotLabel(slot: CandidateItemPick["slot"]): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

function buildPaletteEntries(candidate: GeneratedCandidate): Array<{ key: string; color: string }> {
  return Object.entries(candidate.palette.colors).map(([key, color]) => ({
    key,
    color,
  }));
}

function useRandomCandidates(count: number): {
  candidates: GeneratedCandidate[];
  loading: boolean;
  error: string | null;
  regenerate: () => Promise<void>;
} {
  const [candidates, setCandidates] = useState<GeneratedCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/train/random", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = (await response.json()) as RandomResponse;
      setCandidates(Array.isArray(payload.candidates) ? payload.candidates : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [count]);

  useEffect(() => {
    void regenerate();
  }, [regenerate]);

  return { candidates, loading, error, regenerate };
}

function TrainingCard({ candidate }: { candidate: GeneratedCandidate }) {
  const paletteEntries = useMemo(() => buildPaletteEntries(candidate), [candidate]);
  const notes = Array.isArray(candidate.notes) ? candidate.notes : [];

  return (
    <article className="training-card">
      <div className="training-card__image" aria-busy={!candidate.imageUrl}>
        {candidate.imageUrl ? (
          <img src={candidate.imageUrl} alt={`${candidate.classKey} ${candidate.sex}`} loading="lazy" />
        ) : (
          <span className="training-card__placeholder">Rendu indisponible</span>
        )}
      </div>
      <div className="training-card__body">
        <header className="training-card__header">
          <h3>{formatClassName(candidate.classKey)}</h3>
          <span className="training-card__sex">{formatSexLabel(candidate.sex)}</span>
        </header>
        <section className="training-card__palette" aria-label="Palette générée">
          <h4>Palette</h4>
          <ul>
            {paletteEntries.map(({ key, color }) => (
              <li key={key}>
                <span className="training-card__swatch" style={{ backgroundColor: color }} aria-hidden="true" />
                <span className="training-card__swatch-label">{key}</span>
                <span className="training-card__swatch-value">{color}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="training-card__items" aria-label="Équipements choisis">
          <h4>Équipements</h4>
          <ul>
            {candidate.items.map((pick) => (
              <li key={`${candidate.id}-${pick.slot}`}>
                <span
                  className="training-card__swatch training-card__swatch--small"
                  style={{ backgroundColor: pick.assignedColor }}
                  aria-hidden="true"
                />
                <span className="training-card__slot">{formatSlotLabel(pick.slot)}</span>
                <span className="training-card__item">{pick.item?.label ?? "Aucun objet"}</span>
              </li>
            ))}
          </ul>
        </section>
        {candidate.theme ? <p className="training-card__note">Thème: {candidate.theme}</p> : null}
        {notes.length ? (
          <ul className="training-card__notes">
            {notes.map((note, index) => (
              <li key={`${candidate.id}-note-${index}`}>{note}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

export default function TrainingPage(): JSX.Element {
  const { candidates, loading, error, regenerate } = useRandomCandidates(DEFAULT_BATCH_SIZE);

  return (
    <>
      <Head>
        <title>Centre d'entraînement — Génération aléatoire</title>
      </Head>
      <main className="training-page">
        <section className="training-hero">
          <div>
            <h1>Centre d'entraînement</h1>
            <p>
              Génère une galerie de looks aléatoires en combinant classes, sexes, couleurs et équipements pour
              explorer rapidement de nouvelles idées.
            </p>
          </div>
          <button type="button" className="training-button" onClick={() => void regenerate()} disabled={loading}>
            {loading ? "Génération en cours…" : "Générer de nouveaux skins"}
          </button>
        </section>
        {error ? <p className="training-error">Erreur: {error}</p> : null}
        <section className="training-grid" aria-live="polite">
          {loading && candidates.length === 0 ? (
            <p className="training-empty">Chargement des rendus…</p>
          ) : null}
          {candidates.map((candidate) => (
            <TrainingCard key={candidate.id} candidate={candidate} />
          ))}
        </section>
      </main>
    </>
  );
}
