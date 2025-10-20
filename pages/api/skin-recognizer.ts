import type { NextApiRequest, NextApiResponse } from "next";
import { buildItemIndex, getAllIndexedItems } from "../../lib/items/indexStore";
import type { CandidateRef, SlotKey } from "../../lib/types";
import {
  deriveClassesFromItems,
  recognizeSkin,
  trainSkinRecognizer,
  loadSkinRecognizerModel,
  SkinRecognizerModel,
  SkinSampleFeatures,
  recordLabeledSkinSample,
  getSkinRecognizerDatasetSummary,
  listSkinRecognizerDataset,
  evaluateSkinRecognizer,
  SkinEvaluationReport,
} from "../../lib/vision/skinRecognizer";
import { BREED_FALLBACK_ORDER, fetchDofusBreeds, fetchItemsForIndex } from "../../lib/items/dofusFetcher";
import type { BreedOption } from "../../lib/items/dofusFetcher";

interface TrainRequestBody {
  action: "train";
  classes?: string[];
  paletteSeeds?: string[];
  samplesPerClass?: number;
  randomSeed?: string;
  persist?: boolean;
  sexes?: Array<"male" | "female">;
  includeLabeled?: boolean;
  evaluationSamples?: number;
  language?: string;
}

interface PredictRequestBody {
  action: "predict";
  image: string;
  topK?: number;
}

interface StatusRequestBody {
  action: "status";
}

interface LabelDescriptorItem {
  slot: SlotKey;
  itemId: number;
}

interface LabelRequestBody {
  action: "label";
  image: string;
  descriptor: {
    classId: string;
    sex: "male" | "female";
    colors: string[];
    items?: Record<SlotKey, number> | LabelDescriptorItem[];
  };
  trainAfter?: boolean;
  evaluationSamples?: number;
  includeLabeled?: boolean;
  language?: string;
}

interface AutoTrainRequestBody {
  action: "autoTrain";
  iterations?: number;
  samplesPerClass?: number;
  evaluationSamples?: number;
  randomSeed?: string;
  persist?: boolean;
  sexes?: Array<"male" | "female">;
  classes?: string[];
  paletteSeeds?: string[];
  includeLabeled?: boolean;
  language?: string;
}

type RecognizerRequest =
  | TrainRequestBody
  | PredictRequestBody
  | StatusRequestBody
  | LabelRequestBody
  | AutoTrainRequestBody
  | { action: "options"; language?: string };

async function ensureIndexedItems(language?: string): Promise<CandidateRef[]> {
  const existing = getAllIndexedItems();
  if (existing.length) {
    return existing;
  }
  const fetched = await fetchItemsForIndex(language);
  await buildItemIndex(fetched);
  return getAllIndexedItems();
}

function groupItemsBySlot(items: CandidateRef[]): Record<SlotKey, CandidateRef[]> {
  const grouped: Record<SlotKey, CandidateRef[]> = {
    coiffe: [],
    cape: [],
    bouclier: [],
    familier: [],
    epauliere: [],
    costume: [],
    ailes: [],
  };
  for (const item of items) {
    grouped[item.slot]?.push(item);
  }
  return grouped;
}

async function fetchFallbackClasses(language?: string): Promise<string[]> {
  try {
    const breeds = await fetchDofusBreeds(language);
    if (breeds.length) {
      return breeds.map((breed) => breed.slug);
    }
  } catch (error) {
    console.warn("Failed to load Dofus breeds for recognizer fallback", error);
  }
  return BREED_FALLBACK_ORDER;
}

async function resolveClasses({
  requested,
  items,
  language,
  extra = [],
}: {
  requested?: string[];
  items: CandidateRef[];
  language?: string;
  extra?: Array<string | undefined>;
}): Promise<string[]> {
  if (requested?.length) {
    return Array.from(new Set(requested.map((value) => value.toLowerCase())));
  }
  const derived = deriveClassesFromItems(items);
  const base = derived.length ? derived : await fetchFallbackClasses(language);
  const unique = new Set(base.map((value) => value.toLowerCase()));
  extra.forEach((value) => {
    if (value) {
      unique.add(value.toLowerCase());
    }
  });
  return Array.from(unique);
}

function buildItemLookup(items: CandidateRef[]): Map<number, CandidateRef> {
  const lookup = new Map<number, CandidateRef>();
  for (const item of items) {
    lookup.set(item.itemId, item);
  }
  return lookup;
}

