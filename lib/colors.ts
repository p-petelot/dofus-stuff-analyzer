import sharp from "next/dist/compiled/sharp";

const MAX_PIXELS = 80_000;
const MAX_ITERATIONS = 20;
const TARGET_CLUSTERS = 6;

interface Pixel {
  r: number;
  g: number;
  b: number;
}

interface Cluster extends Pixel {
  count: number;
}

function squaredDistance(a: Pixel, b: Pixel): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function toHex(pixel: Pixel): number {
  const r = Math.max(0, Math.min(255, Math.round(pixel.r)));
  const g = Math.max(0, Math.min(255, Math.round(pixel.g)));
  const b = Math.max(0, Math.min(255, Math.round(pixel.b)));
  return (r << 16) | (g << 8) | b;
}

function initialiseCentroids(pixels: Pixel[], k: number): Pixel[] {
  if (pixels.length === 0) {
    return new Array(k).fill(0).map(() => ({ r: 0, g: 0, b: 0 }));
  }

  const centroids: Pixel[] = [];
  const step = Math.max(1, Math.floor(pixels.length / k));

  for (let i = 0; i < k; i += 1) {
    centroids.push(pixels[Math.min(i * step, pixels.length - 1)]);
  }

  return centroids;
}

export async function extractColors(buffer: Buffer): Promise<number[]> {
  const baseImage = sharp(buffer, { failOnError: false }).ensureAlpha();
  const metadata = await baseImage.metadata();

  if (!metadata.width || !metadata.height) {
    throw new Error("Unable to read image metadata");
  }

  let pipeline = baseImage;
  const totalPixels = metadata.width * metadata.height;
  if (totalPixels > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / totalPixels);
    const width = Math.max(1, Math.round(metadata.width * scale));
    const height = Math.max(1, Math.round(metadata.height * scale));
    pipeline = pipeline.resize(width, height, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
  const pixels: Pixel[] = [];

  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const alpha = info.channels > 3 ? data[i + 3] : 255;

    if (alpha === 0) {
      continue;
    }

    pixels.push({ r, g, b });
  }

  if (!pixels.length) {
    return new Array(TARGET_CLUSTERS).fill(0);
  }

  const clusterCount = Math.min(TARGET_CLUSTERS, pixels.length);
  let centroids = initialiseCentroids(pixels, clusterCount);
  const assignments = new Array(pixels.length).fill(0);

  for (let iter = 0; iter < MAX_ITERATIONS; iter += 1) {
    let moved = false;
    const sums = new Array(clusterCount).fill(null).map(() => ({ r: 0, g: 0, b: 0 }));
    const counts = new Array(clusterCount).fill(0);

    for (let i = 0; i < pixels.length; i += 1) {
      const pixel = pixels[i];
      let bestIndex = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (let c = 0; c < clusterCount; c += 1) {
        const distance = squaredDistance(pixel, centroids[c]);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = c;
        }
      }

      if (assignments[i] !== bestIndex) {
        moved = true;
        assignments[i] = bestIndex;
      }

      counts[bestIndex] += 1;
      sums[bestIndex].r += pixel.r;
      sums[bestIndex].g += pixel.g;
      sums[bestIndex].b += pixel.b;
    }

    for (let c = 0; c < clusterCount; c += 1) {
      if (counts[c] === 0) {
        centroids[c] = pixels[Math.floor(Math.random() * pixels.length)];
        continue;
      }
      centroids[c] = {
        r: sums[c].r / counts[c],
        g: sums[c].g / counts[c],
        b: sums[c].b / counts[c],
      };
    }

    if (!moved) {
      break;
    }
  }

  const clusters: Cluster[] = new Array(clusterCount).fill(null).map((_, idx) => ({
    r: centroids[idx].r,
    g: centroids[idx].g,
    b: centroids[idx].b,
    count: 0,
  }));

  for (let i = 0; i < pixels.length; i += 1) {
    const clusterIndex = assignments[i];
    clusters[clusterIndex].count += 1;
  }

  clusters.sort((a, b) => b.count - a.count);

  const colors = clusters.filter((cluster) => cluster.count > 0).map((cluster) => toHex(cluster));

  while (colors.length < TARGET_CLUSTERS) {
    colors.push(colors[colors.length - 1] ?? 0);
  }

  return colors.slice(0, TARGET_CLUSTERS);
}
