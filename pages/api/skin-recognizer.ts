import type { NextApiRequest, NextApiResponse } from "next";
import { getAllIndexedItems } from "../../lib/items/indexStore";
import {
  deriveClassesFromItems,
  recognizeSkin,
  trainSkinRecognizer,
  loadSkinRecognizerModel,
  SkinRecognizerModel,
} from "../../lib/vision/skinRecognizer";

interface TrainRequestBody {
  action: "train";
  classes?: string[];
  paletteSeeds?: string[];
  samplesPerClass?: number;
  randomSeed?: string;
  persist?: boolean;
  sexes?: Array<"male" | "female">;
}

interface PredictRequestBody {
  action: "predict";
  image: string;
  topK?: number;
}

type RecognizerRequest = TrainRequestBody | PredictRequestBody;

function defaultClassesFromTags(items: ReturnType<typeof getAllIndexedItems>): string[] {
  const derived = deriveClassesFromItems(items);
  if (derived.length) {
    return derived;
  }
  return ["iop", "cra", "eniripsa", "sram"];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body as RecognizerRequest | undefined;
  if (!body || typeof body !== "object" || !("action" in body)) {
    res.status(400).json({ error: "Invalid payload" });
    return;
  }

  if (body.action === "train") {
    const items = getAllIndexedItems();
    if (!items.length) {
      res.status(400).json({ error: "No items available for training" });
      return;
    }
    const classes = body.classes?.length ? body.classes : defaultClassesFromTags(items);
    try {
      const persist = body.persist ?? true;
      const model = await trainSkinRecognizer({
        items,
        classes,
        paletteSeeds: body.paletteSeeds,
        samplesPerClass: body.samplesPerClass,
        randomSeed: body.randomSeed,
        persist,
        sexes: body.sexes,
      });
      res.status(200).json({
        action: "train",
        trained: model.samples.length,
        metadata: model.metadata,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
    return;
  }

  if (body.action === "predict") {
    if (!body.image) {
      res.status(400).json({ error: "Missing image" });
      return;
    }
    try {
      const model: SkinRecognizerModel | null = await loadSkinRecognizerModel();
      if (!model) {
        res.status(409).json({ error: "Model not trained" });
        return;
      }
      const result = await recognizeSkin(body.image, model, { topK: body.topK });
      res.status(200).json({ action: "predict", ...result });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
    return;
  }

  res.status(400).json({ error: "Unsupported action" });
}

