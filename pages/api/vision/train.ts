import type { NextApiRequest, NextApiResponse } from "next";
import { trainModel } from "../../../lib/vision/dofusVision";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const options = req.body ?? {};
    const report = await trainModel(options);
    return res.status(200).json(report);
  } catch (error: any) {
    console.error("Training failed", error);
    return res.status(500).json({ error: error?.message ?? "Training failed" });
  }
}
