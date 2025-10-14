import { NextResponse } from "next/server";
import ytdl from "ytdl-core";
import { YoutubeTranscript } from "youtube-transcript";
import { extractCandidates, findDofusbookLinks, guessClassAndElements, normalizeTextPool } from "../../../lib/parse";


export const dynamic = "force-dynamic"; // pour Vercel

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return withCors(NextResponse.json({ error: "Missing ?url=" }, { status: 400 }));
  }

  try {
    // 1) valider / extraire l'ID
    const videoId = ytdl.getURLVideoID(url);

    // 2) métadonnées (titre, description, auteur)
    const info = await ytdl.getInfo(videoId);
    const title = info.videoDetails.title;
    const channel = info.videoDetails.author?.name || null;
    const description = info.videoDetails.description || "";

    // 3) transcript (si dispo)
    let transcriptText = "";
    try {
      const cues = await YoutubeTranscript.fetchTranscript(videoId, { lang: "fr" });
      transcriptText = cues.map(c => c.text).join("\n");
    } catch {
      // pas de transcript => silencieux
    }

    // 4) détecter dofusbook
    const dofusbookLinks = findDofusbookLinks(`${title}\n${description}`);

    // 5) déduction classe/éléments (simple)
    const { klass, elements } = guessClassAndElements(title, description);

    // 6) candidats items (heuristique)
    const textPool = normalizeTextPool(title, description, transcriptText);
    const itemCandidates = extractCandidates(textPool);

    // 7) payload
    const payload = {
      video: {
        url,
        title,
        channel
      },
      dofusbook_url: dofusbookLinks[0] || null,
      class: klass || null,
      element_build: elements,
      level: null, // V1: non déduit de manière fiable
      items_candidates: itemCandidates, // V1: liste brute à affiner côté Agent
      exos_candidates: [],              // V1: à implémenter (repérer 'exo PA/PM/PO')
      transcript_excerpt: transcriptText.slice(0, 3000) || null
    };

    return withCors(NextResponse.json(payload));
  } catch (err: any) {
    return withCors(NextResponse.json({ error: err?.message || "Failed to analyze." }, { status: 500 }));
  }
}

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

export async function OPTIONS() {
  return withCors(NextResponse.json({ ok: true }));
}
