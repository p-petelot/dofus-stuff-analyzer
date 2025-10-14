// pages/api/analyze.js — V7.2 (captions TimedText ++, fallback ytdl→fichier pour OCR)
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import fs from "fs";
import os from "os";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
export const config = { runtime: "nodejs", api: { bodyParser: false } };

// ---------- Utils locaux ----------
const {
  getYouTubeId, ytThumb, ytEmbed,
  normalize, cleanOCRText,
  looksLikeItemLine, fuzzyMatchItem, dedupeByName,
  scanKnownItemsBySubstring, scanAliases, scanSlotNamePatterns,
  findDofusbookLinks, gatherEvidences, inferElementsFromText, detectExos, inferClassFromText,
  detectStuffMoments
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
      formats: info.formats || [],
      rawInfo: info
    };
  } catch {
    const j = await fetchJSON(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    return { title: j?.title ?? null, channel: j?.author_name ?? null, lengthSeconds: 0, formats: [], rawInfo: null };
  }
}

// ---------- Piped / Invidious (desc + captions + streams sans clé) ----------
async function getPipedVideo(id) {
  const hosts = [
    "https://piped.video",
    "https://piped.videoapi.fr",
    "https://piped.minionflo.net",
    "https://piped.darkness.services"
  ];
  for (const h of hosts) {
    const v = await fetchJSON(`${h}/api/v1/video/${id}`);
    if (v && (v.description || v.captions?.length || v.videoStreams?.length)) return { host: h, data: v };
  }
  return { host: null, data: null };
}
async function getPipedCaptions(host, id, label) {
  const url = `${host}/api/v1/captions/${id}?label=${encodeURIComponent(label)}`;
  const vtt = await fetchTEXT(url);
  return parseCaptionRaw(vtt, "vtt");
}

async function getInvidiousVideo(id) {
  const hosts = ["https://yewtu.be", "https://invidious.fdn.fr", "https://vid.puffyan.us"];
  for (const h of hosts) {
    const v = await fetchJSON(`${h}/api/v1/videos/${id}`);
    if (v && (v.description || v.captions?.length || v.formatStreams?.length)) return { host: h, data: v };
  }
  return { host: null, data: null };
}
async function getInvidiousCaptions(host, id, labelOrLang) {
  const caps = await fetchJSON(`${host}/api/v1/captions/${id}`);
  if (!caps || !Array.isArray(caps)) return { text: "", cues: [] };
  const match = caps.find(c => ((c.label || c.language || "").toLowerCase().includes((labelOrLang || "").toLowerCase())));
  if (!match) return { text: "", cues: [] };
  const vtt = await fetchTEXT(match.url || match.src || "");
  return parseCaptionRaw(vtt, "vtt");
}

// ---------- Watch page lisible ----------
async function getReadableWatchPage(id) {
  return await fetchTEXT(`https://r.jina.ai/http://www.youtube.com/watch?v=${id}`);
}

// ---------- Captions helpers ----------
function parseTimecode(str) {
  if (!str) return null;
  const parts = str.replace(",", ".").split(":");
  if (!parts.length) return null;
  let seconds = 0;
  let factor = 1;
  while (parts.length) {
    const value = parseFloat(parts.pop());
    if (!Number.isNaN(value)) seconds += value * factor;
    factor *= 60;
  }
  return seconds;
}

function parseVtt(raw) {
  if (!raw) return { text: "", cues: [] };
  const blocks = raw
    .replace(/\r/g, "")
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter(Boolean);
    if (!lines.length) continue;
    let timeLineIndex = lines.findIndex((line) => /-->/.test(line));
    if (timeLineIndex === -1 && lines.length >= 2) timeLineIndex = 0;
    if (timeLineIndex === -1) continue;
    const timeLine = lines[timeLineIndex];
    const text = lines.slice(timeLineIndex + 1).join(" ").trim();
    if (!text) continue;
    const [startRaw, endRaw] = timeLine.split(/-->/).map((s) => s.trim());
    const start = parseTimecode(startRaw);
    const end = parseTimecode(endRaw);
    cues.push({ start, end, text });
  }
  const text = cues.map((c) => c.text).join("\n");
  return { text, cues };
}

