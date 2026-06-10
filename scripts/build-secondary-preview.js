import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const outputDir = path.join(root, ".preview-secondary");
const secondaryOrigin = "https://ai-brief-arsh-20260604.web.app";
const storyCount = 20;

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function categoryLabel(category = "general") {
  return {
    funding: "Funding",
    models: "Models",
    papers: "Papers",
    pushback: "Pushback",
    general: "General"
  }[category] || "General";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Publication date unavailable";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function storyPath(story) {
  return `/stories/${encodeURIComponent(story.id)}/`;
}

function generatedVisualUrl(category = "general") {
  const colors = {
    funding: "#3bd671",
    models: "#b28cff",
    papers: "#f0b84a",
    pushback: "#ff6b6b",
    general: "#65a7ff"
  };
  const safeCategory = colors[category] ? category : "general";
  const color = colors[safeCategory];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d1117"/><stop offset="1" stop-color="${color}" stop-opacity="0.38"/></linearGradient></defs><rect width="900" height="1200" fill="url(#g)"/><circle cx="760" cy="180" r="260" fill="${color}" opacity="0.24"/><circle cx="110" cy="1040" r="310" fill="${color}" opacity="0.16"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function articleHtml(story, indexHtml) {
  const canonical = `${secondaryOrigin}${storyPath(story)}`;
  const title = String(story.title || "AI Brief story");
  const description = String(story.summary || story.fullSummary || "").slice(0, 300);
  const facts = Array.isArray(story.keyFacts) ? story.keyFacts : [];
  const category = story.filterCategory || "general";
  const imageUrl = story.imageUrl && !story.imageUrl.startsWith("/visual.svg") ? story.imageUrl : generatedVisualUrl(category);
  const coverage =
    Array.isArray(story.relatedSources) && story.relatedSources.length > 1
      ? `Merged coverage from ${story.relatedSources.slice(0, 3).join(", ")}${story.relatedSources.length > 3 ? " and others" : ""}.`
      : "";
  const factsText = facts.length ? `Key details: ${facts.slice(0, 8).join(", ")}.` : "";
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    datePublished: story.publishedAt,
    author: { "@type": "Organization", name: "AI Brief" },
    publisher: { "@type": "Organization", name: "AI Brief", logo: { "@type": "ImageObject", url: `${secondaryOrigin}/logo.svg` } },
    mainEntityOfPage: canonical,
    url: canonical,
    isBasedOn: story.url
  };
  const storyMarkup = `<section id="storyDeck" class="story-deck" aria-label="AI story reader">
        <article class="story-card" data-index="0" data-id="${escapeHtml(story.id)}">
          <img class="story-image" src="${escapeHtml(imageUrl)}" alt="">
          <div class="story-shade"></div>
          <div class="story-content">
            <div class="story-meta">
              <span class="lane ${escapeHtml(category)}">${escapeHtml(categoryLabel(category))}</span>
              <span class="source">${escapeHtml(story.sourceName || "")}</span>
              <time class="time" datetime="${escapeHtml(story.publishedAt || "")}">${escapeHtml(formatDate(story.publishedAt))}</time>
            </div>
            <h1>${escapeHtml(title)}</h1>
            <p class="hook">${escapeHtml(story.summary || "")}</p>
            <details>
              <summary>Read more</summary>
              <p class="change">${escapeHtml(story.fullSummary || story.summary || "")}</p>
              <p class="facts"${factsText ? "" : " hidden"}>${escapeHtml(factsText)}</p>
              <p class="coverage"${coverage ? "" : " hidden"}>${escapeHtml(coverage)}</p>
              <p class="watch">Continue swiping for more AI Brief stories.</p>
            </details>
            <div class="story-actions">
              <button class="save" type="button">Save</button>
              <button class="share" type="button">Share</button>
              <a class="original" href="${escapeHtml(story.url || "#")}" target="_blank" rel="noopener noreferrer">Original</a>
            </div>
          </div>
        </article>
      </section>`;

  return indexHtml
    .replace("<title>AI Brief</title>", `<title>${escapeHtml(title)} | AI Brief</title>`)
    .replace('<meta name="theme-color" content="#070a0f">', `<meta name="theme-color" content="#070a0f">
    <meta name="robots" content="noindex, nofollow">
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${canonical}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="AI Brief">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${canonical}">
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">${safeJson(schema)}</script>`)
    .replace('<strong id="storyPosition">Loading</strong>', '<strong id="storyPosition">Story preview</strong>')
    .replace('<section id="storyDeck" class="story-deck" aria-label="AI story reader"></section>', storyMarkup);
}

await rm(outputDir, { recursive: true, force: true });
await cp(publicDir, outputDir, { recursive: true });

const indexPath = path.join(outputDir, "index.html");
const indexHtml = await readFile(indexPath, "utf8");
await writeFile(
  indexPath,
  indexHtml.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', '<meta name="viewport" content="width=device-width, initial-scale=1">\n    <meta name="robots" content="noindex, nofollow">'),
  "utf8"
);

const feed = JSON.parse(await readFile(path.join(publicDir, "curated-feed.json"), "utf8"));
const stories = [...(feed.items || [])]
  .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
  .slice(0, storyCount);

for (const story of stories) {
  const destination = path.join(outputDir, "stories", story.id);
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "index.html"), articleHtml(story, indexHtml), "utf8");
}

await writeFile(
  path.join(outputDir, "preview-manifest.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), origin: secondaryOrigin, stories: stories.map((story) => ({ id: story.id, title: story.title, path: storyPath(story) })) }, null, 2),
  "utf8"
);

console.log(`Built secondary preview with ${stories.length} story pages in ${outputDir}`);
