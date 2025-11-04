"use client";

import Link from "next/link";
import Router from "next/router";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
} from "react";
import { useLanguage } from "../../lib/i18n";
import {
  DEFAULT_THEME_KEY,
  THEME_OPTIONS,
  THEME_KEYS,
  applyThemeToDocument,
  loadStoredTheme,
  persistTheme,
} from "../../lib/theme-controller";
import { useLockBody } from "./hooks/useLockBody";
import { SearchCommand } from "./SearchCommand";
import type { NavBrand, NavLink } from "./types";
import styles from "./Navbar.module.css";

interface NavbarProps {
  brand: NavBrand;
  links: NavLink[];
  enableSearch?: boolean;
  enableThemeToggle?: boolean;
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type ThemeKey = typeof THEME_KEYS[keyof typeof THEME_KEYS];

export function Navbar({
  brand,
  links,
  enableSearch = false,
  enableThemeToggle = false,
  className,
}: NavbarProps) {
  const [activePath, setActivePath] = useState<string>(() =>
    typeof window === "undefined" ? "/" : window.location.pathname
  );
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeKey>(() => DEFAULT_THEME_KEY);
  const [indicator, setIndicator] = useState({
    width: 0,
    left: 0,
    opacity: 0,
  });

  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const navListRef = useRef<HTMLUListElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const themeTriggerRef = useRef<HTMLButtonElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);
  const languageTriggerRef = useRef<HTMLButtonElement>(null);
  const dropdownIntentRef = useRef<number | null>(null);
  const indicatorTargetRef = useRef<HTMLElement | null>(null);

  const { language, languages: languageOptions, setLanguage, t } = useLanguage();
  const gradientId = useId();
  const resolvedLinks = useMemo(() => links, [links]);

  const closePreferenceMenus = useCallback(() => {
    setThemeMenuOpen(false);
    setLanguageMenuOpen(false);
  }, []);

  const clearDropdownIntent = useCallback(() => {
    if (dropdownIntentRef.current !== null) {
      window.clearTimeout(dropdownIntentRef.current);
      dropdownIntentRef.current = null;
    }
  }, []);

  const openDropdown = useCallback(
    (href: string | null) => {
      clearDropdownIntent();
      setDropdownOpen(href);
    },
    [clearDropdownIntent]
  );

  const closeDropdown = useCallback(() => {
    clearDropdownIntent();
    setDropdownOpen(null);
  }, [clearDropdownIntent]);

  const scheduleDropdownClose = useCallback(() => {
    clearDropdownIntent();
    dropdownIntentRef.current = window.setTimeout(() => {
      setDropdownOpen(null);
      dropdownIntentRef.current = null;
    }, 320);
  }, [clearDropdownIntent]);

  const updateIndicator = useCallback((element: HTMLElement | null) => {
    if (typeof window === "undefined") {
      return;
    }

    if (!navListRef.current) {
      indicatorTargetRef.current = element;
      return;
    }

    if (!element) {
      indicatorTargetRef.current = null;
      setIndicator((prev) => ({ ...prev, opacity: 0 }));
      return;
    }

    indicatorTargetRef.current = element;
    const listRect = navListRef.current.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    setIndicator({
      width: elementRect.width,
      left: elementRect.left - listRect.left,
      opacity: 1,
    });
  }, []);

  const resetIndicatorToActive = useCallback(() => {
    if (!navListRef.current) {
      return;
    }
    const activeElement = navListRef.current.querySelector<HTMLElement>(
      '[data-active-link="true"]'
    );
    updateIndicator(activeElement ?? null);
  }, [updateIndicator]);

  useLockBody(mobileOpen || searchOpen);

