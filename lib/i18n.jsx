import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const SUPPORTED_LANGUAGES = {
  fr: {
    label: "Français",
    shortLabel: "FR",
    country: "France",
    flag: "https://flagcdn.com/fr.svg",
    locales: ["fr", "fr-FR", "fr-CA"],
  },
  en: {
    label: "English",
    shortLabel: "EN",
    country: "United Kingdom",
    flag: "https://flagcdn.com/gb.svg",
    locales: ["en", "en-US", "en-GB", "en-CA", "en-AU"],
  },
  es: {
    label: "Español",
    shortLabel: "ES",
    country: "España",
    flag: "https://flagcdn.com/es.svg",
    locales: ["es", "es-ES", "es-MX", "es-AR"],
  },
  pt: {
    label: "Português",
    shortLabel: "PT",
    country: "Portugal",
    flag: "https://flagcdn.com/pt.svg",
    locales: ["pt", "pt-PT", "pt-BR"],
  },
  de: {
    label: "Deutsch",
    shortLabel: "DE",
    country: "Deutschland",
    flag: "https://flagcdn.com/de.svg",
    locales: ["de", "de-DE", "de-AT", "de-CH"],
  },
};

export const DEFAULT_LANGUAGE = "fr";

const LANGUAGE_VARIANT_KEYS = {
  fr: ["fr", "fr_fr", "frFr", "fr-fr", "frFR", "frfr", "fr_ca", "frCa"],
  en: [
    "en",
    "en_us",
    "enUs",
    "en-gb",
    "enGb",
    "en-uk",
    "en-ca",
    "en-au",
    "en_nz",
  ],
  es: ["es", "es_es", "esEs", "es-mx", "esMx", "es_ar", "esAr", "es-latam"],
  de: ["de", "de_de", "deDe", "de-at", "deAt", "de-ch", "deCh"],
  pt: ["pt", "pt_pt", "ptPt", "pt-br", "ptBr", "ptBR"],
};

