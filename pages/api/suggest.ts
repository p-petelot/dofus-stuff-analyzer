import type { NextApiRequest, NextApiResponse } from "next";
import { buildPalettes, extractDominantColors, inferAmbienceFromImage, mergePalettes } from "../../lib/colors/colorEngine";
import { getAllIndexedItems } from "../../lib/items/indexStore";
import { suggestItems } from "../../lib/suggestions/suggestItems";
import { normalizeInput } from "../../lib/vision/preprocess";
import type { SlotKey } from "../../lib/types";

interface SuggestApiBody {
  mode?: "image" | "inspire";
  image?: string;
  classFilter?: string;
  theme?: string;
  slotsNeeded?: SlotKey[];
  preferJokers?: boolean;
  seeds?: string[];
  debug?: boolean;
}

const THEME_SEEDS: Record<string, string> = {
  feu: "#FF7043",
  eau: "#36A4F4",
  air: "#C7E8FF",
  terre: "#7EA04D",
  ombre: "#2A243D",
  lumiere: "#F4EFCB",
  neutre: "#B9B3A5",
};

function pickRandomTheme(): keyof typeof THEME_SEEDS {
  const keys = Object.keys(THEME_SEEDS);
  return keys[Math.floor(Math.random() * keys.length)] as keyof typeof THEME_SEEDS;
}

function buildInspirePalette(theme: keyof typeof THEME_SEEDS): string[] {
  const base = THEME_SEEDS[theme];
  const harmonies = buildPalettes([base]);
  const merged = mergePalettes(harmonies, { maxSize: 5, deltaThreshold: 10 });
  if (merged.length) {
    return merged;
  }
  return [base];
}

function makeSkinName(theme: string): string {
  const capitalised = theme.charAt(0).toUpperCase() + theme.slice(1);
  const suffixes = ["onirique", "élégant", "radieux", "espiègle", "secret"];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  return `${capitalised} ${suffix}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const body = req.body as SuggestApiBody;
    const mode = body.mode ?? (body.image ? "image" : "inspire");
    const items = getAllIndexedItems();

    if (!items.length) {
      res.status(200).json({ suggestions: {}, palette: {}, debug: { warning: "No items loaded" } });
      return;
    }

    if (mode === "inspire") {
      const theme = (body.theme ?? pickRandomTheme()).toLowerCase();
      const paletteColours = buildInspirePalette(theme as keyof typeof THEME_SEEDS);
      const { picks, debug } = suggestItems(
        { colors: paletteColours, theme },
        items,
        {
          classFilter: body.classFilter,
          theme,
          slotsNeeded: body.slotsNeeded,
          preferJokers: body.preferJokers,
        },
      );
      res.status(200).json({
        mode: "inspire",
        theme,
        skinName: makeSkinName(theme),
        palette: { colors: paletteColours },
        suggestions: picks,
        debug: body.debug ? debug : undefined,
      });
      return;
    }

    if (!body.image) {
      res.status(400).json({ error: "Missing image" });
      return;
    }

    const { img512, mask } = await normalizeInput(body.image);
    const dominant = extractDominantColors(img512, { k: 5, mask });
    const harmonies = buildPalettes(dominant);
    const mergedPalette = body.seeds && body.seeds.length ? body.seeds : mergePalettes(harmonies, { maxSize: 6 });
    const ambience = inferAmbienceFromImage(img512);

    const { picks, debug } = suggestItems(
      { colors: mergedPalette, theme: ambience.theme },
      items,
      {
        classFilter: body.classFilter,
        theme: body.theme ?? ambience.theme,
        slotsNeeded: body.slotsNeeded,
        preferJokers: body.preferJokers,
      },
    );

    res.status(200).json({
      mode: "image",
      palette: {
        dominant: dominant.map((entry) => ({ hex: entry.hex, weight: entry.weight })),
        harmonies,
        merged: mergedPalette,
      },
      ambience,
      suggestions: picks,
      debug: body.debug
        ? {
            ...debug,
            seeds: mergedPalette,
          }
        : undefined,
    });
  } catch (error) {
    console.error("suggest api error", error);
    res.status(500).json({ error: "Internal error" });
  }
}

