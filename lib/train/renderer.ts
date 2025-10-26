import { Buffer } from "buffer";
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

function asDataUrl(buffer: ArrayBuffer, contentType: string): string {
  const bytes = Buffer.from(buffer);
  const base64 = bytes.toString("base64");
  return `data:${contentType};base64,${base64}`;
}

async function performRender(candidate: GeneratedCandidate): Promise<string | null> {
  try {
    const payload = buildPayload(candidate);
    const response = await fetch(RENDERER_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "image/png,application/json;q=0.8,*/*;q=0.5",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "image/png";
    if (contentType.includes("image/")) {
      const buffer = await response.arrayBuffer();
      return asDataUrl(buffer, contentType.split(";")[0]);
    }
    // Some deployments can return JSON with a remote URL fallback.
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as RendererResult | { url?: string };
      if (typeof parsed === "object" && parsed) {
        if ("imageUrl" in parsed && typeof parsed.imageUrl === "string") {
          return parsed.imageUrl;
        }
        if ("url" in parsed && typeof parsed.url === "string") {
          return parsed.url;
        }
      }
    } catch (error) {
      console.warn("renderer unexpected payload", error, text);
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
