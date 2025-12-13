<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useImageUpload } from '@/composables/useImageUpload'

const { t } = useI18n()
const { uploadedImage, handleFile, isUploading } = useImageUpload()

const prediction = ref<{
  breed: string
  sex: 'male' | 'female'
  confidence: number
} | null>(null)
const isPredicting = ref(false)

// Training state
const trainingConfig = ref({
  epochs: 10,
  batchSize: 32,
  learningRate: 0.001
})
const isTraining = ref(false)
const trainingProgress = ref(0)

async function onImageUploaded(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  await handleFile(file)
  await predictImage()
}

async function predictImage() {
  if (!uploadedImage.value) return

  isPredicting.value = true
  prediction.value = null

  // Simulate prediction
  await new Promise((resolve) => setTimeout(resolve, 1500))

  // Mock prediction result
  const breeds = ['Iop', 'Cra', 'Eniripsa', 'Ecaflip', 'Sadida', 'Sacrieur', 'Feca', 'Osamodas']
  prediction.value = {
    breed: breeds[Math.floor(Math.random() * breeds.length)],
    sex: Math.random() > 0.5 ? 'male' : 'female',
    confidence: 0.7 + Math.random() * 0.25
  }

  isPredicting.value = false
}

async function startTraining() {
  isTraining.value = true
  trainingProgress.value = 0

  // Simulate training progress
  for (let i = 0; i <= trainingConfig.value.epochs; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    trainingProgress.value = (i / trainingConfig.value.epochs) * 100
  }

  isTraining.value = false
}

function stopTraining() {
  isTraining.value = false
}
</script>

