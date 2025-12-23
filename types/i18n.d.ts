declare module "../../lib/i18n" {
  export const DEFAULT_LANGUAGE: string;
  export const SUPPORTED_LANGUAGES: Record<
    string,
    { label: string; locales?: string[] }
  >;
  export function normalizeLanguage(input?: string | null): string | null;
  export function getLanguagePriority(language?: string): string[];
  export function translate(
    language: string | null | undefined,
    key: string,
    params?: Record<string, unknown>,
    fallback?: string,
  ): string;
}
