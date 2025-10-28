export interface AnalyzeResult {
  breed: string;
  sex: string;
  items: Record<string, number | null>;
  colors: number[];
  meta: {
    imageWidth: number;
    imageHeight: number;
    latencyMs: number;
    upstreamErrors?: { class: string | null; items: string | null };
  };
}
