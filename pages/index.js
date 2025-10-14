import { useState } from "react";
import Head from "next/head";

export default function Home(){
  const [url,setUrl] = useState("https://youtu.be/eYhkAQ8qOiA");
  const [loading,setLoading] = useState(false);
  const [out,setOut] = useState(null);
  const [err,setErr] = useState("");

  async function run(){
    setLoading(true); setErr(""); setOut(null);
  try {
    const res = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`, {
      headers: { "Accept": "application/json" }
    });

    const ct = res.headers.get("content-type") || "";
    const body = await res.text(); // on lit en texte d'abord
    let json;
    try {
      // si c'est bien du JSON → parse
      if (ct.includes("application/json")) json = JSON.parse(body);
      else json = JSON.parse(body); // certains proxies oublient le content-type
    } catch {
      // c'est de l'HTML → on propage une erreur utile
      throw new Error(`API returned non-JSON (${res.status}). First bytes: ${body.slice(0,150)}`);
    }

    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    setOut(json);
  } catch (e) {
    setErr(String(e.message || e));
  } finally {
    setLoading(false);
  }
  }

  return (
    <>
      <Head>
        <title>Dofus Stuff Analyzer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
      </Head>
      <main className="container">
        <header>
          <h1>🧙 Dofus Stuff Analyzer</h1>
          <p>Colle une vidéo YouTube Dofus → transcript/description, OCR (si possible), items & résumé.</p>
        </header>

        <section className="card">
          <label>URL YouTube</label>
          <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://youtu.be/..." />
          <div className="controls">
            <button onClick={run} disabled={loading}>{loading?"Analyse en cours…":"Analyser"}</button>
          </div>
          {err && <p className="error">⚠️ {err}</p>}
        </section>

        {out && (
          <>
            <section className="grid">
              <div className="card">
                <h2>📹 Vidéo</h2>
                {out.video?.thumbnail && (<img className="thumb" src={out.video.thumbnail} alt="thumbnail" />)}
                <p style={{marginTop:10}}><b>Titre :</b> {out.video?.title || "—"}</p>
                <p><b>Chaîne :</b> {out.video?.channel || "—"}</p>
                <div className="tagrow">
                  <span className="badge">{out.class || "Classe inconnue"}</span>
                  <span className="badge">{(out.element_build||[]).length? (out.element_build||[]).join(" • ") : "Éléments inconnus"}</span>
                  <span className="badge">{out.dofusbook_url ? "DofusBook trouvé" : "DofusBook non détecté"}</span>
                </div>
                {out.video?.embed_url && (
                  <div style={{marginTop:12}}>
                    <iframe width="100%" height="315" src={out.video.embed_url} title="YouTube video"
                      frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen />
                    <p className="caption">Aperçu intégré</p>
                  </div>
                )}
              </div>

              <div className="card">
                <h2>🧩 Items détectés / proposés</h2>
                {out.items?.length ? (
                  <table className="table">
                    <thead><tr><th>Slot</th><th>Nom</th><th>Confiance</th><th>Source</th></tr></thead>
                    <tbody>
                      {out.items.map((it,i)=>(
                        <tr key={i}>
                          <td>{it.slot}</td>
                          <td>{it.name}</td>
                          <td>{Math.round((it.confidence||0)*100)}%</td>
                          <td className="caption">{it.source}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p>Aucun item détecté. (Essaie d’étendre <code>lib/items.json</code> ou de cibler l’instant du stuff.)</p>}
              </div>
            </section>

            <section className="card">
              <h2>🧠 Explication du build</h2>
              <p>{out.explanation || "—"}</p>
            </section>

            <section className="card">
              <h2>🔎 Évidences (transcript/description)</h2>
              {out.evidences?.length ? (
                <ul style={{margin:0,paddingLeft:18}}>
                  {out.evidences.map((e,i)=>(<li key={i}>{e}</li>))}
                </ul>
              ) : <p>Aucune ligne probante trouvée.</p>}
            </section>

            <section className="card">
              <h2>🧪 Debug</h2>
              <p className="caption">used_format: {out.debug?.used_format || "—"} · ocr_frames: {out.debug?.ocr_frames ?? 0} · text_candidates: {out.debug?.text_candidates_count ?? 0}</p>
              {out.debug?.warns?.length ? <pre className="pre">{JSON.stringify(out.debug.warns, null, 2)}</pre> : null}
            </section>

            <section className="card">
              <h2>📝 JSON brut</h2>
              <pre className="pre">{JSON.stringify(out, null, 2)}</pre>
            </section>
          </>
        )}

        <footer className="caption" style={{textAlign:"center",margin:"24px 0"}}>
          v5 — OCR si possible, sinon texte+meta fallback (Cra Terre/Eau expi/pupu) • Thumbnail & embed • Explication incluse.
        </footer>
      </main>
    </>
  );
}