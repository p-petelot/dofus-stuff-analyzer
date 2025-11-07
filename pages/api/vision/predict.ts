import type { NextApiRequest, NextApiResponse } from "next";
import { predictImage } from "../../../lib/vision/dofusVision";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "12mb",
    },
  },
};

function decodeBase64Image(input: string): Buffer {
  const base64 = input.includes(",") ? input.split(",").pop() ?? "" : input;
  return Buffer.from(base64, "base64");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { image, modelDir, imgSize, renderer } = req.body ?? {};
    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Missing image payload" });
    }

    const buffer = decodeBase64Image(image);
    const result = await predictImage({ imageBuffer: buffer, modelDir, imgSize, renderer });
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("Prediction failed", error);
    return res.status(500).json({ error: error?.message ?? "Prediction failed" });
  }
}
