import type { ThemeKey } from '@/types'
import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex, adjustHexLightness } from './colors/utils'

const SURFACE_VARIABLES = [
  '--surface-1-rgb',
  '--surface-2-rgb',
  '--surface-3-rgb',
  '--surface-4-rgb',
  '--surface-5-rgb',
  '--surface-6-rgb',
  '--surface-7-rgb',
  '--surface-8-rgb',
  '--surface-9-rgb',
  '--surface-10-rgb',
  '--surface-11-rgb'
]

const DARK_SURFACE_VALUES = [
  '5, 8, 22',
  '7, 12, 28',
  '8, 12, 26',
  '8, 12, 28',
  '9, 13, 28',
  '9, 14, 32',
  '10, 17, 32',
  '10, 17, 40',
  '13, 20, 38',
  '15, 23, 42',
  '17, 24, 39'
]

const LIGHT_SURFACE_VALUES = [
  '244, 247, 255',
  '235, 240, 255',
  '228, 235, 250',
  '222, 230, 244',
  '210, 220, 236',
  '196, 206, 224',
  '184, 195, 214',
  '255, 255, 255',
  '228, 236, 246',
  '216, 226, 240',
  '204, 214, 230'
]

const DOFUS_SURFACE_VALUES = [
  '4, 18, 12',
  '6, 24, 16',
  '8, 30, 20',
  '10, 36, 24',
  '12, 42, 28',
  '14, 48, 32',
  '16, 54, 36',
  '18, 60, 40',
  '20, 66, 44',
  '24, 72, 48',
  '28, 78, 52'
]

function buildSurfaceTokens(values: string[]): Record<string, string> {
  const tokens: Record<string, string> = {}
  SURFACE_VARIABLES.forEach((variable, index) => {
    tokens[variable] = values[index] ?? DARK_SURFACE_VALUES[index]
  })
  return tokens
}

const DARK_ACCENT_VALUES = {
  '--accent-primary-rgb': '139, 92, 246',
  '--accent-strong-rgb': '168, 85, 247',
  '--accent-soft-rgb': '192, 132, 252',
  '--accent-glow-rgb': '123, 97, 255',
  '--accent-contrast-rgb': '129, 140, 248',
  '--accent-secondary-rgb': '56, 189, 248',
  '--accent-tertiary-rgb': '59, 130, 246',
  '--accent-quaternary-rgb': '96, 165, 250',
  '--accent-indigo-rgb': '99, 102, 241',
  '--accent-sky-rgb': '14, 165, 233',
  '--accent-cool-rgb': '129, 199, 255'
}

const LIGHT_ACCENT_VALUES = {
  '--accent-primary-rgb': '37, 99, 235',
  '--accent-strong-rgb': '29, 78, 216',
  '--accent-soft-rgb': '147, 197, 253',
  '--accent-glow-rgb': '96, 165, 250',
  '--accent-contrast-rgb': '30, 64, 175',
  '--accent-secondary-rgb': '14, 165, 233',
  '--accent-tertiary-rgb': '2, 132, 199',
  '--accent-quaternary-rgb': '56, 189, 248',
  '--accent-indigo-rgb': '79, 70, 229',
  '--accent-sky-rgb': '14, 165, 233',
  '--accent-cool-rgb': '125, 211, 252'
}

const DOFUS_ACCENT_VALUES = {
  '--accent-primary-rgb': '34, 197, 94',
  '--accent-strong-rgb': '250, 204, 21',
  '--accent-soft-rgb': '207, 255, 189',
  '--accent-glow-rgb': '250, 179, 8',
  '--accent-contrast-rgb': '22, 163, 74',
  '--accent-secondary-rgb': '234, 179, 8',
  '--accent-tertiary-rgb': '34, 197, 94',
  '--accent-quaternary-rgb': '13, 148, 136',
  '--accent-indigo-rgb': '180, 83, 9',
  '--accent-sky-rgb': '64, 196, 166',
  '--accent-cool-rgb': '201, 255, 191'
}

const BASE_STATUS_TOKENS = {
  '--success-rgb': '34, 197, 94',
  '--success-strong-rgb': '16, 185, 129',
  '--success-soft-rgb': '45, 212, 191',
  '--success-pale-rgb': '134, 239, 172',
  '--warning-rgb': '245, 158, 11',
  '--warning-strong-rgb': '250, 204, 21',
  '--warning-soft-rgb': '234, 179, 8',
  '--danger-rgb': '248, 113, 113',
  '--danger-strong-rgb': '239, 68, 68',
  '--danger-dark-rgb': '127, 29, 29',
  '--frost-rgb': '224, 231, 255',
  '--white-rgb': '255, 255, 255'
}

