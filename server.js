import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const curatedFeedPath = path.join(publicDir, "curated-feed.json");
const PORT = Number(process.env.PORT || 4173);
const REFRESH_MS = Number(process.env.REFRESH_MS || 3 * 60 * 60 * 1000);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 12000);
const MAX_ITEM_AGE_DAYS = Number(process.env.MAX_ITEM_AGE_DAYS || 21);

const sources = [
  {
    id: "google-news-ai",
    name: "Google News AI",
    lane: "news",
    type: "rss",
    url: "https://news.google.com/rss/search?q=artificial%20intelligence%20OR%20AI%20when:7d&hl=en-US&gl=US&ceid=US:en"
  },
  {
    id: "google-news-funding",
    name: "Google News AI Funding",
    lane: "startups",
    type: "rss",
    url: "https://news.google.com/rss/search?q=AI%20startup%20funding%20OR%20artificial%20intelligence%20startup%20when:14d&hl=en-US&gl=US&ceid=US:en"
  },
  {
    id: "google-news-deals",
    name: "Google News AI Deals",
    lane: "deals",
    type: "rss",
    url: "https://news.google.com/rss/search?q=AI%20acquisition%20OR%20artificial%20intelligence%20acquires%20when:30d&hl=en-US&gl=US&ceid=US:en"
  },
  {
    id: "openai-news",
    name: "OpenAI News",
    lane: "news",
    type: "rss",
    url: "https://openrss.org/openai.com/news/rss.xml"
  },
  {
    id: "google-ai-blog",
    name: "Google AI",
    lane: "news",
    type: "rss",
    url: "https://blog.google/technology/ai/rss/"
  },
  {
    id: "deepmind-blog",
    name: "Google DeepMind",
    lane: "papers",
    type: "rss",
    url: "https://www.deepmind.com/blog/rss.xml"
  },
  {
    id: "techcrunch-ai",
    name: "TechCrunch AI",
    lane: "startups",
    type: "rss",
    url: "https://techcrunch.com/tag/artificial-intelligence/feed/"
  },
  {
    id: "venturebeat-ai",
    name: "VentureBeat AI",
    lane: "news",
    type: "rss",
    url: "https://venturebeat.com/category/ai/feed/"
  },
  {
    id: "mit-ai",
    name: "MIT Technology Review AI",
    lane: "news",
    type: "rss",
    url: "https://www.technologyreview.com/topic/artificial-intelligence/feed"
  },
  {
    id: "crunchbase-news",
    name: "Crunchbase News",
    lane: "deals",
    type: "rss",
    url: "https://news.crunchbase.com/feed/"
  },
  {
    id: "arxiv-ai",
    name: "arXiv AI",
    lane: "papers",
    type: "atom",
    url: "https://export.arxiv.org/api/query?search_query=cat:cs.AI%20OR%20cat:cs.LG%20OR%20cat:cs.CL%20OR%20cat:stat.ML&sortBy=submittedDate&sortOrder=descending&max_results=80"
  },
  {
    id: "hackernews-ai",
    name: "Hacker News",
    lane: "signal",
    type: "hn",
    url: "https://hn.algolia.com/api/v1/search_by_date?query=AI%20OR%20LLM%20OR%20OpenAI%20OR%20Anthropic%20OR%20DeepMind%20OR%20Nvidia&tags=story&hitsPerPage=80"
  }
];

let cache = {
  generatedAt: null,
  nextRefreshAt: null,
  items: [],
  errors: [],
  summaryEngine: "fallback"
};

