import fs from "fs";
import path from "path";
import { SLOTS } from "../config/suggestions";
import type { SlotKey } from "../types";

export interface LookGenerationExample {
  id: string;
  absoluteImagePath?: string;
  imageData?: string;
  classLabel?: string | null;
  gender?: "m" | "f" | null;
  colors: string[];
  items: Partial<Record<SlotKey, number>>;
  meta: Record<string, unknown>;
}

const DEFAULT_GENERATIONS_DIR = path.join(process.cwd(), ".cache", "generations");

function normalizeHex(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const numeric = Math.max(0, Math.floor(value)) % 0x1000000;
    return `#${numeric.toString(16).padStart(6, "0").toUpperCase()}`;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    const match = trimmed.match(/[0-9a-fA-F]{6}/);
    if (match) {
      return `#${match[0].toUpperCase()}`;
    }
    if (/^\d+$/.test(trimmed)) {
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric)) {
        return normalizeHex(numeric);
      }
    }
    if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
      const numeric = Number.parseInt(trimmed.slice(2), 16);
      if (Number.isFinite(numeric)) {
        return normalizeHex(numeric);
      }
    }
  }
  return null;
}

function normalizeGender(value: unknown): "m" | "f" | null {
  if (value == null) {
    return null;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["m", "male", "man", "homme", "0", "masculin", "mâle"].includes(normalized)) {
    return "m";
  }
  if (["f", "female", "woman", "femme", "1", "feminin", "féminin", "fille"].includes(normalized)) {
    return "f";
  }
  return null;
}

function normalizeClass(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed;
  }
  return null;
}

function normalizeSlotKey(key: string): SlotKey | null {
  const lowered = key.trim().toLowerCase();
  if (!lowered) {
    return null;
  }
  if (SLOTS.includes(lowered as SlotKey)) {
    return lowered as SlotKey;
  }
  const mapping: Record<string, SlotKey> = {
    head: "coiffe",
    hat: "coiffe",
    helmet: "coiffe",
    cape: "cape",
    cloak: "cape",
    back: "cape",
    shield: "bouclier",
    pet: "familier",
    companion: "familier",
    mount: "familier",
    shoulder: "epauliere",
    epaule: "epauliere",
    costume: "costume",
    outfit: "costume",
    wings: "ailes",
  };
  return mapping[lowered] ?? null;
}

function parseItems(value: unknown): Partial<Record<SlotKey, number>> {
  const entries: Partial<Record<SlotKey, number>> = {};
  if (!value || typeof value !== "object") {
    return entries;
  }
  const record = value as Record<string, unknown>;
  for (const [key, raw] of Object.entries(record)) {
    const slot = normalizeSlotKey(key);
    if (!slot) {
      continue;
    }
    if (Array.isArray(raw)) {
      const numeric = raw.map((entry) => Number(entry)).find((entry) => Number.isFinite(entry) && entry > 0);
      if (Number.isFinite(numeric)) {
        entries[slot] = Math.trunc(numeric);
      }
      continue;
    }
    const numeric = Number(raw);
    if (Number.isFinite(numeric) && numeric > 0) {
      entries[slot] = Math.trunc(numeric);
    }
  }
  return entries;
}

function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (value == null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function resolveImagePath(baseDir: string, value: unknown): { absolute?: string; dataUrl?: string } | null {
  const candidates = ensureArray(value);
  for (const candidate of candidates) {
    if (typeof candidate !== "string") {
      continue;
    }
    const trimmed = candidate.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("data:")) {
      return { dataUrl: trimmed };
    }
    const absolute = path.isAbsolute(trimmed) ? trimmed : path.join(baseDir, trimmed);
    if (fs.existsSync(absolute)) {
      return { absolute };
    }
  }
  return null;
}

