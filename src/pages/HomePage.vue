<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useThemeStore } from '@/stores/theme'
import { useSelectionStore } from '@/stores/selection'
import { useImageUpload } from '@/composables/useImageUpload'
import { usePalette } from '@/composables/usePalette'
import { useItems } from '@/composables/useItems'
import { ITEM_SLOTS } from '@/lib/constants'
import type { ItemSlot, DofusItem, PaletteColor } from '@/types'
import ImageUploader from '@/components/palette/ImageUploader.vue'
import PaletteDisplay from '@/components/palette/PaletteDisplay.vue'
import SlotSelector from '@/components/items/SlotSelector.vue'
import ItemGrid from '@/components/items/ItemGrid.vue'
import PreviewPanel from '@/components/items/PreviewPanel.vue'

const { t } = useI18n()
const themeStore = useThemeStore()
const selectionStore = useSelectionStore()
const { uploadedImage, handleFile, handleDrop, handleDragOver, handleDragLeave, isDragging, isUploading } = useImageUpload()
const { extractedPalette, extractFromImage, isExtracting } = usePalette()
const { loadSlot, getItems, isLoading } = useItems()

const activeSlot = ref<ItemSlot>('coiffe')
const searchQuery = ref('')

const slotItems = computed(() => getItems(activeSlot.value))
const isSlotLoading = computed(() => isLoading(activeSlot.value))

const filteredItems = computed(() => {
  const items = slotItems.value
  if (!searchQuery.value) return items

  const query = searchQuery.value.toLowerCase()
  return items.filter((item) => item.name?.toLowerCase().includes(query))
})

async function onImageUploaded(file: File) {
  const result = await handleFile(file)
  if (result.imageData) {
    const palette = await extractFromImage(result.imageData)
    // Update theme if intelligent mode
    if (themeStore.isIntelligent) {
      themeStore.setPalette(palette.all)
    }
  }
}

function onSlotChange(slot: ItemSlot) {
  activeSlot.value = slot
  loadSlot(slot)
}

function onItemSelect(item: DofusItem) {
  selectionStore.selectItem(activeSlot.value, item)
}

function onColorClick(color: PaletteColor) {
  // Could be used for filtering or highlighting
  console.log('Color clicked:', color.hex)
}

onMounted(() => {
  selectionStore.loadSelections()
  loadSlot(activeSlot.value)
})

watch(activeSlot, (slot) => {
  loadSlot(slot)
})
</script>

<template>
  <div class="home-page">
    <header class="home-page__header">
      <h1 class="home-page__title">{{ t('home.title') }}</h1>
      <p class="home-page__subtitle">{{ t('home.subtitle') }}</p>
    </header>

    <div class="home-page__content">
      <!-- Left Panel: Upload & Palette -->
      <section class="home-page__panel home-page__panel--left">
        <ImageUploader
          :is-uploading="isUploading"
          :is-dragging="isDragging"
          :uploaded-image="uploadedImage?.dataUrl || null"
          @file-selected="onImageUploaded"
          @drop="handleDrop"
          @drag-over="handleDragOver"
          @drag-leave="handleDragLeave"
        />

        <Transition name="fade">
          <PaletteDisplay
            v-if="extractedPalette"
            :palette="extractedPalette"
            :is-loading="isExtracting"
            @color-click="onColorClick"
          />
        </Transition>
      </section>

      <!-- Center Panel: Items -->
      <section class="home-page__panel home-page__panel--center">
        <div class="home-page__slots">
          <SlotSelector
            :slots="ITEM_SLOTS"
            :active-slot="activeSlot"
            :selections="selectionStore.currentSelections"
            @slot-change="onSlotChange"
          />
        </div>

        <div class="home-page__search">
          <input
            v-model="searchQuery"
            type="text"
            class="input"
            :placeholder="t('home.filters.search')"
          />
        </div>

        <ItemGrid
          :items="filteredItems"
          :is-loading="isSlotLoading"
          :selected-item="selectionStore.getSelection(activeSlot)?.item || null"
          @item-select="onItemSelect"
        />
      </section>

      <!-- Right Panel: Preview -->
      <section class="home-page__panel home-page__panel--right">
        <PreviewPanel :selections="selectionStore.currentSelections" />
      </section>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
}

.home-page__header {
  text-align: center;
  margin-bottom: 32px;
}

.home-page__title {
  font-size: 2rem;
  font-weight: 700;
  margin: 0 0 8px;
  background: linear-gradient(135deg, rgb(var(--accent-primary-rgb)), rgb(var(--accent-secondary-rgb)));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.home-page__subtitle {
  color: var(--text-muted);
  margin: 0;
}

.home-page__content {
  display: grid;
  grid-template-columns: 300px 1fr 320px;
  gap: 24px;
}

@media (max-width: 1200px) {
  .home-page__content {
    grid-template-columns: 1fr 1fr;
  }

  .home-page__panel--right {
    grid-column: 1 / -1;
  }
}

@media (max-width: 768px) {
  .home-page__content {
    grid-template-columns: 1fr;
  }
}

.home-page__panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.home-page__slots {
  margin-bottom: 8px;
}

.home-page__search {
  margin-bottom: 8px;
}

.home-page__search .input {
  width: 100%;
}
</style>
