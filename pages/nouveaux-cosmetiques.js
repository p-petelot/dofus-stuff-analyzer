import Head from "next/head";
import Link from "next/link";
import PropTypes from "prop-types";
import { fetchDofusNews } from "../lib/news/fetchNews";

function formatDate(dateIso, fallback) {
  if (dateIso) {
    const parsed = new Date(dateIso);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    }
  }

  return fallback || "Date inconnue";
}

function NewsCard({ item }) {
  return (
    <article className="news-card">
      <div className="news-card__image" aria-hidden={!item.image}>
        {item.image ? (
          <img src={item.image} alt={item.title} loading="lazy" />
        ) : (
          <div className="news-card__placeholder">Image indisponible</div>
        )}
      </div>
      <div className="news-card__body">
        <h2 className="news-card__title">
          <Link href={item.link} target="_blank" rel="noopener noreferrer" prefetch={false}>
            {item.title}
          </Link>
        </h2>
        <p className="news-card__date">{formatDate(item.publishedAt, item.publishedAtText)}</p>
        <div
          className="news-card__description"
          dangerouslySetInnerHTML={{ __html: item.descriptionHtml }}
        />
        <Link
          className="news-card__cta"
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
          prefetch={false}
        >
          Lire l&apos;article
        </Link>
      </div>
    </article>
  );
}

const newsItemPropType = PropTypes.shape({
  link: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  image: PropTypes.string,
  descriptionHtml: PropTypes.string,
  publishedAt: PropTypes.string,
  publishedAtText: PropTypes.string,
});

NewsCard.propTypes = {
  item: newsItemPropType.isRequired,
};

export default function NouveauxCosmetiquesPage({ news, currentPage, error }) {
  const previousPage = currentPage > 1 ? currentPage - 1 : null;
  const nextPage = currentPage + 1;

  return (
    <>
      <Head>
        <title>Nouveaux cosmétiques | KrosPalette</title>
        <meta
          name="description"
          content="Consultez les dernières actualités Dofus sur les nouveaux cosmétiques et naviguez facilement entre les pages."
        />
      </Head>
      <main className="news-page">
        <header className="news-page__header">
          <div>
            <p className="news-page__eyebrow">Nouveautés officielles</p>
            <h1>Nouveaux cosmétiques</h1>
          </div>
          <p className="news-page__intro">
            Parcourez les actualités publiées sur le site officiel de Dofus pour découvrir les
            derniers cosmétiques, leurs visuels et leurs descriptions détaillées.
          </p>
        </header>

        {error ? <div className="news-page__alert">{error}</div> : null}

        <section aria-label="Liste des actualités" className="news-grid">
          {news.length === 0 ? (
            <p className="news-page__empty">Aucune actualité n&apos;a pu être chargée.</p>
          ) : (
            news.map((item) => <NewsCard key={item.link} item={item} />)
          )}
        </section>

        <nav className="news-pagination" aria-label="Pagination des actualités">
          <div className="news-pagination__actions">
            <Link
              className={`news-pagination__link ${previousPage ? "" : "news-pagination__link--disabled"}`}
              href={{ pathname: "/nouveaux-cosmetiques", query: { page: previousPage ?? 1 } }}
              prefetch={false}
              aria-disabled={previousPage === null}
            >
              Page précédente
            </Link>
            <Link
              className="news-pagination__link"
              href={{ pathname: "/nouveaux-cosmetiques", query: { page: nextPage } }}
              prefetch={false}
            >
              Page suivante
            </Link>
          </div>
          <p className="news-pagination__info">Page {currentPage}</p>
        </nav>
      </main>
    </>
  );
}

NouveauxCosmetiquesPage.propTypes = {
  news: PropTypes.arrayOf(newsItemPropType).isRequired,
  currentPage: PropTypes.number.isRequired,
  error: PropTypes.string,
};

export async function getServerSideProps({ query }) {
  const pageParam = Array.isArray(query?.page) ? query.page[0] : query?.page;
  const parsedPage = Number.parseInt(pageParam, 10);
  const currentPage = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;

  try {
    const news = await fetchDofusNews(currentPage);

    return {
      props: {
        news,
        currentPage,
      },
    };
  } catch (err) {
    const fallbackMessage =
      err instanceof Error && err.message
        ? err.message
        : "Une erreur est survenue lors du chargement des actualités.";

    return {
      props: {
        news: [],
        currentPage,
        error: fallbackMessage,
      },
    };
  }
}
