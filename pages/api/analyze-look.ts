import type { NextApiRequest, NextApiResponse } from "next";
import { predictLookAttributes } from "../../lib/vision/predict";

interface AnalyzeLookRequestBody {
  image: string;
  k?: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  try {
    const body = req.body as AnalyzeLookRequestBody;
    if (!body?.image) {
      res.status(400).json({ error: "Image manquante" });
      return;
    }

    const prediction = await predictLookAttributes(body.image, { k: body.k });
    res.status(200).json(prediction);
  } catch (error) {
    console.error("analyze-look error", error);
    res.status(500).json({ error: "Analyse impossible" });
  }
}
