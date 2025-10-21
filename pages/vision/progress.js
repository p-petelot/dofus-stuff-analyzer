import { useEffect, useMemo, useState } from "react";
import Head from "next/head";

const REFRESH_INTERVAL = 5000;

const STATUS_LABELS = {
  idle: "Inactif",
  running: "En cours",
  completed: "Terminé",
  failed: "Terminé avec erreurs",
};

function formatPercent(processed, total) {
  if (!total) {
    return "0%";
  }
  const pct = Math.min(100, Math.max(0, (processed / total) * 100));
  return `${pct.toFixed(1)}%`;
}

function formatDate(timestamp) {
  if (!timestamp) {
    return "-";
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString();
}

function formatDuration(start, end) {
  if (!start) {
    return "-";
  }
  const endTime = end ?? Date.now();
  const diff = Math.max(0, endTime - start);
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

export default function VisionProgressPage() {
  const [state, setState] = useState({
    status: "idle",
    current: null,
    lastRun: null,
    history: [],
    latestIndex: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let active = true;
    let timeoutId;

    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/vision-progress");
        if (!response.ok) {
          throw new Error(`Impossible de récupérer le statut (${response.status})`);
        }
        const data = await response.json();
        if (active) {
          setState((prev) => ({
            ...prev,
            ...data,
            loading: false,
            error: null,
          }));
        }
      } catch (error) {
        if (active) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: error instanceof Error ? error.message : String(error),
          }));
        }
      } finally {
        if (active) {
          timeoutId = window.setTimeout(fetchStatus, REFRESH_INTERVAL);
        }
      }
    };

    fetchStatus();

    return () => {
      active = false;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const { status, current, lastRun, history, latestIndex, loading, error } = state;

  const displayRun = current ?? lastRun;
  const isRunning = status === "running";

  const progressInfo = useMemo(() => {
    if (!displayRun) {
      return null;
    }
    const total = displayRun.totalExamples ?? 0;
    const processed = displayRun.processedExamples ?? 0;
    const failed = displayRun.failedExamples ?? 0;
    const reused = displayRun.reusedExamples ?? 0;
    const percent = formatPercent(processed, total);
    return {
      total,
      processed,
      failed,
      reused,
      percent,
    };
  }, [displayRun]);

  return (
    <>
      <Head>
        <title>Suivi de l&apos;IA - Dofus Stuff Analyzer</title>
      </Head>
      <main className="vision-progress">
        <h1>Suivi des entraînements IA</h1>
        <section className="vision-progress__card">
          <h2>Statut actuel</h2>
          {loading ? <p>Chargement...</p> : null}
          {error ? <p className="vision-progress__error">{error}</p> : null}
          {!isRunning && displayRun ? (
            <p className="vision-progress__note">Affichage des informations du dernier entraînement.</p>
          ) : null}
          <dl>
            <div>
              <dt>Statut</dt>
              <dd>{STATUS_LABELS[status] ?? status}</dd>
            </div>
            <div>
              <dt>{isRunning ? "Message en cours" : "Dernier message"}</dt>
              <dd>{displayRun?.message ?? "-"}</dd>
            </div>
            <div>
              <dt>{isRunning ? "Exemple en cours" : "Dernier exemple"}</dt>
              <dd>{displayRun?.lastExampleId ?? "-"}</dd>
            </div>
            <div>
              <dt>{isRunning ? "Démarrage" : "Dernier démarrage"}</dt>
              <dd>{formatDate(displayRun?.startedAt)}</dd>
            </div>
            <div>
              <dt>Dernière mise à jour</dt>
              <dd>{formatDate(displayRun?.updatedAt)}</dd>
            </div>
            <div>
              <dt>Durée</dt>
              <dd>{formatDuration(displayRun?.startedAt, displayRun?.finishedAt)}</dd>
            </div>
          </dl>
          {progressInfo ? (
            <div className="vision-progress__metrics">
              <div>
                <span className="vision-progress__metric">{progressInfo.percent}</span>
                <span className="vision-progress__metric-label">
                  {isRunning ? "Progression" : "Progression finale"}
                </span>
              </div>
              <div>
                <span className="vision-progress__metric">{progressInfo.processed}</span>
                <span className="vision-progress__metric-label">Traités / {progressInfo.total}</span>
              </div>
              <div>
                <span className="vision-progress__metric">{progressInfo.reused}</span>
                <span className="vision-progress__metric-label">Réutilisés</span>
              </div>
              <div>
                <span className="vision-progress__metric">{progressInfo.failed}</span>
                <span className="vision-progress__metric-label">Échecs</span>
              </div>
            </div>
          ) : null}
        </section>

        <section className="vision-progress__card">
          <h2>Index actuel</h2>
          {latestIndex ? (
            <dl>
              <div>
                <dt>Mise à jour</dt>
                <dd>{formatDate(latestIndex.updatedAt)}</dd>
              </div>
              <div>
                <dt>Entrées</dt>
                <dd>{latestIndex.entryCount}</dd>
              </div>
              <div>
                <dt>Taille du dataset</dt>
                <dd>{latestIndex.datasetSize}</dd>
              </div>
              <div>
                <dt>Chemin dataset</dt>
                <dd>{latestIndex.datasetPath}</dd>
              </div>
              <div>
                <dt>Modèle CLIP</dt>
                <dd>{latestIndex.clipModel ?? "-"}</dd>
              </div>
            </dl>
          ) : (
            <p>Aucun index construit pour le moment.</p>
          )}
        </section>

        <section className="vision-progress__card">
          <h2>Historique des entraînements</h2>
          {history && history.length ? (
            <div className="vision-progress__table-wrapper">
              <table className="vision-progress__table">
                <thead>
                  <tr>
                    <th>Statut</th>
                    <th>Début</th>
                    <th>Fin</th>
                    <th>Durée</th>
                    <th>Traités</th>
                    <th>Réutilisés</th>
                    <th>Échecs</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((run) => (
                    <tr key={run.id}>
                      <td>{STATUS_LABELS[run.status] ?? run.status}</td>
                      <td>{formatDate(run.startedAt)}</td>
                      <td>{formatDate(run.finishedAt)}</td>
                      <td>{formatDuration(run.startedAt, run.finishedAt)}</td>
                      <td>
                        {run.processedExamples}/{run.totalExamples}
                      </td>
                      <td>{run.reusedExamples}</td>
                      <td>{run.failedExamples}</td>
                      <td>{run.message ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Aucun entraînement enregistré pour le moment.</p>
          )}
        </section>
      </main>
      <style jsx>{`
        .vision-progress {
          max-width: 960px;
          margin: 0 auto;
          padding: 2rem 1rem 4rem;
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .vision-progress__card {
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
          padding: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .vision-progress__card h2 {
          margin: 0;
          font-size: 1.2rem;
          color: #111827;
        }

        dl {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem 1.5rem;
          margin: 0;
        }

        dt {
          font-weight: 600;
          color: #4b5563;
        }

        dd {
          margin: 0;
          color: #111827;
        }

        .vision-progress__metrics {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 1rem;
        }

        .vision-progress__metric {
          display: block;
          font-size: 1.8rem;
          font-weight: 700;
          color: #2563eb;
        }

        .vision-progress__metric-label {
          display: block;
          font-size: 0.85rem;
          color: #6b7280;
        }

        .vision-progress__error {
          color: #b91c1c;
          font-weight: 600;
        }

        .vision-progress__note {
          margin: 0;
          font-size: 0.9rem;
          color: #2563eb;
        }

        .vision-progress__table-wrapper {
          width: 100%;
          overflow-x: auto;
        }

        .vision-progress__table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.95rem;
        }

        .vision-progress__table th,
        .vision-progress__table td {
          border-bottom: 1px solid #e5e7eb;
          padding: 0.5rem 0.75rem;
          text-align: left;
        }

        .vision-progress__table th {
          background: #f9fafb;
          font-weight: 600;
        }

        @media (max-width: 600px) {
          .vision-progress {
            padding: 1.5rem 1rem 3rem;
          }

          .vision-progress__metrics {
            grid-template-columns: repeat(2, minmax(120px, 1fr));
          }
        }
      `}</style>
    </>
  );
}
