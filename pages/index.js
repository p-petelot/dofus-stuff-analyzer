import { useState, useMemo } from "react";
import Head from "next/head";

function groupBySlot(items = []) {
  const m = new Map();
  for (const it of items) {
    const slot = it.slot || "Autre";
    if (!m.has(slot)) m.set(slot, []);
    m.get(slot).push(it);
  }
  // tri slots visuels
  const order = ["Amulette","Coiffe","Cape","Ceinture","Bottes","Anneau 1","Anneau 2","Anneau","Bouclier","Arme","Monture","Familier","Dofus","Trophée","Dofus/Trophées","Autre"];
  return Array.from(m.entries()).sort((a,b) => order.indexOf(a[0]) - order.indexOf(b[0]));
}

function Badge({ children, muted }) {
  return <span className="badge" style={muted ? { opacity: 0.7 } : null}>{children}</span>;
}

function SourceBadges({ sources }) {
  if (!sources) return null;
  const { piped, invidious, readable, transcript_source, transcript_lang } = sources;
  return (
    <div className="tagrow">
      <Badge muted={!readable}>{readable ? "Readable OK" : "Readable—"}</Badge>
      <Badge muted={!piped}>{piped ? "Piped OK" : "Piped—"}</Badge>
      <Badge muted={!invidious}>{invidious ? "Invidious OK" : "Invidious—"}</Badge>
      <Badge muted={!transcript_source}>
        {transcript_source ? `Captions: ${transcript_source}${transcript_lang ? ` (${transcript_lang})` : ""}` : "Captions—"}
      </Badge>
    </div>
  );
}

function CopyButton({ text, label = "Copier" }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text || "");
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {}
      }}
      style={{ marginLeft: 8 }}
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
      const ct = res.headers.get("content-type") || "";
      const body = await res.text();
      let json;
      try {
        // on tente JSON, même si le content-type est incorrect
        json = JSON.parse(body);
      } catch {
        // c'est probablement une page HTML d'erreur
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

  return (
    <>
      <Head>
        <title>Dofus Stuff Analyzer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main className="container">
        <header>
          <h1>🧙 Dofus Stuff Analyzer</h1>
          <p>Analyse une vidéo YouTube Dofus → transcript/description, OCR (si possible), items, éléments & preuves.</p>
        </header>

        <section className="card">
          <label>URL YouTube</label>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtu.be/..."
            spellCheck={false}
          />
          <div className="controls">
            <button onClick={run} disabled={loading}>
              {loading ? "Analyse en cours…" : "Analyser"}
            </button>
          </div>
          {err && <p className="error">⚠️ {err}</p>}
        </section>

        {out && (
          <>
            <section className="grid">
              <div className="card">
                <h2>📹 Vidéo</h2>
                {out.video?.thumbnail && (
                  <img className="thumb" src={out.video.thumbnail} alt="thumbnail" />
                )}
                <p style={{ marginTop: 10 }}>
                  <b>Titre :</b> {out.video?.title || "—"}
                </p>
                <p>
                  <b>Chaîne :</b> {out.video?.channel || "—"}
                </p>

                <SourceBadges sources={out.sources} />

                <div className="tagrow" style={{ marginTop: 8 }}>
                  <Badge>{out.class || "Classe inconnue"}</Badge>
                  <Badge>
                    {out.element_build?.length
                      ? out.element_build.join(" • ")
                      : "Éléments inconnus"}
                  </Badge>
                  <Badge>{out.dofusbook_url ? "DofusBook trouvé" : "DofusBook non détecté"}</Badge>
                </div>

                {out.video?.embed_url && (
                  <div style={{ marginTop: 12 }}>
                    <iframe
                      width="100%"
                      height="315"
                      src={out.video.embed_url}
                      title="YouTube video"
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                    <p className="caption">Aperçu intégré</p>
                  </div>
                )}

                {out.dofusbook_url && (
                  <p style={{ marginTop: 8 }}>
                    <b>DofusBook :</b>{" "}
                    <a href={out.dofusbook_url} target="_blank" rel="noreferrer">
                      {out.dofusbook_url}
                    </a>
                  </p>
                )}
              </div>

              <div className="card">
                <h2>🧩 Items détectés</h2>
                {out.items?.length ? (
                  <div>
                    {grouped.map(([slot, items]) => (
                      <div key={slot} style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, marginBottom: 6 }}>{slot}</div>
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
                                <td>{Math.round((it.confidence || 0) * 100)}%</td>
                                <td className="caption">{it.source}</td>
                                <td title={it.proof || ""} className="caption">
                                  {it.proof ? (it.proof.length > 65 ? it.proof.slice(0, 65) + "…" : it.proof) : "—"}
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
                    Aucun item probant pour cette vidéo {out.sources?.captions ? "(captions dispo)" : "(captions indisponibles)"}.
                    Essaie d’enrichir <code>lib/items.json</code> avec plus d’objets méta ou vise un timecode où l’inventaire est affiché pour l’OCR.
                  </p>
                )}
              </div>
            </section>

            <section className="card">
              <h2>🔎 Évidences (texte & description)</h2>
              {out.evidences?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {out.evidences.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              ) : (
                <p>Aucune ligne probante trouvée.</p>
              )}
            </section>

            <section className="card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>🗒️ Transcript</h2>
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span className="caption">
                    {out.transcript?.length_chars
                      ? `${out.transcript.length_chars.toLocaleString()} caractères`
                      : "—"}
                  </span>
                  <CopyButton text={out.transcript?.text || ""} />
                </div>
              </div>
              {out.transcript?.text ? (
                <details style={{ marginTop: 8 }}>
                  <summary>Afficher/Masquer le transcript</summary>
                  <pre className="pre" style={{ marginTop: 8, maxHeight: 420, overflow: "auto", whiteSpace: "pre-wrap" }}>
                    {out.transcript.text}
                  </pre>
                </details>
              ) : (
                <p className="caption">
                  Transcript indisponible via YouTube/Piped/Invidious/timedtext pour cette vidéo.
                </p>
              )}
            </section>

            <section className="card">
              <h2>🧪 Debug</h2>
              <p className="caption">
                used_format: {out.debug?.used_format || "—"} · ocr_frames: {out.debug?.ocr_frames ?? 0} ·
                text_candidates: {out.debug?.text_candidates ?? 0} · ocr_candidates: {out.debug?.ocr_candidates ?? 0}
              </p>
              {out.debug?.warns?.length ? (
                <pre className="pre">{JSON.stringify(out.debug.warns, null, 2)}</pre>
              ) : null}
            </section>

            <section className="card">
              <h2>📝 JSON brut</h2>
              <pre className="pre">{JSON.stringify(out, null, 2)}</pre>
              <div className="caption">Ce JSON est exactement le payload renvoyé par l’API.</div>
            </section>
          </>
        )}

        <footer className="caption" style={{ textAlign: "center", margin: "24px 0" }}>
          Front V7 — transcript affichable/copier, items groupés, preuves, badges de sources, gestion d’erreurs robuste.
        </footer>
      </main>
    </>
  );
}