import crypto from "crypto";
import { inflateSync } from "zlib";

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const SYNTHETIC_DEFAULT_WIDTH = 320;
const SYNTHETIC_DEFAULT_HEIGHT = 480;

function isPng(buffer: Buffer): boolean {
  return buffer.length >= 8 && PNG_SIGNATURE.equals(buffer.subarray(0, 8));
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function applyPngFilter(filterType: number, row: Uint8Array, prev: Uint8Array, bytesPerPixel: number): void {
  switch (filterType) {
    case 0:
      return;
    case 1:
      for (let i = bytesPerPixel; i < row.length; i += 1) {
        row[i] = (row[i] + row[i - bytesPerPixel]) & 0xff;
      }
      return;
    case 2:
      for (let i = 0; i < row.length; i += 1) {
        row[i] = (row[i] + prev[i]) & 0xff;
      }
      return;
    case 3:
      for (let i = 0; i < row.length; i += 1) {
        const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
        const up = prev[i];
        row[i] = (row[i] + Math.floor((left + up) / 2)) & 0xff;
      }
      return;
    case 4:
      for (let i = 0; i < row.length; i += 1) {
        const left = i >= bytesPerPixel ? row[i - bytesPerPixel] : 0;
        const up = prev[i];
        const upLeft = i >= bytesPerPixel ? prev[i - bytesPerPixel] : 0;
        row[i] = (row[i] + paethPredictor(left, up, upLeft)) & 0xff;
      }
      return;
    default:
      throw new Error(`Unsupported PNG filter type: ${filterType}`);
  }
}

interface PngDecodeOptions {
  width: number;
  height: number;
  colorType: number;
  bitDepth: number;
  palette: Uint8Array | null;
  transparency: Uint8Array | null;
  interlace: number;
  data: Buffer[];
}

function decodePng(buffer: Buffer): ImageDataLike {
  const opts: PngDecodeOptions = {
    width: 0,
    height: 0,
    colorType: 0,
    bitDepth: 0,
    palette: null,
    transparency: null,
    interlace: 0,
    data: [],
  };

  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    offset += 4;
    const type = buffer.toString("ascii", offset, offset + 4);
    offset += 4;
    const chunkData = buffer.subarray(offset, offset + length);
    offset += length;
    offset += 4; // skip CRC

    switch (type) {
      case "IHDR":
        opts.width = chunkData.readUInt32BE(0);
        opts.height = chunkData.readUInt32BE(4);
        opts.bitDepth = chunkData[8];
        opts.colorType = chunkData[9];
        opts.interlace = chunkData[12];
        break;
      case "PLTE":
        opts.palette = new Uint8Array(chunkData);
        break;
      case "tRNS":
        opts.transparency = new Uint8Array(chunkData);
        break;
      case "IDAT":
        opts.data.push(chunkData);
        break;
      case "IEND":
        offset = buffer.length;
        break;
      default:
        break;
    }
  }

  if (!opts.width || !opts.height) {
    throw new Error("Invalid PNG: missing dimensions");
  }
  if (opts.bitDepth !== 8) {
    throw new Error("Unsupported PNG bit depth; only 8-bit supported");
  }
  if (opts.interlace !== 0) {
    throw new Error("Interlaced PNG images are not supported");
  }

  const compressed = Buffer.concat(opts.data);
  const decompressed = inflateSync(compressed);

  const bytesPerPixel = (() => {
    switch (opts.colorType) {
      case 0:
        return 1;
      case 2:
        return 3;
      case 3:
        return 1;
      case 4:
        return 2;
      case 6:
        return 4;
      default:
        throw new Error(`Unsupported PNG color type: ${opts.colorType}`);
    }
  })();

  const stride = opts.width * bytesPerPixel;
  const rowLength = stride + 1;
  if (decompressed.length !== rowLength * opts.height) {
    throw new Error("Corrupt PNG data");
  }

  const output = new Uint8ClampedArray(opts.width * opts.height * 4);
  const row = new Uint8Array(stride);
  const prev = new Uint8Array(stride);

  for (let y = 0; y < opts.height; y += 1) {
    const rowStart = y * rowLength;
    const filterType = decompressed[rowStart];
    row.set(decompressed.subarray(rowStart + 1, rowStart + 1 + stride));
    applyPngFilter(filterType, row, prev, bytesPerPixel);

    for (let x = 0; x < opts.width; x += 1) {
      const dstIndex = (y * opts.width + x) * 4;
      switch (opts.colorType) {
        case 0: {
          const gray = row[x];
          output[dstIndex] = gray;
          output[dstIndex + 1] = gray;
          output[dstIndex + 2] = gray;
          output[dstIndex + 3] = opts.transparency ? opts.transparency[0] ?? 255 : 255;
          break;
        }
        case 2: {
          const srcIndex = x * 3;
          output[dstIndex] = row[srcIndex];
          output[dstIndex + 1] = row[srcIndex + 1];
          output[dstIndex + 2] = row[srcIndex + 2];
          output[dstIndex + 3] = 255;
          break;
        }
        case 3: {
          if (!opts.palette) {
            throw new Error("PNG palette missing");
          }
          const index = row[x];
          const paletteIndex = index * 3;
          output[dstIndex] = opts.palette[paletteIndex] ?? 0;
          output[dstIndex + 1] = opts.palette[paletteIndex + 1] ?? 0;
          output[dstIndex + 2] = opts.palette[paletteIndex + 2] ?? 0;
          if (opts.transparency && index < opts.transparency.length) {
            output[dstIndex + 3] = opts.transparency[index];
          } else {
            output[dstIndex + 3] = 255;
          }
          break;
        }
        case 4: {
          const srcIndex = x * 2;
          const gray = row[srcIndex];
          output[dstIndex] = gray;
          output[dstIndex + 1] = gray;
          output[dstIndex + 2] = gray;
          output[dstIndex + 3] = row[srcIndex + 1];
          break;
        }
        case 6: {
          const srcIndex = x * 4;
          output[dstIndex] = row[srcIndex];
          output[dstIndex + 1] = row[srcIndex + 1];
          output[dstIndex + 2] = row[srcIndex + 2];
          output[dstIndex + 3] = row[srcIndex + 3];
          break;
        }
        default:
          throw new Error("Unsupported PNG color type");
      }
    }

    prev.set(row);
  }

  return { width: opts.width, height: opts.height, data: output };
}

