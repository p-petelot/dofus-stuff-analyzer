import type { RgbColor, LabColor } from '@/types'

export function hexToRgb(hex: string): RgbColor | null {
  if (!hex || typeof hex !== 'string') return null

  const cleaned = hex.replace(/^#/, '')
  if (!/^[0-9A-Fa-f]{6}$/.test(cleaned)) return null

  const num = parseInt(cleaned, 16)
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  }
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255

  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  const l = (max + min) / 2

  let h = 0
  let s = 0

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

    switch (max) {
      case rNorm:
        h = ((gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0)) / 6
        break
      case gNorm:
        h = ((bNorm - rNorm) / d + 2) / 6
        break
      case bNorm:
        h = ((rNorm - gNorm) / d + 4) / 6
        break
    }
  }

  return { h, s, l }
}

export function hslToRgb(h: number, s: number, l: number): RgbColor {
  let r: number, g: number, b: number

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  }
}

export function rgbToLab(r: number, g: number, b: number): LabColor {
  // Convert RGB to XYZ
  let rNorm = r / 255
  let gNorm = g / 255
  let bNorm = b / 255

  rNorm = rNorm > 0.04045 ? Math.pow((rNorm + 0.055) / 1.055, 2.4) : rNorm / 12.92
  gNorm = gNorm > 0.04045 ? Math.pow((gNorm + 0.055) / 1.055, 2.4) : gNorm / 12.92
  bNorm = bNorm > 0.04045 ? Math.pow((bNorm + 0.055) / 1.055, 2.4) : bNorm / 12.92

  rNorm *= 100
  gNorm *= 100
  bNorm *= 100

  // Observer = 2°, Illuminant = D65
  let x = rNorm * 0.4124 + gNorm * 0.3576 + bNorm * 0.1805
  let y = rNorm * 0.2126 + gNorm * 0.7152 + bNorm * 0.0722
  let z = rNorm * 0.0193 + gNorm * 0.1192 + bNorm * 0.9505

  // Reference white D65
  x /= 95.047
  y /= 100.0
  z /= 108.883

  x = x > 0.008856 ? Math.pow(x, 1 / 3) : 7.787 * x + 16 / 116
  y = y > 0.008856 ? Math.pow(y, 1 / 3) : 7.787 * y + 16 / 116
  z = z > 0.008856 ? Math.pow(z, 1 / 3) : 7.787 * z + 16 / 116

  return {
    l: 116 * y - 16,
    a: 500 * (x - y),
    b: 200 * (y - z)
  }
}

export function deltaE2000(lab1: LabColor, lab2: LabColor): number {
  const L1 = lab1.l,
    a1 = lab1.a,
    b1 = lab1.b
  const L2 = lab2.l,
    a2 = lab2.a,
    b2 = lab2.b

  const kL = 1,
    kC = 1,
    kH = 1

  const C1 = Math.sqrt(a1 * a1 + b1 * b1)
  const C2 = Math.sqrt(a2 * a2 + b2 * b2)
  const Cab = (C1 + C2) / 2

  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cab, 7) / (Math.pow(Cab, 7) + Math.pow(25, 7))))

  const a1Prime = a1 * (1 + G)
  const a2Prime = a2 * (1 + G)

  const C1Prime = Math.sqrt(a1Prime * a1Prime + b1 * b1)
  const C2Prime = Math.sqrt(a2Prime * a2Prime + b2 * b2)

  const h1Prime = Math.atan2(b1, a1Prime) * (180 / Math.PI)
  const h2Prime = Math.atan2(b2, a2Prime) * (180 / Math.PI)

  const h1PrimeAdj = h1Prime < 0 ? h1Prime + 360 : h1Prime
  const h2PrimeAdj = h2Prime < 0 ? h2Prime + 360 : h2Prime

  const deltaLPrime = L2 - L1
  const deltaCPrime = C2Prime - C1Prime

  let deltahPrime: number
  if (C1Prime * C2Prime === 0) {
    deltahPrime = 0
  } else if (Math.abs(h2PrimeAdj - h1PrimeAdj) <= 180) {
    deltahPrime = h2PrimeAdj - h1PrimeAdj
  } else if (h2PrimeAdj - h1PrimeAdj > 180) {
    deltahPrime = h2PrimeAdj - h1PrimeAdj - 360
  } else {
    deltahPrime = h2PrimeAdj - h1PrimeAdj + 360
  }

  const deltaHPrime = 2 * Math.sqrt(C1Prime * C2Prime) * Math.sin((deltahPrime * Math.PI) / 360)

  const LPrimeBar = (L1 + L2) / 2
  const CPrimeBar = (C1Prime + C2Prime) / 2

  let hPrimeBar: number
  if (C1Prime * C2Prime === 0) {
    hPrimeBar = h1PrimeAdj + h2PrimeAdj
  } else if (Math.abs(h1PrimeAdj - h2PrimeAdj) <= 180) {
    hPrimeBar = (h1PrimeAdj + h2PrimeAdj) / 2
  } else if (h1PrimeAdj + h2PrimeAdj < 360) {
    hPrimeBar = (h1PrimeAdj + h2PrimeAdj + 360) / 2
  } else {
    hPrimeBar = (h1PrimeAdj + h2PrimeAdj - 360) / 2
  }

  const T =
    1 -
    0.17 * Math.cos(((hPrimeBar - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hPrimeBar * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hPrimeBar + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hPrimeBar - 63) * Math.PI) / 180)

  const deltaTheta = 30 * Math.exp(-Math.pow((hPrimeBar - 275) / 25, 2))
  const RC = 2 * Math.sqrt(Math.pow(CPrimeBar, 7) / (Math.pow(CPrimeBar, 7) + Math.pow(25, 7)))
  const SL = 1 + (0.015 * Math.pow(LPrimeBar - 50, 2)) / Math.sqrt(20 + Math.pow(LPrimeBar - 50, 2))
  const SC = 1 + 0.045 * CPrimeBar
  const SH = 1 + 0.015 * CPrimeBar * T
  const RT = -Math.sin((2 * deltaTheta * Math.PI) / 180) * RC

  const deltaE = Math.sqrt(
    Math.pow(deltaLPrime / (kL * SL), 2) +
      Math.pow(deltaCPrime / (kC * SC), 2) +
      Math.pow(deltaHPrime / (kH * SH), 2) +
      RT * (deltaCPrime / (kC * SC)) * (deltaHPrime / (kH * SH))
  )

  return deltaE
}

export function adjustHexLightness(hex: string, lightnessOffset: number, saturationOffset: number = 0): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b)
  const newL = Math.max(0, Math.min(1, hsl.l + lightnessOffset))
  const newS = Math.max(0, Math.min(1, hsl.s + saturationOffset))
  const newRgb = hslToRgb(hsl.h, newS, newL)

  return rgbToHex(newRgb.r, newRgb.g, newRgb.b)
}

export function normalizeColorToHex(color: string | RgbColor | null): string | null {
  if (!color) return null

  if (typeof color === 'string') {
    if (color.startsWith('#')) {
      return hexToRgb(color) ? color : null
    }
    // Try to parse rgb string
    const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
    if (match) {
      return rgbToHex(parseInt(match[1]), parseInt(match[2]), parseInt(match[3]))
    }
    return null
  }

  return rgbToHex(color.r, color.g, color.b)
}
