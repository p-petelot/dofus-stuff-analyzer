import Link from "next/link";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { BRAND_NAME } from "../lib/constants";
import { useLanguage } from "../lib/i18n";
import { useTheme } from "../lib/themeContext";
import { THEME_OPTIONS } from "../lib/theme";

const NAV_LINKS = [
  { href: "/", labelKey: "navigation.home", fallback: "Accueil" },
  { href: "/test", labelKey: "navigation.test", fallback: "Page test" },
];

export default function AppHeader({ onSelectLanguage, onSelectTheme }) {
  const router = useRouter();
  const { language, languages, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
  const handleTheme = onSelectTheme ?? setTheme;
  const handleLanguage = onSelectLanguage ?? setLanguage;

  const tagline = useMemo(() => {
    const raw = t("brand.tagline");
    return typeof raw === "string" ? raw.trim() : "";
  }, [t]);

  const navItems = useMemo(
    () =>
      NAV_LINKS.map((link) => {
        const label = t(link.labelKey, undefined, link.fallback);
        const normalized = typeof label === "string" && label.trim().length ? label : link.fallback;
        return { ...link, label: normalized };
      }),
    [t]
  );

  const themeOptions = useMemo(
    () =>
      THEME_OPTIONS.map((option) => {
        const label = t(option.labelKey);
        const normalized = typeof label === "string" && label.trim().length ? label : option.labelKey;
        return {
          ...option,
          label: normalized,
          accessibleLabel: normalized,
        };
      }),
    [t]
  );

  const languageOptions = useMemo(() => languages ?? [], [languages]);

  const themeSelectorLabel = t("theme.selectorAria", undefined, "Choisir le thème");
  const languageSelectorLabel = t("language.selectorAria", undefined, "Choisir la langue de l'interface");
  const navigationLabel = t("navigation.menuAria", undefined, "Navigation principale");

  return (
    <header className="app-header">
      <div className="app-header__inner">
        <Link href="/" className="app-header__brand">
          <span className="app-header__logo">{BRAND_NAME}</span>
          {tagline ? <span className="app-header__tagline">{tagline}</span> : null}
        </Link>
        <nav className="app-header__nav" aria-label={navigationLabel}>
          <ul className="app-header__menu">
            {navItems.map((item) => {
              const isActive = router.pathname === item.href;
              return (
                <li key={item.href} className="app-header__menu-item">
                  <Link
                    href={item.href}
                    className={`app-header__menu-link${isActive ? " is-active" : ""}`}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span className="app-header__menu-label">{item.label}</span>
                    <span className="app-header__menu-underline" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="app-header__controls">
          <div className="theme-switcher" role="radiogroup" aria-label={themeSelectorLabel}>
            {themeOptions.map((option) => {
              const isActive = option.key === theme;
              return (
                <button
                  key={option.key}
                  type="button"
                  className={`theme-switcher__option${isActive ? " is-active" : ""}`}
                  onClick={() => handleTheme(option.key)}
                  role="radio"
                  aria-checked={isActive}
                  aria-label={option.accessibleLabel}
                  title={option.accessibleLabel}
                >
                  <span className="theme-switcher__icon" aria-hidden="true">
                    {option.icon}
                  </span>
                  <span className="theme-switcher__label" aria-hidden="true">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="language-switcher" role="group" aria-label={languageSelectorLabel}>
            {languageOptions.map((option) => {
              const isActive = option.code === language;
              return (
                <button
                  key={option.code}
                  type="button"
                  className={`language-switcher__option${isActive ? " is-active" : ""}`}
                  onClick={() => handleLanguage(option.code)}
                  aria-pressed={isActive}
                  aria-label={option.accessibleLabel}
                  title={option.accessibleLabel}
                >
                  <span className="language-switcher__flag" aria-hidden="true">
                    <img src={option.flag} alt="" loading="lazy" />
                  </span>
                  <span className="language-switcher__code" aria-hidden="true">
                    {option.shortLabel ?? option.code.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </header>
  );
}
