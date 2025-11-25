import { normalizeLanguage, DEFAULT_LANGUAGE } from "../../lib/i18n";
import { generateGallerySkins } from "../../lib/gallery/generator";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  try {
    const { lang, count, tone, color } = req.query ?? {};
    const language = normalizeLanguage(lang) ?? DEFAULT_LANGUAGE;
    const limit = Number.isFinite(Number(count)) ? Math.trunc(Number(count)) : undefined;
    const skins = await generateGallerySkins({ language, count: limit, tone, color });
    res.status(200).json({ skins });
  } catch (error) {
    console.error("gallery api error", error);
    res.status(500).json({ error: "Impossible de générer la galerie" });
  }
}
