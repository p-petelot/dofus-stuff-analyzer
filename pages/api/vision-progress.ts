import type { NextApiRequest, NextApiResponse } from "next";
import { loadTrainingState } from "../../lib/vision/progress";
import { readVisionIndex } from "../../lib/vision/index";

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const progress = loadTrainingState();
  const index = readVisionIndex();

  res.setHeader("Cache-Control", "no-store");
  const status = progress.current ? progress.current.status : "idle";
  const lastRun = progress.current ?? progress.history[0] ?? null;

  res.status(200).json({
    status,
    current: progress.current,
    lastRun,
    history: progress.history,
    latestIndex: index
      ? {
          updatedAt: index.updatedAt,
          entryCount: index.entries.length,
          datasetPath: index.meta.datasetPath,
          datasetSize: index.meta.datasetSize,
          clipModel: index.meta.clipModel ?? null,
        }
      : null,
  });
}