export const THEME_TOKENS: Record<ThemeKey, Record<string, string>> = {
  dark: {
    ...buildSurfaceTokens(DARK_SURFACE_VALUES),
    '--surface-contrast-rgb': '30, 41, 59',
    '--bg': '#050816',
    '--bg-accent':
      'radial-gradient(circle at top right, rgba(var(--accent-glow-rgb), 0.18), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-sky-rgb), 0.16), transparent 50%), #050816',
    '--card': 'rgba(var(--surface-8-rgb), 0.82)',
    '--card-border': 'rgba(var(--text-muted-rgb), 0.18)',
    '--text': '#f8fafc',
    '--text-muted': '#94a3b8',
    '--text-rgb': '248, 250, 252',
    '--text-muted-rgb': '148, 163, 184',
    '--text-soft-rgb': '226, 232, 240',
    '--neutral-strong-rgb': '100, 116, 139',
    '--highlight': '#8b5cf6',
    '--highlight-strong': '#c084fc',
    '--shadow': '0 24px 48px -28px rgba(var(--surface-10-rgb), 0.95)',
    ...DARK_ACCENT_VALUES,
    ...BASE_STATUS_TOKENS
  },
  light: {
    ...buildSurfaceTokens(LIGHT_SURFACE_VALUES),
    '--surface-contrast-rgb': '30, 41, 59',
    '--bg': '#f4f6fb',
    '--bg-accent':
      'radial-gradient(circle at top right, rgba(var(--accent-cool-rgb), 0.22), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-secondary-rgb), 0.18), transparent 45%), #f4f6fb',
    '--card': 'rgba(var(--surface-8-rgb), 0.92)',
    '--card-border': 'rgba(var(--text-muted-rgb), 0.22)',
    '--text': '#0f172a',
    '--text-muted': '#475569',
    '--text-rgb': '15, 23, 42',
    '--text-muted-rgb': '71, 85, 105',
    '--text-soft-rgb': '100, 116, 139',
    '--neutral-strong-rgb': '120, 135, 152',
    '--highlight': '#2563eb',
    '--highlight-strong': '#1d4ed8',
    '--shadow': '0 20px 38px -26px rgba(var(--surface-contrast-rgb), 0.25)',
    ...LIGHT_ACCENT_VALUES,
    ...BASE_STATUS_TOKENS
  },
  dofus: {
    ...buildSurfaceTokens(DOFUS_SURFACE_VALUES),
    '--surface-contrast-rgb': '30, 44, 36',
    '--bg': '#04160f',
    '--bg-accent':
      'radial-gradient(circle at top right, rgba(var(--accent-primary-rgb), 0.2), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-strong-rgb), 0.18), transparent 50%), #04160f',
    '--card': 'rgba(var(--surface-8-rgb), 0.84)',
    '--card-border': 'rgba(var(--text-muted-rgb), 0.28)',
    '--text': '#f6fff4',
    '--text-muted': '#bdecc5',
    '--text-rgb': '246, 255, 244',
    '--text-muted-rgb': '189, 236, 197',
    '--text-soft-rgb': '214, 242, 220',
    '--neutral-strong-rgb': '112, 154, 126',
    '--highlight': '#22c55e',
    '--highlight-strong': '#f59e0b',
    '--shadow': '0 24px 48px -28px rgba(var(--surface-10-rgb), 0.82)',
    ...DOFUS_ACCENT_VALUES,
    ...BASE_STATUS_TOKENS
  },
  intelligent: {
    ...buildSurfaceTokens(DARK_SURFACE_VALUES),
    ...DARK_ACCENT_VALUES,
    ...BASE_STATUS_TOKENS,
    '--bg': '#050816',
    '--text': '#f8fafc',
    '--text-muted': '#94a3b8'
  }
}

