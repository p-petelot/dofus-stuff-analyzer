import Head from "next/head";
import Link from "next/link";

const COLLECTION_SECTIONS = [
  {
    href: "/collections/galerie",
    title: "Galerie générée par l'IA",
    description:
      "Accédez aux skins concoctés automatiquement : classes aléatoires, palettes harmonisées et équipements assortis.",
  },
];

export default function CollectionsLanding() {
  return (
    <>
      <Head>
        <title>Collections | KrosPalette</title>
        <meta
          name="description"
          content="Explorez les dernières collections de skins Dofus partagées par la communauté sur KrosPalette."
        />
      </Head>

      <main className="page collections-page">
        <div className="collections-shell">
          <header className="collections-hero">
            <span className="collections-eyebrow">Collections</span>
            <h1>Explorer les univers créés par la communauté</h1>
            <p>
              Plongez dans les propositions de skins des joueurs, récupérez les palettes qui vous inspirent et
              enrichissez vos propres créations en quelques clics.
            </p>
          </header>

          <section className="collections-grid" aria-label="Types de collections">
            {COLLECTION_SECTIONS.map((section) => (
              <Link key={section.href} href={section.href} className="collections-card">
                <span className="collections-card__label">{section.title}</span>
                <p className="collections-card__desc">{section.description}</p>
                <span className="collections-card__cta">Explorer</span>
              </Link>
            ))}
          </section>
        </div>
      </main>
    </>
  );
}
