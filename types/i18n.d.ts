declare module "../../lib/i18n" {
  export type LanguageOption = {
    code: string;
    label: string;
    accessibleLabel?: string;
    flag: string;
  };

  export type LanguageContextValue = {
    language: string;
    languages: LanguageOption[];
    setLanguage: (code: string) => void;
    t: (key: string, params?: Record<string, unknown>, fallback?: string) => string;
  };

  export function useLanguage(): LanguageContextValue;
}
