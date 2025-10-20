import fs from "fs";
import os from "os";
import path from "path";

let cachedRoot: string | null = null;

function tryEnsureDir(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    return true;
  } catch (error) {
    return false;
  }
}

function computeCandidates(): string[] {
  const overrides = [process.env.SKIN_LAB_CACHE_DIR, process.env.CACHE_DIR].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
  const fallback = path.join(os.tmpdir(), "dofus-skin-lab");
  const preferEphemeral = Boolean(
    process.env.VERCEL ||
      process.env.AWS_REGION ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AWS_LAMBDA_FUNCTION_VERSION,
  );
  const localDefault = path.join(process.cwd(), ".cache");
  const ordered = preferEphemeral
    ? [...overrides, fallback, localDefault]
    : [...overrides, localDefault, fallback];
  if (!ordered.includes(fallback)) {
    ordered.push(fallback);
  }
  return ordered;
}

function resolveCacheRoot(): string {
  if (cachedRoot) {
    return cachedRoot;
  }
  const candidates = computeCandidates();
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (tryEnsureDir(resolved)) {
      cachedRoot = resolved;
      return cachedRoot;
    }
  }
  const fallback = path.join(os.tmpdir(), "dofus-skin-lab");
  tryEnsureDir(fallback);
  cachedRoot = fallback;
  return cachedRoot;
}

export function getCacheRoot(): string {
  return resolveCacheRoot();
}

export function resolveCachePath(fileName: string): string {
  return path.join(resolveCacheRoot(), fileName);
}
