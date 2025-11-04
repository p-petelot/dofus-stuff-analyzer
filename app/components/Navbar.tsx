"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

type ThemeMode = "system" | "light" | "dark";

interface NavbarProps {
  brand: NavBrand;
  links: NavLink[];
  cta?: NavCta;
  enableSearch?: boolean;
  enableThemeToggle?: boolean;
  className?: string;
}

const focusableSelector =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Navbar({
  brand,
  links,
  cta,
  enableSearch = false,
  enableThemeToggle = false,
  className,
}: NavbarProps) {
  const pathname = usePathname();
  const router = useRouter();
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

    const focusable = node.querySelectorAll<HTMLElement>(focusableSelector);
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
      if (!pathname) return false;
      if (href === "/") {
        return pathname === "/";
      }
      return pathname.startsWith(href);
    },
    [pathname]
  );

  const navigateAndClose = (href: string) => {
    router.push(href);
    setMobileOpen(false);
  };

  const resolvedBrandLogo = brand.logo ?? (
    <svg
      aria-hidden="true"
      viewBox="0 0 32 32"
      className="h-8 w-8 text-accent"
    >
      <path
        d="M16 3c3.866 0 7 3.134 7 7 0 2.31-1.092 4.368-2.79 5.69L27 26.5a1.5 1.5 0 0 1-2.598 1.5L16 18.118 7.598 28A1.5 1.5 0 0 1 5 26.5l6.79-10.81C10.092 14.368 9 12.31 9 10c0-3.866 3.134-7 7-7Z"
        fill="currentColor"
      />
    </svg>
  );

  const themeIcon = resolvedTheme === "dark" ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="currentColor"
        d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 1 0 21 12.79Z"
      />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
      <path
        fill="currentColor"
        d="M12 18a1.5 1.5 0 0 1 1.5 1.5V22a1 1 0 1 1-2 0v-2.5A1.5 1.5 0 0 1 12 18Zm-6.364-2.05a1.5 1.5 0 0 1 2.121 0l1.768 1.768a1 1 0 1 1-1.414 1.414l-1.768-1.768a1.5 1.5 0 0 1 0-2.121ZM4 11a1.5 1.5 0 0 1 1.5-1.5H8a1 1 0 1 1 0 2H5.5A1.5 1.5 0 0 1 4 11Zm2.636-7.05a1.5 1.5 0 0 1 0 2.121L4.868 7.84A1 1 0 0 1 3.454 6.425l1.768-1.768a1.5 1.5 0 0 1 2.121 0ZM12 4a1.5 1.5 0 0 1-1.5-1.5V0a1 1 0 1 1 2 0v2.5A1.5 1.5 0 0 1 12 4Zm7.132 2.425a1 1 0 0 1-1.414 1.414l-1.768-1.768a1.5 1.5 0 0 1 2.121-2.121l1.768 1.768a1 1 0 0 1 0 1.414ZM20 11a1.5 1.5 0 0 1-1.5 1.5H16a1 1 0 0 1 0-2h2.5A1.5 1.5 0 0 1 20 11Zm-2.636 7.95a1.5 1.5 0 0 1-2.121 0l-1.768-1.768a1 1 0 1 1 1.414-1.414l1.768 1.768a1.5 1.5 0 0 1 0 2.121Z"
      />
    </svg>
  );

  const themeOptions: ThemeMode[] = ["system", "light", "dark"];

  return (
    <Fragment>
      <nav
        className={cn(
          "sticky top-0 z-50 px-3 transition-transform duration-200 ease-out motion-reduce:transition-none",
          hideNav ? "-translate-y-full" : "translate-y-0",
          className
        )}
      >
        <div className="mx-auto max-w-6xl">
          <div
            className={cn(
              "mt-3 flex items-center justify-between rounded-2xl border border-slate-200/40 bg-white/70 px-4 py-3 shadow-sm backdrop-blur-xl transition duration-200 ease-out motion-reduce:transition-none dark:border-slate-800/60 dark:bg-slate-900/70",
              isScrolled
                ? "shadow-lg shadow-slate-900/10 dark:shadow-black/30"
                : "shadow-none"
            )}
            data-glassy="true"
          >
            <div className="flex items-center gap-3">
              <Link
                href={brand.href}
                className="flex items-center gap-2 rounded-full px-2 py-1 text-sm font-semibold tracking-wide text-slate-900 transition hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:text-slate-100"
              >
                {resolvedBrandLogo}
                <span className="text-base font-semibold">{brand.label}</span>
              </Link>
            </div>

            <div className="hidden items-center gap-6 lg:flex">
              <ul className="flex items-center gap-2">
                {resolvedLinks.map((link) => {
                  const active = isActive(link.href);
                  if (link.children && link.children.length > 0) {
                    return (
                      <li
                        key={link.href}
                        className="relative"
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
                          className={cn(
                            "group relative inline-flex items-center gap-1 rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition duration-150 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:text-slate-100",
                            active && "text-accent"
                          )}
                        >
                          {link.label}
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="h-4 w-4 text-current transition group-aria-[expanded='true']:rotate-180"
                          >
                            <path
                              d="M6.293 9.293a1 1 0 0 1 1.414 0L12 13.586l4.293-4.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 0-1.414Z"
                              fill="currentColor"
                            />
                          </svg>
                          <span
                            className={cn(
                              "pointer-events-none absolute inset-x-4 -bottom-1 h-0.5 origin-center scale-x-0 rounded-full bg-accent transition-transform duration-150 ease-out motion-reduce:transition-none",
                              active
                                ? "scale-x-100"
                                : "group-hover:scale-x-100 group-focus-visible:scale-x-100"
                            )}
                            aria-hidden
                          />
                        </button>
                        {dropdownOpen === link.href && (
                          <div
                            className="absolute left-1/2 top-full z-20 mt-3 w-72 -translate-x-1/2 rounded-3xl border border-slate-200/40 bg-white/90 p-4 shadow-xl backdrop-blur-2xl dark:border-slate-700/60 dark:bg-slate-900/90"
                            tabIndex={-1}
                          >
                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                              {link.label}
                            </p>
                            <ul className="space-y-2">
                              {link.children.map((child) => {
                                const childActive = isActive(child.href);
                                return (
                                  <li key={child.href}>
                                    <Link
                                      href={child.href}
                                      aria-current={childActive ? "page" : undefined}
                                      className={cn(
                                        "group flex w-full flex-col rounded-2xl border border-transparent bg-white/50 px-4 py-3 transition duration-150 hover:-translate-y-0.5 hover:border-accent/50 hover:bg-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70 motion-reduce:translate-y-0 motion-reduce:transition-none dark:bg-slate-900/60 dark:hover:bg-slate-900/80",
                                        childActive && "border-accent/60"
                                      )}
                                    >
                                      <span className="text-sm font-medium text-slate-800 transition group-hover:text-accent dark:text-slate-100">
                                        {child.label}
                                      </span>
                                      <span className="text-xs text-slate-500 dark:text-slate-400">
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
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative inline-flex items-center rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition duration-150 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:text-slate-100",
                          active && "text-accent"
                        )}
                      >
                        {link.label}
                        <span
                          aria-hidden
                          className={cn(
                            "pointer-events-none absolute inset-x-4 -bottom-1 h-0.5 origin-center scale-x-0 rounded-full bg-accent transition-transform duration-150 ease-out motion-reduce:transition-none",
                            active
                              ? "scale-x-100"
                              : "group-hover:scale-x-100 group-focus-visible:scale-x-100"
                          )}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="hidden items-center gap-3 lg:flex">
              {enableSearch && (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="hidden items-center gap-2 rounded-full border border-slate-300/60 bg-white/40 px-4 py-2 text-sm font-medium text-slate-600 transition hover:border-accent/60 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
                    <path
                      d="M11 5a6 6 0 0 1 4.472 9.983l3.272 3.273a1 1 0 0 1-1.414 1.414l-3.273-3.272A6 6 0 1 1 11 5Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
                      fill="currentColor"
                    />
                  </svg>
                  <span>Rechercher</span>
                  <kbd className="rounded border border-slate-300/60 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-slate-500 dark:border-slate-600 dark:text-slate-400">
                    ⌘K
                  </kbd>
                </button>
              )}

              {enableThemeToggle && hasMounted && (
                <div className="relative" ref={themeMenuRef}>
                  <button
                    ref={themeTriggerRef}
                    type="button"
                    onClick={() => setThemeMenuOpen((prev) => !prev)}
                    aria-haspopup="menu"
                    aria-expanded={themeMenuOpen}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300/60 bg-white/40 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-accent/60 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:border-slate-700/60 dark:bg-slate-900/40 dark:text-slate-200"
                  >
                    {themeIcon}
                    <span className="capitalize">{theme}</span>
                    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4">
                      <path
                        d="M6.293 9.293a1 1 0 0 1 1.414 0L12 13.586l4.293-4.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 0-1.414Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  {themeMenuOpen && (
                    <div
                      role="menu"
                      tabIndex={-1}
                      className="absolute right-0 top-full z-30 mt-2 w-48 rounded-2xl border border-slate-200/50 bg-white/90 p-2 shadow-xl backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/90"
                    >
                      {themeOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          role="menuitemradio"
                          aria-checked={theme === option}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm text-slate-600 transition hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:text-slate-100",
                            theme === option && "bg-accent/10 text-accent"
                          )}
                          onClick={() => {
                            setTheme(option);
                            setThemeMenuOpen(false);
                          }}
                        >
                          <span className="capitalize">{option}</span>
                          {theme === option && (
                            <svg
                              aria-hidden="true"
                              viewBox="0 0 24 24"
                              className="h-4 w-4"
                            >
                              <path
                                d="M9.707 15.707a1 1 0 0 1-1.414 0l-3-3a1 1 0 0 1 1.414-1.414L9 13.586l8.293-8.293a1 1 0 0 1 1.414 1.414l-9 9Z"
                                fill="currentColor"
                              />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {cta && (
                <Link
                  href={cta.href}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:translate-y-0.5 hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:translate-y-0 motion-reduce:transition-none"
                >
                  {cta.label}
                </Link>
              )}
            </div>

            <div className="flex items-center gap-2 lg:hidden">
              {enableSearch && (
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300/60 bg-white/50 text-slate-600 transition hover:border-accent/60 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-200"
                  aria-label="Ouvrir la recherche"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5">
                    <path
                      d="M11 5a6 6 0 0 1 4.472 9.983l3.272 3.273a1 1 0 0 1-1.414 1.414l-3.273-3.272A6 6 0 1 1 11 5Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
                      fill="currentColor"
                    />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-300/60 bg-white/50 text-slate-700 transition hover:border-accent/60 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-200"
                onClick={() => setMobileOpen(true)}
                aria-expanded={mobileOpen}
                aria-controls="mobile-nav"
                aria-label="Ouvrir le menu"
              >
                <span className="sr-only">Ouvrir le menu</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6">
                  <path
                    d="M4 7a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm0 5a1 1 0 0 1 1-1h14a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm1 4a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H5Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-md transition-opacity duration-200 motion-reduce:transition-none"
          role="dialog"
          aria-modal="true"
          onClick={() => setMobileOpen(false)}
        >
          <div
            id="mobile-nav"
            ref={mobileDrawerRef}
            className="flex h-full w-full flex-col justify-between bg-gradient-to-b from-white/90 to-white/70 px-6 pb-10 pt-6 shadow-2xl transition-transform duration-200 motion-reduce:transition-none dark:from-slate-900/95 dark:to-slate-900/80"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <Link
                href={brand.href}
                className="flex items-center gap-2 rounded-full px-2 py-1 text-base font-semibold text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 dark:text-slate-100"
                onClick={() => setMobileOpen(false)}
              >
                {resolvedBrandLogo}
                <span>{brand.label}</span>
              </Link>
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300/60 bg-white/60 text-slate-700 transition hover:border-accent/60 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-200"
                onClick={() => setMobileOpen(false)}
                aria-label="Fermer le menu"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6">
                  <path
                    d="M6.225 4.811a1 1 0 0 1 1.414 0L12 9.172l4.361-4.361a1 1 0 0 1 1.414 1.414L13.414 10.5l4.361 4.361a1 1 0 1 1-1.414 1.414L12 11.914l-4.361 4.361a1 1 0 1 1-1.414-1.414L10.586 10.5 6.225 6.139a1 1 0 0 1 0-1.414Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>

            <div className="mt-10 grow overflow-y-auto">
              <ul className="space-y-4">
                {resolvedLinks.map((link) => {
                  const active = isActive(link.href);
                  if (link.children && link.children.length > 0) {
                    const expanded = mobileSection === link.href;
                    return (
                      <li key={link.href}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-2xl border border-slate-200/60 bg-white/70 px-5 py-4 text-left text-base font-semibold text-slate-800 transition hover:border-accent/50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-100"
                          onClick={() =>
                            setMobileSection((prev) =>
                              prev === link.href ? null : link.href
                            )
                          }
                          aria-expanded={expanded}
                          aria-controls={`section-${link.href}`}
                        >
                          <span>{link.label}</span>
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className={cn(
                              "h-5 w-5 transition-transform",
                              expanded ? "rotate-180" : "rotate-0"
                            )}
                          >
                            <path
                              d="M6.293 9.293a1 1 0 0 1 1.414 0L12 13.586l4.293-4.293a1 1 0 0 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 0 1 0-1.414Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>
                        {expanded && (
                          <ul
                            id={`section-${link.href}`}
                            className="mt-3 space-y-3 rounded-2xl bg-white/50 p-4 dark:bg-slate-900/50"
                          >
                            {link.children.map((child) => (
                              <li key={child.href}>
                                <Link
                                  href={child.href}
                                  onClick={() => navigateAndClose(child.href)}
                                  className="flex flex-col gap-1 rounded-2xl px-3 py-2 text-sm text-slate-700 transition hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 dark:text-slate-200"
                                >
                                  <span className="font-medium">{child.label}</span>
                                  {child.desc && (
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                      {child.desc}
                                    </span>
                                  )}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  }

                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        onClick={() => navigateAndClose(link.href)}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center justify-between rounded-2xl border border-transparent bg-white/70 px-5 py-4 text-base font-semibold text-slate-800 transition hover:border-accent/50 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:bg-slate-900/60 dark:text-slate-100",
                          active && "border-accent/60 text-accent"
                        )}
                      >
                        {link.label}
                        {active && (
                          <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-6 space-y-3">
              {enableThemeToggle && hasMounted && (
                <div className="rounded-2xl border border-slate-200/60 bg-white/60 p-3 dark:border-slate-700/60 dark:bg-slate-900/60">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                    Thème
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {themeOptions.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={cn(
                          "rounded-xl px-2 py-2 text-xs font-medium capitalize text-slate-600 transition hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:transition-none dark:text-slate-100",
                          theme === option && "bg-accent/10 text-accent"
                        )}
                        onClick={() => setTheme(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {cta && (
                <Link
                  href={cta.href}
                  onClick={() => navigateAndClose(cta.href)}
                  className="flex w-full items-center justify-center rounded-full bg-accent px-5 py-3 text-base font-semibold text-slate-900 shadow-sm transition hover:translate-y-0.5 hover:bg-accent/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/60 motion-reduce:translate-y-0 motion-reduce:transition-none"
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
