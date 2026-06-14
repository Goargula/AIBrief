import http from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeFilterCategory } from "./public/category.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const curatedFeedPath = path.join(publicDir, "curated-feed.json");
loadEnvFile(path.join(__dirname, ".env"));
const PORT = Number(process.env.PORT || 4173);
const REFRESH_MS = Number(process.env.REFRESH_MS || 3 * 60 * 60 * 1000);
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 12000);
const MAX_ITEM_AGE_DAYS = Number(process.env.MAX_ITEM_AGE_DAYS || 21);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
const OPENAI_SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || "gpt-5.5";
const OPENAI_SUMMARY_WEB_SEARCH = process.env.OPENAI_SUMMARY_WEB_SEARCH !== "0";
const OPENAI_SUMMARY_MAX_ITEMS = Number(process.env.OPENAI_SUMMARY_MAX_ITEMS || 250);
const OPENAI_SUMMARY_CONCURRENCY = Math.max(1, Number(process.env.OPENAI_SUMMARY_CONCURRENCY || 4));
const OPENAI_SUMMARY_TIMEOUT_MS = Number(process.env.OPENAI_SUMMARY_TIMEOUT_MS || 45000);
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
let openAiWebSearchAvailable = OPENAI_SUMMARY_WEB_SEARCH;

function loadEnvFile(filePath) {
  try {
    const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // A .env file is optional for local use.
  }
}

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
        filterCategory: normalizeFilterCategory(item.filterCategory, item),
        publishedAt: item.publishedAt || payload.generatedAt || new Date().toISOString(),
        importance: Number(item.importance || 100 - index),
        relatedSources: item.relatedSources || undefined,
        relatedLinks: item.relatedLinks || undefined,
        sourceConfidence: item.sourceConfidence || "medium",
        summaryEngine: item.summaryEngine || payload.summaryEngine || "chat-curated"
      })),
      errors: payload.errors || [],
      summaryEngine: payload.summaryEngine || "chat-curated",
      lastRefresh: payload.lastRefresh || null,
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
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
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
    .replace(/\\textbf\{([^}]+)\}/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sourceFromTitle(title = "") {
  const match = title.match(/\s[-\u2013]\s([^-|\u2013]{2,80})$/);
  return match ? tidyText(match[1]).replace(/\.$/, "") : "";
}

