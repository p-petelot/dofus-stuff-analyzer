// pages/api/analyze.js
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import fs from "fs";
import os from "os";

const {
  cleanOCRText,
  looksLikeItemLine,
  fuzzyMatchItem,
  dedupeByName,
} = require("../../lib/util");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Runtime Node obligatoire
export const config = { runtime: "nodejs", api: { bodyParser: false } };

// ---------------------- Helpers réseau ----------------------
async function fetchJSON(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
async function fetchTEXT(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return "";
    return await r.text();
  } catch {
    return "";
  }
}

// ---------------------- Meta / Transcripts / Watch ----------------------
async function getMeta(url) {
  try {
    const info = await ytdl.getInfo(url);
    return {
      title: info.videoDetails.title || null,
      channel: info.videoDetails.author?.name || null,
      lengthSeconds: Number(info.videoDetails.lengthSeconds || 0),
      formats: info.formats || [],
    };
  } catch {
    // oEmbed fallback
    const j = await fetchJSON(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );
    return {
      title: j?.title ?? null,
      channel: j?.author_name ?? null,
      lengthSeconds: 0,
      formats: [],
    };
  }
}

async function getTranscript(videoId) {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    let cues = [];
    try {
      cues = await YoutubeTranscript.fetchTranscript(videoId, { lang: "fr" });
    } catch {}
    if (!cues || cues.length === 0) {
      try {
        cues = await YoutubeTranscript.fetchTranscript(videoId);
      } catch {}
    }
    return (cues || []).map((c) => c.text).join("\n");
  } catch {
    return "";
  }
}

async function getWatchText(videoId) {
  // “render” lisible de la page watch (souvent contient la description)
  return await fetchTEXT(`https://r.jina.ai/http://www.youtube.com/watch?v=${videoId}`);
}

// ---------------------- Tesseract (import dynamique) ----------------------
let _tess = null;
async function getTesseract() {
  if (_tess) return _tess;
  const mod = await import("tesseract.js");
  _tess = mod;
  return _tess;
}
async function ensureOCR(lang = "eng+fra") {
  const { createWorker } = await getTesseract();
  const worker = await createWorker({
    logger: (m) => {
      if (process.env.DEBUG_OCR) console.log("[tesseract]", m);
    },
  });
  await worker.load();
  await worker.loadLanguage(lang);
  await worker.initialize(lang);
  return worker;
}
async function ocrFiles(files) {
  const worker = await ensureOCR();
  const out = [];
  for (const f of files) {
    const { data } = await worker.recognize(f);
    out.push({ file: path.basename(f), text: cleanOCRText(data.text) });
  }
  await worker.terminate();
  return out;
}

