import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useLanguage } from "../lib/i18n";

function buildPlaceholderSkins(t) {
  const baseTitle = t("brand.name");
  const subtitle = t("gallery.placeholder.subtitle");
  return Array.from({ length: 200 }).map((_, index) => ({
    id: `placeholder-${index}`,
    title: `${baseTitle} #${index + 1}`,
    subtitle,
    preview: "/icons/app-icon.svg",
  }));
}

function GalleryCard({ entry, onSelect }) {
  return (
    <button type="button" className="gallery-card" onClick={() => onSelect(entry)}>
      <div className="gallery-card__preview">
        <img src={entry.preview} alt="" loading="lazy" />
      </div>
      <div className="gallery-card__meta">
        <span className="gallery-card__title">{entry.title}</span>
        {entry.subtitle ? <span className="gallery-card__subtitle">{entry.subtitle}</span> : null}
      </div>
    </button>
  );
}

export default function GalleryPage() {
  const { language, t } = useLanguage();
  const placeholderData = useMemo(() => buildPlaceholderSkins(t), [language, t]);
  const [entries, setEntries] = useState(() => placeholderData.slice(0, 24));
  const [hasMore, setHasMore] = useState(placeholderData.length > 24);
  const [selected, setSelected] = useState(null);
  const loaderRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    setEntries(placeholderData.slice(0, 24));
    setHasMore(placeholderData.length > 24);
  }, [placeholderData]);

  const pageTitle = useMemo(() => `${t("brand.name")} · ${t("gallery.title")}`, [t]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entriesList) => {
        if (!hasMore) return;
        if (entriesList.some((entry) => entry.isIntersecting)) {
          setEntries((previous) => {
            const nextCount = previous.length + 24;
            if (nextCount >= placeholderData.length) {
              setHasMore(false);
              return placeholderData;
            }
            return placeholderData.slice(0, nextCount);
          });
        }
      },
      { rootMargin: "256px" },
    );

    const node = loaderRef.current;
    if (node) {
      observer.observe(node);
    }
    return () => {
      if (node) {
        observer.unobserve(node);
      }
      observer.disconnect();
    };
  }, [hasMore, placeholderData]);

  const handleBack = useCallback(() => {
    setSelected(null);
    if (typeof window !== "undefined" && router.asPath.startsWith("/gallery")) {
      window.history.replaceState(null, "", router.asPath.split("#")[0]);
    }
  }, [router]);

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <main className="gallery-page">
        <header className="gallery-page__header">
          <div className="gallery-page__headline">
            <h1>{t("gallery.title")}</h1>
            <p className="gallery-page__lead">{t("gallery.lead")}</p>
          </div>
          <nav className="gallery-page__nav" aria-label={t("navigation.label")}>
            <Link href="/" className="gallery-page__nav-link">
              {t("navigation.analyzer")}
            </Link>
            <Link href="/gallery" className="gallery-page__nav-link" aria-current="page">
              {t("navigation.gallery")}
            </Link>
          </nav>
        </header>
        <section className="gallery-grid" aria-live="polite">
          {entries.map((entry) => (
            <GalleryCard key={entry.id} entry={entry} onSelect={setSelected} />
          ))}
        </section>
        {hasMore ? (
          <div className="gallery-page__loader" ref={loaderRef} aria-hidden="true">
            <span className="gallery-page__loader-bar" />
            <span className="sr-only">{t("gallery.loading")}</span>
          </div>
        ) : null}
      </main>
      {selected ? (
        <div className="gallery-detail" role="dialog" aria-modal="true">
          <div className="gallery-detail__content">
            <button type="button" className="gallery-detail__close" onClick={handleBack}>
              {t("gallery.close")}
            </button>
            <div className="gallery-detail__preview">
              <img src={selected.preview} alt="" />
            </div>
            <div className="gallery-detail__meta">
              <h2>{selected.title}</h2>
              {selected.subtitle ? <p>{selected.subtitle}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
