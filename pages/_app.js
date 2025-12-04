// pages/_app.js
import Head from "next/head";
import "../public/styles.css";
import { LanguageProvider } from "../lib/i18n";
import { Navbar } from "../app/components/Navbar";

const NAV_LINKS = [
  { label: "Accueil", href: "/" },
  { label: "Inspiration", href: "/inspiration" },
  { label: "Nouveaux cosmétiques", href: "/nouveaux-cosmetiques" },
  { label: "Vision", href: "/vision" },
];

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <Head>
        <link rel="icon" href="/logo.svg" />
      </Head>
      <Navbar
        brand={{ label: "KrosPalette", href: "/" }}
        links={NAV_LINKS}
        enableSearch
        enableThemeToggle
      />
      <Component {...pageProps} />
    </LanguageProvider>
  );
}
