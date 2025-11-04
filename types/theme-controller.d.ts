declare module "../../lib/theme-controller" {
  export const THEME_KEYS: {
    readonly DARK: "dark";
    readonly LIGHT: "light";
    readonly DOFUS: "dofus";
    readonly INTELLIGENT: "intelligent";
  };

  export type ThemeKey = (typeof THEME_KEYS)[keyof typeof THEME_KEYS];

  export const THEME_STORAGE_KEY: string;
  export const DEFAULT_THEME_KEY: ThemeKey;

  export type ThemeOption = {
    key: ThemeKey;
    icon: string;
    labelKey: string;
  };

  export const THEME_OPTIONS: ThemeOption[];

  export function isValidThemeKey(value: unknown): value is ThemeKey;
  export function applyThemeToDocument(themeKey: ThemeKey, palette?: string[] | null): void;
  export function buildIntelligentThemeTokens(palette?: string[] | null): Record<string, string>;
  export function normalizeColorToHex(color: unknown): string | null;
  export function adjustHexLightness(hex: string, deltaL: number, deltaS?: number): string;
  export function hexToRgb(hex: string): { r: number; g: number; b: number } | null;
  export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number };
  export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number };
  export function clamp(value: number, min: number, max: number): number;
  export function loadStoredTheme(): ThemeKey;
  export function persistTheme(themeKey: ThemeKey): void;
}
