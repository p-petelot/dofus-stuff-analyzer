import { GalleryCollectionsView } from "./galerie";

const THEMES_PAGE_CONFIG = {
  pageTitle: "Collection Thèmes | KrosPalette",
  pageDescription:
    "Choisissez une couleur de référence et explorez une large sélection de skins aux classes et sexes aléatoires.",
  eyebrow: "Collection Thèmes",
  heroTitle: "Collection Thèmes",
  heroDescription:
    "Retrouvez l'expérience complète de la page d'accueil avec bien plus d'inspirations générées à partir de votre couleur favorite.",
  colorLabel: "Couleur",
  defaultCount: 18,
};

export default function ThemesCollectionPage() {
  return <GalleryCollectionsView config={THEMES_PAGE_CONFIG} />;
}
