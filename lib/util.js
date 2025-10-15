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
  "search","share","subscribe","like","report","views","view","oct","sept","nov","déc","jan","févr",
  "chapters","chapitre","timestamps","discord","tiktok","twitter","instagram"
];

const STUFF_KEYWORDS = [
  "stuff","panoplie","équipement","equipement","build","mode","inventaire","gear","stuff pvp","stuff pvm",
  "full terre","full feu","full eau","full air"
];

const CLASS_PATTERNS = [
  { name: "Crâ", patterns: [/\bcr[âa]\b/, /cra\s+200/] , boost: 2 },
  { name: "Iop", patterns: [/\biop\b/] },
  { name: "Ecaflip", patterns: [/\beca\b/, /ecaflip/] },
  { name: "Sacrieur", patterns: [/sacrieur/, /\bsacri\b/] },
  { name: "Eniripsa", patterns: [/eniripsa/, /\beni\b\s*support/] },
  { name: "Féca", patterns: [/f[ée]ca/, /\bfeca\b/] },
  { name: "Sram", patterns: [/\bsram\b/] },
  { name: "Xélor", patterns: [/x[ée]lor/, /\bxel\b/] },
  { name: "Enutrof", patterns: [/enutrof/, /\benu\b/] },
  { name: "Pandawa", patterns: [/pandawa/, /\bpanda\b/] },
  { name: "Roublard", patterns: [/roublard/, /\broub\b/] },
  { name: "Steamer", patterns: [/steamer/, /\bsteam\b/] },
  { name: "Huppermage", patterns: [/huppermage/, /\bhupper\b/] },
  { name: "Osamodas", patterns: [/osamodas/, /\bosa\b/] },
  { name: "Sadida", patterns: [/sadida/, /\bsadi\b/] },
  { name: "Eliotrope", patterns: [/eliotrope/, /\belio\b/] },
  { name: "Ouginak", patterns: [/ouginak/, /\bougi\b/] },
  { name: "Zobal", patterns: [/zobal/, /\bzo\b\s*mode/] },
  { name: "Forgelance", patterns: [/forgelance/, /\bforge\b\s*lance/] }
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
  const re = /https?:\/\/(?:www\.)?(?:dofusbook\.net|d-bk\.net)\/[^\s)]+/gi;
  return Array.from(text.matchAll(re)).map((m)=>{
    const raw = m[0];
    return raw.replace(/https?:\/\/(?:www\.)?d-bk\.net/i, (match)=>{
      const protocol = match.startsWith("http://") ? "http://" : "https://";
      return `${protocol}dofusbook.net`;
    });
  });
}

function hasStuffKeyword(line) {
  const low = line.toLowerCase();
  return STUFF_KEYWORDS.some((k) => low.includes(k));
}

