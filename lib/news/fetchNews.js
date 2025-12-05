import dns from "node:dns";
import fallbackNews from "../../data/dofusNewsFallback.js";

const DOFUS_NEWS_BASE = "https://www.dofus.com/fr/mmorpg/actualites/news";
const FEEDS = {
  fr: ["https://www.dofus.com/fr/rss/news.xml"],
};
const DEFAULT_IMAGE =
  "https://www.dofus.com/sites/all/themes/dofus/images/favicon/apple-touch-icon-180x180.png";
const DOFUS_HOSTS = ["www.dofus.com", "dofus.com", "static.ankama.com"];
const NEWS_ITEM_MARKER = '<div class="ak-item-elt ak-universe-key-mmorpg">';
const FETCH_TIMEOUT_MS = 15000;
const PAGE_SIZE = 24;

if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

const UA_POOL = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
];

const BASE_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9,en;q=0.7",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Referer: "https://www.google.com/",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-User": "?1",
  "Sec-Fetch-Dest": "document",
};

const FRENCH_MONTHS = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  aout: 7,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  décembre: 11,
};

function pickUA(index = 0) {
  return UA_POOL[index % UA_POOL.length];
}

function hostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch (_) {
    return "";
  }
}

function isDofusDomain(url) {
  const host = hostname(url);
  return DOFUS_HOSTS.some((value) => host === value || host.endsWith(`.${value}`));
}

function toSnap(url) {
  return `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
}

function looksLikeTextSnapshot(value) {
  return value && !/<html|<body|<div|<span|<a\s|<img/i.test(value);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSnapshotsCascade(url, debug = false) {
  const layers = [toSnap(url), toSnap(toSnap(url)), toSnap(toSnap(toSnap(url)))];

  for (let i = 0; i < layers.length; i += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(layers[i], {
        headers: { ...BASE_HEADERS, "User-Agent": pickUA(i) },
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timeout);

      if (response.ok) {
        const text = await response.text();
        if (debug) {
          // eslint-disable-next-line no-console
          console.error(`[snapshot] OK layer=${i + 1}`);
        }
        return { ok: true, source: `snapshot${i + 1}`, status: response.status, text };
      }

      if (debug) {
        // eslint-disable-next-line no-console
        console.error(`[snapshot] layer=${i + 1} HTTP ${response.status}`);
      }
    } catch (error) {
      clearTimeout(timeout);
      if (debug) {
        // eslint-disable-next-line no-console
        console.error(`[snapshot] layer=${i + 1} err: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await delay(120 + Math.random() * 200);
  }

  return { ok: false, source: "none", status: 0, text: "" };
}

