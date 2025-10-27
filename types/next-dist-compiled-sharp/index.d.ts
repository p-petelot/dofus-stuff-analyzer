declare module "next/dist/compiled/sharp" {
  interface SharpMetadata {
    width?: number;
    height?: number;
  }

  interface SharpInfo {
    width: number;
    height: number;
    channels: number;
  }

  interface Sharp {
    ensureAlpha(): Sharp;
    metadata(): Promise<SharpMetadata>;
    resize(width: number, height: number, options?: { fit?: string; withoutEnlargement?: boolean }): Sharp;
    raw(): Sharp;
    toBuffer(options?: { resolveWithObject?: boolean }): Promise<Buffer>;
    toBuffer(options: { resolveWithObject: true }): Promise<{ data: Buffer; info: SharpInfo }>;
  }

  interface SharpConstructor {
    (input?: Buffer | string, options?: { failOnError?: boolean }): Sharp;
  }

  const sharp: SharpConstructor;
  export default sharp;
}
