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
    funding: "Funding & deals",
    models: "Model releases",
    papers: "Research & papers",
    pushback: "AI pushbacks",
    general: "General AI"
  }[category] || "General AI";
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Publication date unavailable";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC"
  }).format(date) + " UTC";
}

function storyPath(story) {
  return `/stories/${encodeURIComponent(story.id)}/`;
}

function articleHtml(story, related) {
  const canonical = `${secondaryOrigin}${storyPath(story)}`;
  const readerUrl = `${secondaryOrigin}/?story=${encodeURIComponent(story.id)}`;
  const title = String(story.title || "AI Brief story");
  const description = String(story.summary || story.fullSummary || "").slice(0, 300);
  const facts = Array.isArray(story.keyFacts) ? story.keyFacts : [];
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
  const relatedMarkup = related.map((item) => `
          <li><a href="${storyPath(item)}">${escapeHtml(item.title)}</a><span>${escapeHtml(item.sourceName || "")}</span></li>`).join("");
  const factsMarkup = facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <meta name="theme-color" content="#070a0f">
    <title>${escapeHtml(title)} | AI Brief</title>
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="canonical" href="${canonical}">
    <link rel="icon" href="/logo.svg" type="image/svg+xml">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="AI Brief">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${canonical}">
    <meta property="og:image" content="${secondaryOrigin}/visual.svg?lane=${encodeURIComponent(story.filterCategory || story.lane || "general")}&amp;title=${encodeURIComponent(title)}">
    <meta name="twitter:card" content="summary_large_image">
    <script type="application/ld+json">${safeJson(schema)}</script>
    <style>
      :root{color-scheme:dark;--bg:#070a0f;--panel:#101721;--text:#f8fafc;--muted:#b5bfcc;--line:rgba(255,255,255,.15);--green:#3bd671}
      *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#172337 0,#070a0f 42%);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}
      a{color:var(--green)}.shell{width:min(880px,calc(100% - 32px));margin:0 auto;padding:24px 0 64px}.top{display:flex;align-items:center;justify-content:space-between;gap:16px;padding-bottom:28px}.brand{display:flex;align-items:center;gap:9px;color:var(--green);font-weight:900;text-decoration:none;text-transform:uppercase;letter-spacing:.05em}.brand img{width:24px;height:24px}.reader{border:1px solid var(--line);border-radius:9px;padding:10px 14px;color:var(--text);font-weight:800;text-decoration:none}
      article{border:1px solid var(--line);border-radius:16px;background:rgba(16,23,33,.86);padding:clamp(22px,5vw,54px);box-shadow:0 24px 80px rgba(0,0,0,.35)}.eyebrow{margin:0 0 12px;color:var(--green);font-size:.78rem;font-weight:900;text-transform:uppercase;letter-spacing:.08em}h1{margin:0;font-size:clamp(2rem,7vw,4.7rem);line-height:1.02;letter-spacing:-.045em}.dek{margin:24px 0;color:#dfe7ef;font-size:clamp(1.12rem,2.5vw,1.4rem);line-height:1.55}.meta{display:flex;flex-wrap:wrap;gap:8px 18px;padding:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);color:var(--muted);font-size:.9rem}.analysis{font-size:1.06rem}.analysis h2,.facts h2,.related h2{margin-top:32px;font-size:1rem;text-transform:uppercase;letter-spacing:.06em;color:var(--green)}.facts ul{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none}.facts li{border:1px solid var(--line);border-radius:999px;padding:6px 11px;color:#dfe7ef}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:34px}.actions a{border-radius:9px;padding:11px 15px;font-weight:850;text-decoration:none}.actions .primary{background:var(--green);color:#07100b}.actions .secondary{border:1px solid var(--line);color:var(--text)}.related{margin-top:30px}.related ul{display:grid;gap:10px;padding:0;list-style:none}.related li{display:grid;gap:2px;border-top:1px solid var(--line);padding-top:12px}.related li a{color:var(--text);font-weight:800;text-decoration:none}.related li span{color:var(--muted);font-size:.85rem}.notice{margin:18px 0 0;color:var(--muted);font-size:.8rem}
      @media(max-width:600px){.shell{width:min(100% - 20px,880px);padding-top:12px}.top{padding-bottom:14px}.reader{font-size:.8rem}article{border-radius:12px}h1{font-size:2.35rem}}
    </style>
  </head>
  <body>
    <main class="shell">
      <header class="top">
        <a class="brand" href="/"><img src="/logo.svg" alt="">AI Brief</a>
        <a class="reader" href="${readerUrl}">Open in AI Brief reader</a>
      </header>
      <article>
        <p class="eyebrow">${escapeHtml(categoryLabel(story.filterCategory))}</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="dek">${escapeHtml(story.summary || "")}</p>
        <div class="meta">
          <span>Source: ${escapeHtml(story.sourceName || "Unknown")}</span>
          <time datetime="${escapeHtml(story.publishedAt || "")}">${escapeHtml(formatDate(story.publishedAt))}</time>
        </div>
        <section class="analysis">
          <h2>Why it matters</h2>
          <p>${escapeHtml(story.fullSummary || story.summary || "")}</p>
        </section>
        ${facts.length ? `<section class="facts"><h2>Key facts</h2><ul>${factsMarkup}</ul></section>` : ""}
        <div class="actions">
          <a class="primary" href="${readerUrl}">Open in reader</a>
          <a class="secondary" href="${escapeHtml(story.url || "#")}" target="_blank" rel="noopener noreferrer">Read original source</a>
        </div>
        <p class="notice">SEO story-page pilot. This preview page is intentionally blocked from search indexing.</p>
      </article>
      <section class="related">
        <h2>Nearby stories</h2>
        <ul>${relatedMarkup}</ul>
      </section>
    </main>
  </body>
</html>`;
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

for (const [index, story] of stories.entries()) {
  const related = stories.filter((item) => item.id !== story.id).slice(Math.max(0, index - 1), Math.max(0, index - 1) + 3);
  const destination = path.join(outputDir, "stories", story.id);
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, "index.html"), articleHtml(story, related), "utf8");
}

await writeFile(
  path.join(outputDir, "preview-manifest.json"),
  JSON.stringify({ generatedAt: new Date().toISOString(), origin: secondaryOrigin, stories: stories.map((story) => ({ id: story.id, title: story.title, path: storyPath(story) })) }, null, 2),
  "utf8"
);

console.log(`Built secondary preview with ${stories.length} story pages in ${outputDir}`);