async function smartFetch(url, { debug = false } = {}) {
  if (isDofusDomain(url)) {
    return fetchSnapshotsCascade(url, debug);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { ...BASE_HEADERS, "User-Agent": pickUA(0) },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    if (response.ok) {
      return { ok: true, source: "direct", status: response.status, text: await response.text() };
    }

    if (debug) {
      // eslint-disable-next-line no-console
      console.error(`[smartFetch] ${url} -> HTTP ${response.status}`);
    }
  } catch (error) {
    clearTimeout(timeout);
    if (debug) {
      // eslint-disable-next-line no-console
      console.error(`[smartFetch] ${url} err: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { ok: false, source: "none", status: 0, text: "" };
}

function normalizeDiacritics(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function stripTags(html) {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHTML(value) {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, (_, x) => x)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

function parseFrenchDateToIso(dateText) {
  if (!dateText) return null;

  const normalized = normalizeDiacritics(dateText).toLowerCase();
  const match = normalized.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (!match) return null;

  const [, dayText, monthName, yearText] = match;
  const monthIndex = FRENCH_MONTHS[monthName];
  if (typeof monthIndex !== "number") return null;

  const day = Number.parseInt(dayText, 10);
  const year = Number.parseInt(yearText, 10);
  const date = new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function extractMatch(html, regex) {
  const match = html.match(regex);
  return match ? match[1].trim() : "";
}

function absolutize(url, base) {
  if (!url) return "";
  if (url.startsWith("//")) return `https:${url}`;
  try {
    return new URL(url, base).toString();
  } catch (_) {
    return url;
  }
}

function escapeRegex(value) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function sliceNewsBlocks(html) {
  const blocks = [];
  let currentIndex = 0;

  while (true) {
    const start = html.indexOf(NEWS_ITEM_MARKER, currentIndex);
    if (start === -1) break;

    const nextStart = html.indexOf(NEWS_ITEM_MARKER, start + NEWS_ITEM_MARKER.length);
    const end = nextStart === -1 ? html.length : nextStart;

    blocks.push(html.slice(start, end));
    currentIndex = end;
  }

  return blocks;
}

function parseArchiveBlock(block, baseUrl) {
  const linkPath =
    extractMatch(block, /class="ak-link-img"[^>]*href="([^"]+)"/i) ||
    extractMatch(block, /class="ak-item-elt-title"[\s\S]*?href="([^"]+)"/i);

  if (!linkPath) return null;

  const title =
    extractMatch(
      block,
      /class="ak-item-elt-title"[\s\S]*?<span class="ak-text">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
    ) || "";

  const image =
    extractMatch(block, /<img[^>]+data-src="([^"]+)"[^>]*class="img-responsive"/i) ||
    extractMatch(block, /<img[^>]+src="([^"]+)"[^>]*class="img-responsive"/i) ||
    extractMatch(block, /<img[^>]+data-src="([^"]+)"/i) ||
    extractMatch(block, /<img[^>]+src="([^"]+)"/i);

  const descriptionMatch = /class="ak-item-elt-desc">([\s\S]*?)<\/div>/i.exec(block);
  const descriptionHtml = descriptionMatch ? descriptionMatch[1].trim() : "";

  const publication = extractMatch(block, /class="ak-publication">([\s\S]*?)<\/span>/i);
  const publicationText = publication
    .replace(/<[^>]+>/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const publishedAt = parseFrenchDateToIso(publicationText);

  return {
    link: absolutize(linkPath, DOFUS_NEWS_BASE),
    title: decodeHTML(stripTags(title)) || stripTags(title),
    image: absolutize(image, DOFUS_NEWS_BASE),
    descriptionHtml,
    publishedAt,
    publishedAtText: publicationText,
    _sort: publishedAt ? Date.parse(publishedAt) : 0,
  };
}

  function parseArchiveTextSnapshot(text, baseUrl) {
    const out = [];
    const absLink = /(https?:\/\/www\.dofus\.com\/fr\/mmorpg\/actualites\/news\/\d+-[a-z0-9-]+)/gi;
    const relLink = /(\/fr\/mmorpg\/actualites\/news\/\d+-[a-z0-9-]+)/gi;
    const anchors = [];
    const markdownImageRe = /!\[[^\]]*]\([^)]*\)/g;
    const markdownLinkRe = /\[([^\]]+)\]\([^)]*\)/g;
    let match;

  while ((match = absLink.exec(text)) !== null) anchors.push({ href: match[1], pos: match.index });
  while ((match = relLink.exec(text)) !== null) anchors.push({ href: absolutize(match[1], baseUrl), pos: match.index });

  const uniq = new Map();
  anchors.forEach((anchor) => {
    if (!uniq.has(anchor.href)) uniq.set(anchor.href, anchor.pos);
  });
  const sorted = Array.from(uniq.entries())
    .map(([href, pos]) => ({ href, pos }))
    .sort((a, b) => a.pos - b.pos);

  const monthWords = "(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)";
  const dateRe = new RegExp(`\\b(\\d{1,2})\\s+${monthWords}\\s+(\\d{4})\\b`, "i");
  const imgRe = /(https?:\/\/static\.ankama\.com\/[^\s"'<>]+?\.(?:jpg|jpeg|png|webp))/i;

    for (let i = 0; i < sorted.length; i += 1) {
      const start = sorted[i].pos;
      const end = i + 1 < sorted.length ? sorted[i + 1].pos : text.length;
      const section = text.slice(start, end);

      const link = sorted[i].href;
      let title = "";
      const md = new RegExp(`\\[([^\\]]{3,})\\]\\(${escapeRegex(link)}\\)`);
      const mdMatch = md.exec(section);
      if (mdMatch) title = mdMatch[1].trim();

      if (!title) {
        const lines = section.split("\n").map((line) => line.trim()).filter(Boolean);
        const first = lines.find((line) => line.length >= 3);
        if (first) title = first.replace(markdownImageRe, "").replace(markdownLinkRe, "$1").trim();
      }

    const im = imgRe.exec(section);
    const image = im ? im[1] : "";

    const dm = dateRe.exec(section);
    const publishedAt = dm ? parseFrenchDateToIso(dm[0]) : null;

    out.push({
      link,
      title,
      image,
      descriptionHtml: "",
      publishedAt,
      publishedAtText: "",
      _sort: publishedAt ? Date.parse(publishedAt) : 0,
    });
  }

  const seen = new Set();
  const deduped = [];
  out.forEach((item) => {
    if (!seen.has(item.link)) {
      seen.add(item.link);
      deduped.push(item);
    }
  });
  return deduped;
}

function extractFirstImgSrc(html) {
  if (!html) return "";
  const re = /<img\b([^>]*)>/gi;
  const getAttr = (tag, attr) =>
    (new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i").exec(tag) || new RegExp(`${attr}\\s*=\\s*'([^']*)'`, "i").exec(tag))?.[1] || "";
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] || "";
    const src = getAttr(attrs, "src") || getAttr(attrs, "data-src") || "";
    if (src) return src;
    const srcset = getAttr(attrs, "srcset") || getAttr(attrs, "data-srcset");
    if (srcset) {
      const first = srcset.split(",")[0]?.trim() || "";
      const url = first.split(/\s+/)[0] || "";
      if (url) return url;
    }
  }
  return "";
}

