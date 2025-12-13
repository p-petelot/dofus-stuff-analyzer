import { computed, ref } from 'vue'
import { useItemsStore } from '@/stores/items'
import { useI18n } from 'vue-i18n'
import type { ItemSlot, DofusItem, LanguageCode } from '@/types'

export function useItems() {
  const store = useItemsStore()
  const { locale } = useI18n()

  const currentLanguage = computed(() => locale.value as LanguageCode)

  async function loadSlot(slot: ItemSlot): Promise<DofusItem[]> {
    return store.loadItemsForSlot(slot, currentLanguage.value)
  }

  async function loadBreeds() {
    return store.loadBreeds(currentLanguage.value)
  }

  function getItems(slot: ItemSlot): DofusItem[] {
    return store.getItemsForSlot(slot, currentLanguage.value)
  }

  function isLoading(slot: ItemSlot): boolean {
    return store.isSlotLoading(slot)
  }

  const breeds = computed(() => store.breeds)
  const error = computed(() => store.error)

  return {
    loadSlot,
    loadBreeds,
    getItems,
    isLoading,
    breeds,
    error,
    currentLanguage
  }
}
