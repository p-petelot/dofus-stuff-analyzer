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
import styles from "./SearchCommand.module.css";

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
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={styles.dialog}
        ref={containerRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div className={styles.badge} aria-hidden>
            Commande
          </div>
          <p className={styles.hint}>
            Tapez pour naviguer. Appuyez sur <kbd>Esc</kbd> pour fermer.
          </p>
        </header>
        <div className={styles.inputRow}>
          <svg aria-hidden="true" viewBox="0 0 24 24">
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
            className={styles.input}
            aria-label="Rechercher"
          />
          <kbd className={styles.shortcut}>⌘K</kbd>
        </div>
        <div className={styles.results}>
          {results.length === 0 ? (
            <p className={styles.empty}>Aucun résultat ne correspond à votre recherche.</p>
          ) : (
            <ul className={styles.list}>
              {results.map((item) => (
                <li key={item.href}>
                  <button
                    type="button"
                    className={styles.result}
                    onClick={() => handleNavigate(item.href)}
                  >
                    <span className={styles.resultLabel}>{item.label}</span>
                    <span className={styles.resultDesc}>{item.desc ?? item.href}</span>
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
