import {
  decodePotentialUrl,
  extractCanvasPreviewCandidates,
  extractMetaContent,
} from "./skin-preview";

const IMAGE_TAG_PATTERN = /<img[^>]*>/gi;
const ATTRIBUTE_PATTERN = /([a-zA-Z_:][-\.\w:]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
const IMAGE_ATTRIBUTE_KEYWORDS = [
  "src",
  "image",
  "preview",
  "thumb",
  "icon",
  "url",
  "href",
  "poster",
  "original",
];
const STYLE_URL_PATTERN = /url\((['"]?)([^"')]+)\1\)/gi;
const SRCSET_DELIMITER = /\s+/;
const TEST_PAGE_PATH = "/image-inspector";

function extractImageTagCandidates(html, baseUrl) {
  if (!html) {
    return [];
  }

  const results = [];
  IMAGE_TAG_PATTERN.lastIndex = 0;
  let match;

  while ((match = IMAGE_TAG_PATTERN.exec(html))) {
    const tag = match[0];
    if (!tag) {
      continue;
    }

    ATTRIBUTE_PATTERN.lastIndex = 0;
    let attributeMatch;
    const attributes = [];

    while ((attributeMatch = ATTRIBUTE_PATTERN.exec(tag))) {
      const [, rawName, doubleQuotedValue, singleQuotedValue] = attributeMatch;
      if (!rawName) {
        continue;
      }
      const rawValue = doubleQuotedValue ?? singleQuotedValue ?? "";
      attributes.push({
        rawName,
        name: rawName.toLowerCase(),
        value: rawValue,
      });
    }

    const idAttribute = attributes.find((attribute) => attribute.name === "id");
    const classAttribute = attributes.find((attribute) => attribute.name === "class");

    const elementDetails = {
      element: "img",
      elementId: idAttribute?.value ?? null,
      elementClass: classAttribute?.value ?? null,
    };

    for (const attribute of attributes) {
      if (!attribute.value) {
        continue;
      }

      if (attribute.name === "style") {
        STYLE_URL_PATTERN.lastIndex = 0;
        let styleMatch;
        while ((styleMatch = STYLE_URL_PATTERN.exec(attribute.value))) {
          const decoded = decodePotentialUrl(styleMatch[2], baseUrl);
          if (!decoded) {
            continue;
          }
          results.push({
            url: decoded,
            source: "img:style",
            attribute: attribute.rawName,
            ...elementDetails,
          });
        }
        continue;
      }

      if (attribute.name === "srcset" || attribute.name.endsWith("srcset")) {
        const parts = attribute.value.split(",").map((entry) => entry.trim()).filter(Boolean);
        for (const part of parts) {
          const [srcCandidate] = part.split(SRCSET_DELIMITER);
          if (!srcCandidate) {
            continue;
          }
          const decoded = decodePotentialUrl(srcCandidate, baseUrl);
          if (!decoded) {
            continue;
          }
          results.push({
            url: decoded,
            source: "img:srcset",
            attribute: attribute.rawName,
            descriptor: part,
            ...elementDetails,
          });
        }
        continue;
      }

      const matchesKeyword = IMAGE_ATTRIBUTE_KEYWORDS.some((keyword) =>
        attribute.name.includes(keyword)
      );
      if (!matchesKeyword) {
        continue;
      }

      const decoded = decodePotentialUrl(attribute.value, baseUrl);
      if (!decoded) {
        continue;
      }

      results.push({
        url: decoded,
        source: "img:attr",
        attribute: attribute.rawName,
        ...elementDetails,
      });
    }
  }

  IMAGE_TAG_PATTERN.lastIndex = 0;

  return results;
}

function extractMetaImageCandidates(html, baseUrl) {
  if (!html) {
    return [];
  }

  const metaConfigs = [
    { attribute: "property", value: "og:image" },
    { attribute: "property", value: "og:image:secure_url" },
    { attribute: "name", value: "twitter:image" },
    { attribute: "name", value: "twitter:image:src" },
  ];

  const results = [];

  for (const { attribute, value } of metaConfigs) {
    const raw = extractMetaContent(html, attribute, value);
    if (!raw) {
      continue;
    }
    const decoded = decodePotentialUrl(raw, baseUrl);
    if (!decoded) {
      continue;
    }
    results.push({
      url: decoded,
      source: `meta:${attribute}:${value}`,
      attribute: `${attribute}=${value}`,
      element: "meta",
    });
  }

  return results;
}

