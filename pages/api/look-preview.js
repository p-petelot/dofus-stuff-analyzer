const DOFUS_LOOK_API_URL = "https://api.dofusdb.fr/look";
const DOFUS_RENDERER_BASE_URL = "https://renderer.dofusdb.fr/kool";
const SOUFF_RENDERER_ENDPOINT = "https://skin.souff.fr/renderer/";
const DEFAULT_RENDER_SIZE = 512;
const DEFAULT_LANG = "fr";
const MAX_RENDER_SIZE = 2048;

function coercePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const rounded = Math.max(1, Math.min(Math.round(numeric), MAX_RENDER_SIZE));
  return rounded;
}

export function normalizeGender(input) {
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

  if ([
    "f",
    "female",
    "femme",
    "1",
    "feminin",
    "féminin",
    "woman",
    "femelle",
  ].includes(normalized)) {
    return "f";
  }

  return null;
}

export function genderToSouffSexCode(gender) {
  const normalized = normalizeGender(gender);
  if (normalized === "f") {
    return 1;
  }
  if (normalized === "m") {
    return 0;
  }
  return null;
}

export function extractItemIdsFromQuery(query) {
  if (!query || typeof query !== "object") {
    return [];
  }

  const collected = [];

  const register = (value) => {
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

  register(query["itemIds[]"]);
  register(query.itemIds);
  register(query.itemId);

  const unique = Array.from(new Set(collected)).filter((value) => Number.isFinite(value));
  return unique;
}

export function extractFaceIdFromQuery(query) {
  if (!query || typeof query !== "object") {
    return null;
  }

  const keys = ["faceId", "head", "headId", "lookId", "face", "head_id"];
  for (const key of keys) {
    const value = query[key];
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const entry of value) {
        const parsed = extractFaceIdFromQuery({ [key]: entry });
        if (Number.isFinite(parsed) && parsed > 0) {
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

function parseColorValue(value) {
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

export function extractColorsFromQuery(query) {
  if (!query || typeof query !== "object") {
    return [];
  }

  const collected = [];

  const register = (value) => {
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

  register(query["colors[]"]);
  register(query.colors);
  register(query.color);
  register(query.palette);

  const unique = Array.from(new Set(collected)).filter((value) => Number.isFinite(value));
  return unique;
}

export function buildRendererUrl(tokenBase64, size = DEFAULT_RENDER_SIZE) {
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

async function fetchRendererImage(rendererUrl) {
  const response = await fetch(rendererUrl);
  if (!response.ok) {
    throw new Error(`Le renderer a retourné ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  const base64 = buffer.toString("base64");

  return {
    base64,
    contentType,
    byteLength: buffer.byteLength,
  };
}

export function buildSouffLookPayload({
  breedId,
  faceId,
  gender,
  itemIds,
  colors,
}) {
  if (!Number.isFinite(breedId) || breedId <= 0) {
    throw new Error("Paramètre breedId invalide");
  }

  if (!Number.isFinite(faceId) || faceId <= 0) {
    throw new Error("Paramètre faceId invalide");
  }

  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    throw new Error("Au moins un identifiant d'objet est requis");
  }

  const sex = genderToSouffSexCode(gender);
  if (sex === null) {
    throw new Error("Paramètre sexe/gender invalide");
  }

  const normalizedItems = Array.from(
    new Set(
      itemIds
        .map((value) => (Number.isFinite(value) ? Math.trunc(value) : null))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );

  if (!normalizedItems.length) {
    throw new Error("Au moins un identifiant d'objet valide est requis");
  }

  const normalizedColors = Array.from(
    new Set(
      Array.isArray(colors)
        ? colors
            .map((value) => (Number.isFinite(value) ? Math.trunc(value) : null))
            .filter((value) => Number.isFinite(value) && value >= 0)
        : []
    )
  );

  return {
    breed: Math.trunc(breedId),
    head: Math.trunc(faceId),
    sex,
    item_id: normalizedItems,
    colors: normalizedColors,
  };
}

async function fetchSouffRenderer(payload) {
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

export default async function handler(req, res) {
  let warnings = [];
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  try {
    const { breedId, classeId, classId, sexe, gender, lang, size } = req.query ?? {};

    const numericBreedId = Number(breedId ?? classId ?? classeId);
    if (!Number.isFinite(numericBreedId) || numericBreedId <= 0) {
      res.status(400).json({ error: "Paramètre breedId invalide" });
      return;
    }

    const normalizedGender = normalizeGender(sexe ?? gender);
    if (!normalizedGender) {
      res.status(400).json({ error: "Paramètre sexe/gender invalide" });
      return;
    }

    const faceId = extractFaceIdFromQuery(req.query);
    if (!Number.isFinite(faceId) || faceId <= 0) {
      res.status(400).json({ error: "Paramètre faceId invalide" });
      return;
    }

    const itemIds = extractItemIdsFromQuery(req.query);
    const colors = extractColorsFromQuery(req.query);
    if (!itemIds.length) {
      res.status(400).json({ error: "Au moins un identifiant d'objet est requis" });
      return;
    }

    const resolvedLang = typeof lang === "string" && lang.trim() ? lang.trim() : DEFAULT_LANG;
    const resolvedSize = coercePositiveInteger(size, DEFAULT_RENDER_SIZE);

    const souffPayload = buildSouffLookPayload({
      breedId: numericBreedId,
      faceId,
      gender: normalizedGender,
      itemIds,
      colors,
    });

    warnings = [];
    const requested = {
      breedId: numericBreedId,
      gender: normalizedGender,
      faceId,
      itemIds,
      colors,
      lang: resolvedLang,
      size: resolvedSize,
    };

    try {
      const { base64, contentType, byteLength } = await fetchSouffRenderer(souffPayload);
      const dataUrl = `data:${contentType};base64,${base64}`;

      res.status(200).json({
        requested,
        renderer: "souff",
        base64,
        contentType,
        byteLength,
        dataUrl,
        lookUrl: null,
        rendererUrl: null,
        token: null,
        warnings,
      });
      return;
    } catch (souffError) {
      warnings.push(souffError instanceof Error ? souffError.message : String(souffError));
    }

    const searchParams = new URLSearchParams();
    searchParams.set("breedId", String(numericBreedId));
    searchParams.set("sexe", normalizedGender);
    searchParams.set("lang", resolvedLang);
    itemIds.forEach((id) => {
      searchParams.append("itemIds[]", String(id));
    });
    colors.forEach((value) => {
      searchParams.append("colors[]", String(value));
    });

    const lookUrl = `${DOFUS_LOOK_API_URL}?${searchParams.toString()}`;

    const lookResponse = await fetch(lookUrl);
    if (!lookResponse.ok) {
      res
        .status(lookResponse.status)
        .json({ error: `L'API look a retourné ${lookResponse.status}`, warnings });
      return;
    }

    const token = (await lookResponse.text()).trim();
    if (!token || token.length < 4) {
      res.status(502).json({ error: "Jeton de rendu invalide", warnings });
      return;
    }

    const rendererUrl = buildRendererUrl(token, resolvedSize);
    const { base64, contentType, byteLength } = await fetchRendererImage(rendererUrl);
    const dataUrl = `data:${contentType};base64,${base64}`;

    res.status(200).json({
      requested,
      lookUrl,
      rendererUrl,
      token,
      base64,
      contentType,
      byteLength,
      dataUrl,
      renderer: "dofusdb",
      warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const payload = warnings.length ? { error: message, warnings } : { error: message };
    res.status(502).json(payload);
  }
}

export { DOFUS_LOOK_API_URL, DOFUS_RENDERER_BASE_URL, SOUFF_RENDERER_ENDPOINT };