function parseRSS(xml) {
  const out = [];
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  items.forEach((item) => {
    const get = (tag) => {
      const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(item);
      return m ? m[1].trim() : null;
    };

    const title = decodeHTML(get("title") || "").trim();
    let link = get("link");
    if (!link) {
      const alt = /<link\b[^>]*href="([^"]+)"/i.exec(item);
      if (alt) link = alt[1];
    }
    if (!link) return;

    const pubDateRaw = get("pubDate") || get("updated") || get("dc:date") || "";
    let image = null;

    const enc = /<enclosure\b[^>]*url="([^"]+)"/i.exec(item);
    if (enc) image = enc[1];
    if (!image) {
      const media = /<(?:media:content|media:thumbnail)\b[^>]*url="([^"]+)"/i.exec(item);
      if (media) image = media[1];
    }

    const descRaw = get("description") ? decodeHTML(get("description")) : "";
    const contentEncoded = /<content:encoded\b[^>]*>([\s\S]*?)<\/content:encoded>/i.exec(item);
    const content = contentEncoded ? decodeHTML(contentEncoded[1]) : "";
    if (!image) {
      const fromContent = extractFirstImgSrc(content) || extractFirstImgSrc(descRaw);
      if (fromContent) image = fromContent;
    }

    image = image ? absolutize(image, link || DOFUS_NEWS_BASE) : "";
    const publishedAt = parseFrenchDateToIso(pubDateRaw) || pubDateRaw || "";

    out.push({
      title,
      link,
      date: publishedAt,
      _sort: publishedAt ? Date.parse(publishedAt) : 0,
      image: image || "",
      descriptionHtml: descRaw || content,
    });
  });

  return out;
}

async function fetchFeed(url) {
  const res = await smartFetch(url, { debug: false });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status || "ERR"} on ${url}`);
  return parseRSS(res.text).map((item) => ({ ...item, _feed: url }));
}

async function fetchNewsFromRSS() {
  const urls = FEEDS.fr;
  let all = [];
  await Promise.all(
    urls.map(async (feedUrl) => {
      try {
        const entries = await fetchFeed(feedUrl);
        all = all.concat(entries);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[WARN] ${(error instanceof Error && error.message) || String(error)}`);
      }
    }),
  );
  return all;
}

