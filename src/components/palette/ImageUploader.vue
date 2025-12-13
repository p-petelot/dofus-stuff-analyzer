<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  isUploading: boolean
  isDragging: boolean
  uploadedImage: string | null
}>()

const emit = defineEmits<{
  (e: 'file-selected', file: File): void
  (e: 'drop', event: DragEvent): void
  (e: 'drag-over', event: DragEvent): void
  (e: 'drag-leave'): void
}>()

const { t } = useI18n()
const fileInput = ref<HTMLInputElement | null>(null)

function triggerFileSelect() {
  fileInput.value?.click()
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    emit('file-selected', file)
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  emit('drop', event)
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  emit('drag-over', event)
}

function handleDragLeave() {
  emit('drag-leave')
}
</script>

<template>
  <div
    class="image-uploader card"
    :class="{
      'image-uploader--dragging': isDragging,
      'image-uploader--has-image': uploadedImage
    }"
    @click="triggerFileSelect"
    @drop="handleDrop"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
  >
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      class="image-uploader__input"
      @change="handleFileChange"
    />

    <div v-if="isUploading" class="image-uploader__loading">
      <span class="loader"></span>
      <span>{{ t('home.upload.loading') }}</span>
    </div>

    <img
      v-else-if="uploadedImage"
      :src="uploadedImage"
      alt="Uploaded image"
      class="image-uploader__preview"
    />

    <div v-else class="image-uploader__placeholder">
      <div class="image-uploader__icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <h3 class="image-uploader__title">{{ t('home.upload.title') }}</h3>
      <p class="image-uploader__description">{{ t('home.upload.description') }}</p>
      <p class="image-uploader__hint">{{ t('home.upload.hint') }}</p>
    </div>
  </div>
</template>

<style scoped>
.image-uploader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 250px;
  border: 2px dashed var(--card-border);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  overflow: hidden;
}

.image-uploader:hover,
.image-uploader--dragging {
  border-color: rgb(var(--accent-primary-rgb));
  background: rgba(var(--accent-primary-rgb), 0.05);
}

.image-uploader--has-image {
  border-style: solid;
  padding: 0;
}

.image-uploader__input {
  display: none;
}

.image-uploader__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-muted);
}

.image-uploader__preview {
  width: 100%;
  height: 100%;
  max-height: 300px;
  object-fit: contain;
}

.image-uploader__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 24px;
}

.image-uploader__icon {
  color: rgb(var(--accent-primary-rgb));
  margin-bottom: 16px;
}

.image-uploader__title {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0 0 8px;
}

.image-uploader__description {
  color: var(--text-muted);
  margin: 0 0 8px;
  font-size: 0.9rem;
}

.image-uploader__hint {
  color: var(--text-muted);
  font-size: 0.8rem;
  margin: 0;
  opacity: 0.7;
}
</style>