function parseJson3(raw) {
  if (!raw) return { text: "", cues: [] };
  try {
    const obj = JSON.parse(raw);
    const events = obj.events || [];
    const cues = [];
    for (const ev of events) {
      const segs = ev.segs || [];
      const txt = segs.map((s) => s.utf8 || "").join("").trim();
      if (!txt) continue;
      const start = typeof ev.tStartMs === "number" ? ev.tStartMs / 1000 : null;
      const end = typeof ev.dDurationMs === "number" && start != null ? start + ev.dDurationMs / 1000 : null;
      cues.push({ start, end, text: txt });
    }
    const text = cues.map((c) => c.text).join("\n");
    return { text, cues };
  } catch {
    return { text: "", cues: [] };
  }
}

function parseXml(raw) {
  if (!raw) return { text: "", cues: [] };
  const unescape = (s) =>
    s
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  const cues = [];
  const regex = /<text([^>]*)>([\s\S]*?)<\/text>/g;
  let match;
  while ((match = regex.exec(raw))) {
    const attrs = match[1] || "";
    let text = match[2] || "";
    text = unescape(text).replace(/<[^>]+>/g, "").replace(/\n+/g, " ").trim();
    if (!text) continue;
    const startAttr = attrs.match(/start="([^"]+)"/);
    const durAttr = attrs.match(/dur="([^"]+)"/);
    const start = startAttr ? parseFloat(startAttr[1]) : null;
    const end = durAttr && start != null ? start + parseFloat(durAttr[1]) : null;
    cues.push({ start, end, text });
  }
  const text = cues.map((c) => c.text).join("\n");
  return { text, cues };
}

function parseCaptionRaw(raw, fmtHint) {
  if (!raw) return { text: "", cues: [] };
  const trimmed = raw.trim();
  if (fmtHint === "json3") return parseJson3(trimmed);
  if (fmtHint === "ttml") return parseXml(trimmed);
  if (fmtHint === "vtt") return parseVtt(raw);
  if (/^WEBVTT/i.test(trimmed)) return parseVtt(raw);
  if (trimmed.startsWith("{")) return parseJson3(trimmed);
  return parseXml(trimmed);
}

// 1) Captions via youtube-transcript
async function getCaptionsViaLib(id) {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    let cues = [];
    try { cues = await YoutubeTranscript.fetchTranscript(id, { lang: "fr" }); } catch {}
    if (!cues?.length) { try { cues = await YoutubeTranscript.fetchTranscript(id); } catch {} }
    if (!cues?.length) return { text: "", lang: null, source: null, cues: [] };
    const normalized = cues
      .map((c) => ({
        text: normalize(c.text),
        start: typeof c.offset === "number" ? c.offset : typeof c.start === "number" ? c.start : null,
        end: typeof c.duration === "number" && typeof c.offset === "number" ? c.offset + c.duration : null
      }))
      .filter((c) => c.text);
    return {
      text: normalized.map((c) => c.text).join("\n"),
      lang: "auto",
      source: "youtube-transcript",
      cues: normalized.map((c) => ({ start: c.start, end: c.end, text: c.text }))
    };
  } catch { return { text: "", lang: null, source: null, cues: [] }; }
}

// 2) Captions via ytdl player_response (baseUrl)
async function getCaptionsViaYtdlInfo(info) {
  try {
    const pr = info?.player_response || info?.playerResponse || {};
    const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!tracks?.length) return { text: "", lang: null, source: null, cues: [] };
    const order = ["fr", "fr-FR", "fr-CA", "en", "en-US"];
    let chosen = null;
    for (const code of order) {
      chosen = tracks.find(t => (t.languageCode || "").toLowerCase() === code.toLowerCase());
      if (chosen) break;
    }
    if (!chosen) chosen = tracks[0];
    if (!chosen?.baseUrl) return { text: "", lang: null, source: null, cues: [] };
    const raw = await fetchTEXT(chosen.baseUrl);
    const parsed = parseCaptionRaw(raw, null);
    return { text: parsed.text, cues: parsed.cues, lang: chosen.languageCode || null, source: "ytdl-captions" };
  } catch { return { text: "", lang: null, source: null, cues: [] }; }
}

