
import { useMemo, useState } from "react";
import Head from "next/head";

const ELEMENT_INFO = {
  Eau: { tone: "water", icon: "💧" },
  Terre: { tone: "earth", icon: "🪨" },
  Feu: { tone: "fire", icon: "🔥" },
  Air: { tone: "air", icon: "🌬️" },
  Multi: { tone: "multi", icon: "✨" },
};

const CLASS_ICON = {
  "Crâ": "🏹",
  Iop: "⚔️",
  Ecaflip: "🎲",
  Sacrieur: "🩸",
  Eniripsa: "💉",
  "Féca": "🛡️",
  Sram: "🗡️",
  "Xélor": "⏳",
  Enutrof: "💰",
  Pandawa: "🍶",
  Roublard: "💣",
  Steamer: "⚙️",
  Huppermage: "🔮",
  Osamodas: "🐾",
  Sadida: "🌿",
  Eliotrope: "🌀",
  Ouginak: "🐺",
  Zobal: "🎭",
  Forgelance: "🪓",
};

function groupBySlot(items = []) {
  const m = new Map();
  for (const it of items) {
    const slot = it.slot || "Autre";
    if (!m.has(slot)) m.set(slot, []);
    m.get(slot).push(it);
  }
  const order = [
    "Amulette",
    "Coiffe",
    "Cape",
    "Ceinture",
    "Bottes",
    "Anneau 1",
    "Anneau 2",
    "Anneau",
    "Bouclier",
    "Arme",
    "Monture",
    "Familier",
    "Dofus",
    "Trophée",
    "Dofus/Trophées",
    "Autre",
  ];
  return Array.from(m.entries()).sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
}

function Tag({ children, tone = "neutral", icon, subtle }) {
  const cls = ["tag", `tag--${tone}`];
  if (subtle) cls.push("tag--subtle");
  return (
    <span className={cls.join(" ")}>
      {icon ? (
        <span className="tag__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span>{children}</span>
    </span>
  );
}

function SourceBadges({ sources }) {
  if (!sources) return null;
  const { piped, invidious, readable, transcript_source, transcript_lang } = sources;
  return (
    <div className="tagrow tagrow--wrap">
      <Tag tone={readable ? "success" : "muted"} icon="📰">
        {readable ? "Readable mirror OK" : "Readable indisponible"}
      </Tag>
      <Tag tone={piped ? "success" : "muted"} icon="🚰">
        {piped ? "Piped OK" : "Piped KO"}
      </Tag>
      <Tag tone={invidious ? "success" : "muted"} icon="🌀">
        {invidious ? "Invidious OK" : "Invidious KO"}
      </Tag>
      <Tag tone={transcript_source ? "info" : "warning"} icon="💬">
        {transcript_source
          ? `Captions ${transcript_lang || ""}`.trim()
          : "Captions manquantes"}
      </Tag>
    </div>
  );
}

function ElementBadges({ elements, signals }) {
  const base = elements?.length ? elements : Object.keys(signals || {});
  if (!base?.length) {
    return (
      <div className="tagrow">
        <Tag tone="muted">Éléments inconnus</Tag>
      </div>
    );
  }
  return (
    <div className="tagrow tagrow--wrap">
      {base.map((el) => {
        const info = ELEMENT_INFO[el] || { tone: "accent" };
        const signal = signals?.[el];
        const ratio = signal?.weight ? Math.round(signal.weight * 100) : null;
        return (
          <Tag key={el} tone={info.tone} icon={info.icon}>
            {el}
            {signal?.count ? <span className="tag__meta">×{signal.count}</span> : null}
            {ratio ? <span className="tag__meta tag__meta--soft">{ratio}%</span> : null}
          </Tag>
        );
      })}
    </div>
  );
}

function ExoBadges({ exos }) {
  if (!exos?.length) return null;
  return (
    <div className="tagrow tagrow--wrap" style={{ marginTop: 12 }}>
      {exos.map((exo) => (
        <Tag key={exo} tone="accent" icon="⚗️">
          {exo}
        </Tag>
      ))}
    </div>
  );
}

function ConfidenceBar({ value }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="confidence">
      <div className="confidence__bar">
        <span style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
      </div>
      <span className="confidence__value">{pct}%</span>
    </div>
  );
}

function CopyButton({ text, label = "Copier" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text || "");
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {}
      }}
      type="button"
    >
      {copied ? "Copié ✓" : label}
    </button>
  );
}