function extractImageReference(baseDir: string, entry: Record<string, unknown>): { absolute?: string; dataUrl?: string } | null {
  const keys = ["image", "img", "path", "preview", "url", "href", "sprite", "file", "asset"];
  for (const key of keys) {
    const value = entry[key];
    if (value == null) {
      continue;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
      const nested = extractImageReference(baseDir, value as Record<string, unknown>);
      if (nested) {
        return nested;
      }
    }
    const resolved = resolveImagePath(baseDir, value);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function parseColors(value: unknown): string[] {
  const results: string[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      const normalized = normalizeHex(entry);
      if (normalized) {
        results.push(normalized);
      }
    }
    return results;
  }
  if (typeof value === "object" && value !== null) {
    for (const entry of Object.values(value)) {
      const normalized = normalizeHex(entry);
      if (normalized) {
        results.push(normalized);
      }
    }
    return results;
  }
  const normalized = normalizeHex(value);
  return normalized ? [normalized] : [];
}

function parseEntry(
  baseDir: string,
  entry: Record<string, unknown>,
  index: number,
  source: string,
): LookGenerationExample | null {
  const id = entry.id ?? `${path.basename(source)}#${index}`;
  const classLabel =
    normalizeClass(entry.class) ??
    normalizeClass(entry.breed) ??
    normalizeClass(entry.classe) ??
    normalizeClass(entry.className) ??
    normalizeClass(entry.breedName);
  const gender =
    normalizeGender(entry.gender) ??
    normalizeGender(entry.sexe) ??
    normalizeGender(entry.sex) ??
    normalizeGender(entry.genderId);
  const colors = parseColors(entry.colors ?? entry.palette ?? entry.skinColors ?? entry.lookColors).slice(0, 6);
  const items = parseItems(entry.items ?? entry.slots ?? entry.equipment ?? entry.gear ?? entry.lookItems);
  const imageRef = extractImageReference(baseDir, entry);
  if (!imageRef) {
    return null;
  }
  const example: LookGenerationExample = {
    id: String(id),
    classLabel: classLabel ?? null,
    gender,
    colors,
    items,
    meta: { source },
  };
  if (imageRef.absolute) {
    example.absoluteImagePath = imageRef.absolute;
  } else if (imageRef.dataUrl) {
    example.imageData = imageRef.dataUrl;
  }
  return example;
}

function parseFile(filePath: string): LookGenerationExample[] {
  try {
    const baseDir = path.dirname(filePath);
    const raw = fs.readFileSync(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }
    if (path.extname(filePath).toLowerCase() === ".jsonl") {
      const lines = trimmed.split(/\r?\n/);
      const parsed: LookGenerationExample[] = [];
      lines.forEach((line, index) => {
        if (!line.trim()) {
          return;
        }
        try {
          const record = JSON.parse(line) as Record<string, unknown>;
          const example = parseEntry(baseDir, record, index, filePath);
          if (example) {
            parsed.push(example);
          }
        } catch (error) {
          console.warn(`Failed to parse JSONL entry in ${filePath}:`, error);
        }
      });
      return parsed;
    }
    const json = JSON.parse(trimmed) as unknown;
    const records = Array.isArray(json) ? json : [json];
    const parsed: LookGenerationExample[] = [];
    records.forEach((record, index) => {
      if (record && typeof record === "object") {
        const example = parseEntry(baseDir, record as Record<string, unknown>, index, filePath);
        if (example) {
          parsed.push(example);
        }
      }
    });
    return parsed;
  } catch (error) {
    console.warn(`Failed to parse generation file ${filePath}`, error);
    return [];
  }
}

export function loadGenerationDataset(datasetPath = DEFAULT_GENERATIONS_DIR): LookGenerationExample[] {
  if (!fs.existsSync(datasetPath)) {
    return [];
  }
  const stats = fs.statSync(datasetPath);
  if (stats.isFile()) {
    return parseFile(datasetPath);
  }
  const entries: LookGenerationExample[] = [];
  const files = fs.readdirSync(datasetPath);
  files
    .filter((file) => /\.jsonl?$/.test(file))
    .sort()
    .forEach((file) => {
      const filePath = path.join(datasetPath, file);
      entries.push(...parseFile(filePath));
    });
  return entries;
}
