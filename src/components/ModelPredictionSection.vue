<script setup lang="ts">
import { computed } from "vue";
import { formatModelHex, getBreedName } from "../../lib/vision/breeds";
import type { PredictionLabels } from "../lib/vision/prediction-labels";

type ModelTopEntry = {
  class_idx: number;
  breed: number;
  sex: number;
  prob: number;
};

type ModelPreview = {
  image?: string | null;
  renderer?: string | null;
  payload?: {
    breed: number;
    sex: number;
    colors: number[];
    head?: number;
  } | null;
};

type ModelResult = {
  prediction: {
    breed: number;
    sex: number;
    prob: number;
  };
  colors: number[];
  top5: ModelTopEntry[];
  preview?: ModelPreview | null;
};

const props = withDefaults(
  defineProps<{
    result?: ModelResult | null;
    isLoading?: boolean;
    error?: string | null;
    placeholder: string;
    labels: PredictionLabels;
  }>(),
  {
    result: null,
    isLoading: false,
    error: null,
  }
);

const previewHeadLabel = computed(() => {
  const payload = props.result?.preview?.payload;
  if (!payload) return props.labels.preview.noHead;
  if (typeof payload.head === "number") {
    return `#${payload.head}`;
  }
  return props.labels.preview.noHead;
});
</script>

<template>
  <section class="model-insights" aria-live="polite">
    <header class="model-insights__header">
      <h2>{{ labels.title }}</h2>
      <span v-if="isLoading" class="badge badge--pulse">{{ labels.loading }}</span>
    </header>

    <p v-if="error" class="model-insights__error" role="alert">
      {{ error }}
    </p>

    <p v-else-if="!result && !isLoading" class="model-insights__placeholder">
      {{ placeholder }}
    </p>

    <div v-else-if="result" class="model-insights__content">
      <div class="model-insights__preview">
        <h3>{{ labels.preview.title }}</h3>
        <div v-if="result.preview?.image" class="model-insights__preview-frame">
          <img
            :src="result.preview.image"
            :alt="labels.preview.alt"
            class="model-insights__preview-image"
            loading="lazy"
          />
        </div>
        <p v-else class="model-insights__preview-placeholder">
          {{ labels.preview.missing }}
        </p>
        <a
          v-if="result.preview?.renderer"
          class="model-insights__preview-link"
          :href="result.preview.renderer"
          target="_blank"
          rel="noreferrer"
        >
          {{ labels.preview.openRenderer }}
        </a>

        <dl v-if="result.preview?.payload" class="model-insights__preview-meta">
          <div>
            <dt>{{ labels.preview.metaClass }}</dt>
            <dd>
              {{ getBreedName(result.prediction.breed) }} ·
              <span>
                <template v-if="result.prediction.sex === 0">{{ labels.sex.male }}</template>
                <template v-else-if="result.prediction.sex === 1">{{ labels.sex.female }}</template>
                <template v-else>{{ labels.sex.unknown }}</template>
              </span>
            </dd>
          </div>
          <div>
            <dt>{{ labels.preview.metaHead }}</dt>
            <dd>{{ previewHeadLabel }}</dd>
          </div>
        </dl>
      </div>

      <div class="model-insights__summary">
        <div class="model-insights__summary-badge">
          <span class="model-insights__summary-label">{{ labels.topClass }}</span>
          <span class="model-insights__summary-value">
            {{ getBreedName(result.prediction.breed) }} ·
            <template v-if="result.prediction.sex === 0">{{ labels.sex.male }}</template>
            <template v-else-if="result.prediction.sex === 1">{{ labels.sex.female }}</template>
            <template v-else>{{ labels.sex.unknown }}</template>
          </span>
        </div>
        <div class="model-insights__summary-confidence">
          <span class="model-insights__summary-label">{{ labels.confidence }}</span>
          <span class="model-insights__summary-value">
            {{ (result.prediction.prob * 100).toFixed(1) }}%
          </span>
        </div>
      </div>

      <div class="model-insights__colors">
        <h3>{{ labels.colors }}</h3>
        <ul class="model-insights__swatches">
          <li v-for="color in result.colors" :key="formatModelHex(color)">
            <span class="model-insights__swatch" :style="{ backgroundColor: formatModelHex(color) }" aria-hidden="true" />
            <span class="model-insights__swatch-label">{{ formatModelHex(color) }}</span>
          </li>
        </ul>
      </div>

      <div class="model-insights__top5">
        <h3>{{ labels.top5 }}</h3>
        <ol>
          <li v-for="entry in result.top5" :key="`${entry.class_idx}-${entry.sex}`">
            <span class="model-insights__top5-label">
              {{ getBreedName(entry.breed) }} ·
              <template v-if="entry.sex === 0">{{ labels.sex.male }}</template>
              <template v-else-if="entry.sex === 1">{{ labels.sex.female }}</template>
              <template v-else>{{ labels.sex.unknown }}</template>
            </span>
            <span class="model-insights__top5-score">{{ (entry.prob * 100).toFixed(1) }}%</span>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>
