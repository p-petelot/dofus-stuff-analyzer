// pages/_app.js
import "../public/styles.css";
import { LanguageProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/themeContext";

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <Component {...pageProps} />
      </ThemeProvider>
    </LanguageProvider>
  );
}
