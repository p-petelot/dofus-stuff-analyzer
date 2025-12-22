// Theme controller extracted for shared use across the navbar and legacy pages.
// This is largely duplicated from the existing page implementation so the
// navbar can drive the same theming tokens without rewriting the original page.

export const THEME_KEYS = Object.freeze({
  DARK: "dark",
  LIGHT: "light",
  DOFUS: "dofus",
  INTELLIGENT: "intelligent",
});

export const THEME_STORAGE_KEY = "krospalette.theme";
export const DEFAULT_THEME_KEY = THEME_KEYS.DARK;

export const THEME_OPTIONS = [
  { key: THEME_KEYS.DARK, icon: "🌙", labelKey: "theme.option.dark" },
  { key: THEME_KEYS.LIGHT, icon: "☀️", labelKey: "theme.option.light" },
  { key: THEME_KEYS.DOFUS, icon: "🍃", labelKey: "theme.option.dofus" },
  { key: THEME_KEYS.INTELLIGENT, icon: "🧠", labelKey: "theme.option.intelligent" },
];

const SURFACE_VARIABLES = [
  "--surface-1-rgb",
  "--surface-2-rgb",
  "--surface-3-rgb",
  "--surface-4-rgb",
  "--surface-5-rgb",
  "--surface-6-rgb",
  "--surface-7-rgb",
  "--surface-8-rgb",
  "--surface-9-rgb",
  "--surface-10-rgb",
  "--surface-11-rgb",
];

const DARK_SURFACE_VALUES = [
  "5, 8, 22",
  "7, 12, 28",
  "8, 12, 26",
  "8, 12, 28",
  "9, 13, 28",
  "9, 14, 32",
  "10, 17, 32",
  "10, 17, 40",
  "13, 20, 38",
  "15, 23, 42",
  "17, 24, 39",
];

const LIGHT_SURFACE_VALUES = [
  "232, 239, 248",
  "224, 232, 244",
  "216, 226, 240",
  "208, 219, 236",
  "200, 212, 232",
  "192, 205, 228",
  "186, 200, 224",
  "180, 196, 222",
  "174, 191, 218",
  "168, 186, 214",
  "160, 180, 210",
];

const DOFUS_SURFACE_VALUES = [
  "4, 18, 12",
  "6, 24, 16",
  "8, 30, 20",
  "10, 36, 24",
  "12, 42, 28",
  "14, 48, 32",
  "16, 54, 36",
  "18, 60, 40",
  "20, 66, 44",
  "24, 72, 48",
  "28, 78, 52",
];

const DARK_ACCENT_VALUES = {
  "--accent-primary-rgb": "139, 92, 246",
  "--accent-strong-rgb": "168, 85, 247",
  "--accent-soft-rgb": "192, 132, 252",
  "--accent-glow-rgb": "123, 97, 255",
  "--accent-contrast-rgb": "129, 140, 248",
  "--accent-secondary-rgb": "56, 189, 248",
  "--accent-tertiary-rgb": "59, 130, 246",
  "--accent-quaternary-rgb": "96, 165, 250",
  "--accent-indigo-rgb": "99, 102, 241",
  "--accent-sky-rgb": "14, 165, 233",
  "--accent-cool-rgb": "129, 199, 255",
};

const LIGHT_ACCENT_VALUES = {
  "--accent-primary-rgb": "131, 97, 246",
  "--accent-strong-rgb": "112, 67, 228",
  "--accent-soft-rgb": "188, 176, 252",
  "--accent-glow-rgb": "139, 104, 244",
  "--accent-contrast-rgb": "72, 50, 184",
  "--accent-secondary-rgb": "64, 156, 232",
  "--accent-tertiary-rgb": "59, 180, 245",
  "--accent-quaternary-rgb": "52, 152, 242",
  "--accent-indigo-rgb": "90, 94, 232",
  "--accent-sky-rgb": "72, 180, 242",
  "--accent-cool-rgb": "138, 204, 255",
};

const DOFUS_ACCENT_VALUES = {
  "--accent-primary-rgb": "34, 197, 94",
  "--accent-strong-rgb": "21, 128, 61",
  "--accent-soft-rgb": "74, 222, 128",
  "--accent-glow-rgb": "134, 239, 172",
  "--accent-contrast-rgb": "13, 148, 136",
  "--accent-secondary-rgb": "34, 197, 94",
  "--accent-tertiary-rgb": "45, 212, 191",
  "--accent-quaternary-rgb": "16, 185, 129",
  "--accent-indigo-rgb": "16, 185, 129",
  "--accent-sky-rgb": "45, 212, 191",
  "--accent-cool-rgb": "134, 239, 172",
};

function buildSurfaceTokens(values: string[], fallbackValues = DARK_SURFACE_VALUES) {
  const resolved = Array.isArray(values) && values.length === SURFACE_VARIABLES.length
    ? values
    : fallbackValues;

  return SURFACE_VARIABLES.reduce<Record<string, string>>((tokens, variable, index) => {
    const value = resolved[index] ?? fallbackValues[index];
    tokens[variable] = value;
    return tokens;
  }, {});
}