function aggregateImageCandidates(candidates) {
  const map = new Map();

  for (const candidate of candidates) {
    if (!candidate?.url) {
      continue;
    }

    const key = candidate.url;
    let record = map.get(key);
    if (!record) {
      record = {
        url: candidate.url,
        inline: candidate.url.startsWith("data:"),
        matches: [],
      };
      map.set(key, record);
    }

    record.inline = record.inline || candidate.url.startsWith("data:");
    record.matches.push({
      source: candidate.source ?? null,
      attribute: candidate.attribute ?? null,
      element: candidate.element ?? null,
      elementId: candidate.elementId ?? null,
      elementClass: candidate.elementClass ?? null,
      descriptor: candidate.descriptor ?? null,
    });
  }

  const aggregated = [];
  for (const record of map.values()) {
    const elementSet = new Set(
      record.matches
        .map((match) => match.element)
        .filter((value) => typeof value === "string" && value.length > 0)
    );

    aggregated.push({
      url: record.url,
      inline: record.inline,
      matches: record.matches,
      elements: Array.from(elementSet),
    });
  }

  return aggregated;
}

async function hydrateImageData(entries, referer) {
  for (const entry of entries) {
    if (!entry?.url) {
      entry.error = "Missing URL";
      continue;
    }

    if (entry.inline || entry.url.startsWith("data:")) {
      const [meta, dataPart] = entry.url.split(",", 2);
      if (!dataPart) {
        entry.error = "Invalid data URI";
        continue;
      }

      const isBase64 = /;base64/i.test(meta);
      const mimeMatch = meta.match(/^data:([^;,]+)/i);
      const contentType = mimeMatch ? mimeMatch[1] : "image/png";
      let base64;

      try {
        if (isBase64) {
          base64 = dataPart.trim();
        } else {
          base64 = Buffer.from(decodeURIComponent(dataPart)).toString("base64");
        }
      } catch (decodeError) {
        entry.error = `Unable to decode data URI: ${decodeError.message}`;
        continue;
      }

      entry.contentType = contentType;
      entry.base64 = base64;
      entry.encoding = "base64";
      entry.byteLength = Buffer.from(base64, "base64").length;
      entry.status = "inline";
      continue;
    }

    try {
      const response = await fetch(entry.url, {
        headers: {
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          Referer: referer,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        cache: "no-store",
      });

      entry.status = response.status;

      if (!response.ok) {
        entry.error = `Request failed with status ${response.status}`;
        continue;
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      entry.contentType = response.headers.get("content-type");
      entry.base64 = buffer.toString("base64");
      entry.encoding = "base64";
      entry.byteLength = buffer.length;
      entry.cacheControl = response.headers.get("cache-control");
    } catch (networkError) {
      entry.error = networkError?.message ?? "Unknown error";
    }
  }
}

function summarizeMatches(entries) {
  let totalMatches = 0;
  for (const entry of entries) {
    totalMatches += Array.isArray(entry.matches) ? entry.matches.length : 0;
  }
  return totalMatches;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { url: rawUrl } = req.query;

  if (!rawUrl || (Array.isArray(rawUrl) && rawUrl.length === 0)) {
    res.status(400).json({ error: "Missing url parameter" });
    return;
  }

  const target = Array.isArray(rawUrl) ? rawUrl[0] : rawUrl;

  if (typeof target !== "string" || !target.trim()) {
    res.status(400).json({ error: "Invalid url parameter" });
    return;
  }

  let normalizedUrl;
  try {
    normalizedUrl = new URL(target).toString();
  } catch (parseError) {
    res.status(400).json({ error: "Malformed url parameter" });
    return;
  }

  try {
    const pageResponse = await fetch(normalizedUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      cache: "no-store",
    });

    if (!pageResponse.ok) {
      res
        .status(pageResponse.status)
        .json({ error: "Unable to fetch page content", status: pageResponse.status });
      return;
    }

    const html = await pageResponse.text();

    const canvasCandidates = extractCanvasPreviewCandidates(html, normalizedUrl).map(
      (candidate) => ({
        ...candidate,
        element: "canvas",
      })
    );
    const imageCandidates = extractImageTagCandidates(html, normalizedUrl);
    const metaCandidates = extractMetaImageCandidates(html, normalizedUrl);

    const aggregated = aggregateImageCandidates([
      ...canvasCandidates,
      ...imageCandidates,
      ...metaCandidates,
    ]);

    await hydrateImageData(aggregated, normalizedUrl);

    res.status(200).json({
      requestedUrl: normalizedUrl,
      fetchedAt: new Date().toISOString(),
      testPage: TEST_PAGE_PATH,
      uniqueImages: aggregated.length,
      totalMatches: summarizeMatches(aggregated),
      images: aggregated,
    });
  } catch (error) {
    console.error("Failed to fetch site images", error);
    res.status(502).json({ error: "Unable to retrieve site images" });
  }
}

export { extractImageTagCandidates, extractMetaImageCandidates, aggregateImageCandidates };
