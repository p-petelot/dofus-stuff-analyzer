import fs from "fs";
import path from "path";
import type { Candidate, SlotKey } from "../types";
import { resolveCachePath } from "../utils/cache";

const LOG_PATH = resolveCachePath("suggestions-log.jsonl");

function ensureDir(): void {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function logSuggestion(
  inputHash: string,
  slot: SlotKey,
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