function titleWithoutSource(title = "") {
  return tidyText(title).replace(/\s[-\u2013]\s[^-\u2013]{2,80}$/, "").trim();
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
  const rawTitle = tidyText(item.title);
  const cleanTitle = titleWithoutSource(rawTitle) || rawTitle;
  const publisher = sourceFromTitle(rawTitle);
  const sourceName = publisher || item.sourceName;
  const sourceSummary = tidyText(item.summary);
  const summaryPack = buildSummaryPack(item.summary, lane, cleanTitle, sourceName);

  return {
    ...item,
    id: item.id || `${item.sourceName}:${item.url || cleanTitle}`,
    title: cleanTitle || "Untitled update",
    sourceSummary,
    summary: summaryPack.summary,
    fullSummary: summaryPack.fullSummary,
    keyFacts: summaryPack.keyFacts,
    imageUrl: item.imageUrl || `/visual.svg?lane=${encodeURIComponent(lane)}&title=${encodeURIComponent(cleanTitle)}`,
    sourceName,
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

function canonicalText(value = "") {
  return titleWithoutSource(value)
    .toLowerCase()
    .replace(/\ba\.?\s*i\.?\b/g, "ai")
    .replace(/artificial intelligence/g, "ai")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWeakSummary(summary, title) {
  const clean = tidyText(summary);
  if (!clean) return true;
  const normalizedSummary = canonicalText(clean);
  const normalizedTitle = canonicalText(title);
  if (!normalizedSummary || clean.length < 48) return true;
  if (normalizedTitle && normalizedSummary.startsWith(normalizedTitle) && normalizedSummary.length <= normalizedTitle.length + 30) return true;
  if (normalizedTitle && normalizedSummary === normalizedTitle) return true;
  if (/\b(it covers|it explains|it gives|it points to|new \w+ update|ai story:|deal story:|funding story:|research update:|product update:)/i.test(clean)) return true;
  return false;
}

function splitSentences(text) {
  return tidyText(text)
    .replace(/\bA\.\s*I\./g, "AI")
    .replace(/\bU\.\s*S\./g, "US")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'])/)
    .filter(Boolean);
}

function lowerFirst(value = "") {
  if (/^AI\b/.test(value)) return value;
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

function trimPunctuation(value = "") {
  return tidyText(value).replace(/^[\s:,-]+|[\s:,-]+$/g, "").replace(/[.!?]+$/, "");
}

function primarySourceName(sourceName = "") {
  return trimPunctuation(String(sourceName).split("+")[0]) || "A news report";
}

function domainAngle(title, lane) {
  const lower = title.toLowerCase();
  if (/\btherapist|medical|medicine|health|clinical|patient|doctor|nursing|dementia\b/.test(lower)) {
    return "healthcare, where useful automation has to clear a higher bar for privacy, trust, and accountability";
  }
  if (/\bjob|work|worker|hiring|career|employee|workplace\b/.test(lower)) {
    return "the labor market, where AI is changing entry-level work, skills, and who gets leverage from automation";
  }
  if (/\bpope|papal|vatican|humanitas|church\b/.test(lower)) {
    return "the moral and policy debate over whether AI systems remain accountable to human judgment";
  }
  if (/\bcourt|lawsuit|legal|law|regulat|senator|governor|framework|guide|policy|insurance|billing\b/.test(lower)) {
    return "AI governance, where public agencies and courts are trying to set practical boundaries for use";
  }
  if (/\bfarm|agriculture|crop\b/.test(lower)) {
    return "agriculture, where AI is moving from demos into field decisions, planning, and operational advice";
  }
  if (/\bsport|racket|padel|tennis|athlete\b/.test(lower)) {
    return "sports analytics, where computer vision and performance data are becoming commercial products";
  }
  if (/\bcyber|security|nsa|attack|safe|risk\b/.test(lower)) {
    return "security, where AI creates both new defensive tools and new operational risks";
  }
  if (/\bbank|finance|stock|valuation|funding|investor|capital\b/.test(lower) || lane === "startups") {
    return "the AI business cycle, where capital is flowing toward infrastructure, agents, and vertical applications";
  }
  if (/\bbenchmark|paper|research|dataset|model|llm|agent\b/.test(lower) || lane === "papers") {
    return "AI research, where the practical question is whether the result improves reliability outside benchmarks";
  }
  if (lane === "deals") return "the AI deal market, where larger players are buying data, talent, and product capability";
  return "AI adoption, where the important question is what changes for users, builders, or institutions";
}

function consequenceForTitle(title, lane) {
  const lower = title.toLowerCase();
  if (/\bwarn|risk|danger|trust|privacy|control\b/.test(lower)) {
    return "the core issue is not just capability, but who is responsible when AI is used in sensitive decisions";
  }
  if (/\bacquires?|acquisition|buys?|merger|partnership|stake\b/.test(lower) || lane === "deals") {
    return "the value is in combining AI capability with distribution, data, or a more focused customer base";
  }
  if (/\braises?|funding|series|seed|valuation|valued\b/.test(lower)) {
    return "investors are still paying for AI companies that can show distribution, infrastructure leverage, or a clear vertical wedge";
  }
  if (/\blaunch|release|announce|introduc|rolls?\s*out\b/.test(lower)) {
    return "the useful signal is whether this becomes something people actually use, not just another AI launch";
  }
  if (/\bbenchmark|paper|research|dataset|study\b/.test(lower) || lane === "papers") {
    return "the useful signal is whether other researchers can reproduce it and whether it changes real workflows";
  }
  if (/\bjob|work|worker|hiring|career\b/.test(lower)) {
    return "the practical question is which tasks disappear, which roles get redesigned, and who gets trained for the new work";
  }
  return "the useful signal is whether the development changes behavior, budgets, regulation, or product roadmaps";
}

function extractKeyFacts(...values) {
  const text = values
    .filter(Boolean)
    .map((value) => tidyText(value))
    .join(" ");
  const facts = [];
  const patterns = [
    /\$[0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?\s?(?:trillion|billion|million|bn|m|b)?/gi,
    /\b[0-9]+(?:\.[0-9]+)?\s?(?:trillion|billion|million|bn|m)\b/gi,
    /\b[0-9]+(?:\.[0-9]+)?%/g,
    /\bSeries\s+[A-Z]\b/gi,
    /\b(?:seed|pre-seed)\s+round\b/gi,
    /\b[0-9]{1,3}(?:,[0-9]{3})+\b/g,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+[0-9]{1,2}(?:,\s*[0-9]{4})?\b/gi,
    /\b[0-9]{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?(?:\s+[0-9]{4})?\b/gi,
    /\b[0-9]+(?:-[0-9]+)?\s?(?:day|week|month|year|minute|hour|cell|step|token|word|parameter|agent|model|benchmark|country|city|task|source|comment|point)s?\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const fact = trimPunctuation(match[0]);
      if (fact && !hasEquivalentFact(facts, fact)) facts.push(fact);
      if (facts.length >= 8) return facts;
    }
  }

  return facts;
}

function normalizeFact(fact = "") {
  return fact
    .toLowerCase()
    .replace(/^\$/, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ")
    .replace(/\bbillion\b/g, "b")
    .replace(/\bmillion\b/g, "m")
    .trim();
}

function hasEquivalentFact(facts, fact) {
  const normalized = normalizeFact(fact);
  return facts.some((kept) => normalizeFact(kept) === normalized);
}

function factSentence(facts) {
  if (!facts.length) return "";
  return `Key details mentioned: ${facts.join(", ")}.`;
}

function generatedSummaryFromHeadline(title, lane, sourceName = "") {
  const cleanTitle = titleWithoutSource(title).replace(/\.$/, "");
  const lower = cleanTitle.toLowerCase();
  const source = primarySourceName(sourceName);
  const facts = extractKeyFacts(cleanTitle);
  const details = factSentence(facts);
  const appendFacts = (summary) => [summary, details].filter(Boolean).join(" ");
  if (!cleanTitle) return `A new ${lane} item is worth tracking because it may affect AI products, policy, research, or company strategy.`;

  let match = cleanTitle.match(/^(.+?)\s+(?:acquires|acquired|buys|bought)\s+(.+?)(?:\s+to\s+(.+))?$/i);
  if (match) {
    const buyer = trimPunctuation(match[1]);
    const target = trimPunctuation(match[2]);
    const purpose = trimPunctuation(match[3] || "");
    return appendFacts(`${source} says ${buyer} is acquiring ${target}${purpose ? ` to ${lowerFirst(purpose)}` : ""}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }

  match = cleanTitle.match(/^(.+?)\s+expands?\s+(.+?)\s+through acquisition of\s+(.+)$/i);
  if (match) {
    return appendFacts(`${source} says ${trimPunctuation(match[1])} is using the acquisition of ${trimPunctuation(match[3])} to expand ${lowerFirst(trimPunctuation(match[2]))}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }

  match = cleanTitle.match(/^(.+?)\s+raised\s+(\$?[0-9][^.]*)\.\s+(.+)$/i);
  if (match) {
    return appendFacts(`${source} reports that ${trimPunctuation(match[1])} raised ${trimPunctuation(match[2])}, with the article focused on ${lowerFirst(trimPunctuation(match[3]))}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }

  match = cleanTitle.match(/^(.+?)\s+(?:raises?|lands?|nears|secures?)\s+(.+?)(?:\s+(?:round|funding|valuation))?(?:\s+(.+))?$/i);
  if (match && /\$|\b(billion|million|series|valuation|funding)\b/i.test(cleanTitle)) {
    return appendFacts(`${source} reports that ${trimPunctuation(match[1])} is tied to ${trimPunctuation(match[2])}${match[3] ? ` ${trimPunctuation(match[3])}` : ""}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }

  match = cleanTitle.match(/^(.+?),\s+urging\s+(.+?),\s+warns?\s+(.+)$/i);
  if (match) {
    return appendFacts(`${source} reports that ${trimPunctuation(match[1])} is urging ${lowerFirst(trimPunctuation(match[2]))} and warning that ${lowerFirst(trimPunctuation(match[3]))}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }

  match = cleanTitle.match(/^(.+?)\s+(?:warns?|urges?|calls for)\s+(.+)$/i);
  if (match) {
    return appendFacts(`${source} reports that ${trimPunctuation(match[1])} is raising concern about ${lowerFirst(trimPunctuation(match[2]))}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }

  match = cleanTitle.match(/^(.+?)\s+(?:launches|releases|announces|introduces|rolls out|approves)\s+(.+)$/i);
  if (match) {
    return appendFacts(`${source} says ${trimPunctuation(match[1])} has announced ${lowerFirst(trimPunctuation(match[2]))}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }

  match = cleanTitle.match(/^(.+?)\s+(?:uses|using|adopts|integrates?)\s+AI\s+(to|for|into)\s+(.+)$/i);
  if (match) {
    const subject = trimPunctuation(match[1]);
    const preposition = match[2].toLowerCase();
    const object = lowerFirst(trimPunctuation(match[3]));
    return appendFacts(`${source} reports on ${subject} using AI ${preposition} ${object}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }

  if (/\bacquires?\b|\bacquisition\b|\bmerger\b|\bdeal\b|\bstake\b|\bpartnership\b|\binvests?\b/.test(lower)) {
    return appendFacts(`${source} reports on ${cleanTitle}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }
  if (/\braises?\b|\bfunding\b|\bseries [abc]\b|\bseed\b|\bvalued\b|\bvaluation\b/.test(lower)) {
    return appendFacts(`${source} reports on ${cleanTitle}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }
  if (/\bpaper\b|\bresearch\b|\bstudy\b|\bbenchmark\b|\bdataset\b|\bmodel\b/.test(lower) || lane === "papers") {
    return appendFacts(`${source} reports on ${cleanTitle}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }
  if (/\bwarns?\b|\brisk\b|\bdanger\b|\btrust\b|\bprivacy\b|\bregulat|\blawsuit|\bcourt\b|\bpolicy\b|\bguide\b|\bframework\b/.test(lower)) {
    return appendFacts(`${source} reports on ${cleanTitle}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }
  if (/\bjob\b|\bwork\b|\bworker\b|\bhiring\b|\bcareer\b|\bemployee\b/.test(lower)) {
    return appendFacts(`${source} reports on ${cleanTitle}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }
  if (/\bhealth\b|\bmedical\b|\bmedicine\b|\bdoctor\b|\btherapist\b|\bclinical\b|\bpatient\b/.test(lower)) {
    return appendFacts(`${source} reports on ${cleanTitle}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }
  if (/\blaunch\b|\brelease\b|\bannounce\b|\bintroduc|\brolls?\s*out\b/.test(lower)) {
    return appendFacts(`${source} reports on ${cleanTitle}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
  }
  return appendFacts(`${source} reports on ${cleanTitle}. The story is about ${domainAngle(cleanTitle, lane)}, and ${consequenceForTitle(cleanTitle, lane)}.`);
}

function finishAtBoundary(text, max = 390) {
  const clean = tidyText(text);
  if (clean.length <= max) return clean;
  const clipped = clean.slice(0, max);
  const sentence = clipped.match(/^([\s\S]*[.!?])(?:\s|$)/);
  if (sentence && sentence[1].length >= 120) return sentence[1].trim();
  const wordBoundary = clipped.replace(/\s+\S*$/, "").trim();
  return `${wordBoundary || clipped.trim()}...`;
}

function longerSourceSummary(text) {
  const sentences = splitSentences(text);
  const joined = sentences.slice(0, 5).join(" ").replace(/\s+/g, " ");
  return finishAtBoundary(joined || text, 950);
}

function isThinSummary(summary, title) {
  const clean = tidyText(summary);
  if (clean.length < 95) return true;
  if (/^(haven.t you heard|watch|one job|what is|why\b|how\b)/i.test(clean)) return true;
  const normalizedSummary = canonicalText(clean);
  const normalizedTitle = canonicalText(title);
  return Boolean(normalizedTitle && normalizedSummary.includes(normalizedTitle) && clean.length < 145);
}

function augmentThinSummary(summary, title, lane) {
  const clean = tidyText(summary).replace(/\.$/, "");
  const extra = `The broader story is about ${domainAngle(title, lane)}, and ${consequenceForTitle(title, lane)}.`;
  return finishAtBoundary(`${clean}. ${extra}`, 430);
}

function summarize(text, lane, title = "", sourceName = "") {
  const clean = tidyText(text);
  if (isWeakSummary(clean, title)) return generatedSummaryFromHeadline(title || clean, lane, sourceName);
  const sentences = splitSentences(clean);
  const summary = finishAtBoundary(sentences
    .slice(0, 2)
    .join(" ")
    .replace(/\s+/g, " "));
  return isThinSummary(summary, title) ? augmentThinSummary(summary, title, lane) : summary;
}

function buildSummaryPack(text, lane, title = "", sourceName = "") {
  const clean = tidyText(text);
  const weak = isWeakSummary(clean, title);
  const summary = summarize(clean, lane, title, sourceName);
  const keyFacts = extractKeyFacts(title, clean);
  const facts = factSentence(keyFacts);
  const sourceDetail = !weak ? longerSourceSummary(clean) : "";
  const detailBase = sourceDetail && sourceDetail.length > summary.length ? sourceDetail : summary;
  const angle = `Why it matters: this sits in ${domainAngle(title, lane)}, and ${consequenceForTitle(title, lane)}.`;
  const fullSummary = [detailBase, facts && !detailBase.includes(facts) ? facts : "", weak ? "" : angle]
    .filter(Boolean)
    .join(" ");
  const leadSentence = splitSentences(summary)[0] || summary;
  const lead = weak ? [leadSentence, facts].filter(Boolean).join(" ") : summary;

  return {
    summary: finishAtBoundary(lead, 280),
    fullSummary: finishAtBoundary(fullSummary, 1100),
    keyFacts
  };
}

function scoreItem(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const hoursOld = Math.max(0, (Date.now() - new Date(item.publishedAt).getTime()) / 36e5);
  let score = Math.max(0, 120 - hoursOld * 2);

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
  if (hoursOld > 24 * 7) score *= 0.45;
  if (hoursOld > 24 * 14) score *= 0.2;

  return Math.round(score);
}

function isFreshItem(item) {
  const published = new Date(item.publishedAt).getTime();
  if (Number.isNaN(published)) return true;
  return Date.now() - published <= MAX_ITEM_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function topicWords(item) {
  const text = item.title
    .replace(/\s+-\s+[^-]+$/g, "")
    .toLowerCase()
    .replace(/\ba\.?\s*i\.?\b/g, "ai")
    .replace(/artificial intelligence/g, "ai")
    .replace(/\bpapal\b|\bpope leo\b|\bleo xiv\b/g, "pope")
    .replace(/[^a-z0-9]+/g, " ");
  const stop = new Set([
    "about",
    "after",
    "again",
    "amid",
    "for",
    "from",
    "have",
    "into",
    "using",
    "uses",
    "use",
    "company",
    "startup",
    "funding",
    "round",
    "valuation",
    "value",
    "valued",
    "raise",
    "raised",
    "raises",
    "capital",
    "million",
    "billion",
    "series",
    "most",
    "valuable",
    "more",
    "news",
    "over",
    "says",
    "than",
    "that",
    "the",
    "this",
    "what",
    "when",
    "with",
    "will",
    "your"
  ]);
  return new Set(
    text
      .split(/\s+/)
      .map((word) => word.replace(/s$/, ""))
      .filter((word) => (word === "ai" || word.length > 2) && !stop.has(word))
  );
}

function isNearDuplicate(a, b) {
  const aTitle = canonicalText(a.title);
  const bTitle = canonicalText(b.title);
  if (aTitle && bTitle && (aTitle === bTitle || (aTitle.length > 28 && bTitle.includes(aTitle)) || (bTitle.length > 28 && aTitle.includes(bTitle)))) {
    return true;
  }

  if (a.sourceName === "arXiv AI" && b.sourceName === "arXiv AI") return false;

  const aWords = topicWords(a);
  const bWords = topicWords(b);
  if (!aWords.size || !bWords.size) return false;
  const common = [...aWords].filter((word) => bWords.has(word));
  const generic = new Set([
    "ai",
    "artificial",
    "intelligence",
    "new",
    "first",
    "major",
    "large",
    "language",
    "model",
    "models",
    "llm",
    "llms",
    "agent",
    "agents",
    "agentic",
    "reasoning",
    "benchmark",
    "benchmarks",
    "evaluation",
    "evaluating",
    "company",
    "startup",
    "funding",
    "round",
    "valuation",
    "value",
    "valued",
    "raise",
    "raised",
    "raises",
    "capital",
    "million",
    "billion",
    "series",
    "most",
    "valuable"
  ]);
  const specificCommon = common.filter((word) => !generic.has(word));
  const unionSize = new Set([...aWords, ...bWords]).size;
  const overlap = common.length / unionSize;
  const topicAnchors = new Set(["pope", "openai", "anthropic", "google", "deepmind", "nvidia", "microsoft", "meta", "claude", "chatgpt", "gemini", "reeves", "mississippi"]);
  const hasAnchor = common.some((word) => topicAnchors.has(word));
  const amountOverlap = [...moneyTokens(a.title)].some((token) => moneyTokens(b.title).has(token));
  if (common.includes("ai") && common.includes("pope")) return true;
  if (specificCommon.length >= 1 && amountOverlap) return true;
  return specificCommon.length >= 3 || (specificCommon.length >= 2 && hasAnchor && overlap >= 0.22);
}

function moneyTokens(value = "") {
  const tokens = new Set();
  const text = value.toLowerCase().replace(/,/g, "");
  const re = /\$?\b(\d+(?:\.\d+)?)\s?(billion|bn|b|million|mn|m)\b/g;
  let match;
  while ((match = re.exec(text))) {
    const unit = match[2].startsWith("b") ? "b" : "m";
    tokens.add(`${match[1]}${unit}`);
  }
  return tokens;
}

function summaryOverlap(summary = "", title = "") {
  const titleWords = topicWords({ title });
  const summaryWords = topicWords({ title: summary });
  if (!titleWords.size || !summaryWords.size) return 0;
  return [...titleWords].filter((word) => summaryWords.has(word)).length / titleWords.size;
}

function betterSummary(a = "", b = "", preferredTitle = "") {
  if (preferredTitle) {
    const aOverlap = summaryOverlap(a, preferredTitle);
    const bOverlap = summaryOverlap(b, preferredTitle);
    if (Math.abs(aOverlap - bOverlap) >= 0.18) return bOverlap > aOverlap ? b : a;
  }
  if (isWeakSummary(a, "")) return b || a;
  if (isWeakSummary(b, "")) return a || b;
  return b.length > a.length + 35 ? b : a;
}

function mergeKeyFacts(...groups) {
  const facts = [];
  for (const group of groups) {
    for (const fact of group || []) {
      if (!hasEquivalentFact(facts, fact)) facts.push(fact);
      if (facts.length >= 10) return facts;
    }
  }
  return facts;
}

function mergeStory(primary, duplicate) {
  const sources = [...new Set([...(primary.relatedSources || [primary.sourceName]), duplicate.sourceName].filter(Boolean))];
  const links = [...(primary.relatedLinks || [{ title: primary.title, url: primary.url, sourceName: primary.sourceName }])];
  if (duplicate.url && !links.some((link) => link.url === duplicate.url)) {
    links.push({ title: duplicate.title, url: duplicate.url, sourceName: duplicate.sourceName });
  }

  const best = duplicate.importance > primary.importance ? duplicate : primary;
  const summary = betterSummary(primary.summary, duplicate.summary, best.title);
  const fullSummary = betterSummary(primary.fullSummary || primary.summary, duplicate.fullSummary || duplicate.summary, best.title);
  const keyFacts = mergeKeyFacts(primary.keyFacts, duplicate.keyFacts, extractKeyFacts(primary.title, duplicate.title));
  const publishedAt = new Date(duplicate.publishedAt) > new Date(primary.publishedAt) ? duplicate.publishedAt : primary.publishedAt;

  return {
    ...best,
    id: primary.id,
    title: best.title,
    summary,
    fullSummary,
    keyFacts,
    importance: Math.max(primary.importance || 0, duplicate.importance || 0) + Math.min(12, sources.length * 3),
    publishedAt,
    sourceName: sources.length > 1 ? `${sources[0]} + ${sources.length - 1}` : sources[0],
    relatedSources: sources,
    relatedLinks: links
  };
}

function dedupe(items) {
  const seen = new Map();
  for (const item of items) {
    const key = item.url || canonicalText(item.title);
    const current = seen.get(key);
    if (!current || item.importance > current.importance) seen.set(key, item);
  }
  return [...seen.values()];
}

function mergeDuplicates(items) {
  const clusters = [];
  for (const item of items) {
    const index = clusters.findIndex((kept) => isNearDuplicate(item, kept));
    if (index === -1) clusters.push(item);
    else clusters[index] = mergeStory(clusters[index], item);
  }

  return clusters.sort((a, b) => b.importance - a.importance || new Date(b.publishedAt) - new Date(a.publishedAt));
}

function openAiEnabled() {
  return Boolean(OPENAI_API_KEY);
}

function modelSummaryPrompt() {
  return [
    "You are the senior editor of a concise AI news reader.",
    "Summarize one article or merged story cluster accurately and concretely.",
    "Use the supplied feed text first. If web search is available and the feed text is thin, inspect the article/source before writing.",
    "Preserve all essential numbers, money amounts, percentages, dates, rounds, model names, company names, and named people.",
    "Do not invent facts. If a detail is not available, omit it rather than filling the gap.",
    "Write for a reader who wants to understand what happened, why it matters, and what to watch.",
    "Avoid generic phrases like 'the story is about' or 'the useful signal is'.",
    "Return JSON only."
  ].join(" ");
}

function modelSummarySchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["lead", "fullSummary", "keyFacts", "sourceConfidence"],
    properties: {
      lead: {
        type: "string",
        description: "A punchy factual lead, one or two sentences, no more than 320 characters. Include the most important number/date if there is one."
      },
      fullSummary: {
        type: "string",
        description: "A clear 120-220 word story summary. Include essential numbers and context. No markdown."
      },
      keyFacts: {
        type: "array",
        items: { type: "string" },
        maxItems: 10,
        description: "Exact important facts: numbers, dates, amounts, companies, people, model names, rounds, valuations."
      },
      sourceConfidence: {
        type: "string",
        enum: ["high", "medium", "low"],
        description: "High if article/full source was available, medium if only feed snippets and related coverage were available, low if evidence is very thin."
      }
    }
  };
}

function storyEvidence(item) {
  return {
    title: item.title,
    sourceName: item.sourceName,
    lane: item.lane,
    publishedAt: item.publishedAt,
    url: item.url,
    sourceSummary: item.sourceSummary || item.summary,
    existingLead: item.summary,
    existingFullSummary: item.fullSummary,
    relatedSources: item.relatedSources || [],
    relatedLinks: item.relatedLinks || []
  };
}

function responseText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const parts = [];
  for (const output of payload.output || []) {
    for (const content of output.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
      if (typeof content.output_text === "string") parts.push(content.output_text);
    }
  }
  return parts.join("\n").trim();
}

function parseJsonObject(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Model returned no JSON object");
    return JSON.parse(match[0]);
  }
}

function validateModelSummary(value) {
  if (!value || typeof value !== "object") throw new Error("Model summary was not an object");
  const lead = tidyText(value.lead || "");
  const fullSummary = tidyText(value.fullSummary || "");
  const keyFacts = Array.isArray(value.keyFacts) ? value.keyFacts.map((fact) => tidyText(String(fact))).filter(Boolean).slice(0, 10) : [];
  const sourceConfidence = ["high", "medium", "low"].includes(value.sourceConfidence) ? value.sourceConfidence : "medium";
  if (lead.length < 40 || fullSummary.length < 90) throw new Error("Model summary was too thin");
  return { lead, fullSummary, keyFacts, sourceConfidence };
}

async function callOpenAiSummary(item, useWebSearch = openAiWebSearchAvailable) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_SUMMARY_TIMEOUT_MS);
  const body = {
    model: OPENAI_SUMMARY_MODEL,
    input: [
      { role: "system", content: modelSummaryPrompt() },
      {
        role: "user",
        content: [
          "Summarize this story for the app.",
          "If related coverage is present, merge it into one story, not multiple summaries.",
          "Evidence JSON:",
          JSON.stringify(storyEvidence(item), null, 2)
        ].join("\n\n")
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "article_summary",
        strict: true,
        schema: modelSummarySchema()
      }
    },
    reasoning: { effort: "low" },
    max_output_tokens: 900
  };

  if (useWebSearch) body.tools = [{ type: "web_search_preview" }];

  try {
    const response = await fetch(`${OPENAI_BASE_URL}/responses`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = payload.error?.message || `OpenAI returned ${response.status}`;
      throw new Error(message);
    }

    return validateModelSummary(parseJsonObject(responseText(payload)));
  } finally {
    clearTimeout(timeout);
  }
}

async function summarizeItemWithModel(item) {
  try {
    return await callOpenAiSummary(item);
  } catch (error) {
    if (openAiWebSearchAvailable && /tool|web_search|unsupported|invalid/i.test(error.message)) {
      openAiWebSearchAvailable = false;
      return await callOpenAiSummary(item, false);
    }
    throw error;
  }
}

function applyModelSummary(item, modelSummary) {
  const keyFacts = mergeKeyFacts(modelSummary.keyFacts, item.keyFacts, extractKeyFacts(modelSummary.fullSummary, modelSummary.lead));
  return {
    ...item,
    summary: finishAtBoundary(modelSummary.lead, 340),
    fullSummary: finishAtBoundary(modelSummary.fullSummary, 1400),
    keyFacts,
    sourceConfidence: modelSummary.sourceConfidence,
    summaryEngine: OPENAI_SUMMARY_MODEL
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function summarizeItemsWithModel(items, errors) {
  if (!openAiEnabled()) {
    errors.push({ source: "OpenAI summarizer", message: "OPENAI_API_KEY is not set; using fallback summaries." });
    return { items, summaryEngine: "fallback" };
  }

  const limit = Math.min(items.length, OPENAI_SUMMARY_MAX_ITEMS);
  const selected = items.slice(0, limit);
  const skipped = items.slice(limit);
  const modelErrors = [];
  const summarized = await mapWithConcurrency(selected, OPENAI_SUMMARY_CONCURRENCY, async (item) => {
    try {
      return applyModelSummary(item, await summarizeItemWithModel(item));
    } catch (error) {
      modelErrors.push({ title: item.title, message: error.message });
      return { ...item, summaryEngine: "fallback" };
    }
  });

  if (skipped.length) {
    errors.push({ source: "OpenAI summarizer", message: `Summarized ${limit} stories with ${OPENAI_SUMMARY_MODEL}; ${skipped.length} lower-ranked stories used fallback summaries because OPENAI_SUMMARY_MAX_ITEMS=${OPENAI_SUMMARY_MAX_ITEMS}.` });
  }
  if (modelErrors.length) {
    errors.push({
      source: "OpenAI summarizer",
      message: `${modelErrors.length} story summaries fell back after model errors. First: ${modelErrors[0].title} - ${modelErrors[0].message}`
    });
  }

  return {
    items: summarized.concat(skipped.map((item) => ({ ...item, summaryEngine: "fallback" }))),
    summaryEngine: modelErrors.length === selected.length ? "fallback" : OPENAI_SUMMARY_MODEL
  };
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

  const mergedItems = mergeDuplicates(dedupe(batches.flat())
    .filter((item) => item.title && item.url)
    .filter(isFreshItem)
    .map((item) => ({ ...item, importance: scoreItem(item) }))
    .sort((a, b) => b.importance - a.importance || new Date(b.publishedAt) - new Date(a.publishedAt)));
  const summarized = await summarizeItemsWithModel(mergedItems, errors);
  const items = summarized.items.map((item) => ({
    ...item,
    filterCategory: normalizeFilterCategory(item.filterCategory, item)
  }));

  cache = {
    generatedAt: new Date().toISOString(),
    nextRefreshAt: new Date(Date.now() + REFRESH_MS).toISOString(),
    items,
    errors,
    summaryEngine: summarized.summaryEngine
  };

  console.log(`Loaded ${items.length} AI updates with ${errors.length} source errors. Summaries: ${summarized.summaryEngine}.`);
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