function createSyntheticImage(buffer: Buffer, width: number, height: number): ImageDataLike {
  const digest = crypto.createHash("sha256").update(buffer).digest();
  const palette = new Array(8).fill(null).map((_, index) => {
    const base = (index * 3) % digest.length;
    return [digest[base], digest[(base + 1) % digest.length], digest[(base + 2) % digest.length]];
  });

  let seed = digest.readUInt32BE(0);
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const data = new Uint8ClampedArray(width * height * 4);
  const length = buffer.length || 1;

  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const bufferIndex = (i * 37) % length;
    const paletteIndex = (buffer[bufferIndex] + i) % palette.length;
    const [baseR, baseG, baseB] = palette[paletteIndex];
    const noise = random();

    data[offset] = Math.min(255, Math.max(0, Math.round(baseR * (0.6 + noise * 0.4))));
    data[offset + 1] = Math.min(255, Math.max(0, Math.round(baseG * (0.6 + noise * 0.4))));
    data[offset + 2] = Math.min(255, Math.max(0, Math.round(baseB * (0.6 + noise * 0.4))));
    data[offset + 3] = 255;
  }

  return { width, height, data };
}

interface Dimensions {
  width: number;
  height: number;
}

function probePngDimensions(buffer: Buffer): Dimensions | null {
  if (!isPng(buffer)) {
    return null;
  }
  if (buffer.length < 24) {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

function probeJpegDimensions(buffer: Buffer): Dimensions | null {
  if (!isJpeg(buffer)) {
    return null;
  }
  let offset = 2;
  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = buffer[offset + 1];
    while (marker === 0xff) {
      offset += 1;
      marker = buffer[offset + 1];
    }
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    if (offset + 2 > buffer.length) {
      break;
    }
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) {
      break;
    }
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      if (width && height) {
        return { width, height };
      }
    }
    offset += length;
  }
  return null;
}

export function probeImageDimensions(buffer: Buffer): Dimensions {
  return probePngDimensions(buffer) ?? probeJpegDimensions(buffer) ?? { width: SYNTHETIC_DEFAULT_WIDTH, height: SYNTHETIC_DEFAULT_HEIGHT };
}

export function decodeImage(buffer: Buffer): ImageDataLike {
  if (isPng(buffer)) {
    try {
      return decodePng(buffer);
    } catch (error) {
      if ((error as Error).message.includes("Unsupported")) {
        // fall back to synthetic rendering for unsupported variants
      } else {
        throw error;
      }
    }
  }

  const { width, height } = probeImageDimensions(buffer);
  return createSyntheticImage(buffer, width, height);
}
