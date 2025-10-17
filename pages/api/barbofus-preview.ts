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
const DEFAULT_VIEWPORT = { width: 1280, height: 720 } as const;
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
      () => typeof (window as any).generateFinalInputImage === "function",
      undefined,
      { timeout: PAGE_TIMEOUT }
    );

    const capture = await page.evaluate(async () => {
      const shareFunction = (window as any).generateFinalInputImage;
      if (typeof shareFunction !== "function") {
        throw new Error("Missing Barbofus share helper");
      }

      const form = document.getElementById("skinator-form") as HTMLFormElement | null;
      const fileInput = document.getElementById("image_path") as HTMLInputElement | null;

      if (!form || !fileInput) {
        throw new Error("Missing Barbofus share form controls");
      }

      let generatedFile: File | null = null;
      const originalSubmit = form.submit.bind(form);
      form.submit = () => {
        generatedFile = fileInput.files?.[0] ?? null;
      };

      try {
        await shareFunction();
      } finally {
        form.submit = originalSubmit;
      }

      if (!generatedFile) {
        throw new Error("Barbofus preview generation did not yield a file");
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const value = typeof reader.result === "string" ? reader.result : null;
          if (!value) {
            reject(new Error("Unable to read preview blob"));
            return;
          }
          resolve(value);
        };
        reader.onerror = () => reject(reader.error ?? new Error("Failed to read preview file"));
        reader.readAsDataURL(generatedFile as Blob);
      });

      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => reject(new Error("Unable to determine preview dimensions"));
        image.src = dataUrl;
      });

      return {
        dataUrl,
        width: dimensions.width,
        height: dimensions.height,
      };
    });

    if (!capture) {
      return null;
    }

    return capture;
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

    if (!BARBOFUS_ALLOWED_PATHS.includes(normalizedPath as (typeof BARBOFUS_ALLOWED_PATHS)[number])) {
      return null;
    }

    parsed.pathname = normalizedPath === "/skinator/render" ? "/skinator" : normalizedPath;
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