function formatTimestamp(seconds) {
  if (typeof seconds !== "number" || Number.isNaN(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = `${m}`.padStart(h > 0 ? 2 : 1, "0");
  const ss = `${s}`.padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function gatherEvidences(sources = [], limit = 24) {
  if (!Array.isArray(sources) || !sources.length) return [];
  const hits = [];
  const seen = new Set();

  const toChunks = (source) => {
    if (Array.isArray(source.cues) && source.cues.length) {
      return source.cues.map((cue) => ({
        text: normalize(cue.text),
        seconds: typeof cue.start === "number" ? cue.start : null
      }));
    }
    const base = (source.text || "")
      .split(/\r?\n|(?<=[\.\!\?])\s+/)
      .map((s) => normalize(s))
      .filter(Boolean);
    return base.map((text) => ({ text, seconds: null }));
  };

  for (const source of sources) {
    if (!source || (!source.text && !source.cues?.length)) continue;
    const label = source.label || source.type || "Texte";
    const weight = Number(source.weight || 1);
    for (const chunk of toChunks(source)) {
      if (!chunk.text) continue;
      if (STOPJUNK.some((junk) => chunk.text.toLowerCase().includes(junk))) continue;
      const looksItem = looksLikeItemLine(chunk.text);
      const looksStuff = hasStuffKeyword(chunk.text);
      if (!looksItem && !looksStuff) continue;
      const key = `${label}:${chunk.text.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const score = weight + (looksItem ? 1.2 : 0) + (looksStuff ? 0.6 : 0);
      hits.push({
        text: chunk.text.length > 220 ? `${chunk.text.slice(0, 217)}…` : chunk.text,
        source: label,
        seconds: chunk.seconds,
        timestamp: chunk.seconds != null ? formatTimestamp(chunk.seconds) : null,
        score: Number(score.toFixed(2))
      });
    }
  }

  return hits
    .sort((a, b) => b.score - a.score || (a.seconds ?? Infinity) - (b.seconds ?? Infinity))
    .slice(0, limit);
}

function detectStuffMoments(sources = [], { limit = 6, dedupeSeconds = 8 } = {}) {
  if (!Array.isArray(sources) || !sources.length) return [];
  const timed = sources.filter((src) => Array.isArray(src.cues) && src.cues.length);
  const hits = [];

  for (const source of timed) {
    const label = source.label || source.type || "Transcript";
    const weight = Number(source.weight || 1.5);
    for (const cue of source.cues) {
      const text = normalize(cue.text);
      if (!text) continue;
      if (STOPJUNK.some((junk) => text.toLowerCase().includes(junk))) continue;
      const looksItem = looksLikeItemLine(text);
      const looksStuff = hasStuffKeyword(text);
      if (!looksItem && !looksStuff) continue;
      const start = typeof cue.start === "number" ? cue.start : null;
      if (start == null) continue;
      const score = weight + (looksItem ? 1.4 : 0) + (looksStuff ? 1 : 0);
      hits.push({
        seconds: start,
        timestamp: formatTimestamp(start),
        text: text.length > 160 ? `${text.slice(0, 157)}…` : text,
        source: label,
        score: Number(score.toFixed(2))
      });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.seconds - b.seconds);

  const deduped = [];
  for (const hit of hits) {
    if (!hit.timestamp) continue;
    if (deduped.some((existing) => Math.abs(existing.seconds - hit.seconds) <= dedupeSeconds)) continue;
    deduped.push(hit);
    if (deduped.length >= limit) break;
  }

  return deduped;
}

// éléments détectés par comptage (titre + desc + transcript)
function inferElementsFromText(allText){
  const s = (allText||"").toLowerCase();
  const counts = { Terre:0, Eau:0, Feu:0, Air:0, Multi:0 };

  const SYNONYMS = {
    Terre: [/(?:\b|\s)terre(?:\b|\s)/g, /\bforce\b/g, /\bterreux\b/g],
    Eau: [/(?:\b|\s)eau(?:\b|\s)/g, /\bchance\b/g, /\baqua\b/g],
    Feu: [/(?:\b|\s)feu(?:\b|\s)/g, /\bintell(?:igence)?\b/g, /\bpyro\w*/g],
    Air: [/(?:\b|\s)air(?:\b|\s)/g, /\bagi(?:lit[eé])?\b/g, /\bvento\w*/g],
    Multi: [/\bmulti\b/g, /\bomni\b/g, /\bquadri\w*/g, /\b4\s*éléments?/g, /\btout\s*élément\b/g]
  };

  for (const [element, patterns] of Object.entries(SYNONYMS)) {
    for (const re of patterns) {
      counts[element] += (s.match(re) || []).length;
    }
  }

  const comboPatterns = [
    { pattern: /(terre|force)\s*(?:\/|&|et|\+)\s*(eau|chance)/g, apply: { Terre:1, Eau:1 } },
    { pattern: /(terre|force)\s*(?:\/|&|et|\+)\s*(feu|intel)/g, apply: { Terre:1, Feu:1 } },
    { pattern: /(eau|chance)\s*(?:\/|&|et|\+)\s*(air|agi)/g, apply: { Eau:1, Air:1 } },
    { pattern: /(feu|intel)\s*(?:\/|&|et|\+)\s*(air|agi)/g, apply: { Feu:1, Air:1 } },
    { pattern: /(air|agi)\s*(?:\/|&|et|\+)\s*(terre|force)/g, apply: { Air:1, Terre:1 } }
  ];

  for (const { pattern, apply } of comboPatterns) {
    const matches = s.match(pattern) || [];
    if (!matches.length) continue;
    for (const key of Object.keys(apply)) {
      counts[key] += matches.length * (apply[key] || 1);
    }
  }

  const biElement = /bi[\s-]?élément\s+(terre|eau|feu|air)/g;
  let m;
  while ((m = biElement.exec(s))) {
    const el = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    if (counts[el] !== undefined) counts[el] += 1;
  }

  const triElement = /tri[\s-]?élément/g;
  if (triElement.test(s)) counts.Multi += 1;

  const omniPhrase = /(mode\s+omni|full\s+ele)/g;
  counts.Multi += (s.match(omniPhrase) || []).length;

  const present = Object.entries(counts)
    .filter(([,c]) => c > 0)
    .sort((a,b) => b[1] - a[1])
    .map(([k]) => k);

  let ordered = present;
  if (present.includes("Terre") && present.includes("Eau") && counts.Feu < 2) {
    ordered = present.filter(e => e !== "Feu");
  }

  const total = Object.values(counts).reduce((acc, value) => acc + value, 0);
  const signals = {};
  for (const [element, value] of Object.entries(counts)) {
    if (value <= 0) continue;
    signals[element] = {
      count: value,
      weight: total ? Number((value / total).toFixed(2)) : 1
    };
  }

  return { ordered, signals };
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

function inferClassFromText(text){
  if (!text) return null;
  const low = text.toLowerCase();
  let best = { name: null, score: 0 };
  for (const entry of CLASS_PATTERNS) {
    let score = 0;
    for (const re of entry.patterns) {
      const matches = low.match(re);
      if (matches) score += matches.length;
    }
    if (!score) continue;
    if (entry.boost) score += entry.boost;
    if (score > best.score) best = { name: entry.name, score };
  }
  return best.name;
}

module.exports = {
  getYouTubeId, ytThumb, ytEmbed,
  normalize, cleanOCRText, looksLikeItemLine, fuzzyMatchItem, dedupeByName,
  scanKnownItemsBySubstring, scanAliases, scanSlotNamePatterns,
  findDofusbookLinks, gatherEvidences, inferElementsFromText, detectExos,
  inferClassFromText, formatTimestamp, detectStuffMoments
};