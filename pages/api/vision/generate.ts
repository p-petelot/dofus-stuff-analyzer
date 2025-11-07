import type { NextApiRequest, NextApiResponse } from "next";
import { generateDataset } from "../../../lib/vision/dofusVision";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "512kb",
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
    await generateDataset(options);
    return res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error("Generation failed", error);
    return res.status(500).json({ error: error?.message ?? "Dataset generation failed" });
  }
}
