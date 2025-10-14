const stringSimilarity = require("string-similarity");
const ITEMS = require("./items.json");

// Mots clés “slot / dofus / noms connus”
const SLOT_WORDS = [
  "amulette","coiffe","cape","bottes","ceinture","anneau","arme","arc","épée","bâton","bouclier",
  "familier","monture","dofus","trophée","trophées",
  "ivoire","ébène","pourpre","turquoise","ocre","abyssal","dokoko","nomade","remueur",
  "voile","strigide","brouce","allister","séculaire","volkorne","dragodinde","prytek","kramkram","croum"
];
const STOPJUNK = ["youtube","hashtag","comments","transcript","http","https","youtu","channel","watch","play","subscribe"];

function getYouTubeId(url) {
  try {
    const m = url.match(/(?:v=|\/shorts\/|\/embed\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  } catch { return null; }
}
function ytThumb(id){ return id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : null; }
function ytEmbed(id){ return id ? `https://www.youtube.com/embed/${id}` : null; }

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

// détecte directement les noms d’items depuis le texte (n-grammes)
function scanKnownItemsBySubstring(text) {
  if (!text) return [];
  const low = text.toLowerCase();
  const hits = [];
  for (const it of ITEMS) {
    const needle = it.name.toLowerCase();
    if (low.includes(needle)) {
      hits.push({ ...it, confidence: 0.8, raw: it.name, source: "text-exact" });
    }
  }
  return dedupeByName(hits);
}

function findDofusbookLinks(text){
  if (!text) return [];
  const re = /https?:\/\/(?:www\.)?dofusbook\.net\/[^\s)]+/gi;
  return Array.from(text.matchAll(re)).map(m=>m[0]);
}

function gatherEvidences(text, limit=16){
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const hits = [];
  for (const l of lines){
    if (looksLikeItemLine(l)) hits.push(l);
    if (hits.length >= limit) break;
  }
  return hits;
}

function inferElementsFromText(str){
  const s = (str||"").toLowerCase();
  const elems = new Set();
  if (/multi/.test(s)) elems.add("Multi");
  if (/terre/.test(s)) elems.add("Terre");
  if (/eau/.test(s)) elems.add("Eau");
  if (/(air|agi)/.test(s)) elems.add("Air");
  if (/feu/.test(s)) elems.add("Feu");
  // heuristique crâ expi/pupu = Terre/Eau si rien d'autre
  if (/(expi|punitive|pupu)/.test(s) && elems.size===0) { elems.add("Terre"); elems.add("Eau"); }
  return Array.from(elems);
}

// exos: “exo pa/pm/po…”, “pa exo”, “over vita/over res”
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

// META fallback : proposition Cra Terre/Eau Expi/Pupu (si rien détecté)
function metaFallbackCraTerreEau(){
  return [
    { slot:"Amulette", name:"Amulette Séculaire", confidence:0.35, source:"meta-fallback" },
    { slot:"Coiffe",   name:"Coiffe de Strigide", confidence:0.35, source:"meta-fallback" },
    { slot:"Cape",     name:"Voile d'Encre",      confidence:0.35, source:"meta-fallback" },
    { slot:"Anneau 1", name:"Anneau de Brouce",   confidence:0.35, source:"meta-fallback" },
    { slot:"Anneau 2", name:"Anneau de Strigide", confidence:0.35, source:"meta-fallback" },
    { slot:"Ceinture", name:"Ceinture Séculaire", confidence:0.35, source:"meta-fallback" },
    { slot:"Bottes",   name:"Bottes Séculaires",  confidence:0.35, source:"meta-fallback" },
    { slot:"Arme",     name:"Arc Nécrotique",     confidence:0.35, source:"meta-fallback" },
    { slot:"Bouclier", name:"Bouclier du Cœur Saignant", confidence:0.35, source:"meta-fallback" },
    { slot:"Monture",  name:"Volkorne Terre/Eau", confidence:0.35, source:"meta-fallback" },
    { slot:"Dofus/Trophées", name:"Dofus Ivoire, Dofus Turquoise, Dofus Pourpre, Dofus Ocre, Dokoko, Nomade", confidence:0.35, source:"meta-fallback" }
  ];
}

function buildExplanation(klass, elements, items, exos){
  const e = elements && elements.length ? elements.join("/") : "indéterminé";
  return [
    `Build ${klass || "inconnu"} ${e}.`,
    `Objectif: pression à distance avec fenêtres de burst (Expiation/Punitive), PO confortable, résistances correctes.`,
    `Forces: burst élevé sur fenêtres, kiting, contrôle de la ligne de vue.`,
    `Faiblesses: maps fermées, rush tacle/érosion, dépendance au tempo.`,
    exos?.length ? `Exos détectés: ${exos.join(", ")}.` : `Exos: non détectés (à confirmer).`
  ].join(" ");
}

module.exports = {
  getYouTubeId, ytThumb, ytEmbed,
  cleanOCRText, looksLikeItemLine, fuzzyMatchItem, dedupeByName,
  scanKnownItemsBySubstring,
  findDofusbookLinks, gatherEvidences, inferElementsFromText, detectExos,
  metaFallbackCraTerreEau, buildExplanation
};