// pages/_app.js
import "../public/styles.css";
import { LanguageProvider } from "../lib/i18n";
import { Navbar } from "../app/components/Navbar";

const NAV_LINKS = [
  { label: "Accueil", href: "/" },
  {
    label: "Collections",
    href: "/collections",
    children: [
      {
        label: "Dernières",
        href: "/collections/recent",
        desc: "Skins ajoutés récemment",
      },
      {
        label: "Populaires",
        href: "/collections/top",
        desc: "Tendances du moment",
      },
    ],
  },
];

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
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
