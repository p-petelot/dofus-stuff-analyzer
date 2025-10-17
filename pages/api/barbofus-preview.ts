import type { NextApiRequest, NextApiResponse } from "next";
import type { Browser } from "playwright";
import { chromium } from "playwright";

type SuccessResponse = {
  image: string;
  width: number;
  height: number;
};

type ErrorResponse = {
  error: string;
};

const BARBOFUS_ORIGIN = "https://barbofus.com";
const BARBOFUS_ALLOWED_PATHS = ["/skinator", "/skinator/render"] as const;
const DEFAULT_VIEWPORT = { width: 512, height: 512 } as const;
const PAGE_TIMEOUT = 15000;

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
    });
  }

  return browserPromise;
}

type CanvasPayload = {
  dataUrl: string;
  width: number;
  height: number;
} | null;

async function captureCanvasFromUrl(url: string): Promise<CanvasPayload> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { ...DEFAULT_VIEWPORT },
    deviceScaleFactor: 2,
  });

  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: PAGE_TIMEOUT });

    await page.waitForFunction(
      () => {
        const canvas = document.querySelector<HTMLCanvasElement>("canvas");
        return Boolean(canvas && canvas.width > 0 && canvas.height > 0);
      },
      undefined,
      { timeout: PAGE_TIMEOUT }
    );

    const canvasLocator = page.locator("canvas");
    await canvasLocator.waitFor({ state: "visible", timeout: PAGE_TIMEOUT });

    const metadata = await page.evaluate<
      | {
          width: number;
          height: number;
        }
      | null
    >(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas");
      if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
        return null;
      }

      return {
        width: canvas.width,
        height: canvas.height,
      };
    });

    if (!metadata) {
      return null;
    }

    const screenshot = await canvasLocator.screenshot({ type: "png" });
    const dataUrl = `data:image/png;base64,${screenshot.toString("base64")}`;

    return {
      dataUrl,
      width: metadata.width,
      height: metadata.height,
    };
  } finally {
    await context.close();
  }
}

function sanitizePreviewUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (parsed.origin !== BARBOFUS_ORIGIN) {
      return null;
    }

    let normalizedPath = parsed.pathname;
    while (normalizedPath.length > 1 && normalizedPath.endsWith("/")) {
      normalizedPath = normalizedPath.slice(0, -1);
    }

    if (!BARBOFUS_ALLOWED_PATHS.includes(normalizedPath)) {
      return null;
    }

    parsed.pathname = normalizedPath;
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

export default async function handler(
  request: NextApiRequest,
  response: NextApiResponse<SuccessResponse | ErrorResponse>
): Promise<void> {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    response.status(405).json({ error: "Méthode non autorisée." });
    return;
  }

  const previewUrl = sanitizePreviewUrl(request.query.url);
  if (!previewUrl) {
    response.status(400).json({ error: "URL Barbofus invalide." });
    return;
  }

  try {
    const capture = await captureCanvasFromUrl(previewUrl);
    if (!capture || !capture.dataUrl) {
      response.status(502).json({ error: "Impossible de récupérer l'aperçu Barbofus." });
      return;
    }

    response.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
    response.status(200).json({ image: capture.dataUrl, width: capture.width, height: capture.height });
  } catch (error) {
    console.error("Failed to capture Barbofus preview", error);
    response.status(500).json({ error: "Une erreur est survenue lors de la génération de l'aperçu." });
  }
}

export const config = {
  api: {
    bodyParser: false,
    responseLimit: "8mb",
  },
};

process.once("exit", async () => {
  if (browserPromise) {
    try {
      const browser = await browserPromise;
      await browser.close();
    } catch (error) {
      console.error("Failed to close Playwright browser", error);
    }
    browserPromise = null;
  }
});
