import Head from "next/head";
import Home, { getStaticProps } from "./index";

export { getStaticProps };

export default function InspirationPage(props) {
  return (
    <>
      <Head>
        <title>Inspiration | KrosPalette</title>
        <meta
          name="description"
          content="Trouve de nouvelles inspirations de skins à partir d'une couleur."
        />
      </Head>
      <Home {...props} defaultInputMode="color" />
    </>
  );
}
