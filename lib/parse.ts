const SLOT_KEYWORDS = [
  "amulette","coiffe","cape","bottes","ceinture","anneau","arme","arc","épée","bâton","bouclier",
  "familier","monture","dofus","trophée","ivoire","ébène","pourpre","turquoise","dokoko","nomade","remueur"
];

export function findDofusbookLinks(text) {
  if (!text) return [];
  const re = /https?:\/\/(?:www\.)?dofusbook\.net\/[^\s)]+/gi;
  return Array.from(text.matchAll(re)).map(m => m[0]);
}

export function normalizeTextPool(title, desc, transcript) {
  return [title || "", desc || "", transcript || ""].join("\n").replace(/\u0000/g, " ").trim();
}

export function extractCandidates(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 4000);
  const hits = new Set();
  for (const l of lines) {
    const ll = l.toLowerCase();
    if (SLOT_KEYWORDS.some(k => ll.includes(k))) {
      const parts = l.split(/[:\-–•\u2022]/);
      const candidate = parts[parts.length - 1].trim();
      if (candidate.length > 2 && candidate.length < 120) hits.add(candidate);
    }
  }
  const bonus = ["Ivoire","Ébène","Pourpre","Turquoise","Dokoko","Nomade","Remueur"];
  const bag = text.split(/[\s,;()]+/);
  for (const w of bag) {
    if (bonus.map(b=>b.toLowerCase()).includes(w.toLowerCase())) hits.add(capitalize(w));
  }
  return Array.from(hits);
}

export function guessClassAndElements(title, desc) {
  const src = `${title ?? ""} ${desc ?? ""}`.toLowerCase();
  const classes = {
    "Cra": ["cra","crâ"], "Eniripsa": ["eniripsa","eni"], "Iop": ["iop"], "Sram": ["sram"],
    "Feca": ["feca","féca"], "Osamodas": ["osa","osamodas"], "Sacrieur": ["sacri","sacrieur"],
    "Xelor": ["xelor"], "Pandawa": ["panda","pandawa"], "Ecaflip": ["ecaflip","eca"],
    "Huppermage": ["hupper","huppermage"], "Sadida": ["sadi","sadida"], "Roublard": ["roub","roublard"],
    "Steamer": ["steamer","steam"], "Zobal": ["zobal","zob"], "Ouginak": ["ougi","ouginak"],
    "Forgelance": ["forgelance","forgel."]
  };
  let klass;
  for (const [k, keys] of Object.entries(classes)) {
    if (keys.some(key => src.includes(key))) { klass = k; break; }
  }
  const elems = [];
  if (/terre/i.test(src)) elems.push("Terre");
  if (/eau/i.test(src)) elems.push("Eau");
  if (/feu/i.test(src)) elems.push("Feu");
  if (/(air|agi)/i.test(src)) elems.push("Air");
  if (/multi/i.test(src)) elems.push("Multi");
  return { klass, elements: elems };
}

function capitalize(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
