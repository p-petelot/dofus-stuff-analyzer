declare module "sharp" {
  interface SharpInfo {
    width: number;
    height: number;
    channels: number;
  }
  interface ToBufferOptions {
    resolveWithObject: true;
  }
  interface SharpInstance {
    ensureAlpha(): SharpInstance;
    resize(width: number, height: number, options?: Record<string, unknown>): SharpInstance;
    resize(options: { width?: number; height?: number; fit?: string; background?: Record<string, unknown> }): SharpInstance;
    raw(): SharpInstance;
    toBuffer(options?: ToBufferOptions): Promise<{ data: Buffer; info: SharpInfo }>;
  }
  interface SharpConstructor {
    (input?: Buffer, options?: Record<string, unknown>): SharpInstance;
  }
  const sharp: SharpConstructor;
  export = sharp;
}
