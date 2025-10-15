// pages/api/analyze.js — V7.2 (captions TimedText ++, fallback ytdl→fichier pour OCR)
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import fs from "fs";
import os from "os";

// Les miroirs publics changent souvent de configuration ou renvoient des pages HTML
// de protection (Cloudflare, pages d'attente, etc.). Afin d'éviter de brider
// l'analyse avec des erreurs bruitées, aucun miroir n'est activé par défaut ;
// l'utilisateur peut fournir les siens via les variables d'environnement.
const DEFAULT_PIPED_HOSTS = [
  "https://pipedapi.kavin.rocks",
  "https://piped.video",
  "https://piped.lunar.icu",
];

const DEFAULT_INVIDIOUS_HOSTS = [
  "https://invidious.fdn.fr",
  "https://yewtu.be",
  "https://inv.tux.pizza",
];

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

function parseHostList(raw, fallback = []) {
  const base = typeof raw === "string" && raw.trim() ? raw : "";
  const list = base
    ? base
        .split(/[\s,]+/)
        .map((h) => h.trim())
        .filter(Boolean)
    : [];
  const source = list.length ? list : fallback;
  const normalized = source
    .map((host) => host ? host.replace(/\/$/, "") : host)
    .map((host) => {
      if (!host) return host;
      if (/^https?:\/\//i.test(host)) return host;
      return `https://${host}`;
    })
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function flagDisabled(value) {
  if (!value) return false;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
}

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

function friendlyAttemptError(err) {
  if (!err) return "erreur inconnue";
  const str = typeof err === "string" ? err : err.message || String(err);
  if (/ECONNREFUSED/i.test(str)) return "connexion refusée";
  if (/(ENOTFOUND|DNS|getaddrinfo)/i.test(str)) return "hôte introuvable";
  if (/(ETIMEDOUT|timeout)/i.test(str)) return "délai dépassé";
  if (/fetch failed|Failed to fetch|network/i.test(str)) return "erreur réseau";
  if (/unexpected token\s*["'`]?<|not valid json/i.test(str)) {
    return "réponse illisible (HTML)";
  }
  if (/invalid json|json parse/i.test(str)) {
    return "réponse JSON invalide";
  }
  return str
    .replace(/^TypeError:\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/^SyntaxError:\s*/i, "")
    .trim();
}

function friendlyYtdlError(err) {
  if (!err) return "erreur inconnue";
  const str = typeof err === "string" ? err : err.message || String(err);
  if (/410/.test(str)) return "flux retiré par YouTube (HTTP 410)";
  if (/403/.test(str)) return "accès refusé par YouTube (HTTP 403)";
  if (/not enough data|premature close/i.test(str)) return "flux interrompu";
  if (/ENOTFOUND|getaddrinfo/i.test(str)) return "serveur YouTube introuvable";
  if (/signature/i.test(str)) return "signature YouTube invalide";
  return str.replace(/^Error:\s*/i, "").trim();
}

function summarizeAttempts(attempts = [], hint = null) {
  const shortHost = (value) => {
    if (!value) return "?";
    try {
      const u = new URL(value);
      return u.host || value;
    } catch {
      return value.replace(/^https?:\/\//, "");
    }
  };
  const summary = attempts
    .map((attempt) => {
      if (!attempt) return null;
      const host = shortHost(attempt.host || "?");
      if (attempt.error && attempt.status !== "invalid_json") return `${host}: ${attempt.error}`;
      if (attempt.status === "invalid_json") {
        const detail = attempt.statusText ? ` (${attempt.statusText})` : "";
        return `${host}: réponse non JSON${detail}`;
      }
      if (attempt.status === "empty") return `${host}: réponse vide`;
      if (typeof attempt.status === "number") {
        const suffix = attempt.statusText ? ` ${attempt.statusText}` : "";
        if (attempt.status === 429) {
          return `${host}: limite de requêtes (HTTP 429${suffix})`;
        }
        return `${host}: HTTP ${attempt.status}${suffix}`;
      }
      if (attempt.status) return `${host}: ${attempt.status}`;
      return `${host}: inconnu`;
    })
    .filter(Boolean)
    .join(" | ")
    .slice(0, 400);

  if (hint && summary) return `${hint} | ${summary}`;
  if (hint) return hint;
  return summary;
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
  const attempts = [];
  if (flagDisabled(process.env.DISABLE_PIPED)) {
    return { host: null, data: null, status: "disabled", attempts, hint: "Désactivé via DISABLE_PIPED=1" };
  }

  const hosts = parseHostList(process.env.PIPED_HOSTS, DEFAULT_PIPED_HOSTS);
  if (!hosts.length) {
    return {
      host: null,
      data: null,
      status: "disabled",
      attempts,
      hint: "Aucun miroir Piped configuré. Ajoute PIPED_HOSTS=mon.instance pour activer ce flux.",
    };
  }

  for (const h of hosts) {
    try {
      const res = await fetch(`${h}/api/v1/video/${id}`, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        attempts.push({ host: h, status: res.status, statusText: res.statusText || null });
        continue;
      }
      const body = await res.text();
      let v;
      try {
        v = JSON.parse(body);
      } catch {
        const contentType = (res.headers.get("content-type") || "").split(";")[0] || null;
        const reason = contentType && /html/i.test(contentType)
          ? "réponse HTML inattendue"
          : "réponse non JSON";
        attempts.push({ host: h, error: contentType ? `${reason} (${contentType})` : reason, status: "invalid_json", statusText: contentType });
        continue;
      }
      if (v && (v.description || v.captions?.length || v.videoStreams?.length)) {
        return { host: h, data: v, status: "ok", attempts };
      }
      attempts.push({ host: h, status: "empty" });
    } catch (err) {
      attempts.push({ host: h, error: friendlyAttemptError(err) });
    }
  }
  const hint = attempts.length
    ? "Configure ton propre miroir via PIPED_HOSTS ou masque ce flux avec DISABLE_PIPED=1."
    : null;
  return { host: null, data: null, status: "failed", attempts, hint };
}
async function getPipedCaptions(host, id, label) {
  const url = `${host}/api/v1/captions/${id}?label=${encodeURIComponent(label)}`;
  const vtt = await fetchTEXT(url);
  return parseCaptionRaw(vtt, "vtt");
}

async function getInvidiousVideo(id) {
  const attempts = [];
  if (flagDisabled(process.env.DISABLE_INVIDIOUS)) {
    return { host: null, data: null, status: "disabled", attempts, hint: "Désactivé via DISABLE_INVIDIOUS=1" };
  }

  const hosts = parseHostList(process.env.INVIDIOUS_HOSTS, DEFAULT_INVIDIOUS_HOSTS);
  if (!hosts.length) {
    return {
      host: null,
      data: null,
      status: "disabled",
      attempts,
      hint: "Aucun miroir Invidious configuré. Défini INVIDIOUS_HOSTS=... pour l'activer.",
    };
  }

  for (const h of hosts) {
    try {
      const res = await fetch(`${h}/api/v1/videos/${id}`, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        attempts.push({ host: h, status: res.status, statusText: res.statusText || null });
        continue;
      }
      const body = await res.text();
      let v;
      try {
        v = JSON.parse(body);
      } catch {
        const contentType = (res.headers.get("content-type") || "").split(";")[0] || null;
        const reason = contentType && /html/i.test(contentType)
          ? "réponse HTML inattendue"
          : "réponse non JSON";
        attempts.push({ host: h, error: contentType ? `${reason} (${contentType})` : reason, status: "invalid_json", statusText: contentType });
        continue;
      }
      if (v && (v.description || v.captions?.length || v.formatStreams?.length)) {
        return { host: h, data: v, status: "ok", attempts };
      }
      attempts.push({ host: h, status: "empty" });
    } catch (err) {
      attempts.push({ host: h, error: friendlyAttemptError(err) });
    }
  }
  const hint = attempts.length
    ? "Installe ton instance Invidious (INVIDIOUS_HOSTS) ou cache ce test via DISABLE_INVIDIOUS=1."
    : null;
  return { host: null, data: null, status: "failed", attempts, hint };
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
  const url = `https://r.jina.ai/http://www.youtube.com/watch?v=${id}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) {
      return { ok: false, text: "", status: res.status, statusText: res.statusText || null, url };
    }
    const text = await res.text();
    return { ok: !!text, text, status: "ok", url };
  } catch (err) {
    return { ok: false, text: "", error: String(err), url };
  }
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

  const baseOptions = {
    filter: "audioandvideo",
    highWaterMark: 1 << 25,
    requestOptions: {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "fr-FR,fr;q=0.9",
      },
    },
  };

  const strategies = [
    { label: "itag18", options: { quality: 18 } },
    { label: "itag22", options: { quality: 22 } },
    { label: "progressive-lowest", options: { quality: "lowest" } },
    { label: "progressive-highest", options: { quality: "highest" } },
  ];

  const attemptDownload = (options) => {
    return new Promise((resolve, reject) => {
      let fileStream = null;
      let stream = null;
      const cleanup = (err) => {
        try {
          if (stream) {
            stream.removeAllListeners();
            stream.destroy();
          }
        } catch {}
        try {
          if (fileStream) {
            fileStream.removeAllListeners();
            fileStream.destroy();
          }
        } catch {}
        try { fs.rmSync(tmpFile, { force: true }); } catch {}
        reject(err);
      };
      try {
        fileStream = fs.createWriteStream(tmpFile);
        stream = ytdl(url, options);
      } catch (err) {
        cleanup(err);
        return;
      }
      stream.on("error", cleanup);
      fileStream.on("error", cleanup);
      fileStream.on("finish", () => {
        try {
          if (stream) stream.removeListener("error", cleanup);
          if (fileStream) fileStream.removeListener("error", cleanup);
        } catch {}
        resolve();
      });
      stream.pipe(fileStream);
    });
  };

  let lastError = null;
  for (const strat of strategies) {
    try {
      try { fs.rmSync(tmpFile, { force: true }); } catch {}
      await attemptDownload({ ...baseOptions, ...strat.options });
      const stats = fs.existsSync(tmpFile) ? fs.statSync(tmpFile) : null;
      if (stats && stats.size > 128 * 1024) {
        return { tmpDir, tmpFile, strategy: strat.label };
      }
    } catch (err) {
      lastError = err;
    }
  }

  try {
    const info = await ytdl.getInfo(url);
    const progressive = (info.formats || [])
      .filter((f) => f.hasVideo && f.hasAudio && f.isHLS === false && f.isDashMPD === false)
      .sort((a, b) => (Number(a.contentLength || 0) || 0) - (Number(b.contentLength || 0) || 0));

    for (const format of progressive.slice(0, 6)) {
      try {
        try { fs.rmSync(tmpFile, { force: true }); } catch {}
        await attemptDownload({ ...baseOptions, format });
        const stats = fs.existsSync(tmpFile) ? fs.statSync(tmpFile) : null;
        if (stats && stats.size > 128 * 1024) {
          return { tmpDir, tmpFile, strategy: `format-${format.itag}` };
        }
      } catch (err) {
        lastError = err;
      }
    }
  } catch (err) {
    lastError = err;
  }

  throw lastError || new Error("Aucun flux progressif YouTube disponible");
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
      const reason = t.mode === "local" ? friendlyYtdlError(e) : friendlyAttemptError(e);
      warns.push(`Extraction vidéo (${t.src}) impossible : ${reason}`);
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
  const fuzzy = (candidates || [])
    .map((candidate) => {
      const match = fuzzyMatchItem(candidate);
      if (!match || match.confidence < 0.5) return null;
      return {
        ...match,
        source: match.source || "texte flou",
        proof: match.proof || candidate,
      };
    })
    .filter(Boolean);
  fuzzy.sort((a, b) => b.confidence - a.confidence);
  return dedupeByName(fuzzy).slice(0, 25);
}

function collectTextMatches(text) {
  if (!text) return [];
  const aliasHits = scanAliases(text);
  const directHits = scanKnownItemsBySubstring(text);
  const slotCapHits = scanSlotNamePatterns(text);
  const textCand = extractItemCandidates(text);
  const matchedText = normalizeItems(textCand);
  return dedupeByName([
    ...(slotCapHits || []),
    ...(aliasHits || []),
    ...(directHits || []),
    ...(matchedText || []),
  ]);
}

function shapeItems(matches = [], { fallbackSource = "texte" } = {}) {
  return dedupeByName(matches)
    .map((m) => ({
      slot: m.slot,
      name: m.name,
      confidence: typeof m.confidence === "number" ? m.confidence : 0.5,
      source: m.source || fallbackSource,
      raw: m.raw,
      proof: m.proof || null,
    }))
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

function collectContextWindow(sources = [], seconds, window = 14) {
  if (!Array.isArray(sources) || typeof seconds !== "number") return "";
  const start = Math.max(0, seconds - window / 2);
  const end = seconds + window / 2;
  const lines = [];
  for (const source of sources) {
    const cues = Array.isArray(source?.cues) ? source.cues : [];
    for (const cue of cues) {
      const cueStart = typeof cue.start === "number" ? cue.start : null;
      if (cueStart == null) continue;
      if (cueStart >= start && cueStart <= end) {
        const text = normalize(cue.text || "");
        if (text) lines.push(text);
      }
    }
  }
  return lines.join("\n");
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
    const piped = await getPipedVideo(id);
    const invid = await getInvidiousVideo(id);
    const pipedSummary = summarizeAttempts(piped.attempts, piped.hint) || null;
    const invidSummary = summarizeAttempts(invid.attempts, invid.hint) || null;
    const readableSummary = readable.ok
      ? null
      : readable.error
      ? readable.error
      : readable.status
      ? `HTTP ${readable.status}${readable.statusText ? ` ${readable.statusText}` : ""}`
      : null;
    if (!piped.data && pipedSummary && piped.status !== "disabled") {
      warns.push(`Piped KO: ${pipedSummary}`);
    }
    if (!invid.data && invidSummary && invid.status !== "disabled") {
      warns.push(`Invidious KO: ${invidSummary}`);
    }
    if (!readable.ok && readableSummary) {
      warns.push(`Readable KO: ${readableSummary}`);
    }
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
    if (readable.text) {
      textSources.push({ id: "readable", type: "readable", label: "Page YouTube lisible", text: readable.text, weight: 0.8 });
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
      const reason = friendlyYtdlError(e);
      warns.push(`OCR désactivé : ${reason}`);
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
    const dofusbooks = Array.from(new Set(findDofusbookLinks(assembled)));
    const evidences  = gatherEvidences(textSources, 32);
    const presentationMoments = detectStuffMoments(textSources, { limit: 5 });

    // 8) Items depuis le texte (ordre : slot-cap > alias > exact > fuzzy)
    const aliasHits   = scanAliases(assembled);
    const directHits  = scanKnownItemsBySubstring(assembled);
    const slotCapHits = scanSlotNamePatterns(assembled);
    const textCand    = extractItemCandidates(assembled);
    const matchedText = normalizeItems(textCand);
    const textMatches = dedupeByName([
      ...(slotCapHits || []),
      ...(aliasHits || []),
      ...(directHits || []),
      ...(matchedText || []),
    ]);

    // 9) Exos + éléments (sur TOUT le texte consolidé)
    const exos = detectExos(assembled);
    const { ordered: elements, signals: elementSignals } = inferElementsFromText(assembled);
    const klass = inferClassFromText(assembled);

    // 10) Fusion finale items (priorité OCR)
    const aggregateMatches = dedupeByName([
      ...(ocrMatches || []),
      ...(textMatches || []),
    ]);
    const items = shapeItems(aggregateMatches, { fallbackSource: "texte" });

    const stuffSets = [];
    const seenSignatures = new Set();
    const makeSignature = (collection = []) =>
      collection
        .map((item) => (item?.name || "").toLowerCase())
        .filter(Boolean)
        .sort()
        .join("|");

    const pushStuffSet = (entry) => {
      if (!entry || !Array.isArray(entry.items) || !entry.items.length) return;
      const signature = makeSignature(entry.items);
      if (!signature) return;
      if (seenSignatures.has(signature)) return;
      seenSignatures.add(signature);
      stuffSets.push({
        ...entry,
        items: entry.items,
        item_count: entry.items.length,
      });
    };

    pushStuffSet({
      id: "aggregate",
      label: "Synthèse générale",
      origin: "aggregate",
      source: "Transcript + OCR",
      note: "Combinaison de toutes les sources textuelles",
      timestamp: null,
      items,
    });

    presentationMoments.slice(0, 6).forEach((moment, idx) => {
      if (!moment || typeof moment.seconds !== "number") return;
      let windowText = collectContextWindow(textSources, moment.seconds, 18);
      if (moment.text && (!windowText || windowText.toLowerCase().indexOf(moment.text.toLowerCase()) === -1)) {
        windowText = `${moment.text}\n${windowText || ""}`.trim();
      }
      if (!windowText) return;
      const matches = collectTextMatches(windowText);
      if (!matches.length) return;
      const shaped = shapeItems(matches, { fallbackSource: moment.source || "Transcript" });
      if (shaped.length < 2) return;
      pushStuffSet({
        id: `moment-${idx}`,
        label: moment.timestamp ? `Moment ${moment.timestamp}` : `Moment ${idx + 1}`,
        origin: "moment",
        source: moment.source || "Transcript",
        timestamp: moment.timestamp || null,
        seconds: moment.seconds,
        note: "Sélection autour de ce passage",
        context_excerpt: windowText.slice(0, 400),
        items: shaped,
      });
    });

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
        piped: !!piped.data, invidious: !!invid.data, readable: !!readable.text,
        piped_host: piped.host,
        piped_status: piped.status || (piped.data ? "ok" : piped.attempts?.length ? "failed" : null),
        piped_note: pipedSummary,
        piped_hint: piped.hint || null,
        piped_attempts: Array.isArray(piped.attempts) ? piped.attempts.length : 0,
        invidious_host: invid.host,
        invidious_status: invid.status || (invid.data ? "ok" : invid.attempts?.length ? "failed" : null),
        invidious_note: invidSummary,
        invidious_hint: invid.hint || null,
        invidious_attempts: Array.isArray(invid.attempts) ? invid.attempts.length : 0,
        readable_status: readable.ok ? "ok" : "failed",
        readable_note: readableSummary,
        readable_url: readable.url,
        transcript_source: transcript.source, transcript_lang: transcript.lang,
        transcript_has_timing: transcriptPublic.has_timing,
        transcript_is_translation: transcriptPublic.is_translation
      },
      dofusbook_url: dofusbooks[0] || null,
      dofusbook_urls: dofusbooks,
      class: klass,
      element_build: elements,
      element_signals: elementSignals,
      level: null,
      items,
      stuffs: stuffSets,
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
        aggregate_items: items.length,
        stuff_sets: stuffSets.length,
        warns,
        piped_attempts: piped.attempts || [],
        invidious_attempts: invid.attempts || [],
        readable_status: {
          ok: readable.ok,
          status: readable.status || null,
          statusText: readable.statusText || null,
          error: readable.error || null
        }
      }
    };

    return res.status(200).json(payload);
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    return res.status(500).json({ error: "Internal error", detail: msg.slice(0, 500) });
  }
}