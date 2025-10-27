import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_THEME_KEY, THEME_STORAGE_KEY, applyThemeToDocument, isValidThemeKey } from "./theme";

const ThemeContext = createContext({
  theme: DEFAULT_THEME_KEY,
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(DEFAULT_THEME_KEY);
  const isHydratedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && isValidThemeKey(stored)) {
        setThemeState(stored);
      }
    } catch (error) {
      console.error(error);
    }
    isHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!isHydratedRef.current || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch (error) {
      console.error(error);
    }
  }, [theme]);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const setTheme = useCallback((nextTheme) => {
    const normalized = isValidThemeKey(nextTheme) ? nextTheme : DEFAULT_THEME_KEY;
    setThemeState((current) => (current === normalized ? current : normalized));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
    }),
    [setTheme, theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
