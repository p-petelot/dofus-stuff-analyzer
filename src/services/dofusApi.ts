import type { DofusItem, Breed, LanguageCode } from '@/types'
import { DOFUS_API_HOST, DEFAULT_LANGUAGE } from '@/lib/constants'

interface FetchItemsParams {
  typeIds: number[]
  skip?: number
  limit?: number
  language?: LanguageCode
}

export async function fetchItems({
  typeIds,
  skip = 0,
  limit = 1200,
  language = DEFAULT_LANGUAGE as LanguageCode
}: FetchItemsParams): Promise<DofusItem[]> {
  const params = new URLSearchParams()
  params.set('$skip', String(skip))
  params.set('$limit', String(limit))
  params.set('lang', language)
  params.set('typeId[$ne]', '203')
  params.set('$sort', '-id')
  params.set('level[$gte]', '0')
  params.set('level[$lte]', '200')

  // Add typeId filter
  if (typeIds.length === 1) {
    params.set('typeId', String(typeIds[0]))
  } else {
    typeIds.forEach((id) => {
      params.append('typeId[$in][]', String(id))
    })
  }

  const url = `${DOFUS_API_HOST}/items?${params.toString()}`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'KrosPalette/1.0'
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch items: ${response.status}`)
  }

  const data = await response.json()
  return data.data || data || []
}

export async function fetchBreeds(language: LanguageCode = DEFAULT_LANGUAGE as LanguageCode): Promise<Breed[]> {
  const params = new URLSearchParams()
  params.set('$skip', '0')
  params.set('$limit', '20')
  params.set('lang', language)

  const url = `${DOFUS_API_HOST}/breeds?${params.toString()}`

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'KrosPalette/1.0'
    }
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch breeds: ${response.status}`)
  }

  const data = await response.json()
  return data.data || data || []
}

export function getItemImageUrl(item: DofusItem): string | null {
  // Check imgset first
  if (item.imgset && Array.isArray(item.imgset)) {
    for (const img of item.imgset) {
      if (img.url) return img.url
      if (img.href) return img.href
      if (img.img) return img.img
    }
  }

  // Fallback to iconId
  if (item.iconId) {
    return `https://api.dofusdb.fr/img/items/${item.iconId}.png`
  }

  return null
}

export function getLookPreviewUrl(look: string, direction: number = 1): string {
  const encodedLook = encodeURIComponent(look)
  return `https://renderer.dofusdb.fr/kool?look=${encodedLook}&direction=${direction}`
}

export function getSouffRendererUrl(look: string): string {
  const encodedLook = encodeURIComponent(look)
  return `https://skin.souff.fr/renderer/?look=${encodedLook}`
}
