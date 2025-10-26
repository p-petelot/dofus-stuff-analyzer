import type { NextApiRequest, NextApiResponse } from "next";
import { getTrainingStatus } from "../../../lib/train/manager";
import type { TrainingRunRecord } from "../../../lib/train/types";

interface StatusResponse {
  runs: TrainingRunRecord[];
  activeRunId: string | null;
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<StatusResponse | TrainingRunRecord | { error: string }>,
): void {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { runId } = req.query;
  const status = getTrainingStatus();
  if (typeof runId === "string" && runId) {
    const run = status.runs.find((entry) => entry.id === runId);
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.status(200).json(run);
    return;
  }
  res.status(200).json(status);
}
