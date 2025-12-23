<script setup lang="ts">
import { computed, ref } from "vue";
import ModelPredictionSection from "../components/ModelPredictionSection.vue";
import { useLanguage } from "../lib/i18n";
import { buildPredictionLabels } from "../lib/vision/prediction-labels";

type TrainHistoryEntry = {
  epoch: number;
  trainAcc: number;
  valAcc: number;
  trainLoss: number;
  valLoss: number;
};

type PredictionEntry = {
  prediction: {
    breed: number;
    sex: number;
    prob: number;
  };
  colors: number[];
  top5: Array<{
    class_idx: number;
    breed: number;
    sex: number;
    prob: number;
  }>;
  preview?: {
    image?: string;
    renderer?: string;
    payload?: {
      breed: number;
      sex: number;
      colors: number[];
      head?: number;
    };
  } | null;
};

type StatusKey = "idle" | "running" | "success" | "error";

const DEFAULT_RENDERER = "https://skin.souff.fr/renderer/";

const { t } = useLanguage();
const predictionLabels = computed(() => buildPredictionLabels(t));

const per = ref(5);
const rendererUrl = ref(DEFAULT_RENDERER);
const generateStatus = ref<StatusKey>("idle");

const epochs = ref(1);
const batchSize = ref(32);
const imgSize = ref(128);
const learningRate = ref(0.0002);
const trainStatus = ref<StatusKey>("idle");
const trainHistory = ref<TrainHistoryEntry[]>([]);

const predictionResult = ref<PredictionEntry | null>(null);
const predictionError = ref<string | null>(null);
const isPredicting = ref(false);

const generateStatusText = computed<Record<StatusKey, string>>(() => ({
  idle: typeof t("vision.lab.generate.status.idle") === "string" ? (t("vision.lab.generate.status.idle") as string) : "",
  running:
    typeof t("vision.lab.generate.status.running") === "string"
      ? (t("vision.lab.generate.status.running") as string)
      : "Processing…",
  success:
    typeof t("vision.lab.generate.status.success") === "string"
      ? (t("vision.lab.generate.status.success") as string)
      : "Completed",
  error:
    typeof t("vision.lab.generate.status.error") === "string"
      ? (t("vision.lab.generate.status.error") as string)
      : "An error occurred",
}));

const trainStatusText = computed<Record<StatusKey, string>>(() => ({
  idle: typeof t("vision.lab.train.status.idle") === "string" ? (t("vision.lab.train.status.idle") as string) : "",
  running:
    typeof t("vision.lab.train.status.running") === "string"
      ? (t("vision.lab.train.status.running") as string)
      : "Processing…",
  success:
    typeof t("vision.lab.train.status.success") === "string"
      ? (t("vision.lab.train.status.success") as string)
      : "Completed",
  error:
    typeof t("vision.lab.train.status.error") === "string"
      ? (t("vision.lab.train.status.error") as string)
      : "An error occurred",
}));

const generateStatusMessage = computed(() => generateStatusText.value[generateStatus.value] ?? "");
const trainStatusMessage = computed(() => trainStatusText.value[trainStatus.value] ?? "");

const metaTitle = computed(() => {
  const translated = t("vision.lab.title");
  return typeof translated === "string" ? translated : "Vision Lab";
});

const metaDescription = computed(() => {
  const translated = t("vision.lab.subtitle");
  return typeof translated === "string"
    ? translated
    : "Gestion du modèle Dofus Vision";
});

async function handleGenerate() {
  generateStatus.value = "running";
  try {
    const response = await fetch("/api/vision/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ per: Number(per.value), renderer: rendererUrl.value }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Generation failed");
    }
    generateStatus.value = "success";
  } catch (error) {
    console.error(error);
    generateStatus.value = "error";
  }
}

async function handleTrain() {
  trainStatus.value = "running";
  trainHistory.value = [];
  try {
    const response = await fetch("/api/vision/train", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        epochs: Number(epochs.value),
        batchSize: Number(batchSize.value),
        imgSize: Number(imgSize.value),
        learningRate: Number(learningRate.value),
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Training failed");
    }
    const payload = await response.json();
    trainHistory.value = Array.isArray(payload?.history) ? payload.history : [];
    trainStatus.value = "success";
  } catch (error) {
    console.error(error);
    trainStatus.value = "error";
  }
}

