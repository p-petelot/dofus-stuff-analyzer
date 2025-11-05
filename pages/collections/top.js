import Head from "next/head";
import Link from "next/link";

export default function TopCollectionsPage() {
  return (
    <>
      <Head>
        <title>Collections populaires | KrosPalette</title>
        <meta
          name="description"
          content="Découvrez les collections de skins les plus appréciées de la communauté KrosPalette."
        />
      </Head>

      <main className="page collections-page">
        <div className="collections-shell">
          <header className="collections-header">
            <Link href="/collections" className="collections-breadcrumb">
              ← Collections
            </Link>
            <h1>Collections populaires</h1>
            <p>
              Les meilleures créations de la communauté seront bientôt rassemblées ici. Retrouvez facilement les palettes les
              plus consultées et partagez vos coups de cœur.
            </p>
          </header>

          <section className="collections-placeholder" aria-live="polite">
            <p>
              Les classements communautaires arrivent bientôt. Nous analysons actuellement les votes et les partages pour vous
              proposer un top pertinent.
            </p>
            <p>
              Continuez d'explorer les skins et participez en enregistrant vos looks favoris pour soutenir leurs créateurs.
            </p>
            <Link href="/" className="collections-cta">
              Parcourir les skins
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}
