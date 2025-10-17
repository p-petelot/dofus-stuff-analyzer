import fs from "node:fs/promises";
import path from "node:path";

import {
  decodePotentialUrl,
  extractCanvasPreviewCandidates,
  extractMetaContent,
} from "./skin-preview";

const HEADLESS_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const PUPPETEER_VIEWPORT = { width: 1440, height: 900 };
const RENDER_IDLE_WAIT_MS = 600;
const HEADLESS_LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
];
const DEFAULT_PUPPETEER_CACHE_DIR = path.join(process.cwd(), ".cache", "puppeteer");
const MISSING_EXECUTABLE_PATTERNS = [
  /Could not find Chrome/i,
  /No executable path is set/i,
  /Failed to launch the browser process! spawn .* ENOENT/i,
];

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

let resolvedExecutablePath = null;
let installingChromium = null;

async function pathExists(candidate) {
  if (!candidate || typeof candidate !== "string") {
    return false;
  }

  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

async function resolveExistingExecutable(puppeteer) {
  if (resolvedExecutablePath) {
    return resolvedExecutablePath;
  }

  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (await pathExists(envPath)) {
    resolvedExecutablePath = envPath;
    return resolvedExecutablePath;
  }

  try {
    if (typeof puppeteer?.executablePath === "function") {
      const candidatePath = puppeteer.executablePath();
      if (await pathExists(candidatePath)) {
        resolvedExecutablePath = candidatePath;
        return resolvedExecutablePath;
      }
    }
  } catch (error) {
    console.warn("[site-images] Failed to resolve puppeteer executable path", {
      error: error?.message ?? String(error),
    });
  }

  return null;
}

function isMissingExecutableError(error) {
  if (!error) {
    return false;
  }

  const message = error.message ?? String(error);
  return MISSING_EXECUTABLE_PATTERNS.some((pattern) => pattern.test(message));
}

async function runBundledChromiumInstaller() {
  try {
    const { createRequire } = await import("node:module");
    const { spawn } = await import("node:child_process");
    const require = createRequire(import.meta.url);

    const candidateResolvers = [
      () => require.resolve("puppeteer/lib/cjs/puppeteer/node/install.js"),
      () => require.resolve("puppeteer/install.js"),
    ];

    let installerPath = null;
    for (const resolver of candidateResolvers) {
      try {
        installerPath = resolver();
        break;
      } catch {
        // try next location
      }
    }

    if (!installerPath) {
      throw new Error("Chrome installer introuvable dans le package puppeteer");
    }

    await fs.mkdir(DEFAULT_PUPPETEER_CACHE_DIR, { recursive: true }).catch(() => {});

    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [installerPath], {
        env: {
          ...process.env,
          PUPPETEER_CACHE_DIR: process.env.PUPPETEER_CACHE_DIR ?? DEFAULT_PUPPETEER_CACHE_DIR,
        },
        stdio: "ignore",
      });

      child.once("error", reject);
      child.once("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Le processus d'installation Chromium a échoué (code ${code})`));
        }
      });
    });
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

async function ensureChromiumInstalled(puppeteer) {
  const existingPath = await resolveExistingExecutable(puppeteer);
  if (existingPath) {
    return existingPath;
  }

  if (!installingChromium) {
    installingChromium = (async () => {
      try {
        await runBundledChromiumInstaller();
      } catch (installError) {
        throw installError;
      }

      const downloadedPath = await resolveExistingExecutable(puppeteer);
      if (downloadedPath) {
        return downloadedPath;
      }

      throw new Error(
        "Chromium n'a pas pu être installé automatiquement (exécutable introuvable après l'installation)."
      );
    })();
  }

  try {
    const executable = await installingChromium;
    resolvedExecutablePath = executable ?? resolvedExecutablePath;
    return executable;
  } finally {
    installingChromium = null;
  }
}

function buildLaunchOptions(executablePath) {
  const options = {
    headless: "new",
    args: HEADLESS_LAUNCH_ARGS,
  };

  if (executablePath) {
    options.executablePath = executablePath;
  }

  return options;
}

async function captureRenderedContent(page, url) {
  await page.setUserAgent(HEADLESS_USER_AGENT);
  await page.setViewport(PUPPETEER_VIEWPORT);

  await page.goto(url, { waitUntil: "networkidle0", timeout: 45000 });

  await page.evaluate(
    () =>
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );

  await page.waitForTimeout(RENDER_IDLE_WAIT_MS);

  const html = await page.content();
  const canvasSnapshots = await page.evaluate(() => {
    const entries = [];
    const canvases = Array.from(document.querySelectorAll("canvas"));

    for (const canvas of canvases) {
      let dataUrl = null;
      let error = null;

      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch (captureError) {
        error = captureError instanceof Error ? captureError.message : String(captureError);
      }

      entries.push({
        id: canvas.id ?? null,
        className: canvas.className ?? null,
        width: Number.isFinite(canvas.width) ? canvas.width : null,
        height: Number.isFinite(canvas.height) ? canvas.height : null,
        dataUrl,
        error,
      });
    }

    return entries;
  });

  return { html, canvasSnapshots };
}

