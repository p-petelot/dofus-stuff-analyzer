import Head from "next/head";
import Link from "next/link";

export default function RecentCollectionsPage() {
  return (
    <>
      <Head>
        <title>Dernières collections | KrosPalette</title>
        <meta
          name="description"
          content="Retrouvez les toutes dernières collections de skins partagées sur KrosPalette."
        />
      </Head>

      <main className="page collections-page">
        <div className="collections-shell">
          <header className="collections-header">
            <Link href="/collections" className="collections-breadcrumb">
              ← Collections
            </Link>
            <h1>Dernières collections</h1>
            <p>
              Suivez les nouveautés de la communauté en temps réel. Dès qu'une collection est publiée, elle s'affichera ici
              pour que vous puissiez l'explorer sans attendre.
            </p>
          </header>

          <section className="collections-placeholder" aria-live="polite">
            <p>
              Les dernières collections validées apparaîtront bientôt dans cette section. Revenez régulièrement ou activez vos
              notifications pour ne rien manquer.
            </p>
            <p>
              En attendant, explorez la bibliothèque principale et sauvegardez vos inspirations favorites.
            </p>
            <Link href="/" className="collections-cta">
              Explorer la bibliothèque
            </Link>
          </section>
        </div>
      </main>
    </>
  );
}
