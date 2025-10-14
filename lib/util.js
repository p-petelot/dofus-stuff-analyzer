const stringSimilarity = require("string-similarity");
const ITEMS = require("./items.json");

// Mots-clés utiles (slots + dofus/trophées + noms fréquents)
const SLOT_WORDS = [
  "amulette","coiffe","cape","bottes","ceinture","anneau","arme","arc","épée","bâton","bouclier",
  "familier","monture","dofus","trophée","trophées",
  "ivoire","ébène","pourpre","turquoise","ocre","abyssal","dokoko","nomade","remueur",
  "voile","strigide","brouce","allister","séculaire","volkorne","dragodinde","prytek","kramkram","croum","jahash"
];

const STOPJUNK = [
  "youtube","hashtag","comments","transcript","http","https","youtu","channel","watch","play",
  "search","share","subscribe","like","report"
];

function getYouTubeId(url) {
  try {
    const m = url.match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  } catch { return null; }
}

function ytThumb(id){ return id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : null; }
function ytEmbed(id){ return id ? `https://www.youtube.com/embed/${id}` : null; }

function normalize(s){ return (s||"").replace(/\u0000/g," ").replace(/\s{2,}/g," ").trim(); }

function cleanOCRText(t) {
  if (!t) return "";
  return t.replace(/\u0000/g," ").replace(/[^\p{L}\p{N}\s'’\-]/gu," ").replace(/\s{2,}/g," ").trim();
}

function looksLikeItemLine(line) {
  const l = line.toLowerCase();
  if (STOPJUNK.some(j=>l.includes(j))) return false;
  return SLOT_WORDS.some(w=>l.includes(w));
}

function fuzzyMatchItem(raw) {
  const input = raw.trim();
  if (!input) return null;
  const names = ITEMS.map(i => i.name);
  const { bestMatch } = stringSimilarity.findBestMatch(input, names);
  const idx = names.indexOf(bestMatch.target);
  if (idx === -1) return null;
  const item = ITEMS[idx];
  return { ...item, confidence: +bestMatch.rating.toFixed(3), raw };
}

function dedupeByName(arr) {
  const seen = new Set();
  return (arr||[]).filter(x=>{
    const k = (x && x.name) ? x.name.toLowerCase() : "";
    if (seen.has(k)) return false; seen.add(k); return true;
  });
}

// “hits” exacts (substring) dans tout le texte
function scanKnownItemsBySubstring(text) {
  if (!text) return [];
  const low = text.toLowerCase();
  const hits = [];
  for (const it of ITEMS) {
    const needle = it.name.toLowerCase();
    if (low.includes(needle)) {
      hits.push({ ...it, confidence: 0.85, raw: it.name, source: "text-exact" });
    }
  }
  return dedupeByName(hits);
}

// lien DofusBook
function findDofusbookLinks(text){
  if (!text) return [];
  const re = /https?:\/\/(?:www\.)?dofusbook\.net\/[^\s)]+/gi;
  return Array.from(text.matchAll(re)).map(m=>m[0]);
}

// “évidences” lisibles (lignes pertinentes)
function gatherEvidences(text, limit=24){
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(s=>normalize(s)).filter(Boolean);
  const hits = [];
  for (const l of lines){
    if (looksLikeItemLine(l)) hits.push(l);
    if (hits.length >= limit) break;
  }
  return hits;
}

// éléments détectés dans TOUT le texte (titre + description + transcript)
function inferElementsFromText(allText){
  const s = (allText||"").toLowerCase();
  const elems = [];
  // ordre : on prend ce qui est mentionné explicitement
  if (/\bterre\b/.test(s)) elems.push("Terre");
  if (/\beau\b/.test(s)) elems.push("Eau");
  if (/\bfeu\b/.test(s)) elems.push("Feu");
  if (/\bair\b/.test(s) || /\bagi\b/.test(s)) elems.push("Air");
  if (/multi/.test(s)) elems.push("Multi");
  return Array.from(new Set(elems));
}

// exos mentionnés textuellement
function detectExos(text){
  if (!text) return [];
  const out = new Set();
  const s = text.toLowerCase();
  if (/exo\s*pa|\bpa\b.*exo/.test(s)) out.add("Exo PA");
  if (/exo\s*pm|\bpm\b.*exo/.test(s)) out.add("Exo PM");
  if (/exo\s*po|\bpo\b.*exo/.test(s)) out.add("Exo PO");
  if (/over\s*(vita|vitalité)/.test(s)) out.add("Over Vita");
  if (/over\s*(res|résistances?)/.test(s)) out.add("Over Résistances");
  return Array.from(out);
}

module.exports = {
  getYouTubeId, ytThumb, ytEmbed,
  normalize, cleanOCRText, looksLikeItemLine, fuzzyMatchItem, dedupeByName,
  scanKnownItemsBySubstring,
  findDofusbookLinks, gatherEvidences, inferElementsFromText, detectExos
};