<template>
  <div class="vision-page">
    <header class="vision-page__header">
      <h1 class="vision-page__title">{{ t('vision.title') }}</h1>
      <p class="vision-page__subtitle">{{ t('vision.subtitle') }}</p>
    </header>

    <div class="vision-page__content">
      <!-- Prediction Panel -->
      <section class="vision-page__panel card">
        <h2 class="vision-page__section-title">{{ t('vision.upload.title') }}</h2>
        <p class="text-muted text-sm">{{ t('vision.upload.description') }}</p>

        <div class="vision-page__upload">
          <label class="vision-page__upload-area" :class="{ 'vision-page__upload-area--has-image': uploadedImage }">
            <input
              type="file"
              accept="image/*"
              class="vision-page__upload-input"
              @change="onImageUploaded"
            />
            <img
              v-if="uploadedImage"
              :src="uploadedImage.dataUrl"
              alt="Uploaded"
              class="vision-page__upload-preview"
            />
            <div v-else class="vision-page__upload-placeholder">
              <span class="vision-page__upload-icon">📷</span>
              <span>{{ t('home.upload.description') }}</span>
            </div>
          </label>
        </div>

        <div v-if="isPredicting" class="vision-page__loading">
          <span class="loader"></span>
          <span>{{ t('common.loading') }}</span>
        </div>

        <div v-else-if="prediction" class="vision-page__prediction">
          <h3 class="vision-page__section-title">{{ t('vision.prediction.title') }}</h3>

          <div class="vision-page__prediction-item">
            <span class="vision-page__prediction-label">{{ t('vision.prediction.breed') }}</span>
            <span class="vision-page__prediction-value">{{ prediction.breed }}</span>
          </div>

          <div class="vision-page__prediction-item">
            <span class="vision-page__prediction-label">{{ t('vision.prediction.sex') }}</span>
            <span class="vision-page__prediction-value">
              {{ prediction.sex === 'male' ? t('vision.prediction.male') : t('vision.prediction.female') }}
            </span>
          </div>

          <div class="vision-page__prediction-item">
            <span class="vision-page__prediction-label">{{ t('vision.prediction.confidence') }}</span>
            <div class="vision-page__confidence">
              <div
                class="vision-page__confidence-bar"
                :style="{ width: `${prediction.confidence * 100}%` }"
              ></div>
              <span class="vision-page__confidence-text">
                {{ (prediction.confidence * 100).toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Training Panel -->
      <section class="vision-page__panel card">
        <h2 class="vision-page__section-title">{{ t('vision.training.title') }}</h2>

        <div class="vision-page__training-config">
          <div class="vision-page__config-item">
            <label class="vision-page__config-label">{{ t('vision.training.epochs') }}</label>
            <input
              v-model.number="trainingConfig.epochs"
              type="number"
              class="input"
              min="1"
              max="100"
              :disabled="isTraining"
            />
          </div>

          <div class="vision-page__config-item">
            <label class="vision-page__config-label">{{ t('vision.training.batchSize') }}</label>
            <input
              v-model.number="trainingConfig.batchSize"
              type="number"
              class="input"
              min="1"
              max="128"
              :disabled="isTraining"
            />
          </div>

          <div class="vision-page__config-item">
            <label class="vision-page__config-label">{{ t('vision.training.learningRate') }}</label>
            <input
              v-model.number="trainingConfig.learningRate"
              type="number"
              class="input"
              step="0.0001"
              min="0.0001"
              max="1"
              :disabled="isTraining"
            />
          </div>
        </div>

        <div v-if="isTraining" class="vision-page__progress">
          <div class="vision-page__progress-bar">
            <div
              class="vision-page__progress-fill"
              :style="{ width: `${trainingProgress}%` }"
            ></div>
          </div>
          <span class="vision-page__progress-text">
            {{ t('vision.training.progress') }}: {{ trainingProgress.toFixed(0) }}%
          </span>
        </div>

        <div class="vision-page__training-actions">
          <button
            v-if="!isTraining"
            class="btn btn--primary"
            @click="startTraining"
          >
            {{ t('vision.training.start') }}
          </button>
          <button
            v-else
            class="btn btn--secondary"
            @click="stopTraining"
          >
            {{ t('vision.training.stop') }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.vision-page {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  padding: 20px;
}

.vision-page__header {
  text-align: center;
  margin-bottom: 32px;
}

.vision-page__title {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 8px;
  background: linear-gradient(135deg, rgb(var(--accent-primary-rgb)), rgb(var(--accent-secondary-rgb)));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.vision-page__subtitle {
  color: var(--text-muted);
  margin: 0;
}

.vision-page__content {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
}

@media (max-width: 768px) {
  .vision-page__content {
    grid-template-columns: 1fr;
  }
}

.vision-page__panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.vision-page__section-title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0;
}

.vision-page__upload-area {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  border: 2px dashed var(--card-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  overflow: hidden;
}

.vision-page__upload-area:hover {
  border-color: rgb(var(--accent-primary-rgb));
  background: rgba(var(--accent-primary-rgb), 0.05);
}

.vision-page__upload-area--has-image {
  border-style: solid;
}

.vision-page__upload-input {
  display: none;
}

.vision-page__upload-preview {
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
}

.vision-page__upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
}

.vision-page__upload-icon {
  font-size: 2.5rem;
}

.vision-page__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  color: var(--text-muted);
}

.vision-page__prediction {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: rgba(var(--surface-9-rgb), 0.5);
  border-radius: var(--radius-sm);
}

.vision-page__prediction-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.vision-page__prediction-label {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.vision-page__prediction-value {
  font-weight: 600;
}

.vision-page__confidence {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  max-width: 200px;
}

.vision-page__confidence-bar {
  height: 8px;
  background: linear-gradient(90deg, rgb(var(--success-rgb)), rgb(var(--accent-primary-rgb)));
  border-radius: 4px;
  transition: width 0.3s;
}

.vision-page__confidence-text {
  font-weight: 600;
  font-size: 0.9rem;
}

.vision-page__training-config {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.vision-page__config-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.vision-page__config-label {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.vision-page__config-item .input {
  width: 100%;
}

.vision-page__progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vision-page__progress-bar {
  height: 8px;
  background: rgba(var(--surface-6-rgb), 0.8);
  border-radius: 4px;
  overflow: hidden;
}

.vision-page__progress-fill {
  height: 100%;
  background: linear-gradient(90deg, rgb(var(--accent-primary-rgb)), rgb(var(--accent-secondary-rgb)));
  transition: width 0.3s;
}

.vision-page__progress-text {
  font-size: 0.9rem;
  color: var(--text-muted);
  text-align: center;
}

.vision-page__training-actions {
  display: flex;
  justify-content: center;
}
</style>
