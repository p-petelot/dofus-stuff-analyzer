<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DofusItem } from '@/types'
import { getItemImageUrl } from '@/services/dofusApi'

const props = defineProps<{
  items: DofusItem[]
  isLoading: boolean
  selectedItem: DofusItem | null
}>()

const emit = defineEmits<{
  (e: 'item-select', item: DofusItem): void
}>()

const { t } = useI18n()

function isSelected(item: DofusItem): boolean {
  return props.selectedItem?.id === item.id
}

function handleItemClick(item: DofusItem) {
  emit('item-select', item)
}

function getImageUrl(item: DofusItem): string {
  return getItemImageUrl(item) || '/placeholder-item.png'
}
</script>

<template>
  <div class="item-grid">
    <div v-if="isLoading" class="item-grid__loading">
      <span class="loader"></span>
      <span>{{ t('home.suggestions.loading') }}</span>
    </div>

    <div v-else-if="items.length === 0" class="item-grid__empty">
      {{ t('home.suggestions.empty') }}
    </div>

    <div v-else class="item-grid__content">
      <div
        v-for="item in items"
        :key="item.id"
        class="item-grid__item"
        :class="{ 'item-grid__item--selected': isSelected(item) }"
        @click="handleItemClick(item)"
      >
        <div class="item-grid__item-image">
          <img
            :src="getImageUrl(item)"
            :alt="item.name"
            loading="lazy"
            @error="($event.target as HTMLImageElement).src = '/placeholder-item.png'"
          />
        </div>
        <div class="item-grid__item-info">
          <span class="item-grid__item-name">{{ item.name }}</span>
          <span class="item-grid__item-level">Lvl {{ item.level }}</span>
        </div>
        <div v-if="isSelected(item)" class="item-grid__item-check">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.item-grid {
  flex: 1;
  min-height: 400px;
}

.item-grid__loading,
.item-grid__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  min-height: 200px;
  color: var(--text-muted);
}

.item-grid__content {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  max-height: 500px;
  overflow-y: auto;
  padding-right: 8px;
}

.item-grid__content::-webkit-scrollbar {
  width: 6px;
}

.item-grid__content::-webkit-scrollbar-track {
  background: rgba(var(--surface-6-rgb), 0.3);
  border-radius: 3px;
}

.item-grid__content::-webkit-scrollbar-thumb {
  background: rgba(var(--accent-primary-rgb), 0.4);
  border-radius: 3px;
}

.item-grid__item {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: var(--card);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.2s;
}

.item-grid__item:hover {
  background: rgba(var(--surface-9-rgb), 0.9);
  border-color: rgba(var(--accent-primary-rgb), 0.3);
  transform: translateY(-2px);
}

.item-grid__item--selected {
  background: rgba(var(--accent-primary-rgb), 0.15);
  border-color: rgb(var(--accent-primary-rgb));
}

.item-grid__item-image {
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  margin-bottom: 8px;
}

.item-grid__item-image img {
  max-width: 100%;
  max-height: 80px;
  object-fit: contain;
}

.item-grid__item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-grid__item-name {
  font-size: 0.85rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-grid__item-level {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.item-grid__item-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(var(--success-rgb));
  border-radius: 50%;
  color: white;
}
</style>
