// pages/api/analyze.js — V7 (captions YouTube réels + OCR sur flux Piped/Invidious quand dispo)
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
  return vttToPlain(vtt);
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
  if (!caps || !Array.isArray(caps)) return "";
  const match = caps.find(c => ((c.label || c.language || "").toLowerCase().includes((labelOrLang || "").toLowerCase())));
  if (!match) return "";
  const vtt = await fetchTEXT(match.url || match.src || "");
  return vttToPlain(vtt);
}

// ---------- Watch page lisible ----------
async function getReadableWatchPage(id) {
  return await fetchTEXT(`https://r.jina.ai/http://www.youtube.com/watch?v=${id}`);
}

// ---------- Captions helpers ----------
function vttToPlain(vtt) {
  if (!vtt) return "";
  return vtt
    .split("\n")
    .filter(line => line && !/^\d+$/.test(line) && !/-->/i.test(line) && !/^WEBVTT/i.test(line))
    .join("\n");
}
function xmlToPlain(xml) {
  if (!xml) return "";
  // Youtube timedtext XML: <text start="..." dur="...">content</text>
  // Décodage entités HTML de base
  const unescape = (s) =>
    s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  const parts = Array.from(xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)).map(m => unescape(m[1]).replace(/\n+/g, " ").trim());
  return parts.join("\n");
}

// 1) Captions via youtube-transcript
async function getCaptionsViaLib(id) {
  try {
    const { YoutubeTranscript } = await import("youtube-transcript");
    // on tente FR puis EN
    let cues = [];
    try { cues = await YoutubeTranscript.fetchTranscript(id, { lang: "fr" }); } catch {}
    if (!cues?.length) { try { cues = await YoutubeTranscript.fetchTranscript(id); } catch {} }
    if (!cues?.length) return { text: "", lang: null, source: null };
    return { text: cues.map(c => c.text).join("\n"), lang: "auto", source: "youtube-transcript" };
  } catch { return { text: "", lang: null, source: null }; }
}

// 2) Captions via ytdl player_response (baseUrl)
async function getCaptionsViaYtdlInfo(info) {
  try {
    const pr = info?.player_response || info?.playerResponse || {};
    const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    if (!tracks?.length) return { text: "", lang: null, source: null };
    // priorité FR > EN > première piste
    const order = ["fr", "fr-FR", "fr-CA", "fr-FR", "en", "en-US"];
    let chosen = null;
    for (const code of order) {
      chosen = tracks.find(t => (t.languageCode || "").toLowerCase() === code.toLowerCase());
      if (chosen) break;
    }
    if (!chosen) chosen = tracks[0];
    if (!chosen?.baseUrl) return { text: "", lang: null, source: null };
    const raw = await fetchTEXT(chosen.baseUrl);
    const text = raw.startsWith("WEBVTT") ? vttToPlain(raw) : xmlToPlain(raw);
    return { text, lang: chosen.languageCode || null, source: "ytdl-captions" };
  } catch { return { text: "", lang: null, source: null }; }
}

// 3) Captions via TimedText officiel (sans clé)
const TIMEDTEXT_TRIES = [
  { lang: "fr" }, { lang: "fr-FR" }, { lang: "fr-CA" },
  { lang: "en" }, { lang: "en-US" }, { lang: "en-GB" }
];
async function getCaptionsViaTimedText(id) {
  for (const t of TIMEDTEXT_TRIES) {
    const url = `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(t.lang)}&v=${id}&fmt=vtt`;
    const vtt = await fetchTEXT(url);
    if (vtt && vtt.length > 50) return { text: vttToPlain(vtt), lang: t.lang, source: "timedtext" };
  }
  // Essai auto-gen: caps=asr
  for (const t of TIMEDTEXT_TRIES) {
    const url = `https://www.youtube.com/api/timedtext?caps=asr&lang=${encodeURIComponent(t.lang)}&v=${id}&fmt=vtt`;
    const vtt = await fetchTEXT(url);
    if (vtt && vtt.length > 50) return { text: vttToPlain(vtt), lang: t.lang + " (asr)", source: "timedtext-asr" };
  }
  return { text: "", lang: null, source: null };
}

// ---------- Frames + OCR (avec flux Piped/Invidious en plus de YouTube) ----------
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
  // choisir mp4 360/480 si possible
  const cand = vs.filter(s => /mp4/i.test(s.container) && /360|480/i.test(s.qualityLabel || s.quality)).concat(
    vs.filter(s => /mp4/i.test(s.container))
  );
  return cand.map(s => s.url);
}
function pickStreamsFromInvidious(invData) {
  const fs = invData?.formatStreams || [];
  const cand = fs.filter(s => /mp4/i.test(s.type) && /360|480/.test(s.qualityLabel || s.quality))
                 .concat(fs.filter(s => /mp4/i.test(s.type)));
  return cand.map(s => s.url);
}

