import fs from "fs";
import { resolveCachePath } from "../utils/cache";
import type { ImageDataLike } from "../types";

type TransformersModule = typeof import("@xenova/transformers");
type FeatureExtractorPipeline = (input: unknown, options?: Record<string, unknown>) => Promise<any>;

let transformersPromise: Promise<TransformersModule | null> | null = null;
let clipPipelinePromise: Promise<FeatureExtractorPipeline | null> | null = null;

function ensureDir(dir: string): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (error) {
    // ignore
  }
}

function logWarning(message: string, error: unknown): void {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  // eslint-disable-next-line no-console
  console.warn(`[vision-backend] ${message}`, error instanceof Error ? error.message : error);
}

export function shouldUseModernVision(): boolean {
  return process.env.SKIN_RECOGNIZER_DISABLE_VISION !== "1";
}

export async function loadTransformersModule(): Promise<TransformersModule | null> {
  if (!shouldUseModernVision()) {
    return null;
  }
  if (!transformersPromise) {
    transformersPromise = (async () => {
      try {
        const mod = await import("@xenova/transformers");
        const cacheRoot = resolveCachePath("transformers");
        ensureDir(cacheRoot);
        const { env } = mod;
        if (env) {
          env.allowLocalModels = true;
          env.allowRemoteModels = env.allowRemoteModels ?? true;
          if (!env.cacheDir) {
            env.cacheDir = cacheRoot;
          }
          if (!env.localModelPath) {
            env.localModelPath = cacheRoot;
          }
        }
        return mod;
      } catch (error) {
        logWarning("Impossible de charger @xenova/transformers", error);
        return null;
      }
    })();
  }
  return transformersPromise;
}

export async function loadClipPipeline(): Promise<FeatureExtractorPipeline | null> {
  if (!shouldUseModernVision()) {
    return null;
  }
  if (!clipPipelinePromise) {
    clipPipelinePromise = (async () => {
      const mod = await loadTransformersModule();
      if (!mod) {
        return null;
      }
      try {
        return await mod.pipeline("feature-extraction", "Xenova/clip-vit-base-patch32", {
          quantized: true,
        });
      } catch (error) {
        logWarning("Impossible d'initialiser le pipeline CLIP", error);
        return null;
      }
    })();
  }
  return clipPipelinePromise;
}

export async function decodeImageData(
  buffer: Buffer,
  targetSize: number,
): Promise<ImageDataLike | null> {
  if (!shouldUseModernVision()) {
    return null;
  }
  const mod = await loadTransformersModule();
  const RawImage = mod?.RawImage as
    | undefined
    | {
        from(buffer: Buffer | Uint8Array | ArrayBufferLike): Promise<any>;
      };
  if (!RawImage) {
    return null;
  }
  try {
    const rawImage = await RawImage.from(buffer);
    const resized = rawImage.resize({
      width: targetSize,
      height: targetSize,
      fit: "contain",
      background: [0, 0, 0, 0],
    });
    const imageData = resized.toImageData();
    return {
      width: imageData.width,
      height: imageData.height,
      data: new Uint8ClampedArray(imageData.data),
    };
  } catch (error) {
    logWarning("Impossible de décoder l'image via transformers", error);
    return null;
  }
}

export function resetVisionBackend(): void {
  transformersPromise = null;
  clipPipelinePromise = null;
}
