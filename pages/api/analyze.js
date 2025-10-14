// pages/api/analyze.js
import ytdl from "ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import path from "path";
import fs from "fs";
import os from "os";

const {
  getYouTubeId, ytThumb, ytEmbed,
  cleanOCRText, looksLikeItemLine, fuzzyMatchItem, dedupeByName,
  scanKnownItemsBySubstring,
  findDofusbookLinks, gatherEvidences, inferElementsFromText, detectExos,
  metaFallbackCraTerreEau, buildExplanation
} = require("../../lib/util");

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
export const config = { runtime: "nodejs", api: { bodyParser: false } };

// fetch helpers
async function fetchJSON(url){ try{ const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}}); return r.ok?await r.json():null }catch{ return null } }
async function fetchTEXT(url){ try{ const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}}); return r.ok?await r.text():"" }catch{ return "" } }

// meta
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
async function getTranscript(videoId){
  try{
    const { YoutubeTranscript } = await import("youtube-transcript");
    let cues=[]; try{ cues = await YoutubeTranscript.fetchTranscript(videoId,{lang:'fr'});}catch{}
    if (!cues || !cues.length){ try{ cues = await YoutubeTranscript.fetchTranscript(videoId);}catch{} }
    return (cues||[]).map(c=>c.text).join("\n");
  }catch{ return "" }
}
async function getWatchText(videoId){
  return await fetchTEXT(`https://r.jina.ai/http://www.youtube.com/watch?v=${videoId}`);
}

// frames extract (with retries)
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

// OCR (dynamic import)
let _tess=null;
async function getTesseract(){ if (_tess) return _tess; const mod = await import("tesseract.js"); _tess=mod; return _tess; }
async function ensureOCR(lang="eng+fra"){ const { createWorker } = await getTesseract(); const worker = await createWorker(); await worker.load(); await worker.loadLanguage(lang); await worker.initialize(lang); return worker; }
async function ocrFiles(files){
  const worker = await ensureOCR();
  const out=[];
  for (const f of files){ const { data } = await worker.recognize(f); out.push({ file:path.basename(f), text: cleanOCRText(data.text) }); }
  await worker.terminate(); return out;
}

// items parsing
function extractItemCandidates(textPool){
  const lines=(textPool||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
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
  // 1) fuzzy sur candidats
  const fuzzy =
    (candidates||[]).map(c=>fuzzyMatchItem(c)).filter(Boolean).filter(m=>m.confidence>=0.45);
  // 2) matches “exacts” par substring sur tout le pool
  return dedupeByName(fuzzy).slice(0,25);
}

export default async function handler(req,res){
  if (req.method!=="GET") return res.status(405).json({ error:"Method Not Allowed" });
  const url = req.query.url;
  if (!url) return res.status(400).json({ error:"Missing ?url=" });

  const warns=[];
  const videoId = getYouTubeId(url);
  if (!videoId) return res.status(400).json({ error:"Invalid YouTube URL" });

  // meta
  const meta = await getMeta(url);
  const maxSeconds = Math.min(540, meta.lengthSeconds||480);
  const fps = 0.5;

  // frames + OCR (best-effort)
  let tmpDir=null, ocr=[], usedFormat=null;
  try{
    if (meta.formats && meta.formats.length){
      const { tmpDir:dir, files, tried } = await tryFrames(meta.formats,{maxSeconds,fps},warns);
      tmpDir=dir; usedFormat=tried; ocr = await ocrFiles(files);
    } else {
      warns.push("No formats from ytdl; skipping OCR.");
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

  // textual sources
  const watchText = await getWatchText(videoId);
  const transcript = await getTranscript(videoId);
  const assembled = [meta.title||"", watchText||"", transcript||""].join("\n");

  // direct item hits (substring) + candidates par lignes
  const directHits = scanKnownItemsBySubstring(assembled);
  const textPool = ocr.length ? ocr.map(x=>x.text).join("\n") : assembled;
  const rawCandidates = extractItemCandidates(textPool);

  let matched = normalizeItems(rawCandidates);
  // fusionne les hits directs (priorité)
  matched = dedupeByName([ ...directHits, ...matched ]);

  const dofusbooks = findDofusbookLinks(assembled);
  const evidences = gatherEvidences(assembled, 20);
  const exos = detectExos(assembled);

  // class/elements
  let elements = inferElementsFromText(meta.title);
  if (/(expi|punitive|pupu)/i.test(meta.title||"") && (!elements.length || elements.includes("Air"))) {
    // force Cra Terre/Eau si rien d’explicite
    const explicit = inferElementsFromText(meta.title).filter(e=>e!=="Multi");
    if (explicit.length===0){ elements=["Terre","Eau"]; }
  }
  const klass = /cr(a|â)/i.test(meta.title||"") ? "Cra" : null;

  // META fallback s’il n’y a AUCUN item fiable (ni OCR ni texte)
  if (!matched.length && klass==="Cra" && elements.join("/")==="Terre/Eau") {
    matched = metaFallbackCraTerreEau();
    warns.push("Using meta-fallback: Cra Terre/Eau expi/pupu.");
  }

  const explanation = buildExplanation(klass, elements, matched, exos);

  const payload = {
    video: {
      url, title: meta.title, channel: meta.channel,
      video_id: videoId,
      thumbnail: ytThumb(videoId),
      embed_url: ytEmbed(videoId)
    },
    dofusbook_url: dofusbooks[0] || null,
    class: klass,
    element_build: elements,
    level: null,
    items: matched.map(m=>({
      slot: m.slot, name: m.name, confidence: m.confidence ?? 0.35,
      source: m.source || (ocr.length?"ocr+fuzzy":"text+fuzzy"), raw: m.raw || m.name
    })),
    exos,
    stats_synthese: {},
    evidences,
    explanation,
    debug: {
      used_format: usedFormat,
      ocr_frames: ocr.length,
      text_candidates_count: rawCandidates.length,
      direct_hits: directHits.map(x=>x.name),
      warns
    }
  };

  return res.status(200).json(payload);
}