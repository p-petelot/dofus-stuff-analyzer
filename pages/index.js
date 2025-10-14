import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("https://youtu.be/eYhkAQ8qOiA");
  const [out, setOut] = useState("");

  const run = async () => {
    setOut("Loading…");
    const res = await fetch(`/api/analyze?url=${encodeURIComponent(url)}`);
    const json = await res.json();
    setOut(JSON.stringify(json, null, 2));
  };

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontWeight: 700 }}>Dofus Stuff Analyzer — Test</h1>
      <div style={{ marginTop: 12 }}>
        <input
          style={{ padding: 8, width: 500, maxWidth: "100%" }}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Colle l'URL YouTube ici"
        />
      </div>
      <button style={{ marginTop: 12, padding: "8px 14px" }} onClick={run}>
        Analyser
      </button>
      <pre style={{ marginTop: 16, background: "#f5f5f5", padding: 12, overflow: "auto" }}>
        {out}
      </pre>
    </main>
  );
}
