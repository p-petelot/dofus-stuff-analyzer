import type { NextApiRequest, NextApiResponse } from "next";
import { startTrainingRun } from "../../../lib/train/manager";
import type { TrainingRunRecord } from "../../../lib/train/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TrainingRunRecord | { error: string }>,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  try {
    const { maxIterations, batchSize, seed, eliteCount } = req.body ?? {};
    const run = await startTrainingRun({ maxIterations, batchSize, seed, eliteCount });
    res.status(200).json(run);
  } catch (error) {
    console.error("train/start error", error);
    res.status(500).json({ error: "Failed to start training" });
  }
}
