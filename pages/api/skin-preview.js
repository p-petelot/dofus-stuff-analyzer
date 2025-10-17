const BARBOFUS_RENDER_BASE_URL = "https://barbofus.com/skinator";

function decodePotentialUrl(raw, baseUrl) {
  if (!raw || typeof raw !== "string") {
    return null;
  }

  let candidate = raw.trim();
  if (!candidate) {
    return null;
  }

  candidate = candidate
    .replace(/^['"`]+/, "")
    .replace(/['"`,]+$/, "")
    .replace(/&amp;/gi, "&")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u0026/gi, "&");

  if (/^data:/i.test(candidate)) {
    return candidate;
  }

  try {
    const resolved = baseUrl ? new URL(candidate, baseUrl).toString() : candidate;
    return resolved;
  } catch (error) {
    return null;
  }
}

function extractMetaContent(html, attribute, value) {
  if (!html) {
    return null;
  }

  const pattern = new RegExp(
    `<meta[^>]+${attribute}=["']${value}["'][^>]*>`,
    "i"
  );
  const match = html.match(pattern);
  if (!match) {
    return null;
  }

  const tag = match[0];
  const contentMatch = tag.match(/content=["']([^"']+)["']/i);
  return contentMatch ? contentMatch[1].trim() : null;
}

const CANVAS_OBJECT_DATA_PATTERN =
  /<object[^>]+id=["']canvas0["'][^>]*data=["']([^"']+)["'][^>]*>/i;
const CANVAS_DATA_ATTRIBUTE_PATTERN =
  /<canvas[^>]+id=["']canvas0["'][^>]*(data-(?:src|source|image|preview)|src)=["']([^"']+)["'][^>]*>/i;
const CANVAS_JSON_OBJECT_PATTERN =
  /"canvas0"\s*:\s*\{[^{}]*?(?:"(src|source|image|url|href)"\s*:\s*"([^"]+)")[^{}]*\}/i;
const CANVAS_JSON_STRING_PATTERN = /"canvas0"\s*:\s*"([^"]+)"/i;
const CANVAS_CONTEXT_URL_PATTERN =
  /canvas0[^<>{}\[\]]*?(https?:\\\/\\\/[^"'\s<>]+|https?:\/\/[^"'\s<>]+)/i;

function extractCanvasPreviewUrl(html, baseUrl) {
  if (!html) {
    return null;
  }

  const patterns = [
    CANVAS_OBJECT_DATA_PATTERN,
    CANVAS_DATA_ATTRIBUTE_PATTERN,
    CANVAS_JSON_OBJECT_PATTERN,
    CANVAS_JSON_STRING_PATTERN,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) {
      continue;
    }

    const raw = match[2] ?? match[1] ?? null;
    const decoded = decodePotentialUrl(raw, baseUrl);
    if (decoded) {
      return decoded;
    }
  }

  const contextMatch = html.match(CANVAS_CONTEXT_URL_PATTERN);
  if (contextMatch) {
    const raw = contextMatch[1];
    const decoded = decodePotentialUrl(raw, baseUrl);
    if (decoded) {
      return decoded;
    }
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { s } = req.query;

  if (!s || (Array.isArray(s) && s.length === 0)) {
    res.status(400).json({ error: "Missing skin configuration" });
    return;
  }

  const config = Array.isArray(s) ? s[0] : s;

  if (typeof config !== "string" || !config.trim()) {
    res.status(400).json({ error: "Invalid skin configuration" });
    return;
  }

  const target = `${BARBOFUS_RENDER_BASE_URL}?s=${encodeURIComponent(config)}`;

  try {
    const pageResponse = await fetch(target, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });

    if (!pageResponse.ok) {
      res.status(pageResponse.status).json({ error: "Unable to resolve preview page" });
      return;
    }

    const html = await pageResponse.text();
    const previewUrl =
      extractCanvasPreviewUrl(html, target) ??
      (() => {
        const ogImage =
          extractMetaContent(html, "property", "og:image") ??
          extractMetaContent(html, "name", "twitter:image") ??
          null;
        return ogImage ? decodePotentialUrl(ogImage, target) : null;
      })();

    if (!previewUrl) {
      res.status(404).json({ error: "Preview image not found" });
      return;
    }

    const imageResponse = await fetch(previewUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      cache: "no-store",
    });

    if (!imageResponse.ok) {
      res.status(imageResponse.status).json({ error: "Unable to fetch preview image" });
      return;
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const contentType = imageResponse.headers.get("content-type") ?? "image/webp";
    res.setHeader("Content-Type", contentType);

    const cacheControl = imageResponse.headers.get("cache-control");
    if (cacheControl) {
      res.setHeader("Cache-Control", cacheControl);
    } else {
      res.setHeader(
        "Cache-Control",
        "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
      );
    }

    res.setHeader("Content-Length", buffer.length.toString());
    res.status(200).send(buffer);
  } catch (error) {
    console.error("Failed to proxy Barbofus preview:", error);
    res.status(502).json({ error: "Preview generation failed" });
  }
}