async function loadCuratedFeed() {
  try {
    const payload = JSON.parse(await readFile(curatedFeedPath, "utf8"));
    if (!Array.isArray(payload.items) || !payload.items.length) return null;
    return {
      generatedAt: payload.generatedAt || new Date().toISOString(),
      nextRefreshAt: payload.nextRefreshAt || null,
      items: payload.items.map((item, index) => ({
        id: item.id || `curated-${index + 1}`,
        title: item.title || "Untitled update",
        summary: item.summary || item.fullSummary || "Curated AI story.",
        fullSummary: item.fullSummary || item.summary || "Curated AI story.",
        keyFacts: Array.isArray(item.keyFacts) ? item.keyFacts : [],
        imageUrl: item.imageUrl || `/visual.svg?lane=${encodeURIComponent(item.lane || "news")}&title=${encodeURIComponent(item.title || "AI Brief")}`,
        url: item.url || "#",
        sourceName: item.sourceName || "Curated Feed",
        lane: item.lane || "news",
        publishedAt: item.publishedAt || payload.generatedAt || new Date().toISOString(),
        importance: Number(item.importance || 100 - index),
        relatedSources: item.relatedSources || undefined,
        relatedLinks: item.relatedLinks || undefined,
        sourceConfidence: item.sourceConfidence || "medium",
        summaryEngine: item.summaryEngine || payload.summaryEngine || "chat-curated"
      })),
      errors: payload.errors || [],
      summaryEngine: payload.summaryEngine || "chat-curated",
      curated: true
    };
  } catch {
    return null;
  }
}

function stripHtml(value = "") {
  return decodeHtml(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8216;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&#8212;/g, "-")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function tidyText(value = "") {
  return stripHtml(value)
    .replace(/[{}]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeHtml(match[1]).trim() : "";
}

function getLink(block) {
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  if (href) return decodeHtml(href[1]);
  return getTag(block, "link");
}

function getAttr(block, tag, attr) {
  const match = block.match(new RegExp(`<${tag}[^>]+${attr}=["']([^"']+)["'][^>]*>`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function extractImageUrl(block, rawSummary = "") {
  const media =
    getAttr(block, "media:content", "url") ||
    getAttr(block, "media:thumbnail", "url") ||
    getAttr(block, "enclosure", "url");
  if (media && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(media)) return media;

  const imageTag = block.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i) || rawSummary.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
  return imageTag ? decodeHtml(imageTag[1]) : "";
}

function splitBlocks(xml, tag) {
  const blocks = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>[\\s\\S]*?<\\/${tag}>`, "gi");
  let match;
  while ((match = re.exec(xml))) blocks.push(match[0]);
  return blocks;
}

function parseXmlFeed(xml, source) {
  const tag = source.type === "atom" ? "entry" : "item";
  return splitBlocks(xml, tag).map((block) => {
    const title = stripHtml(getTag(block, "title"));
    const rawSummary =
      getTag(block, "description") ||
      getTag(block, "summary") ||
      getTag(block, "content:encoded") ||
      getTag(block, "content");
    const publishedAt =
      getTag(block, "pubDate") ||
      getTag(block, "published") ||
      getTag(block, "updated") ||
      new Date().toISOString();
    const id = getTag(block, "guid") || getTag(block, "id") || getLink(block) || title;

    return normalizeItem({
      id: `${source.id}:${id}`,
      title,
      summary: stripHtml(rawSummary),
      imageUrl: extractImageUrl(block, rawSummary),
      url: getLink(block),
      publishedAt,
      sourceName: source.name,
      lane: source.lane
    });
  });
}

function parseHackerNews(payload, source) {
  return (payload.hits || []).map((hit) => {
    const title = stripHtml(hit.title || hit.story_title || "");
    return normalizeItem({
      id: `${source.id}:${hit.objectID}`,
      title,
      summary: `${hit.points || 0} points and ${hit.num_comments || 0} comments on Hacker News.`,
      url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
      commentsUrl: `https://news.ycombinator.com/item?id=${hit.objectID}`,
      publishedAt: hit.created_at,
      sourceName: source.name,
      lane: source.lane,
      imageUrl: "",
      points: hit.points || 0,
      comments: hit.num_comments || 0
    });
  });
}

function normalizeItem(item) {
  const lane = classifyLane(item);
  const published = new Date(item.publishedAt);
  const cleanTitle = tidyText(item.title).replace(/\s[-\u2013]\s[^-\u2013]{2,80}$/, "").trim();
  const summary = buildFallbackSummary(item.summary, lane, cleanTitle, item.sourceName);

  return {
    ...item,
    id: item.id || `${item.sourceName}:${item.url || cleanTitle}`,
    title: cleanTitle || "Untitled update",
    sourceSummary: tidyText(item.summary),
    summary: summary.summary,
    fullSummary: summary.fullSummary,
    keyFacts: summary.keyFacts,
    imageUrl: item.imageUrl || `/visual.svg?lane=${encodeURIComponent(lane)}&title=${encodeURIComponent(cleanTitle)}`,
    lane,
    publishedAt: Number.isNaN(published.getTime()) ? new Date().toISOString() : published.toISOString()
  };
}

