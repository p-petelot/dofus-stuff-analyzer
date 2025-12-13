import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { ItemSlot, DofusItem, UserSelections, SlotSelection } from '@/types'
import { ITEM_SLOTS } from '@/lib/constants'

const STORAGE_KEY = 'krospalette.selections.v1'
const INSPIRATION_STORAGE_KEY = 'krospalette.inspiration.selections.v1'

export const useSelectionStore = defineStore('selection', () => {
  const selections = ref<UserSelections>({})
  const inspirationSelections = ref<UserSelections>({})
  const currentLayout = ref<'studio' | 'inspiration'>('studio')

  // Initialize empty selections for all slots
  function initSelections() {
    const initial: UserSelections = {}
    for (const slot of ITEM_SLOTS) {
      initial[slot] = {
        slot,
        item: null,
        colors: []
      }
    }
    return initial
  }

  // Load selections from localStorage
  function loadSelections() {
    if (typeof window === 'undefined') return

    try {
      const storedStudio = localStorage.getItem(STORAGE_KEY)
      if (storedStudio) {
        selections.value = JSON.parse(storedStudio)
      } else {
        selections.value = initSelections()
      }

      const storedInspiration = localStorage.getItem(INSPIRATION_STORAGE_KEY)
      if (storedInspiration) {
        inspirationSelections.value = JSON.parse(storedInspiration)
      } else {
        inspirationSelections.value = initSelections()
      }
    } catch {
      selections.value = initSelections()
      inspirationSelections.value = initSelections()
    }
  }

  // Save selections to localStorage
  function saveSelections() {
    if (typeof window === 'undefined') return

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selections.value))
      localStorage.setItem(INSPIRATION_STORAGE_KEY, JSON.stringify(inspirationSelections.value))
    } catch {
      // Storage might be full or unavailable
    }
  }

  // Get current selections based on layout
  const currentSelections = computed(() => {
    return currentLayout.value === 'inspiration' ? inspirationSelections.value : selections.value
  })

  // Select an item for a slot
  function selectItem(slot: ItemSlot, item: DofusItem | null, colors?: string[]) {
    const target = currentLayout.value === 'inspiration' ? inspirationSelections : selections

    target.value[slot] = {
      slot,
      item,
      colors: colors || []
    }
    saveSelections()
  }

  // Get selection for a specific slot
  function getSelection(slot: ItemSlot): SlotSelection | null {
    return currentSelections.value[slot] || null
  }

  // Clear selection for a slot
  function clearSlot(slot: ItemSlot) {
    selectItem(slot, null, [])
  }

  // Clear all selections
  function clearAll() {
    const target = currentLayout.value === 'inspiration' ? inspirationSelections : selections
    target.value = initSelections()
    saveSelections()
  }

  // Set current layout
  function setLayout(layout: 'studio' | 'inspiration') {
    currentLayout.value = layout
  }

  // Get all selected items
  const selectedItems = computed(() => {
    const items: DofusItem[] = []
    for (const slot of ITEM_SLOTS) {
      const selection = currentSelections.value[slot]
      if (selection?.item) {
        items.push(selection.item)
      }
    }
    return items
  })

  // Check if any items are selected
  const hasSelections = computed(() => selectedItems.value.length > 0)

  // Watch for changes and auto-save
  watch([selections, inspirationSelections], () => {
    saveSelections()
  }, { deep: true })

  return {
    selections,
    inspirationSelections,
    currentLayout,
    currentSelections,
    selectedItems,
    hasSelections,
    loadSelections,
    selectItem,
    getSelection,
    clearSlot,
    clearAll,
    setLayout
  }
})
