const stringSimilarity = require("string-similarity");
const ITEMS = require("./items.json");

const STOPJUNK = [
  "youtube", "hashtag", "comments", "transcript", "subscribe", "like", "share",
  "http", "https", "www.youtube.com", "youtu", "play", "watch", "channel"
];

function cleanOCRText(t) {
  if (!t) return "";
  return t
    .replace(/\u0000/g, " ")
    .replace(/[^\p{L}\p{N}\s'’\-]/gu, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikeItemLine(line) {
  const l = line.toLowerCase();
  if (STOPJUNK.some(j => l.includes(j))) return false;
  // indices Dofus/slots/objets typiques
  return /amulette|coiffe|cape|bottes|ceinture|anneau|bouclier|dofus|troph(ée|e)s?|voile|strigide|brouce|allister|sécul|volkorne|dragodinde|arc|bâton|épée/i.test(l);
}

function fuzzyMatchItem(raw) {
  const input = raw.trim();
  const names = ITEMS.map(i => i.name);
  const { bestMatch } = stringSimilarity.findBestMatch(input, names);
  const match = bestMatch || { rating: 0, target: null };
  const idx = names.indexOf(match.target);
  if (idx === -1) return null;
  const item = ITEMS[idx];
  return { ...item, confidence: +match.rating.toFixed(3), raw };
}

function dedupeByName(arr) {
  const seen = new Set();
  return arr.filter(x => {
    const k = (x && x.name) ? x.name.toLowerCase() : "";
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

module.exports = { cleanOCRText, looksLikeItemLine, fuzzyMatchItem, dedupeByName };