function classifyLane(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (/\barxiv\b|\bpaper\b|\bresearch\b|\bbenchmark\b|\bdataset\b|\bmodel architecture\b/.test(text)) return "papers";
  if (/\braises?\b|\bfunding\b|\bseries [abc]\b|\bseed\b|\bstartup\b|\bventure\b/.test(text)) return "startups";
  if (/\bacquires?\b|\bacquisition\b|\bmerger\b|\bpartnership\b|\binvests?\b|\bipo\b/.test(text)) return "deals";
  if (item.lane) return item.lane;
  return "news";
}

function splitSentences(text) {
  return tidyText(text)
    .replace(/\bA\.\s*I\./g, "AI")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .filter(Boolean);
}

function extractKeyFacts(...values) {
  const text = values.filter(Boolean).map((value) => tidyText(value)).join(" ");
  const facts = [];
  const patterns = [
    /\$[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?\s?(?:trillion|billion|million|bn|m|b)?/gi,
    /\b[0-9]+(?:\.[0-9]+)?\s?(?:trillion|billion|million|bn|m)\b/gi,
    /\b[0-9]+(?:\.[0-9]+)?%/g,
    /\bSeries\s+[A-Z]\b/gi,
    /\b[0-9]{1,3}(?:,[0-9]{3})+\b/g,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+[0-9]{1,2}(?:,\s*[0-9]{4})?\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const fact = match[0].trim();
      if (fact && !facts.some((kept) => kept.toLowerCase() === fact.toLowerCase())) facts.push(fact);
      if (facts.length >= 8) return facts;
    }
  }

  return facts;
}

function buildFallbackSummary(text, lane, title, sourceName) {
  const clean = tidyText(text);
  const sentences = splitSentences(clean);
  const keyFacts = extractKeyFacts(title, clean);
  const lead = sentences.length
    ? sentences.slice(0, 2).join(" ").slice(0, 340).trim()
    : `${sourceName} has a new ${lane} item about ${title}.`;
  const factLine = keyFacts.length ? ` Key details mentioned: ${keyFacts.join(", ")}.` : "";
  const fullSummary = `${lead}${factLine} Read the original source for the primary evidence, exact framing, and any caveats that are not visible from the feed snippet.`;
  return { summary: lead, fullSummary, keyFacts };
}

function scoreItem(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const hoursOld = Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 36e5);
  let score = Math.max(0, 120 - hoursOld * 2);

  for (const word of ["openai", "anthropic", "google deepmind", "deepmind", "microsoft", "nvidia", "agent", "acquisition", "raises", "funding", "series", "benchmark", "safety", "regulation"]) {
    if (text.includes(word)) score += 16;
  }

  if (item.lane === "deals") score += 15;
  if (item.lane === "startups") score += 10;
  if (item.lane === "papers") score += 6;
  if (item.sourceName.includes("MIT")) score += 8;
  if (item.sourceName.includes("TechCrunch")) score += 6;
  if (item.points) score += Math.min(30, item.points / 8);
  if (item.comments) score += Math.min(20, item.comments / 5);
  if (hoursOld > 24 * 7) score *= 0.45;
  if (hoursOld > 24 * 14) score *= 0.2;

  return Math.round(score);
}

