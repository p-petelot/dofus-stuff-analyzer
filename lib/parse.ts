const SLOT_KEYWORDS = [
  "amulette","coiffe","cape","bottes","ceinture","anneau","arme","arc","épée","bâton","bouclier",
  "familier","monture","dofus","trophée","ivoire","ébène","pourpre","turquoise","dokoko","nomade","remueur"
];

export function findDofusbookLinks(text: string): string[] {
  if (!text) return [];
  const re = /https?:\/\/(?:www\.)?dofusbook\.net\/[^\s)]+/gi;
  return Array.from(text.matchAll(re)).map(m => m[0]);
}

export function normalizeTextPool(title?: string, desc?: string, transcript?: string): string {
  return [title || "", desc || "", transcript || ""].join("\n").replace(/\u0000/g, " ").trim();
}

export function extractCandidates(text: string): string[] {
  if (!text) return [];
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 4000); // limite sécurité

  const hits = new Set<string>();
  for (const l of lines) {
    const ll = l.toLowerCase();
    if (SLOT_KEYWORDS.some(k => ll.includes(k))) {
      // coupe sur ":" "-" "•" pour essayer d'isoler un nom
      const parts = l.split(/[:\-–•\u2022]/);
      const candidate = parts[parts.length - 1].trim();
      if (candidate.length > 2 && candidate.length < 120) {
        hits.add(candidate);
      }
    }
  }
  // bonus: repérer des mots isolés connus (ivoire, ébène, etc.)
  const bonus = ["Ivoire","Ébène","EbenE".toLowerCase(),"Pourpre","Turquoise","Dokoko","Nomade","Remueur"];
  const bag = text.split(/[\s,;()]+/);
  for (const w of bag) {
    const ww = w.toLowerCase();
    if (bonus.map(b=>b.toLowerCase()).includes(ww)) {
      hits.add(capitalize(w));
    }
  }
  return Array.from(hits);
}

export function guessClassAndElements(title?: string, desc?: string): { klass?: string; elements: string[] } {
  const src = `${title ?? ""} ${desc ?? ""}`.toLowerCase();
  const classes: Record<string,string[]> = {
    "cra": ["cra","crâ"],
    "eniripsa": ["eniripsa","eni"],
    "iop": ["iop"],
    "sram": ["sram"],
    "fecas": ["feca","féca"],
    "osamodas": ["osa","osamodas"],
    "sacrieur": ["sacri","sacrieur"],
    "xelor": ["xelor","xelor"],
    "pandawa": ["panda","pandawa"],
    "ecaflip": ["ecaflip","eca"],
    "huppermage": ["hupper","huppermage"],
    "sadida": ["sadi","sadida"],
    "roublard": ["roub","roublard"],
    "steamer": ["steamer","steam"],
    "zobal": ["zobal","zob"],
    "ouginak": ["ougi","ouginak"],
    "elorat": ["elorat","elorat?"],
    "forgelance": ["forgelance","forgel."]
  };
  let klass: string | undefined = undefined;
  for (const [k, keys] of Object.entries(classes)) {
    if (keys.some(key => src.includes(key))) {
      klass = k[0].toUpperCase() + k.slice(1);
      break;
    }
  }
  const elems: string[] = [];
  if (/terre/i.test(src)) elems.push("Terre");
  if (/eau/i.test(src)) elems.push("Eau");
  if (/feu/i.test(src)) elems.push("Feu");
  if (/(air|agi)/i.test(src)) elems.push("Air");
  if (/multi/i.test(src)) elems.push("Multi");
  return { klass, elements: elems };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
