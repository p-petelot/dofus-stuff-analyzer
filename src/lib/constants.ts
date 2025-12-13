import type { ItemSlot, ItemTypeConfig, FamilierFilter, ItemFlagFilter, LanguageOption } from '@/types'

export const DOFUS_API_HOST = 'https://api.dofusdb.fr'
export const DOFUS_API_BASE_URL = `${DOFUS_API_HOST}/items`

export const ITEM_SLOTS: ItemSlot[] = [
  'coiffe',
  'cape',
  'bouclier',
  'familier',
  'epauliere',
  'costume',
  'ailes'
]

export const ITEM_TYPE_CONFIG: Record<ItemSlot, ItemTypeConfig> = {
  coiffe: {
    requests: [
      { typeIds: [16], skip: 0, limit: 1200 },
      { typeIds: [246], skip: 0, limit: 1200 }
    ]
  },
  cape: {
    requests: [
      { typeIds: [17], skip: 0, limit: 1200 },
      { typeIds: [247], skip: 0, limit: 1200 }
    ]
  },
  familier: {
    requests: [
      { typeIds: [18, 249], skip: 0, limit: 1200 },
      { typeIds: [121, 250], skip: 0, limit: 1200 },
      { typeIds: [97], skip: 0, limit: 1200 },
      { typeIds: [196], skip: 0, limit: 1200 },
      { typeIds: [207], skip: 0, limit: 1200 }
    ]
  },
  epauliere: {
    requests: [{ typeIds: [299], skip: 0, limit: 1200 }]
  },
  costume: {
    requests: [{ typeIds: [199], skip: 0, limit: 1200 }]
  },
  ailes: {
    requests: [{ typeIds: [300], skip: 0, limit: 1200 }]
  },
  bouclier: {
    requests: [
      { typeIds: [82], skip: 0, limit: 1200 },
      { typeIds: [248], skip: 0, limit: 1200 }
    ]
  }
}

export const FAMILIER_FILTERS: FamilierFilter[] = [
  { key: 'pet', labelKey: 'companions.filters.pet', typeIds: [18, 249] },
  { key: 'mount', labelKey: 'companions.filters.mount', typeIds: [121, 250] },
  { key: 'dragodinde', labelKey: 'companions.filters.dragodinde', typeIds: [97] },
  { key: 'muldo', labelKey: 'companions.filters.muldo', typeIds: [196] },
  { key: 'volkorne', labelKey: 'companions.filters.volkorne', typeIds: [207] }
]

export const ITEM_FLAG_FILTERS: ItemFlagFilter[] = [
  { key: 'colorable', labelKey: 'items.filters.colorable', flagKey: 'isColorable' },
  { key: 'cosmetic', labelKey: 'items.filters.cosmetic', flagKey: 'isCosmetic' }
]

export const LANGUAGES: LanguageOption[] = [
  { code: 'fr', name: 'Français', flag: 'fr' },
  { code: 'en', name: 'English', flag: 'gb' },
  { code: 'es', name: 'Español', flag: 'es' },
  { code: 'pt', name: 'Português', flag: 'pt' },
  { code: 'de', name: 'Deutsch', flag: 'de' },
  { code: 'it', name: 'Italiano', flag: 'it' },
  { code: 'ja', name: '日本語', flag: 'jp' },
  { code: 'ko', name: '한국어', flag: 'kr' },
  { code: 'zh', name: '中文', flag: 'cn' }
]

export const DEFAULT_LANGUAGE = 'fr'

export const DOFUS_PALETTE_COLORS = [
  '#000000',
  '#FFFFFF',
  '#FF0000',
  '#00FF00',
  '#0000FF',
  '#FFFF00',
  '#FF00FF',
  '#00FFFF',
  '#FFA500',
  '#800080',
  '#008000',
  '#000080'
]

export const MAX_ITEM_PALETTE_COLORS = 6

export const IMAGE_REFERENCE_KEYS = [
  'url',
  'href',
  'img',
  'image',
  'icon',
  'fullSize',
  'large',
  'medium',
  'small',
  'src'
]

export const EXTERNAL_RENDERERS = {
  souff: 'https://skin.souff.fr/renderer/',
  dofusdb: 'https://renderer.dofusdb.fr/kool'
}

export const FLAG_CDN = 'https://flagcdn.com'