function isFreshItem(item) {
  const published = new Date(item.publishedAt).getTime();
  if (Number.isNaN(published)) return true;
  return Date.now() - published <= MAX_ITEM_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function canonicalTitle(value = "") {
  return value
    .toLowerCase()
    .replace(/\ba\.?\s*i\.?\b/g, "ai")
    .replace(/artificial intelligence/g, "ai")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupe(items) {
  const seen = [];
  for (const item of items) {
    const key = item.url || canonicalTitle(item.title);
    const existing = seen.find((kept) => kept.url === key || canonicalTitle(kept.title) === canonicalTitle(item.title));
    if (!existing) seen.push(item);
    else if ((item.importance || 0) > (existing.importance || 0)) Object.assign(existing, item);
  }
  return seen;
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const response = await fetch(source.url, {
    signal: controller.signal,
    headers: {
      "User-Agent": "AI News App personal digest/0.1 (contact: local)"
    }
  }).finally(() => clearTimeout(timeout));

  if (!response.ok) throw new Error(`${source.name} returned ${response.status}`);
  if (source.type === "hn") return parseHackerNews(await response.json(), source);
  return parseXmlFeed(await response.text(), source);
}

async function refreshFeeds() {
  const errors = [];
  const batches = await Promise.all(
    sources.map(async (source) => {
      try {
        return await fetchSource(source);
      } catch (error) {
        errors.push({ source: source.name, message: error.message });
        return [];
      }
    })
  );

  const items = dedupe(batches.flat())
    .filter((item) => item.title && item.url)
    .filter(isFreshItem)
    .map((item) => ({ ...item, importance: scoreItem(item), summaryEngine: "fallback" }))
    .sort((a, b) => b.importance - a.importance || new Date(b.publishedAt) - new Date(a.publishedAt));

  cache = {
    generatedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + REFRESH_MS).toISOString(),
    items,
    errors,
    summaryEngine: "fallback"
  };

  console.log(`Loaded ${items.length} AI updates with ${errors.length} source errors.`);
}

async function ensureFresh(force = false) {
  if (!force && cache.generatedAt && Date.now() < new Date(cache.nextRefreshAt).getTime()) return;
  await refreshFeeds();
}

function contentType(filePath) {
  const ext = path.extname(filePath);
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  }[ext] || "application/octet-stream";
}

async function serveStatic(req, res) {
  const pathOnly = decodeURIComponent(req.url.split("?")[0]);
  const requested = pathOnly === "/" ? "/index.html" : pathOnly;
  const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": contentType(filePath),
      "Cache-Control": requested === "/index.html" ? "no-store" : "public, max-age=300"
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/visual.svg")) {
      const requestUrl = new URL(req.url, `http://localhost:${PORT}`);
      const lane = requestUrl.searchParams.get("lane") || "news";
      const title = stripHtml(requestUrl.searchParams.get("title") || "AI Brief").slice(0, 80);
      const color = {
        papers: "#f0b84a",
        startups: "#3bd671",
        deals: "#ff6b6b",
        signal: "#65a7ff",
        news: "#65a7ff"
      }[lane] || "#65a7ff";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200"><rect width="900" height="1200" fill="#0d1117"/><rect x="0" y="0" width="900" height="1200" fill="${color}" opacity="0.18"/><circle cx="760" cy="180" r="260" fill="${color}" opacity="0.28"/><circle cx="110" cy="1040" r="310" fill="${color}" opacity="0.18"/><text x="72" y="144" fill="${color}" font-family="Arial, sans-serif" font-size="36" font-weight="700">${lane.toUpperCase()}</text><text x="72" y="960" fill="#f5f7fa" font-family="Arial, sans-serif" font-size="58" font-weight="800">${title.replace(/[<&>]/g, "")}</text></svg>`;
      res.writeHead(200, {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600"
      });
      res.end(svg);
      return;
    }

    if (req.url.startsWith("/api/feed")) {
      const curatedFeed = await loadCuratedFeed();
      if (curatedFeed) {
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        });
        res.end(JSON.stringify({ ...curatedFeed, refreshEveryMs: REFRESH_MS }));
        return;
      }

      await ensureFresh(req.url.includes("refresh=1"));
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(JSON.stringify({ ...cache, refreshEveryMs: REFRESH_MS }));
      return;
    }

    await serveStatic(req, res);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`AI News App running at http://localhost:${PORT}`);
});

refreshFeeds().catch((error) => console.error(error));
setInterval(() => refreshFeeds().catch((error) => console.error(error)), REFRESH_MS);