// 3) TimedText officiel — ESSAIS MULTIPLES (fmt/lang/tlang/kind)
const LANGS = ["fr","fr-FR","fr-CA","en","en-US","en-GB"];
const FMTS  = ["vtt","json3","ttml"];
async function getCaptionsViaTimedText(id) {
  // a) sous-titres “normaux”
  for (const lang of LANGS) {
    for (const fmt of FMTS) {
      const url = `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(lang)}&v=${id}&fmt=${fmt}`;
      const raw = await fetchTEXT(url);
      const parsed = parseCaptionRaw(raw, fmt);
      if (parsed.text && parsed.text.length > 50) return { text: parsed.text, cues: parsed.cues, lang, source: `timedtext:${fmt}` };
    }
  }
  // b) auto (ASR)
  for (const lang of LANGS) {
    for (const fmt of FMTS) {
      const url = `https://www.youtube.com/api/timedtext?caps=asr&lang=${encodeURIComponent(lang)}&v=${id}&fmt=${fmt}`;
      const raw = await fetchTEXT(url);
      const parsed = parseCaptionRaw(raw, fmt);
      if (parsed.text && parsed.text.length > 50) return { text: parsed.text, cues: parsed.cues, lang: `${lang} (asr)`, source: `timedtext-asr:${fmt}` };
    }
  }
  // c) traduction (tlang)
  for (const tlang of LANGS) {
    const url = `https://www.youtube.com/api/timedtext?lang=en&v=${id}&fmt=vtt&tlang=${encodeURIComponent(tlang)}`;
    const raw = await fetchTEXT(url);
    const parsed = parseCaptionRaw(raw, "vtt");
    if (parsed.text && parsed.text.length > 50) return { text: parsed.text, cues: parsed.cues, lang: `tlang:${tlang}`, source: `timedtext-tlang:vtt` };
  }
  return { text: "", lang: null, source: null, cues: [] };
}

