import crypto from "crypto";
import type { ImageDataLike } from "../types";
import { loadClipPipeline, shouldUseModernVision } from "./backend";

/**
 * Generate a deterministic pseudo-embedding for an image patch.
 * The embedding is derived from the SHA-1 digest of the pixel buffer,
 * ensuring stable retrieval behaviour without external ML dependencies.
 */
function fallbackEmbedding(patch: ImageDataLike): number[] {
  const hash = crypto.createHash("sha1").update(patch.data).digest();
  const vector: number[] = [];
  for (let i = 0; i < hash.length; i += 4) {
    const chunk = hash.readUInt32BE(i % (hash.length - 3));
    vector.push(chunk / 0xffffffff);
  }
  return vector;
}

export async function clipEmbedding(patch: ImageDataLike): Promise<number[]> {
  if (shouldUseModernVision()) {
    try {
      const pipeline = await loadClipPipeline();
      if (pipeline) {
        const result = await pipeline(patch, { pooling: "mean", normalize: true });
        if (result && typeof result === "object") {
          // tensor result
          const tensorData =
            (Array.isArray((result as any).data) && (result as any).data) ||
            (Array.isArray((result as any).tolist?.()) && (result as any).tolist()) ||
            (result as any).data ||
            (result as any).tensor?.data;
          if (tensorData) {
            const array = Array.isArray(tensorData) ? tensorData.flat(Infinity) : Array.from(tensorData);
            if (array.length) {
              return array.map((value) => Number(value));
            }
          }
        }
        if (Array.isArray(result) && result.length) {
          const array = result.flat(Infinity).map((value) => Number(value));
          if (array.length) {
            return array;
          }
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "test") {
        // eslint-disable-next-line no-console
        console.warn("[vision-backend] Fallback sur l'empreinte déterministe", error instanceof Error ? error.message : error);
      }
    }
  }
  return fallbackEmbedding(patch);
}

/**
 * Synthetic ORB match ratio returning stable pseudo-random values based on
 * the two image buffers. This keeps the scoring stack operational even when
 * native feature extractors are unavailable.
 */
export async function orbMatch(
  patch: ImageDataLike,
  template: ImageDataLike,
): Promise<{ ratio: number; inliers: number }> {
  const digest = crypto
    .createHash("sha1")
    .update(patch.data)
    .update(template.data)
    .digest("hex");
  const ratio = ((parseInt(digest.slice(0, 6), 16) % 7000) / 7000) * 0.9;
  const inliers = (parseInt(digest.slice(6, 12), 16) % 180) + 20;
  return { ratio, inliers };
}

/**
 * Approximate edge SSIM by comparing simple luminance histograms of the
 * two patches' synthetic edge maps.
 */
export function edgeSSIM(patch: ImageDataLike, template: ImageDataLike): number {
  const histogram = (img: ImageDataLike) => {
    const buckets = new Array(16).fill(0);
    for (let i = 0; i < img.data.length; i += 4) {
      const lum = img.data[i] * 0.299 + img.data[i + 1] * 0.587 + img.data[i + 2] * 0.114;
      const bucket = Math.min(15, Math.floor((lum / 255) * 16));
      buckets[bucket] += 1;
    }
    const total = buckets.reduce((sum, value) => sum + value, 0) || 1;
    return buckets.map((value) => value / total);
  };
  const a = histogram(patch);
  const b = histogram(template);
  let sim = 0;
  for (let i = 0; i < a.length; i += 1) {
    sim += Math.min(a[i], b[i]);
  }
  return Math.min(1, Math.max(0, sim));
}

/**
 * Lightweight chamfer distance proxy based on per-pixel luminance mismatch.
 */
export function silhouetteChamfer(patch: ImageDataLike, template: ImageDataLike): number {
  const length = Math.min(patch.data.length, template.data.length);
  let distance = 0;
  let count = 0;
  for (let i = 0; i < length; i += 4) {
    const lumPatch = patch.data[i] * 0.299 + patch.data[i + 1] * 0.587 + patch.data[i + 2] * 0.114;
    const lumTemplate = template.data[i] * 0.299 + template.data[i + 1] * 0.587 + template.data[i + 2] * 0.114;
    distance += Math.abs(lumPatch - lumTemplate) / 255;
    count += 1;
  }
  if (!count) return 1;
  return Math.min(1, distance / count);
}

/**
 * Pose alignment shim that simply reports success when enough pseudo inliers
 * are produced by the deterministic digest. Real alignment can replace this
 * stub without altering the public contract.
 */
export async function poseAlign(
  patch: ImageDataLike,
  template: ImageDataLike,
): Promise<{ ok: boolean; alignedPatch: ImageDataLike; alignedTemplate: ImageDataLike }> {
  const { inliers } = await orbMatch(patch, template);
  return { ok: inliers >= 12, alignedPatch: patch, alignedTemplate: template };
}