const SURFACE_LIGHTNESS_VALUES = [0.04, 0.06, 0.08, 0.1, 0.12, 0.15, 0.18, 0.22, 0.26, 0.3, 0.34]

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toRgbString(rgb: { r: number; g: number; b: number } | null): string {
  if (!rgb) return '0, 0, 0'
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`
}

function createSurfacePalette(baseHex: string): Array<{ rgb: string; hex: string }> {
  const baseRgb = hexToRgb(baseHex) ?? { r: 56, g: 189, b: 248 }
  const baseHsl = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b)

  return SURFACE_LIGHTNESS_VALUES.map((lightness, index) => {
    const saturation = clamp(baseHsl.s * 0.55 + 0.25 - index * 0.015, 0.25, 0.7)
    const { r, g, b } = hslToRgb(baseHsl.h, saturation, lightness)
    const hex = rgbToHex(r, g, b)
    return { rgb: `${r}, ${g}, ${b}`, hex }
  })
}

function createAccentPalette(
  primaryHex: string,
  secondaryHex?: string,
  tertiaryHex?: string
): Record<string, string> {
  const primary = primaryHex || '#38BDF8'
  const secondary = secondaryHex || adjustHexLightness(primary, -0.12, 0.12)
  const tertiary = tertiaryHex || adjustHexLightness(primary, 0.2, -0.16)

  const strong = adjustHexLightness(primary, -0.2, -0.08)
  const soft = adjustHexLightness(primary, 0.26, -0.18)
  const glow = adjustHexLightness(primary, 0.34, -0.24)
  const contrast = adjustHexLightness(primary, -0.28, 0.12)
  const quaternary = adjustHexLightness(secondary, 0.18, -0.1)
  const indigo = adjustHexLightness(primary, -0.12, 0.18)
  const sky = adjustHexLightness(secondary, 0.12, -0.04)
  const cool = adjustHexLightness(tertiary, 0.24, -0.18)

  return {
    '--accent-primary-rgb': toRgbString(hexToRgb(primary)),
    '--accent-strong-rgb': toRgbString(hexToRgb(strong)),
    '--accent-soft-rgb': toRgbString(hexToRgb(soft)),
    '--accent-glow-rgb': toRgbString(hexToRgb(glow)),
    '--accent-contrast-rgb': toRgbString(hexToRgb(contrast)),
    '--accent-secondary-rgb': toRgbString(hexToRgb(secondary)),
    '--accent-tertiary-rgb': toRgbString(hexToRgb(tertiary)),
    '--accent-quaternary-rgb': toRgbString(hexToRgb(quaternary)),
    '--accent-indigo-rgb': toRgbString(hexToRgb(indigo)),
    '--accent-sky-rgb': toRgbString(hexToRgb(sky)),
    '--accent-cool-rgb': toRgbString(hexToRgb(cool))
  }
}

export function buildIntelligentThemeTokens(palette: string[]): Record<string, string> {
  const fallback = THEME_TOKENS.dark

  if (!palette || palette.length === 0) {
    return { ...fallback }
  }

  const primary = palette[0]
  const secondary = palette[1] || primary
  const tertiary = palette[2] || secondary

  const surfacePalette = createSurfacePalette(primary)
  const surfaceTokens: Record<string, string> = {}
  SURFACE_VARIABLES.forEach((variable, index) => {
    surfaceTokens[variable] = surfacePalette[index]?.rgb || DARK_SURFACE_VALUES[index]
  })

  const accentTokens = createAccentPalette(primary, secondary, tertiary)

  const baseRgb = hexToRgb(primary) ?? { r: 56, g: 189, b: 248 }
  const baseHsl = rgbToHsl(baseRgb.r, baseRgb.g, baseRgb.b)
  const bgLightness = clamp(baseHsl.l * 0.08, 0.02, 0.06)
  const { r: bgR, g: bgG, b: bgB } = hslToRgb(baseHsl.h, clamp(baseHsl.s * 0.7, 0.3, 0.8), bgLightness)
  const bgHex = rgbToHex(bgR, bgG, bgB)

  return {
    ...surfaceTokens,
    ...accentTokens,
    ...BASE_STATUS_TOKENS,
    '--surface-contrast-rgb': '30, 41, 59',
    '--bg': bgHex,
    '--bg-accent': `radial-gradient(circle at top right, rgba(var(--accent-glow-rgb), 0.18), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-sky-rgb), 0.16), transparent 50%), ${bgHex}`,
    '--card': 'rgba(var(--surface-8-rgb), 0.82)',
    '--card-border': 'rgba(var(--text-muted-rgb), 0.18)',
    '--text': '#f8fafc',
    '--text-muted': '#94a3b8',
    '--text-rgb': '248, 250, 252',
    '--text-muted-rgb': '148, 163, 184',
    '--text-soft-rgb': '226, 232, 240',
    '--neutral-strong-rgb': '100, 116, 139',
    '--highlight': primary,
    '--highlight-strong': secondary,
    '--shadow': '0 24px 48px -28px rgba(var(--surface-10-rgb), 0.95)'
  }
}
