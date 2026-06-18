import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preview = process.argv.includes("--preview");
const origin = preview ? "https://ai-brief-arsh-20260604.web.app" : "https://goargulaainews.web.app";
const outputDir = path.join(root, preview ? ".preview-secondary" : ".production-site");
const publicDir = path.join(root, "public");
const storyLimit = preview ? 20 : Infinity;
const noindex = preview;
const categories = {
  funding: "Funding & deals",
  models: "Model releases",
  papers: "Research & papers",
  pushback: "AI pushbacks",
  general: "General AI"
};
const googleTag = `<script async src="https://www.googletagmanager.com/gtag/js?id=G-BWV7M2CBXP"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());if(window.location.hostname==='goargulaainews.web.app'){gtag('config','G-BWV7M2CBXP')}</script>`;

const esc = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const json = (value) => JSON.stringify(value).replaceAll("<", "\\u003c");
const storyPath = (story) => `/stories/${encodeURIComponent(story.id)}/`;
const topicPath = (category) => `/topics/${category}/`;
const isoDate = (value) => new Date(value).toISOString();
const displayDate = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));

function pageShell({ title, description, canonical, body, schema = null }) {
  return `<!doctype html>
<html lang="en"><head>${preview ? "" : googleTag}
  <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
  ${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="max-image-preview:large">'}
  <meta name="theme-color" content="#070a0f"><title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}"><link rel="canonical" href="${canonical}">
  <link rel="icon" href="/logo.svg" type="image/svg+xml">
  <meta property="og:site_name" content="AI Brief"><meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}">
  ${schema ? `<script type="application/ld+json">${json(schema)}</script>` : ""}
  <style>
  :root{color-scheme:dark;--bg:#070a0f;--panel:#101721;--text:#f8fafc;--muted:#b5bfcc;--line:rgba(255,255,255,.15);--green:#3bd671}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#172337 0,#070a0f 42%);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.55}a{color:var(--green)}main{width:min(980px,calc(100% - 28px));margin:auto;padding:24px 0 64px}.top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:34px}.brand{display:flex;align-items:center;gap:8px;color:var(--green);font-weight:900;text-decoration:none;text-transform:uppercase}.brand img{width:24px}.top nav{display:flex;flex-wrap:wrap;gap:10px}.top nav a{color:var(--muted);font-size:.85rem}.hero{max-width:760px;margin:50px 0}.hero h1{font-size:clamp(2.5rem,8vw,5rem);line-height:1;margin:0}.hero p{font-size:1.15rem;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.card{display:grid;gap:8px;border:1px solid var(--line);border-radius:12px;background:rgba(16,23,33,.78);padding:18px;text-decoration:none;color:var(--text)}.card span,.card time{color:var(--muted);font-size:.8rem}.card strong{font-size:1.05rem}.copy{max-width:760px}.copy h2{margin-top:34px;color:var(--green);font-size:1rem;text-transform:uppercase;letter-spacing:.06em}.copy p,.copy li{color:#d9e1ea}footer{margin-top:48px;border-top:1px solid var(--line);padding-top:20px;color:var(--muted);font-size:.8rem}
  </style></head><body><main><header class="top"><a class="brand" href="/"><img src="/logo.svg" alt="">AI Brief</a><nav><a href="/archive/">Archive</a><a href="/about/">About</a><a href="/sources-and-methodology/">Methodology</a></nav></header>${body}<footer>AI Brief curates and explains important developments across artificial intelligence.</footer></main></body></html>`;
}

