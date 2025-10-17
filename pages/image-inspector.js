import { useCallback, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";

const DEFAULT_URL = "https://barbofus.com/skinator?s=N4IgjCBcYDQgTFA7HAzFMAGArHALFANpgBsmq2YAHPDFtuXiSTCQ3kiSqUqkkgE5aPPoNpIqVVFTwCAunGxRQJKPCR54mOEgyYwA7PDyZycKlFSYmeOALUyBVOFjUC8eVC4iR4ApAwuiL6OKODokAB2AK4ANrEAvglAA";

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function ImageInspector() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [response, setResponse] = useState(null);

  const handleSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      setError(null);
      setResponse(null);

      const trimmed = (url ?? "").trim();
      if (!trimmed) {
        setError("Merci de renseigner une URL valide.");
        return;
      }

      setLoading(true);
      try {
        const encodedUrl = encodeURIComponent(trimmed);
        const res = await fetch(`/api/site-images?url=${encodedUrl}`);
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          const message = payload?.error ?? `La requête a échoué (${res.status})`;
          throw new Error(message);
        }
        const payload = await res.json();
        setResponse(payload);
      } catch (fetchError) {
        setError(fetchError?.message ?? "Impossible de récupérer les images.");
      } finally {
        setLoading(false);
      }
    },
    [url]
  );

  const images = useMemo(() => response?.images ?? [], [response]);
  const rendering = response?.rendering ?? null;
  const renderingDiagnostics = useMemo(
    () => rendering?.diagnostics ?? [],
    [rendering]
  );

  return (
    <div className="inspector-page">
      <Head>
        <title>Inspecteur d&apos;images Barbofus</title>
        <meta
          name="description"
          content="Outil de diagnostic pour visualiser toutes les images et canvas extraits d'une page Barbofus."
        />
      </Head>
      <main className="inspector-page__main">
        <header className="inspector-header">
          <h1>Inspecteur d&apos;images / canvas</h1>
          <p>
            Soumettez une URL Barbofus pour récupérer toutes les images détectées, leurs attributs correspondants et un
            aperçu encodé en base64.
          </p>
          <p className="inspector-header__back">
            <Link href="/" className="inspector-link inspector-link--subtle">
              ← Retour à l&apos;outil principal
            </Link>
          </p>
        </header>

        <form onSubmit={handleSubmit} className="inspector-form">
          <label className="inspector-form__field">
            <span className="inspector-form__label">URL à inspecter</span>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://barbofus.com/skinator?s=..."
              className="inspector-form__input"
              required
            />
          </label>
          <button type="submit" disabled={loading} className="inspector-form__submit">
            {loading ? "Analyse en cours..." : "Analyser la page"}
          </button>
        </form>

        {error ? (
          <div className="inspector-alert inspector-alert--error">{error}</div>
        ) : null}

        {response ? (
          <section className="inspector-results">
            <div className="inspector-summary">
              <p>
                <span className="inspector-summary__label">URL analysée :</span>{" "}
                <a
                  href={response.requestedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inspector-link inspector-link--emphasis"
                >
                  {response.requestedUrl}
                </a>
              </p>
              <p>
                <span className="inspector-summary__label">Images uniques :</span> {response.uniqueImages}
              </p>
              <p>
                <span className="inspector-summary__label">Occurrences totales :</span> {response.totalMatches}
              </p>
              {rendering ? (
                <div className="inspector-rendering">
                  <p>
                    <span className="inspector-summary__label">Mode de rendu :</span>{" "}
                    {rendering.mode === "puppeteer"
                      ? "navigateur sans interface (Puppeteer)"
                      : "requête HTTP"}
                  </p>
                  <p>
                    <span className="inspector-summary__label">Canvas capturés :</span>{" "}
                    {rendering.captured} / {rendering.canvasCount}
                  </p>
                  {rendering.attemptedHeadless && rendering.mode !== "puppeteer" ? (
                    <p className="inspector-rendering__warning">
                      Échec de la capture headless, retour au HTML brut.
                    </p>
                  ) : null}
                  {rendering.error ? (
                    <p className="inspector-rendering__error">Erreur : {rendering.error}</p>
                  ) : null}
                  {rendering.fallbackStatus ? (
                    <p className="inspector-rendering__note">
                      Statut HTTP du fallback : {rendering.fallbackStatus}
                    </p>
                  ) : null}
                  {renderingDiagnostics.length ? (
                    <details className="inspector-rendering__details">
                      <summary>Canvas non exportables ({renderingDiagnostics.length})</summary>
                      <ul>
                        {renderingDiagnostics.map((diagnostic, diagIndex) => (
                          <li key={diagIndex}>
                            <div className="inspector-pill-row">
                              <span className="inspector-pill">#{diagnostic.index}</span>
                              {diagnostic.elementId ? (
                                <span className="inspector-pill">id: {diagnostic.elementId}</span>
                              ) : null}
                              {diagnostic.elementClass ? (
                                <span className="inspector-pill">class: {diagnostic.elementClass}</span>
                              ) : null}
                            </div>
                            <p className="inspector-rendering__diagnostic">{diagnostic.error}</p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="inspector-grid">
              {images.length === 0 ? (
                <p className="inspector-empty">Aucune image détectée.</p>
              ) : (
                images.map((image, index) => {
                  const displaySrc = image.base64
                    ? `data:${image.contentType ?? "image/png"};base64,${image.base64}`
                    : null;
                  const sizeLabel = formatBytes(image.byteLength);
                  return (
                    <article key={`${image.url}-${index}`} className="inspector-card">
                      <div className="inspector-card__header">
                        <a
                          href={image.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inspector-link inspector-link--break"
                        >
                          {image.url}
                        </a>
                        <div className="inspector-card__meta">
                          {image.contentType ? <span className="inspector-pill">{image.contentType}</span> : null}
                          {sizeLabel ? <span className="inspector-pill">{sizeLabel}</span> : null}
                          {typeof image.status !== "undefined" ? (
                            <span className="inspector-pill">statut: {image.status}</span>
                          ) : null}
                          {image.error ? (
                            <span className="inspector-pill inspector-pill--error">erreur: {image.error}</span>
                          ) : null}
                        </div>
                      </div>

                      {displaySrc ? (
                        <div className="inspector-preview">
                          <img
                            src={displaySrc}
                            alt="Prévisualisation décodée"
                            className="inspector-preview__image"
                          />
                        </div>
                      ) : (
                        <p className="inspector-preview inspector-preview--empty">
                          Impossible d&apos;afficher un aperçu pour cette ressource.
                        </p>
                      )}

                      <div className="inspector-matches">
                        <p className="inspector-matches__title">Correspondances</p>
                        <ul className="inspector-matches__list">
                          {image.matches?.map((match, matchIndex) => (
                            <li key={matchIndex} className="inspector-matches__item">
                              <div className="inspector-pill-row">
                                {match.element ? <span className="inspector-pill">{match.element}</span> : null}
                                {match.source ? <span className="inspector-pill">{match.source}</span> : null}
                                {match.attribute ? <span className="inspector-pill">{match.attribute}</span> : null}
                                {match.elementId ? <span className="inspector-pill">id: {match.elementId}</span> : null}
                                {match.elementClass ? (
                                  <span className="inspector-pill">class: {match.elementClass}</span>
                                ) : null}
                              </div>
                              {match.descriptor ? (
                                <p className="inspector-match__descriptor">{match.descriptor}</p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