  useEffect(() => {
    return () => clearDropdownIntent();
  }, [clearDropdownIntent]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const parsePath = (url: string) => {
      try {
        const parsed = new URL(url, window.location.origin);
        return parsed.pathname;
      } catch {
        return url.startsWith("/") ? url : `/${url}`;
      }
    };

    const updatePath = (url?: string) => {
      const nextPath = url ? parsePath(url) : window.location.pathname;
      setActivePath(nextPath);
    };

    const handleRouteChange = (url: string) => {
      updatePath(url);
      closePreferenceMenus();
      setDropdownOpen(null);
      setMobileOpen(false);
      setMobileSection(null);
      setSearchOpen(false);
    };

    const handlePopState = () => updatePath();

    updatePath();

    Router.events?.on("routeChangeComplete", handleRouteChange);
    Router.events?.on("hashChangeComplete", handleRouteChange);
    window.addEventListener("popstate", handlePopState);

    const originalPushState = window.history.pushState;
    const originalReplaceState = window.history.replaceState;

    const wrapHistory = (
      original: typeof window.history.pushState
    ): typeof window.history.pushState =>
      function patched(this: History, ...args) {
        const result = original.apply(this, args);
        updatePath();
        return result;
      };

    window.history.pushState = wrapHistory(originalPushState);
    window.history.replaceState = wrapHistory(originalReplaceState);

    return () => {
      Router.events?.off("routeChangeComplete", handleRouteChange);
      Router.events?.off("hashChangeComplete", handleRouteChange);
      window.removeEventListener("popstate", handlePopState);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleResize = () => {
      if (indicatorTargetRef.current) {
        updateIndicator(indicatorTargetRef.current);
      } else {
        resetIndicatorToActive();
      }
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [resetIndicatorToActive, updateIndicator]);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    resetIndicatorToActive();
  }, [activePath, resetIndicatorToActive, resolvedLinks]);

  useEffect(() => {
    if (!enableThemeToggle) {
      return;
    }
    const stored = loadStoredTheme();
    setTheme(stored);
  }, [enableThemeToggle]);

  useEffect(() => {
    if (!enableThemeToggle) {
      return;
    }
    applyThemeToDocument(theme);
    persistTheme(theme);
  }, [enableThemeToggle, theme]);