function resolveDescriptorItems(
  input: Record<SlotKey, number> | LabelDescriptorItem[] | undefined,
  lookup: Map<number, CandidateRef>,
): Record<SlotKey, CandidateRef> {
  if (!input) {
    return {} as Record<SlotKey, CandidateRef>;
  }
  const entries: Array<{ slot: SlotKey; itemId: number }> = Array.isArray(input)
    ? input
    : Object.entries(input).map(([slot, itemId]) => ({ slot: slot as SlotKey, itemId }));
  const resolved: Partial<Record<SlotKey, CandidateRef>> = {};
  for (const entry of entries) {
    if (!entry || typeof entry.itemId !== "number") {
      continue;
    }
    const candidate = lookup.get(entry.itemId);
    if (candidate && candidate.slot === entry.slot) {
      resolved[entry.slot] = candidate;
    }
  }
  return resolved as Record<SlotKey, CandidateRef>;
}

function presentItems(items: Record<SlotKey, CandidateRef>): Array<{
  slot: SlotKey;
  itemId: number;
  label: string;
  thumb?: string;
}> {
  return Object.entries(items ?? {}).map(([slot, item]) => ({
    slot: slot as SlotKey,
    itemId: item.itemId,
    label: item.label,
    thumb: item.thumb ?? item.sprite,
  }));
}

function presentBreeds(breeds: BreedOption[]) {
  return breeds.map((breed) => ({
    id: breed.id,
    slug: breed.slug,
    name: breed.name,
    icon: breed.icon ?? null,
  }));
}

function presentSample(sample: SkinSampleFeatures) {
  return {
    id: sample.id,
    createdAt: sample.createdAt,
    source: sample.source,
    descriptor: {
      classId: sample.descriptor.classId,
      sex: sample.descriptor.sex,
      colors: sample.descriptor.colors,
      items: presentItems(sample.descriptor.items),
    },
    image: sample.image ?? null,
  };
}

