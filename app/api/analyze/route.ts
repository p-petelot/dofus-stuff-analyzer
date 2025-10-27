import sharp from "next/dist/compiled/sharp";
import { NextResponse, type NextRequest } from "next/server";

import { extractColors } from "../../../lib/colors";
import { postImage } from "../../../lib/http";
import type { AnalyzeResult } from "../../../types";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);
const FALLBACK_SLOTS = [
  "head",
  "cape",
  "amulet",
  "belt",
  "ring1",
  "ring2",
  "boots",
  "weapon",
  "shield",
  "pet",
  "mount",
  "dofus",
];

const FALLBACK_ITEMS: Record<string, number | null> = FALLBACK_SLOTS.reduce(
  (acc, slot) => ({ ...acc, [slot]: null }),
  {} as Record<string, number | null>,
);

function parseFileFromRequest(formData: FormData): File | null {
  const file = formData.get("file");
  if (file instanceof File) {
    return file;
  }
  if (file instanceof Blob) {
    return new File([file], "upload", { type: file.type });
  }
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const classApiUrl = process.env.CLASS_API_URL;
  const itemsApiUrl = process.env.ITEMS_API_URL;
  const authToken = process.env.AUTH_TOKEN;

  const start = Date.now();

  try {
    const formData = await req.formData();
    const file = parseFileFromRequest(formData);

    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 422 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Unsupported file type" }, { status: 422 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File exceeds 5MB limit" }, { status: 422 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const [colors, metadata] = await Promise.all([
      extractColors(buffer),
      sharp(buffer, { failOnError: false }).metadata(),
    ]);

    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    const fileName = file.name || "upload";
    const classPromise = classApiUrl
      ? postImage<{ breed?: string; sex?: string }>(classApiUrl, buffer, {
          token: authToken,
          filename: fileName,
          contentType: file.type,
        }).catch((error) => ({ error }))
      : Promise.resolve({ error: new Error("Missing CLASS_API_URL") });

    const itemsPromise = itemsApiUrl
      ? postImage<{ items?: Record<string, number | null> }>(itemsApiUrl, buffer, {
          token: authToken,
          filename: fileName,
          contentType: file.type,
        }).catch((error) => ({ error }))
      : Promise.resolve({ error: new Error("Missing ITEMS_API_URL") });

    const [classResponse, itemsResponse] = await Promise.all([classPromise, itemsPromise]);

    let breed = "Unknown";
    let sex = "Unknown";
    let items: Record<string, number | null> = { ...FALLBACK_ITEMS };
    let classError: Error | null = null;
    let itemsError: Error | null = null;

    if ("error" in classResponse && classResponse.error instanceof Error) {
      classError = classResponse.error;
    } else if (classResponse && typeof classResponse === "object") {
      breed = (classResponse as { breed?: string }).breed ?? "Unknown";
      sex = (classResponse as { sex?: string }).sex ?? "Unknown";
    }

    if ("error" in itemsResponse && itemsResponse.error instanceof Error) {
      itemsError = itemsResponse.error;
    } else if (
      itemsResponse &&
      typeof itemsResponse === "object" &&
      "items" in itemsResponse &&
      itemsResponse.items &&
      typeof itemsResponse.items === "object"
    ) {
      items = itemsResponse.items as Record<string, number | null>;
    }

    const latencyMs = Date.now() - start;

    const result: AnalyzeResult = {
      breed,
      sex,
      items,
      colors,
      meta: {
        imageWidth: width,
        imageHeight: height,
        latencyMs,
      },
    };

    const hasClassError = Boolean(classError);
    const hasItemsError = Boolean(itemsError);

    if (hasClassError || hasItemsError) {
      const responseBody = {
        ...result,
        meta: {
          ...result.meta,
          upstreamErrors: {
            class: classError?.message ?? null,
            items: itemsError?.message ?? null,
          },
        },
      };
      return NextResponse.json(responseBody, { status: hasClassError && hasItemsError ? 502 : 200 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