  useEffect(() => {
    if (!themeMenuOpen && !languageMenuOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const withinTheme =
        themeMenuRef.current?.contains(target) ||
        themeTriggerRef.current?.contains(target);
      const withinLanguage =
        languageMenuRef.current?.contains(target) ||
        languageTriggerRef.current?.contains(target);
      if (withinTheme || withinLanguage) {
        return;
      }
      closePreferenceMenus();
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePreferenceMenus();
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [closePreferenceMenus, languageMenuOpen, themeMenuOpen]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const node = mobileDrawerRef.current;
    if (!node) {
      return;
    }

    const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first = focusable[0] ?? null;
    const last = focusable[focusable.length - 1] ?? null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileOpen(false);
      }

      if (event.key === "Tab" && focusable.length > 0) {
        if (event.shiftKey && first && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && last && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => {
      first?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!mobileOpen) {
      setMobileSection(null);
    }
  }, [mobileOpen]);

  const isActive = useCallback(
    (href: string) => {
      if (!activePath) return false;
      if (href === "/") {
        return activePath === "/";
      }
      return activePath.startsWith(href);
    },
    [activePath]
  );

  const navigateAndClose = (href: string) => {
    Router.push(href);
    setMobileOpen(false);
  };

  const brandMarkGradientId = `${gradientId}-mark`;
  const brandHighlightGradientId = `${brandMarkGradientId}-highlight`;
  const brandSheenId = `${brandMarkGradientId}-sheen`;

  const resolvedBrandLogo = brand.logo ?? (
    <svg aria-hidden="true" viewBox="0 0 120 120" className={styles.brandIcon}>
      <defs>
        <linearGradient id={brandMarkGradientId} x1="18%" y1="12%" x2="82%" y2="92%">
          <stop offset="0%" stopColor="var(--logo-primary)" />
          <stop offset="52%" stopColor="var(--logo-secondary)" />
          <stop offset="100%" stopColor="var(--logo-depth)" />
        </linearGradient>
        <linearGradient
          id={brandHighlightGradientId}
          x1="32%"
          y1="18%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="var(--logo-highlight)" />
          <stop offset="100%" stopColor="var(--logo-highlight-strong)" />
        </linearGradient>
        <radialGradient id={brandSheenId} cx="48%" cy="32%" r="62%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.35)" />
          <stop offset="62%" stopColor="rgba(255, 255, 255, 0.08)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </radialGradient>
      </defs>
      <path
        d="M34.22 21.05 31.23 5.52C30.08.43 24.73-2.38 20 0L10.3 4.53l2.88 18.33c.52 3.3 3.37 5.76 6.7 5.76h9.76c1.79 0 3.15-1.61 2.91-3.57Z"
        fill="var(--logo-secondary)"
        opacity="0.9"
      />
      <path
        d="M95.27 5.77c3.79-1.6 8 .44 9.16 4.36l4.05 13.38c.56 1.85-.74 3.69-2.65 3.69H93.02c-1.44 0-2.72-.87-3.27-2.21l-4.98-11.98c-1.21-2.92.18-6.3 3.12-7.6Z"
        fill="var(--logo-secondary)"
        opacity="0.94"
      />
      <path
        d="M78.58 14.17c-7 0-13.21 4.26-15.83 10.84l-1.84 4.72c-.72 1.85-2.49 3.06-4.45 3.06H49c-20.55 0-37.22 16.68-37.22 37.22v8.86c0 11.29 4.48 22.12 12.46 30.11l13.16 13.16c4.07 4.07 9.6 6.37 15.36 6.37h25.36c19.46 0 35.24-15.78 35.24-35.24V50.55c0-13.98-11.33-25.31-25.31-25.31h-5.98c-1.79 0-3.38-1.12-3.95-2.79l-1.84-5.28c-1.87-5.38-6.97-8.99-12.49-8.99Z"
        fill={`url(#${brandMarkGradientId})`}
      />
      <path
        d="M50.86 73.33c15.34 5.53 27.24 18.5 31.44 34.48H61.76c-5.36 0-10.51-2.13-14.32-5.94L36.07 91.49c3.52-7.74 9.6-13.86 16.99-18.16Z"
        fill={`url(#${brandHighlightGradientId})`}
      />
      <path
        d="M84.64 32.78c-12.19 0-23 6.95-28.41 17.59-1.94 3.82-5.84 6.22-10.1 6.22H38.4c-3 0-5.85 1.63-7.38 4.27-3.71 6.31-3.44 14.19.67 20.17l1.62 2.36C47.9 63.32 73.45 55.77 96.5 63.01c3.94 1.24 8.11-.79 9.78-4.53l2.18-5.04c3.88-8.97-2.73-18.99-12.36-18.99h-10.8c-.63 0-1.19-.4-1.4-.99l-.95-2.61c-.72-1.98-2.58-3.3-4.63-3.3Z"
        fill={`url(#${brandSheenId})`}
        opacity="0.9"
      />
    </svg>
  );

  const themeOptions = useMemo(
    () =>
      THEME_OPTIONS.map((option) => {
        const label = t(option.labelKey);
        const normalizedLabel = typeof label === "string" ? label : String(label ?? "");
        return { ...option, label: normalizedLabel };
      }),
    [t]
  );

  const activeThemeOption = useMemo(
    () => themeOptions.find((option) => option.key === theme) ?? themeOptions[0] ?? null,
    [themeOptions, theme]
  );

  const themeSelectorLabel = t("theme.selectorAria");
  const themeSelectorAria =
    typeof themeSelectorLabel === "string" && themeSelectorLabel.trim().length > 0
      ? themeSelectorLabel
      : "Sélection du thème";

  const languageSelectorLabel = t("language.selectorAria");
  const languageSelectorAria =
    typeof languageSelectorLabel === "string" && languageSelectorLabel.trim().length > 0
      ? languageSelectorLabel
      : "Langue";

  const activeLanguageOption = useMemo(
    () => languageOptions.find((option) => option.code === language) ?? null,
    [languageOptions, language]
  );

  const handleThemeSelect = useCallback(
    (nextTheme: ThemeKey) => {
      if (nextTheme === theme) {
        closePreferenceMenus();
        return;
      }
      setTheme(nextTheme);
      closePreferenceMenus();
    },
    [closePreferenceMenus, theme]
  );

  const handleLanguageSelect = useCallback(
    (code: string) => {
      if (!code || code === language) {
        closePreferenceMenus();
        return;
      }
      setLanguage(code);
      closePreferenceMenus();

      const nextQuery = { ...Router.query, lang: code };
      const pathname = Router.pathname;
      Router.replace({ pathname, query: nextQuery }, undefined, {
        shallow: true,
        scroll: false,
      }).catch(() => {
        if (typeof window === "undefined") {
          return;
        }
        try {
          const current = new URL(window.location.href);
          current.searchParams.set("lang", code);
          const href = `${current.pathname}${current.search}${current.hash}`;
          Router.replace(href, href, { shallow: true, scroll: false }).catch(() => undefined);
        } catch {
          // noop
        }
      });
    },
    [closePreferenceMenus, language, setLanguage]
  );

  return (
    <Fragment>
      <nav
        className={classNames(
          styles.navbar,
          isScrolled && styles.navbarPinned,
          className
        )}
        data-scrolled={isScrolled || undefined}
      >
        <div
          className={classNames(
            styles.inner,
            isScrolled && styles.innerScrolled
          )}
        >
          <div className={styles.brandArea}>
            <Link
              href={brand.href}
              className={styles.brandLink}
              aria-label={brand.label}
            >
              {resolvedBrandLogo}
              <span className={styles.brandText}>{brand.label}</span>
            </Link>
          </div>

          <div className={styles.desktopNav}>
            <div
              className={styles.navListWrapper}
              onMouseLeave={(event) => {
                const next = event.relatedTarget as Node | null;
                if (next && event.currentTarget.contains(next)) {
                  return;
                }
                scheduleDropdownClose();
                resetIndicatorToActive();
              }}
              onBlur={(event) => {
                const next = event.relatedTarget as Node | null;
                if (!event.currentTarget.contains(next)) {
                  closeDropdown();
                  resetIndicatorToActive();
                }
              }}
            >
              <ul className={styles.navList} ref={navListRef}>
                {resolvedLinks.map((link) => {
                  const active = isActive(link.href);
                  if (link.children && link.children.length > 0) {
                    const expanded = dropdownOpen === link.href;
                    return (
                      <li
                        key={link.href}
                        className={styles.navItem}
                        onMouseEnter={() => openDropdown(link.href)}
                        onMouseLeave={(event) => {
                          const next = event.relatedTarget as Node | null;
                          if (next && event.currentTarget.contains(next)) {
                            return;
                          }
                          scheduleDropdownClose();
                          resetIndicatorToActive();
                        }}
                        onFocusCapture={() => openDropdown(link.href)}
                        onBlur={(event) => {
                          const next = event.relatedTarget as Node | null;
                          if (!event.currentTarget.contains(next)) {
                            closeDropdown();
                            resetIndicatorToActive();
                          }
                        }}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            const nextOpen = expanded ? null : link.href;
                            if (nextOpen) {
                              openDropdown(nextOpen);
                              updateIndicator(event.currentTarget);
                            } else {
                              closeDropdown();
                              resetIndicatorToActive();
                            }
                          }}
                          onMouseEnter={(event) => {
                            openDropdown(link.href);
                            updateIndicator(event.currentTarget);
                          }}
                          onFocus={(event) => {
                            openDropdown(link.href);
                            updateIndicator(event.currentTarget);
                          }}
                          aria-haspopup="menu"
                          aria-expanded={expanded}
                          className={classNames(
                            styles.navLink,
                            active && styles.navLinkActive
                          )}
                          data-active-link={active ? "true" : undefined}
                        >
                          {link.label}
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className={styles.navCaret}
                          >
                            <path
                              d="M6.293 9.293a1 1 0 0 1 1.414 0L12 13.586l4.293-4.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 0-1.414Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                        {expanded && (
                          <div
                            className={styles.dropdown}
                            tabIndex={-1}
                            onMouseEnter={() => openDropdown(link.href)}
                            onMouseLeave={() => {
                              scheduleDropdownClose();
                              resetIndicatorToActive();
                            }}
                          >
                            <p className={styles.dropdownLabel}>{link.label}</p>
                            <ul className={styles.dropdownList}>
                              {link.children.map((child) => {
                                const childActive = isActive(child.href);
                                return (
                                  <li key={child.href}>
                                    <Link
                                      href={child.href}
                                      aria-current={
                                        childActive ? "page" : undefined
                                      }
                                      className={classNames(
                                        styles.dropdownLink,
                                        childActive && styles.dropdownLinkActive
                                      )}
                                      onClick={() => closeDropdown()}
                                    >
                                      <span>{child.label}</span>
                                      <span className={styles.dropdownDesc}>
                                        {child.desc}
                                      </span>
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        )}
                      </li>
                    );
                  }

                  return (
                    <li key={link.href} className={styles.navItem}>
                      <Link
                        href={link.href}
                        className={classNames(
                          styles.navLink,
                          active && styles.navLinkActive
                        )}
                        aria-current={active ? "page" : undefined}
                        data-active-link={active ? "true" : undefined}
                        onMouseEnter={(event) =>
                          updateIndicator(event.currentTarget)
                        }
                        onFocus={(event) =>
                          updateIndicator(event.currentTarget)
                        }
                      >
                        {link.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <span
                className={styles.navIndicator}
                style={{
                  width: indicator.width,
                  transform: `translateX(${indicator.left}px)`,
                  opacity: indicator.opacity,
                }}
                aria-hidden
              />
            </div>

            <div className={styles.actions}>
              {enableSearch && (
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => setSearchOpen(true)}
                  aria-label="Ouvrir la recherche"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path
                      d="M11 5a6 6 0 0 1 4.472 9.983l3.272 3.273a1 1 0 0 1-1.414 1.414l-3.273-3.272A6 6 0 1 1 11 5Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              )}

              {enableThemeToggle && (
                <div className={styles.themeToggle} ref={themeMenuRef}>
                  <button
                    type="button"
                    className={styles.themeTrigger}
                    onClick={() => {
                      setThemeMenuOpen((prev) => !prev);
                      setLanguageMenuOpen(false);
                    }}
                    aria-haspopup="menu"
                    aria-expanded={themeMenuOpen}
                    aria-label={themeSelectorAria}
                    ref={themeTriggerRef}
                  >
                    <span className={styles.themeIcon} aria-hidden>
                      {activeThemeOption?.icon ?? "🌙"}
                    </span>
                    <span className={styles.themeLabel} aria-hidden>
                      {activeThemeOption?.label ?? "Thème"}
                    </span>
                    <span className="sr-only">{themeSelectorAria}</span>
                  </button>
                  {themeMenuOpen && (
                    <div className={styles.themeMenu} role="menu" aria-label={themeSelectorAria}>
                      {themeOptions.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          role="menuitemradio"
                          aria-checked={theme === option.key}
                      className={classNames(
                        styles.themeOption,
                        theme === option.key && styles.themeOptionActive
                      )}
                      onClick={() => handleThemeSelect(option.key)}
                    >
                      <span className={styles.themeOptionIcon} aria-hidden>
                        {option.icon}
                      </span>
                          <span className={styles.themeOptionLabel}>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {languageOptions.length > 0 && (
                <div className={styles.languageToggle} ref={languageMenuRef}>
                  <button
                    type="button"
                    className={styles.languageTrigger}
                    onClick={() => {
                      setLanguageMenuOpen((prev) => !prev);
                      setThemeMenuOpen(false);
                    }}
                    aria-haspopup="menu"
                    aria-expanded={languageMenuOpen}
                    aria-label={languageSelectorAria}
                    ref={languageTriggerRef}
                  >
                    {activeLanguageOption ? (
                      <span className={styles.languageFlag} aria-hidden>
                        <img src={activeLanguageOption.flag} alt="" loading="lazy" />
                      </span>
                    ) : (
                      <span className={styles.languageIcon} aria-hidden>
                        🌐
                      </span>
                    )}
                    <span className={styles.languageLabel} aria-hidden>
                      {activeLanguageOption?.label ?? "Langue"}
                    </span>
                    <span className="sr-only">{languageSelectorAria}</span>
                  </button>
                  {languageMenuOpen && (
                    <div
                      className={styles.languageMenu}
                      role="menu"
                      aria-label={languageSelectorAria}
                    >
                      {languageOptions.map((option) => (
                        <button
                          key={option.code}
                          type="button"
                          role="menuitemradio"
                          aria-checked={language === option.code}
                          className={classNames(
                            styles.languageOption,
                            language === option.code && styles.languageOptionActive
                          )}
                          onClick={() => handleLanguageSelect(option.code)}
                        >
                          <span className={styles.languageOptionFlag} aria-hidden>
                            <img src={option.flag} alt="" loading="lazy" />
                          </span>
                          <span className={styles.languageOptionLabel}>{option.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={styles.mobileControls}>
            {enableSearch && (
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setSearchOpen(true)}
                aria-label="Ouvrir la recherche"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path
                    d="M11 5a6 6 0 0 1 4.472 9.983l3.272 3.273a1 1 0 0 1-1.414 1.414l-3.273-3.272A6 6 0 1 1 11 5Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            )}
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setMobileOpen(true)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              aria-label="Ouvrir le menu"
            >
              <span className="sr-only">Ouvrir le menu</span>
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <path
                  d="M4 7a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm1 4a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H5Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div
          className={styles.mobileOverlay}
          role="dialog"
          aria-modal="true"
          onClick={() => setMobileOpen(false)}
        >
          <div
            id="mobile-nav"
            ref={mobileDrawerRef}
            className={styles.mobilePanel}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.mobileHeader}>
              <Link
                href={brand.href}
                className={styles.mobileBrand}
                onClick={() => setMobileOpen(false)}
              >
                {resolvedBrandLogo}
                <span>{brand.label}</span>
              </Link>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => setMobileOpen(false)}
                aria-label="Fermer le menu"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path
                    d="M6.225 4.811a1 1 0 0 1 1.414 0L12 9.172l4.361-4.361a1 1 0 0 1 1.414 1.414L13.414 10.5l4.361 4.361a1 1 0 1 1-1.414 1.414L12 11.914l-4.361 4.361a1 1 0 1 1-1.414-1.414L10.586 10.5 6.225 6.139a1 1 0 0 1 0-1.414Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>

            <div className={styles.mobileContent}>
              <ul className={styles.mobileList}>
                {resolvedLinks.map((link) => {
                  const active = isActive(link.href);
                  if (link.children && link.children.length > 0) {
                    const expanded = mobileSection === link.href;
                    return (
                      <li key={link.href}>
                        <button
                          type="button"
                          className={classNames(
                            styles.mobileSectionButton,
                            expanded && styles.mobileSectionButtonExpanded
                          )}
                          onClick={() =>
                            setMobileSection((prev) =>
                              prev === link.href ? null : link.href
                            )
                          }
                          aria-expanded={expanded}
                          aria-controls={`section-${link.href}`}
                        >
                          <span>{link.label}</span>
                          <svg aria-hidden="true" viewBox="0 0 24 24">
                            <path
                              d="M6.293 9.293a1 1 0 0 1 1.414 0L12 13.586l4.293-4.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 0-1.414Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                        <ul
                          id={`section-${link.href}`}
                          className={classNames(
                            styles.mobileChildList,
                            expanded && styles.mobileChildListVisible
                          )}
                        >
                          {link.children.map((child) => {
                            const childActive = isActive(child.href);
                            return (
                              <li key={child.href}>
                                <button
                                  type="button"
                                  className={classNames(
                                    styles.mobileChildButton,
                                    childActive && styles.mobileChildButtonActive
                                  )}
                                  onClick={() => navigateAndClose(child.href)}
                                >
                                  <span>{child.label}</span>
                                  <span className={styles.mobileChildDesc}>
                                    {child.desc}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    );
                  }

                  return (
                    <li key={link.href}>
                      <button
                        type="button"
                        className={classNames(
                          styles.mobileLink,
                          active && styles.mobileLinkActive
                        )}
                        onClick={() => navigateAndClose(link.href)}
                        aria-current={active ? "page" : undefined}
                      >
                        {link.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className={styles.mobileFooter}>
              {enableThemeToggle && (
                <div className={styles.mobileThemeGroup}>
                  {themeOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={classNames(
                        styles.mobileThemeButton,
                        theme === option.key && styles.mobileThemeButtonActive
                      )}
                      onClick={() => handleThemeSelect(option.key)}
                    >
                      <span className={styles.mobileThemeIcon} aria-hidden>
                        {option.icon}
                      </span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {languageOptions.length > 0 && (
                <div
                  className={styles.mobileLanguageGroup}
                  aria-label={languageSelectorAria}
                >
                  {languageOptions.map((option) => (
                    <button
                      key={option.code}
                      type="button"
                      className={classNames(
                        styles.mobileLanguageButton,
                        language === option.code && styles.mobileLanguageButtonActive
                      )}
                      onClick={() => handleLanguageSelect(option.code)}
                    >
                      <span className={styles.mobileLanguageFlag} aria-hidden>
                        <img src={option.flag} alt="" loading="lazy" />
                      </span>
                      <span>{option.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {enableSearch && (
        <SearchCommand
          links={resolvedLinks}
          open={searchOpen}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </Fragment>
  );
}
