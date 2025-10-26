import type { NextApiRequest, NextApiResponse } from "next";
import { submitFeedback } from "../../../lib/train/manager";

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok: boolean } | { error: string }>,
): void {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const { candidateId, like } = req.body ?? {};
  if (!candidateId || typeof candidateId !== "string") {
    res.status(400).json({ error: "Missing candidateId" });
    return;
  }
  submitFeedback(candidateId, Boolean(like));
  res.status(200).json({ ok: true });
}
