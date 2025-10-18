// pages/_app.js
import "../public/styles.css";
import { LanguageProvider } from "../lib/i18n";

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <Component {...pageProps} />
    </LanguageProvider>
  );
}
