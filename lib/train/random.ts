export interface Rng {
  next(): number;
  int(max: number): number;
  pick<T>(items: T[]): T;
}

const LCG_A = 1664525;
const LCG_C = 1013904223;
const LCG_M = 2 ** 32;

function hashSeed(seed?: string | number): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return Math.abs(Math.trunc(seed)) % LCG_M;
  }
  if (!seed) {
    return Math.floor(Math.random() * LCG_M);
  }
  const text = String(seed);
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % LCG_M;
  }
  return hash;
}

export function createRng(seed?: string | number): Rng {
  let state = hashSeed(seed) || 1;
  const nextFloat = (): number => {
    state = (LCG_A * state + LCG_C) % LCG_M;
    return state / LCG_M;
  };
  const nextInt = (max: number): number => {
    if (max <= 0) {
      return 0;
    }
    return Math.floor(nextFloat() * max);
  };
  const pick = <T,>(items: T[]): T => {
    if (!items.length) {
      throw new Error("Cannot pick from empty array");
    }
    const index = nextInt(items.length);
    return items[index];
  };
  return {
    next: nextFloat,
    int: nextInt,
    pick,
  };
}

export function shuffleInPlace<T>(items: T[], rng: Rng): T[] {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.int(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function weightedSample(weights: Record<string, number>, rng: Rng): string {
  const entries = Object.entries(weights).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0 || entries.length === 0) {
    return entries[0]?.[0] ?? "";
  }
  let roll = rng.next() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) {
      return key;
    }
  }
  return entries[entries.length - 1]?.[0] ?? entries[0][0];
}

export function jitter(value: number, range: number, rng: Rng): number {
  if (range <= 0) {
    return value;
  }
  const delta = (rng.next() * 2 - 1) * range;
  return value + delta;
}