// ---------------------- Extraction frames (avec retries) ----------------------
function pickPreferredFormats(formats) {
  if (!Array.isArray(formats)) return [];
  // priorité mp4 360/480, puis autres mp4 muxed, puis webm muxed
  const mp4Low = formats.filter(
    (f) =>
      f.hasVideo && f.hasAudio && f.container === "mp4" &&
      (f.qualityLabel === "360p" || f.qualityLabel === "480p")
  );
  const mp4Any = formats.filter((f) => f.hasVideo && f.hasAudio && f.container === "mp4");
  const webmAny = formats.filter((f) => f.hasVideo && f.hasAudio && f.container === "webm");

  // dédoublonne et garde l’ordre de préférence
  const seen = new Set();
  const ordered = [...mp4Low, ...mp4Any, ...webmAny].filter((f) => {
    if (!f?.url) return false;
    const key = `${f.container}-${f.qualityLabel}-${f.itag}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return ordered.slice(0, 6); // on tente max 6 formats
}

async function extractFramesFromDirectUrl(formatUrl, opts) {
  const { maxSeconds, fps } = opts;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
  const outPattern = path.join(tmpDir, "frame-%03d.jpg");

  await new Promise((resolve, reject) => {
    ffmpeg(formatUrl)
      .inputOptions([
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "2",
        "-headers", "User-Agent: Mozilla/5.0\r\nAccept-Language: fr-FR,fr;q=0.9\r\n",
      ])
      .outputOptions([`-t ${maxSeconds}`, `-vf fps=${fps}`])
      .on("error", reject)
      .on("end", resolve)
      .save(outPattern);
  });

  const files = fs
    .readdirSync(tmpDir)
    .filter((f) => f.endsWith(".jpg"))
    .map((f) => path.join(tmpDir, f))
    .sort();

  return { tmpDir, files };
}

async function tryExtractFramesWithRetries(formats, opts, warns) {
  const tries = pickPreferredFormats(formats);
  let lastErr = null;

  for (const f of tries) {
    try {
      const { tmpDir, files } = await extractFramesFromDirectUrl(f.url, opts);
      if (files.length > 0) {
        return { tmpDir, files, formatTried: `${f.container} ${f.qualityLabel || ""}`.trim() };
      }
      lastErr = new Error("No frames produced");
    } catch (e) {
      lastErr = e;
      warns.push(`extract fail on ${f.container}/${f.qualityLabel || "?"}: ${String(e).slice(0,120)}`);
      // on continue sur le format suivant
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("No suitable format to extract");
}

// ---------------------- Items parsing ----------------------
function extractItemCandidatesFromTextPool(textPool) {
  const lines = (textPool || "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const candidates = [];
  for (const l of lines) {
    if (!looksLikeItemLine(l)) continue;
    const parts = l.split(/[:\-–•\u2022]/);
    const candidate = (parts[parts.length - 1] || "").trim();
    if (candidate.length >= 3 && candidate.length <= 120) candidates.push(candidate);
  }
  return candidates;
}
function normalizeItems(candidates) {
  const matches =
    (candidates || [])
      .map((c) => fuzzyMatchItem(c))
      .filter(Boolean)
      .filter((m) => m.confidence >= 0.45) || [];
  matches.sort((a, b) => b.confidence - a.confidence);
  return dedupeByName(matches).slice(0, 25);
}
function findDofusbookLinks(text) {
  if (!text) return [];
  const re = /https?:\/\/(?:www\.)?dofusbook\.net\/[^\s)]+/gi;
  return Array.from(text.matchAll(re)).map((m) => m[0]);
}

// ---------------------- Handler ----------------------
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing ?url=" });

  const warns = [];

  // 1) videoId + meta
  let videoId = null;
  try {
    videoId = ytdl.getURLVideoID(url);
  } catch {
    return res.status(400).json({ error: "Invalid YouTube URL" });
  }

  const meta = await getMeta(url);
  const maxSeconds = Math.min(540, meta.lengthSeconds || 480); // ~9 min
  const fps = 0.5; // 1 frame / 2 s

  // 2) OCR frames (best-effort, non bloquant)
  let tmpDir = null;
  let ocr = [];
  let usedFormatLabel = null;

  try {
    if (meta.formats?.length) {
      const { tmpDir: dir, files, formatTried } = await tryExtractFramesWithRetries(
        meta.formats,
        { maxSeconds, fps },
        warns
      );
      tmpDir = dir;
      usedFormatLabel = formatTried;
      ocr = await ocrFiles(files);
    } else {
      warns.push("No formats from ytdl; skipping OCR.");
    }
  } catch (e) {
    warns.push(`OCR disabled (video fetch failed): ${String(e)}`);
  } finally {
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        for (const f of fs.readdirSync(tmpDir)) fs.unlinkSync(path.join(tmpDir, f));
        fs.rmdirSync(tmpDir);
      }
    } catch {}
  }

  // 3) WatchText + Transcript (pour compléter même sans OCR)
  const watchText = await getWatchText(videoId);
  const transcript = await getTranscript(videoId);

  // 4) Description & DofusBook
  // On reconstitue une pseudo description en mixant watchText (lisible) + transcript
  const assembledText = [meta.title || "", watchText || "", transcript || ""].join("\n");
  const dofusbooks = findDofusbookLinks(assembledText);
  const dofusbook_url = dofusbooks[0] || null;

  // 5) Item candidates (OCR si dispo, sinon texte)
  let textPool = "";
  if (ocr.length) {
    textPool = ocr.map((x) => x.text).join("\n");
  } else {
    warns.push("Using text-only extraction (no OCR).");
    textPool = assembledText;
  }

  const rawCandidates = extractItemCandidatesFromTextPool(textPool);
  const matched = normalizeItems(rawCandidates);

  // 6) Classe / éléments (heuristique titre)
  const src = (meta.title || "").toLowerCase();
  const element_build = [];
  if (/terre/i.test(src)) element_build.push("Terre");
  if (/eau/i.test(src)) element_build.push("Eau");
  if (/feu/i.test(src)) element_build.push("Feu");
  if (/(air|agi)/i.test(src)) element_build.push("Air");
  if (element_build.length === 0 && /(expi|punitive|pupu)/i.test(src)) element_build.push("Terre", "Eau");

  const payload = {
    video: { url, title: meta.title, channel: meta.channel },
    dofusbook_url,
    class: /cr(a|â)/i.test(src) ? "Cra" : null,
    element_build,
    level: null,
    items: matched.map((m) => ({
      slot: m.slot,
      name: m.name,
      confidence: m.confidence,
      source: ocr.length ? "ocr+fuzzy" : "text+fuzzy",
      raw: m.raw,
    })),
    exos: [],
    stats_synthese: {},
    debug: {
      used_format: usedFormatLabel,
      ocr_frames: ocr.length,
      sample_ocr: ocr.slice(0, 2),
      text_candidates_count: rawCandidates.length,
      warns,
    },
  };

  return res.status(200).json(payload);
}