// pages/api/analyze.js
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import fs from "fs";
import os from "os";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// 👉 Node runtime (ytdl + ffmpeg)
export const config = { runtime: "nodejs", api: { bodyParser: false } };

// ---------- Utils (depuis lib/util.js) ----------
const {
  getYouTubeId, ytThumb, ytEmbed,
  normalize, cleanOCRText,
  looksLikeItemLine, fuzzyMatchItem, dedupeByName,
  scanKnownItemsBySubstring, scanAliases, scanSlotNamePatterns,
  findDofusbookLinks, gatherEvidences, inferElementsFromText, detectExos
} = require("../../lib/util");

// ---------- Fetch helpers ----------
async function fetchJSON(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
async function fetchTEXT(url) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    return r.ok ? await r.text() : "";
  } catch { return ""; }
}

// ---------- Meta YouTube ----------
async function getMeta(url) {
  try {
    const info = await ytdl.getInfo(url);
    return {
      title: info.videoDetails.title || null,
      channel: info.videoDetails.author?.name || null,
      lengthSeconds: Number(info.videoDetails.lengthSeconds || 0),
      formats: info.formats || []
    };
  } catch {
    const j = await fetchJSON(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    return { title: j?.title ?? null, channel: j?.author_name ?? null, lengthSeconds: 0, formats: [] };
  }
}

// ---------- Piped / Invidious (desc + captions sans clé) ----------
async function getPipedVideo(id) {
  const hosts = ["https://piped.video", "https://piped.videoapi.fr", "https://piped.minionflo.net"];
  for (const h of hosts) {
    const v = await fetchJSON(`${h}/api/v1/video/${id}`);
    if (v && (v.description || (Array.isArray(v.captions) && v.captions.length))) return { host: h, data: v };
  }
  return { host: null, data: null };
}
async function getPipedCaptions(host, id, label) {
  const url = `${host}/api/v1/captions/${id}?label=${encodeURIComponent(label)}`;
  const vtt = await fetchTEXT(url);
  if (!vtt) return "";
  return vtt
    .split("\n")
    .filter(line => line && !/^\d+$/.test(line) && !/-->/i.test(line) && !/^WEBVTT/i.test(line))
    .join("\n");
}

async function getInvidiousVideo(id) {
  const hosts = ["https://yewtu.be", "https://invidious.fdn.fr", "https://vid.puffyan.us"];
  for (const h of hosts) {
    const v = await fetchJSON(`${h}/api/v1/videos/${id}`);
    if (v && (v.description || (Array.isArray(v.captions) && v.captions.length))) return { host: h, data: v };
  }
  return { host: null, data: null };
}
async function getInvidiousCaptions(host, id, label) {
  const caps = await fetchJSON(`${host}/api/v1/captions/${id}`);
  if (!caps || !Array.isArray(caps)) return "";
  const match = caps.find(c => (c.label || c.language || "").toLowerCase().includes(label.toLowerCase()));
  if (!match) return "";
  const vtt = await fetchTEXT(match.url || match.src || "");
  return vtt
    .split("\n")
    .filter(line => line && !/^\d+$/.test(line) && !/-->/i.test(line) && !/^WEBVTT/i.test(line))
    .join("\n");
}

// ---------- Watch page lisible ----------
async function getReadableWatchPage(id) {
  return await fetchTEXT(`https://r.jina.ai/http://www.youtube.com/watch?v=${id}`);
}

// ---------- Frames + OCR (best-effort, non bloquant) ----------
function pickPreferredFormats(formats) {
  if (!Array.isArray(formats)) return [];
  const mp4Low = formats.filter(f => f.hasVideo && f.hasAudio && f.container === "mp4" && (f.qualityLabel === "360p" || f.qualityLabel === "480p"));
  const mp4Any = formats.filter(f => f.hasVideo && f.hasAudio && f.container === "mp4");
  const webmAny = formats.filter(f => f.hasVideo && f.hasAudio && f.container === "webm");
  const seen = new Set();
  return [...mp4Low, ...mp4Any, ...webmAny].filter(f => {
    if (!f?.url) return false;
    const k = `${f.container}-${f.qualityLabel}-${f.itag}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 6);
}
async function extractFramesFromUrl(formatUrl, { maxSeconds, fps }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
  const outPattern = path.join(tmpDir, "frame-%03d.jpg");
  await new Promise((resolve, reject) => {
    ffmpeg(formatUrl)
      .inputOptions([
        "-reconnect", "1",
        "-reconnect_streamed", "1",
        "-reconnect_delay_max", "2",
        "-headers", "User-Agent: Mozilla/5.0\r\nAccept-Language: fr-FR,fr;q=0.9\r\n"
      ])
      .outputOptions([`-t ${maxSeconds}`, `-vf fps=${fps}`])
      .on("error", reject)
      .on("end", resolve)
      .save(outPattern);
  });
  const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).map(f => path.join(tmpDir, f)).sort();
  return { tmpDir, files };
}
async function tryFrames(formats, opts, warns) {
  let lastErr = null;
  for (const f of pickPreferredFormats(formats)) {
    try {
      const r = await extractFramesFromUrl(f.url, opts);
      if (r.files.length > 0) return { ...r, tried: `${f.container} ${f.qualityLabel || ""}`.trim() };
      lastErr = new Error("No frames produced");
    } catch (e) {
      lastErr = e;
      warns.push(`extract fail ${f.container}/${f.qualityLabel || "?"}: ${String(e).slice(0, 120)}`);
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("No suitable format");
}
// OCR dynamic
let _tess = null;
async function getTesseract() { if (_tess) return _tess; const mod = await import("tesseract.js"); _tess = mod; return _tess; }
async function ensureOCR(lang = "eng+fra") {
  const { createWorker } = await getTesseract();
  const worker = await createWorker();
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

// ---------- Items parsing local ----------
function extractItemCandidates(textPool) {
  const lines = (textPool || "").split(/\r?\n/).map(s => normalize(s)).filter(Boolean);
  const cand = [];
  for (const l of lines) {
    if (!looksLikeItemLine(l)) continue;
    const parts = l.split(/[:\-–•\u2022]/);
    const right = (parts[parts.length - 1] || "").trim();
    if (right.length >= 3 && right.length <= 120) cand.push(right);
  }
  return cand;
}
function normalizeItems(candidates) {
  const fuzzy = (candidates || []).map(c => fuzzyMatchItem(c)).filter(Boolean).filter(m => m.confidence >= 0.5);
  fuzzy.sort((a, b) => b.confidence - a.confidence);
  return dedupeByName(fuzzy).slice(0, 25);
}

// ============ HANDLER ============
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "Missing ?url=" });

    const warns = [];
    const id = getYouTubeId(url);
    if (!id) return res.status(400).json({ error: "Invalid YouTube URL" });

    // 1) Meta
    const meta = await getMeta(url);
    const maxSeconds = Math.min(540, meta.lengthSeconds || 480);
    const fps = 0.5;

    // 2) Sources textuelles (sans clé)
    const readable = await getReadableWatchPage(id);
    const piped = await getPipedVideo(id);
    const invid = await getInvidiousVideo(id);

    // Captions (FR prioritaire, sinon 1ère piste)
    let captionsText = "";
    if (piped.data?.captions?.length) {
      const pref = piped.data.captions.find(c => /french/i.test(c.label)) || piped.data.captions[0];
      if (pref) captionsText = await getPipedCaptions(piped.host, id, pref.label);
    }
    if (!captionsText && invid.data?.captions?.length) {
      const pref = invid.data.captions.find(c => /french|fr/i.test(c.label || c.language)) || invid.data.captions[0];
      if (pref) captionsText = await getInvidiousCaptions(invid.host, id, pref.label || pref.language || "French");
    }

    // Texte assemblé pour l’analyse
    const assembled = [
      meta.title || "",
      piped.data?.description || "",
      invid.data?.description || "",
      readable || "",
      captionsText || ""
    ].join("\n");

    // 3) DofusBook + évidences
    const dofusbooks = findDofusbookLinks(assembled);
    const evidences = gatherEvidences(assembled, 24);

    // 4) Items depuis le texte (ordre de priorité : slot-cap > alias > exact > fuzzy)
    const aliasHits   = scanAliases(assembled);
    const directHits  = scanKnownItemsBySubstring(assembled);
    const slotCapHits = scanSlotNamePatterns(assembled);
    const textCand    = extractItemCandidates(assembled);
    let   matchedText = normalizeItems(textCand);
    let   matched     = dedupeByName([ ...slotCapHits, ...aliasHits, ...directHits, ...matchedText ]);

    // 5) Exos + éléments (sur TOUT le texte, pas de valeur par défaut)
    const exos     = detectExos(assembled);
    const elements = inferElementsFromText(assembled);
    const klass    = (/\bcr[âa]\b|(?:^|\s)cra(?:\s|$)/i.test(assembled)) ? "Cra" : null;

    // 6) OCR (best-effort) — non bloquant
    let tmpDir = null, usedFormat = null, ocr = [], ocrCandidates = [], ocrMatches = [];
    try {
      if (meta.formats && meta.formats.length) {
        const { tmpDir: dir, files, tried } = await tryFrames(meta.formats, { maxSeconds, fps }, warns);
        tmpDir = dir; usedFormat = tried;
        ocr = await ocrFiles(files);
        const ocrText = ocr.map(x => x.text).join("\n");
        ocrCandidates = extractItemCandidates(ocrText);
        ocrMatches = normalizeItems(ocrCandidates);
      } else {
        warns.push("No formats from ytdl; OCR skipped.");
      }
    } catch (e) {
      warns.push(`OCR disabled: ${String(e)}`);
    } finally {
      try {
        if (tmpDir && fs.existsSync(tmpDir)) {
          for (const f of fs.readdirSync(tmpDir)) fs.unlinkSync(path.join(tmpDir, f));
          fs.rmdirSync(tmpDir);
        }
      } catch {}
    }

    // Fusion finale des items (priorité à l’OCR si dispo)
    const items = dedupeByName([ ...(ocrMatches || []), ...(slotCapHits || []), ...(aliasHits || []), ...(directHits || []), ...(matchedText || []) ])
      .map(m => ({
        slot: m.slot, name: m.name, confidence: m.confidence,
        source: m.source || (ocrMatches.length ? "ocr+fuzzy" : "text+fuzzy"),
        raw: m.raw, proof: m.proof || null
      }));

    const payload = {
      video: {
        url, title: meta.title, channel: meta.channel,
        video_id: id,
        thumbnail: ytThumb(id),
        embed_url: ytEmbed(id)
      },
      sources: {
        piped: !!piped.data, invidious: !!invid.data, readable: !!readable, captions: !!captionsText
      },
      dofusbook_url: dofusbooks[0] || null,
      class: klass,                 // peut être null si non trouvé
      element_build: elements,      // ex: ["Terre","Eau"] si le texte le dit ; pas de défaut
      level: null,
      items,                        // peut être [] si rien de probant
      exos,                         // []
      stats_synthese: {},
      evidences,                    // lignes utiles pour comprendre d'où ça vient
      explanation: null,            // pas de texte “inventé” si on n’a pas les preuves
      debug: {
        used_format: usedFormat,
        text_candidates: textCand.length,
        ocr_frames: ocr.length,
        ocr_candidates: ocrCandidates.length,
        warns
      }
    };

    return res.status(200).json(payload);
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    return res.status(500).json({ error: "Internal error", detail: msg.slice(0, 500) });
  }
}