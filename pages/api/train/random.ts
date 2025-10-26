import type { NextApiRequest, NextApiResponse } from "next";
import { generateCandidate } from "../../../lib/train/generator";
import { enqueueRender } from "../../../lib/train/renderer";
import type { GeneratedCandidate } from "../../../lib/train/types";

interface RandomGenerationBody {
  count?: number;
  coherentColors?: boolean;
}

interface RandomGenerationResponse {
  candidates: GeneratedCandidate[];
}

const DEFAULT_COUNT = 12;
const MAX_COUNT = 24;

function sanitizeCount(value: unknown): number {
  if (Array.isArray(value)) {
    return sanitizeCount(value[0]);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(Math.max(Math.floor(value), 1), MAX_COUNT);
  }
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(Math.max(Math.floor(parsed), 1), MAX_COUNT);
    }
  }
  return DEFAULT_COUNT;
}

function sanitizeBoolean(value: unknown): boolean {
  if (Array.isArray(value)) {
    return sanitizeBoolean(value[value.length - 1]);
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return ["1", "true", "vrai", "oui", "on"].includes(normalized);
  }
  return Boolean(value);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RandomGenerationResponse | { error: string }>,
): Promise<void> {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = (req.method === "POST" ? req.body : null) as RandomGenerationBody | null;
    const count = sanitizeCount(body?.count ?? req.query.count);
    const coherentColors = sanitizeBoolean(body?.coherentColors ?? req.query.coherentColors);

    const candidates: GeneratedCandidate[] = [];
    for (let index = 0; index < count; index += 1) {
      // eslint-disable-next-line no-await-in-loop -- sequential seeding keeps variety
      const candidate = await generateCandidate({ enforceColorCoherence: coherentColors });
      candidates.push(candidate);
    }

    const rendered = await Promise.all(
      candidates.map(async (candidate, index) => {
        const imageUrl = await enqueueRender(candidate);
        return { ...candidate, imageUrl, generation: index + 1 };
      }),
    );

    res.status(200).json({ candidates: rendered });
  } catch (error) {
    console.error("training random generation failed", error);
    res.status(500).json({ error: "Generation failed" });
  }
}
