// pages/_app.js
import "../public/styles.css";

export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />;
}