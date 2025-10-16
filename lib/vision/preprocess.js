import crypto from "crypto";
import { DEFAULT_IMAGE_SIZE, SLOTS, VISIBILITY_THRESHOLDS, HARD_CHECKS } from "../config/suggestions";

/** @typedef {import("../types").BoundingBox} BoundingBox */
/** @typedef {import("../types").FourSlot} FourSlot */
/** @typedef {import("../types").ImageDataLike} ImageDataLike */

const ROI = {
  coiffe: { x: 0.34, y: 0.05, width: 0.32, height: 0.26 },
  cape: { x: 0.22, y: 0.28, width: 0.56, height: 0.44 },
  bouclier: { x: 0.62, y: 0.32, width: 0.24, height: 0.32 },
  familier: { x: 0.38, y: 0.62, width: 0.24, height: 0.26 },
};

/**
 * Decode binary or base64 encoded image input.
 * @param {Buffer | string} image
 * @returns {Buffer}
 */
function decode(image) {
  if (Buffer.isBuffer(image)) return image;
  if (typeof image !== "string") throw new TypeError("Unsupported image input format");
  const trimmed = image.trim();
  if (trimmed.startsWith("data:")) {
    const base64 = trimmed.split(",").pop() ?? "";
    return Buffer.from(base64, "base64");
  }
  if (/^[A-Za-z0-9+/=]+$/.test(trimmed)) {
    return Buffer.from(trimmed, "base64");
  }
  return Buffer.from(trimmed);
}

/**
 * Build a deterministic 512×512 image placeholder so the rest of the pipeline
 * can operate without native image tooling. The alpha channel carries a coarse mask.
 * @param {Buffer} buffer
 * @returns {ImageDataLike}
 */
function syntheticImage(buffer) {
  const width = DEFAULT_IMAGE_SIZE;
  const height = DEFAULT_IMAGE_SIZE;
  const digest = crypto.createHash("sha1").update(buffer).digest();
  const data = new Uint8ClampedArray(width * height * 4);
  const maskBand = digest[6] / 255;
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x + y) / (width + height);
      const r = (digest[0] * (1 - t) + digest[3] * t) % 256;
      const g = (digest[1] * (1 - t) + digest[4] * t) % 256;
      const b = (digest[2] * (1 - t) + digest[5] * t) % 256;
      const alpha = 200 + Math.round(55 * Math.sin((x * y * maskBand) / (width * height / 8 + 1)));
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = alpha;
      offset += 4;
    }
  }
  return { width, height, data };
}

/**
 * Extract a single-channel foreground mask from a normalized image.
 * @param {ImageDataLike} img
 * @returns {Uint8Array}
 */
function buildMask(img) {
  const mask = new Uint8Array(img.width * img.height);
  for (let i = 0; i < img.width * img.height; i += 1) {
    const alpha = img.data[i * 4 + 3];
    mask[i] = alpha > 96 ? 1 : 0;
  }
  return mask;
}

/**
 * Normalise arbitrary input into a predictable 512×512 canvas and mask.
 * @param {Buffer | string} image
 * @returns {{ img512: ImageDataLike; mask: Uint8Array }}
 */
export function normalizeInput(image) {
  const buffer = decode(image);
  const img512 = syntheticImage(buffer);
  const mask = buildMask(img512);
  return { img512, mask };
}

/**
 * Compute simple variance inside the ROI as a proxy for edge density.
 * @param {ImageDataLike} img
 * @param {BoundingBox} box
 * @returns {number}
 */
function estimateEdgeDensity(img, box) {
  const startX = Math.max(0, Math.floor(box.x));
  const startY = Math.max(0, Math.floor(box.y));
  const endX = Math.min(img.width, Math.ceil(box.x + box.width));
  const endY = Math.min(img.height, Math.ceil(box.y + box.height));
  let last = null;
  let total = 0;
  let count = 0;
  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * img.width + x) * 4;
      const value = img.data[index] * 0.3 + img.data[index + 1] * 0.59 + img.data[index + 2] * 0.11;
      if (last != null) {
        total += Math.abs(value - last);
        count += 1;
      }
      last = value;
    }
  }
  if (!count) return 0;
  return total / (count * 255);
}

/**
 * Analyse fixed ROIs to determine bounding boxes and visibility flags for the four slots.
 * @param {ImageDataLike} img512
 * @param {Uint8Array} mask
 * @returns {{ boxes: Record<FourSlot, BoundingBox>; visibility: Record<FourSlot, "ok"|"low"> }}
 */
export function locateFourSlots(img512, mask) {
  const boxes = /** @type {Record<FourSlot, BoundingBox>} */ ({});
  const visibility = /** @type {Record<FourSlot, "ok"|"low">} */ ({});
  for (const slot of SLOTS) {
    const roi = ROI[slot];
    const box = {
      x: roi.x * img512.width,
      y: roi.y * img512.height,
      width: roi.width * img512.width,
      height: roi.height * img512.height,
    };
    boxes[slot] = box;
    let coverage = 0;
    const stepX = Math.max(1, Math.floor(box.width / 48));
    const stepY = Math.max(1, Math.floor(box.height / 48));
    let samples = 0;
    for (let y = Math.floor(box.y); y < Math.floor(box.y + box.height); y += stepY) {
      for (let x = Math.floor(box.x); x < Math.floor(box.x + box.width); x += stepX) {
        const clampedX = Math.min(Math.max(x, 0), img512.width - 1);
        const clampedY = Math.min(Math.max(y, 0), img512.height - 1);
        const idx = clampedY * img512.width + clampedX;
        coverage += mask[idx];
        samples += 1;
      }
    }
    const coverageRatio = samples ? coverage / samples : 0;
    const edgeDensity = estimateEdgeDensity(img512, box);
    const visible =
      coverageRatio >= VISIBILITY_THRESHOLDS.coverage && edgeDensity >= Math.min(VISIBILITY_THRESHOLDS.edgeDensity, HARD_CHECKS.minEdgeDensity);
    visibility[slot] = visible ? "ok" : "low";
  }
  return { boxes, visibility };
}

/**
 * Utility used by downstream modules to crop from the normalized image.
 * @param {ImageDataLike} img
 * @param {BoundingBox} box
 * @returns {ImageDataLike}
 */
export function crop(img, box) {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(img.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(img.height, Math.ceil(box.y + box.height));
  const width = Math.max(1, x1 - x0);
  const height = Math.max(1, y1 - y0);
  const data = new Uint8ClampedArray(width * height * 4);
  let offset = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const src = (y * img.width + x) * 4;
      data[offset] = img.data[src];
      data[offset + 1] = img.data[src + 1];
      data[offset + 2] = img.data[src + 2];
      data[offset + 3] = img.data[src + 3];
      offset += 4;
    }
  }
  return { width, height, data };
}
