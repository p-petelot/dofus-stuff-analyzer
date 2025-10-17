import { NextResponse } from 'next/server';
import { chromium, errors } from 'playwright';
import type { Browser, Page } from 'playwright';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NETWORK_TIMEOUT_MS = 45_000;
const CANVAS_WAIT_TIMEOUT_MS = 10_000;

type ErrorResponse = {
  error: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json<ErrorResponse>({ error: message }, { status });
}

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const targetUrl = requestUrl.searchParams.get('url');

  if (!targetUrl) {
    return jsonError('Missing url', 400);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch (error) {
    return jsonError('Invalid url', 400);
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return jsonError('Unsupported protocol', 400);
  }

  let browser: Browser | undefined;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    console.error('Failed to launch Chromium', error);
    return jsonError('Internal error', 500);
  }

  let page: Page | undefined;
  try {
    page = await browser.newPage();
  } catch (error) {
    console.error('Failed to create page', error);
    await browser.close();
    browser = undefined;
    return jsonError('Internal error', 500);
  }

  try {
    try {
      await page.goto(parsedUrl.toString(), {
        waitUntil: 'networkidle',
        timeout: NETWORK_TIMEOUT_MS,
      });
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        return jsonError('Render timeout', 504);
      }
      console.error('Navigation error', error);
      return jsonError('Internal error', 500);
    }

    try {
      await page.waitForFunction(
        () => document.querySelectorAll('canvas').length > 0,
        {
          timeout: CANVAS_WAIT_TIMEOUT_MS,
        }
      );
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        return jsonError('No canvas found', 404);
      }
      console.error('Error waiting for canvases', error);
      return jsonError('Internal error', 500);
    }

    const canvasHandle = await page.evaluateHandle(() => {
      const canvases = Array.from(
        document.querySelectorAll('canvas')
      ) as HTMLCanvasElement[];
      if (!canvases.length) {
        return null;
      }
      return canvases
        .slice()
        .sort(
          (a, b) =>
            b.width * b.height - a.width * a.height
        )[0];
    });

    const elementHandle = canvasHandle.asElement();
    if (!elementHandle) {
      await canvasHandle.dispose();
      return jsonError('No canvas found', 404);
    }

    let buffer: Buffer;
    try {
      buffer = await elementHandle.screenshot({ type: 'png' });
    } finally {
      await canvasHandle.dispose();
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Unexpected error while grabbing canvas', error);
    return jsonError('Internal error', 500);
  } finally {
    await page?.close().catch((closeError) => {
      console.error('Failed to close page', closeError);
    });
    await browser?.close().catch((closeError) => {
      console.error('Failed to close browser', closeError);
    });
  }
}
