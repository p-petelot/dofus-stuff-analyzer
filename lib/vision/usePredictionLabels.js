import { useMemo } from "react";

export function usePredictionLabels(t) {
  return useMemo(() => {
    const ensureString = (value, fallback) => (typeof value === "string" ? value : fallback);
    return {
      title: ensureString(t("vision.prediction.title"), "Prédiction du modèle"),
      loading: ensureString(t("vision.prediction.loading"), "Analyse en cours…"),
      placeholder: ensureString(
        t("vision.prediction.placeholder"),
        "Importe une image pour lancer la prédiction.",
      ),
      topClass: ensureString(t("vision.prediction.topClass"), "Classe prédite"),
      confidence: ensureString(t("vision.prediction.confidence"), "Confiance"),
      colors: ensureString(t("vision.prediction.colors"), "Couleurs détectées"),
      top5: ensureString(t("vision.prediction.top5"), "Top 5 classes"),
      preview: {
        title: ensureString(t("vision.prediction.preview.title"), "Aperçu du rendu"),
        alt: ensureString(t("vision.prediction.preview.alt"), "Skin généré par le renderer"),
        missing: ensureString(t("vision.prediction.preview.missing"), "Aucun aperçu disponible."),
        openRenderer: ensureString(t("vision.prediction.preview.open"), "Ouvrir le renderer"),
        metaClass: ensureString(t("vision.prediction.preview.metaClass"), "Classe / Sexe"),
        metaHead: ensureString(t("vision.prediction.preview.metaHead"), "Tête"),
        noHead: ensureString(t("vision.prediction.preview.noHead"), "Aucune"),
      },
      sex: {
        male: ensureString(t("identity.gender.male"), "Homme"),
        female: ensureString(t("identity.gender.female"), "Femme"),
        unknown: ensureString(t("vision.prediction.sex.unknown"), "Inconnu"),
      },
    };
  }, [t]);
}
