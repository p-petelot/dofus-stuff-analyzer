import ytdl from "ytdl-core";
import { findDofusbookLinks, extractCandidates, guessClassAndElements, normalizeTextPool } from "../../lib/parse";

// Force Node runtime (pas Edge)
export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing ?url=" });

  try {
    // 1) ID + métadonnées
    const videoId = ytdl.getURLVideoID(url);
    const info = await ytdl.getInfo(videoId).catch(() => null);

    // Fallback oEmbed si ytdl-core échoue (age-gate/consent)
    let title = null, channel = null, description = "";
    if (info?.videoDetails) {
      title = info.videoDetails.title || null;
      channel = info.videoDetails.author?.name || null;
      description = info.videoDetails.description || "";
    } else {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      ).then(r => r.ok ? r.json() : null).catch(() => null);
      title = oembed?.title || null;
      channel = oembed?.author_name || null;
      description = ""; // pas dispo via oEmbed
    }

    // 2) Transcript (best effort) — lib ESM: import dynamique
    let transcriptText = "";
    try {
      const { YoutubeTranscript } = await import("youtube-transcript");
      const cues = await YoutubeTranscript.fetchTranscript(videoId, { lang: "fr" });
      transcriptText = (cues || []).map(c => c.text).join("\n");
    } catch {
      // silencieux si indisponible
    }

    // 3) DofusBook
    const dofusbookLinks = findDofusbookLinks(`${title || ""}\n${description || ""}`);

    // 4) Classe/éléments
    const { klass, elements } = guessClassAndElements(title, description);

    // 5) Candidats items (texte)
    const textPool = normalizeTextPool(title, description, transcriptText);
    const itemCandidates = extractCandidates(textPool);

    // 6) Réponse
    return res.status(200).json({
      video: { url, title, channel },
      dofusbook_url: dofusbookLinks[0] || null,
      class: klass || null,
      element_build: elements,
      level: null,
      items_candidates: itemCandidates,
      exos_candidates: [],
      transcript_excerpt: transcriptText ? transcriptText.slice(0, 3000) : null
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to analyze." });
  }
}
