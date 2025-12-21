<script setup lang="ts">
import { ref } from "vue";

const rendererUrl = ref("https://skin.souff.fr/renderer/");
const per = ref(5);
const epochs = ref(1);
const batchSize = ref(32);
const imgSize = ref(128);
const learningRate = ref(0.0002);

const generateStatus = ref<"idle" | "running" | "success">("idle");
const trainStatus = ref<"idle" | "running" | "success">("idle");
const history = ref<Array<{ epoch: number; acc: number; val: number; loss: number; valLoss: number }>>([]);

const uploadError = ref<string | null>(null);
const preview = ref<string | null>(null);
const palette = ref<string[]>([]);

function simulateJob(target: "generate" | "train") {
  const status = target === "generate" ? generateStatus : trainStatus;
  status.value = "running";
  if (target === "train") {
    history.value = [];
  }
  setTimeout(() => {
    status.value = "success";
    if (target === "train") {
      history.value = Array.from({ length: epochs.value }, (_, index) => ({
        epoch: index + 1,
        acc: 0.8 + Math.random() * 0.15,
        val: 0.72 + Math.random() * 0.12,
        loss: 0.2 + Math.random() * 0.08,
        valLoss: 0.22 + Math.random() * 0.12,
      }));
    }
  }, 600);
}

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploadError.value = null;
  preview.value = null;
  palette.value = [];

  const reader = new FileReader();
  reader.onload = () => {
    const result = reader.result;
    if (typeof result !== "string") {
      uploadError.value = "Impossible de lire le fichier.";
      return;
    }
    preview.value = result;
    extractPalette(result);
  };
  reader.onerror = () => {
    uploadError.value = "Lecture du fichier échouée.";
  };
  reader.readAsDataURL(file);
}

function extractPalette(dataUrl: string) {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = 120;
    canvas.width = size;
    canvas.height = size;
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    const buckets = new Map<string, number>();
    for (let i = 0; i < data.length; i += 16) {
      const r = Math.round(data[i] / 17) * 17;
      const g = Math.round(data[i + 1] / 17) * 17;
      const b = Math.round(data[i + 2] / 17) * 17;
      const key = `${r},${g},${b}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    const top = Array.from(buckets.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key]) => {
        const [r, g, b] = key.split(",").map((v) => Number(v));
        return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
      });
    palette.value = top;
  };
  img.src = dataUrl;
}

function resetPreview() {
  preview.value = null;
  palette.value = [];
  uploadError.value = null;
}
</script>

<template>
  <main class="page">
    <header class="hero">
      <div>
        <p class="pill">Vision</p>
        <h1 class="hero__title">Laboratoire de détection</h1>
        <p class="hero__lead">
          Déplace l'ancien code Next.js vers des Single File Components réutilisables :
          l'upload, les réglages d'entraînement et la prévisualisation de palettes vivent dans des blocs isolés.
        </p>
      </div>
    </header>

    <section class="card-grid">
      <article class="card">
        <h2>Jeux de sprites</h2>
        <p class="muted">Relancer le crawl en local sans Next : l'appel se fait côté client.</p>
        <div class="form">
          <label>
            <span>Quantité</span>
            <input v-model.number="per" type="number" min="1" />
          </label>
          <label>
            <span>Renderer</span>
            <input v-model="rendererUrl" type="url" />
          </label>
        </div>
        <div class="panel__actions">
          <button class="button button--primary" type="button" :disabled="generateStatus === 'running'" @click="simulateJob('generate')">
            Générer
          </button>
          <span class="muted" v-if="generateStatus !== 'idle'">
            {{ generateStatus === 'running' ? "En cours..." : "Terminé" }}
          </span>
        </div>
      </article>

      <article class="card">
        <h2>Mini entraînement</h2>
        <p class="muted">Contrôle les hyperparamètres directement dans Vue 3.</p>
        <div class="form">
          <label>
            <span>Epochs</span>
            <input v-model.number="epochs" type="number" min="1" />
          </label>
          <label>
            <span>Batch size</span>
            <input v-model.number="batchSize" type="number" min="1" />
          </label>
          <label>
            <span>Image size</span>
            <input v-model.number="imgSize" type="number" min="32" step="16" />
          </label>
          <label>
            <span>Learning rate</span>
            <input v-model.number="learningRate" type="number" step="0.0001" />
          </label>
        </div>
        <div class="panel__actions">
          <button class="button button--primary" type="button" :disabled="trainStatus === 'running'" @click="simulateJob('train')">
            Entrainer
          </button>
          <span class="muted" v-if="trainStatus !== 'idle'">
            {{ trainStatus === 'running' ? "En cours..." : "Terminé" }}
          </span>
        </div>
        <div v-if="history.length" class="stack">
          <div v-for="row in history" :key="row.epoch" class="panel">
            <strong>Epoch {{ row.epoch }}</strong>
            <span class="muted">acc {{ (row.acc * 100).toFixed(1) }}% | val {{ (row.val * 100).toFixed(1) }}%</span>
            <span class="muted">loss {{ row.loss.toFixed(4) }} | val {{ row.valLoss.toFixed(4) }}</span>
          </div>
        </div>
      </article>
    </section>

    <section class="card">
      <h2 class="section-title">Upload et palette rapide</h2>
      <label class="upload">
        <input type="file" accept="image/*" hidden @change="handleFile" />
        <span>Glisse ton image ici ou clique pour choisir un fichier</span>
      </label>
      <div class="panel__actions">
        <button class="button" type="button" @click="resetPreview">Réinitialiser</button>
        <span v-if="uploadError" class="muted">{{ uploadError }}</span>
      </div>
      <div class="preview" v-if="preview || palette.length">
        <div v-if="preview" class="panel">
          <img :src="preview" alt="Prévisualisation" />
        </div>
        <div v-if="palette.length" class="panel">
          <h3>Palette détectée</h3>
          <div class="pill-list">
            <span v-for="color in palette" :key="color" class="pill" :style="{ background: color, color: '#0b1224' }">
              {{ color }}
            </span>
          </div>
        </div>
      </div>
    </section>
  </main>
</template>