function generatedVisualUrl(category = "general") {
  const colors = { funding: "#3bd671", models: "#b28cff", papers: "#f0b84a", pushback: "#ff6b6b", general: "#65a7ff" };
  const color = colors[category] || colors.general;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d1117"/><stop offset="1" stop-color="${color}" stop-opacity=".38"/></linearGradient></defs><rect width="900" height="1200" fill="url(#g)"/><circle cx="760" cy="180" r="260" fill="${color}" opacity=".24"/><circle cx="110" cy="1040" r="310" fill="${color}" opacity=".16"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function storyHtml(story, indexHtml) {
  const canonical = origin + storyPath(story);
  const category = story.filterCategory || "general";
  const facts = Array.isArray(story.keyFacts) ? story.keyFacts : [];
  const description = String(story.summary || story.fullSummary || "").slice(0, 300);
  const imageUrl = story.imageUrl && !story.imageUrl.startsWith("/visual.svg") ? story.imageUrl : generatedVisualUrl(category);
  const schema = { "@context": "https://schema.org", "@type": "Article", headline: story.title, description, author: { "@type": "Person", name: "Arshdeep Singh Gulati", url: `${origin}/authors/arshdeep-singh-gulati/` }, publisher: { "@type": "Organization", name: "AI Brief", logo: { "@type": "ImageObject", url: `${origin}/logo.svg` } }, mainEntityOfPage: canonical, url: canonical, isBasedOn: story.url };
  if (story.curatedAt) schema.datePublished = story.curatedAt;
  if (story.updatedAt || story.curatedAt) schema.dateModified = story.updatedAt || story.curatedAt;
  const whyItMatters = story.whyItMatters ? `Why it matters: ${story.whyItMatters}` : "Continue swiping for more AI Brief stories.";
  const markup = `<section id="storyDeck" class="story-deck" aria-label="AI story reader"><article class="story-card" data-index="0" data-id="${esc(story.id)}"><img class="story-image" src="${esc(imageUrl)}" alt=""><div class="story-shade"></div><div class="story-content"><div class="story-meta"><span class="lane ${esc(category)}">${esc(categories[category])}</span><span class="source">${esc(story.sourceName)}</span><time class="time" datetime="${esc(story.publishedAt)}">${esc(displayDate(story.publishedAt))}</time></div><h1>${esc(story.title)}</h1><p class="hook">${esc(story.summary)}</p><details><summary>Read more</summary><p class="change">${esc(story.fullSummary)}</p><p class="facts">Key details: ${esc(facts.slice(0, 8).join(", "))}.</p><p class="watch">${esc(whyItMatters)}</p></details><div class="story-actions"><button class="save" type="button">Save</button><button class="share" type="button">Share</button><a class="original" href="${esc(story.url)}" target="_blank" rel="noopener noreferrer">Original</a></div></div></article></section>`;
  return indexHtml
    .replace("<title>AI Brief</title>", `<title>${esc(story.title)} | AI Brief</title>`)
    .replace('<meta name="theme-color" content="#070a0f">', `<meta name="theme-color" content="#070a0f">\n    ${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="max-image-preview:large">'}\n    <meta name="description" content="${esc(description)}">\n    <link rel="canonical" href="${canonical}">\n    <meta property="og:type" content="article"><meta property="og:site_name" content="AI Brief"><meta property="og:title" content="${esc(story.title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta name="twitter:card" content="summary_large_image">\n    <script type="application/ld+json">${json(schema)}</script>`)
    .replace('<section id="storyDeck" class="story-deck" aria-label="AI story reader"></section>', markup);
}

function cards(stories) {
  return `<div class="grid">${stories.map((story) => `<a class="card" href="${storyPath(story)}"><span>${esc(categories[story.filterCategory] || "General AI")} · ${esc(story.sourceName)}</span><strong>${esc(story.title)}</strong><time datetime="${esc(story.publishedAt)}">${esc(displayDate(story.publishedAt))}</time></a>`).join("")}</div>`;
}

async function writePage(relative, html) {
  const dir = path.join(outputDir, relative);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "index.html"), html, "utf8");
}

await rm(outputDir, { recursive: true, force: true });
await cp(publicDir, outputDir, { recursive: true });
const indexPath = path.join(outputDir, "index.html");
let indexHtml = await readFile(indexPath, "utf8");
indexHtml = indexHtml.replace('<meta name="theme-color" content="#070a0f">', `<meta name="theme-color" content="#070a0f">\n    ${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="max-image-preview:large">'}\n    <meta name="description" content="A curated AI news reader covering models, research, funding, policy, products, infrastructure, and real-world adoption.">\n    <link rel="canonical" href="${origin}/">\n    <script type="application/ld+json">${json({ "@context": "https://schema.org", "@graph": [{ "@type": "Organization", name: "AI Brief", url: `${origin}/`, logo: `${origin}/logo.svg` }, { "@type": "WebSite", name: "AI Brief", url: `${origin}/`, publisher: { "@type": "Organization", name: "AI Brief" } }] })}</script>`);
await writeFile(indexPath, indexHtml, "utf8");

const feed = JSON.parse(await readFile(path.join(publicDir, "curated-feed.json"), "utf8"));
const stories = [...feed.items].filter((story) => story.id && story.title && story.summary && story.fullSummary && story.sourceName && story.url && story.publishedAt).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt)).slice(0, storyLimit);
for (const story of stories) await writePage(path.join("stories", story.id), storyHtml(story, indexHtml));

