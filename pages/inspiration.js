import Head from "next/head";
import Home, { getStaticProps } from "./index";

const INSPIRATION_COLOR_SWATCHES = [
  "#8B5CF6",
  "#F97316",
  "#10B981",
  "#38BDF8",
  "#F43F5E",
  "#FACC15",
  "#F368E0",
  "#CC8E35",
  "#2563EB",
  "#0EA5E9",
  "#D946EF",
  "#14B8A6",
  "#FBBF24",
  "#A855F7",
  "#22C55E",
  "#F472B6",
];

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
      <Home
        {...props}
        defaultInputMode="color"
        allowedInputModes={["color"]}
        identitySelectionMode="random"
        proposalLayout="grid"
        proposalCount={24}
        colorSuggestions={INSPIRATION_COLOR_SWATCHES}
        showModelPrediction={false}
        showIdentityHint={false}
      />
    </>
  );
}