function summarizeEvaluation(evaluation: SkinEvaluationReport | null, limit = 6) {
  if (!evaluation) {
    return null;
  }
  return {
    metrics: evaluation.metrics,
    samples: evaluation.samples.slice(0, limit).map((sample) => ({
      id: sample.id,
      target: {
        classId: sample.target.classId,
        sex: sample.target.sex,
        colors: sample.target.colors,
        items: presentItems(sample.target.items),
      },
      prediction: sample.prediction
        ? {
            score: sample.prediction.score,
            descriptor: {
              classId: sample.prediction.descriptor.classId,
              sex: sample.prediction.descriptor.sex,
              colors: sample.prediction.descriptor.colors,
              items: presentItems(sample.prediction.descriptor.items),
            },
          }
        : null,
    })),
  };
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

  if (body.action === "options") {
    try {
      const [items, breeds] = await Promise.all([
        ensureIndexedItems(body.language),
        fetchDofusBreeds(body.language),
      ]);
      const grouped = groupItemsBySlot(items);
      const slotOptions = Object.fromEntries(
        Object.entries(grouped).map(([slot, entries]) => [
          slot,
          entries.map((entry) => ({
            itemId: entry.itemId,
            label: entry.label,
            thumb: entry.thumb ?? entry.sprite ?? null,
            slot: entry.slot,
          })),
        ]),
      );
      res.status(200).json({
        action: "options",
        classes: presentBreeds(breeds),
        items: slotOptions,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
    return;
  }

  if (body.action === "status") {
    try {
      const model = await loadSkinRecognizerModel();
      const datasetSummary = await getSkinRecognizerDatasetSummary();
      const recentSamples = await listSkinRecognizerDataset(8);
      res.status(200).json({
        action: "status",
        model: model
          ? {
              trainedAt: model.trainedAt,
              metadata: model.metadata,
              samples: model.samples.length,
            }
          : null,
        dataset: {
          summary: datasetSummary,
          recent: recentSamples.map((sample) => presentSample(sample)),
        },
        items: { total: getAllIndexedItems().length },
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
    return;
  }

  if (body.action === "label") {
    if (!body.image || !body.descriptor) {
      res.status(400).json({ error: "Missing image or descriptor" });
      return;
    }
    try {
      const items = await ensureIndexedItems(body.language);
      if (!items.length) {
        res.status(400).json({ error: "No items available for labeling" });
        return;
      }
      const lookup = buildItemLookup(items);
      const descriptorItems = resolveDescriptorItems(body.descriptor.items, lookup);
      const descriptor = {
        classId: body.descriptor.classId,
        sex: body.descriptor.sex,
        colors: Array.isArray(body.descriptor.colors) ? body.descriptor.colors : [],
        items: descriptorItems,
      };
      const { sample, summary } = await recordLabeledSkinSample(body.image, descriptor, { storeImage: true });
      const classes = await resolveClasses({
        items,
        language: body.language,
        extra: [descriptor.classId],
      });
      let retrained: null | {
        trainedAt: number;
        metadata: SkinRecognizerModel["metadata"];
        samples: number;
        evaluation: ReturnType<typeof summarizeEvaluation>;
      } = null;
      if (body.trainAfter) {
        const model = await trainSkinRecognizer({
          items,
          classes,
          persist: true,
          includeLabeled: body.includeLabeled ?? true,
        });
        const evaluation = body.evaluationSamples
          ? await evaluateSkinRecognizer({
              model,
              items,
              classes,
              samplesPerClass: body.evaluationSamples,
            })
          : null;
        retrained = {
          trainedAt: model.trainedAt,
          metadata: model.metadata,
          samples: model.samples.length,
          evaluation: summarizeEvaluation(evaluation),
        };
      }
      res.status(200).json({
        action: "label",
        sample: presentSample(sample),
        dataset: summary,
        retrained,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
    return;
  }

  if (body.action === "train") {
    const items = await ensureIndexedItems(body.language);
    if (!items.length) {
      res.status(400).json({ error: "No items available for training" });
      return;
    }
    const classes = await resolveClasses({
      requested: body.classes,
      items,
      language: body.language,
    });
    try {
      const persist = body.persist ?? true;
      const model = await trainSkinRecognizer({
        items,
        classes,
        paletteSeeds: body.paletteSeeds,
        samplesPerClass: body.samplesPerClass,
        randomSeed: body.randomSeed,
        persist,
        includeLabeled: body.includeLabeled ?? true,
        updateDataset: true,
        sexes: body.sexes,
      });
      const evaluation = body.evaluationSamples
        ? await evaluateSkinRecognizer({
            model,
            items,
            classes,
            sexes: body.sexes,
            paletteSeeds: body.paletteSeeds,
            samplesPerClass: body.evaluationSamples,
            randomSeed: body.randomSeed,
          })
        : null;
      const dataset = await getSkinRecognizerDatasetSummary();
      res.status(200).json({
        action: "train",
        trained: model.samples.length,
        metadata: model.metadata,
        evaluation: summarizeEvaluation(evaluation),
        dataset,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
    return;
  }

  if (body.action === "autoTrain") {
    const items = await ensureIndexedItems(body.language);
    if (!items.length) {
      res.status(400).json({ error: "No items available for auto training" });
      return;
    }
    const classes = await resolveClasses({
      requested: body.classes,
      items,
      language: body.language,
    });
    const iterations = Math.max(1, Math.min(body.iterations ?? 1, 5));
    try {
      const reports: Array<{
        iteration: number;
        trained: number;
        metadata: SkinRecognizerModel["metadata"];
        evaluation: ReturnType<typeof summarizeEvaluation>;
      }> = [];
      for (let i = 0; i < iterations; i += 1) {
        const iterationSeed = body.randomSeed ? `${body.randomSeed}-${i}` : undefined;
        const model = await trainSkinRecognizer({
          items,
          classes,
          paletteSeeds: body.paletteSeeds,
          samplesPerClass: body.samplesPerClass,
          randomSeed: iterationSeed,
          persist: body.persist ?? i === iterations - 1,
          includeLabeled: body.includeLabeled ?? true,
          updateDataset: true,
          sexes: body.sexes,
        });
        const evaluationReport = await evaluateSkinRecognizer({
          model,
          items,
          classes,
          sexes: body.sexes,
          paletteSeeds: body.paletteSeeds,
          samplesPerClass: body.evaluationSamples ?? 2,
          randomSeed: iterationSeed ? `${iterationSeed}-eval` : undefined,
        });
        reports.push({
          iteration: i + 1,
          trained: model.samples.length,
          metadata: model.metadata,
          evaluation: summarizeEvaluation(evaluationReport),
        });
      }
      const dataset = await getSkinRecognizerDatasetSummary();
      res.status(200).json({ action: "autoTrain", reports, dataset });
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

