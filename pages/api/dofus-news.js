import { fetchDofusNews } from "../../lib/news/fetchNews";

export default async function handler(req, res) {
  const pageParam = Array.isArray(req.query?.page) ? req.query.page[0] : req.query?.page;
  const parsedPage = Number.parseInt(pageParam ?? "1", 10);
  const page = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;

  try {
    const news = await fetchDofusNews(page);

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=900");
    res.status(200).json({ page, news });
  } catch (error) {
    res
      .status(502)
      .json({ error: error instanceof Error ? error.message : "Impossible de récupérer les actualités." });
  }
}
