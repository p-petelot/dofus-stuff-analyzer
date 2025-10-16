import crypto from "crypto";
import { FLAGS, LOW_CONFIDENCE_THRESHOLD, SLOTS } from "../../lib/config/suggestions";
import { extractPaletteLAB, snapToDofusPalette } from "../../lib/colors/palette";
import { crop, locateFourSlots, normalizeInput } from "../../lib/vision/preprocess";
import { runItemMode } from "../../lib/items/itemMode";
import { runColorMode } from "../../lib/items/colorMode";
import { rerankAndConstrain } from "../../lib/items/rerank";
import { logSuggestion } from "../../lib/telemetry/suggestions";

/** @typedef {import("../../lib/types").Candidate} Candidate */
/** @typedef {import("../../lib/types").SetRules} SetRules */

function hashInput(image) {
  return crypto.createHash("sha1").update(image).digest("hex").slice(0, 12);
}

function buildRules(body) {
  return {
    excludeSets: Array.isArray(body?.excludeSets) ? body.excludeSets : [],
    preferredSetIds: [],
    hintItemIds: Object.values(body?.hints ?? {}).flat().filter((value) => typeof value === "number"),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const start = Date.now();
  const timings = { preprocess: 0, retrieval: 0, colorMode: 0 };
  const notes = [];

  try {
    const { image, hints = {}, excludeSets = [] } = req.body ?? {};
    if (!image) {
      res.status(400).json({ error: "Missing image" });
      return;
    }

    const preprocessStart = Date.now();
    const { img512, mask } = normalizeInput(image);
    const { boxes, visibility } = locateFourSlots(img512, mask);
    timings.preprocess = Date.now() - preprocessStart;

    const paletteLab = extractPaletteLAB(img512);
    const dofusPalette = snapToDofusPalette(paletteLab);

    const rules = buildRules({ hints, excludeSets });
    const slots = {};
    const confidence = {};
    const slotNotes = {};

    for (const slot of SLOTS) {
      const slotPatch = crop(img512, boxes[slot]);
      const slotVisibility = visibility[slot];
      let selected = [];
      let slotConfidence = 0;
      const localNotes = [];
      if (slotVisibility === "ok") {
        const itemStart = Date.now();
        const { confirmed, confidence: itemConfidence, notes: itemNotes } = await runItemMode(slot, slotPatch, rules);
        timings.retrieval += Date.now() - itemStart;
        localNotes.push(...itemNotes);
        if (confirmed.length) {
          selected = confirmed;
          slotConfidence = itemConfidence;
        }
      } else {
        localNotes.push(`Visibilité faible sur ${slot} → mode COULEUR prioritaire`);
      }

      if (!selected.length) {
        const colorStart = Date.now();
        const { suggestions, confidence: colorConfidence, notes: colorNotes } = await runColorMode(slot, slotPatch, dofusPalette);
        timings.colorMode += Date.now() - colorStart;
        selected = suggestions;
        slotConfidence = colorConfidence;
        localNotes.push(...colorNotes);
      }

      const reranked = rerankAndConstrain(slot, selected, dofusPalette, rules);
      slots[slot] = reranked;
      confidence[slot] = reranked.length ? Math.max(slotConfidence, reranked[0].score ?? 0) : 0;
      if (!reranked.length) {
        localNotes.push(`Aucune proposition disponible pour ${slot}`);
      }
      if (confidence[slot] < LOW_CONFIDENCE_THRESHOLD && reranked.length) {
        localNotes.push(`${slot} en low-confidence (score ${confidence[slot].toFixed(2)})`);
      }
      slotNotes[slot] = localNotes;
    }

    for (const slot of SLOTS) {
      notes.push(...(slotNotes[slot] ?? []));
    }

    const debug = {
      timingsMs: {
        preprocess: timings.preprocess,
        retrieval: timings.retrieval,
        colorMode: timings.colorMode,
        total: Date.now() - start,
      },
      flags: FLAGS,
    };

    const response = {
      palette: dofusPalette,
      slots,
      confidence,
      visibility,
      notes,
      debug,
    };

    const inputHash = hashInput(typeof image === "string" ? image : Buffer.from(image ?? []));
    for (const slot of SLOTS) {
      logSuggestion(inputHash, slot, slots[slot] ?? []);
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("suggest-items error", error);
    res.status(500).json({ error: "Internal error" });
  }
}
