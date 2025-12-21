import { DEFAULT_LANGUAGE, normalizeLanguage } from "./i18n";

const DOFUS_LOOK_API_URL = "https://api.dofusdb.fr/look";
const DOFUS_RENDERER_BASE_URL = "https://renderer.dofusdb.fr/kool";
const SOUFF_RENDERER_ENDPOINT = "https://skin.souff.fr/renderer/";
const DEFAULT_RENDER_SIZE = 512;
const DEFAULT_LANG = DEFAULT_LANGUAGE;
const MAX_RENDER_SIZE = 2048;
const DEFAULT_RENDER_DIRECTION = 1;

function coercePositiveInteger(value: unknown, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const rounded = Math.max(1, Math.min(Math.round(numeric), MAX_RENDER_SIZE));
  return rounded;
}

export function normalizeGender(input: unknown) {
  if (input == null) {
    return null;
  }

  const normalized = String(input).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (["m", "male", "homme", "h", "0", "masculin", "mâle", "man"].includes(normalized)) {
    return "m";
  }

  if (["f", "female", "femme", "1", "feminin", "féminin", "woman", "femelle"].includes(normalized)) {
    return "f";
  }

  return null;
}

export function genderToSouffSexCode(gender: unknown) {
  const normalized = normalizeGender(gender);
  if (normalized === "f") {
    return 1;
  }
  if (normalized === "m") {
    return 0;
  }
  return null;
}

export function extractItemIdsFromQuery(query: Record<string, unknown> | null | undefined) {
  if (!query || typeof query !== "object") {
    return [];
  }

  const collected: number[] = [];

  const register = (value: unknown) => {
    if (value == null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(register);
      return;
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
      return;
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      collected.push(Math.trunc(numeric));
    }
  };

  register((query as any)["itemIds[]"]);
  register((query as any).itemIds);
  register((query as any).itemId);

  const unique = Array.from(new Set(collected)).filter((value) => Number.isFinite(value));
  return unique;
}

export function extractFaceIdFromQuery(query: Record<string, unknown> | null | undefined) {
  if (!query || typeof query !== "object") {
    return null;
  }

  const keys = ["faceId", "head", "headId", "lookId", "face", "head_id"];
  for (const key of keys) {
    const value = (query as any)[key];
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const parsed = extractFaceIdFromQuery({ [key]: entry });
        if (Number.isFinite(parsed) && (parsed as number) > 0) {
          return parsed;
        }
      }
      continue;
    }

    const numeric = Number(String(value).trim());
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.trunc(numeric);
    }
  }

  return null;
}

function parseColorValue(value: unknown) {
  if (value == null) {
    return null;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const candidate = parseColorValue(entry);
      if (candidate !== null) {
        return candidate;
      }
    }
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  if (/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
    if (trimmed.startsWith("#") || /[a-fA-F]/.test(trimmed)) {
      const normalized = trimmed.replace(/#/g, "");
      const numeric = parseInt(normalized, 16);
      return Number.isFinite(numeric) ? numeric : null;
    }
  }

  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    const numeric = parseInt(trimmed, 16);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    return Math.trunc(numeric);
  }

  return null;
}

export function extractColorsFromQuery(query: Record<string, unknown> | null | undefined) {
  if (!query || typeof query !== "object") {
    return [];
  }

  const collected: number[] = [];

  const register = (value: unknown) => {
    if (value == null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(register);
      return;
    }

    const parsed = parseColorValue(value);
    if (parsed !== null) {
      collected.push(parsed);
    }
  };

  register((query as any)["colors[]"]);
  register((query as any).colors);
  register((query as any).color);
  register((query as any).palette);

  const unique = Array.from(new Set(collected)).filter((value) => Number.isFinite(value));
  return unique;
}

export function buildRendererUrl(tokenBase64: string, size = DEFAULT_RENDER_SIZE) {
  if (!tokenBase64 || typeof tokenBase64 !== "string") {
    throw new Error("Jeton de rendu invalide");
  }

  const trimmed = tokenBase64.trim();
  if (!trimmed) {
    throw new Error("Jeton de rendu vide");
  }

  const decoded = Buffer.from(trimmed, "base64").toString("utf8");
  if (!decoded) {
    throw new Error("Impossible de décoder le jeton de rendu");
  }

  const innerBase64 = Buffer.from(decoded, "utf8").toString("base64");
  const encodedHex = Buffer.from(innerBase64, "utf8").toString("hex");
  const resolvedSize = coercePositiveInteger(size, DEFAULT_RENDER_SIZE);

  return `${DOFUS_RENDERER_BASE_URL}/${encodedHex}/full/1/${resolvedSize}_${resolvedSize}.png`;
}

export function buildSouffLookPayload({
  breedId,
  faceId,
  gender,
  itemIds,
  colors,
  animation = 0,
  direction = DEFAULT_RENDER_DIRECTION,
}: {
  breedId: number;
  faceId: number;
  gender: string | null;
  itemIds: unknown[];
  colors: unknown[];
  animation?: number;
  direction?: number;
}) {
  if (!Number.isFinite(breedId) || breedId <= 0) {
    throw new Error("Paramètre breedId invalide");
  }

  if (!Number.isFinite(faceId) || faceId <= 0) {
    throw new Error("Paramètre faceId invalide");
  }

  const sex = genderToSouffSexCode(gender);
  if (sex === null) {
    throw new Error("Paramètre sexe/gender invalide");
  }

  const hasItemIds = Array.isArray(itemIds) && itemIds.length > 0;
  const normalizedItems = Array.from(
    new Set(
      Array.isArray(itemIds)
        ? itemIds
            .map((value) => (Number.isFinite(value as number) ? Math.trunc(value as number) : null))
            .filter((value) => Number.isFinite(value as number) && (value as number) > 0)
        : []
    )
  );

  if (hasItemIds && !normalizedItems.length) {
    throw new Error("Au moins un identifiant d'objet valide est requis");
  }

  const normalizedColors = Array.from(
    new Set(
      Array.isArray(colors)
        ? colors
            .map((value) => (Number.isFinite(value as number) ? Math.trunc(value as number) : null))
            .filter((value) => Number.isFinite(value as number) && (value as number) >= 0)
        : []
    )
  );

  const animationValue = Number.isFinite(animation) ? Math.max(0, Math.trunc(animation)) : 0;
  const directionValue = Number.isFinite(direction)
    ? Math.max(0, Math.min(7, Math.trunc(direction)))
    : DEFAULT_RENDER_DIRECTION;

  return {
    breed: Math.trunc(breedId),
    head: Math.trunc(faceId),
    sex,
    item_id: normalizedItems,
    colors: normalizedColors,
    animation: animationValue,
    direction: directionValue,
  };
}

export async function fetchSouffRenderer(payload: Record<string, unknown>) {
  const response = await fetch(SOUFF_RENDERER_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const reason = text ? `${response.status} ${response.statusText}: ${text}` : `${response.status}`;
    throw new Error(`Renderer Souff indisponible (${reason})`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  if (!contentType.includes("image/png")) {
    const preview = await response.text().catch(() => "");
    throw new Error(`Réponse inattendue du renderer Souff (${contentType}): ${preview}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    base64: buffer.toString("base64"),
    contentType,
    byteLength: buffer.byteLength,
  };
}

export {
  DOFUS_LOOK_API_URL,
  DOFUS_RENDERER_BASE_URL,
  SOUFF_RENDERER_ENDPOINT,
  DEFAULT_RENDER_DIRECTION,
  DEFAULT_RENDER_SIZE,
  DEFAULT_LANG,
};
