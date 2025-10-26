import type { NextApiRequest, NextApiResponse } from "next";
import { stopTrainingRun } from "../../../lib/train/manager";
import type { TrainingRunRecord } from "../../../lib/train/types";

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<TrainingRunRecord | { error: string }>,
): void {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { runId } = req.body ?? {};
  if (!runId || typeof runId !== "string") {
    res.status(400).json({ error: "Missing runId" });
    return;
  }
  try {
    const run = stopTrainingRun(runId);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.status(200).json(run);
  } catch (error) {
    console.error("train/stop error", error);
    res.status(500).json({ error: "Failed to stop training" });
  }
}
