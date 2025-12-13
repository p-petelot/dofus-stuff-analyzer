<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ExtractedPalette, PaletteColor } from '@/types'

const props = defineProps<{
  palette: ExtractedPalette
  isLoading?: boolean
}>()

const emit = defineEmits<{
  (e: 'color-click', color: PaletteColor): void
}>()

const { t } = useI18n()

const mainColors = computed(() => [
  { label: t('home.palette.primary'), color: props.palette.primary },
  { label: t('home.palette.secondary'), color: props.palette.secondary },
  { label: t('home.palette.tertiary'), color: props.palette.tertiary }
])

function handleColorClick(color: PaletteColor) {
  emit('color-click', color)
}

function copyColor(hex: string) {
  navigator.clipboard.writeText(hex)
}
</script>

<template>
  <div class="palette-display card">
    <h3 class="palette-display__title">{{ t('home.palette.title') }}</h3>

    <div v-if="isLoading" class="palette-display__loading">
      <span class="loader"></span>
    </div>

    <div v-else class="palette-display__content">
      <!-- Main Colors -->
      <div class="palette-display__main">
        <div
          v-for="{ label, color } in mainColors"
          :key="label"
          class="palette-display__color-item"
          @click="handleColorClick(color)"
        >
          <div
            class="palette-display__color-swatch palette-display__color-swatch--large"
            :style="{ backgroundColor: color.hex }"
            @dblclick="copyColor(color.hex)"
          ></div>
          <div class="palette-display__color-info">
            <span class="palette-display__color-label">{{ label }}</span>
            <span class="palette-display__color-hex">{{ color.hex }}</span>
          </div>
        </div>
      </div>

      <!-- All Colors -->
      <div v-if="palette.all.length > 3" class="palette-display__all">
        <div class="palette-display__all-grid">
          <div
            v-for="(color, index) in palette.all.slice(3)"
            :key="index"
            class="palette-display__color-swatch palette-display__color-swatch--small"
            :style="{ backgroundColor: color.hex }"
            :title="color.hex"
            @click="handleColorClick(color)"
            @dblclick="copyColor(color.hex)"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.palette-display {
  padding: 20px;
}

.palette-display__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 16px;
}

.palette-display__loading {
  display: flex;
  justify-content: center;
  padding: 24px;
}

.palette-display__main {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.palette-display__color-item {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
  padding: 8px;
  border-radius: var(--radius-sm);
  transition: background 0.2s;
}

.palette-display__color-item:hover {
  background: rgba(var(--accent-primary-rgb), 0.1);
}

.palette-display__color-swatch {
  border-radius: 8px;
  transition: transform 0.2s;
  cursor: pointer;
}

.palette-display__color-swatch:hover {
  transform: scale(1.05);
}

.palette-display__color-swatch--large {
  width: 48px;
  height: 48px;
}

.palette-display__color-swatch--small {
  width: 32px;
  height: 32px;
}

.palette-display__color-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.palette-display__color-label {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.palette-display__color-hex {
  font-size: 0.9rem;
  font-weight: 500;
  font-family: monospace;
}

.palette-display__all {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--card-border);
}

.palette-display__all-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
