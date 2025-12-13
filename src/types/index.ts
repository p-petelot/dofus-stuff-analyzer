// Theme types
export type ThemeKey = 'dark' | 'light' | 'dofus' | 'intelligent'

export interface ThemeOption {
  key: ThemeKey
  icon: string
  labelKey: string
}

// Language types
export type LanguageCode = 'fr' | 'en' | 'es' | 'pt' | 'de' | 'it' | 'ja' | 'ko' | 'zh'

export interface LanguageOption {
  code: LanguageCode
  name: string
  flag: string
}

// Item types
export type ItemSlot = 'coiffe' | 'cape' | 'bouclier' | 'familier' | 'epauliere' | 'costume' | 'ailes'

export interface ItemTypeConfig {
  requests: Array<{
    typeIds: number[]
    skip: number
    limit: number
  }>
}

export interface DofusItem {
  id: number
  name: string
  typeId: number
  level: number
  iconId?: number
  imgset?: Array<{
    url?: string
    href?: string
    img?: string
  }>
  look?: string
  isColorable?: boolean
  isCosmetic?: boolean
}

export interface ItemCandidate {
  item: DofusItem
  score: number
  verified: boolean
  matchType: 'item' | 'color'
}

// Color types
export interface RgbColor {
  r: number
  g: number
  b: number
}

export interface LabColor {
  l: number
  a: number
  b: number
}

export interface PaletteColor {
  hex: string
  rgb: RgbColor
  lab?: LabColor
}

export interface ExtractedPalette {
  primary: PaletteColor
  secondary: PaletteColor
  tertiary: PaletteColor
  all: PaletteColor[]
}

// Suggestion types
export interface SlotSuggestion {
  slot: ItemSlot
  visible: boolean
  candidates: ItemCandidate[]
  palette?: PaletteColor[]
}

export interface SuggestionOutput {
  slots: Record<ItemSlot, SlotSuggestion>
  globalPalette: ExtractedPalette
  debug?: {
    processingTime: number
    imageSize: { width: number; height: number }
  }
}

// Breed types
export interface Breed {
  id: number
  name: string
  maleLook?: string
  femaleLook?: string
}

// Selection types
export interface SlotSelection {
  slot: ItemSlot
  item: DofusItem | null
  colors?: string[]
}

export interface UserSelections {
  [slot: string]: SlotSelection
}

// API types
export interface DofusApiResponse<T> {
  data: T[]
  total: number
  limit: number
  skip: number
}

// Familier filter types
export interface FamilierFilter {
  key: string
  labelKey: string
  typeIds: number[]
}

export interface ItemFlagFilter {
  key: string
  labelKey: string
  flagKey: keyof Pick<DofusItem, 'isColorable' | 'isCosmetic'>
}
