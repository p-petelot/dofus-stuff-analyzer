import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import fs from "fs";
import os from "os";

//const { createWorker } = require("tesseract.js");
const { cleanOCRText, looksLikeItemLine, fuzzyMatchItem, dedupeByName } = require("../../lib/util");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Node runtime only (ytdl + ffmpeg)
export const config = { runtime: "nodejs", api: { bodyParser: false } };

let _tess = null;
async function getTesseract() {
  if (_tess) return _tess;
  const mod = await import("tesseract.js");
  _tess = mod; // contient createWorker
  return _tess;
}

// OCR worker (singleton across invocations if warm)
let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker({
      logger: m => { if (process.env.DEBUG_OCR) console.log("[tess]", m); }
    });
  }
  return workerPromise;
}

async function ensureOCR(lang = "eng+fra") {
  const { createWorker } = await getTesseract();
  const worker = await createWorker({
    logger: m => { if (process.env.DEBUG_OCR) console.log("[tess]", m); }
  });
  await worker.load();
  await worker.loadLanguage(lang);
  await worker.initialize(lang);
  return worker;
}

async function extractFramesFromUrl(url, maxSeconds = 480, fps = 0.5) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
  const videoId = ytdl.getURLVideoID(url);

  // Stream qualité moyenne (plus fiable pour OCR)
  const stream = ytdl(url, { quality: "18" }); // mp4 360p en général

  const outPattern = path.join(tmpDir, "frame-%03d.jpg");

  await new Promise((resolve, reject) => {
    let command = ffmpeg(stream)
      .outputOptions([
        `-t ${maxSeconds}`,   // limite temps
        `-vf fps=${fps}`      // frames/s
      ])
      .on("error", reject)
      .on("end", resolve)
      .save(outPattern);
  });

  const files = fs.readdirSync(tmpDir)
    .filter(f => f.endsWith(".jpg"))
    .map(f => path.join(tmpDir, f))
    .sort();

  return { tmpDir, files, videoId };
}

async function ocrFiles(files) {
  const worker = await ensureOCR();
  const results = [];
  for (const f of files) {
    const { data } = await worker.recognize(f);
    const text = cleanOCRText(data.text);
    results.push({ file: path.basename(f), text });
  }
  await worker.terminate(); // ferme proprement
  return results;
}

function extractItemCandidatesFromTextPool(textPool) {
  const lines = textPool.split(/\n/).map(l => l.trim()).filter(Boolean);
  const candidates = [];
  for (const l of lines) {
    if (!looksLikeItemLine(l)) continue;
    // gardons des segments plausibles (droite de ":" ou "-")
    const parts = l.split(/[:\-–•\u2022]/);
    const candidate = parts[parts.length - 1].trim();
    if (candidate.length >= 3 && candidate.length <= 120) {
      candidates.push(candidate);
    }
  }
  return candidates;
}

function normalizeItems(candidates) {
  const matches = candidates
    .map(c => fuzzyMatchItem(c))
    .filter(Boolean)
    // garde seulement confiance >= 0.45 (à ajuster)
    .filter(m => m.confidence >= 0.45);

  // trie par confiance
  matches.sort((a, b) => b.confidence - a.confidence);
  return dedupeByName(matches).slice(0, 25);
}

async function getMeta(url) {
  try {
    const info = await ytdl.getInfo(url);
    return {
      title: info.videoDetails.title,
      channel: info.videoDetails.author?.name ?? null,
      lengthSeconds: Number(info.videoDetails.lengthSeconds || 0)
    };
  } catch {
    // fallback oEmbed
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    const j = r.ok ? await r.json() : null;
    return {
      title: j?.title ?? null,
      channel: j?.author_name ?? null,
      lengthSeconds: 0
    };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing ?url=" });

  // 1) Méta
  const meta = await getMeta(url);

  // 2) Frames + OCR
  let tmpDir = null;
  let ocr = [];
  try {
    const { tmpDir: dir, files } = await extractFramesFromUrl(url, Math.min(540, meta.lengthSeconds || 480), 0.5);
    tmpDir = dir;
    ocr = await ocrFiles(files);
  } catch (e) {
    return res.status(500).json({ error: "Frame extraction/OCR failed", detail: String(e) });
  } finally {
    // Nettoyage disk
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.readdirSync(tmpDir).forEach(f => fs.unlinkSync(path.join(tmpDir, f)));
      fs.rmdirSync(tmpDir);
    }
  }

  // 3) Candidats d’items à partir de l’OCR
  const textPool = ocr.map(x => x.text).join("\n");
  const rawCandidates = extractItemCandidatesFromTextPool(textPool);
  const matched = normalizeItems(rawCandidates);

  // 4) Déduction simple classe/éléments à partir du titre
  const src = (meta.title || "").toLowerCase();
  const element_build = [];
  if (/terre/i.test(src)) element_build.push("Terre");
  if (/eau/i.test(src)) element_build.push("Eau");
  if (/feu/i.test(src)) element_build.push("Feu");
  if (/(air|agi)/i.test(src)) element_build.push("Air");
  // Expi/Pupu → souvent Terre/Eau si pas détecté
  if (element_build.length === 0 && /(expi|punitive|pupu)/i.test(src)) element_build.push("Terre","Eau");

  const payload = {
    video: { url, title: meta.title, channel: meta.channel },
    dofusbook_url: null, // V3: on se concentre sur OCR + items. On peut rajouter la détection lien DB dans une passe suivante.
    class: /cr(a|â)/i.test(src) ? "Cra" : null,
    element_build,
    level: null,
    items: matched.map(m => ({
      slot: m.slot, name: m.name, confidence: m.confidence, source: "ocr+fuzzy", raw: m.raw
    })),
    exos: [], // on pourra ajouter une heuristique exo (PA/PM/PO) sur les textes OCR si besoin
    stats_synthese: {},
    debug: {
      ocr_frames: ocr.length,
      sample_ocr: ocr.slice(0, 3)
    }
  };

  return res.status(200).json(payload);
}