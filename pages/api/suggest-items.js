import crypto from "crypto";
import { DEFAULT_MAX_SUGGESTIONS, FOUR_SLOTS, RETRIEVAL_K } from "../../lib/config/suggestions";
import { extractPaletteLAB, snapToDofusPalette, deltaE2000 } from "../../lib/colors/palette";
import { computeClipEmbedding } from "../../lib/vision/features";
import { locateFourSlots, normalizeInput } from "../../lib/vision/preprocess";
import { queryIndex } from "../../lib/items/indexStore";
import { rerankAndConstrain, scoreCandidate } from "../../lib/items/rerank";
import { logSuggestion } from "../../lib/telemetry/suggestions";

/** @typedef {import("../../lib/types").Candidate} Candidate */
/** @typedef {import("../../lib/types").CandidateReasons} CandidateReasons */
/** @typedef {import("../../lib/types").CandidateRef} CandidateRef */
/** @typedef {import("../../lib/types").FourSlot} FourSlot */
/** @typedef {import("../../lib/types").ImageDataLike} ImageDataLike */
/** @typedef {import("../../lib/types").SetRules} SetRules */
/** @typedef {import("../../lib/types").SuggestionOutput} SuggestionOutput */

/**
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  const length = Math.min(a.length, b.length);
  if (!length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * @param {ImageDataLike} img
 * @param {{ x: number; y: number; width: number; height: number }} box
 * @returns {ImageDataLike}
 */
function cropImage(img, box) {
  const startX = Math.max(0, Math.floor(box.x));
  const startY = Math.max(0, Math.floor(box.y));
  const endX = Math.min(img.width, Math.ceil(box.x + box.width));
  const endY = Math.min(img.height, Math.ceil(box.y + box.height));
  const width = Math.max(1, endX - startX);
  const height = Math.max(1, endY - startY);
  const data = new Uint8ClampedArray(width * height * 4);
  let offset = 0;
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const sourceIndex = (y * img.width + x) * 4;
      data[offset] = img.data[sourceIndex];
      data[offset + 1] = img.data[sourceIndex + 1];
      data[offset + 2] = img.data[sourceIndex + 2];
      data[offset + 3] = img.data[sourceIndex + 3];
      offset += 4;
    }
  }
  return { width, height, data };
}

/**
 * @param {string} hex
 * @returns {{ L: number; a: number; b: number }}
 */
function hexToLab(hex) {
  const normalized = hex.replace(/^#/, "");
  const value = parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const pivot = (channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const rr = pivot(r);
  const gg = pivot(g);
  const bb = pivot(b);
  const x = rr * 0.4124 + gg * 0.3576 + bb * 0.1805;
  const y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
  const z = rr * 0.0193 + gg * 0.1192 + bb * 0.9505;
  const refX = 0.95047;
  const refY = 1.0;
  const refZ = 1.08883;
  const f = (value) => {
    const epsilon = 216 / 24389;
    const kappa = 24389 / 27;
    return value > epsilon ? Math.cbrt(value) : (kappa * value + 16) / 116;
  };
  const fx = f(x / refX);
  const fy = f(y / refY);
  const fz = f(z / refZ);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/**
 * @param {CandidateRef} candidate
 * @param {{ primary: string; secondary: string; tertiary: string }} palette
 * @returns {number}
 */
function paletteDelta(candidate, palette) {
  if (!candidate.palette || candidate.palette.length === 0) {
    return 50;
  }
  const reference = [palette.primary, palette.secondary, palette.tertiary].map(hexToLab);
  let total = 0;
  let count = 0;
  for (const hex of candidate.palette) {
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) continue;
    const lab = hexToLab(hex);
    let best = Infinity;
    for (const ref of reference) {
      const delta = deltaE2000(lab, ref);
      if (delta < best) {
        best = delta;
      }
    }
    total += best;
    count += 1;
  }
  return count > 0 ? total / count : 50;
}

/**
 * @param {FourSlot} slot
 * @param {any} body
 * @returns {SetRules}
 */
function buildRules(slot, body) {
  const hints = body?.hints?.[slot];
  const excludeSets = Array.isArray(body?.excludeSets) ? body.excludeSets : [];
  return {
    hintItemIds: Array.isArray(hints) ? hints : [],
    excludeSets: excludeSets.filter((value) => typeof value === "number"),
  };
}

/**
 * @param {string} image
 * @returns {string}
 */
function hashInput(image) {
  return crypto.createHash("sha1").update(image).digest("hex");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { image } = req.body ?? {};
    if (!image || typeof image !== "string") {
      res.status(400).json({ error: "Image payload missing" });
      return;
    }

    const { img } = await normalizeInput(image);
    const slots = await locateFourSlots(img);
    const paletteLab = extractPaletteLAB(img);
    const palette = snapToDofusPalette(paletteLab);

    const notes = [];
    const degradedNotes = new Set();
    /** @type {Object.<FourSlot, Candidate[]>} */
    const slotSuggestions = {
      coiffe: [],
      cape: [],
      bouclier: [],
      familier: [],
    };
    /** @type {Object.<FourSlot, number>} */
    const confidence = {
      coiffe: 0,
      cape: 0,
      bouclier: 0,
      familier: 0,
    };

    const inputHash = hashInput(image);

    for (const slot of FOUR_SLOTS) {
      if (slots.visibility[slot] === "low") {
        notes.push(`${slot} partiellement visible → suggestions désactivées.`);
        continue;
      }

      const patch = cropImage(img, slots[slot]);
      const embedding = await computeClipEmbedding(patch);
      const candidates = await queryIndex(slot, embedding, RETRIEVAL_K);

      if (!candidates.length) {
        notes.push(`Aucun candidat indexé pour ${slot}.`);
        continue;
      }

      const enriched = candidates.map((candidate) => {
        const clip = Math.max(0, Math.min(1, cosineSimilarity(embedding, candidate.embedding)));
        const orb = Math.max(0, Math.min(1, clip * 0.7 + 0.2));
        const ssim = Math.max(0, Math.min(1, clip * 0.5 + 0.25));
        if (!degradedNotes.has("features")) {
          degradedNotes.add("features");
          notes.push("Analyse ORB/SSIM dégradée : heuristiques de fallback utilisées.");
        }
        const delta = paletteDelta(candidate, palette);
        /** @type {CandidateReasons} */
        const reasons = { clip, orb, ssim, deltaE: delta };
        return {
          itemId: candidate.itemId,
          label: candidate.label,
          thumb: candidate.thumb,
          reasons,
          score: scoreCandidate(reasons),
          setId: candidate.setId ?? null,
          palette: candidate.palette ?? [],
        };
      });

      const rules = buildRules(slot, req.body);
      const reranked = rerankAndConstrain(slot, enriched, palette, rules);
      slotSuggestions[slot] = reranked.slice(0, DEFAULT_MAX_SUGGESTIONS);
      confidence[slot] = reranked.length ? reranked[0].score : 0;
      logSuggestion(inputHash, slot, reranked);
    }

    /** @type {SuggestionOutput} */
    const output = {
      palette,
      slots: slotSuggestions,
      confidence,
      notes,
      visibility: slots.visibility,
    };

    res.status(200).json(output);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to compute suggestions" });
  }
}
