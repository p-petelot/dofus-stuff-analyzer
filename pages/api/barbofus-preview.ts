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
const BARBOFUS_RENDER_PATH = "/skinator/render";
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

    const result = await page.evaluate<CanvasPayload>(() => {
      const canvas = document.querySelector<HTMLCanvasElement>("canvas");
      if (!canvas) {
        return null;
      }
      try {
        const dataUrl = canvas.toDataURL("image/png");
        return {
          dataUrl,
          width: canvas.width,
          height: canvas.height,
        };
      } catch (error) {
        console.error("Unable to read canvas", error);
        return null;
      }
    });

    return result;
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

    if (!parsed.pathname.startsWith(BARBOFUS_RENDER_PATH)) {
      return null;
    }

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
