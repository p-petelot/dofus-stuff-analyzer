// pages/_app.js
import "../public/tokens.css";
import "../public/styles.css";
import "../public/overlay.css";

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}