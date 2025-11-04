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
} from "react";
import { useLockBody } from "./hooks/useLockBody";
import { useScrollDirection } from "./hooks/useScrollDirection";
import { SearchCommand } from "./SearchCommand";
import type { NavBrand, NavCta, NavLink } from "./types";
import styles from "./Navbar.module.css";

interface NavbarProps {
  brand: NavBrand;
  links: NavLink[];
  cta?: NavCta;
  enableSearch?: boolean;
  enableThemeToggle?: boolean;
  className?: string;
}

type ThemeMode = "system" | "light" | "dark";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Navbar({
  brand,
  links,
  cta,
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
  const [theme, setTheme] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("dark");
  const [hasMounted, setHasMounted] = useState(false);

  const scrollDirection = useScrollDirection({ threshold: 6 });
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const themeTriggerRef = useRef<HTMLButtonElement>(null);

  useLockBody(mobileOpen || searchOpen);

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
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 8);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setHasMounted(true);
    if (typeof window === "undefined") {
      return;
    }

    const stored = window.localStorage.getItem("theme-preference") as
      | ThemeMode
      | null;
    if (stored) {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    if (!hasMounted || typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = (mode: ThemeMode) => {
      const effective =
        mode === "system" ? (media.matches ? "dark" : "light") : mode;
      const root = window.document.documentElement;
      root.classList.toggle("dark", effective === "dark");
      root.setAttribute("data-theme", effective);
      setResolvedTheme(effective);
      window.localStorage.setItem("theme-preference", mode);
    };

    apply(theme);

    if (theme === "system") {
      const listener = () => apply("system");
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }

    return undefined;
  }, [hasMounted, theme]);

  useEffect(() => {
    if (!themeMenuOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (
        themeMenuRef.current?.contains(event.target as Node) ||
        themeTriggerRef.current?.contains(event.target as Node)
      ) {
        return;
      }
      setThemeMenuOpen(false);
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setThemeMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [themeMenuOpen]);

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

  const hideNav = scrollDirection === "down" && isScrolled;

  const resolvedLinks = useMemo(() => links, [links]);

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

  const resolvedBrandLogo = brand.logo ?? (
    <svg aria-hidden="true" viewBox="0 0 32 32" className={styles.brandIcon}>
      <path
        d="M16 3c3.866 0 7 3.134 7 7 0 2.31-1.092 4.368-2.79 5.69L27 26.5a1.5 1.5 0 0 1-2.598 1.5L16 18.118 7.598 28A1.5 1.5 0 0 1 5 26.5l6.79-10.81C10.092 14.368 9 12.31 9 10c0-3.866 3.134-7 7-7Z"
        fill="currentColor"
      />
    </svg>
  );

  const themeOptions: ThemeMode[] = ["system", "light", "dark"];

  return (
    <Fragment>
      <nav
        className={classNames(
          styles.navbar,
          hideNav && styles.navbarHidden,
          className
        )}
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
            <ul className={styles.navList}>
              {resolvedLinks.map((link) => {
                const active = isActive(link.href);
                if (link.children && link.children.length > 0) {
                  return (
                    <li
                      key={link.href}
                      className={styles.navItem}
                      onMouseEnter={() => setDropdownOpen(link.href)}
                      onMouseLeave={() => setDropdownOpen(null)}
                      onFocusCapture={() => setDropdownOpen(link.href)}
                      onBlur={(event) => {
                        const next = event.relatedTarget as Node | null;
                        if (!event.currentTarget.contains(next)) {
                          setDropdownOpen(null);
                        }
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setDropdownOpen((prev) =>
                            prev === link.href ? null : link.href
                          )
                        }
                        aria-haspopup="menu"
                        aria-expanded={dropdownOpen === link.href}
                        className={classNames(
                          styles.navLink,
                          active && styles.navLinkActive
                        )}
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
                      <span
                        className={styles.navUnderline}
                        data-active={active || undefined}
                        aria-hidden
                      />
                      {dropdownOpen === link.href && (
                        <div className={styles.dropdown} tabIndex={-1}>
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
                    >
                      {link.label}
                    </Link>
                    <span
                      className={styles.navUnderline}
                      data-active={active || undefined}
                      aria-hidden
                    />
                  </li>
                );
              })}
            </ul>

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
                    onClick={() => setThemeMenuOpen((prev) => !prev)}
                    aria-haspopup="menu"
                    aria-expanded={themeMenuOpen}
                    ref={themeTriggerRef}
                  >
                    <span className={styles.themeIcon} aria-hidden>
                      {resolvedTheme === "dark" ? "🌙" : "☀️"}
                    </span>
                    <span className={styles.themeLabel}>Thème</span>
                  </button>
                  {themeMenuOpen && (
                    <div className={styles.themeMenu} role="menu">
                      {themeOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          role="menuitemradio"
                          aria-checked={theme === option}
                          className={classNames(
                            styles.themeOption,
                            theme === option && styles.themeOptionActive
                          )}
                          onClick={() => {
                            setTheme(option);
                            setThemeMenuOpen(false);
                          }}
                        >
                          <span className={styles.themeOptionIndicator} />
                          <span className={styles.themeOptionLabel}>
                            {option === "system"
                              ? "Système"
                              : option === "light"
                              ? "Clair"
                              : "Sombre"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {cta && (
                <Link href={cta.href} className={styles.ctaButton}>
                  {cta.label}
                </Link>
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
                      key={option}
                      type="button"
                      className={classNames(
                        styles.mobileThemeButton,
                        theme === option && styles.mobileThemeButtonActive
                      )}
                      onClick={() => setTheme(option)}
                    >
                      {option === "system"
                        ? "Système"
                        : option === "light"
                        ? "Clair"
                        : "Sombre"}
                    </button>
                  ))}
                </div>
              )}
              {cta && (
                <Link
                  href={cta.href}
                  className={classNames(styles.ctaButton, styles.mobileCta)}
                  onClick={() => setMobileOpen(false)}
                >
                  {cta.label}
                </Link>
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
