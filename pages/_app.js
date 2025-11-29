// pages/_app.js
import Head from "next/head";
import "../public/styles.css";
import { LanguageProvider } from "../lib/i18n";
import { Navbar } from "../app/components/Navbar";

const NAV_LINKS = [
  { label: "Générateur", href: "/" },
  { label: "Inspiration", href: "/inspiration" },
  { label: "Export", href: "/vision" },
  { label: "À propos", href: "/#kroskin-about" },
];

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <Head>
        <link rel="icon" href="/favicon.svg" />
        <link rel="alternate icon" href="/favicon-dark.svg" />
      </Head>
      <Navbar
        brand={{ label: "KROSKIN", href: "/" }}
        links={NAV_LINKS}
        enableSearch
        enableThemeToggle
      />
      <Component {...pageProps} />
    </LanguageProvider>
  );
}
