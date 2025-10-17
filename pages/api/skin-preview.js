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
    .replace(/\\x2f/gi, "/")
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
const CANVAS_IMAGE_TAG_PATTERN =
  /<img[^>]+id=["']canvas0["'][^>]*(?:data-[^=\s"']+|src)=["']([^"']+)["'][^>]*>/gi;
const CANVAS_DATA_ATTRIBUTE_PATTERN =
  /<canvas[^>]+id=["']canvas0["'][^>]*(data-(?:src|source|image|preview|asset|href|url)(?:-[^=\s"']+)?|src)=["']([^"']+)["'][^>]*>/gi;
const CANVAS_JSON_OBJECT_PATTERN =
  /["']canvas0["']\s*:\s*\{[^{}]*?(?:["'](src|source|image|url|href)["']\s*:\s*["']([^"']+)["'])[^{}]*\}/gi;
const CANVAS_JSON_STRING_PATTERN = /["']canvas0["']\s*:\s*["']([^"']+)["']/gi;
const CANVAS_GENERIC_ASSIGNMENT_PATTERN =
  /canvas0[^<>{}\[\]]*?(?:data|src|source|image|preview|href|url)[-\w:]*\s*[:=]\s*["']([^"']+)["']/gi;
const CANVAS_CONTEXT_URL_PATTERN =
  /canvas0[^<>{}\[\]]*?(https?:\\\/\\\/[^"'\s<>]+|https?:\/\/[^"'\s<>]+)/gi;
const CANVAS_DIRECT_PATTERNS = [
  { pattern: CANVAS_OBJECT_DATA_PATTERN, source: "object:data" },
  { pattern: CANVAS_IMAGE_TAG_PATTERN, source: "img:attr" },
  { pattern: CANVAS_DATA_ATTRIBUTE_PATTERN, source: "canvas:attr" },
  { pattern: CANVAS_JSON_OBJECT_PATTERN, source: "json:object" },
  { pattern: CANVAS_JSON_STRING_PATTERN, source: "json:string" },
  { pattern: CANVAS_GENERIC_ASSIGNMENT_PATTERN, source: "generic" },
];
const CANVAS_TAG_PATTERN = /<canvas[^>]+id=["']canvas0["'][^>]*>/gi;
const CANVAS_ATTRIBUTE_PATTERN =
  /([a-zA-Z_:][-\.\w:]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const CANVAS_ATTRIBUTE_KEYWORDS = [
  "src",
  "image",
  "preview",
  "href",
  "asset",
  "url",
];

function collectCanvasAttributeMatches(html, baseUrl, results) {
  if (!html) {
    return;
  }

  CANVAS_TAG_PATTERN.lastIndex = 0;
  let tagMatch;
  while ((tagMatch = CANVAS_TAG_PATTERN.exec(html))) {
    const tag = tagMatch[0];
    if (!tag) {
      continue;
    }

    CANVAS_ATTRIBUTE_PATTERN.lastIndex = 0;
    let attributeMatch;
    while ((attributeMatch = CANVAS_ATTRIBUTE_PATTERN.exec(tag))) {
      const [, rawName, doubleQuotedValue, singleQuotedValue] = attributeMatch;
      const rawValue = doubleQuotedValue ?? singleQuotedValue ?? "";
      if (!rawName || !rawValue) {
        continue;
      }

      const name = rawName.toLowerCase();

      if (name === "style") {
        const stylePattern = /url\((['"]?)([^"')]+)\1\)/gi;
        let styleMatch;
        while ((styleMatch = stylePattern.exec(rawValue))) {
          const decoded = decodePotentialUrl(styleMatch[2], baseUrl);
          if (decoded && isLikelyCanvasPreviewUrl(decoded, baseUrl)) {
            console.log("[skin-preview] matched canvas attribute", {
              source: "canvas:style",
              attribute: name,
              decoded,
            });
            results.push({ url: decoded, source: "canvas:style" });
          } else if (decoded) {
            console.log("[skin-preview] discarded canvas attribute", {
              source: "canvas:style",
              attribute: name,
              decoded,
            });
          }
        }
        continue;
      }

      const matchesKeyword = CANVAS_ATTRIBUTE_KEYWORDS.some((keyword) =>
        name.includes(keyword)
      );
      if (!matchesKeyword) {
        continue;
      }

      const decoded = decodePotentialUrl(rawValue, baseUrl);
      if (decoded && isLikelyCanvasPreviewUrl(decoded, baseUrl)) {
        console.log("[skin-preview] matched canvas attribute", {
          source: "canvas:attr", // reuse same label for attribute-derived matches
          attribute: name,
          decoded,
        });
        results.push({ url: decoded, source: "canvas:attr" });
      } else if (decoded) {
        console.log("[skin-preview] discarded canvas attribute", {
          source: "canvas:attr",
          attribute: name,
          decoded,
        });
      }
    }
  }

  CANVAS_TAG_PATTERN.lastIndex = 0;
}

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

function collectCanvasMatches(pattern, html, baseUrl, source, results) {
  if (!html) {
    return;
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
      results.push({ url: decoded, source });
      continue;
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
}

function extractCanvasPreviewCandidates(html, baseUrl) {
  if (!html) {
    return [];
  }

  const results = [];

  for (const { pattern, source } of CANVAS_DIRECT_PATTERNS) {
    collectCanvasMatches(pattern, html, baseUrl, source, results);
  }

  collectCanvasAttributeMatches(html, baseUrl, results);

  const mentionPattern = /canvas0/gi;
  let mentionMatch;
  while ((mentionMatch = mentionPattern.exec(html))) {
    const start = mentionMatch.index;
    const snippet = html.slice(start, start + 1024);

    const propertyMatch = snippet.match(
      /(?:data|src|source|image|preview|href|url)[-\w:]*\s*[:=]\s*["']([^"']+)["']/i
    );
    if (propertyMatch) {
      const decoded = decodePotentialUrl(propertyMatch[1], baseUrl);
      if (decoded && isLikelyCanvasPreviewUrl(decoded, baseUrl)) {
        console.log("[skin-preview] matched canvas snippet", {
          source: "snippet:property",
          raw: propertyMatch[1],
          decoded,
        });
        results.push({ url: decoded, source: "snippet:property" });
      } else if (decoded) {
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
        results.push({ url: decoded, source: "snippet:http" });
      } else if (decoded) {
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
        results.push({ url: decoded, source: "snippet:assignment" });
      } else if (decoded) {
        console.log("[skin-preview] discarded canvas snippet", {
          source: "snippet:assignment",
          raw: assignmentMatch[1],
          decoded,
        });
      }
    }
  }

  mentionPattern.lastIndex = 0;

  collectCanvasMatches(
    CANVAS_CONTEXT_URL_PATTERN,
    html,
    baseUrl,
    "context",
    results
  );

  const unique = [];
  const seen = new Set();
  for (const entry of results) {
    if (!entry?.url) {
      continue;
    }
    if (seen.has(entry.url)) {
      continue;
    }
    seen.add(entry.url);
    unique.push(entry);
  }

  return unique;
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
    const canvasCandidates = extractCanvasPreviewCandidates(html, target);

    const metaImage =
      extractMetaContent(html, "property", "og:image") ??
      extractMetaContent(html, "name", "twitter:image") ??
      null;
    if (metaImage) {
      const decodedMeta = decodePotentialUrl(metaImage, target);
      if (decodedMeta) {
        canvasCandidates.push({ url: decodedMeta, source: "meta" });
      }
    }

    if (!canvasCandidates.length) {
      console.warn("[skin-preview] preview image not found", {
        config: config.slice(0, 64),
      });
      res.status(404).json({ error: "Preview image not found" });
      return;
    }

    for (const candidate of canvasCandidates) {
      if (!candidate?.url) {
        continue;
      }

      if (/^data:image\//i.test(candidate.url)) {
        const [meta, dataPart] = candidate.url.split(",", 2);
        if (!dataPart) {
          continue;
        }

        const isBase64 = /;base64/i.test(meta);
        const mimeMatch = meta.match(/^data:([^;,]+)/i);
        const contentType = mimeMatch ? mimeMatch[1] : "image/png";
        const buffer = isBase64
          ? Buffer.from(dataPart, "base64")
          : Buffer.from(decodeURIComponent(dataPart));

        console.log("[skin-preview] streaming inline preview response", {
          previewSource: candidate.source,
          contentType,
          contentLength: buffer.length,
        });

        res.setHeader("Content-Type", contentType);
        res.setHeader(
          "Cache-Control",
          "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400"
        );
        res.setHeader("Content-Length", buffer.length.toString());
        res.status(200).send(buffer);
        return;
      }

      try {
        const imageResponse = await fetch(candidate.url, {
          headers: {
            Accept:
              "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            Referer: target,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          cache: "no-store",
        });

        if (!imageResponse.ok) {
          console.warn("[skin-preview] candidate fetch failed", {
            status: imageResponse.status,
            previewUrl: candidate.url,
            previewSource: candidate.source,
          });
          continue;
        }

        const contentType = imageResponse.headers.get("content-type");
        if (!contentType || !/^image\//i.test(contentType)) {
          console.warn("[skin-preview] rejected non-image candidate", {
            previewUrl: candidate.url,
            previewSource: candidate.source,
            contentType,
          });
          continue;
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        console.log("[skin-preview] streaming preview response", {
          previewUrl: candidate.url,
          previewSource: candidate.source,
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
        return;
      } catch (candidateError) {
        console.warn("[skin-preview] candidate request errored", {
          previewUrl: candidate.url,
          previewSource: candidate.source,
          error: candidateError?.message,
        });
      }
    }

    console.warn("[skin-preview] preview candidates exhausted", {
      config: config.slice(0, 64),
    });
    res.status(502).json({ error: "Unable to fetch preview image" });
  } catch (error) {
    console.error("Failed to proxy Barbofus preview:", error);
    res.status(502).json({ error: "Preview generation failed" });
  }
}

export { extractCanvasPreviewCandidates };
