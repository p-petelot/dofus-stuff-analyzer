import crypto from "crypto";
import { DEFAULT_IMAGE_SIZE } from "../config/suggestions";
import type { CandidateRef, ImageDataLike } from "../types";

function synthValue(hash: Buffer, index: number): number {
  return hash[index % hash.length];
}

/**
 * Create a deterministic pseudo-template for an indexed item so that the
 * structural heuristics (ORB/SSIM/chamfer) remain stable in environments
 * without real sprite rasterisation.
 */
export function renderCandidateTemplate(
  candidate: CandidateRef,
  patch: ImageDataLike,
): ImageDataLike {
  const width = Math.max(1, patch.width);
  const height = Math.max(1, patch.height);
  const seed = `${candidate.itemId}-${candidate.label}-${candidate.sprite ?? ""}`;
  const digest = crypto.createHash("sha1").update(seed).digest();
  const data = new Uint8ClampedArray(width * height * 4);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const mix = (x * DEFAULT_IMAGE_SIZE + y) % digest.length;
      const base = synthValue(digest, mix);
      const r = (base + synthValue(digest, mix + 3)) % 256;
      const g = (base + synthValue(digest, mix + 7)) % 256;
      const b = (base + synthValue(digest, mix + 11)) % 256;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 200;
      offset += 4;
    }
  }
  return { width, height, data };
}
