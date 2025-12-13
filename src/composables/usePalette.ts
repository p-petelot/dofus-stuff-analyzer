import { ref, computed } from 'vue'
import type { PaletteColor, ExtractedPalette } from '@/types'
import { hexToRgb, rgbToLab } from '@/lib/colors/utils'

export function usePalette() {
  const extractedPalette = ref<ExtractedPalette | null>(null)
  const isExtracting = ref(false)
  const error = ref<string | null>(null)

  const colors = computed(() => extractedPalette.value?.all || [])
  const primaryColor = computed(() => extractedPalette.value?.primary || null)
  const secondaryColor = computed(() => extractedPalette.value?.secondary || null)
  const tertiaryColor = computed(() => extractedPalette.value?.tertiary || null)

  async function extractFromImage(imageData: ImageData): Promise<ExtractedPalette> {
    isExtracting.value = true
    error.value = null

    try {
      const palette = await analyzeImageColors(imageData)
      extractedPalette.value = palette
      return palette
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to extract palette'
      throw err
    } finally {
      isExtracting.value = false
    }
  }

  function setPalette(palette: ExtractedPalette) {
    extractedPalette.value = palette
  }

  function clearPalette() {
    extractedPalette.value = null
    error.value = null
  }

  return {
    extractedPalette,
    colors,
    primaryColor,
    secondaryColor,
    tertiaryColor,
    isExtracting,
    error,
    extractFromImage,
    setPalette,
    clearPalette
  }
}

// Helper function to analyze image colors
async function analyzeImageColors(imageData: ImageData): Promise<ExtractedPalette> {
  const { data, width, height } = imageData
  const colorCounts = new Map<string, number>()

  // Sample pixels (skip every 4th pixel for performance)
  for (let i = 0; i < data.length; i += 16) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]

    // Skip transparent pixels
    if (a < 128) continue

    // Quantize colors to reduce noise
    const qr = Math.round(r / 16) * 16
    const qg = Math.round(g / 16) * 16
    const qb = Math.round(b / 16) * 16

    const key = `${qr},${qg},${qb}`
    colorCounts.set(key, (colorCounts.get(key) || 0) + 1)
  }

  // Sort by frequency
  const sortedColors = Array.from(colorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  // Convert to PaletteColor
  const paletteColors: PaletteColor[] = sortedColors.map(([key]) => {
    const [r, g, b] = key.split(',').map(Number)
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    const rgb = { r, g, b }
    const lab = rgbToLab(r, g, b)
    return { hex, rgb, lab }
  })

  // Ensure we have at least 3 colors
  while (paletteColors.length < 3) {
    paletteColors.push({
      hex: '#808080',
      rgb: { r: 128, g: 128, b: 128 },
      lab: rgbToLab(128, 128, 128)
    })
  }

  return {
    primary: paletteColors[0],
    secondary: paletteColors[1],
    tertiary: paletteColors[2],
    all: paletteColors
  }
}
