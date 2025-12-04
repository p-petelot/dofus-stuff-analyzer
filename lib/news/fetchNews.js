const DOFUS_BASE_URL = "https://www.dofus.com";
const NEWS_PATH = "/fr/mmorpg/actualites/news";
const NEWS_ITEM_MARKER = '<div class="ak-item-elt ak-universe-key-mmorpg">';

const FRENCH_MONTHS = {
  janvier: 0,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
};

function normalizeDiacritics(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function sliceNewsBlocks(html) {
  const blocks = [];
  let currentIndex = 0;

  while (true) {
    const start = html.indexOf(NEWS_ITEM_MARKER, currentIndex);
    if (start === -1) {
      break;
    }

    const nextStart = html.indexOf(NEWS_ITEM_MARKER, start + NEWS_ITEM_MARKER.length);
    const end = nextStart === -1 ? html.length : nextStart;

    blocks.push(html.slice(start, end));
    currentIndex = end;
  }

  return blocks;
}

function extractMatch(html, regex) {
  const match = html.match(regex);
  return match ? match[1].trim() : "";
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseFrenchDateToIso(dateText) {
  if (!dateText) {
    return null;
  }

  const normalized = normalizeDiacritics(dateText).toLowerCase();
  const match = normalized.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);

  if (!match) {
    return null;
  }

  const [, dayText, monthName, yearText] = match;
  const monthIndex = FRENCH_MONTHS[monthName];

  if (typeof monthIndex !== "number") {
    return null;
  }

  const day = Number.parseInt(dayText, 10);
  const year = Number.parseInt(yearText, 10);
  const date = new Date(Date.UTC(year, monthIndex, day));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function parseNewsBlock(block) {
  const linkPath =
    extractMatch(block, /class="ak-link-img"[^>]*href="([^"]+)"/i) ||
    extractMatch(block, /class="ak-item-elt-title"[\s\S]*?href="([^"]+)"/i);

  if (!linkPath) {
    return null;
  }

  const title =
    extractMatch(
      block,
      /class="ak-item-elt-title"[\s\S]*?<span class="ak-text">[\s\S]*?<a[^>]*>([^<]+)<\/a>/i,
    ) || "";

  const image =
    extractMatch(block, /<img[^>]+data-src="([^"]+)"[^>]*class="img-responsive"/i) ||
    extractMatch(block, /<img[^>]+src="([^"]+)"[^>]*class="img-responsive"/i) ||
    extractMatch(block, /<img[^>]+data-src="([^"]+)"/i) ||
    extractMatch(block, /<img[^>]+src="([^"]+)"/i);

  const descriptionHtml = extractMatch(block, /class="ak-item-elt-desc">([\s\S]*?)<\/div>/i);

  const publication = extractMatch(block, /class="ak-publication">([\s\S]*?)<\/span>/i);
  const publicationText = publication
    .replace(/<[^>]+>/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const publishedAt = parseFrenchDateToIso(publicationText);

  return {
    link: new URL(linkPath, DOFUS_BASE_URL).href,
    title: decodeHtmlEntities(title),
    image,
    descriptionHtml: descriptionHtml.trim(),
    publishedAt,
    publishedAtText: publicationText,
  };
}

export async function fetchDofusNews(page = 1) {
  const pageNumber = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const url = new URL(NEWS_PATH, DOFUS_BASE_URL);
  url.searchParams.set("page", String(pageNumber));

  const browserHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.8",
    Referer: new URL(NEWS_PATH, DOFUS_BASE_URL).href,
    Connection: "keep-alive",
    "Cache-Control": "max-age=0",
    "Upgrade-Insecure-Requests": "1",
    "sec-ch-ua": '"Chromium";v="120", "Not?A_Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-User": "?1",
    "Sec-Fetch-Dest": "document",
  };

  let response;

  try {
    response = await fetch(url.toString(), {
      // The Dofus website returns 403 for requests without a real browser
      // signature. Provide full browser-like headers to mimic a user agent
      // and keep SSR fetches working in production.
      headers: browserHeaders,
      cache: "no-store",
      redirect: "follow",
    });
  } catch (error) {
    throw new Error("Impossible de récupérer les actualités (erreur réseau).");
  }

  if (!response.ok) {
    throw new Error(`Impossible de récupérer les actualités (code ${response.status}).`);
  }

  const html = await response.text();
  const blocks = sliceNewsBlocks(html);

  return blocks
    .map((block) => parseNewsBlock(block))
    .filter((item) => Boolean(item?.link));
}

export function parseNewsDate(dateText) {
  return parseFrenchDateToIso(dateText);
}
