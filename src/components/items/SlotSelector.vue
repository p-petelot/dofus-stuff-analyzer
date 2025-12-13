<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ItemSlot, UserSelections } from '@/types'

const props = defineProps<{
  slots: ItemSlot[]
  activeSlot: ItemSlot
  selections: UserSelections
}>()

const emit = defineEmits<{
  (e: 'slot-change', slot: ItemSlot): void
}>()

const { t } = useI18n()

const slotIcons: Record<ItemSlot, string> = {
  coiffe: '🎩',
  cape: '🧥',
  bouclier: '🛡️',
  familier: '🐾',
  epauliere: '🦺',
  costume: '👔',
  ailes: '🪽'
}

function isSlotSelected(slot: ItemSlot): boolean {
  return props.selections[slot]?.item !== null
}

function handleSlotClick(slot: ItemSlot) {
  emit('slot-change', slot)
}
</script>

<template>
  <div class="slot-selector">
    <button
      v-for="slot in slots"
      :key="slot"
      class="slot-selector__item"
      :class="{
        'slot-selector__item--active': activeSlot === slot,
        'slot-selector__item--selected': isSlotSelected(slot)
      }"
      @click="handleSlotClick(slot)"
    >
      <span class="slot-selector__icon">{{ slotIcons[slot] }}</span>
      <span class="slot-selector__label">{{ t(`home.slots.${slot}`) }}</span>
      <span v-if="isSlotSelected(slot)" class="slot-selector__badge"></span>
    </button>
  </div>
</template>

<style scoped>
.slot-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.slot-selector__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: 1px solid var(--card-border);
  border-radius: var(--radius-sm);
  background: rgba(var(--surface-7-rgb), 0.5);
  color: var(--text-muted);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.slot-selector__item:hover {
  background: rgba(var(--surface-8-rgb), 0.7);
  color: var(--text);
  border-color: rgba(var(--accent-primary-rgb), 0.3);
}

.slot-selector__item--active {
  background: rgba(var(--accent-primary-rgb), 0.15);
  border-color: rgb(var(--accent-primary-rgb));
  color: var(--text);
}

.slot-selector__item--selected::after {
  content: '';
  position: absolute;
  top: -4px;
  right: -4px;
  width: 10px;
  height: 10px;
  background: rgb(var(--success-rgb));
  border-radius: 50%;
  border: 2px solid var(--bg);
}

.slot-selector__icon {
  font-size: 1.1rem;
}

.slot-selector__label {
  font-weight: 500;
}

.slot-selector__badge {
  display: none;
}

@media (max-width: 768px) {
  .slot-selector__label {
    display: none;
  }

  .slot-selector__item {
    padding: 10px 14px;
  }
}
</style>
