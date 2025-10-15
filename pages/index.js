
import { useEffect, useMemo, useState } from "react";
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

const EQUIPMENT_LAYOUT = [
  { id: "head", label: "Coiffe", slots: ["Coiffe"] },
  { id: "amulet", label: "Amulette", slots: ["Amulette"] },
  { id: "ring-left", label: "Anneau gauche", slots: ["Anneau 1", "Anneau"] },
  { id: "ring-right", label: "Anneau droite", slots: ["Anneau 2"] },
  { id: "cape", label: "Cape", slots: ["Cape"] },
  { id: "shield", label: "Bouclier", slots: ["Bouclier"] },
  { id: "weapon", label: "Arme", slots: ["Arme"] },
  { id: "belt", label: "Ceinture", slots: ["Ceinture"] },
  { id: "boots", label: "Bottes", slots: ["Bottes"] },
  { id: "pet", label: "Familier", slots: ["Familier"] },
  { id: "mount", label: "Monture", slots: ["Monture"] },
  { id: "dofus", label: "Dofus & trophées", slots: ["Dofus", "Dofus/Trophées", "Trophée"] },
  { id: "extras", label: "Autres", slots: ["Autre"] },
];

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

function SourceBadges({ sources }) {
  if (!sources) return null;
  const {
    piped,
    piped_host,
    piped_note,
    piped_status,
    piped_hint,
    piped_attempts,
    readable,
    readable_status,
    readable_note,
    invidious,
    invidious_host,
    invidious_note,
    invidious_status,
    invidious_hint,
    invidious_attempts,
    transcript_source,
    transcript_lang,
    transcript_has_timing,
    transcript_is_translation,
  } = sources;

  const compact = (value) => {
    if (!value) return null;
    const [first] = value.split('|');
    if (!first) return null;
    const parts = first.split(':');
    const base = parts.length > 1 ? parts.slice(1).join(':').trim() : first.trim();
    return base || null;
  };

  const withAttempts = (detail, attempts) => {
    const parts = [];
    if (detail) parts.push(detail);
    if (attempts > 0) {
      parts.push(`${attempts} tentative${attempts > 1 ? 's' : ''}`);
    }
    return parts.length ? parts.join(' • ') : null;
  };

  const hostLabel = (host) => (host ? host.replace(/^https?:\/\//, '') : null);

  const badges = [
    {
      key: 'readable',
      icon: '📰',
      label: 'Page lisible',
      ok: !!readable,
      warning: readable_status === 'failed',
      tone: readable ? 'ok' : readable_status === 'failed' ? 'warn' : 'idle',
      message: readable ? 'Disponible' : 'Indisponible',
      detail: compact(readable_note),
    },
    {
      key: 'piped',
      icon: '🚰',
      label: 'Flux Piped',
      ok: piped_status === 'ok' || !!piped,
      warning: piped_status !== 'ok' && piped_status !== 'disabled',
      tone:
        piped_status === 'disabled'
          ? 'idle'
          : piped_status === 'ok' || piped
          ? 'ok'
          : 'warn',
      message:
        piped_status === 'disabled'
          ? 'Désactivé'
          : piped_status === 'ok' || piped
          ? 'Opérationnel'
          : 'Hors service',
      detail:
        piped_status === 'ok' && hostLabel(piped_host)
          ? hostLabel(piped_host)
          : withAttempts(piped_hint || compact(piped_note), piped_attempts || 0),
    },
    {
      key: 'invidious',
      icon: '🌀',
      label: 'Flux Invidious',
      ok: invidious_status === 'ok' || !!invidious,
      warning: invidious_status !== 'ok' && invidious_status !== 'disabled',
      tone:
        invidious_status === 'disabled'
          ? 'idle'
          : invidious_status === 'ok' || invidious
          ? 'ok'
          : 'warn',
      message:
        invidious_status === 'disabled'
          ? 'Désactivé'
          : invidious_status === 'ok' || invidious
          ? 'Opérationnel'
          : 'Hors service',
      detail:
        invidious_status === 'ok' && hostLabel(invidious_host)
          ? hostLabel(invidious_host)
          : withAttempts(invidious_hint || compact(invidious_note), invidious_attempts || 0),
    },
    {
      key: 'captions',
      icon: '💬',
      label: 'Sous-titres',
      ok: !!transcript_source,
      warning: !transcript_source,
      tone: transcript_source ? 'ok' : 'warn',
      message: transcript_source ? (transcript_lang ? transcript_lang : 'Présents') : 'Absents',
      detail: transcript_is_translation
        ? 'Traduction automatique'
        : transcript_has_timing
        ? 'Horodatage détecté'
        : null,
    },
  ];

  return (
    <div className="status-grid">
      {badges.map((badge) => {
        const tone = badge.tone || (badge.ok ? 'ok' : badge.warning ? 'warn' : 'idle');
        return (
          <div key={badge.key} className={`status-card status-card--${tone}`}>
            <span className="status-card__icon" aria-hidden="true">
              {badge.icon}
            </span>
            <div className="status-card__body">
              <span className="status-card__label">{badge.label}</span>
              <span className="status-card__value">{badge.message}</span>
              {badge.detail ? <span className="status-card__note">{badge.detail}</span> : null}
            </div>
          </div>
        );
      })}
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
        return (
          <Tag key={el} tone={info.tone} icon={info.icon}>
            {el}
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
  const [activeStuffIndex, setActiveStuffIndex] = useState(0);

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
      setActiveStuffIndex(0);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const stuffs = useMemo(() => {
    if (out?.stuffs?.length) return out.stuffs;
    if (out?.items?.length) {
      return [
        {
          id: "legacy",
          label: "Synthèse générale",
          origin: "aggregate",
          source: "Transcript + OCR",
          items: out.items,
          item_count: out.items.length,
        },
      ];
    }
    return [];
  }, [out]);

  useEffect(() => {
    if (activeStuffIndex >= stuffs.length) {
      setActiveStuffIndex(0);
    }
  }, [activeStuffIndex, stuffs.length]);

  const activeStuff = stuffs[activeStuffIndex] || null;

  const grouped = useMemo(() => groupBySlot(activeStuff?.items || []), [activeStuff]);
  const className = out?.class || "Classe inconnue";
  const classIcon = CLASS_ICON[out?.class] || "🧙";
  const dofusbookCount = out?.dofusbook_urls?.length || 0;
  const hasDofusbook = dofusbookCount > 0;
  const activeItemCount = activeStuff?.item_count ?? activeStuff?.items?.length ?? 0;
  const variantCount = stuffs.length;
  const debugWarns = Array.isArray(out?.debug?.warns) ? out.debug.warns : [];

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
                    <Tag tone={hasDofusbook ? "success" : "muted"} icon="📘">
                      {hasDofusbook ? `DofusBook ×${dofusbookCount}` : "DofusBook manquant"}
                    </Tag>
                  </div>
                  <ElementBadges elements={out.element_build} signals={out.element_signals} />
                  <SourceBadges sources={out.sources} />
                  <MomentsList moments={out.presentation_moments} />
                  <ExoBadges exos={out.exos} />
                  {hasDofusbook ? (
                    <div className="dofusbook-links">
                      {out.dofusbook_urls.map((link, idx) => (
                        <a key={link + idx} className="btn btn-ghost" href={link} target="_blank" rel="noreferrer">
                          {dofusbookCount > 1 ? `DofusBook #${idx + 1}` : "Ouvrir sur DofusBook"} ↗
                        </a>
                      ))}
                    </div>
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
                <h2>🧩 Stuff détecté</h2>
                <span className="caption">
                  {activeItemCount} pièce{activeItemCount === 1 ? "" : "s"} détectée{activeItemCount === 1 ? "" : "s"}
                  {variantCount > 1 ? ` • ${variantCount} variantes` : ""}
                </span>
              </div>
              {activeItemCount ? (
                <>
                  {variantCount > 1 ? (
                    <StuffSwitcher
                      stuffs={stuffs}
                      activeIndex={activeStuffIndex}
                      onSelect={setActiveStuffIndex}
                    />
                  ) : null}
                  <EquipmentBoard
                    items={activeStuff?.items || []}
                    preview={{ thumbnail: out.video?.thumbnail, icon: classIcon, label: activeStuff?.label || className }}
                  />
                  {activeStuff?.context_excerpt ? (
                    <blockquote className="stuff-context">
                      {activeStuff.context_excerpt}
                    </blockquote>
                  ) : null}
                  <details className="items-details">
                    <summary>Voir la liste détaillée</summary>
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
                  </details>
                </>
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
                {debugWarns.length ? (
                  <ul className="warn-list">
                    {debugWarns.map((warn, idx) => (
                      <li key={`${warn}-${idx}`} className="warn-list__item">
                        <span className="warn-list__icon" aria-hidden="true">⚠️</span>
                        <span>{warn}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="caption">Aucun avertissement de traitement.</p>
                )}
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
          Front V9 — flux secondaires réparés, thème Dofus modernisé et interface plus claire.
        </footer>
      </main>
    </>
  );
}
