<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { UserSelections, DofusItem } from '@/types'
import { getLookPreviewUrl, getItemImageUrl } from '@/services/dofusApi'
import { ITEM_SLOTS } from '@/lib/constants'

const props = defineProps<{
  selections: UserSelections
}>()

const { t } = useI18n()

const copiedToast = ref(false)

const selectedItems = computed(() => {
  const items: Array<{ slot: string; item: DofusItem }> = []
  for (const slot of ITEM_SLOTS) {
    const selection = props.selections[slot]
    if (selection?.item) {
      items.push({ slot, item: selection.item })
    }
  }
  return items
})

const hasSelections = computed(() => selectedItems.value.length > 0)

const lookString = computed(() => {
  // Generate a basic look string from selected items
  // In a real implementation, this would be more complex
  const looks = selectedItems.value
    .map(({ item }) => item.look)
    .filter(Boolean)
  return looks.join('|') || ''
})

const previewUrl = computed(() => {
  if (!lookString.value) return null
  return getLookPreviewUrl(lookString.value)
})

function copyLook() {
  if (!lookString.value) return

  navigator.clipboard.writeText(lookString.value)
  copiedToast.value = true
  setTimeout(() => {
    copiedToast.value = false
  }, 2000)
}

function openRenderer() {
  if (!lookString.value) return
  window.open(previewUrl.value || '', '_blank')
}
</script>

<template>
  <div class="preview-panel card">
    <h3 class="preview-panel__title">{{ t('home.preview.title') }}</h3>

    <div v-if="!hasSelections" class="preview-panel__empty">
      <span class="preview-panel__empty-icon">👗</span>
      <span>{{ t('home.preview.empty') }}</span>
    </div>

    <template v-else>
      <!-- Preview Image -->
      <div class="preview-panel__preview">
        <img
          v-if="previewUrl"
          :src="previewUrl"
          alt="Character preview"
          class="preview-panel__image"
        />
        <div v-else class="preview-panel__placeholder">
          <span>Preview</span>
        </div>
      </div>

      <!-- Selected Items List -->
      <div class="preview-panel__items">
        <div
          v-for="{ slot, item } in selectedItems"
          :key="slot"
          class="preview-panel__item"
        >
          <img
            :src="getItemImageUrl(item) || '/placeholder-item.png'"
            :alt="item.name"
            class="preview-panel__item-icon"
          />
          <div class="preview-panel__item-info">
            <span class="preview-panel__item-slot">{{ t(`home.slots.${slot}`) }}</span>
            <span class="preview-panel__item-name">{{ item.name }}</span>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="preview-panel__actions">
        <button class="btn btn--secondary" @click="copyLook">
          {{ copiedToast ? t('home.preview.copied') : t('home.preview.copy') }}
        </button>
        <button class="btn btn--primary" @click="openRenderer">
          {{ t('home.preview.render') }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.preview-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  position: sticky;
  top: 80px;
}

.preview-panel__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
}

.preview-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px;
  color: var(--text-muted);
  text-align: center;
}

.preview-panel__empty-icon {
  font-size: 2.5rem;
  opacity: 0.5;
}

.preview-panel__preview {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  background: rgba(var(--surface-6-rgb), 0.5);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.preview-panel__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.preview-panel__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--text-muted);
}

.preview-panel__items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.preview-panel__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  background: rgba(var(--surface-7-rgb), 0.5);
  border-radius: var(--radius-sm);
}

.preview-panel__item-icon {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.preview-panel__item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.preview-panel__item-slot {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.preview-panel__item-name {
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-panel__actions {
  display: flex;
  gap: 8px;
}

.preview-panel__actions .btn {
  flex: 1;
}
</style>
