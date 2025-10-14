const stringSimilarity = require("string-similarity");
const ITEMS = require("./items.json");

// Aliases (mots usuels vus dans titres/desc/commentaires -> item canonique)
const ALIASES = [
  { key: "jahash", name: "Cape Jahash Jurgen", slot: "Cape" },
  { key: "voile", name: "Voile d'Encre", slot: "Cape" },
  { key: "coiffe de classe cra", name: "Coiffe de Classe Crâ", slot: "Coiffe" },
  { key: "coiffe classe cra", name: "Coiffe de Classe Crâ", slot: "Coiffe" },
];

const SLOT_WORDS = [
  "amulette","coiffe","cape","bottes","ceinture","anneau","arme","arc","épée","bâton","bouclier",
  "familier","monture","dofus","trophée","trophées",
  "ivoire","ébène","pourpre","turquoise","ocre","abyssal","dokoko","nomade","remueur",
  "voile","strigide","brouce","allister","séculaire","volkorne","dragodinde","prytek","kramkram","croum","jahash"
];

const STOPJUNK = [
  "youtube","hashtag","comments","commentaire","transcript","http","https","youtu","channel","watch","play",
  "search","share","subscribe","like","report","views","view","oct","sept","nov","déc","jan","févr"
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

// 1) hits exacts (substring) dans tout le texte
function scanKnownItemsBySubstring(text) {
  if (!text) return [];
  const low = text.toLowerCase();
  const hits = [];
  for (const it of ITEMS) {
    const needle = it.name.toLowerCase();
    if (low.includes(needle)) {
      hits.push({ ...it, confidence: 0.9, raw: it.name, source: "text-exact", proof: it.name });
    }
  }
  return dedupeByName(hits);
}

// 2) aliases “lexicaux” (ex: jahash -> Cape Jahash Jurgen)
function scanAliases(text) {
  if (!text) return [];
  const low = text.toLowerCase();
  const hits = [];
  for (const a of ALIASES) {
    if (low.includes(a.key)) {
      hits.push({ name: a.name, slot: a.slot, confidence: 0.88, source: "alias", proof: a.key });
    }
  }
  return dedupeByName(hits);
}

// 3) motifs slot + nom (capture à droite de “: - • …”), + variantes “slot <Nom…>”
function scanSlotNamePatterns(text){
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(s=>normalize(s)).filter(Boolean);
  const out = [];
  for (const l of lines) {
    const low = l.toLowerCase();
    if (STOPJUNK.some(j=>low.includes(j))) continue;

    // a) “Slot: Nom d’item …”
    if (looksLikeItemLine(l)) {
      const parts = l.split(/[:\-–•\u2022]/);
      let right = (parts[parts.length-1]||"").trim();
      right = right.replace(/^(niveau|lvl|exo|pa|pm|po)\s*\d*/i,"").trim();
      if (right.length >= 3 && right.length <= 120) {
        const m = fuzzyMatchItem(right);
        if (m && m.confidence >= 0.55) out.push({ ...m, source: "slot-line", proof: l });
      }
    }

    // b) “slot <suite de mots en Majuscule>” → extrait la séquence capitalisée
    const m2 = low.match(/\b(amulette|coiffe|cape|bottes|ceinture|anneau|bouclier)\s+([A-ZÉÈÀÂÇÎÔÛ][\p{L}'’\-]+(?:\s+[A-ZÉÈÀÂÇÎÔÛ][\p{L}'’\-]+){0,4})/u);
    if (m2) {
      const candidate = (m2[2] || "").trim();
      const mm = fuzzyMatchItem(candidate);
      if (mm && mm.confidence >= 0.55) out.push({ ...mm, source: "slot-cap", proof: l });
    }
  }
  return dedupeByName(out);
}

function findDofusbookLinks(text){
  if (!text) return [];
  const re = /https?:\/\/(?:www\.)?dofusbook\.net\/[^\s)]+/gi;
  return Array.from(text.matchAll(re)).map(m=>m[0]);
}

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

// éléments détectés par comptage (titre + desc + transcript)
function inferElementsFromText(allText){
  const s = (allText||"").toLowerCase();
  const counts = { Terre:0, Eau:0, Feu:0, Air:0, Multi:0 };

  // mots exacts avec frontières
  counts.Terre += (s.match(/\bterre\b/g)||[]).length;
  counts.Eau   += (s.match(/\beau\b/g)||[]).length;
  counts.Feu   += (s.match(/\bfeu\b/g)||[]).length;
  counts.Air   += (s.match(/\bair\b/g)||[]).length + (s.match(/\bagi\b/g)||[]).length;
  counts.Multi += (s.match(/\bmulti\b/g)||[]).length;

  // garde seulement ceux ≥ 1, puis on trie par fréquence
  const present = Object.entries(counts).filter(([,c])=>c>0).sort((a,b)=>b[1]-a[1]).map(([k])=>k);

  // règle anti-“Feu fantôme” : si Terre et Eau présents, n’ajoute Feu que si Feu >= 2 (répété explicitement)
  if (present.includes("Terre") && present.includes("Eau")) {
    if (counts.Feu < 2) return ["Terre","Eau"];
  }
  return present;
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
  scanKnownItemsBySubstring, scanAliases, scanSlotNamePatterns,
  findDofusbookLinks, gatherEvidences, inferElementsFromText, detectExos
};