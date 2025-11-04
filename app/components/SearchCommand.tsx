"use client";

import Router from "next/router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { NavLink } from "./types";

interface SearchCommandProps {
  links: NavLink[];
  open: boolean;
  onClose: () => void;
}

type SearchItem = {
  label: string;
  href: string;
  desc?: string;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

function flattenLinks(links: NavLink[]): SearchItem[] {
  return links.flatMap((link) => {
    if (link.children && link.children.length > 0) {
      return [
        { label: link.label, href: link.href },
        ...link.children.map((child) => ({
          label: `${link.label} · ${child.label}`,
          href: child.href,
          desc: child.desc,
        })),
      ];
    }

    return [{ label: link.label, href: link.href }];
  });
}

export function SearchCommand({ links, open, onClose }: SearchCommandProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");

  const items = useMemo(() => flattenLinks(links), [links]);
  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) {
      return items;
    }

    return items.filter((item) =>
      [item.label, item.desc, item.href]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term))
    );
  }, [items, query]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }

    const node = containerRef.current;
    if (!node) {
      return;
    }

    const focusable = node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    const first = focusable[0] ?? null;
    const last = focusable[focusable.length - 1] ?? null;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
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
      inputRef.current?.focus();
    });

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  const handleNavigate = useCallback(
    (href: string) => {
      onClose();
      Router.push(href);
    },
    [onClose]
  );

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-slate-950/60 px-4 py-20 backdrop-blur-sm transition-opacity duration-150 motion-reduce:transition-none"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl overflow-hidden rounded-3xl border border-slate-500/20 bg-slate-900/80 shadow-2xl backdrop-blur-xl transition-transform duration-150 motion-reduce:transition-none"
        ref={containerRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-500/15 bg-slate-900/60 px-5 py-4">
          <div className="rounded-full border border-slate-500/30 bg-slate-900/70 px-3 py-1 text-xs font-medium uppercase tracking-[0.3em] text-slate-300/70">
            Commande
          </div>
          <p className="text-xs text-slate-300/70">
            Tapez pour naviguer. Appuyez sur <kbd className="rounded border border-slate-400/30 px-1.5 py-0.5 text-[10px] uppercase tracking-widest">Esc</kbd> pour fermer.
          </p>
        </div>
        <div className="flex items-center gap-2 px-5 py-4">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-5 w-5 text-slate-300/60"
          >
            <path
              d="M11 5a6 6 0 0 1 4.472 9.983l3.272 3.273a1 1 0 0 1-1.414 1.414l-3.273-3.272A6 6 0 1 1 11 5Zm0 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"
              fill="currentColor"
            />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher une page..."
            className="h-11 w-full bg-transparent text-base text-slate-100 placeholder:text-slate-400 focus:outline-none"
            aria-label="Rechercher"
          />
          <kbd className="hidden rounded border border-slate-400/30 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-slate-300/70 sm:inline-flex">
            ⌘K
          </kbd>
        </div>
        <div className="max-h-80 overflow-y-auto px-2 pb-4">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-sm text-slate-300/70">
              Aucun résultat ne correspond à votre recherche.
            </p>
          ) : (
            <ul className="space-y-1">
              {results.map((item) => (
                <li key={item.href}>
                  <button
                    type="button"
                    className="group flex w-full flex-col rounded-2xl border border-transparent bg-slate-900/40 px-4 py-3 text-left transition duration-150 hover:border-accent/40 hover:bg-slate-900/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent/70 motion-reduce:transition-none"
                    onClick={() => handleNavigate(item.href)}
                  >
                    <span className="text-sm font-medium text-slate-100 group-hover:text-accent group-focus-visible:text-accent">
                      {item.label}
                    </span>
                    <span className="text-xs text-slate-400">
                      {item.desc ?? item.href}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
