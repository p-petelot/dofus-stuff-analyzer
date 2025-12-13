import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { DofusItem, ItemSlot, Breed, LanguageCode } from '@/types'
import { fetchItems, fetchBreeds } from '@/services/dofusApi'
import { ITEM_TYPE_CONFIG } from '@/lib/constants'

interface ItemsCache {
  [key: string]: DofusItem[]
}

export const useItemsStore = defineStore('items', () => {
  const itemsCache = ref<ItemsCache>({})
  const breedsCache = ref<Breed[]>([])
  const loadingSlots = ref<Set<ItemSlot>>(new Set())
  const loadingBreeds = ref(false)
  const error = ref<string | null>(null)

  const pendingRequests = new Map<string, Promise<DofusItem[]>>()
  const pendingBreedsRequest = ref<Promise<Breed[]> | null>(null)

  function getCacheKey(slot: ItemSlot, language: LanguageCode): string {
    return `${slot}::${language}`
  }

  async function loadItemsForSlot(slot: ItemSlot, language: LanguageCode): Promise<DofusItem[]> {
    const cacheKey = getCacheKey(slot, language)

    // Return cached data if available
    if (itemsCache.value[cacheKey]) {
      return itemsCache.value[cacheKey]
    }

    // Return pending request if exists
    if (pendingRequests.has(cacheKey)) {
      return pendingRequests.get(cacheKey)!
    }

    // Start new request
    loadingSlots.value.add(slot)
    error.value = null

    const config = ITEM_TYPE_CONFIG[slot]
    if (!config) {
      loadingSlots.value.delete(slot)
      return []
    }

    const promise = (async () => {
      try {
        const allItems: DofusItem[] = []

        for (const request of config.requests) {
          const items = await fetchItems({
            typeIds: request.typeIds,
            skip: request.skip,
            limit: request.limit,
            language
          })
          allItems.push(...items)
        }

        itemsCache.value[cacheKey] = allItems
        return allItems
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load items'
        throw err
      } finally {
        loadingSlots.value.delete(slot)
        pendingRequests.delete(cacheKey)
      }
    })()

    pendingRequests.set(cacheKey, promise)
    return promise
  }

  async function loadBreeds(language: LanguageCode): Promise<Breed[]> {
    if (breedsCache.value.length > 0) {
      return breedsCache.value
    }

    if (pendingBreedsRequest.value) {
      return pendingBreedsRequest.value
    }

    loadingBreeds.value = true

    pendingBreedsRequest.value = (async () => {
      try {
        const breeds = await fetchBreeds(language)
        breedsCache.value = breeds
        return breeds
      } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load breeds'
        throw err
      } finally {
        loadingBreeds.value = false
        pendingBreedsRequest.value = null
      }
    })()

    return pendingBreedsRequest.value
  }

  function getItemsForSlot(slot: ItemSlot, language: LanguageCode): DofusItem[] {
    const cacheKey = getCacheKey(slot, language)
    return itemsCache.value[cacheKey] || []
  }

  function isSlotLoading(slot: ItemSlot): boolean {
    return loadingSlots.value.has(slot)
  }

  function clearCache() {
    itemsCache.value = {}
    breedsCache.value = []
  }

  const breeds = computed(() => breedsCache.value)

  return {
    itemsCache,
    breeds,
    loadingSlots,
    loadingBreeds,
    error,
    loadItemsForSlot,
    loadBreeds,
    getItemsForSlot,
    isSlotLoading,
    clearCache
  }
})
