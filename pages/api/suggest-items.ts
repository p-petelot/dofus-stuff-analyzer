import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import {
  FLAGS,
  ITEM_THRESH,
  K,
  LOW_CONFIDENCE_THRESHOLD,
  SLOTS,
} from "../../lib/config/suggestions";
import {
  extractPaletteLABBySlot,
  extractPaletteLABGlobal,
  snapToDofusPalette,
} from "../../lib/colors/palette";
import { colorModeSuggest } from "../../lib/items/colorMode";
import { itemModeSuggest } from "../../lib/items/itemMode";
import { applySetBonus, finalizeSlot } from "../../lib/items/rerank";
import { logSuggestion } from "../../lib/telemetry/suggestions";
import type { Candidate, FourSlot, SuggestionOutput } from "../../lib/types";
import { crop, locateFourSlots, normalizeInput } from "../../lib/vision/preprocess";

interface SuggestBody {
  image: string;
  preferedClass?: string;
  hints?: Partial<Record<FourSlot, number[]>>;
  excludeSets?: number[];
  slots?: FourSlot[];
  debug?: boolean;
}

function hashInput(image: string): string {
  return crypto.createHash("sha1").update(image).digest("hex").slice(0, 12);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SuggestionOutput | { error: string }>,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = req.body as SuggestBody;
    if (!body?.image) {
      res.status(400).json({ error: "Missing image" });
      return;
    }

    const timings = { preprocess: 0, retrieval: 0, verify: 0, colorMode: 0 };
    const start = Date.now();

    const preprocessStart = Date.now();
    const { img512, mask } = await normalizeInput(body.image);
    const { boxes, visibility } = await locateFourSlots(img512, mask);
    timings.preprocess = Date.now() - preprocessStart;

    const paletteGlobalLab = extractPaletteLABGlobal(img512, mask);
    const paletteBySlotLab = extractPaletteLABBySlot(img512, boxes, mask);
    const paletteGlobal = snapToDofusPalette(paletteGlobalLab);
    const paletteBySlot = snapToDofusPalette(paletteBySlotLab);

    const perSlot: Record<FourSlot, { candidates: Candidate[]; confidence: number; notes: string[] }> = {
      coiffe: { candidates: [], confidence: 0, notes: [] },
      cape: { candidates: [], confidence: 0, notes: [] },
      bouclier: { candidates: [], confidence: 0, notes: [] },
      familier: { candidates: [], confidence: 0, notes: [] },
    };

    for (const slot of SLOTS) {
      const localNotes: string[] = [];
      const patch = crop(img512, boxes[slot]);
      const isVisible = visibility[slot] === "ok";
      let candidates: Candidate[] = [];
      let confidence = 0;
      if (!isVisible) {
        localNotes.push(`Visibilité faible sur ${slot} → aucune confirmation possible.`);
      }
      if (isVisible && FLAGS.enableItemMode) {
        const itemStart = Date.now();
        const itemCandidates = await itemModeSuggest(slot, patch, K.retrieval);
        timings.verify += Date.now() - itemStart;
        if (itemCandidates.length) {
          const topScore = itemCandidates[0].score;
          if (topScore >= ITEM_THRESH[slot].final) {
            candidates = itemCandidates;
            confidence = topScore;
            localNotes.push(`Mode ITEM confirmé pour ${slot} (score ${topScore.toFixed(2)}).`);
          } else {
            localNotes.push(
              `Mode ITEM non confirmé pour ${slot} (score ${topScore.toFixed(2)} < seuil ${ITEM_THRESH[slot].final}).`,
            );
          }
        }
      }
      if (!candidates.length && FLAGS.enableColorMode && isVisible) {
        const colorStart = Date.now();
        const colorCandidates = await colorModeSuggest(slot, patch, paletteBySlot[slot], K.colorPick);
        timings.colorMode += Date.now() - colorStart;
        if (colorCandidates.length) {
          candidates = colorCandidates;
          confidence = colorCandidates[0].reasons.colorScore ?? colorCandidates[0].score ?? 0;
          localNotes.push(`Mode COULEUR appliqué pour ${slot} (ΔE ${
            colorCandidates[0].reasons.deltaE?.toFixed(2) ?? "n/a"
          }).`);
        }
      } else if (!candidates.length && !isVisible) {
        localNotes.push(`Slot ${slot} trop masqué → aucune suggestion.`);
      }
      perSlot[slot] = { candidates, confidence, notes: localNotes };
    }

    const withBonus = applySetBonus(
      {
        coiffe: perSlot.coiffe.candidates,
        cape: perSlot.cape.candidates,
        bouclier: perSlot.bouclier.candidates,
        familier: perSlot.familier.candidates,
      },
      paletteBySlot,
    );

    const slots: Record<FourSlot, Candidate[]> = {
      coiffe: [],
      cape: [],
      bouclier: [],
      familier: [],
    };
    const confidence: Record<FourSlot, number> = {
      coiffe: 0,
      cape: 0,
      bouclier: 0,
      familier: 0,
    };
    const notes: string[] = [];

    for (const slot of SLOTS) {
      const finalized = finalizeSlot(withBonus[slot]);
      slots[slot] = finalized;
      let slotConfidence = perSlot[slot].confidence;
      if (finalized.length) {
        if (finalized[0].verified) {
          slotConfidence = finalized[0].score;
        } else if (finalized[0].mode === "color") {
          slotConfidence = finalized[0].reasons.colorScore ?? finalized[0].score ?? slotConfidence;
        }
      }
      confidence[slot] = slotConfidence;
      notes.push(...perSlot[slot].notes);
      if (slotConfidence < LOW_CONFIDENCE_THRESHOLD && finalized.length) {
        notes.push(`${slot} en low-confidence (score ${slotConfidence.toFixed(2)}).`);
      }
      if (!finalized.length) {
        notes.push(`Aucune suggestion retenue pour ${slot}.`);
      }
    }

    timings.retrieval = timings.verify;

    const debug = {
      roi: boxes,
      timingsMs: {
        preprocess: timings.preprocess,
        retrieval: timings.retrieval,
        verify: timings.verify,
        colorMode: timings.colorMode,
        total: Date.now() - start,
      },
      flags: FLAGS,
    };

    const response: SuggestionOutput = {
      palette: { global: paletteGlobal, bySlot: paletteBySlot },
      slots,
      confidence,
      visibility,
      notes,
      debug,
    };

    const inputHash = hashInput(body.image);
    for (const slot of SLOTS) {
      logSuggestion(inputHash, slot, slots[slot], slots[slot][0]);
    }

    res.status(200).json(response);
  } catch (error) {
    console.error("suggest-items error", error);
    res.status(500).json({ error: "Internal error" });
  }
}
