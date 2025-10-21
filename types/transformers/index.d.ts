declare module "@xenova/transformers" {
  export interface PipelineEnv {
    allowLocalModels?: boolean;
    localModelPath?: string;
  }
  export interface TransformersEnv {
    allowLocalModels?: boolean;
    localModelPath?: string;
  }
  export function pipeline(task: string, model: string): Promise<(input: unknown, options?: Record<string, unknown>) => Promise<unknown>>;
  export const env: TransformersEnv;
}
