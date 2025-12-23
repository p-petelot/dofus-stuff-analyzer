declare module "../../lib/gallery/generator" {
  import type { GallerySkin } from "../src/types/gallery";

  export function generateGallerySkins(params?: {
    language?: string;
    count?: number;
    tone?: string | null;
    color?: string | null;
    offset?: number;
  }): Promise<GallerySkin[]>;

  export function normalizeCreativeColor(input?: unknown): string | null;
  export function pickCreativeSeed(tone?: string | null): string | null;
  export function getCreativeToneFilters(): Record<string, { label: string }>;
}
