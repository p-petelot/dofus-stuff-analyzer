import { useState } from "react";
import Head from "next/head";
import "../public/styles.css";

export default function Home() {
  const [url, setUrl] = useState("https://youtu.be/eYhkAQ8qOiA");
  const [loading, setLoading] = useState(false);
  const [out, setOut] = useState(null);
  const [err, setErr] = useState("");

  const run = async () => {
    setLoading(true); setErr(""); setOut(null);
    try {
      const res = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Unknown error");
      setOut(json);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Dofus Stuff Analyzer</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <main className="container">
        <header>
          <h1>🧙 Dofus Stuff Analyzer</h1>
          <p>Colle une URL YouTube de Dofus — extraction frames, OCR, items normalisés.</p>
        </header>

        <section className="card">
          <label>URL YouTube</label>
          <input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://youtu.be/..." />
          <button onClick={run} disabled={loading}>{loading ? "Analyse en cours…" : "Analyser"}</button>
          {err && <p className="error">⚠️ {err}</p>}
        </section>

        {out && (
          <>
            <section className="card">
              <h2>📹 Vidéo</h2>
              <p><b>Titre :</b> {out.video?.title || "—"}</p>
              <p><b>Chaîne :</b> {out.video?.channel || "—"}</p>
              <p><b>Classe :</b> {out.class || "—"} | <b>Éléments :</b> {(out.element_build||[]).join(" • ") || "—"}</p>
              <p><b>DofusBook :</b> {out.dofusbook_url ? <a href={out.dofusbook_url} target="_blank" rel="noreferrer">{out.dofusbook_url}</a> : "Non détecté"}</p>
            </section>

            <section className="card">
              <h2>🧩 Items détectés</h2>
              {out.items?.length ? (
                <table>
                  <thead><tr><th>Slot</th><th>Nom</th><th>Confiance</th><th>Texte OCR</th></tr></thead>
                  <tbody>
                    {out.items.map((it, i) => (
                      <tr key={i}>
                        <td>{it.slot}</td>
                        <td>{it.name}</td>
                        <td>{Math.round(it.confidence * 100)}%</td>
                        <td className="muted">{it.raw}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p>Aucun item fiable détecté.</p>}
            </section>

            <section className="card">
              <h2>🔍 Debug OCR</h2>
              <p>Frames OCR traitées : {out.debug?.ocr_frames ?? 0}</p>
              <pre>{JSON.stringify(out.debug?.sample_ocr, null, 2)}</pre>
            </section>

            <section className="card">
              <h2>📝 JSON brut</h2>
              <pre>{JSON.stringify(out, null, 2)}</pre>
            </section>
          </>
        )}

        <footer>
          <small>v3 — ffmpeg + tesseract OCR • Pense à enrichir <code>lib/items.json</code> pour de meilleurs matches.</small>
        </footer>
      </main>
    </>
  );
}