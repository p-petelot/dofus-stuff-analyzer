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
  "#0EA5E9",
  "#EC4899",
  "#78350F",
  "#64748B",
  "#0F766E",
  "#4C1D95",
  "#A16207",
];

export { getStaticProps };

export default function InspirationPage(props) {
  return (
    <>
      <Head>
        <title>Inspiration | KROSKIN</title>
        <meta
          name="description"
          content="Trouve de nouvelles inspirations de skins KROSKIN à partir d'une couleur signature."
        />
      </Head>
      <Home
        {...props}
        defaultInputMode="color"
        allowedInputModes={["color"]}
        identitySelectionMode="random"
        proposalLayout="grid"
        proposalCount={48}
        colorSuggestions={INSPIRATION_COLOR_SWATCHES}
        showModelPrediction={false}
        showIdentityHint={false}
        layoutVariant="inspiration"
      />
    </>
  );
}