async function extractFramesFromUrl(formatUrl, { maxSeconds, fps }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "frames-"));
  const outPattern = path.join(tmpDir, "frame-%03d.jpg");
  await new Promise((resolve, reject) => {
    ffmpeg(formatUrl)
      .inputOptions([
        "-reconnect","1","-reconnect_streamed","1","-reconnect_delay_max","2",
        "-headers","User-Agent: Mozilla/5.0\r\nAccept-Language: fr-FR,fr;q=0.9\r\n"
      ])
      .outputOptions([`-t ${maxSeconds}`, `-vf fps=${fps}`])
      .on("error", reject).on("end", resolve).save(outPattern);
  });
  const files = fs.readdirSync(tmpDir).filter(f => f.endsWith(".jpg")).map(f => path.join(tmpDir, f)).sort();
  return { tmpDir, files };
}

async function tryFramesAnySource({ ytFormats, piped, invid, opts, warns }) {
  const tries = [];

  // 1) Piped direct streams
  const pipedUrls = pickStreamsFromPiped(piped?.data);
  for (const u of pipedUrls) tries.push({ src: "piped", url: u });

  // 2) Invidious direct streams
  const invUrls = pickStreamsFromInvidious(invid?.data);
  for (const u of invUrls) tries.push({ src: "invidious", url: u });

  // 3) YouTube formats (ytdl)
  for (const f of pickPreferredFormats(ytFormats || [])) {
    tries.push({ src: `youtube ${f.container} ${f.qualityLabel || ""}`.trim(), url: f.url });
  }

  let lastErr = null;
  for (const t of tries) {
    try {
      const r = await extractFramesFromUrl(t.url, opts);
      if (r.files.length > 0) return { ...r, tried: t.src };
      lastErr = new Error("No frames produced");
    } catch (e) {
      lastErr = e;
      warns.push(`extract fail ${t.src}: ${String(e).slice(0, 160)}`);
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

    // 3) Captions prioritaires (YouTube)
    let transcript = { text: "", lang: null, source: null };
    // a) youtube-transcript
    transcript = await getCaptionsViaLib(id);
    // b) ytdl player_response
    if (!transcript.text) transcript = await getCaptionsViaYtdlInfo(meta.rawInfo);
    // c) timedtext officiel
    if (!transcript.text) transcript = await getCaptionsViaTimedText(id);
    // d) Piped/Invidious
    if (!transcript.text && piped.data?.captions?.length) {
      const pref = piped.data.captions.find(c => /french/i.test(c.label)) || piped.data.captions[0];
      if (pref) transcript = { text: await getPipedCaptions(piped.host, id, pref.label), lang: pref.label, source: "piped" };
    }
    if (!transcript.text && invid.data?.captions?.length) {
      const pref = invid.data.captions.find(c => /french|fr/i.test(c.label || c.language)) || invid.data.captions[0];
      if (pref) transcript = { text: await getInvidiousCaptions(invid.host, id, pref.label || pref.language || "French"), lang: pref.label || pref.language, source: "invidious" };
    }

    // 4) Texte assemblé (titre + descriptions + readable + transcript)
    const assembled = [
      meta.title || "",
      piped.data?.description || "",
      invid.data?.description || "",
      readable || "",
      transcript.text || ""
    ].join("\n");

    // 5) DofusBook + évidences
    const dofusbooks = findDofusbookLinks(assembled);
    const evidences  = gatherEvidences(assembled, 24);

    // 6) Items depuis le texte (ordre : slot-cap > alias > exact > fuzzy)
    const aliasHits   = scanAliases(assembled);
    const directHits  = scanKnownItemsBySubstring(assembled);
    const slotCapHits = scanSlotNamePatterns(assembled);
    const textCand    = extractItemCandidates(assembled);
    let   matchedText = normalizeItems(textCand);
    let   matched     = dedupeByName([ ...slotCapHits, ...aliasHits, ...directHits, ...matchedText ]);

    // 7) Exos + éléments (sur TOUT le texte)
    const exos     = detectExos(assembled);
    const elements = inferElementsFromText(assembled); // ex: ["Terre","Eau"]
    const klass    = (/\bcr[âa]\b|(?:^|\s)cra(?:\s|$)/i.test(assembled)) ? "Cra" : null;

    // 8) OCR best-effort (sur flux Piped/Invidious/YouTube)
    let tmpDir = null, usedFormat = null, ocr = [], ocrCandidates = [], ocrMatches = [];
    try {
      const { tmpDir: dir, files, tried } = await tryFramesAnySource({
        ytFormats: meta.formats, piped, invid,
        opts: { maxSeconds, fps },
        warns
      });
      tmpDir = dir; usedFormat = tried;
      ocr = await ocrFiles(files);
      const ocrText = ocr.map(x => x.text).join("\n");
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

    // 9) Fusion finale items (priorité OCR)
    const items = dedupeByName([
      ...(ocrMatches || []),
      ...(slotCapHits || []),
      ...(aliasHits || []),
      ...(directHits || []),
      ...(matchedText || [])
    ]).map(m => ({
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
        piped: !!piped.data, invidious: !!invid.data, readable: !!readable,
        transcript_source: transcript.source, transcript_lang: transcript.lang
      },
      dofusbook_url: dofusbooks[0] || null,
      class: klass,                      // null si non vu
      element_build: elements,           // [] si non vu
      level: null,
      items,                             // [] si rien de probant
      exos,
      stats_synthese: {},
      evidences,
      transcript: {
        text: transcript.text,           // ⟵ le texte complet
        length_chars: transcript.text ? transcript.text.length : 0
      },
      explanation: null,
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