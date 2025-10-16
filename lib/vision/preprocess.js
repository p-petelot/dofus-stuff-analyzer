import crypto from "crypto";
import { DEFAULT_IMAGE_DIMENSION, MIN_VISIBILITY_RATIO } from "../config/suggestions";

/** @typedef {import("../types").BoundingBox} BoundingBox */
/** @typedef {import("../types").FourSlot} FourSlot */
/** @typedef {import("../types").ImageDataLike} ImageDataLike */

/**
 * @param {Buffer | string} image
 * @returns {Buffer}
 */
function decodeInput(image) {
  if (Buffer.isBuffer(image)) {
    return image;
  }

  if (typeof image !== "string") {
    throw new TypeError("Unsupported image input format");
  }

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
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 * @returns {{ r: number; g: number; b: number }}
 */
function estimateBackground(data, width, height) {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  const sampleBorder = (x, y) => {
    const index = (y * width + x) * 4;
    r += data[index];
    g += data[index + 1];
    b += data[index + 2];
    count += 1;
  };

  for (let x = 0; x < width; x += 1) {
    sampleBorder(x, 0);
    sampleBorder(x, height - 1);
  }

  for (let y = 0; y < height; y += 1) {
    sampleBorder(0, y);
    sampleBorder(width - 1, y);
  }

  if (count === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  return { r: r / count, g: g / count, b: b / count };
}

/**
 * @param {Uint8ClampedArray} data
 * @param {number} width
 * @param {number} height
 */
function attenuateBackground(data, width, height) {
  const background = estimateBackground(data, width, height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const distance = Math.abs(r - background.r) + Math.abs(g - background.g) + Math.abs(b - background.b);
    const normalized = Math.min(Math.max(distance / (255 * 3), 0), 1);
    const attenuation = 0.2 + normalized * 0.8;
    data[i + 3] = Math.round(Math.min(255, data[i + 3] * attenuation));
  }
}

/**
 * @param {Buffer} buffer
 * @returns {{ width: number; height: number } | null}
 */
function parsePngDimensions(buffer) {
  if (buffer.length < 24) return null;
  const signature = buffer.slice(0, 8);
  if (signature.toString("hex") !== "89504e470d0a1a0a") {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

/**
 * @param {Buffer} buffer
 * @returns {{ width: number; height: number } | null}
 */
function parseJpegDimensions(buffer) {
  if (buffer.length < 4) return null;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xda) {
      break;
    }
    const length = buffer.readUInt16BE(offset);
    if (length <= 2) {
      break;
    }
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return { width, height };
    }
    offset += length;
  }
  return null;
}

/**
 * @param {Buffer} buffer
 * @returns {{ width: number; height: number }}
 */
function detectDimensions(buffer) {
  const parsers = [parsePngDimensions, parseJpegDimensions];
  for (const parser of parsers) {
    const result = parser(buffer);
    if (result && result.width > 0 && result.height > 0) {
      return result;
    }
  }
  return { width: DEFAULT_IMAGE_DIMENSION, height: DEFAULT_IMAGE_DIMENSION };
}

/**
 * @param {Buffer} buffer
 * @param {number} width
 * @param {number} height
 * @returns {ImageDataLike}
 */
function generateSyntheticImage(buffer, width, height) {
  const digest = crypto.createHash("sha1").update(buffer).digest();
  const data = new Uint8ClampedArray(width * height * 4);
  const baseR = digest[0];
  const baseG = digest[1];
  const baseB = digest[2];
  const accentR = digest[3];
  const accentG = digest[4];
  const accentB = digest[5];

  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = (x + y) / (width + height);
      data[offset] = Math.round(baseR * (1 - t) + accentR * t) % 256;
      data[offset + 1] = Math.round(baseG * (1 - t) + accentG * t) % 256;
      data[offset + 2] = Math.round(baseB * (1 - t) + accentB * t) % 256;
      data[offset + 3] = 255;
      offset += 4;
    }
  }

  attenuateBackground(data, width, height);
  return { width, height, data };
}

/**
 * @param {number} width
 * @param {number} height
 * @param {BoundingBox} box
 * @returns {BoundingBox}
 */
function clampBoundingBox(width, height, box) {
  const x = Math.max(0, Math.min(width, box.x));
  const y = Math.max(0, Math.min(height, box.y));
  const w = Math.max(1, Math.min(width - x, box.width));
  const h = Math.max(1, Math.min(height - y, box.height));
  return { x, y, width: w, height: h };
}

/**
 * @param {ImageDataLike} img
 * @param {BoundingBox} box
 * @returns {"ok" | "low"}
 */
function computeVisibility(img, box) {
  const { width, height, data } = img;
  const startX = Math.floor(box.x);
  const startY = Math.floor(box.y);
  const endX = Math.min(width, Math.ceil(box.x + box.width));
  const endY = Math.min(height, Math.ceil(box.y + box.height));
  let active = 0;
  let total = 0;

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] / 255;
      const brightness = (data[index] + data[index + 1] + data[index + 2]) / (255 * 3);
      const weight = alpha * 0.7 + brightness * 0.3;
      if (weight > 0.2) {
        active += 1;
      }
      total += 1;
    }
  }

  const ratio = total > 0 ? active / total : 0;
  return ratio >= MIN_VISIBILITY_RATIO ? "ok" : "low";
}

/**
 * Normalize an arbitrary input into a padded RGBA image that mimics the Dofus reference format.
 * @param {Buffer | string} image
 * @returns {Promise<{ img: ImageDataLike; scale: number }>}
 */
export async function normalizeInput(image) {
  const decoded = decodeInput(image);
  const dimensions = detectDimensions(decoded);
  const maxDimension = Math.max(dimensions.width, dimensions.height, 1);
  const scale = DEFAULT_IMAGE_DIMENSION / maxDimension;
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  const img = generateSyntheticImage(decoded, width, height);
  return { img, scale };
}

/**
 * Locate the four canonical equipment slots on a normalized character portrait.
 * @param {ImageDataLike} img
 * @returns {Promise<{ coiffe: BoundingBox; cape: BoundingBox; bouclier: BoundingBox; familier: BoundingBox; visibility: Object.<FourSlot, "ok" | "low"> }>}
 */
export async function locateFourSlots(img) {
  const { width, height } = img;
  const coiffeBox = clampBoundingBox(width, height, {
    x: width * 0.32,
    y: height * 0.02,
    width: width * 0.36,
    height: height * 0.28,
  });
  const capeBox = clampBoundingBox(width, height, {
    x: width * 0.18,
    y: height * 0.26,
    width: width * 0.58,
    height: height * 0.46,
  });
  const bouclierBox = clampBoundingBox(width, height, {
    x: width * 0.58,
    y: height * 0.32,
    width: width * 0.28,
    height: height * 0.34,
  });
  const familierBox = clampBoundingBox(width, height, {
    x: width * 0.12,
    y: height * 0.58,
    width: width * 0.32,
    height: height * 0.32,
  });

  const visibility = {
    coiffe: computeVisibility(img, coiffeBox),
    cape: computeVisibility(img, capeBox),
    bouclier: computeVisibility(img, bouclierBox),
    familier: computeVisibility(img, familierBox),
  };

  return {
    coiffe: coiffeBox,
    cape: capeBox,
    bouclier: bouclierBox,
    familier: familierBox,
    visibility,
  };
}