const TRANSLATIONS = {
  fr: {
    "brand.tagline": "",
    "hero.monitoringLink": "Suivre les entraînements IA",
    "meta.description":
      "KrosPalette extrait les couleurs dominantes de tes images pour composer des skins Dofus harmonieux.",
    "progress.analyzing": "Analyse de l'image en cours",
    "progress.completed": "Analyse terminée",
    "progress.ready": "Analyse prête",
    "toast.colorCopied": "Couleur copiée",
    "workspace.referenceTitle": "Référence créative",
    "workspace.mode.image": "Image",
    "workspace.mode.color": "Couleur",
    "workspace.dropzone.primary": "Glisse ton visuel ici",
    "workspace.dropzone.secondary": "… ou colle-le directement depuis ton presse-papiers",
    "workspace.dropzone.formats": "Formats acceptés : PNG, JPG, WebP, GIF statique",
    "workspace.dropzone.hint": "Clique pour ouvrir l'explorateur de fichiers",
    "workspace.dropzone.previewAlt": "Aperçu de la référence importée",
    "workspace.colorPicker.label": "Sélectionne ta teinte de départ",
    "workspace.colorPicker.random": "Nuance aléatoire",
    "workspace.colorPicker.sr": "Utiliser la couleur {hex}",
    "palette.title": "Palette extraite",
    "palette.badge.analyzing": "Analyse en cours…",
    "palette.format.label": "Format des codes couleur",
    "palette.format.hex": "Hexa",
    "palette.format.rgb": "RGB",
    "palette.skin.groupLabel": "Gestion de la teinte de peau",
    "palette.skin.label": "Teinte de peau",
    "palette.skin.choicesLabel": "Choix de la teinte de peau",
    "palette.skin.default": "Peau par défaut",
    "palette.skin.custom": "Peau personnalisée",
    "palette.empty":
      "Glisse un visuel ou sélectionne une couleur d'ambiance : KrosPalette s'occupe de générer automatiquement une palette harmonieuse.",
    "identity.groupLabel": "Configuration du personnage Dofus",
    "identity.gender.sectionTitle": "Choix de la classe et du sexe",
    "identity.gender.groupLabel": "Sexe du personnage",
    "identity.gender.male": "Homme",
    "identity.gender.female": "Femme",
    "identity.class.sectionTitle": "Sélection de la classe",
    "identity.class.loading": "Chargement des classes…",
    "identity.class.retry": "Réessayer",
    "identity.class.fallback": "Classe {id}",
    "identity.class.choose": "Choisir {name}",
    "identity.companion.sectionTitle": "Familiers & montures proposés",
    "identity.companion.groupLabel": "Filtrer les compagnons suggérés",
    "identity.companion.empty": "Active au moins une catégorie pour afficher des suggestions de compagnons.",
    "identity.filters.sectionTitle": "Filtres d'objets",
    "companions.filters.pet": "Familiers",
    "companions.filters.mount": "Montures",
    "companions.filters.dragodinde": "Dragodindes",
    "companions.filters.muldo": "Muldos",
    "companions.filters.volkorne": "Volkornes",
    "companions.toggle.hide": "Masquer {label}",
    "companions.toggle.show": "Afficher {label}",
    "itemTypes.coiffe": "Coiffe",
    "itemTypes.cape": "Cape",
    "itemTypes.familier": "Familiers & montures",
    "itemTypes.bouclier": "Bouclier",
    "itemTypes.epauliere": "Épaulières",
    "itemTypes.costume": "Costume",
    "itemTypes.ailes": "Ailes",
    "items.filters.colorable": "Colorisables",
    "items.filters.cosmetic": "Cosmétiques",
    "items.flags.cosmetic": "Objet cosmétique",
    "items.flags.colorable": "Synchronisé avec les couleurs du personnage",
    "errors.previewDownload": "Impossible de télécharger l'aperçu.",
    "errors.noColors": "Aucune couleur dominante détectée.",
    "errors.paletteExtraction": "Impossible d'extraire les couleurs de cette image.",
    "errors.corruptedImage": "L'image semble corrompue ou illisible.",
    "errors.fileType": "Merci de choisir un fichier image.",
    "errors.fileRead": "Lecture du fichier impossible.",
    "errors.clipboard": "Impossible de copier dans le presse-papiers.",
    "errors.breeds": "Impossible de récupérer les classes Dofus.",
    "errors.itemsUnavailable": "Impossible de récupérer les objets Dofus pour le moment.",
    "errors.itemsPartial": "Certaines catégories d'objets n'ont pas pu être chargées.",
    "errors.previewUnavailable": "Prévisualisation indisponible",
    "errors.previewUnavailableDetailed": "Prévisualisation Dofus indisponible",
    "errors.imageMissing": "Illustration manquante sur DofusDB.",
    "errors.paletteMissing": "Palette non détectée sur l'illustration.",
    "errors.paletteEstimated": "Palette estimée à partir des données DofusDB.",
    "suggestions.header.updating": "Mise à jour…",
    "suggestions.empty.start": "Lance une analyse pour découvrir des correspondances Dofus adaptées.",
    "suggestions.empty.identity":
      "Sélectionne une classe et une référence couleur pour afficher des suggestions.",
    "suggestions.empty.results":
      "Aucune combinaison exploitable n'a été trouvée pour cette palette.",
    "suggestions.loading.items": "Chargement des objets Dofus…",
    "suggestions.empty.catalog": "Aucun objet n'a pu être récupéré pour le moment.",
    "suggestions.carousel.skinCount": "Skin {current} / {total}",
    "suggestions.carousel.previous": "Skin précédent",
    "suggestions.carousel.next": "Skin suivant",
    "suggestions.carousel.dotLabel": "Afficher le skin {index}",
    "suggestions.carousel.proposalTitle": "Proposition {index}",
    "suggestions.render.alt": "Aperçu généré pour le skin {index}",
    "suggestions.render.itemAlt": "Illustration de {name}",
    "suggestions.render.downloading": "Téléchargement…",
    "suggestions.render.download": "Télécharger l'image",
    "suggestions.render.loading": "Rendu en cours…",
    "suggestions.render.unavailable": "Rendu indisponible",
    "suggestions.render.link": "Tester sur Barbofus",
    "suggestions.render.linkUnavailable": "Lien Barbofus indisponible",
    "suggestions.panel.title": "Correspondances détaillées",
    "suggestions.panel.hide": "Masquer les correspondances détaillées",
    "suggestions.panel.show": "Afficher les correspondances détaillées",
    "suggestions.panel.close": "Fermer les correspondances détaillées",
    "suggestions.panel.updating": "Mise à jour des suggestions…",
    "suggestions.panel.bestMatch": "Meilleur match",
    "suggestions.panel.empty": "Aucune correspondance probante pour cette teinte.",
    "suggestions.render.reroll": "Autre proposition",
    "suggestions.palette.unavailable": "Palette indisponible",
    "suggestions.thumb.placeholder": "Aperçu indisponible",
    "actions.retry": "Réessayer",
    "actions.downloadImage": "Télécharger l'image",
    "actions.close": "Fermer",
    "language.selectorLabel": "Langue",
    "language.selectorAria": "Choisir la langue de l'interface",
    "aria.analysisMode": "Mode d'analyse",
    "aria.colorSuggestions": "Suggestions de couleurs",
    "aria.colorCodeFormat": "Format des codes couleur",
    "aria.skinToneGroup": "Gestion de la teinte de peau",
    "aria.skinToneChoices": "Choix de la teinte de peau",
    "aria.identityCard": "Configuration du personnage Dofus",
    "aria.genderSection": "Sélection du sexe",
    "aria.genderGroup": "Sexe du personnage",
    "aria.classSection": "Sélection de la classe",
    "aria.classGroup": "Classe du personnage",
    "aria.companionSection": "Catégories de compagnons proposées",
    "aria.companionFilter": "Filtrer les compagnons suggérés",
    "aria.itemFlagSection": "Filtres d'attributs d'objet",
    "aria.itemFlagFilter": "Filtrer les suggestions selon les attributs",
    "aria.carouselPrevious": "Skin précédent",
    "aria.carouselNext": "Skin suivant",
    "aria.carouselDots": "Choisir une proposition",
    "aria.carouselDotSelect": "Afficher le skin {index}",
    "aria.panelToggleOpen": "Afficher les correspondances détaillées",
    "aria.panelToggleClose": "Masquer les correspondances détaillées",
    "aria.panelClose": "Fermer les correspondances détaillées",
    "aria.panelBackdrop": "Fermer les correspondances détaillées",
    "aria.itemReroll": "Proposer un autre {type}",
  },
  en: {
    "brand.tagline": "Dofus skin studio",
    "hero.monitoringLink": "Track AI training progress",
    "meta.description":
      "KrosPalette extracts the dominant colors from your images to craft harmonious Dofus outfits.",
    "progress.analyzing": "Analyzing image",
    "progress.completed": "Analysis completed",
    "progress.ready": "Analysis ready",
    "toast.colorCopied": "Color copied",
    "workspace.referenceTitle": "Creative reference",
    "workspace.mode.image": "Image",
    "workspace.mode.color": "Color",
    "workspace.dropzone.primary": "Drop your visual here",
    "workspace.dropzone.secondary": "… or paste it directly from your clipboard",
    "workspace.dropzone.formats": "Supported formats: PNG, JPG, WebP, static GIF",
    "workspace.dropzone.hint": "Click to open the file picker",
    "workspace.dropzone.previewAlt": "Preview of the imported reference",
    "workspace.colorPicker.label": "Pick your base tone",
    "workspace.colorPicker.random": "Random shade",
    "workspace.colorPicker.sr": "Use color {hex}",
    "palette.title": "Extracted palette",
    "palette.badge.analyzing": "Analyzing…",
    "palette.format.label": "Color code format",
    "palette.format.hex": "Hex",
    "palette.format.rgb": "RGB",
    "palette.skin.groupLabel": "Skin tone handling",
    "palette.skin.label": "Skin tone",
    "palette.skin.choicesLabel": "Skin tone selection",
    "palette.skin.default": "Default skin",
    "palette.skin.custom": "Custom skin",
    "palette.empty":
      "Drop an image or choose a vibe color — KrosPalette automatically builds a harmonious palette.",
    "identity.groupLabel": "Dofus character setup",
    "identity.gender.sectionTitle": "Class and gender selection",
    "identity.gender.groupLabel": "Character gender",
    "identity.gender.male": "Male",
    "identity.gender.female": "Female",
    "identity.class.sectionTitle": "Class selection",
    "identity.class.loading": "Loading classes…",
    "identity.class.retry": "Retry",
    "identity.class.fallback": "Class {id}",
    "identity.class.choose": "Choose {name}",
    "identity.companion.sectionTitle": "Suggested pets & mounts",
    "identity.companion.groupLabel": "Filter the suggested companions",
    "identity.companion.empty": "Enable at least one category to display companion suggestions.",
    "identity.filters.sectionTitle": "Item filters",
    "companions.filters.pet": "Pets",
    "companions.filters.mount": "Mounts",
    "companions.filters.dragodinde": "Dragoturkeys",
    "companions.filters.muldo": "Muldo",
    "companions.filters.volkorne": "Volkorne",
    "companions.toggle.hide": "Hide {label}",
    "companions.toggle.show": "Show {label}",
    "itemTypes.coiffe": "Headgear",
    "itemTypes.cape": "Cape",
    "itemTypes.familier": "Pets & mounts",
    "itemTypes.bouclier": "Shield",
    "itemTypes.epauliere": "Shoulder pads",
    "itemTypes.costume": "Costume",
    "itemTypes.ailes": "Wings",
    "items.filters.colorable": "Color-synced",
    "items.filters.cosmetic": "Cosmetics",
    "items.flags.cosmetic": "Cosmetic item",
    "items.flags.colorable": "Matches character colors",
    "errors.previewDownload": "Unable to download the preview.",
    "errors.noColors": "No dominant color detected.",
    "errors.paletteExtraction": "Unable to extract colors from this image.",
    "errors.corruptedImage": "The image appears to be corrupted or unreadable.",
    "errors.fileType": "Please choose an image file.",
    "errors.fileRead": "Unable to read the file.",
    "errors.clipboard": "Unable to copy to the clipboard.",
    "errors.breeds": "Unable to fetch Dofus classes.",
    "errors.itemsUnavailable": "Unable to fetch Dofus items right now.",
    "errors.itemsPartial": "Some item categories could not be loaded.",
    "errors.previewUnavailable": "Preview unavailable",
    "errors.previewUnavailableDetailed": "Dofus preview unavailable",
    "errors.imageMissing": "Illustration missing on DofusDB.",
    "errors.paletteMissing": "Palette not detected on the illustration.",
    "errors.paletteEstimated": "Palette estimated from DofusDB data.",
    "suggestions.header.updating": "Updating…",
    "suggestions.empty.start": "Start an analysis to discover matching Dofus equipment.",
    "suggestions.empty.identity": "Pick a class and a reference color to see tailored suggestions.",
    "suggestions.empty.results": "No usable combinations were found for this palette.",
    "suggestions.loading.items": "Loading Dofus items…",
    "suggestions.empty.catalog": "No items could be retrieved yet.",
    "suggestions.carousel.skinCount": "Skin {current} / {total}",
    "suggestions.carousel.previous": "Previous skin",
    "suggestions.carousel.next": "Next skin",
    "suggestions.carousel.dotLabel": "Show skin {index}",
    "suggestions.carousel.proposalTitle": "Proposal {index}",
    "suggestions.render.alt": "Generated preview for skin {index}",
    "suggestions.render.itemAlt": "Artwork of {name}",
    "suggestions.render.downloading": "Downloading…",
    "suggestions.render.download": "Download image",
    "suggestions.render.loading": "Rendering…",
    "suggestions.render.unavailable": "Render unavailable",
    "suggestions.render.link": "Try on Barbofus",
    "suggestions.render.linkUnavailable": "Barbofus link unavailable",
    "suggestions.panel.title": "Detailed matches",
    "suggestions.panel.hide": "Hide detailed matches",
    "suggestions.panel.show": "Show detailed matches",
    "suggestions.panel.close": "Close detailed matches",
    "suggestions.panel.updating": "Refreshing suggestions…",
    "suggestions.panel.bestMatch": "Best match",
    "suggestions.panel.empty": "No convincing match for this palette.",
    "suggestions.render.reroll": "Show another item",
    "suggestions.palette.unavailable": "Palette unavailable",
    "suggestions.thumb.placeholder": "Preview unavailable",
    "actions.retry": "Retry",
    "actions.downloadImage": "Download image",
    "actions.close": "Close",
    "language.selectorLabel": "Language",
    "language.selectorAria": "Select interface language",
    "aria.analysisMode": "Analysis mode",
    "aria.colorSuggestions": "Color suggestions",
    "aria.colorCodeFormat": "Color code format",
    "aria.skinToneGroup": "Skin tone handling",
    "aria.skinToneChoices": "Skin tone choices",
    "aria.identityCard": "Dofus character setup",
    "aria.genderSection": "Gender selection",
    "aria.genderGroup": "Character gender",
    "aria.classSection": "Class selection",
    "aria.classGroup": "Character class",
    "aria.companionSection": "Suggested companion categories",
    "aria.companionFilter": "Filter suggested companions",
    "aria.itemFlagSection": "Item attribute filters",
    "aria.itemFlagFilter": "Filter suggested items by attributes",
    "aria.carouselPrevious": "Previous skin",
    "aria.carouselNext": "Next skin",
    "aria.carouselDots": "Choose a proposal",
    "aria.carouselDotSelect": "Show skin {index}",
    "aria.panelToggleOpen": "Show detailed matches",
    "aria.panelToggleClose": "Hide detailed matches",
    "aria.panelClose": "Close detailed matches",
    "aria.panelBackdrop": "Close detailed matches",
    "aria.itemReroll": "Show another {type}",
  },
  es: {
    "brand.tagline": "Estudio de skins de Dofus",
    "hero.monitoringLink": "Seguir el progreso del entrenamiento de la IA",
    "meta.description":
      "KrosPalette extrae los colores dominantes de tus imágenes para crear conjuntos de Dofus armoniosos.",
    "progress.analyzing": "Analizando imagen",
    "progress.completed": "Análisis completado",
    "progress.ready": "Análisis listo",
    "toast.colorCopied": "Color copiado",
    "workspace.referenceTitle": "Referencia creativa",
    "workspace.mode.image": "Imagen",
    "workspace.mode.color": "Color",
    "workspace.dropzone.primary": "Suelta tu visual aquí",
    "workspace.dropzone.secondary": "… o pégalo directamente desde el portapapeles",
    "workspace.dropzone.formats": "Formatos compatibles: PNG, JPG, WebP, GIF estático",
    "workspace.dropzone.hint": "Haz clic para abrir el selector de archivos",
    "workspace.dropzone.previewAlt": "Vista previa de la referencia importada",
    "workspace.colorPicker.label": "Elige tu tono base",
    "workspace.colorPicker.random": "Tono aleatorio",
    "workspace.colorPicker.sr": "Usar el color {hex}",
    "palette.title": "Paleta extraída",
    "palette.badge.analyzing": "Analizando…",
    "palette.format.label": "Formato de los códigos de color",
    "palette.format.hex": "Hex",
    "palette.format.rgb": "RGB",
    "palette.skin.groupLabel": "Gestión del tono de piel",
    "palette.skin.label": "Tono de piel",
    "palette.skin.choicesLabel": "Selección del tono de piel",
    "palette.skin.default": "Piel predeterminada",
    "palette.skin.custom": "Piel personalizada",
    "palette.empty":
      "Suelta una imagen o elige un color ambiental: KrosPalette genera automáticamente una paleta armoniosa.",
    "identity.groupLabel": "Configuración del personaje de Dofus",
    "identity.gender.sectionTitle": "Selección de clase y género",
    "identity.gender.groupLabel": "Género del personaje",
    "identity.gender.male": "Masculino",
    "identity.gender.female": "Femenino",
    "identity.class.sectionTitle": "Selección de clase",
    "identity.class.loading": "Cargando clases…",
    "identity.class.retry": "Reintentar",
    "identity.class.fallback": "Clase {id}",
    "identity.class.choose": "Elegir {name}",
    "identity.companion.sectionTitle": "Mascotas y monturas sugeridas",
    "identity.companion.groupLabel": "Filtrar los compañeros sugeridos",
    "identity.companion.empty": "Activa al menos una categoría para mostrar sugerencias de compañeros.",
    "identity.filters.sectionTitle": "Filtros de objetos",
    "companions.filters.pet": "Mascotas",
    "companions.filters.mount": "Monturas",
    "companions.filters.dragodinde": "Dragopavos",
    "companions.filters.muldo": "Muldo",
    "companions.filters.volkorne": "Volkorne",
    "companions.toggle.hide": "Ocultar {label}",
    "companions.toggle.show": "Mostrar {label}",
    "itemTypes.coiffe": "Sombrero",
    "itemTypes.cape": "Capa",
    "itemTypes.familier": "Mascotas y monturas",
    "itemTypes.bouclier": "Escudo",
    "itemTypes.epauliere": "Hombreras",
    "itemTypes.costume": "Disfraz",
    "itemTypes.ailes": "Alas",
    "items.filters.colorable": "Coloreables",
    "items.filters.cosmetic": "Cosméticos",
    "items.flags.cosmetic": "Objeto cosmético",
    "items.flags.colorable": "Se adapta a los colores del personaje",
    "errors.previewDownload": "No se pudo descargar la vista previa.",
    "errors.noColors": "No se detectó ningún color dominante.",
    "errors.paletteExtraction": "No se pudieron extraer los colores de esta imagen.",
    "errors.corruptedImage": "La imagen parece dañada o ilegible.",
    "errors.fileType": "Elige un archivo de imagen.",
    "errors.fileRead": "No se pudo leer el archivo.",
    "errors.clipboard": "No se pudo copiar al portapapeles.",
    "errors.breeds": "No se pudieron obtener las clases de Dofus.",
    "errors.itemsUnavailable": "No se pudieron obtener los objetos de Dofus por ahora.",
    "errors.itemsPartial": "Algunas categorías de objetos no se pudieron cargar.",
    "errors.previewUnavailable": "Vista previa no disponible",
    "errors.previewUnavailableDetailed": "Vista previa de Dofus no disponible",
    "errors.imageMissing": "Ilustración ausente en DofusDB.",
    "errors.paletteMissing": "Paleta no detectada en la ilustración.",
    "errors.paletteEstimated": "Paleta estimada a partir de los datos de DofusDB.",
    "suggestions.header.updating": "Actualizando…",
    "suggestions.empty.start": "Inicia un análisis para descubrir combinaciones de Dofus adecuadas.",
    "suggestions.empty.identity": "Selecciona una clase y un color de referencia para ver sugerencias adaptadas.",
    "suggestions.empty.results": "No se encontraron combinaciones utilizables para esta paleta.",
    "suggestions.loading.items": "Cargando objetos de Dofus…",
    "suggestions.empty.catalog": "Todavía no se han podido recuperar objetos.",
    "suggestions.carousel.skinCount": "Skin {current} / {total}",
    "suggestions.carousel.previous": "Skin anterior",
    "suggestions.carousel.next": "Skin siguiente",
    "suggestions.carousel.dotLabel": "Mostrar skin {index}",
    "suggestions.carousel.proposalTitle": "Propuesta {index}",
    "suggestions.render.alt": "Vista generada para el skin {index}",
    "suggestions.render.itemAlt": "Ilustración de {name}",
    "suggestions.render.downloading": "Descargando…",
    "suggestions.render.download": "Descargar imagen",
    "suggestions.render.loading": "Renderizando…",
    "suggestions.render.unavailable": "Render no disponible",
    "suggestions.render.link": "Probar en Barbofus",
    "suggestions.render.linkUnavailable": "Enlace de Barbofus no disponible",
    "suggestions.panel.title": "Coincidencias detalladas",
    "suggestions.panel.hide": "Ocultar coincidencias detalladas",
    "suggestions.panel.show": "Mostrar coincidencias detalladas",
    "suggestions.panel.close": "Cerrar coincidencias detalladas",
    "suggestions.panel.updating": "Actualizando sugerencias…",
    "suggestions.panel.bestMatch": "Mejor coincidencia",
    "suggestions.panel.empty": "No hay coincidencias convincentes para este tono.",
    "suggestions.render.reroll": "Mostrar otro objeto",
    "suggestions.palette.unavailable": "Paleta no disponible",
    "suggestions.thumb.placeholder": "Vista previa no disponible",
    "actions.retry": "Reintentar",
    "actions.downloadImage": "Descargar imagen",
    "actions.close": "Cerrar",
    "language.selectorLabel": "Idioma",
    "language.selectorAria": "Elegir el idioma de la interfaz",
    "aria.analysisMode": "Modo de análisis",
    "aria.colorSuggestions": "Sugerencias de color",
    "aria.colorCodeFormat": "Formato de los códigos de color",
    "aria.skinToneGroup": "Gestión del tono de piel",
    "aria.skinToneChoices": "Opciones de tono de piel",
    "aria.identityCard": "Configuración del personaje de Dofus",
    "aria.genderSection": "Selección de género",
    "aria.genderGroup": "Género del personaje",
    "aria.classSection": "Selección de clase",
    "aria.classGroup": "Clase del personaje",
    "aria.companionSection": "Categorías de compañeros sugeridas",
    "aria.companionFilter": "Filtrar los compañeros sugeridos",
    "aria.itemFlagSection": "Filtros de atributos de objetos",
    "aria.itemFlagFilter": "Filtrar los objetos sugeridos por atributos",
    "aria.carouselPrevious": "Skin anterior",
    "aria.carouselNext": "Skin siguiente",
    "aria.carouselDots": "Elegir una propuesta",
    "aria.carouselDotSelect": "Mostrar skin {index}",
    "aria.panelToggleOpen": "Mostrar coincidencias detalladas",
    "aria.panelToggleClose": "Ocultar coincidencias detalladas",
    "aria.panelClose": "Cerrar coincidencias detalladas",
    "aria.panelBackdrop": "Cerrar coincidencias detalladas",
    "aria.itemReroll": "Mostrar otro {type}",
  },
  de: {
    "brand.tagline": "Dofus-Skin-Studio",
    "hero.monitoringLink": "KI-Trainingsfortschritt verfolgen",
    "meta.description":
      "KrosPalette extrahiert die dominanten Farben deiner Bilder und erstellt harmonische Dofus-Outfits.",
    "progress.analyzing": "Bildanalyse läuft",
    "progress.completed": "Analyse abgeschlossen",
    "progress.ready": "Analyse bereit",
    "toast.colorCopied": "Farbe kopiert",
    "workspace.referenceTitle": "Kreative Referenz",
    "workspace.mode.image": "Bild",
    "workspace.mode.color": "Farbe",
    "workspace.dropzone.primary": "Zieh dein Motiv hierher",
    "workspace.dropzone.secondary": "… oder füge es direkt aus der Zwischenablage ein",
    "workspace.dropzone.formats": "Unterstützte Formate: PNG, JPG, WebP, statisches GIF",
    "workspace.dropzone.hint": "Zum Öffnen des Dateidialogs klicken",
    "workspace.dropzone.previewAlt": "Vorschau der importierten Referenz",
    "workspace.colorPicker.label": "Wähle deinen Grundton",
    "workspace.colorPicker.random": "Zufälliger Farbton",
    "workspace.colorPicker.sr": "Farbe {hex} verwenden",
    "palette.title": "Extrahierte Palette",
    "palette.badge.analyzing": "Analyse läuft…",
    "palette.format.label": "Format der Farbcodes",
    "palette.format.hex": "Hex",
    "palette.format.rgb": "RGB",
    "palette.skin.groupLabel": "Hautton-Verwaltung",
    "palette.skin.label": "Hautton",
    "palette.skin.choicesLabel": "Hautton-Auswahl",
    "palette.skin.default": "Standard-Hautton",
    "palette.skin.custom": "Eigener Hautton",
    "palette.empty":
      "Zieh ein Bild hierher oder wähle eine Stimmungfarbe – KrosPalette erstellt automatisch eine harmonische Palette.",
    "identity.groupLabel": "Dofus-Charakterkonfiguration",
    "identity.gender.sectionTitle": "Klassen- und Geschlechtswahl",
    "identity.gender.groupLabel": "Geschlecht des Charakters",
    "identity.gender.male": "Männlich",
    "identity.gender.female": "Weiblich",
    "identity.class.sectionTitle": "Klassenwahl",
    "identity.class.loading": "Klassen werden geladen…",
    "identity.class.retry": "Erneut versuchen",
    "identity.class.fallback": "Klasse {id}",
    "identity.class.choose": "{name} wählen",
    "identity.companion.sectionTitle": "Vorgeschlagene Begleiter & Reittiere",
    "identity.companion.groupLabel": "Vorgeschlagene Begleiter filtern",
    "identity.companion.empty": "Aktiviere mindestens eine Kategorie, um Begleitervorschläge zu sehen.",
    "identity.filters.sectionTitle": "Objektfilter",
    "companions.filters.pet": "Begleiter",
    "companions.filters.mount": "Reittiere",
    "companions.filters.dragodinde": "Dragoturms",
    "companions.filters.muldo": "Muldo",
    "companions.filters.volkorne": "Volkorne",
    "companions.toggle.hide": "{label} ausblenden",
    "companions.toggle.show": "{label} anzeigen",
    "itemTypes.coiffe": "Helm",
    "itemTypes.cape": "Umhang",
    "itemTypes.familier": "Begleiter & Reittiere",
    "itemTypes.bouclier": "Schild",
    "itemTypes.epauliere": "Schulterstücke",
    "itemTypes.costume": "Kostüm",
    "itemTypes.ailes": "Flügel",
    "items.filters.colorable": "Farbanpassbar",
    "items.filters.cosmetic": "Kosmetisch",
    "items.flags.cosmetic": "Kosmetischer Gegenstand",
    "items.flags.colorable": "Passt sich den Charakterfarben an",
    "errors.previewDownload": "Vorschau konnte nicht heruntergeladen werden.",
    "errors.noColors": "Keine dominanten Farben erkannt.",
    "errors.paletteExtraction": "Farben konnten nicht aus diesem Bild extrahiert werden.",
    "errors.corruptedImage": "Das Bild scheint beschädigt oder unlesbar zu sein.",
    "errors.fileType": "Bitte wähle eine Bilddatei aus.",
    "errors.fileRead": "Datei konnte nicht gelesen werden.",
    "errors.clipboard": "In die Zwischenablage konnte nicht kopiert werden.",
    "errors.breeds": "Dofus-Klassen konnten nicht geladen werden.",
    "errors.itemsUnavailable": "Dofus-Gegenstände können derzeit nicht geladen werden.",
    "errors.itemsPartial": "Einige Gegenstandskategorien konnten nicht geladen werden.",
    "errors.previewUnavailable": "Vorschau nicht verfügbar",
    "errors.previewUnavailableDetailed": "Dofus-Vorschau nicht verfügbar",
    "errors.imageMissing": "Illustration auf DofusDB fehlt.",
    "errors.paletteMissing": "Palette auf der Illustration nicht erkannt.",
    "errors.paletteEstimated": "Palette aus DofusDB-Daten geschätzt.",
    "suggestions.header.updating": "Aktualisierung…",
    "suggestions.empty.start": "Starte eine Analyse, um passende Dofus-Gegenstände zu entdecken.",
    "suggestions.empty.identity":
      "Wähle eine Klasse und eine Referenzfarbe, um passende Vorschläge zu erhalten.",
    "suggestions.empty.results": "Für diese Palette wurden keine passenden Kombinationen gefunden.",
    "suggestions.loading.items": "Dofus-Gegenstände werden geladen…",
    "suggestions.empty.catalog": "Es konnten noch keine Gegenstände abgerufen werden.",
    "suggestions.carousel.skinCount": "Skin {current} / {total}",
    "suggestions.carousel.previous": "Vorheriger Skin",
    "suggestions.carousel.next": "Nächster Skin",
    "suggestions.carousel.dotLabel": "Skin {index} anzeigen",
    "suggestions.carousel.proposalTitle": "Vorschlag {index}",
    "suggestions.render.alt": "Generierte Vorschau für Skin {index}",
    "suggestions.render.itemAlt": "Illustration von {name}",
    "suggestions.render.downloading": "Wird heruntergeladen…",
    "suggestions.render.download": "Bild herunterladen",
    "suggestions.render.loading": "Render wird erstellt…",
    "suggestions.render.unavailable": "Render nicht verfügbar",
    "suggestions.render.link": "Auf Barbofus testen",
    "suggestions.render.linkUnavailable": "Barbofus-Link nicht verfügbar",
    "suggestions.panel.title": "Detailierte Treffer",
    "suggestions.panel.hide": "Detailierte Treffer ausblenden",
    "suggestions.panel.show": "Detailierte Treffer anzeigen",
    "suggestions.panel.close": "Detailierte Treffer schließen",
    "suggestions.panel.updating": "Vorschläge werden aktualisiert…",
    "suggestions.panel.bestMatch": "Beste Übereinstimmung",
    "suggestions.panel.empty": "Keine überzeugende Übereinstimmung für diesen Ton.",
    "suggestions.render.reroll": "Anderer Gegenstand",
    "suggestions.palette.unavailable": "Palette nicht verfügbar",
    "suggestions.thumb.placeholder": "Vorschau nicht verfügbar",
    "actions.retry": "Erneut versuchen",
    "actions.downloadImage": "Bild herunterladen",
    "actions.close": "Schließen",
    "language.selectorLabel": "Sprache",
    "language.selectorAria": "Interface-Sprache auswählen",
    "aria.analysisMode": "Analysemodus",
    "aria.colorSuggestions": "Farbvorschläge",
    "aria.colorCodeFormat": "Format der Farbcodes",
    "aria.skinToneGroup": "Hautton-Verwaltung",
    "aria.skinToneChoices": "Hautton-Auswahl",
    "aria.identityCard": "Dofus-Charakterkonfiguration",
    "aria.genderSection": "Geschlechtswahl",
    "aria.genderGroup": "Geschlecht des Charakters",
    "aria.classSection": "Klassenwahl",
    "aria.classGroup": "Klasse des Charakters",
    "aria.companionSection": "Vorgeschlagene Begleiterkategorien",
    "aria.companionFilter": "Vorgeschlagene Begleiter filtern",
    "aria.itemFlagSection": "Filter für Objektattribute",
    "aria.itemFlagFilter": "Vorgeschlagene Objekte nach Attributen filtern",
    "aria.carouselPrevious": "Vorheriger Skin",
    "aria.carouselNext": "Nächster Skin",
    "aria.carouselDots": "Einen Vorschlag wählen",
    "aria.carouselDotSelect": "Skin {index} anzeigen",
    "aria.panelToggleOpen": "Detailierte Treffer anzeigen",
    "aria.panelToggleClose": "Detailierte Treffer ausblenden",
    "aria.panelClose": "Detailierte Treffer schließen",
    "aria.panelBackdrop": "Detailierte Treffer schließen",
    "aria.itemReroll": "Anderen {type} anzeigen",
  },
  pt: {
    "brand.tagline": "Estúdio de skins de Dofus",
    "hero.monitoringLink": "Acompanhar o progresso do treinamento de IA",
    "meta.description":
      "KrosPalette extrai as cores dominantes das suas imagens para criar visuais harmoniosos de Dofus.",
    "progress.analyzing": "Analisando imagem",
    "progress.completed": "Análise concluída",
    "progress.ready": "Análise pronta",
    "toast.colorCopied": "Cor copiada",
    "workspace.referenceTitle": "Referência criativa",
    "workspace.mode.image": "Imagem",
    "workspace.mode.color": "Cor",
    "workspace.dropzone.primary": "Solte o visual aqui",
    "workspace.dropzone.secondary": "… ou cole diretamente da área de transferência",
    "workspace.dropzone.formats": "Formatos compatíveis: PNG, JPG, WebP, GIF estático",
    "workspace.dropzone.hint": "Clique para abrir o seletor de arquivos",
    "workspace.dropzone.previewAlt": "Prévia da referência importada",
    "workspace.colorPicker.label": "Escolha o tom base",
    "workspace.colorPicker.random": "Tom aleatório",
    "workspace.colorPicker.sr": "Usar a cor {hex}",
    "palette.title": "Paleta extraída",
    "palette.badge.analyzing": "Analisando…",
    "palette.format.label": "Formato dos códigos de cor",
    "palette.format.hex": "Hex",
    "palette.format.rgb": "RGB",
    "palette.skin.groupLabel": "Gerenciamento de tom de pele",
    "palette.skin.label": "Tom de pele",
    "palette.skin.choicesLabel": "Escolha do tom de pele",
    "palette.skin.default": "Pele padrão",
    "palette.skin.custom": "Pele personalizada",
    "palette.empty":
      "Solte uma imagem ou escolha uma cor de ambiente — a KrosPalette gera automaticamente uma paleta harmoniosa.",
    "identity.groupLabel": "Configuração do personagem de Dofus",
    "identity.gender.sectionTitle": "Escolha da classe e do gênero",
    "identity.gender.groupLabel": "Gênero do personagem",
    "identity.gender.male": "Masculino",
    "identity.gender.female": "Feminino",
    "identity.class.sectionTitle": "Escolha da classe",
    "identity.class.loading": "Carregando classes…",
    "identity.class.retry": "Tentar novamente",
    "identity.class.fallback": "Classe {id}",
    "identity.class.choose": "Escolher {name}",
    "identity.companion.sectionTitle": "Mascotes e montarias sugeridos",
    "identity.companion.groupLabel": "Filtrar os companheiros sugeridos",
    "identity.companion.empty": "Ative pelo menos uma categoria para exibir sugestões de companheiros.",
    "identity.filters.sectionTitle": "Filtros de itens",
    "companions.filters.pet": "Mascotes",
    "companions.filters.mount": "Montarias",
    "companions.filters.dragodinde": "Dragoperus",
    "companions.filters.muldo": "Muldo",
    "companions.filters.volkorne": "Volkorne",
    "companions.toggle.hide": "Ocultar {label}",
    "companions.toggle.show": "Mostrar {label}",
    "itemTypes.coiffe": "Chapéu",
    "itemTypes.cape": "Capa",
    "itemTypes.familier": "Mascotes e montarias",
    "itemTypes.bouclier": "Escudo",
    "itemTypes.epauliere": "Ombreiras",
    "itemTypes.costume": "Fantasia",
    "itemTypes.ailes": "Asas",
    "items.filters.colorable": "Colorizáveis",
    "items.filters.cosmetic": "Cosméticos",
    "items.flags.cosmetic": "Item cosmético",
    "items.flags.colorable": "Acompanha as cores do personagem",
    "errors.previewDownload": "Não foi possível baixar a prévia.",
    "errors.noColors": "Nenhuma cor dominante detectada.",
    "errors.paletteExtraction": "Não foi possível extrair as cores desta imagem.",
    "errors.corruptedImage": "A imagem parece corrompida ou ilegível.",
    "errors.fileType": "Escolha um arquivo de imagem.",
    "errors.fileRead": "Não foi possível ler o arquivo.",
    "errors.clipboard": "Não foi possível copiar para a área de transferência.",
    "errors.breeds": "Não foi possível obter as classes de Dofus.",
    "errors.itemsUnavailable": "Não foi possível obter os itens de Dofus no momento.",
    "errors.itemsPartial": "Algumas categorias de itens não puderam ser carregadas.",
    "errors.previewUnavailable": "Prévia indisponível",
    "errors.previewUnavailableDetailed": "Prévia de Dofus indisponível",
    "errors.imageMissing": "Ilustração ausente no DofusDB.",
    "errors.paletteMissing": "Paleta não detectada na ilustração.",
    "errors.paletteEstimated": "Paleta estimada a partir dos dados do DofusDB.",
    "suggestions.header.updating": "Atualizando…",
    "suggestions.empty.start": "Inicie uma análise para descobrir combinações adequadas de Dofus.",
    "suggestions.empty.identity":
      "Escolha uma classe e uma cor de referência para ver sugestões personalizadas.",
    "suggestions.empty.results": "Nenhuma combinação utilizável foi encontrada para esta paleta.",
    "suggestions.loading.items": "Carregando itens de Dofus…",
    "suggestions.empty.catalog": "Nenhum item pôde ser recuperado por enquanto.",
    "suggestions.carousel.skinCount": "Skin {current} / {total}",
    "suggestions.carousel.previous": "Skin anterior",
    "suggestions.carousel.next": "Próximo skin",
    "suggestions.carousel.dotLabel": "Mostrar skin {index}",
    "suggestions.carousel.proposalTitle": "Proposta {index}",
    "suggestions.render.alt": "Prévia gerada para o skin {index}",
    "suggestions.render.itemAlt": "Ilustração de {name}",
    "suggestions.render.downloading": "Baixando…",
    "suggestions.render.download": "Baixar imagem",
    "suggestions.render.loading": "Renderizando…",
    "suggestions.render.unavailable": "Render indisponível",
    "suggestions.render.link": "Testar no Barbofus",
    "suggestions.render.linkUnavailable": "Link do Barbofus indisponível",
    "suggestions.panel.title": "Correspondências detalhadas",
    "suggestions.panel.hide": "Ocultar correspondências detalhadas",
    "suggestions.panel.show": "Mostrar correspondências detalhadas",
    "suggestions.panel.close": "Fechar correspondências detalhadas",
    "suggestions.panel.updating": "Atualizando sugestões…",
    "suggestions.panel.bestMatch": "Melhor combinação",
    "suggestions.panel.empty": "Nenhuma combinação convincente para este tom.",
    "suggestions.render.reroll": "Mostrar outro item",
    "suggestions.palette.unavailable": "Paleta indisponível",
    "suggestions.thumb.placeholder": "Prévia indisponível",
    "actions.retry": "Tentar novamente",
    "actions.downloadImage": "Baixar imagem",
    "actions.close": "Fechar",
    "language.selectorLabel": "Idioma",
    "language.selectorAria": "Escolher o idioma da interface",
    "aria.analysisMode": "Modo de análise",
    "aria.colorSuggestions": "Sugestões de cores",
    "aria.colorCodeFormat": "Formato dos códigos de cor",
    "aria.skinToneGroup": "Gerenciamento de tom de pele",
    "aria.skinToneChoices": "Opções de tom de pele",
    "aria.identityCard": "Configuração do personagem de Dofus",
    "aria.genderSection": "Escolha de gênero",
    "aria.genderGroup": "Gênero do personagem",
    "aria.classSection": "Escolha da classe",
    "aria.classGroup": "Classe do personagem",
    "aria.companionSection": "Categorias de companheiros sugeridas",
    "aria.companionFilter": "Filtrar os companheiros sugeridos",
    "aria.itemFlagSection": "Filtros de atributos dos itens",
    "aria.itemFlagFilter": "Filtrar itens sugeridos por atributos",
    "aria.carouselPrevious": "Skin anterior",
    "aria.carouselNext": "Próximo skin",
    "aria.carouselDots": "Escolher uma proposta",
    "aria.carouselDotSelect": "Mostrar skin {index}",
    "aria.panelToggleOpen": "Mostrar correspondências detalhadas",
    "aria.panelToggleClose": "Ocultar correspondências detalhadas",
    "aria.panelClose": "Fechar correspondências detalhadas",
    "aria.panelBackdrop": "Fechar correspondências detalhadas",
    "aria.itemReroll": "Mostrar outro {type}",
  },
};