export default function Home() {
  const [url, setUrl] = useState("https://youtu.be/eYhkAQ8qOiA");
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState(null);
  const [err, setErr] = useState("");

  async function run() {
    setLoading(true);
    setErr("");
    setOut(null);
    try {
      const res = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`, {
        headers: { Accept: "application/json" },
      });
      const body = await res.text();
      let json;
      try {
        json = JSON.parse(body);
      } catch {
        throw new Error(`API returned non-JSON (${res.status}). First bytes: ${body.slice(0, 150)}`);
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setOut(json);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const grouped = useMemo(() => groupBySlot(out?.items || []), [out]);
  const className = out?.class || "Classe inconnue";
  const classIcon = CLASS_ICON[out?.class] || "🧙";

  return (
    <>
      <Head>
        <title>Dofus Stuff Analyzer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      {loading ? (
        <div className="loading-bar" role="progressbar" aria-label="Analyse en cours">
          <div className="loading-bar__inner" />
        </div>
      ) : null}

      <main className="container">
        <header className="page-header">
          <span className="eyebrow">Outil communautaire</span>
          <h1>🧙‍♂️ Dofus Stuff Analyzer</h1>
          <p>
            Analyse une vidéo YouTube Dofus : transcript, OCR, items, éléments, exos et métadonnées en quelques secondes.
          </p>
        </header>

        <section className="card card--input">
          <label>URL YouTube</label>
          <div className="input-row">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtu.be/..."
              spellCheck={false}
            />
            <button className="btn" onClick={run} disabled={loading} type="button">
              {loading ? "Analyse en cours…" : "Analyser"}
            </button>
          </div>
          <p className="caption">Coller un lien public YouTube. L’outil explore Piped, Invidious, transcript et OCR.</p>
          {err ? <p className="error">⚠️ {err}</p> : null}
        </section>

        {out && (
          <>
            <section className="card card--hero">
              <div className="hero-grid">
                <div
                  className="hero-thumb"
                  style={{ backgroundImage: out.video?.thumbnail ? `url(${out.video.thumbnail})` : undefined }}
                  aria-hidden="true"
                />
                <div className="hero-body">
                  <span className="eyebrow">Vidéo analysée</span>
                  <h2>{out.video?.title || "Titre indisponible"}</h2>
                  <p className="hero-channel">{out.video?.channel || "Chaîne inconnue"}</p>
                  <div className="hero-tags">
                    <Tag tone="neutral" icon={classIcon}>
                      {className}
                    </Tag>
                    <Tag tone={out.dofusbook_url ? "success" : "muted"} icon="📘">
                      {out.dofusbook_url ? "DofusBook détecté" : "DofusBook manquant"}
                    </Tag>
                  </div>
                  <ElementBadges elements={out.element_build} signals={out.element_signals} />
                  <SourceBadges sources={out.sources} />
                  <ExoBadges exos={out.exos} />
                  {out.dofusbook_url ? (
                    <a className="btn btn-ghost" href={out.dofusbook_url} target="_blank" rel="noreferrer">
                      Ouvrir sur DofusBook ↗
                    </a>
                  ) : null}
                </div>
              </div>
              {out.video?.embed_url ? (
                <details className="player-toggle">
                  <summary>Voir l’extrait YouTube intégré</summary>
                  <div className="player-frame">
                    <iframe
                      width="100%"
                      height="315"
                      src={out.video.embed_url}
                      title="YouTube video"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </details>
              ) : null}
            </section>

            <section className="card card--items">
              <div className="card-heading">
                <h2>🧩 Items détectés</h2>
                <span className="caption">{out.items?.length || 0} résultats distincts</span>
              </div>
              {out.items?.length ? (
                <div className="table-wrap">
                  {grouped.map(([slot, items]) => (
                    <div key={slot} className="slot-block">
                      <div className="slot-heading">{slot}</div>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Nom</th>
                            <th>Confiance</th>
                            <th>Source</th>
                            <th>Preuve</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((it, i) => (
                            <tr key={slot + i}>
                              <td>{it.name}</td>
                              <td>
                                <ConfidenceBar value={it.confidence} />
                              </td>
                              <td>
                                <Tag tone="info" subtle>
                                  {it.source}
                                </Tag>
                              </td>
                              <td className="caption" title={it.proof || ""}>
                                {it.proof ? (it.proof.length > 80 ? `${it.proof.slice(0, 80)}…` : it.proof) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              ) : (
                <p>
                  Aucun item probant pour cette vidéo {out.sources?.captions ? "(captions dispo)" : "(captions indisponibles)"}. Essaie
                  d’enrichir <code>lib/items.json</code> avec plus d’objets méta ou vise un timecode où l’inventaire est affiché pour
                  l’OCR.
                </p>
              )}
            </section>

            <section className="grid">
              <div className="card">
                <h2>🔎 Évidences</h2>
                {out.evidences?.length ? (
                  <ul className="list">
                    {out.evidences.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="caption">Aucune ligne probante trouvée.</p>
                )}
              </div>

              <div className="card">
                <div className="card-heading">
                  <h2>🗒️ Transcript</h2>
                  <div className="card-heading__actions">
                    <span className="caption">
                      {out.transcript?.length_chars ? `${out.transcript.length_chars.toLocaleString()} caractères` : "—"}
                    </span>
                    <CopyButton text={out.transcript?.text || ""} />
                  </div>
                </div>
                {out.transcript?.text ? (
                  <details className="transcript">
                    <summary>Afficher/Masquer le transcript</summary>
                    <pre className="pre transcript__content">{out.transcript.text}</pre>
                  </details>
                ) : (
                  <p className="caption">Transcript indisponible via YouTube/Piped/Invidious/timedtext pour cette vidéo.</p>
                )}
              </div>
            </section>

            <section className="grid">
              <div className="card">
                <h2>🧪 Debug</h2>
                <p className="caption">
                  format: {out.debug?.used_format || "—"} · ocr_frames: {out.debug?.ocr_frames ?? 0} · text_candidates: {out.debug?.text_candidates ?? 0} · ocr_candidates: {out.debug?.ocr_candidates ?? 0}
                </p>
                {out.debug?.warns?.length ? <pre className="pre">{JSON.stringify(out.debug.warns, null, 2)}</pre> : null}
              </div>

              <div className="card">
                <h2>📝 JSON brut</h2>
                <details>
                  <summary>Afficher le payload complet</summary>
                  <pre className="pre">{JSON.stringify(out, null, 2)}</pre>
                </details>
                <div className="caption">Ce JSON est exactement le payload renvoyé par l’API.</div>
              </div>
            </section>
          </>
        )}

        <footer className="caption" style={{ textAlign: "center", margin: "32px 0" }}>
          Front V8 — interface remaniée, badges dynamiques, barre de chargement et signaux d’éléments enrichis.
        </footer>
      </main>
    </>
  );
}