function pickBestTitle(rssTitle, archiveTitle) {
  if (!archiveTitle) return rssTitle || "";
  if (!rssTitle) return archiveTitle;
  if (/^https?:/i.test(rssTitle) || /^\//.test(rssTitle)) return archiveTitle;
  if (/\/mmorpg\/actualites\/news\//i.test(rssTitle)) return archiveTitle;
  return rssTitle;
}

function pickBestImage(rssImg, archiveImg) {
  if (archiveImg && (!rssImg || /419540\.png$/i.test(rssImg))) {
    return archiveImg;
  }
  return rssImg || archiveImg || "";
}

function mergeNewsEntry(base, extra) {
  const merged = { ...base };
  merged.title = pickBestTitle(base.title || "", extra.title || "");
  merged.image = pickBestImage(base.image || "", extra.image || "");
  merged.publishedAt = base.publishedAt || extra.publishedAt || base.date || extra.date || "";
  merged.publishedAtText = base.publishedAtText || extra.publishedAtText || "";
  merged.descriptionHtml = base.descriptionHtml || extra.descriptionHtml || "";
  merged._sort =
    Date.parse(merged.publishedAt || 0) ||
    Date.parse(base.publishedAt || base.date || 0) ||
    Date.parse(extra.publishedAt || extra.date || 0) ||
    base._sort ||
    extra._sort ||
    0;
  merged.link = merged.link || base.link || extra.link;
  return merged;
}

function parseArchivePayload(htmlOrText, url) {
  if (looksLikeTextSnapshot(htmlOrText)) {
    return parseArchiveTextSnapshot(htmlOrText, url);
  }

  const blocks = sliceNewsBlocks(htmlOrText);
  if (blocks.length) {
    return blocks
      .map((block) => parseArchiveBlock(block, url))
      .filter((item) => Boolean(item?.link));
  }

  return [];
}

export async function fetchDofusNews(page = 1) {
  const pageNumber = Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const targetUrl = pageNumber === 1 ? DOFUS_NEWS_BASE : `${DOFUS_NEWS_BASE}?page=${pageNumber}`;

  const getFallback = () => {
    const sorted = [...fallbackNews]
      .map((item) => ({
        ...item,
        _sort: Date.parse(item.publishedAt || 0) || 0,
      }))
      .sort((a, b) => (b._sort || 0) - (a._sort || 0));

    const start = (pageNumber - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE).map((item) => ({
      ...item,
      image: item.image || DEFAULT_IMAGE,
    }));
  };

  try {
    const [archiveResponse, rssItems] = await Promise.all([smartFetch(targetUrl), fetchNewsFromRSS()]);

    if (!archiveResponse.ok) {
      return getFallback();
    }

    const archiveNews = parseArchivePayload(archiveResponse.text, targetUrl);

    const byLink = new Map();
    archiveNews.forEach((item) => {
      if (!item?.link) return;
      byLink.set(item.link, {
        ...item,
        publishedAt: item.publishedAt || item.date || "",
      });
    });

    rssItems.forEach((rss) => {
      const existing = byLink.get(rss.link);
      const formatted = {
        title: rss.title,
        link: rss.link,
        publishedAt: rss.date || "",
        publishedAtText: rss.date || "",
        image: rss.image || "",
        descriptionHtml: rss.descriptionHtml || "",
        _sort: rss._sort || 0,
      };

      if (existing) {
        byLink.set(rss.link, mergeNewsEntry(formatted, existing));
      } else {
        byLink.set(rss.link, formatted);
      }
    });

    const merged = Array.from(byLink.values())
      .map((item) => ({
        link: item.link,
        title: item.title || "Actualité Dofus",
        image: item.image || DEFAULT_IMAGE,
        descriptionHtml: item.descriptionHtml || "",
        publishedAt: item.publishedAt || item.date || "",
        publishedAtText: item.publishedAtText || "",
        _sort: item._sort || Date.parse(item.publishedAt || 0) || 0,
      }))
      .sort((a, b) => (b._sort || 0) - (a._sort || 0));

    if (!merged.length) {
      return getFallback();
    }

    return merged;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("[dofus-news] fallback due to error:", error);
    return getFallback();
  }
}

export function parseNewsDate(dateText) {
  return parseFrenchDateToIso(dateText);
}