function formatMessage(message, params) {
  if (!message || !params) {
    return message;
  }
  return message.replace(/\{(\w+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      const value = params[key];
      return value == null ? "" : String(value);
    }
    return match;
  });
}

export function normalizeLanguage(input) {
  if (!input) {
    return null;
  }
  const candidate = String(input).toLowerCase();
  if (SUPPORTED_LANGUAGES[candidate]) {
    return candidate;
  }
  for (const [code, info] of Object.entries(SUPPORTED_LANGUAGES)) {
    if (info.locales.some((locale) => locale.toLowerCase() === candidate)) {
      return code;
    }
  }
  const simplified = candidate.replace(/[_]/g, "-");
  for (const [code, info] of Object.entries(SUPPORTED_LANGUAGES)) {
    if (info.locales.some((locale) => locale.toLowerCase() === simplified)) {
      return code;
    }
  }
  return null;
}

export function detectBrowserLanguage() {
  if (typeof navigator === "undefined") {
    return DEFAULT_LANGUAGE;
  }

  const candidates = [];
  if (Array.isArray(navigator.languages)) {
    candidates.push(...navigator.languages);
  }
  if (navigator.language) {
    candidates.push(navigator.language);
  }
  if (navigator.userLanguage) {
    candidates.push(navigator.userLanguage);
  }

  for (const entry of candidates) {
    const normalized = normalizeLanguage(entry);
    if (normalized) {
      return normalized;
    }
  }

  return DEFAULT_LANGUAGE;
}

