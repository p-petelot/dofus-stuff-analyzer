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
    .replace(/['"`,;]+$/, "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/%5[Cc]\//g, "/")
    .replace(/\\\//g, "/")
    .replace(/\\u002f/gi, "/")
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
  /<object[^>]+id=["']canvas0["'][^>]*data=["']([^"']+)["'][^>]*>/gi;
const CANVAS_DATA_ATTRIBUTE_PATTERN =
  /<canvas[^>]+id=["']canvas0["'][^>]*(data-(?:src|source|image|preview)|src)=["']([^"']+)["'][^>]*>/gi;
const CANVAS_JSON_OBJECT_PATTERN =
  /["']canvas0["']\s*:\s*\{[^{}]*?(?:["'](src|source|image|url|href)["']\s*:\s*["']([^"']+)["'])[^{}]*\}/gi;
const CANVAS_JSON_STRING_PATTERN = /["']canvas0["']\s*:\s*["']([^"']+)["']/gi;
const CANVAS_GENERIC_ASSIGNMENT_PATTERN =
  /canvas0[^<>{}\[\]]*?(?:data|src|source|image|preview|href|url)\s*[:=]\s*["']([^"']+)["']/gi;
const CANVAS_CONTEXT_URL_PATTERN =
  /canvas0[^<>{}\[\]]*?(https?:\\\/\\\/[^"'\s<>]+|https?:\/\/[^"'\s<>]+)/gi;

function isLikelyCanvasPreviewUrl(url, baseUrl) {
  if (!url) {
    return false;
  }

  if (url.startsWith("data:image/")) {
    return true;
  }

  if (/w3\.org\/2000\/svg/i.test(url)) {
    return false;
  }

  try {
    const normalized = baseUrl ? new URL(url, baseUrl) : new URL(url);
    const hostname = normalized.hostname.toLowerCase();

    if (hostname === "www.w3.org") {
      return false;
    }

    if (hostname === "barbofus.com" || hostname.endsWith(".barbofus.com")) {
      return true;
    }

    if (
      hostname.endsWith(".ankama.com") ||
      hostname.endsWith(".akamaized.net") ||
      hostname.includes("ankama")
    ) {
      return true;
    }

    if (/(?:png|webp|jpe?g|gif|avif|apng|svg)$/i.test(normalized.pathname)) {
      return true;
    }

    return false;
  } catch (error) {
    return false;
  }
}

function findCanvasMatch(pattern, html, baseUrl, source) {
  if (!html) {
    return null;
  }

  pattern.lastIndex = 0;
  let match;
  while ((match = pattern.exec(html))) {
    const raw = match[2] ?? match[1] ?? null;
    if (!raw) {
      continue;
    }

    const decoded = decodePotentialUrl(raw, baseUrl);
    if (decoded && isLikelyCanvasPreviewUrl(decoded, baseUrl)) {
      console.log("[skin-preview] matched canvas preview", {
        source,
        raw,
        decoded,
      });
      return { url: decoded, source };
    }

    if (decoded) {
      console.log("[skin-preview] discarded canvas preview", {
        source,
        raw,
        decoded,
      });
    }
  }

  pattern.lastIndex = 0;
  return null;
}

function extractCanvasPreviewUrl(html, baseUrl) {
  if (!html) {
    return null;
  }

  const directPatterns = [
    { pattern: CANVAS_OBJECT_DATA_PATTERN, source: "object:data" },
    { pattern: CANVAS_DATA_ATTRIBUTE_PATTERN, source: "canvas:attr" },
    { pattern: CANVAS_JSON_OBJECT_PATTERN, source: "json:object" },
    { pattern: CANVAS_JSON_STRING_PATTERN, source: "json:string" },
    { pattern: CANVAS_GENERIC_ASSIGNMENT_PATTERN, source: "generic" },
  ];

  for (const { pattern, source } of directPatterns) {
    const result = findCanvasMatch(pattern, html, baseUrl, source);
    if (result) {
      return result;
    }
  }

  const mentionPattern = /canvas0/gi;
  let mentionMatch;
  while ((mentionMatch = mentionPattern.exec(html))) {
    const start = mentionMatch.index;
    const snippet = html.slice(start, start + 1024);

    const propertyMatch = snippet.match(
      /(?:data|src|source|image|preview|href|url)\s*[:=]\s*["']([^"']+)["']/i
    );
    if (propertyMatch) {
      const decoded = decodePotentialUrl(propertyMatch[1], baseUrl);
      if (decoded && isLikelyCanvasPreviewUrl(decoded, baseUrl)) {
        console.log("[skin-preview] matched canvas snippet", {
          source: "snippet:property",
          raw: propertyMatch[1],
          decoded,
        });
        return { url: decoded, source: "snippet:property" };
      }

      if (decoded) {
        console.log("[skin-preview] discarded canvas snippet", {
          source: "snippet:property",
          raw: propertyMatch[1],
          decoded,
        });
      }
    }

    const httpMatch = snippet.match(
      /(https?:\\\/\\\/[^"'\s<>]+|https?:\/\/[^"'\s<>]+)/i
    );
    if (httpMatch) {
      const decoded = decodePotentialUrl(httpMatch[1], baseUrl);
      if (decoded && isLikelyCanvasPreviewUrl(decoded, baseUrl)) {
        console.log("[skin-preview] matched canvas snippet", {
          source: "snippet:http",
          raw: httpMatch[1],
          decoded,
        });
        return { url: decoded, source: "snippet:http" };
      }

      if (decoded) {
        console.log("[skin-preview] discarded canvas snippet", {
          source: "snippet:http",
          raw: httpMatch[1],
          decoded,
        });
      }
    }

    const assignmentMatch = snippet.match(/=\s*["']([^"']+)["']/i);
    if (assignmentMatch) {
      const decoded = decodePotentialUrl(assignmentMatch[1], baseUrl);
      if (decoded && isLikelyCanvasPreviewUrl(decoded, baseUrl)) {
        console.log("[skin-preview] matched canvas snippet", {
          source: "snippet:assignment",
          raw: assignmentMatch[1],
          decoded,
        });
        return { url: decoded, source: "snippet:assignment" };
      }

      if (decoded) {
        console.log("[skin-preview] discarded canvas snippet", {
          source: "snippet:assignment",
          raw: assignmentMatch[1],
          decoded,
        });
      }
    }
  }

  mentionPattern.lastIndex = 0;

  const contextMatch = findCanvasMatch(
    CANVAS_CONTEXT_URL_PATTERN,
    html,
    baseUrl,
    "context"
  );
  if (contextMatch) {
    return contextMatch;
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
    const canvasPreview = extractCanvasPreviewUrl(html, target);

    let previewUrl = canvasPreview?.url ?? null;
    let previewSource = canvasPreview?.source ?? null;

    if (!previewUrl) {
      const ogImage =
        extractMetaContent(html, "property", "og:image") ??
        extractMetaContent(html, "name", "twitter:image") ??
        null;

      if (ogImage) {
        previewUrl = decodePotentialUrl(ogImage, target);
        previewSource = previewUrl ? "meta" : null;
      }
    }

    if (!previewUrl) {
      console.warn("[skin-preview] preview image not found", {
        config: config.slice(0, 64),
      });
      res.status(404).json({ error: "Preview image not found" });
      return;
    }

    console.log("[skin-preview] resolved preview url", {
      previewUrl,
      previewSource,
    });

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
    console.log("[skin-preview] streaming preview response", {
      previewUrl,
      previewSource,
      contentType,
      contentLength: buffer.length,
    });

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
