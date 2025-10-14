const SLOT_KEYWORDS = [
  "amulette","coiffe","cape","bottes","ceinture","anneau","arme","arc","épée","bâton","bouclier",
  "familier","monture","dofus","trophée","trophées","ivoire","ébène","pourpre","turquoise","dokoko","nomade","remueur",
  "voile","voile d'encre","strigide","brouce","abyssal","ocre","tutu","émeraude","prytek","volkorne","draconiak","kramkram"
];

export function findDofusbookLinks(text) {
  if (!text) return [];
  const re = /https?:\/\/(?:www\.)?dofusbook\.net\/[^\s)]+/gi;
  return Array.from(text.matchAll(re)).map(m => m[0]);
}

export function normalizeTextPool(title, desc, transcript) {
  return [title || "", desc || "", transcript || ""]
    .join("\n")
    .replace(/\u0000/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractCandidates(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const hits = new Set();

  // 1) Heuristique "lignes avec slot"
  for (const l of lines) {
    const ll = l.toLowerCase();
    if (SLOT_KEYWORDS.some(k => ll.includes(k))) {
      // coupe et garde le segment le plus "nom d'item" à droite
      const parts = l.split(/[:\-–•\u2022]/);
      let candidate = parts[parts.length - 1].trim();
      // Nettoyage simple
      candidate = candidate.replace(/(niveau|lvl|ex?o|pa|pm|po)\s*\d*/gi, "").trim();
      if (candidate.length >= 3 && candidate.length <= 120) hits.add(candidate);
    }
  }

  // 2) Bonus : repérer des Dofus/trophées isolés
  const singletons = ["Ivoire","Ébène","Pourpre","Turquoise","Dokoko","Nomade","Remueur","Abyssal","Ocre","Émeraude"];
  const bag = text.split(/[\s,;()]+/);
  for (const w of bag) {
    const W = w.normalize("NFD").replace(/\p{Diacritic}/gu, "");
    if (singletons.map(b=>b.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase()).includes(W.toLowerCase())) {
      hits.add(w);
    }
  }

  return Array.from(hits).slice(0, 60);
}

export function guessClassAndElements(title, desc, extra="") {
  const src = `${title ?? ""} ${desc ?? ""} ${extra ?? ""}`.toLowerCase();

  // Classes (plus de variantes FR)
  const classes = {
    "Cra": ["cra","crâ"],
    "Eniripsa": ["eniripsa","eni"],
    "Iop": ["iop"],
    "Sram": ["sram"],
    "Feca": ["feca","féca"],
    "Osamodas": ["osamodas","osa"],
    "Sacrieur": ["sacrieur","sacri"],
    "Xelor": ["xelor"],
    "Pandawa": ["pandawa","panda"],
    "Ecaflip": ["ecaflip","eca"],
    "Huppermage": ["hupper","huppermage"],
    "Sadida": ["sadida","sadi"],
    "Roublard": ["roublard","roub"],
    "Steamer": ["steamer","steam"],
    "Zobal": ["zobal","zob"],
    "Ouginak": ["ouginak","ougi"],
    "Forgelance": ["forgelance","forgel."]
  };
  let klass = null;
  for (const [k, keys] of Object.entries(classes)) {
    if (keys.some(key => src.includes(key))) { klass = k; break; }
  }

  // Éléments (inclure variantes liées aux sorts : expia/pupu => souvent Terre/Eau)
  const elements = [];
  if (/terre/i.test(src)) elements.push("Terre");
  if (/eau/i.test(src)) elements.push("Eau");
  if (/feu/i.test(src)) elements.push("Feu");
  if (/(air|agi)/i.test(src)) elements.push("Air");
  if (/multi/i.test(src)) elements.push("Multi");

  // Indices de build pour Crâ : "expi", "punitive", "pupu"
  if (klass === "Cra") {
    if (/expi(a|ation)?/i.test(src) || /puni(tive|)/i.test(src) || /pupu/i.test(src)) {
      // s'il n'a rien détecté, pousse un Terre/Eau par défaut (très courant sur expi/puni)
      if (elements.length === 0) elements.push("Terre","Eau");
    }
  }

  return { klass, elements };
}