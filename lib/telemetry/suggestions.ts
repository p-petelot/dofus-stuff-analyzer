import fs from "fs";
import path from "path";
import type { Candidate, FourSlot } from "../types";

const LOG_PATH = path.join(process.cwd(), ".cache", "suggestions-log.jsonl");

function ensureDir(): void {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function logSuggestion(
  inputHash: string,
  slot: FourSlot,
  topCandidates: Candidate[],
  chosen?: Candidate,
): void {
  try {
    ensureDir();
    const payload = {
      timestamp: Date.now(),
      inputHash,
      slot,
      topCandidates: topCandidates.slice(0, 5).map((candidate) => ({
        itemId: candidate.itemId,
        score: candidate.score,
        mode: candidate.mode,
        verified: candidate.verified,
      })),
      chosen: chosen ? { itemId: chosen.itemId, score: chosen.score } : null,
    };
    fs.appendFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`);
  } catch (error) {
    console.warn("Failed to log suggestion", error);
  }
}