// ---------- Streams pour OCR ----------
function pickPreferredFormats(formats) {
  if (!Array.isArray(formats)) return [];
  const mp4Low = formats.filter(f => f.hasVideo && f.hasAudio && f.container === "mp4" && (f.qualityLabel === "360p" || f.qualityLabel === "480p"));
  const mp4Any = formats.filter(f => f.hasVideo && f.hasAudio && f.container === "mp4");
  const webmAny = formats.filter(f => f.hasVideo && f.hasAudio && f.container === "webm");
  const seen = new Set();
  return [...mp4Low, ...mp4Any, ...webmAny].filter(f => {
    if (!f?.url) return false;
    const k = `${f.container}-${f.qualityLabel}-${f.itag}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  }).slice(0, 6);
}
function pickStreamsFromPiped(pipedData) {
  const vs = pipedData?.videoStreams || [];
  const cand = vs.filter(s => /mp4/i.test(s.container) && /360|480/i.test(s.qualityLabel || s.quality))
                 .concat(vs.filter(s => /mp4/i.test(s.container)));
  return cand.map(s => s.url);
}
function pickStreamsFromInvidious(invData) {
  const fs_ = invData?.formatStreams || [];
  const cand = fs_.filter(s => /mp4/i.test(s.type) && /360|480/.test(s.qualityLabel || s.quality))
                  .concat(fs_.filter(s => /mp4/i.test(s.type)));
  return cand.map(s => s.url);
}

async function extractFramesFromUrl(formatUrl, { maxSeconds, fps }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
  const outPattern = path.join(tmpDir, "frame-%03d.jpg");
  await new Promise((resolve, reject) => {
    ffmpeg(formatUrl)
      .inputOptions([
        "-reconnect","1","-reconnect_streamed","1","-reconnect_delay_max","2",
        "-user_agent","Mozilla/5.0",
        "-headers","Referer: https://www.youtube.com/\r\nAccept-Language: fr-FR,fr;q=0.9\r\n"
      ])
      .outputOptions([`-t ${maxSeconds}`, `-vf fps=${fps}`])
      .on("error", reject).on("end", resolve).save(outPattern);
  });
  const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).map(f => path.join(tmpDir, f)).sort();
  return { tmpDir, files };
}

// ⚠️ NOUVEAU : fallback “télécharger en local” via ytdl, puis ffmpeg lit un fichier local
async function downloadWithYtdlToTemp(urlOrId) {
  const url = /^https?:/.test(urlOrId) ? urlOrId : `https://www.youtube.com/watch?v=${urlOrId}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ytvid-"));
  const tmpFile = path.join(tmpDir, "video.mp4");
  await new Promise((resolve, reject) => {
    const stream = ytdl(url, {
      quality: 18,               // MP4 360p muxed
      filter: "audioandvideo",
      highWaterMark: 1 << 25     // 32MB buffer
    })
    .on("error", reject)
    .pipe(fs.createWriteStream(tmpFile))
    .on("error", reject)
    .on("finish", resolve);
  });
  return { tmpDir, tmpFile };
}

async function extractFramesLocalFile(tmpFile, { maxSeconds, fps }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
  const outPattern = path.join(tmpDir, "frame-%03d.jpg");
  await new Promise((resolve, reject) => {
    ffmpeg(tmpFile)
      .outputOptions([`-t ${maxSeconds}`, `-vf fps=${fps}`])
      .on("error", reject).on("end", resolve).save(outPattern);
  });
  const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).map(f => path.join(tmpDir, f)).sort();
  return { tmpDir, files };
}

async function tryFramesAnySource({ id, ytFormats, piped, invid, opts, warns }) {
  const tries = [];

  // 1) Piped direct streams
  const pipedUrls = pickStreamsFromPiped(piped?.data);
  for (const u of pipedUrls) tries.push({ src: "piped", url: u, mode: "url" });

  // 2) Invidious direct streams
  const invUrls = pickStreamsFromInvidious(invid?.data);
  for (const u of invUrls) tries.push({ src: "invidious", url: u, mode: "url" });

  // 3) YouTube formats (ytdl info)
  for (const f of pickPreferredFormats(ytFormats || [])) {
    tries.push({ src: `youtube ${f.container} ${f.qualityLabel || ""}`.trim(), url: f.url, mode: "url" });
  }

  // 4) Fallback fort : télécharger en local via ytdl (itag 18), puis extraire
  tries.push({ src: "ytdl-local-itag18", url: `https://www.youtube.com/watch?v=${id}`, mode: "local" });

  let lastErr = null;
  for (const t of tries) {
    try {
      if (t.mode === "url") {
        const r = await extractFramesFromUrl(t.url, opts);
        if (r.files.length > 0) return { ...r, tried: t.src, cleanup: null };
        lastErr = new Error("No frames produced");
      } else {
        const dl = await downloadWithYtdlToTemp(t.url);
        const r = await extractFramesLocalFile(dl.tmpFile, opts);
        // cleanup downloader dir
        try {
          fs.unlinkSync(dl.tmpFile);
          fs.rmdirSync(dl.tmpDir);
        } catch {}
        if (r.files.length > 0) return { ...r, tried: t.src, cleanup: null };
        lastErr = new Error("No frames produced (local)");
      }
    } catch (e) {
      lastErr = e;
      warns.push(`extract fail ${t.src}: ${String(e).slice(0, 200)}`);
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("No suitable format");
}

// OCR (dynamic)
let _tess = null;
async function getTesseract() { if (_tess) return _tess; const mod = await import("tesseract.js"); _tess = mod; return _tess; }
async function ensureOCR(lang = "eng+fra") { const { createWorker } = await getTesseract(); const worker = await createWorker(); await worker.load(); await worker.loadLanguage(lang); await worker.initialize(lang); return worker; }
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

// ---------- Items parsing (text + OCR) ----------
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

// ================== HANDLER ==================
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });

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

    // 2) Sources textuelles + streams alternatifs
    const readable = await getReadableWatchPage(id);
    const piped    = await getPipedVideo(id);
    const invid    = await getInvidiousVideo(id);

    // 3) Captions — multi-voies (lib, ytdl, timedtext, piped, invidious)
    let transcript = { text: "", lang: null, source: null, cues: [] };

    let cap = await getCaptionsViaLib(id);
    if (cap?.text) transcript = cap;
    if (!transcript.text) {
      cap = await getCaptionsViaYtdlInfo(meta.rawInfo);
      if (cap?.text) transcript = cap;
    }
    if (!transcript.text) {
      cap = await getCaptionsViaTimedText(id);
      if (cap?.text) transcript = cap;
    }
    if (!transcript.text && piped.data?.captions?.length) {
      const pref = piped.data.captions.find(c => /french/i.test(c.label)) || piped.data.captions[0];
      if (pref) {
        const parsed = await getPipedCaptions(piped.host, id, pref.label);
        transcript = { ...parsed, lang: pref.label, source: "piped" };
      }
    }
    if (!transcript.text && invid.data?.captions?.length) {
      const pref = invid.data.captions.find(c => /french|fr/i.test(c.label || c.language)) || invid.data.captions[0];
      if (pref) {
        const parsed = await getInvidiousCaptions(invid.host, id, pref.label || pref.language || "French");
        transcript = { ...parsed, lang: pref.label || pref.language, source: "invidious" };
      }
    }
    transcript.cues = Array.isArray(transcript.cues) ? transcript.cues.filter(c => c && c.text) : [];

    // 4) Sources textuelles agrégées
    const textSources = [];
    if (meta.title) {
      textSources.push({ id: "title", type: "title", label: "Titre YouTube", text: meta.title, weight: 1.3 });
    }
    const pipedDesc = typeof piped.data?.description === "string" ? piped.data.description : "";
    if (pipedDesc) {
      const label = `Description (${(piped.host || "piped").replace(/^https?:\/\//, "")})`;
      textSources.push({ id: "piped-desc", type: "description", label, text: pipedDesc, weight: 1 });
    }
    const invidDesc = typeof invid.data?.description === "string" ? invid.data.description : "";
    if (invidDesc && invidDesc !== pipedDesc) {
      const label = `Description (${(invid.host || "invidious").replace(/^https?:\/\//, "")})`;
      textSources.push({ id: "invid-desc", type: "description", label, text: invidDesc, weight: 0.9 });
    }
    if (readable) {
      textSources.push({ id: "readable", type: "readable", label: "Page YouTube lisible", text: readable, weight: 0.8 });
    }
    if (transcript.text) {
      const langLabel = transcript.lang ? `Transcript (${transcript.lang})` : "Transcript";
      textSources.push({ id: "transcript", type: "transcript", label: langLabel, text: transcript.text, cues: transcript.cues, weight: 2.3 });
    }

    // 5) OCR best-effort (sur flux Piped/Invidious/YouTube + fallback local ytdl)
    let tmpDir = null, usedFormat = null, ocr = [], ocrCandidates = [], ocrMatches = [], ocrText = "";
    try {
      const { tmpDir: dir, files, tried } = await tryFramesAnySource({
        id, ytFormats: meta.formats, piped, invid,
        opts: { maxSeconds, fps },
        warns
      });
      tmpDir = dir; usedFormat = tried;
      ocr = await ocrFiles(files);
      ocrText = ocr.map(x => x.text).join("\n");
      ocrCandidates = extractItemCandidates(ocrText);
      ocrMatches = normalizeItems(ocrCandidates);
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

    const ocrCues = (ocr || []).map((entry, index) => {
      const seconds = fps > 0 ? Number((index / fps).toFixed(2)) : null;
      return { start: seconds, end: seconds != null ? seconds + (fps > 0 ? 1 / fps : 0) : null, text: entry.text };
    }).filter(c => c.text && c.start != null);
    if (ocrText.trim()) {
      const label = `OCR vidéo${usedFormat ? ` (${usedFormat})` : ""}`;
      textSources.push({ id: "ocr", type: "ocr", label, text: ocrText, cues: ocrCues, weight: 2.6 });
    }

    // 6) Texte consolidé pour l'analyse
    const assembled = textSources.map(src => src.text || "").filter(Boolean).join("\n");

    // 7) DofusBook + évidences
    const dofusbooks = findDofusbookLinks(assembled);
    const evidences  = gatherEvidences(textSources, 32);
    const presentationMoments = detectStuffMoments(textSources, { limit: 5 });

    // 8) Items depuis le texte (ordre : slot-cap > alias > exact > fuzzy)
    const aliasHits   = scanAliases(assembled);
    const directHits  = scanKnownItemsBySubstring(assembled);
    const slotCapHits = scanSlotNamePatterns(assembled);
    const textCand    = extractItemCandidates(assembled);
    let   matchedText = normalizeItems(textCand);
    let   matched     = dedupeByName([ ...slotCapHits, ...aliasHits, ...directHits, ...matchedText ]);

    // 9) Exos + éléments (sur TOUT le texte consolidé)
    const exos = detectExos(assembled);
    const { ordered: elements, signals: elementSignals } = inferElementsFromText(assembled);
    const klass = inferClassFromText(assembled);

    // 10) Fusion finale items (priorité OCR)
    const items = dedupeByName([
      ...(ocrMatches || []),
      ...(slotCapHits || []),
      ...(aliasHits || []),
      ...(directHits || []),
      ...(matchedText || [])
    ]).map(m => ({
      slot: m.slot, name: m.name, confidence: m.confidence,
      source: m.source || (ocrMatches.some(ocrHit => ocrHit.name === m.name) ? "ocr+fuzzy" : "text+fuzzy"),
      raw: m.raw, proof: m.proof || null
    }));

    const transcriptPublic = {
      text: transcript.text,
      length_chars: transcript.text ? transcript.text.length : 0,
      lang: transcript.lang,
      source: transcript.source,
      cues_count: transcript.cues.length,
      has_timing: transcript.cues.length > 0,
      is_translation: /tlang/i.test(`${transcript.lang || ""} ${transcript.source || ""}`),
      is_asr: /asr|auto/i.test(`${transcript.lang || ""} ${transcript.source || ""}`)
    };

    const payload = {
      video: {
        url, title: meta.title, channel: meta.channel,
        video_id: id,
        thumbnail: ytThumb(id),
        embed_url: ytEmbed(id)
      },
      sources: {
        piped: !!piped.data, invidious: !!invid.data, readable: !!readable,
        transcript_source: transcript.source, transcript_lang: transcript.lang,
        transcript_has_timing: transcriptPublic.has_timing,
        transcript_is_translation: transcriptPublic.is_translation
      },
      dofusbook_url: dofusbooks[0] || null,
      class: klass,
      element_build: elements,
      element_signals: elementSignals,
      level: null,
      items,
      exos,
      stats_synthese: {},
      evidences,
      presentation_moments: presentationMoments,
      transcript: transcriptPublic,
      explanation: null,
      debug: {
        used_format: usedFormat,
        text_candidates: textCand.length,
        ocr_frames: ocr.length,
        ocr_candidates: ocrCandidates.length,
        evidence_count: evidences.length,
        presentation_moments: presentationMoments.length,
        text_sources: textSources.length,
        warns
      }
    };

    return res.status(200).json(payload);
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    return res.status(500).json({ error: "Internal error", detail: msg.slice(0, 500) });
  }
}