const STATIC_THEME_TOKENS: Record<string, Record<string, string>> = {
  [THEME_KEYS.DARK]: {
    ...buildSurfaceTokens(DARK_SURFACE_VALUES),
    "--surface-contrast-rgb": "17, 24, 39",
    "--bg": "#050816",
    "--bg-accent": "radial-gradient(circle at top right, rgba(var(--accent-glow-rgb), 0.18), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-sky-rgb), 0.16), transparent 50%), #050816",
    "--card": "rgba(var(--surface-8-rgb), 0.82)",
    "--card-border": "rgba(var(--text-muted-rgb), 0.24)",
    "--navbar-surface": "rgba(var(--surface-8-rgb), 0.88)",
    "--navbar-border": "rgba(var(--text-muted-rgb), 0.2)",
    "--navbar-shadow": "0 30px 74px -40px rgba(3, 7, 18, 0.78)",
    "--navbar-text": "#f8fafc",
    "--navbar-muted": "rgba(var(--text-soft-rgb), 0.72)",
    "--navbar-icon": "rgba(var(--text-soft-rgb), 0.7)",
    "--navbar-overlay": "rgba(8, 11, 19, 0.7)",
    "--mobile-panel": "rgba(var(--surface-9-rgb), 0.92)",
    "--mobile-panel-strong": "rgba(var(--surface-10-rgb), 0.86)",
    "--text": "#f8fafc",
    "--text-muted": "#94a3b8",
    "--text-rgb": "248, 250, 252",
    "--text-muted-rgb": "148, 163, 184",
    "--text-soft-rgb": "203, 213, 225",
    "--neutral-strong-rgb": "148, 163, 184",
    "--highlight": "#a855f7",
    "--highlight-strong": "#6366f1",
    "--shadow": "0 24px 48px -28px rgba(var(--surface-10-rgb), 0.9)",
    ...DARK_ACCENT_VALUES,
    "--success-rgb": "34, 197, 94",
    "--success-strong-rgb": "16, 185, 129",
    "--success-soft-rgb": "45, 212, 191",
    "--success-pale-rgb": "134, 239, 172",
    "--warning-rgb": "245, 158, 11",
    "--warning-strong-rgb": "250, 204, 21",
    "--warning-soft-rgb": "234, 179, 8",
    "--danger-rgb": "248, 113, 113",
    "--danger-strong-rgb": "239, 68, 68",
    "--danger-dark-rgb": "127, 29, 29",
    "--frost-rgb": "148, 163, 184",
    "--white-rgb": "255, 255, 255",
    "--logo-primary": "#0d3a29",
    "--logo-secondary": "#13845b",
    "--logo-depth": "#05251b",
    "--logo-highlight": "#f3cf6b",
    "--logo-highlight-strong": "#c9982e",
    "--logo-shadow": "rgba(6, 13, 19, 0.55)",
  },
  [THEME_KEYS.LIGHT]: {
    ...buildSurfaceTokens(LIGHT_SURFACE_VALUES, LIGHT_SURFACE_VALUES),
    "--surface-contrast-rgb": "41, 46, 66",
    "--bg": "#e6edf6",
    "--bg-accent": "radial-gradient(circle at top right, rgba(var(--accent-primary-rgb), 0.12), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-strong-rgb), 0.12), transparent 52%), #e6edf6",
    "--card": "rgba(var(--surface-8-rgb), 0.92)",
    "--card-border": "rgba(var(--text-muted-rgb), 0.26)",
    "--navbar-surface": "rgba(var(--surface-9-rgb), 0.94)",
    "--navbar-border": "rgba(15, 23, 42, 0.12)",
    "--navbar-shadow": "0 26px 56px -36px rgba(15, 23, 42, 0.22)",
    "--navbar-text": "#0f172a",
    "--navbar-muted": "rgba(71, 85, 105, 0.78)",
    "--navbar-icon": "rgba(71, 85, 105, 0.76)",
    "--navbar-overlay": "rgba(15, 23, 42, 0.45)",
    "--mobile-panel": "rgba(var(--surface-9-rgb), 0.9)",
    "--mobile-panel-strong": "rgba(var(--surface-10-rgb), 0.86)",
    "--text": "#0f172a",
    "--text-muted": "#334155",
    "--text-rgb": "15, 23, 42",
    "--text-muted-rgb": "51, 65, 85",
    "--text-soft-rgb": "94, 106, 132",
    "--neutral-strong-rgb": "74, 88, 110",
    "--highlight": "#8b5cf6",
    "--highlight-strong": "#6366f1",
    "--shadow": "0 24px 48px -28px rgba(var(--surface-10-rgb), 0.26)",
    ...LIGHT_ACCENT_VALUES,
    "--success-rgb": "34, 197, 94",
    "--success-strong-rgb": "16, 185, 129",
    "--success-soft-rgb": "45, 212, 191",
    "--success-pale-rgb": "134, 239, 172",
    "--warning-rgb": "245, 158, 11",
    "--warning-strong-rgb": "250, 204, 21",
    "--warning-soft-rgb": "234, 179, 8",
    "--danger-rgb": "248, 113, 113",
    "--danger-strong-rgb": "239, 68, 68",
    "--danger-dark-rgb": "127, 29, 29",
    "--frost-rgb": "71, 85, 105",
    "--white-rgb": "255, 255, 255",
    "--logo-primary": "#0b3627",
    "--logo-secondary": "#0f6c4b",
    "--logo-depth": "#05261c",
    "--logo-highlight": "#d9a840",
    "--logo-highlight-strong": "#b57a16",
    "--logo-shadow": "rgba(20, 46, 38, 0.28)",
  },
  [THEME_KEYS.DOFUS]: {
    ...buildSurfaceTokens(DOFUS_SURFACE_VALUES, DOFUS_SURFACE_VALUES),
    "--surface-contrast-rgb": "41, 46, 66",
    "--bg": "#04160f",
    "--bg-accent": "radial-gradient(circle at top right, rgba(var(--accent-primary-rgb), 0.22), transparent 55%), radial-gradient(circle at bottom left, rgba(var(--accent-strong-rgb), 0.16), transparent 48%), #04160f",
    "--card": "rgba(var(--surface-8-rgb), 0.88)",
    "--card-border": "rgba(var(--text-muted-rgb), 0.28)",
    "--navbar-surface": "rgba(var(--surface-8-rgb), 0.88)",
    "--navbar-border": "rgba(34, 197, 94, 0.26)",
    "--navbar-shadow": "0 24px 52px -32px rgba(4, 22, 15, 0.68)",
    "--navbar-text": "#f6fff4",
    "--navbar-muted": "rgba(var(--text-soft-rgb), 0.8)",
    "--navbar-icon": "rgba(var(--text-soft-rgb), 0.78)",
    "--navbar-overlay": "rgba(2, 9, 6, 0.7)",
    "--mobile-panel": "rgba(var(--surface-9-rgb), 0.9)",
    "--mobile-panel-strong": "rgba(var(--surface-10-rgb), 0.86)",
    "--text": "#f6fff4",
    "--text-muted": "#bdecc5",
    "--text-rgb": "246, 255, 244",
    "--text-muted-rgb": "189, 236, 197",
    "--text-soft-rgb": "214, 242, 220",
    "--neutral-strong-rgb": "112, 154, 126",
    "--highlight": "#22c55e",
    "--highlight-strong": "#84cc16",
    "--shadow": "0 24px 48px -28px rgba(var(--surface-10-rgb), 0.82)",
    ...DOFUS_ACCENT_VALUES,
    "--success-rgb": "34, 197, 94",
    "--success-strong-rgb": "16, 185, 129",
    "--success-soft-rgb": "45, 212, 191",
    "--success-pale-rgb": "134, 239, 172",
    "--warning-rgb": "245, 158, 11",
    "--warning-strong-rgb": "250, 204, 21",
    "--warning-soft-rgb": "234, 179, 8",
    "--danger-rgb": "248, 113, 113",
    "--danger-strong-rgb": "239, 68, 68",
    "--danger-dark-rgb": "127, 29, 29",
    "--frost-rgb": "112, 154, 126",
    "--white-rgb": "255, 255, 255",
    "--logo-primary": "#0a583d",
    "--logo-secondary": "#0fb071",
    "--logo-depth": "#043425",
    "--logo-highlight": "#f6d676",
    "--logo-highlight-strong": "#d2a542",
    "--logo-shadow": "rgba(4, 26, 18, 0.6)",
  },
};

const VALID_THEME_KEYS = new Set(Object.values(THEME_KEYS));

export function loadStoredTheme() {
  if (typeof window === "undefined") return DEFAULT_THEME_KEY;
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (stored && VALID_THEME_KEYS.has(stored)) {
    return stored;
  }
  return DEFAULT_THEME_KEY;
}

export function persistTheme(themeKey: string) {
  if (typeof window === "undefined") return;
  if (!VALID_THEME_KEYS.has(themeKey)) return;
  window.localStorage.setItem(THEME_STORAGE_KEY, themeKey);
}

export function applyThemeToDocument(themeKey: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const safeTheme = VALID_THEME_KEYS.has(themeKey) ? themeKey : DEFAULT_THEME_KEY;
  root.setAttribute("data-theme", safeTheme);
  const tokens = STATIC_THEME_TOKENS[safeTheme] ?? STATIC_THEME_TOKENS[DEFAULT_THEME_KEY];
  Object.entries(tokens).forEach(([key, value]) => root.style.setProperty(key, value));
}