if (!preview) {
  await writePage("archive", pageShell({ title: "AI News Story Archive | AI Brief", description: "Browse the complete AI Brief story archive.", canonical: `${origin}/archive/`, body: `<section class="hero"><h1>Story archive</h1><p>Browse ${stories.length} curated AI developments across models, research, funding, policy, infrastructure, products, and adoption.</p></section>${cards(stories)}` }));
  for (const [category, label] of Object.entries(categories)) {
    const topicStories = stories.filter((story) => story.filterCategory === category);
    await writePage(path.join("topics", category), pageShell({ title: `${label} | AI Brief`, description: `Curated ${label.toLowerCase()} stories from AI Brief.`, canonical: origin + topicPath(category), body: `<section class="hero"><h1>${esc(label)}</h1><p>${topicStories.length} curated stories.</p></section>${cards(topicStories)}` }));
  }
  const trustPages = {
    about: ["About AI Brief", "AI Brief is an independent curated reader that identifies, summarizes, and explains important developments across artificial intelligence. It is designed for readers who want the core fact, context, important numbers, and implications without losing the original source.", "Stories link to their original reporting or primary source. AI Brief summaries are editorial syntheses and should not be treated as original reporting unless explicitly stated."],
    "sources-and-methodology": ["Sources and methodology", "AI Brief monitors primary-source newsrooms, research repositories, specialist AI publications, broad business reporting, announcement wires, and regional sources.", "Stories are selected for material impact, merged when several sources cover the same event, summarized with explicit facts and context, and linked to the original source. Weak, duplicative, unverifiable, and routine announcements are excluded."],
    "editorial-policy": ["Editorial policy", "AI Brief prioritizes factual accuracy, primary sources, reputable reporting, concrete numbers, and clear distinction between confirmed results, company claims, analyst estimates, and early research.", "Categories describe the reader-facing core of a story. Funding covers financing and deals; Models covers material model releases; Papers covers research artifacts; Pushback covers restrictions, opposition, harms, and warnings; General covers other important AI developments."],
    corrections: ["Corrections", "AI Brief updates summaries when important facts change or when errors are identified.", "To request a correction, use the contact page and include the story URL, the statement that needs review, and a supporting primary or authoritative source."],
    contact: ["Contact", "For feedback, corrections, source suggestions, or partnership inquiries, contact Arshdeep Singh Gulati through LinkedIn.", '<a href="https://www.linkedin.com/in/arshdeep-singh-gulati-638468114/" target="_blank" rel="noopener noreferrer">Contact on LinkedIn</a>']
  };
  for (const [slug, [title, first, second]] of Object.entries(trustPages)) await writePage(slug, pageShell({ title: `${title} | AI Brief`, description: first, canonical: `${origin}/${slug}/`, body: `<section class="hero"><h1>${esc(title)}</h1></section><section class="copy"><p>${esc(first)}</p><p>${slug === "contact" ? second : esc(second)}</p></section>` }));
  await writePage(path.join("authors", "arshdeep-singh-gulati"), pageShell({ title: "Arshdeep Singh Gulati | AI Brief", description: "Author and curator of AI Brief.", canonical: `${origin}/authors/arshdeep-singh-gulati/`, schema: { "@context": "https://schema.org", "@type": "Person", name: "Arshdeep Singh Gulati", url: `${origin}/authors/arshdeep-singh-gulati/`, sameAs: ["https://www.linkedin.com/in/arshdeep-singh-gulati-638468114/"] }, body: '<section class="hero"><h1>Arshdeep Singh Gulati</h1><p>Author and curator of AI Brief.</p></section><section class="copy"><p>Arshdeep curates, merges, and explains material developments across AI models, research, funding, policy, infrastructure, products, and real-world adoption.</p><p><a href="https://www.linkedin.com/in/arshdeep-singh-gulati-638468114/" target="_blank" rel="noopener noreferrer">LinkedIn profile</a></p></section>' }));

  const sitemapUrls = [`${origin}/`, `${origin}/archive/`, `${origin}/authors/arshdeep-singh-gulati/`, ...Object.keys(categories).map((c) => origin + topicPath(c)), ...Object.keys(trustPages).map((p) => `${origin}/${p}/`), ...stories.map((s) => origin + storyPath(s))];
  await writeFile(path.join(outputDir, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${sitemapUrls.map((url) => `<url><loc>${esc(url)}</loc></url>`).join("")}</urlset>`, "utf8");
  const cutoff = Date.now() - 2 * 864e5;
  const recent = stories.filter((s) => s.curatedAt && new Date(s.curatedAt).getTime() >= cutoff);
  await writeFile(path.join(outputDir, "news-sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${recent.map((s) => `<url><loc>${esc(origin + storyPath(s))}</loc><news:news><news:publication><news:name>AI Brief</news:name><news:language>en</news:language></news:publication><news:publication_date>${isoDate(s.curatedAt)}</news:publication_date><news:title>${esc(s.title)}</news:title></news:news></url>`).join("")}</urlset>`, "utf8");
  await writeFile(path.join(outputDir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\nSitemap: ${origin}/news-sitemap.xml\n`, "utf8");
}

await writeFile(path.join(outputDir, "seo-build-manifest.json"), JSON.stringify({ generatedAt: new Date().toISOString(), origin, preview, stories: stories.map((s) => ({ id: s.id, title: s.title, path: storyPath(s) })) }, null, 2), "utf8");
console.log(`Built ${preview ? "secondary preview" : "production SEO site"} with ${stories.length} story pages in ${outputDir}`);
