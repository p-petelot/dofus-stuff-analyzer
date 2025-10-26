import { useCallback, useEffect, useMemo, useState } from "react";
import Head from "next/head";
import type {
  EvaluatedCandidate,
  TrainingIterationSummary,
  TrainingRunRecord,
  Policy,
} from "../lib/train/types";

type PreviewStatus = "idle" | "loading" | "loaded" | "error";

interface PreviewState {
  status: PreviewStatus;
  thumbUrl: string | null;
  hdUrl: string | null;
  error?: string;
}

interface LookPreviewPayload {
  dataUrl?: string | null;
  rendererUrl?: string | null;
  lookUrl?: string | null;
}

const previewCache = new Map<string, PreviewState>();

function buildPreviewCacheKey(candidate: EvaluatedCandidate): string | null {
  const preview = candidate.preview;
  if (!preview) {
    return null;
  }
  const colorKey = Array.isArray(preview.colors) ? preview.colors.join("-") : "";
  const itemKey = Array.isArray(preview.itemIds) ? preview.itemIds.join("-") : "";
  return [
    preview.classId,
    preview.faceId,
    preview.gender,
    preview.direction,
    preview.animation,
    colorKey,
    itemKey,
  ].join("|");
}

function coerceGenderCode(input: string): string {
  return input === "female" ? "f" : "m";
}

function resolvePreviewLink(payload: LookPreviewPayload, fallback: string | null): string | null {
  if (typeof payload.rendererUrl === "string" && payload.rendererUrl.trim().length) {
    return payload.rendererUrl;
  }
  if (typeof payload.lookUrl === "string" && payload.lookUrl.trim().length) {
    return payload.lookUrl;
  }
  return fallback;
}

