/** @typedef {import("../types").Candidate} Candidate */

/**
 * @param {string} inputHash
 * @param {string} slot
 * @param {Candidate[]} topCandidates
 * @param {Candidate} [chosen]
 */
export function logSuggestion(inputHash, slot, topCandidates, chosen) {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  try {
    const summary = {
      inputHash,
      slot,
      topCandidates: topCandidates.slice(0, 5).map((candidate) => ({
        id: candidate.itemId,
        score: candidate.score,
      })),
      chosen: chosen ? { id: chosen.itemId, score: chosen.score } : null,
      timestamp: new Date().toISOString(),
    };
    // eslint-disable-next-line no-console
    console.debug("suggestion", summary);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Unable to log suggestion", error);
  }
}
