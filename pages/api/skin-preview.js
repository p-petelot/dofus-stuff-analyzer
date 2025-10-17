const BARBOFUS_RENDER_BASE_URL = "https://barbofus.com/skinator/render";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const { s } = req.query;

  if (!s || (Array.isArray(s) && s.length === 0)) {
    res.status(400).json({ error: "Missing skin configuration" });
    return;
  }

  const config = Array.isArray(s) ? s[0] : s;

  if (typeof config !== "string" || !config.trim()) {
    res.status(400).json({ error: "Invalid skin configuration" });
    return;
  }

  const target = `${BARBOFUS_RENDER_BASE_URL}?s=${encodeURIComponent(config)}`;

  try {
    const response = await fetch(target, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      res.status(response.status).json({ error: "Unable to fetch preview" });
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const contentType = response.headers.get("content-type") ?? "image/webp";
    res.setHeader("Content-Type", contentType);

    const cacheControl = response.headers.get("cache-control");
    if (cacheControl) {
      res.setHeader("Cache-Control", cacheControl);
    } else {
      res.setHeader("Cache-Control", "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400");
    }

    const contentLength = buffer.length.toString();
    res.setHeader("Content-Length", contentLength);
    res.status(200).send(buffer);
  } catch (error) {
    console.error("Failed to proxy Barbofus preview:", error);
    res.status(502).json({ error: "Preview generation failed" });
  }
}