function useCandidatePreview(candidate: EvaluatedCandidate): PreviewState {
  const [state, setState] = useState<PreviewState>(() => {
    if (candidate.imageUrl) {
      return { status: "loaded", thumbUrl: candidate.imageUrl, hdUrl: candidate.imageUrl };
    }
    return { status: "idle", thumbUrl: null, hdUrl: null };
  });

  useEffect(() => {
    if (candidate.imageUrl) {
      setState({ status: "loaded", thumbUrl: candidate.imageUrl, hdUrl: candidate.imageUrl });
      return;
    }

    const preview = candidate.preview;
    if (!preview) {
      setState({ status: "error", thumbUrl: null, hdUrl: null, error: "Aperçu indisponible" });
      return;
    }

    const cacheKey = buildPreviewCacheKey(candidate);
    if (cacheKey) {
      const cached = previewCache.get(cacheKey);
      if (cached) {
        setState({ ...cached });
        return;
      }
    }

    let cancelled = false;
    const controller = new AbortController();
    setState({ status: "loading", thumbUrl: null, hdUrl: null });

    const params = new URLSearchParams();
    params.set("breedId", String(preview.classId));
    params.set("gender", coerceGenderCode(preview.gender));
    params.set("faceId", String(preview.faceId));
    params.set("direction", String(preview.direction));
    params.set("animation", String(preview.animation));
    params.set("size", "384");
    (Array.isArray(preview.itemIds) ? preview.itemIds : []).forEach((id) => {
      if (Number.isFinite(id)) {
        params.append("itemIds[]", String(id));
      }
    });
    (Array.isArray(preview.colors) ? preview.colors : []).forEach((value) => {
      if (Number.isFinite(value)) {
        params.append("colors[]", String(value));
      }
    });

    fetch(`/api/look-preview?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const message = `HTTP ${response.status}`;
          throw new Error(message);
        }
        const payload = (await response.json()) as LookPreviewPayload & { dataUrl?: string };
        const thumbUrl = typeof payload.dataUrl === "string" ? payload.dataUrl : null;
        const hdUrl = resolvePreviewLink(payload, thumbUrl);
        const nextState: PreviewState = thumbUrl
          ? { status: "loaded", thumbUrl, hdUrl: hdUrl ?? thumbUrl }
          : { status: "error", thumbUrl: null, hdUrl: hdUrl ?? null, error: "Aperçu indisponible" };
        if (cacheKey) {
          previewCache.set(cacheKey, { ...nextState });
        }
        if (!cancelled) {
          setState({ ...nextState });
        }
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        const errorState: PreviewState = { status: "error", thumbUrl: null, hdUrl: null, error: message };
        if (cacheKey) {
          previewCache.set(cacheKey, { ...errorState });
        }
        if (!cancelled) {
          setState({ ...errorState });
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [candidate.id, candidate.imageUrl, candidate.preview]);

  return state;
}

interface TrainingCandidateCardProps {
  candidate: EvaluatedCandidate;
  onFeedback: (candidateId: string, like: boolean) => void;
}

function TrainingCandidateCard({ candidate, onFeedback }: TrainingCandidateCardProps) {
  const preview = useCandidatePreview(candidate);
  const themeLabel = candidate.theme ?? "Sans thème";
  const scoreLabel = formatScore(candidate.evaluation.score);
  const feedbackLike = () => onFeedback(candidate.id, true);
  const feedbackDislike = () => onFeedback(candidate.id, false);

  return (
    <div className="training-candidate">
      <div className={`training-candidate__thumb training-candidate__thumb--${preview.status}`}>
        {preview.thumbUrl ? (
          <img src={preview.thumbUrl} alt={candidate.classKey} loading="lazy" />
        ) : (
          <span className="training-candidate__placeholder">
            {preview.status === "loading" ? "Aperçu en cours…" : "Aperçu indisponible"}
          </span>
        )}
      </div>
      <div className="training-candidate__meta">
        <strong>{candidate.classKey}</strong>
        <span>Score {scoreLabel}</span>
        <span>{themeLabel}</span>
        <span>{candidate.jokerCount} joker(s)</span>
      </div>
      <footer className="training-candidate__actions">
        {preview.hdUrl ? (
          <a href={preview.hdUrl} target="_blank" rel="noreferrer">
            Voir
          </a>
        ) : null}
        <button type="button" onClick={feedbackLike} aria-label="J'aime cette proposition">
          👍
        </button>
        <button type="button" onClick={feedbackDislike} aria-label="Je n'aime pas cette proposition">
          👎
        </button>
      </footer>
    </div>
  );
}

interface StatusResponse {
  runs: TrainingRunRecord[];
  activeRunId: string | null;
}

type FilterState = {
  classKey: string;
  theme: string;
  minScore: number;
  jokersOnly: boolean;
};

const DEFAULT_FILTERS: FilterState = {
  classKey: "all",
  theme: "all",
  minScore: 0,
  jokersOnly: false,
};

const POLL_INTERVAL = 5000;

function useTrainingData() {
  const [status, setStatus] = useState<StatusResponse>({ runs: [], activeRunId: null });
  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/train/status");
        if (!response.ok) return;
        const json = (await response.json()) as StatusResponse;
        if (!cancelled) {
          setStatus(json);
        }
      } catch (error) {
        console.warn("status poll failed", error);
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
  return status;
}

function formatScore(score: number): string {
  return score.toFixed(1);
}

function lastPolicy(run?: TrainingRunRecord) {
  if (!run) return null;
  const entries = Object.entries(run.policySnapshots ?? {});
  if (!entries.length) return null;
  const [iteration, policy] = entries.sort((a, b) => Number(a[0]) - Number(b[0])).at(-1)!;
  return { iteration: Number(iteration), policy };
}

function filterCandidates(iteration: TrainingIterationSummary, filters: FilterState): EvaluatedCandidate[] {
  return iteration.candidates.filter((candidate) => {
    if (filters.classKey !== "all" && candidate.classKey !== filters.classKey) {
      return false;
    }
    if (filters.theme !== "all" && candidate.theme !== filters.theme) {
      return false;
    }
    if (filters.jokersOnly && candidate.jokerCount === 0) {
      return false;
    }
    if (candidate.evaluation.score < filters.minScore) {
      return false;
    }
    return true;
  });
}

function aggregateMetrics(run?: TrainingRunRecord) {
  if (!run) {
    return { best: 0, average: 0, iterations: 0, samples: 0 };
  }
  const iterations = run.iterations.length;
  const samples = run.iterations.reduce((sum, iteration) => sum + iteration.candidates.length, 0);
  const best = run.iterations.reduce(
    (max, iteration) => Math.max(max, iteration.bestScore ?? 0),
    0,
  );
  const average = iterations
    ? run.iterations.reduce((sum, iteration) => sum + iteration.avgScore, 0) / iterations
    : 0;
  return { best, average, iterations, samples };
}

const paletteOrder: Array<keyof Policy["paletteBias"]> = [
  "triad",
  "split",
  "analogous",
  "complementary",
];

function TrainingPage() {
  const status = useTrainingData();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  useEffect(() => {
    if (!selectedRunId && status.runs.length) {
      setSelectedRunId(status.activeRunId ?? status.runs[0].id);
    }
  }, [status, selectedRunId]);

  const activeRun = useMemo(() => {
    if (!status.runs.length) return undefined;
    if (!selectedRunId) return status.runs[0];
    return status.runs.find((run) => run.id === selectedRunId) ?? status.runs[0];
  }, [status.runs, selectedRunId]);

  const metrics = useMemo(() => aggregateMetrics(activeRun), [activeRun]);
  const policySnapshot = useMemo(() => lastPolicy(activeRun), [activeRun]);

  const availableClasses = useMemo(() => {
    if (!activeRun) return [] as string[];
    const classes = new Set<string>();
    activeRun.iterations.forEach((iteration) => {
      iteration.candidates.forEach((candidate) => classes.add(candidate.classKey));
    });
    return Array.from(classes);
  }, [activeRun]);

  const availableThemes = useMemo(() => {
    if (!activeRun) return [] as string[];
    const themes = new Set<string>();
    activeRun.iterations.forEach((iteration) => {
      iteration.candidates.forEach((candidate) => {
        if (candidate.theme) {
          themes.add(candidate.theme);
        }
      });
    });
    return Array.from(themes);
  }, [activeRun]);

  const filteredIterations = useMemo(() => {
    if (!activeRun) return [] as TrainingIterationSummary[];
    return activeRun.iterations
      .map((iteration) => ({
        ...iteration,
        candidates: filterCandidates(iteration, filters),
      }))
      .filter((iteration) => iteration.candidates.length);
  }, [activeRun, filters]);

  const handleStart = useCallback(async () => {
    setIsStarting(true);
    try {
      await fetch("/api/train/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    } catch (error) {
      console.error("start run failed", error);
    } finally {
      setIsStarting(false);
    }
  }, []);

  const handleStop = useCallback(async () => {
    if (!activeRun) return;
    setIsStopping(true);
    try {
      await fetch("/api/train/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: activeRun.id }),
      });
    } catch (error) {
      console.error("stop run failed", error);
    } finally {
      setIsStopping(false);
    }
  }, [activeRun]);

  const handleFeedback = useCallback(async (candidateId: string, like: boolean) => {
    try {
      await fetch("/api/train/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, like }),
      });
    } catch (error) {
      console.error("feedback failed", error);
    }
  }, []);

  return (
    <>
      <Head>
        <title>Centre d&apos;entraînement</title>
      </Head>
      <main className="training-page">
        <header className="training-header">
          <div>
            <h1>Centre d&apos;entraînement</h1>
            <p>Génère, évalue et apprend automatiquement pour améliorer les suggestions de skins.</p>
          </div>
          <div className="training-controls">
            <label className="training-select">
              Run
              <select
                value={selectedRunId ?? ""}
                onChange={(event) => setSelectedRunId(event.target.value || null)}
              >
                {status.runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.id}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="training-button" onClick={handleStart} disabled={isStarting}>
              {isStarting ? "Démarrage…" : "Démarrer"}
            </button>
            <button
              type="button"
              className="training-button training-button--danger"
              onClick={handleStop}
              disabled={!activeRun || isStopping}
            >
              {isStopping ? "Arrêt…" : "Stop"}
            </button>
          </div>
        </header>

        <section className="training-kpis">
          <div className="training-kpi">
            <span className="training-kpi__label">Score max</span>
            <span className="training-kpi__value">{formatScore(metrics.best)}</span>
          </div>
          <div className="training-kpi">
            <span className="training-kpi__label">Score moyen</span>
            <span className="training-kpi__value">{formatScore(metrics.average)}</span>
          </div>
          <div className="training-kpi">
            <span className="training-kpi__label">Itérations</span>
            <span className="training-kpi__value">{metrics.iterations}</span>
          </div>
          <div className="training-kpi">
            <span className="training-kpi__label">Samples générés</span>
            <span className="training-kpi__value">{metrics.samples}</span>
          </div>
        </section>

        {policySnapshot ? (
          <section className="training-policy">
            <h2>Politique #{policySnapshot.iteration}</h2>
            <div className="training-policy__grid">
              <div>
                <h3>Classes</h3>
                <ul>
                  {Object.entries(policySnapshot.policy.classDist).map(([key, value]) => (
                    <li key={key}>
                      <span>{key}</span>
                      <span>{(value * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Thèmes</h3>
                <ul>
                  {Object.entries(policySnapshot.policy.themeDist).map(([key, value]) => (
                    <li key={key}>
                      <span>{key}</span>
                      <span>{(value * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Palette</h3>
                <ul>
                  {paletteOrder.map((key) => (
                    <li key={key}>
                      <span>{key}</span>
                      <span>{((policySnapshot.policy.paletteBias[key] ?? 0) * 100).toFixed(1)}%</span>
                    </li>
                  ))}
                </ul>
                <p>Taux de jokers: {(policySnapshot.policy.jokerRate * 100).toFixed(1)}%</p>
              </div>
            </div>
          </section>
        ) : null}

        <section className="training-filters">
          <h2>Filtres</h2>
          <div className="training-filters__grid">
            <label>
              Classe
              <select
                value={filters.classKey}
                onChange={(event) => setFilters((prev) => ({ ...prev, classKey: event.target.value }))}
              >
                <option value="all">Toutes</option>
                {availableClasses.map((classKey) => (
                  <option key={classKey} value={classKey}>
                    {classKey}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Thème
              <select
                value={filters.theme}
                onChange={(event) => setFilters((prev) => ({ ...prev, theme: event.target.value }))}
              >
                <option value="all">Tous</option>
                {availableThemes.map((theme) => (
                  <option key={theme} value={theme}>
                    {theme}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Score ≥
              <input
                type="number"
                min={0}
                max={100}
                value={filters.minScore}
                onChange={(event) => setFilters((prev) => ({ ...prev, minScore: Number(event.target.value) }))}
              />
            </label>
            <label className="training-checkbox">
              <input
                type="checkbox"
                checked={filters.jokersOnly}
                onChange={(event) => setFilters((prev) => ({ ...prev, jokersOnly: event.target.checked }))}
              />
              Jokers uniquement
            </label>
          </div>
        </section>

        <section className="training-iterations">
          <h2>Itérations</h2>
          <div className="training-iterations__grid">
            {filteredIterations.map((iteration) => (
              <article key={iteration.index} className="training-iteration">
                <header>
                  <h3>Itération #{iteration.index}</h3>
                  <span>Score: {formatScore(iteration.bestScore)}</span>
                </header>
                <div className="training-candidate-grid">
                  {iteration.candidates.map((candidate) => (
                    <TrainingCandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      onFeedback={handleFeedback}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

export default TrainingPage;