export function getLanguagePriority(language = DEFAULT_LANGUAGE) {
  const normalized = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const base = LANGUAGE_VARIANT_KEYS[normalized] ?? [];
  const defaults = LANGUAGE_VARIANT_KEYS[DEFAULT_LANGUAGE] ?? [];
  const english = LANGUAGE_VARIANT_KEYS.en ?? [];
  const unique = new Set([...base, normalized, ...defaults, DEFAULT_LANGUAGE, ...english, "en", "es", "de", "pt", "fr"]);
  return Array.from(unique);
}

function translateInternal(language, key, params, fallback) {
  const normalized = normalizeLanguage(language) ?? DEFAULT_LANGUAGE;
  const primary = TRANSLATIONS[normalized]?.[key];
  const backup = TRANSLATIONS[DEFAULT_LANGUAGE]?.[key];
  const template = primary ?? backup ?? fallback ?? key;
  return formatMessage(template, params);
}

const STORAGE_KEY = "krospalette:language";

const LanguageContext = createContext({
  language: DEFAULT_LANGUAGE,
  languages: Object.entries(SUPPORTED_LANGUAGES).map(([code, info]) => ({
    code,
    label: info.label,
    flag: info.flag,
    shortLabel: info.shortLabel ?? code.toUpperCase(),
    accessibleLabel: info.country ? `${info.label} · ${info.country}` : info.label,
  })),
  setLanguage: () => {},
  t: (key, params, fallback) => translateInternal(DEFAULT_LANGUAGE, key, params, fallback),
});

