import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ThemeKey, ThemeOption, PaletteColor } from '@/types'
import { THEME_TOKENS, buildIntelligentThemeTokens } from '@/lib/theme'

const THEME_STORAGE_KEY = 'krospalette.theme'
const DEFAULT_THEME: ThemeKey = 'dark'

export const THEME_OPTIONS: ThemeOption[] = [
  { key: 'dark', icon: '🌙', labelKey: 'theme.option.dark' },
  { key: 'light', icon: '☀️', labelKey: 'theme.option.light' },
  { key: 'dofus', icon: '🍃', labelKey: 'theme.option.dofus' },
  { key: 'intelligent', icon: '🧠', labelKey: 'theme.option.intelligent' }
]

export const useThemeStore = defineStore('theme', () => {
  const currentTheme = ref<ThemeKey>(DEFAULT_THEME)
  const palette = ref<PaletteColor[]>([])

  const themeOptions = computed(() => THEME_OPTIONS)

  const isIntelligent = computed(() => currentTheme.value === 'intelligent')

  function initTheme() {
    if (typeof window === 'undefined') return

    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored && isValidTheme(stored)) {
      currentTheme.value = stored as ThemeKey
    }
    applyTheme(currentTheme.value)
  }

  function setTheme(theme: ThemeKey) {
    if (!isValidTheme(theme)) return

    currentTheme.value = theme
    if (typeof window !== 'undefined') {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
    applyTheme(theme)
  }

  function setPalette(colors: PaletteColor[]) {
    palette.value = colors
    if (currentTheme.value === 'intelligent') {
      applyTheme('intelligent')
    }
  }

  function applyTheme(theme: ThemeKey) {
    if (typeof document === 'undefined') return

    const root = document.documentElement
    root.setAttribute('data-theme', theme)

    const tokens =
      theme === 'intelligent'
        ? buildIntelligentThemeTokens(palette.value.map((c) => c.hex))
        : THEME_TOKENS[theme] || THEME_TOKENS.dark

    Object.entries(tokens).forEach(([property, value]) => {
      root.style.setProperty(property, value as string)
    })
  }

  function isValidTheme(value: string): value is ThemeKey {
    return ['dark', 'light', 'dofus', 'intelligent'].includes(value)
  }

  return {
    currentTheme,
    palette,
    themeOptions,
    isIntelligent,
    initTheme,
    setTheme,
    setPalette,
    applyTheme
  }
})