async function renderPageDom(url) {
  let puppeteer;
  try {
    const module = await import("puppeteer");
    puppeteer = module?.default ?? module;
  } catch (importError) {
    console.warn("[site-images] Unable to load puppeteer, falling back to HTTP fetch", {
      error: importError?.message ?? String(importError),
    });
    return {
      html: null,
      canvasSnapshots: [],
      renderer: "http",
      error: importError?.message ?? String(importError),
    };
  }

  let browser = null;
  let page = null;

  let executablePath = await resolveExistingExecutable(puppeteer);

  try {
    browser = await puppeteer.launch(buildLaunchOptions(executablePath));

    page = await browser.newPage();
    const { html, canvasSnapshots } = await captureRenderedContent(page, url);

    return {
      html,
      canvasSnapshots,
      renderer: "puppeteer",
      error: null,
    };
  } catch (error) {
    if (!browser && isMissingExecutableError(error)) {
      console.warn("[site-images] Chrome executable missing, attempting automatic install", {
        url,
        error: error?.message ?? String(error),
      });

      try {
        const ensuredPath = await ensureChromiumInstalled(puppeteer);
        executablePath = ensuredPath ?? executablePath;

        if (!executablePath) {
          throw new Error(
            "Chrome n'a pas pu être localisé même après la tentative d'installation automatique."
          );
        }

        browser = await puppeteer.launch(buildLaunchOptions(executablePath));
        page = await browser.newPage();
        const { html, canvasSnapshots } = await captureRenderedContent(page, url);

        return {
          html,
          canvasSnapshots,
          renderer: "puppeteer",
          error: null,
        };
      } catch (installError) {
        console.warn("[site-images] Automatic Chrome install failed", {
          url,
          error: installError?.message ?? String(installError),
        });

        return {
          html: null,
          canvasSnapshots: [],
          renderer: "puppeteer",
          error: `${
            installError?.message ??
            error?.message ??
            "Chrome introuvable et installation automatique impossible."
          } (installez-le manuellement via \`npx puppeteer browsers install chrome\`)`,
        };
      }
    }

    console.warn("[site-images] headless render failed", {
      url,
      error: error?.message ?? String(error),
    });

    return {
      html: null,
      canvasSnapshots: [],
      renderer: "puppeteer",
      error: error?.message ?? String(error),
    };
  } finally {
    if (page) {
      try {
        await page.close();
      } catch (closePageError) {
        console.warn("[site-images] failed to close puppeteer page", closePageError);
      }
    }

    if (browser) {
      try {
        await browser.close();
      } catch (closeBrowserError) {
        console.warn("[site-images] failed to close puppeteer browser", closeBrowserError);
      }
    }
  }
}

function mapCanvasSnapshotsToCandidates(snapshots) {
  if (!Array.isArray(snapshots)) {
    return { candidates: [], diagnostics: [] };
  }

  const candidates = [];
  const diagnostics = [];

  snapshots.forEach((snapshot, index) => {
    if (!snapshot) {
      return;
    }

    const id = typeof snapshot.id === "string" && snapshot.id.length > 0 ? snapshot.id : null;
    const className =
      typeof snapshot.className === "string" && snapshot.className.length > 0
        ? snapshot.className
        : null;

    if (snapshot.error) {
      diagnostics.push({
        index,
        elementId: id,
        elementClass: className,
        error: snapshot.error,
      });
    }

    if (!snapshot.dataUrl || typeof snapshot.dataUrl !== "string") {
      return;
    }

    if (!snapshot.dataUrl.startsWith("data:")) {
      diagnostics.push({
        index,
        elementId: id,
        elementClass: className,
        error: "Rendered canvas did not return a data URI",
      });
      return;
    }

    let descriptor = null;
    const width = Number.isFinite(snapshot.width) ? snapshot.width : null;
    const height = Number.isFinite(snapshot.height) ? snapshot.height : null;

    if (width && height) {
      descriptor = `toDataURL (${width}×${height})`;
    } else if (width) {
      descriptor = `toDataURL (width: ${width})`;
    } else if (height) {
      descriptor = `toDataURL (height: ${height})`;
    }

    candidates.push({
      url: snapshot.dataUrl,
      source: "canvas:rendered",
      attribute: "toDataURL",
      element: "canvas",
      elementId: id,
      elementClass: className,
      descriptor,
    });
  });

  return { candidates, diagnostics };
}

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
    const renderResult = await renderPageDom(normalizedUrl);
    let html = renderResult.html;
    const attemptedHeadless = renderResult.renderer === "puppeteer";
    const { candidates: renderedCanvasCandidates, diagnostics: canvasDiagnostics } =
      mapCanvasSnapshotsToCandidates(renderResult.canvasSnapshots);

    let fallbackStatus = null;
    let renderingMode = html ? "puppeteer" : "http";
    let renderingError = renderResult.error ?? null;

    if (!html) {
      const pageResponse = await fetch(normalizedUrl, {
        headers: {
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        cache: "no-store",
      });

      fallbackStatus = pageResponse.status;

      if (!pageResponse.ok) {
        res
          .status(pageResponse.status)
          .json({ error: "Unable to fetch page content", status: pageResponse.status });
        return;
      }

      html = await pageResponse.text();
      renderingMode = "http";
    }

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
      ...renderedCanvasCandidates,
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
      rendering: {
        mode: renderingMode,
        attemptedHeadless,
        canvasCount: Array.isArray(renderResult.canvasSnapshots)
          ? renderResult.canvasSnapshots.length
          : 0,
        captured: renderedCanvasCandidates.length,
        diagnostics: canvasDiagnostics,
        error: renderingError,
        fallbackStatus,
      },
    });
  } catch (error) {
    console.error("Failed to fetch site images", error);
    res.status(502).json({ error: "Unable to retrieve site images" });
  }
}

export {
  extractImageTagCandidates,
  extractMetaImageCandidates,
  aggregateImageCandidates,
  mapCanvasSnapshotsToCandidates,
};