export function LanguageProvider({ children, initialLanguage }) {
  const [language, setLanguage] = useState(() => normalizeLanguage(initialLanguage) ?? DEFAULT_LANGUAGE);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const detected = detectBrowserLanguage();
      const resolved = normalizeLanguage(stored) ?? detected ?? DEFAULT_LANGUAGE;
      if (resolved && resolved !== language) {
        setLanguage(resolved);
      }
    } catch (error) {
      console.error(error);
      const detected = detectBrowserLanguage();
      if (detected && detected !== language) {
        setLanguage(detected);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, language);
    } catch (error) {
      console.error(error);
    }
  }, [language]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    try {
      document.documentElement.setAttribute("lang", language);
    } catch (error) {
      console.error(error);
    }
  }, [language]);

  const value = useMemo(() => {
    const languages = Object.entries(SUPPORTED_LANGUAGES).map(([code, info]) => ({
      code,
      label: info.label,
      flag: info.flag,
      shortLabel: info.shortLabel ?? code.toUpperCase(),
      accessibleLabel: info.country ? `${info.label} · ${info.country}` : info.label,
    }));

    const setLanguageSafe = (next) => {
      const normalized = normalizeLanguage(next) ?? DEFAULT_LANGUAGE;
      setLanguage(normalized);
    };

    const t = (key, params, fallback) => translateInternal(language, key, params, fallback);

    return {
      language,
      languages,
      setLanguage: setLanguageSafe,
      t,
    };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  return useContext(LanguageContext);
}

export function translate(language, key, params, fallback) {
  return translateInternal(language, key, params, fallback);
}