async function handlePredictFile(file: File) {
  const encoded = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(typeof event.target?.result === "string" ? event.target.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

  if (!encoded) return;

  isPredicting.value = true;
  predictionResult.value = null;
  predictionError.value = null;
  try {
    const response = await fetch("/api/vision/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: encoded, renderer: rendererUrl.value }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload?.error || "Prediction failed");
    }
    const payload = await response.json();
    predictionResult.value = payload;
  } catch (error) {
    console.error(error);
    const fallback = t("vision.lab.predict.error");
    predictionError.value =
      error instanceof Error
        ? error.message
        : typeof fallback === "string"
          ? fallback
          : "Prediction failed";
  } finally {
    isPredicting.value = false;
  }
}

function handlePredictChange(event: Event) {
  const target = event.target as HTMLInputElement | null;
  const file = target?.files?.[0];
  if (file) {
    handlePredictFile(file);
    if (target) target.value = "";
  }
}

function resetPrediction() {
  predictionResult.value = null;
  predictionError.value = null;
}
</script>

<template>
  <main class="vision-lab">
    <div class="vision-lab__intro">
      <h1>{{ metaTitle }}</h1>
      <p>{{ metaDescription }}</p>
    </div>

    <div class="vision-lab__grid">
      <section class="vision-lab__card">
        <header>
          <h2>{{ t("vision.lab.generate.title") }}</h2>
          <p>{{ t("vision.lab.generate.description") }}</p>
        </header>
        <div class="vision-lab__form">
          <label>
            <span>{{ t("vision.lab.generate.per") }}</span>
            <input
              type="number"
              min="1"
              v-model.number="per"
            />
          </label>
          <label>
            <span>{{ t("vision.lab.generate.renderer") }}</span>
            <input v-model="rendererUrl" />
          </label>
          <button
            type="button"
            class="vision-lab__button vision-lab__button--primary"
            @click="handleGenerate"
            :disabled="generateStatus === 'running'"
          >
            {{ t("vision.lab.generate.button") }}
          </button>
          <p
            v-if="generateStatusMessage"
            class="vision-lab__status"
            :class="`vision-lab__status--${generateStatus}`"
            aria-live="polite"
          >
            {{ generateStatusMessage }}
          </p>
        </div>
      </section>

      <section class="vision-lab__card">
        <header>
          <h2>{{ t("vision.lab.train.title") }}</h2>
          <p>{{ t("vision.lab.train.description") }}</p>
        </header>
        <div class="vision-lab__form vision-lab__form--grid">
          <label>
            <span>{{ t("vision.lab.train.epochs") }}</span>
            <input
              type="number"
              min="1"
              v-model.number="epochs"
            />
          </label>
          <label>
            <span>{{ t("vision.lab.train.batch") }}</span>
            <input
              type="number"
              min="1"
              v-model.number="batchSize"
            />
          </label>
          <label>
            <span>{{ t("vision.lab.train.imgSize") }}</span>
            <input
              type="number"
              min="32"
              step="16"
              v-model.number="imgSize"
            />
          </label>
          <label>
            <span>{{ t("vision.lab.train.learningRate") }}</span>
            <input
              type="number"
              step="0.0001"
              v-model.number="learningRate"
            />
          </label>
        </div>
        <button
          type="button"
          class="vision-lab__button vision-lab__button--primary"
          @click="handleTrain"
          :disabled="trainStatus === 'running'"
        >
          {{ t("vision.lab.train.button") }}
        </button>
        <p
          v-if="trainStatusMessage"
          class="vision-lab__status"
          :class="`vision-lab__status--${trainStatus}`"
          aria-live="polite"
        >
          {{ trainStatusMessage }}
        </p>
        <div v-if="trainHistory.length" class="vision-lab__history" role="table">
          <div class="vision-lab__history-row vision-lab__history-row--head" role="row">
            <span role="columnheader">#</span>
            <span role="columnheader">acc</span>
            <span role="columnheader">val</span>
            <span role="columnheader">loss</span>
            <span role="columnheader">val loss</span>
          </div>
          <div
            v-for="entry in trainHistory"
            :key="entry.epoch"
            class="vision-lab__history-row"
            role="row"
          >
            <span role="cell">{{ entry.epoch }}</span>
            <span role="cell">{{ (entry.trainAcc * 100).toFixed(1) }}%</span>
            <span role="cell">{{ (entry.valAcc * 100).toFixed(1) }}%</span>
            <span role="cell">{{ entry.trainLoss.toFixed(4) }}</span>
            <span role="cell">{{ entry.valLoss.toFixed(4) }}</span>
          </div>
        </div>
      </section>

      <section class="vision-lab__card vision-lab__card--prediction">
        <header>
          <h2>{{ t("vision.lab.predict.title") }}</h2>
          <p>{{ t("vision.lab.predict.description") }}</p>
        </header>
        <div class="vision-lab__upload">
          <label class="vision-lab__upload-label">
            <input type="file" accept="image/*" @change="handlePredictChange" />
            <span class="vision-lab__upload-content">
              <span class="vision-lab__upload-icon" aria-hidden="true">📤</span>
              <span>{{ t("vision.lab.predict.upload") }}</span>
            </span>
          </label>
          <button
            type="button"
            @click="resetPrediction"
            class="vision-lab__button vision-lab__button--ghost"
          >
            {{ t("actions.clear") ?? "Effacer" }}
          </button>
        </div>
        <ModelPredictionSection
          :result="predictionResult"
          :is-loading="isPredicting"
          :error="predictionError"
          :placeholder="predictionLabels.placeholder"
          :labels="predictionLabels"
        />
      </section>
    </div>
  </main>
</template>
