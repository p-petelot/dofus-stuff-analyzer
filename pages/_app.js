// pages/_app.js
import "../public/styles.css";
import { LanguageProvider } from "../lib/i18n";
import { Navbar } from "../app/components/Navbar";

const NAV_LINKS = [
  { label: "Accueil", href: "/" },
  { label: "Générateur", href: "/skinator" },
  {
    label: "Collections",
    href: "/collections",
    children: [
      {
        label: "Dernières",
        href: "/collections?sort=recent",
        desc: "Skins ajoutés récemment",
      },
      {
        label: "Populaires",
        href: "/collections?sort=top",
        desc: "Tendances du moment",
      },
    ],
  },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <Navbar
        brand={{ label: "KrosPalette", href: "/" }}
        links={NAV_LINKS}
        cta={{ label: "Commencer", href: "/skinator" }}
        enableSearch
      />
      <Component {...pageProps} />
    </LanguageProvider>
  );
}
