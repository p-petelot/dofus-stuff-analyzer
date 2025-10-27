import Home, { getStaticProps } from "./index";

export { getStaticProps };

export default function GalleryPage(props) {
  return <Home {...props} initialView="gallery" />;
}
