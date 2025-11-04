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

  const brandShellGradientId = `${gradientId}-shell`;
  const brandAuraGradientId = `${brandShellGradientId}-aura`;
  const brandHighlightGradientId = `${brandShellGradientId}-highlight`;
  const brandSwirlGradientId = `${brandShellGradientId}-swirl`;

  const resolvedBrandLogo = brand.logo ?? (
    <svg
      aria-hidden="true"
      viewBox="0 0 160 160"
      focusable="false"
      className={styles.brandIcon}
    >
      <defs>
        <radialGradient id={brandShellGradientId} cx="52%" cy="28%" r="72%">
          <stop offset="0%" stopColor="var(--logo-highlight)" stopOpacity="0.18" />
          <stop offset="38%" stopColor="var(--logo-secondary)" stopOpacity="0.92" />
          <stop offset="100%" stopColor="var(--logo-primary)" />
        </radialGradient>
        <radialGradient id={brandAuraGradientId} cx="44%" cy="68%" r="46%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.36)" />
          <stop offset="75%" stopColor="rgba(255, 255, 255, 0.0)" />
        </radialGradient>
        <linearGradient id={brandHighlightGradientId} x1="12%" y1="12%" x2="88%" y2="88%">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.75)" />
          <stop offset="42%" stopColor="rgba(255, 255, 255, 0.22)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </linearGradient>
        <linearGradient id={brandSwirlGradientId} x1="0%" y1="50%" x2="100%" y2="50%">
          <stop offset="0%" stopColor="var(--logo-highlight)" />
          <stop offset="58%" stopColor="var(--logo-highlight-strong)" />
          <stop offset="100%" stopColor="var(--logo-secondary)" />
        </linearGradient>
      </defs>
      <g transform="translate(16 8)">
        <path
          d="M64 0C41.5 0 22 30.4 22 68s19.5 68 42 68 42-30.4 42-68S86.5 0 64 0Z"
          fill={`url(#${brandShellGradientId})`}
        />
        <path
          d="M64 4c-19 0-36 28-36 64 0 30.7 14.8 55.6 32.8 59.4a4 4 0 0 0 1.6-.02c18-3.6 32.6-28.7 32.6-59.38C95 32 83 4 64 4Z"
          fill="rgba(12, 20, 26, 0.16)"
          opacity="0.4"
        />
        <path
          d="M78.6 37.2c-2.6-6.2-8.4-10.2-15.2-10.2-6.3 0-12 3.2-14.9 8.6L41 51.6a8 8 0 0 1-7 4.2h-7.8c-1.7 0-3 1.5-2.7 3.2l2.1 12.3c.2 1.1 1 2 2 2.4l5.4 2c2.8 1 5 3 6.4 5.6l4.8 9.3c.5 1 1.5 1.7 2.6 1.7h10.4c1.9 0 3.5 1.4 3.7 3.3l1.4 11.8c.2 1.5 1.5 2.6 3 2.6h12.4c1.4 0 2.7-1 3-2.4l4.5-19.6c.3-1.1.9-2.1 1.8-2.8l8.3-6.5c.8-.6 1.2-1.6 1.1-2.6l-1.4-15.6c-.1-1.2-.7-2.2-1.7-2.9l-5.5-3.8c-1.1-.7-1.9-1.8-2.2-3.1l-2.8-11.2Z"
          fill="rgba(5, 11, 16, 0.35)"
          opacity="0.65"
        />
        <path
          d="M81.8 47.6c-3.5 0-6.6 2-8.2 5.1l-2.8 5.3c-.5 1-1.5 1.7-2.6 1.7h-7.8c-6.3 0-11.4 5.1-11.4 11.4v3.8c0 2.8 1 5.6 2.9 7.7l8.6 9.5c1 1.1 2.4 1.7 3.8 1.7h12.8c9.8 0 17.8-8 17.8-17.8V62.4c0-5.6-4.6-10.2-10.2-10.2H81.8Z"
          fill="rgba(12, 28, 40, 0.35)"
          opacity="0.5"
        />
        <path
          d="M73.5 40.4c-2.1-4.3-6.6-7-11.5-7-4.8 0-9.1 2.6-11.2 6.8L44 54.8a6 6 0 0 1-5.3 3.3h-5.6c-1.2 0-2.1 1.1-1.8 2.3l1.5 8.8c.1.8.7 1.5 1.5 1.8l3.9 1.5c2 0.8 3.6 2.3 4.6 4.2l3.4 6.6a2.8 2.8 0 0 0 2.5 1.6h7.3c1.3 0 2.4 1 2.5 2.3l1 8.4c.2 1.1 1.1 2 2.2 2h8.7c1 0 1.9-.7 2.2-1.7l3.2-14c.2-.8.7-1.5 1.3-2l6.1-4.6c.6-.4.9-1.1.8-1.8l-1-11.2c-.1-.8-.5-1.5-1.2-1.9l-4-2.7c-.8-.5-1.4-1.3-1.6-2.2l-2-8Z"
          fill="var(--logo-depth)"
        />
        <path
          d="M63.6 53.5c-1.8 3.5-5.4 5.7-9.3 5.7h-4.8c-1.4 0-2.4 1.4-1.9 2.7 4.6 12.4 16.3 20.7 29.6 20.7h7.2c.9 0 1.7-.7 1.8-1.6l1.1-8.8c.1-.8-.4-1.5-1.1-1.8l-6.4-2.4c-.8-.3-1.3-1-1.4-1.8l-.6-6.3c-.1-1.1-.9-2-2-2.2l-6.1-1.2a2.2 2.2 0 0 1-1.7-3.1l2.5-5.3c.4-.8-.3-1.7-1.2-1.7-2.8.2-5.5 1.9-6.7 4.3Z"
          fill="rgba(255, 255, 255, 0.08)"
        />
        <path
          d="M64 16c-10 0-20.8 9.4-26.5 23.3 5.8-7 13.6-11 21.5-11 16.6 0 30 16.3 30 36.4 0 8.1-2.2 15.5-6 21.3 9-7.8 15-20.9 15-35 0-19.3-14.8-35-33-35Z"
          fill={`url(#${brandAuraGradientId})`}
        />
        <path
          d="M100.6 48.8c4.2-1.2 8.5 1.9 8.7 6.3.5 8.2-3.6 16.2-10.6 21l-24.2 16.6c-1.1.8-2.6 1-3.9.5l-7.1-2.9c-1.1-.5-2.3.4-2.1 1.6l1.8 11.6c.2 1.6 1.6 2.7 3.2 2.5 23.5-3.5 41.1-24 41.1-48.9 0-2.8-2.7-5-5.6-4.3l-1.3.3c-1.4.4-2.7-.9-2.4-2.3l.6-1.9c.2-.6.7-1.1 1.3-1.3Z"
          fill={`url(#${brandHighlightGradientId})`}
          opacity="0.75"
        />
        <path
          d="M38 92c4.6 8.8 14 14.8 24.2 14.8 6.8 0 13.5-2.5 18.8-7l1-.8c.8-.6 1.9-.4 2.4.4l1.6 2.8c.3.6.2 1.3-.3 1.8C78.8 111 70.5 115 61 115 48.5 115 37 108.3 30.8 97.4c-.5-.9-.1-2 .8-2.4l3.8-1.9c.9-.5 2.1-.1 2.6.9Z"
          fill={`url(#${brandSwirlGradientId})`}
        />
        <path
          d="M94.8 28.2c1-.6 2.3-.2 2.7.8l2.4 5.7c.3.7 0 1.5-.7 1.9C81 47.5 71 68.7 71 90.8v2c0 1.3-1.3 2.1-2.5 1.6l-6.2-2.6c-.8-.4-1.2-1.2-1-2.1 4.5-21.4 17.5-40 33.5-52.5Z"
          fill="rgba(255, 255, 255, 0.16)"
        />
        <path
          d="M41.8 32c-1-.5-2.2 0-2.6 1l-3.2 7.5c-.3.8.1 1.7.9 2 11.2 4.5 21 13.4 26.8 24.5.5 1 1.7 1.4 2.6.8l5.3-3.2c.7-.5 1-1.4.6-2.2-6.4-13.4-17.7-24-30.4-30.4Z"
          fill="rgba(255, 255, 255, 0.12)"
        />
      </g>
      <path
        d="M32 96c-2 6.6 1.4 13.6 7.8 16.3l12.7 5.4c1 .4 2-.4 1.9-1.5l-.5-5.6c-.1-1 1-1.7 1.8-1.2l6.8 4.1c.8.5 1.9.2 2.3-.7l2.6-5.6c.4-.9 1.6-1.1 2.3-.4l4.7 4.7c.6.6 1.6.6 2.2 0l6.6-6.6c.7-.7 1.8-.6 2.4.2l5.4 7.2c.6.8 1.8.8 2.5.1l9.4-9.4c.7-.7.6-1.8-.2-2.4L82 90.5"
        fill="none"
        stroke={`url(#${brandSwirlGradientId})`}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.9"
      />
      <path
        d="M124 64c2.2-5.4-.7-11.7-6.4-13.6l-12.6-4.2c-.9-.3-1.8.4-1.7 1.4l.3 4.8c.1 1-1 1.7-1.8 1.2l-6.9-3.9c-.8-.5-1.9-.1-2.2.8l-2.1 6c-.3.9-1.5 1.2-2.2.5l-4.8-4.7c-.7-.6-1.7-.6-2.3 0l-7.6 7.6"
        fill="none"
        stroke={`url(#${brandSwirlGradientId})`}
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.65"
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
