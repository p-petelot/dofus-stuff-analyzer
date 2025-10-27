import Head from "next/head";
import AppHeader from "../components/AppHeader";
import { BRAND_NAME } from "../lib/constants";
import { useLanguage } from "../lib/i18n";

export default function TestPage() {
  const { t } = useLanguage();
  const pageTitle = `${BRAND_NAME} · ${t("navigation.test", undefined, "Page test")}`;
  const heroTitle = t("testPage.title", undefined, "Atelier créatif");
  const heroSubtitle = t(
    "testPage.subtitle",
    undefined,
    "Expérimente une navigation moderne et immersive avant de retourner à la palette."
  );

  const cardTitle = t("testPage.cardTitle", undefined, "Prototype en cours");
  const cardBody = t(
    "testPage.cardBody",
    undefined,
    "Cette page de démonstration met en scène le nouveau bandeau fixe, le sélecteur de thème intelligent et les options de langue. Navigue librement pour ressentir la fluidité de l'expérience."
  );

  const actionLabel = t("testPage.returnCTA", undefined, "Revenir à l'analyse de couleurs");

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <AppHeader />
      <main className="page test-page">
        <section className="test-page__hero">
          <h1>{heroTitle}</h1>
          <p>{heroSubtitle}</p>
        </section>
        <section className="test-page__content">
          <article className="test-card">
            <div className="test-card__halo" aria-hidden="true" />
            <div className="test-card__content">
              <h2>{cardTitle}</h2>
              <p>{cardBody}</p>
              <a className="test-card__cta" href="/">
                <span>{actionLabel}</span>
              </a>
            </div>
          </article>
        </section>
      </main>
    </>
  );
}
