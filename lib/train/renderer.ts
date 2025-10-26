import type { GeneratedCandidate, RendererPayload, RendererResult, TrainingSlotKey } from "./types";

const RENDERER_ENDPOINT = "https://skin.souff.fr/renderer/";
const MAX_CONCURRENCY = 3;

interface RenderJob {
  candidate: GeneratedCandidate;
  resolve: (value: string | null) => void;
  reject: (error: Error) => void;
}

const queue: RenderJob[] = [];
let active = 0;

function buildPayload(candidate: GeneratedCandidate): RendererPayload {
  const items = candidate.items.reduce((acc, pick) => {
    acc[pick.slot] = pick.item?.id ?? null;
    return acc;
  }, {} as Record<TrainingSlotKey, number | null>);
  return {
    classKey: candidate.classKey,
    sex: candidate.sex,
    colors: candidate.palette.colors,
    items,
  };
}

async function performRender(candidate: GeneratedCandidate): Promise<string | null> {
  try {
    const payload = buildPayload(candidate);
    const response = await fetch(RENDERER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return null;
    }
    const result = (await response.json()) as RendererResult | { url?: string };
    if ("imageUrl" in result && typeof result.imageUrl === "string") {
      return result.imageUrl;
    }
    if ("url" in result && typeof result.url === "string") {
      return result.url;
    }
    return null;
  } catch (error) {
    console.warn("renderer call failed", error);
    return null;
  }
}

function processQueue(): void {
  if (active >= MAX_CONCURRENCY) {
    return;
  }
  const job = queue.shift();
  if (!job) {
    return;
  }
  active += 1;
  performRender(job.candidate)
    .then((url) => job.resolve(url))
    .catch((error) => job.reject(error))
    .finally(() => {
      active -= 1;
      setTimeout(processQueue, 10);
    });
}

export function enqueueRender(candidate: GeneratedCandidate): Promise<string | null> {
  return new Promise((resolve, reject) => {
    queue.push({ candidate, resolve, reject });
    processQueue();
  });
}
