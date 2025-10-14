// pages/api/analyze.js
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import fs from "fs";
import os from "os";

const {
  getYouTubeId, ytThumb, ytEmbed,
  normalize, cleanOCRText, looksLikeItemLine, fuzzyMatchItem, dedupeByName,
  scanKnownItemsBySubstring,
  findDofusbookLinks, gatherEvidences, inferElementsFromText, detectExos
} = require("../../lib/util");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
export const config = { runtime: "nodejs", api: { bodyParser: false } };

// ---------------- fetch helpers ----------------
async function fetchJSON(url){
  try{ const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}}); return r.ok?await r.json():null }catch{ return null }
}
async function fetchTEXT(url){
  try{ const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}}); return r.ok?await r.text():"" }catch{ return "" }
}

// ---------------- meta/providers ----------------
async function getMeta(url){
  try{
    const info = await ytdl.getInfo(url);
    return {
      title: info.videoDetails.title || null,
      channel: info.videoDetails.author?.name || null,
      lengthSeconds: Number(info.videoDetails.lengthSeconds || 0),
      formats: info.formats || []
    };
  }catch{
    const j = await fetchJSON(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    return { title: j?.title ?? null, channel: j?.author_name ?? null, lengthSeconds: 0, formats: [] };
  }
}

// Piped API : description + captions (sans clé)
async function getPipedVideo(id){
  // plusieurs miroirs; on essaie 2-3 hôtes
  const hosts = ["https://piped.video","https://piped.videoapi.fr","https://piped.minionflo.net"];
  for (const h of hosts){
    const v = await fetchJSON(`${h}/api/v1/video/${id}`);
    if (v && (v.description || v.captions?.length)) return { host:h, data:v };
  }
  return { host:null, data:null };
}
async function getPipedCaptions(host,id,label){
  // /api/v1/captions/{id}?label=French (ou English)
  const url = `${host}/api/v1/captions/${id}?label=${encodeURIComponent(label)}`;
  const vtt = await fetchTEXT(url);
  if (!vtt) return "";
  // VTT → texte simple
  return vtt
    .split("\n")
    .filter(line => line && !/^\d+$/.test(line) && !/-->/i.test(line) && !/^WEBVTT/i.test(line))
    .join("\n");
}

// Invidious API (fallback similaire à Piped)
async function getInvidiousVideo(id){
  const hosts = ["https://yewtu.be","https://invidious.fdn.fr","https://vid.puffyan.us"];
  for (const h of hosts){
    const v = await fetchJSON(`${h}/api/v1/videos/${id}`);
    if (v && (v.description || v.captions?.length)) return { host:h, data:v };
  }
  return { host:null, data:null };
}
async function getInvidiousCaptions(host,id,label){
  // /api/v1/captions/:id?label=French  → retourne des pistes; certaines instances demandent un download_url
  const caps = await fetchJSON(`${host}/api/v1/captions/${id}`);
  if (!caps || !Array.isArray(caps)) return "";
  const match = caps.find(c => (c.label||"").toLowerCase().includes(label.toLowerCase()));
  if (!match) return "";
  const vtt = await fetchTEXT(match.url || match.src || "");
  return vtt
    .split("\n")
    .filter(line => line && !/^\d+$/.test(line) && !/-->/i.test(line) && !/^WEBVTT/i.test(line))
    .join("\n");
}

// Watch page “lisible”
async function getReadableWatchPage(id){
  // souvent contient TOUTE la description (et les hashtags)
  return await fetchTEXT(`https://r.jina.ai/http://www.youtube.com/watch?v=${id}`);
}

// ---------------- frames + OCR (best-effort) ----------------
function pickPreferredFormats(formats){
  if (!Array.isArray(formats)) return [];
  const mp4Low = formats.filter(f=>f.hasVideo&&f.hasAudio&&f.container==="mp4"&&(f.qualityLabel==="360p"||f.qualityLabel==="480p"));
  const mp4Any = formats.filter(f=>f.hasVideo&&f.hasAudio&&f.container==="mp4");
  const webmAny= formats.filter(f=>f.hasVideo&&f.hasAudio&&f.container==="webm");
  const seen=new Set();
  return [...mp4Low,...mp4Any,...webmAny].filter(f=>{
    if (!f?.url) return false;
    const k=`${f.container}-${f.qualityLabel}-${f.itag}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  }).slice(0,6);
}
async function extractFramesFromUrl(formatUrl,{maxSeconds,fps}){
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(),"frames-"));
  const outPattern = path.join(tmpDir,"frame-%03d.jpg");
  await new Promise((resolve,reject)=>{
    ffmpeg(formatUrl)
      .inputOptions([
        "-reconnect","1","-reconnect_streamed","1","-reconnect_delay_max","2",
        "-headers","User-Agent: Mozilla/5.0\r\nAccept-Language: fr-FR,fr;q=0.9\r\n"
      ])
      .outputOptions([`-t ${maxSeconds}`,`-vf fps=${fps}`])
      .on("error",reject).on("end",resolve).save(outPattern);
  });
  const files = fs.readdirSync(tmpDir).filter(f=>f.endsWith(".jpg")).map(f=>path.join(tmpDir,f)).sort();
  return { tmpDir, files };
}
async function tryFrames(formats,opts,warns){
  let lastErr=null;
  for (const f of pickPreferredFormats(formats)){
    try{
      const r = await extractFramesFromUrl(f.url,opts);
      if (r.files.length>0) return { ...r, tried:`${f.container} ${f.qualityLabel||""}`.trim() };
      lastErr=new Error("No frames produced");
    }catch(e){
      lastErr=e; warns.push(`extract fail ${f.container}/${f.qualityLabel||"?"}: ${String(e).slice(0,100)}`);
    }
  }
  if (lastErr) throw lastErr;
  throw new Error("No suitable format");
}
// OCR dynamic
let _tess=null;
async function getTesseract(){ if (_tess) return _tess; const mod = await import("tesseract.js"); _tess=mod; return _tess; }
async function ensureOCR(lang="eng+fra"){ const { createWorker } = await getTesseract(); const worker = await createWorker(); await worker.load(); await worker.loadLanguage(lang); await worker.initialize(lang); return worker; }
async function ocrFiles(files){
  const worker = await ensureOCR();
  const out=[];
  for (const f of files){ const { data } = await worker.recognize(f); out.push({ file:path.basename(f), text: cleanOCRText(data.text) }); }
  await worker.terminate(); return out;
}

// ---------------- items parsing ----------------
function extractItemCandidates(textPool){
  const lines=(textPool||"").split(/\r?\n/).map(s=>normalize(s)).filter(Boolean);
  const cand=[];
  for (const l of lines){
    if (!looksLikeItemLine(l)) continue;
    const parts = l.split(/[:\-–•\u2022]/);
    const right = (parts[parts.length-1]||"").trim();
    if (right.length>=3 && right.length<=120) cand.push(right);
  }
  return cand;
}
function normalizeItems(candidates){
  const fuzzy = (candidates||[]).map(c=>fuzzyMatchItem(c)).filter(Boolean).filter(m=>m.confidence>=0.5);
  fuzzy.sort((a,b)=>b.confidence-a.confidence);
  return dedupeByName(fuzzy).slice(0,25);
}

// ---------------- handler ----------------
export default async function handler(req,res){
  if (req.method!=="GET") return res.status(405).json({ error:"Method Not Allowed" });
  const url = req.query.url;
  if (!url) return res.status(400).json({ error:"Missing ?url=" });

  const warns=[];
  const id = getYouTubeId(url);
  if (!id) return res.status(400).json({ error:"Invalid YouTube URL" });

  // 1) meta
  const meta = await getMeta(url);
  const maxSeconds = Math.min(540, meta.lengthSeconds||480);
  const fps = 0.5;

  // 2) sources textuelles fiables (sans clé)
  const readable = await getReadableWatchPage(id); // r.jina.ai (souvent inclut la description complète)
  const piped = await getPipedVideo(id);          // description + liste des captions (si dispo)
  const invid = await getInvidiousVideo(id);      // autre miroir

  // Captions : essaye French/English via Piped puis Invidious
  let captionsText = "";
  if (piped.data?.captions?.length){
    const pref = piped.data.captions.find(c=>/french/i.test(c.label)) || piped.data.captions[0];
    if (pref) captionsText = await getPipedCaptions(piped.host, id, pref.label);
  }
  if (!captionsText && invid.data?.captions?.length){
    const pref = invid.data.captions.find(c=>/french|fr/i.test(c.label||c.language)) || invid.data.captions[0];
    if (pref) captionsText = await getInvidiousCaptions(invid.host, id, pref.label || pref.language || "French");
  }

  // Texte assemblé (titre + descriptions + captions)
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

  // 4) items par texte (sans OCR)
 // 4) items par texte (sans OCR) — alias + substrings + motifs slot+nom
  const aliasHits   = scanAliases(assembled);
  const directHits  = scanKnownItemsBySubstring(assembled);
  const textCand    = extractItemCandidates(assembled);   // (garde ta fonction existante)
  let   matchedText = normalizeItems(textCand);
  const slotCapHits = scanSlotNamePatterns(assembled);

  // priorité : slotCap > alias > direct > fuzzy
  let matched = dedupeByName([
    ...slotCapHits, 
    ...aliasHits, 
    ...directHits, 
    ...matchedText
  ]);

  // 5) exos + éléments sur TOUT le texte (pas juste le titre)
  const exos = detectExos(assembled);
    // éléments basés sur TOUT le texte (et non le titre seul)
  const elements = inferElementsFromText(assembled);

  // classe uniquement si mention EXPRESSE (cra/crâ)
  const klass = /\bcr[âa]\b|(?:^|\s)cra(?:\s|$)/i.test(assembled) ? "Cra" : null;

  // 6) OCR best-effort (non bloquant, et seulement si on a des formats)
  let tmpDir=null, usedFormat=null, ocr=[], ocrCandidates=[], ocrMatches=[];
  try{
    if (meta.formats && meta.formats.length){
      const { tmpDir:dir, files, tried } = await tryFrames(meta.formats,{maxSeconds,fps},warns);
      tmpDir=dir; usedFormat=tried;
      ocr = await ocrFiles(files);
      const ocrText = ocr.map(x=>x.text).join("\n");
      ocrCandidates = extractItemCandidates(ocrText);
      ocrMatches = normalizeItems(ocrCandidates);
    } else {
      warns.push("No formats from ytdl; OCR skipped.");
    }
  }catch(e){
    warns.push(`OCR disabled: ${String(e)}`);
  }finally{
    try{
      if (tmpDir && fs.existsSync(tmpDir)){
        for (const f of fs.readdirSync(tmpDir)) fs.unlinkSync(path.join(tmpDir,f));
        fs.rmdirSync(tmpDir);
      }
    }catch{}
  }

  // fusionne les items (priorité OCR > texte exact > fuzzy texte)
  const items = dedupeByName([ ...(ocrMatches||[]), ...(directHits||[]), ...(matched||[]) ]);

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
    class: klass,                          // NULL si non trouvée
    element_build: elements,               // liste exacte depuis le texte (ex: ["Terre","Eau"])
    level: null,
    items: matched.map(m=>({
      slot: m.slot, name: m.name, confidence: m.confidence,
      source: m.source || "text+fuzzy",
      raw: m.raw,
      proof: m.proof || null
    })),                                  // peut être vide si rien trouvé
    exos,                                   // peut être vide
    stats_synthese: {},
    evidences,                              // lignes pertinentes pour que tu voies la preuve
    explanation: null,                      // (on ne rédige pas si pas de preuves)
    debug: {
      used_format: usedFormat,
      text_candidates: textCandidates.length,
      ocr_frames: ocr.length,
      ocr_candidates: ocrCandidates.length,
      warns
    }
  };

  return res.status(200).json(payload);
}