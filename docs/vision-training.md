# Entraînement de l'IA de détection de looks

Ce document décrit la logique d'entraînement qui alimente la prédiction automatique de la classe, du sexe, des couleurs et des items d'un personnage. Il explique comment préparer les données issues des générations existantes du site, comment lancer un apprentissage et comment suivre sa progression.

## Vue d'ensemble du pipeline

1. **Collecte des générations** – Les exports de l'atelier (images, classe, genre, couleurs, items, métadonnées) sont enregistrés au format JSON ou JSONL dans `./.cache/generations/`.
2. **Prétraitement visuel** – Chaque image est normalisée à 512×512 px (`lib/vision/preprocess.ts`) et un masque approximatif du personnage est calculé pour localiser les différents slots d'équipement.
3. **Extraction d'attributs visuels** – Un backbone CLIP (`@xenova/transformers`) convertit l'image globale et les crops de slots en vecteurs d'embedding (`lib/vision/features.ts`). Si le modèle n'est pas disponible localement, une alternative déterministe est utilisée pour conserver un comportement stable.
4. **Construction de l'index** – Les embeddings, les couleurs et les métadonnées sont stockés dans un index vectoriel persistant (`lib/vision/index.ts`). Cet index est réutilisé pour les prédictions et permet d'éviter de retraiter des exemples identiques.
5. **Suivi de progression** – Chaque session d'entraînement journalise sa progression et son statut dans `./.cache/vision-training.json` (`lib/vision/progress.ts`). Le dashboard `/vision/progress` lit ces informations pour fournir un suivi temps réel.

## Préparer les données d'entraînement

Le chargeur (`lib/vision/dataset.ts`) accepte différents formats pour faciliter la réutilisation des exports historiques :

- Un dossier contenant plusieurs fichiers `*.json` ou `*.jsonl`.
- Un seul fichier `examples.json` ou `examples.jsonl`.

Chaque entrée doit fournir au minimum un identifiant stable et une image. Les clés les plus courantes sont directement reconnues :

```json
{
  "id": "look-001",
  "image": "relative/or/absolute/path.png",
  "class": "Iop",
  "gender": "m",
  "colors": ["#FDC400", "#A96B00", "#4F2E00"],
  "items": { "coiffe": 12345, "cape": 67890 }
}
```

- `image` peut être un chemin relatif/absolu vers un fichier ou une Data URL (`data:image/png;base64,...`).
- Les alias comme `breed`, `classe`, `sex`, `palette`, `equipment`, etc. sont normalisés automatiquement.
- Jusqu'à 6 couleurs sont retenues par look et stockées telles qu'elles apparaissent dans les données source.

Placez les fichiers dans `./.cache/generations/` (ou passez un autre dossier via `datasetPath`). Lors du premier entraînement, toutes les entrées seront traitées ; lors des exécutions suivantes, un fingerprint compare l'image et les attributs pour ne recalculer que les nouvelles variantes.

## Lancer un entraînement

L'index est construit à la demande. Vous pouvez déclencher manuellement une session depuis la ligne de commande Node.js :

```bash
node -e "import('./lib/vision/index').then(async (m) => {\n  await m.buildVisionIndexFromGenerations();\n  process.exit(0);\n});"
```

Options utiles (toutes facultatives) :

- `VISION_CLIP_MODEL` : identifiant du modèle CLIP à utiliser (par défaut `Xenova/clip-vit-base-patch32`).
- `TRANSFORMERS_CACHE` : dossier où télécharger les poids du modèle (défaut `./.cache/transformers`).
- `VISION_FORCE_STUB=1` : force l'utilisation des embeddings déterministes pour les tests hors-ligne.
- `NODE_OPTIONS="--max-old-space-size=4096"` : augmente la mémoire disponible si le dataset est volumineux.

Le fichier d'index généré est sauvegardé dans `./.cache/vision-index.json`. Il est rechargé automatiquement par l'API `/api/analyze-look` lors des prédictions.

## Suivre la progression

Chaque exécution écrit sa progression dans `./.cache/vision-training.json` :

- `status` : `running`, `completed` ou `failed`.
- `processedExamples`, `reusedExamples`, `newExamples`, `failedExamples` : compteurs mis à jour en temps réel.
- `message` et `lastExampleId` : informations de debug pour comprendre où en est le traitement.

Ces informations sont exposées par `GET /api/vision-progress` et visualisées sur le dashboard `/vision/progress`. Depuis la page d'accueil, un lien "Suivre l'entraînement IA" permet d'accéder rapidement au tableau de bord.

## Réutilisation de l'index

Le chargeur d'index (`loadVisionIndex`) tente d'abord de charger `vision-index.json`. Si le fichier existe et que les empreintes (`sourceFingerprint`) correspondent toujours aux exemples, il n'y a pas de retraitement. Pour forcer un recalcul complet, supprimez simplement les fichiers `vision-index.json` et `vision-training.json` puis relancez la commande d'entraînement.

## Dépannage rapide

- **Modèle trop long à télécharger** : définissez `TRANSFORMERS_CACHE` sur un disque rapide et vérifiez la connectivité réseau.
- **Erreurs d'image introuvable** : assurez-vous que les chemins contenus dans vos JSON sont accessibles depuis le serveur (utilisez des chemins absolus ou placez les assets dans `public/`).
- **Peu de prédictions pertinentes** : vérifiez que les items sont correctement renseignés et qu'il existe suffisamment d'exemples pour chaque slot/classe. Les prédictions sont purement basées sur les voisins proches (pas de réseau profond finement entraîné).

En cas de doute, consultez les fichiers source mentionnés dans ce document pour adapter la pipeline à vos besoins spécifiques.
