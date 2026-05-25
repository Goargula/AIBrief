import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 4173);
const REFRESH_MS = Number(process.env.REFRESH_MS || 3 * 60 * 60 * 1000);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 12000);

const sources = [
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
    id: "the-verge-ai",
    name: "The Verge AI",
    lane: "news",
    type: "rss",
    url: "https://www.theverge.com/ai-artificial-intelligence/rss/index.xml"
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
  errors: []
};

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
  const cleanTitle = item.title.replace(/\s+/g, " ").trim();
  const summary = item.summary || `A new ${lane} item from ${item.sourceName}.`;

  return {
    ...item,
    id: item.id || `${item.sourceName}:${item.url || cleanTitle}`,
    title: cleanTitle || "Untitled update",
    summary: summarize(summary, lane),
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

function summarize(text, lane) {
  const clean = stripHtml(text);
  if (!clean) return `New ${lane} update.`;
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  return sentences
    .slice(0, 2)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 320)
    .trim();
}

function scoreItem(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const hoursOld = Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 36e5);
  let score = Math.max(0, 72 - hoursOld);

  const highSignal = [
    "openai",
    "anthropic",
    "google deepmind",
    "deepmind",
    "meta ai",
    "microsoft",
    "nvidia",
    "model release",
    "frontier",
    "agent",
    "acquisition",
    "raises",
    "funding",
    "series",
    "benchmark",
    "safety",
    "regulation"
  ];
  for (const word of highSignal) {
    if (text.includes(word)) score += 16;
  }

  if (item.lane === "deals") score += 15;
  if (item.lane === "startups") score += 10;
  if (item.lane === "papers") score += 6;
  if (item.sourceName.includes("MIT")) score += 8;
  if (item.sourceName.includes("TechCrunch")) score += 6;
  if (item.points) score += Math.min(30, item.points / 8);
  if (item.comments) score += Math.min(20, item.comments / 5);

  return Math.round(score);
}

function dedupe(items) {
  const seen = new Map();
  for (const item of items) {
    const key = item.url || item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    const current = seen.get(key);
    if (!current || item.importance > current.importance) seen.set(key, item);
  }
  return [...seen.values()];
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

  if (!response.ok) {
    throw new Error(`${source.name} returned ${response.status}`);
  }

  if (source.type === "hn") {
    return parseHackerNews(await response.json(), source);
  }

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
    .map((item) => ({ ...item, importance: scoreItem(item) }))
    .sort((a, b) => b.importance - a.importance || new Date(b.publishedAt) - new Date(a.publishedAt));

  cache = {
    generatedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + REFRESH_MS).toISOString(),
    items,
    errors
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
