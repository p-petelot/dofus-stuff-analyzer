<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { GallerySkin } from "../types/gallery";
import { useLanguage } from "../lib/i18n";
import {
  generateGallerySkins,
  getCreativeToneFilters,
  normalizeCreativeColor,
  pickCreativeSeed,
} from "../../lib/gallery/generator";

const props = withDefaults(
  defineProps<{
    swatches?: string[];
    defaultColor?: string;
    title?: string;
    subtitle?: string;
    count?: number;
  }>(),
  {
    swatches: () => ["#8B5CF6", "#F97316", "#10B981", "#38BDF8", "#F43F5E", "#FACC15", "#0EA5E9"],
    defaultColor: "#8B5CF6",
    title: "Inspiration",
    subtitle: "",
    count: 9,
  }
);

const { language, t } = useLanguage();
const selectedColor = ref(normalizeCreativeColor(props.defaultColor) ?? props.swatches[0]);
const selectedTone = ref<string | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const skins = ref<GallerySkin[]>([]);

const toneFilters = computed(() => getCreativeToneFilters());

const headerTitle = computed(() => props.title || "Inspiration");
const headerSubtitle = computed(() => {
  if (props.subtitle) return props.subtitle;
  const fallback = t("workspace.dropzone.secondary");
  return typeof fallback === "string" ? fallback : "";
});

const swatches = computed<string[]>(() =>
  Array.from(
    new Set((props.swatches ?? []).map((value) => normalizeCreativeColor(value) ?? value).filter(Boolean))
  ) as string[]
);

async function loadSkins() {
  loading.value = true;
  error.value = null;
  try {
    const paletteColor = normalizeCreativeColor(selectedColor.value);
    selectedColor.value = paletteColor ?? props.swatches[0];
    const results = await generateGallerySkins({
      language: language.value,
      color: paletteColor,
      tone: selectedTone.value,
      count: props.count,
    });
    skins.value = results;
  } catch (err) {
    console.error(err);
    error.value =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Impossible de générer des propositions pour le moment.";
  } finally {
    loading.value = false;
  }
}

function handleColorInput(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const value = target?.value;
  const normalized = normalizeCreativeColor(value);
  if (normalized) {
    selectedColor.value = normalized;
  }
}

function handleSwatch(hex: string) {
  const normalized = normalizeCreativeColor(hex);
  if (normalized) {
    selectedColor.value = normalized;
  }
}

function randomize() {
  const next = pickCreativeSeed(selectedTone.value ?? undefined);
  if (next) {
    selectedColor.value = next;
  }
}

const statusMessage = computed(() => {
  if (loading.value) return t("progress.analyzing") ?? "Chargement…";
  if (error.value) return error.value;
  if (!skins.value.length) return t("palette.empty") ?? "Ajoute une couleur pour commencer.";
  return null;
});

function paletteGradient(palette?: string[]) {
  const colors = palette?.slice(0, 4) ?? [];
  if (!colors.length) return "linear-gradient(135deg, rgba(var(--surface-7-rgb), 0.8), rgba(var(--surface-9-rgb), 0.72))";
  const stops = colors.map((color, index) => `${color} ${index * 30}%`);
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

onMounted(loadSkins);

watch([selectedColor, selectedTone, () => language.value], () => {
  loadSkins();
});
</script>

<template>
  <div class="gallery-shell">
    <header class="gallery-header">
      <p class="gallery-breadcrumb">KrosPalette · Vue</p>
      <h1>{{ headerTitle }}</h1>
      <p v-if="headerSubtitle">{{ headerSubtitle }}</p>
      <div class="gallery-actions">
        <div class="gallery-color-picker">
          <div class="gallery-color-picker__header">
            <span class="gallery-color-picker__label">{{ t("workspace.colorPicker.label") ?? "Couleur de départ" }}</span>
            <span class="gallery-color-picker__hint">Palette</span>
          </div>
          <div class="gallery-color-picker__controls">
            <label class="gallery-color-picker__input">
              <input type="color" :value="selectedColor ?? undefined" aria-label="Choisir une couleur" @input="handleColorInput" />
              <span class="gallery-color-picker__preview" :style="{ background: selectedColor ?? undefined }" />
            </label>
            <button type="button" class="gallery-random" @click="randomize">
              {{ t("workspace.colorPicker.random") ?? "Couleur aléatoire" }}
            </button>
          </div>
          <div v-if="Object.keys(toneFilters).length" class="gallery-color-picker__controls">
            <span class="gallery-color-picker__label">{{ t("identity.companion.sectionTitle") ?? "Tonalités" }}</span>
            <div class="gallery-actions">
              <button
                v-for="(filter, key) in toneFilters"
                :key="key"
                type="button"
                class="gallery-refresh"
                :class="{ 'is-active': selectedTone === key }"
                @click="selectedTone = selectedTone === key ? null : key"
              >
                {{ filter.label }}
              </button>
            </div>
          </div>
          <div class="gallery-color-picker__swatches">
            <button
              v-for="hex in swatches"
              :key="hex"
              type="button"
              class="gallery-color-picker__swatch"
              :class="{ 'is-active': hex === selectedColor }"
              :style="{ backgroundColor: hex ?? undefined }"
              @click="handleSwatch(hex)"
              :aria-label="`Utiliser ${hex}`"
            />
          </div>
        </div>
      </div>
    </header>

    <section v-if="statusMessage" class="gallery-status" role="status">
      <span>{{ statusMessage }}</span>
    </section>

    <section v-else class="gallery-grid">
      <article v-for="skin in skins" :key="skin.id" class="gallery-card">
        <div class="gallery-card__preview" :style="{ background: paletteGradient(skin.palette?.hex) }">
          <div class="gallery-card__meta-left">
            <span class="gallery-card__swatch" :style="{ backgroundColor: skin.primaryColor ?? skin.palette?.hex?.[0] }" />
            <div class="gallery-card__identity-text">
              <span class="gallery-card__class">{{ skin.className }}</span>
              <span class="gallery-card__gender">{{ skin.gender === 'f' ? 'Féminin' : 'Masculin' }}</span>
            </div>
          </div>
          <span class="gallery-card__number">#{{ skin.number }}</span>
        </div>
        <div class="gallery-card__identity">
          <div class="gallery-card__identity-text">
            <strong>Palette</strong>
            <div class="gallery-card__meta-left">
              <span
                v-for="hex in skin.palette?.hex ?? []"
                :key="hex"
                class="gallery-card__swatch"
                :style="{ backgroundColor: hex }"
                :aria-label="hex"
              />
            </div>
          </div>
        </div>
        <div class="gallery-card__meta">
          <div class="gallery-card__identity-text">
            <strong>Objets</strong>
            <ul class="gallery-card__top5">
              <li v-for="item in skin.items" :key="`${skin.id}-${item.slot}-${item.ankamaId ?? item.name}`">
                <span class="gallery-card__top5-label">{{ item.slot }}</span>
                <span class="gallery-card__top5-score">{{ item.name }}</span>
              </li>
            </ul>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.gallery-card__top5 {
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  display: grid;
  gap: 6px;
}

.gallery-card__top5-label {
  font-weight: 600;
  margin-right: 6px;
}

.gallery-card__top5-score {
  color: var(--text-muted);
}
</style>
