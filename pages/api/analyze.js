import ytdl from "ytdl-core";
import { findDofusbookLinks, extractCandidates, guessClassAndElements, normalizeTextPool } from "../../lib/parse";

// Force Node runtime (ytdl-core ne tourne pas en Edge)
export const config = { runtime: "nodejs" };

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}
async function fetchTEXT(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) return "";
  return res.text().catch(() => "");
}

async function getBasicMeta(url, videoId) {
  // 1) ytdl-core
  try {
    const info = await ytdl.getInfo(videoId);
    return {
      title: info.videoDetails.title || null,
      channel: info.videoDetails.author?.name || null,
      description: info.videoDetails.description || ""
    };
  } catch (_) {}

  // 2) oEmbed (titre + auteur)
  let title = null, channel = null, description = "";
  try {
    const oembed = await fetchJSON(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    title = oembed?.title || null;
    channel = oembed?.author_name || null;
  } catch (_) {}

  return { title, channel, description };
}

async function getWatchText(videoId) {
  // r.jina.ai retourne une version "lisible" de la page → on peut y retrouver la description
  // (utile quand ytdl ne renvoie pas la description)
  try {
    const txt = await fetchTEXT(`https://r.jina.ai/http://www.youtube.com/watch?v=${videoId}`);
    return txt || "";
  } catch {
    return "";
  }
}

async function getTranscript(videoId) {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    // essaie FR, sinon auto
    let cues = [];
    try { cues = await YoutubeTranscript.fetchTranscript(videoId, { lang: "fr" }); } catch {}
    if (!cues || cues.length === 0) {
      try { cues = await YoutubeTranscript.fetchTranscript(videoId); } catch {}
    }
    return (cues || []).map(c => c.text).join("\n");
  } catch {
    return "";
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing ?url=" });

  try {
    const videoId = ytdl.getURLVideoID(url);

    // --- Métadonnées de base
    const base = await getBasicMeta(url, videoId);

    // --- Watch page (texte "lisible") pour enrichir la description
    const watchText = await getWatchText(videoId);

    // Si description vide, essaie d’extraire un bloc "Description" depuis watchText
    let description = base.description || "";
    if (!description && watchText) {
      // Heuristique simple : prendre 1500 chars autour de "Description"
      const idx = watchText.toLowerCase().indexOf("description");
      if (idx > -1) {
        description = watchText.slice(idx, idx + 2000)
          .replace(/^\s*description\s*:?/i, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
      } else {
        // fallback: prends un gros extrait, ça suffit pour repérer les liens
        description = watchText.slice(0, 4000);
      }
    }

    // --- Transcript (best effort)
    const transcriptText = await getTranscript(videoId);

    // --- Détection DofusBook
    const dofusbookLinks = [
      ...findDofusbookLinks(`${base.title || ""}\n${description || ""}`),
      ...findDofusbookLinks(watchText || "")
    ];
    const dofusbook_url = dofusbookLinks.length ? dofusbookLinks[0] : null;

    // --- Classe / éléments (plus costaud)
    const { klass, elements } = guessClassAndElements(base.title, description, watchText);

    // --- Candidats items (sur pool combiné)
    const textPool = normalizeTextPool(base.title, description, transcriptText || watchText);
    const itemCandidates = extractCandidates(textPool);

    return res.status(200).json({
      video: { url, title: base.title, channel: base.channel },
      dofusbook_url,
      class: klass || null,
      element_build: elements,
      level: null,
      items_candidates: itemCandidates,
      exos_candidates: [], // V3: on ajoutera une heuristique "exo (PA|PM|PO)"
      transcript_excerpt: transcriptText ? transcriptText.slice(0, 3000) : null,
      debug: {
        got_description: Boolean(description),
        sources: {
          ytdl: Boolean(base.title || base.description),
          oembed: Boolean(base.title && base.channel),
          watchText: Boolean(watchText)
        }
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Failed to analyze." });
  }
}