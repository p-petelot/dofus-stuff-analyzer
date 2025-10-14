import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import fs from "fs";
import os from "os";

// util en CommonJS (ne change pas)
const {
  cleanOCRText,
  looksLikeItemLine,
  fuzzyMatchItem,
  dedupeByName,
} = require("../../lib/util");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Runtime Node obligatoire (ytdl + ffmpeg)
export const config = { runtime: "nodejs", api: { bodyParser: false } };

// ---------- Tesseract (import dynamique) ----------
let _tess = null;
async function getTesseract() {
  if (_tess) return _tess;
  const mod = await import("tesseract.js");
  _tess = mod; // { createWorker, ... }
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

// ---------- YouTube helpers ----------
async function getMeta(url) {
  try {
    const info = await ytdl.getInfo(url);
    return {
      title: info.videoDetails.title || null,
      channel: info.videoDetails.author?.name || null,
      lengthSeconds: Number(info.videoDetails.lengthSeconds || 0),
    };
  } catch {
    // oEmbed fallback
    try {
      const r = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(
          url
        )}&format=json`
      );
      const j = r.ok ? await r.json() : null;
      return {
        title: j?.title ?? null,
        channel: j?.author_name ?? null,
        lengthSeconds: 0,
      };
    } catch {
      return { title: null, channel: null, lengthSeconds: 0 };
    }
  }
}

// Sélectionne un format MP4 audio+vidéo stable (360p/480p en priorité)
async function getDirectStreamUrl(url) {
  const info = await ytdl.getInfo(url);

  const preferred = info.formats
    .filter(
      (f) =>
        f.hasVideo &&
        f.hasAudio &&
        f.container === "mp4" &&
        (f.qualityLabel === "360p" || f.qualityLabel === "480p")
    )
    .sort(
      (a, b) => (Number(a.contentLength) || 0) - (Number(b.contentLength) || 0)
    );

  const fallback = info.formats
    .filter((f) => f.hasVideo && f.hasAudio && f.container === "mp4")
    .sort(
      (a, b) => (Number(a.contentLength) || 0) - (Number(b.contentLength) || 0)
    );

  const pick = preferred[0] || fallback[0];
  if (!pick?.url) throw new Error("No suitable mp4 muxed format found");
  return pick.url;
}

// Extraction de frames directement depuis l’URL du format (sans pipe ytdl)
async function extractFramesFromDirectUrl(
  formatUrl,
  maxSeconds = 480,
  fps = 0.5
) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
  const outPattern = path.join(tmpDir, "frame-%03d.jpg");

  await new Promise((resolve, reject) => {
    ffmpeg(formatUrl)
      .inputOptions([
        // Reconnexions YouTube
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "2",
        // UA / headers pour éviter certains 403/410
        "-headers",
        "User-Agent: Mozilla/5.0\r\nAccept-Language: fr-FR,fr;q=0.9\r\n",
      ])
      .outputOptions([`-t ${maxSeconds}`, `-vf fps=${fps}`])
      .on("error", (err) => reject(err))
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

// ---------- Parsing items ----------
function extractItemCandidatesFromTextPool(textPool) {
  const lines = (textPool || "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const candidates = [];
  for (const l of lines) {
    if (!looksLikeItemLine(l)) continue;
    // seg à droite de : - •
    const parts = l.split(/[:\-–•\u2022]/);
    const candidate = (parts[parts.length - 1] || "").trim();
    if (candidate.length >= 3 && candidate.length <= 120) candidates.push(candidate);
  }
  return candidates;
}

function normalizeItems(candidates) {
  const matches =
    candidates
      .map((c) => fuzzyMatchItem(c))
      .filter(Boolean)
      .filter((m) => m.confidence >= 0.45) || []; // seuil ajustable

  matches.sort((a, b) => b.confidence - a.confidence);
  return dedupeByName(matches).slice(0, 25);
}

// ---------- Handler ----------
export default async function handler(req, res) {
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method Not Allowed" });

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing ?url=" });

  // 1) Meta vidéo
  const meta = await getMeta(url);

  // 2) Frames + OCR (avec URL de format direct + reconnexion)
  let tmpDir = null;
  let ocr = [];
  try {
    const formatUrl = await getDirectStreamUrl(url);
    const { tmpDir: dir, files } = await extractFramesFromDirectUrl(
      formatUrl,
      Math.min(540, meta.lengthSeconds || 480), // ~9 min max
      0.5 // 1 frame / 2 s
    );
    tmpDir = dir;
    ocr = await ocrFiles(files);
  } catch (e) {
    return res
      .status(500)
      .json({ error: "Frame extraction/OCR failed", detail: String(e) });
  } finally {
    // Nettoyage
    try {
      if (tmpDir && fs.existsSync(tmpDir)) {
        for (const f of fs.readdirSync(tmpDir)) {
          fs.unlinkSync(path.join(tmpDir, f));
        }
        fs.rmdirSync(tmpDir);
      }
    } catch {
      // ignore
    }
  }

  // 3) Candidats depuis OCR → normalisation
  const textPool = ocr.map((x) => x.text).join("\n");
  const rawCandidates = extractItemCandidatesFromTextPool(textPool);
  const matched = normalizeItems(rawCandidates);

  // 4) Classe / éléments (heuristique simple à partir du titre)
  const src = (meta.title || "").toLowerCase();
  const element_build = [];
  if (/terre/i.test(src)) element_build.push("Terre");
  if (/eau/i.test(src)) element_build.push("Eau");
  if (/feu/i.test(src)) element_build.push("Feu");
  if (/(air|agi)/i.test(src)) element_build.push("Air");
  if (element_build.length === 0 && /(expi|punitive|pupu)/i.test(src))
    element_build.push("Terre", "Eau");

  // 5) Payload
  const payload = {
    video: { url, title: meta.title, channel: meta.channel },
    dofusbook_url: null, // (ajoutera la détection description plus tard si tu veux)
    class: /cr(a|â)/i.test(src) ? "Cra" : null,
    element_build,
    level: null,
    items: matched.map((m) => ({
      slot: m.slot,
      name: m.name,
      confidence: m.confidence,
      source: "ocr+fuzzy",
      raw: m.raw,
    })),
    exos: [], // (V4: regex OCR "exo PA/PM/PO")
    stats_synthese: {},
    debug: {
      ocr_frames: ocr.length,
      sample_ocr: ocr.slice(0, 3), // aperçu
    },
  };

  return res.status(200).json(payload);
}