
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

function Tag({ children, tone = "neutral", icon, subtle, title }) {
  const cls = ["tag", `tag--${tone}`];
  if (subtle) cls.push("tag--subtle");
  const props = {};
  if (title) props.title = title;
  return (
    <span className={cls.join(" ")} {...props}>
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
  const {
    piped,
    piped_host,
    piped_note,
    piped_attempts = 0,
    invidious,
    invidious_host,
    invidious_note,
    invidious_attempts = 0,
    readable,
    readable_status,
    readable_note,
    readable_url,
    transcript_source,
    transcript_lang,
    transcript_has_timing,
    transcript_is_translation,
    speech_status,
    speech_provider,
    speech_model,
  } = sources;
  const speechTone =
    speech_status === "ok"
      ? "success"
      : speech_status === "error"
      ? "warning"
      : speech_status === "not_configured"
      ? "warning"
      : speech_status === "configured"
      ? "info"
      : speech_status === "empty"
      ? "muted"
      : "muted";
  const speechLabel = (() => {
    switch (speech_status) {
      case "ok":
        return `ASR ${speech_provider || "audio"}`;
      case "configured":
        return "ASR prêt";
      case "empty":
        return "ASR sans texte";
      case "error":
        return "ASR erreur";
      case "not_configured":
        return "ASR à configurer";
      default:
        return "ASR inactif";
    }
  })();
  const hostLabel = (value) => {
    if (!value) return null;
    try {
      const u = new URL(value);
      return u.host;
    } catch {
      return value.replace(/^https?:\/\//, "");
    }
  };
  const attemptsLabel = (count) => {
    if (!count || count <= 1) return "";
    return ` (+${count - 1} tentative${count - 1 > 1 ? "s" : ""})`;
  };
  const firstDetail = (note, attemptsCount = 0) => {
    if (!note) return null;
    const [first] = note.split('|');
    if (!first) return null;
    const colon = first.indexOf(':');
    if (colon !== -1) {
      const base = first.slice(colon + 1).trim();
      return base ? `${base}${attemptsLabel(attemptsCount)}` : null;
    }
    const base = first.trim();
    return base ? `${base}${attemptsLabel(attemptsCount)}` : null;
  };
  const readableTone = readable ? "success" : readable_status === "failed" ? "warning" : "muted";
  const pipedTone = piped ? "success" : piped_note ? "warning" : "muted";
  const invidTone = invidious ? "success" : invidious_note ? "warning" : "muted";
  const readableHost = hostLabel(readable_url);
  const pipedHost = hostLabel(piped_host);
  const invidHost = hostLabel(invidious_host);
  return (
    <div className="tagrow tagrow--wrap">
      <Tag tone={readableTone} icon="📰" title={readable_note || undefined}>
        {readable ? "Readable mirror OK" : "Readable indisponible"}
        {readableHost ? (
          <>
            {" "}
            <span className="tag__meta tag__meta--soft">{readableHost}</span>
          </>
        ) : null}
        {!readable && readable_note ? (
          <span className="tag__meta">{firstDetail(readable_note)}</span>
        ) : null}
      </Tag>
      <Tag tone={pipedTone} icon="🚰" title={piped_note || undefined}>
        {piped ? "Piped OK" : "Piped KO"}
        {pipedHost ? (
          <>
            {" "}
            <span className="tag__meta tag__meta--soft">{pipedHost}</span>
          </>
        ) : null}
        {!piped && piped_note ? (
          <span className="tag__meta">{firstDetail(piped_note, piped_attempts)}</span>
        ) : null}
      </Tag>
      <Tag tone={invidTone} icon="🌀" title={invidious_note || undefined}>
        {invidious ? "Invidious OK" : "Invidious KO"}
        {invidHost ? (
          <>
            {" "}
            <span className="tag__meta tag__meta--soft">{invidHost}</span>
          </>
        ) : null}
        {!invidious && invidious_note ? (
          <span className="tag__meta">{firstDetail(invidious_note, invidious_attempts)}</span>
        ) : null}
      </Tag>
      <Tag tone={transcript_source ? "info" : "warning"} icon="💬" title={transcript_source || undefined}>
        {transcript_source
          ? `Captions ${transcript_lang || ""}`.trim()
          : "Captions manquantes"}
      </Tag>
      {transcript_has_timing ? (
        <Tag tone="success" subtle icon="⏱️">
          Horodatage ok
        </Tag>
      ) : null}
      {transcript_is_translation ? (
        <Tag tone="warning" subtle icon="🌍">
          Traduction auto
        </Tag>
      ) : null}
      <Tag tone={speechTone} icon="🎙️">
        {speechLabel}
        {speech_model ? <span className="tag__meta tag__meta--soft">{speech_model}</span> : null}
      </Tag>
    </div>
  );
}

function MomentsList({ moments }) {
  if (!moments?.length) return null;
  return (
    <div className="moments">
      <span className="caption caption--label">Moments où le stuff est présenté</span>
      <ul className="moments__list">
        {moments.map((moment, idx) => (
          <li key={idx} className="moments__item">
            <div className="moments__meta">
              {moment.timestamp ? (
                <Tag tone="info" icon="⏱️">
                  {moment.timestamp}
                </Tag>
              ) : null}
              {moment.source ? (
                <Tag tone="neutral" subtle icon="📄">
                  {moment.source}
                </Tag>
              ) : null}
            </div>
            <p className="moments__text">{moment.text}</p>
          </li>
        ))}
      </ul>
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

function EvidenceList({ evidences }) {
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  const sourceStats = useMemo(() => {
    if (!Array.isArray(evidences)) return [];
    const counts = new Map();
    for (const ev of evidences) {
      const key = ev?.source || "Autre";
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count || a.source.localeCompare(b.source))
      .slice(0, 6);
  }, [evidences]);

  const filtered = useMemo(() => {
    let base = Array.isArray(evidences) ? [...evidences] : [];
    if (sourceFilter !== "all") {
      base = base.filter((ev) => (ev?.source || "Autre") === sourceFilter);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      base = base.filter((ev) => {
        const text = (ev?.text || "").toLowerCase();
        const src = (ev?.source || "").toLowerCase();
        return text.includes(q) || src.includes(q);
      });
    }
    return base;
  }, [evidences, query, sourceFilter]);

  const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const highlight = (text) => {
    if (!query.trim()) return text;
    const safe = escapeRegExp(query.trim());
    if (!safe) return text;
    const parts = text.split(new RegExp(`(${safe})`, "ig"));
    const needle = query.trim().toLowerCase();
    return parts.map((part, idx) =>
      part.toLowerCase() === needle ? (
        <mark key={idx} className="highlight">{part}</mark>
      ) : (
        <span key={idx}>{part}</span>
      )
    );
  };

  return (
    <div className="evidence-panel">
      <div className="evidence-toolbar">
        <div className="evidence-count">
          <span className="caption">Total</span>
          <strong>{evidences?.length || 0}</strong>
        </div>
        <div className="evidence-filters">
          {sourceStats.map((stat) => (
            <button
              key={stat.source}
              type="button"
              className={`chip ${sourceFilter === stat.source ? "chip--active" : ""}`}
              onClick={() => setSourceFilter((prev) => (prev === stat.source ? "all" : stat.source))}
            >
              {stat.source}
              <span className="chip__count">{stat.count}</span>
            </button>
          ))}
          {sourceFilter !== "all" ? (
            <button type="button" className="chip chip--ghost" onClick={() => setSourceFilter("all")}>
              Réinitialiser
            </button>
          ) : null}
        </div>
        <div className="evidence-search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer un mot-clé…"
            spellCheck={false}
          />
          {query ? (
            <button type="button" className="chip chip--ghost" onClick={() => setQuery("")}>
              Effacer
            </button>
          ) : null}
        </div>
      </div>
      <div className="evidence-scroll">
        {filtered.length ? (
          <ul className="evidence-list">
            {filtered.map((e, i) => (
              <li key={`${e.source || "evidence"}-${i}`} className="evidence">
                <div className="evidence__meta">
                  {e.timestamp ? (
                    <Tag tone="info" subtle icon="⏱️">
                      {e.timestamp}
                    </Tag>
                  ) : null}
                  {e.source ? (
                    <Tag tone="neutral" subtle icon="🧾">
                      {e.source}
                    </Tag>
                  ) : null}
                  {typeof e.score === "number" ? (
                    <Tag tone="accent" subtle icon="📈">
                      Indice {e.score.toFixed(1)}
                    </Tag>
                  ) : null}
                </div>
                <p className="evidence__text">{highlight(e.text || "")}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="caption">Aucun indice ne correspond à ce filtre.</p>
        )}
      </div>
    </div>
  );
}

function SpeechInsights({ speech }) {
  if (!speech) {
    return <p className="caption">Analyse audio indisponible.</p>;
  }

  const status = speech.status || "missing";
  const providerLabel = speech.provider_label || (speech.provider ? `ASR ${speech.provider}` : "Analyse audio");
  const statusTone =
    status === "ok"
      ? "success"
      : status === "error"
      ? "warning"
      : status === "not_configured"
      ? "warning"
      : "muted";
  const statusText =
    {
      ok: "Analyse audio activée",
      empty: "Aucun segment exploitable",
      error: "Erreur de transcription",
      not_configured: "ASR non configuré",
      configured: "ASR prêt",
    }[status] || status;

  const providerTone =
    status === "ok"
      ? "success"
      : status === "error"
      ? "warning"
      : status === "not_configured"
      ? "warning"
      : "muted";

  const ratio = typeof speech.coverage_ratio === "number" ? Math.round(Math.max(0, Math.min(1, speech.coverage_ratio)) * 100) : null;
  const rawConfidence = typeof speech.avg_confidence === "number" ? Math.max(0, Math.min(1, speech.avg_confidence)) : null;
  const avgConfidence = rawConfidence != null ? Math.round(rawConfidence * 100) : null;
  const segments = speech.segment_count ?? (speech.cues?.length ?? 0);
  const keywords = Array.isArray(speech.keywords) ? speech.keywords : [];
  const highlights = Array.isArray(speech.highlights) ? speech.highlights.slice(0, 6) : [];
  const notes = Array.isArray(speech.notes) ? speech.notes : [];
  const moments = Array.isArray(speech.moments) ? speech.moments.slice(0, 4) : [];

  const formatDuration = (seconds) => {
    if (typeof seconds !== "number" || Number.isNaN(seconds)) return null;
    const total = Math.round(seconds);
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    if (minutes > 0) {
      return `${minutes}m${secs.toString().padStart(2, "0")}s`;
    }
    return `${secs}s`;
  };

  const durationLabel = formatDuration(speech.duration_seconds);

  return (
    <div className="speech-panel">
      <div className="speech-header">
        <div className="speech-badges">
          <Tag tone={providerTone} icon="🎙️">
            {providerLabel}
            {speech.model ? <span className="tag__meta tag__meta--soft">{speech.model}</span> : null}
          </Tag>
          <Tag tone={statusTone} subtle icon={status === "ok" ? "✅" : "⚠️"}>
            {statusText}
          </Tag>
        </div>
        {status === "ok" ? (
          <div className="speech-metrics">
            <div className="metric">
              <span className="metric__label">Segments</span>
              <strong>{segments}</strong>
            </div>
            <div className="metric">
              <span className="metric__label">Couverture</span>
              <strong>{ratio != null ? `${ratio}%` : "—"}</strong>
            </div>
            <div className="metric">
              <span className="metric__label">Confiance</span>
              <strong>{avgConfidence != null ? `${avgConfidence}%` : "—"}</strong>
            </div>
            <div className="metric">
              <span className="metric__label">Durée</span>
              <strong>{durationLabel || "—"}</strong>
            </div>
          </div>
        ) : null}
      </div>

      {status === "ok" ? (
        <>
          <div className="speech-keywords">
            <span className="caption caption--label">Mots-clés audio</span>
            {keywords.length ? (
              <div className="tagrow tagrow--wrap" style={{ marginTop: 8 }}>
                {keywords.map((kw) => (
                  <Tag key={kw.term} tone="accent" subtle icon="🔑">
                    {kw.term}
                    <span className="tag__meta">×{kw.count}</span>
                  </Tag>
                ))}
              </div>
            ) : (
              <p className="caption">Aucun mot-clé distinct n’a été détecté.</p>
            )}
          </div>

          {highlights.length ? (
            <div className="speech-highlights">
              <span className="caption caption--label">Phrases probantes (audio)</span>
              <ul>
                {highlights.map((h, idx) => (
                  <li key={`${h.source || "highlight"}-${idx}`} className="speech-highlight">
                    <div className="speech-highlight__meta">
                      {h.timestamp ? (
                        <Tag tone="info" subtle icon="⏱️">
                          {h.timestamp}
                        </Tag>
                      ) : null}
                      {h.source ? (
                        <Tag tone="neutral" subtle icon="🧾">
                          {h.source}
                        </Tag>
                      ) : null}
                      {typeof h.score === "number" ? (
                        <Tag tone="accent" subtle icon="📈">
                          {h.score.toFixed(1)}
                        </Tag>
                      ) : null}
                    </div>
                    <p>{h.text}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {moments.length ? (
            <div className="speech-moments">
              <span className="caption caption--label">Timecodes audio</span>
              <div className="speech-moments__row">
                {moments.map((m, idx) => (
                  <div key={`${m.timestamp || idx}`} className="speech-moment">
                    <Tag tone="info" subtle icon="🎯">
                      {m.timestamp || "—"}
                    </Tag>
                    <p>{m.text}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {notes.length ? (
            <ul className="speech-notes">
              {notes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          ) : null}

          {speech.text ? (
            <details className="speech-raw">
              <summary>Transcript audio détaillé</summary>
              <div className="speech-raw__actions">
                <CopyButton text={speech.text} label="Copier l'audio" />
              </div>
              <pre className="pre speech__text">{speech.text}</pre>
            </details>
          ) : null}
        </>
      ) : (
        <div className="speech-empty">
          <p className="caption">{statusText}.</p>
          {notes.length ? (
            <ul className="speech-notes">
              {notes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          ) : null}
          {status === "not_configured" ? (
            <details className="speech-help">
              <summary>Configurer l'analyse audio</summary>
              <p className="caption">Pour activer l'ASR&nbsp;:</p>
              <ol className="speech-help__list">
                <li>
                  <strong>Crée un fichier <code>.env.local</code></strong> à la racine du projet (ou utilise les variables d'environnement de ton hébergeur).
                </li>
                <li>
                  <strong>Choisis un fournisseur</strong> et renseigne l'une des configurations ci-dessous.
                </li>
                <li>
                  <strong>Redémarre ton <code>npm run dev</code></strong> pour appliquer les changements.
                </li>
              </ol>
              <p className="caption">Exemples de configuration&nbsp;:</p>
              <pre className="pre speech__text">
                {`# Whisper officiel OpenAI
OPENAI_API_KEY=votre_cle

# Whisper Groq (rapide)
GROQ_API_KEY=votre_cle
ASR_MODEL=whisper-large-v3

# Endpoint personnalisé (Whisper.cpp, OpenAI compatible, etc.)
ASR_ENDPOINT=https://votre-service.example/transcribe
ASR_API_KEY=votre_cle
ASR_MODEL=whisper-small
ASR_LABEL=Mon ASR`}
              </pre>
              <p className="speech-help__hint">
                Tu peux aussi préciser <code>ASR_PROVIDER</code> pour le nom technique et <code>ASR_EXTRA_HEADERS</code> (JSON) si ton service exige des en-têtes supplémentaires.
              </p>
            </details>
          ) : null}
        </div>
      )}
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
                    <Tag
                      tone={out.speech?.status === "ok" ? "success" : out.speech?.status === "error" ? "warning" : "muted"}
                      icon="🎧"
                    >
                      {out.speech?.status === "ok" ? "Audio analysé" : "Audio inactif"}
                    </Tag>
                  </div>
                  <ElementBadges elements={out.element_build} signals={out.element_signals} />
                  <SourceBadges sources={out.sources} />
                  <MomentsList moments={out.presentation_moments} />
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
                  Aucun item probant pour cette vidéo {out.sources?.transcript_source ? "(captions dispo)" : "(captions indisponibles)"}. Essaie
                  d’enrichir <code>lib/items.json</code> avec plus d’objets méta ou vise un timecode où l’inventaire est affiché pour
                  l’OCR.
                </p>
              )}
            </section>

            <section className="grid">
              <div className="card card--evidence">
                <h2>🔎 Indices textuels</h2>
                <EvidenceList evidences={out.evidences} />
              </div>

              <div className="card card--speech">
                <h2>🎧 Analyse audio</h2>
                <SpeechInsights speech={out.speech} />
              </div>
            </section>

            <section className="grid">
              <div className="card">
                <div className="card-heading">
                  <h2>🗒️ Transcript</h2>
                  <div className="card-heading__actions">
                    <span className="caption">
                      {out.transcript?.length_chars ? `${out.transcript.length_chars.toLocaleString()} caractères` : "—"}
                    </span>
                    {out.transcript?.lang ? (
                      <Tag tone="info" subtle icon="🌐">
                        {out.transcript.lang}
                      </Tag>
                    ) : null}
                    {out.transcript?.has_timing ? (
                      <Tag tone="success" subtle icon="⏱️">
                        Horodatage
                      </Tag>
                    ) : null}
                    {out.transcript?.is_translation ? (
                      <Tag tone="warning" subtle icon="🌍">
                        Traduction
                      </Tag>
                    ) : null}
                    {out.transcript?.is_asr ? (
                      <Tag tone="warning" subtle icon="🗣️">
                        Reconnaissance vocale
                      </Tag>
                    ) : null}
                    <CopyButton text={out.transcript?.text || ""} />
                  </div>
                </div>
                {out.transcript?.source ? (
                  <p className="caption transcript-meta">
                    Source&nbsp;: {out.transcript.source} · {out.transcript?.cues_count || 0} segments
                  </p>
                ) : null}
                {out.transcript?.text ? (
                  <details className="transcript">
                    <summary>Afficher/Masquer le transcript</summary>
                    <pre className="pre transcript__content">{out.transcript.text}</pre>
                  </details>
                ) : (
                  <p className="caption">Transcript indisponible via YouTube/Piped/Invidious/timedtext pour cette vidéo.</p>
                )}
              </div>

              <div className="card">
                <h2>🧪 Debug</h2>
                <p className="caption">
                  format: {out.debug?.used_format || "—"} · ocr_frames: {out.debug?.ocr_frames ?? 0} · text_candidates: {out.debug?.text_candidates ?? 0} · ocr_candidates: {out.debug?.ocr_candidates ?? 0}
                </p>
                {out.debug?.warns?.length ? <pre className="pre">{JSON.stringify(out.debug.warns, null, 2)}</pre> : null}
              </div>
            </section>

            <section className="grid">
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
