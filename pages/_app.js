// pages/_app.js
import Head from "next/head";
import "../public/styles.css";
import { LanguageProvider } from "../lib/i18n";
import { Navbar } from "../app/components/Navbar";

const NAV_LINKS = [
  { label: "Accueil", href: "/" },
  { label: "Vision", href: "/vision" },
  {
    label: "Collections",
    href: "/collections",
    children: [
      {
        label: "Collection Thèmes",
        href: "/collections/themes",
        desc: "Choisissez une couleur et explorez des skins variés",
      },
    ],
  },
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
