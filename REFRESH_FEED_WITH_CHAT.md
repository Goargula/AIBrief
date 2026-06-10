# Chat-Curated Feed Refresh

Use this file whenever the user asks: "refresh the feed" or "refresh the stories" without wanting an API key.

Default to a thorough refresh. The objective is to capture all important developments across the AI world, not to reach a target number of stories. A narrow top-up from two or three obvious sources is not enough unless the user explicitly asks for a small update.

## Non-Negotiable Completion Gate

Every feed refresh, including a routine or apparently small refresh, must complete the named-site reconciliation in Audit J. This is not optional, is not limited to requests containing words such as "thorough," and cannot be replaced by broad web searches, category searches, or finding many stories elsewhere.

The refresh is incomplete until:

1. Every individually named publication and newsroom in Audit J has its own source-ledger row.
2. Every row records the exact page inspected or site-restricted fallback query, the newest relevant headline/date observed, material inclusions, and important exclusions.
3. Every row is marked `checked`, `fallback checked`, or `unavailable after fallback`. A source group cannot be marked complete as a substitute for its individual sites.
4. Every material candidate found during reconciliation has been compared against the existing feed and either included, merged with an existing story, or explicitly excluded with a reason.
5. A final scan confirms there are no unchecked source-ledger rows.

Do not edit `public/curated-feed.json`, deploy, commit, push, or tell the user the refresh is complete before this gate is satisfied. If interrupted before all rows are closed, describe the refresh as incomplete or provisional.

## Goal

Maintain `public/curated-feed.json` by using this chat model to fetch current AI news, research papers, funding rounds, acquisitions, policy stories, infrastructure updates, practical applications, and product announcements, then summarize them manually in high-quality editorial form.

Treat the file like a small database, not a disposable export. Keep existing curated stories unless they are exact duplicates or clearly broken. Add new stories near the top, update an existing story when new coverage belongs to the same underlying event, and let older stories move down by file order and lower `importance`.

The app serves `public/curated-feed.json` first when the file exists. No OpenAI API key is required.

The public Firebase-hosted app serves this same static file after deployment. Do not add Firebase Web API keys, Firestore client URLs, or other frontend secrets to `public/app.js` for feed refreshes. The current production-safe flow is to update `public/curated-feed.json`, build the SEO site, deploy Firebase Hosting, and verify the live reader plus generated story pages and sitemaps.

## Workflow

1. Fetch the current raw feed from the running app:

```powershell
$payload = Invoke-RestMethod -Uri 'http://localhost:4173/api/feed?refresh=1' -TimeoutSec 100
$payload.items | Select-Object title,sourceName,lane,filterCategory,publishedAt,url,summary,keyFacts,relatedSources | ConvertTo-Json -Depth 8
```

2. Load the existing `public/curated-feed.json` before writing. Preserve older items and append/merge new items into the existing list.

Before searching, record the current `generatedAt`, current item count, and newest 8-12 `publishedAt` values. Use the latest `generatedAt` as the baseline for "since last refresh," but also allow high-quality missed stories from the last 48-72 hours when they fill an important lane.

3. Do a recency-first orientation pass before the category audits:

- Check the latest pages or feeds from at least two broad news sources, such as TechCrunch Latest/AI, VentureBeat AI, Reuters/AP where available, The Verge, MIT Technology Review, Business Wire, PR Newswire, and Google News-style searches.
- Complete the mandatory named-site reconciliation below. Search queries alone are not enough because they routinely under-surface operational deployments, workforce changes, research reports, and stories with non-obvious AI headlines.
- Search for both `today` and `yesterday` using the current date. If the newest curated story is older than 12 hours, explicitly look for a fresher factual story before finalizing.
- Do not add conference calendars, earnings-call reminders, scraped reposts, Reddit-only claims, or generic investor notices just to make the feed look fresh.
- If no fresher story passes the quality bar, keep the older top story and note why.
- Use this pass only to establish the day's major themes and breaking events. Do not let broad-news results substitute for the mandatory category audits below.

4. Run mandatory category audits one by one.

Complete every audit below independently. Do not stop because another category already produced many stories. Do not use the total candidate count or total added count as a completion criterion. An audit is complete only after checking its primary sources, specialist sources, and targeted searches, then recording important inclusions and explicit exclusions.

For every audit:

1. Search `today`, `yesterday`, exact dates, and a 48-72 hour catch-up window.
   - Also run a 30-day catch-up for major workforce restructurings, landmark deployments, and empirical reports that may have been missed in earlier refreshes. Recency is not a reason to omit a still-material event that is absent from the feed.
2. Check primary sources first, then specialist/reputable reporting, then broad news/search results.
3. Compare candidates with the existing feed before deciding they are new.
4. Include every material development that would matter to a technically informed AI reader.
5. Exclude weak, duplicative, unverifiable, routine, or marginal items even if a category otherwise has no additions.
6. Record a short audit result: sources checked, stories included, notable candidates excluded, and why.

### Audit A: Model releases and model capabilities

Check separately:

- Frontier and major proprietary models from OpenAI, Anthropic, Google/DeepMind, Microsoft, Meta, xAI, Nvidia, AWS, and Apple.
- Open-weight and regional models from Hugging Face, Mistral, Cohere, Qwen/Alibaba, Baidu, Tencent, Huawei, DeepSeek, Moonshot, MiniMax, Zhipu, Sarvam, Sakana, Naver, Kakao, Stability, Runway, ElevenLabs, and other credible labs.
- Material model updates: new checkpoints, reasoning modes, context-window changes, multimodal capability, coding models, image/video/audio models, computer-use models, embeddings, rerankers, and inference-efficient variants.
- Independent benchmark evidence and technical reports that materially change the understanding of a model release.

Do not classify ordinary product features, integrations, agents, or partnerships as `models` unless a new or materially updated model/API capability is the core story.

### Audit B: Papers, research, benchmarks, datasets, and evaluations

Check separately:

- Recent arXiv lists for `cs.AI`, `cs.LG`, `cs.CL`, `cs.CV`, `cs.RO`, and relevant interdisciplinary categories.
- Nature, Science, Nature Machine Intelligence, major conference/proceedings sources, university labs, research institutes, and credible research trackers.
- New benchmarks, datasets, evaluation methods, interpretability work, alignment/safety research, agent research, robotics research, and AI-for-science findings.
- Technical reports from AI labs when the report itself contains substantive methods, measurements, datasets, or empirical findings.

Use `papers` for a substantive technical or empirical artifact even when its findings concern safety, cyber abuse, misuse, or risk. Use `pushback` when the core event is a warning, policy demand, opposition, lawsuit, ban, or public reaction without a substantial research artifact. When both apply, classify by what the reader is primarily being asked to understand.

### Audit C: Funding, acquisitions, investments, and company formation

Check separately:

- Venture rounds across seed through late stage.
- Strategic investments, acquisitions, mergers, IPOs, debt raises, public listings, and material financing events.
- Newly formed or newly revealed AI companies with important founders, technology, or capital.
- Funding/deals sources such as TechCrunch, Crunchbase News, Axios Pro Rata, Fortune Term Sheet, company announcements, Business Wire, PR Newswire, GlobeNewswire, and reputable local business press.

Use `funding` for all these reader-facing stories regardless of whether the internal source lane is startups, deals, infrastructure, or another domain.

### Audit D: Policy, safety, security, legal, labor, and public pushback

Check separately:

- Laws, regulations, executive actions, standards, export controls, antitrust, procurement rules, and national-security actions.
- Copyright, privacy, liability, lawsuits, bans, labor disputes, layoffs, protests, public opposition, and consumer backlash.
- Major AI-linked workforce restructurings, including layoffs, hiring cancellations, team reassignments, and role redesign. Search concrete terms such as `AI layoffs`, `AI job cuts`, `AI restructuring`, `AI workforce`, and named large employers rather than relying only on broad AI-news results.
- AI misuse, cyber threats, safety warnings, environmental opposition, and credible loss-of-control concerns.
- Policy and safety work from governments, standards bodies, courts, labs, civil-society groups, and reputable reporting.

Distinguish substantive research artifacts, which can belong in `papers`, from the policy response or warning event, which belongs in `pushback`.

Do not classify a story as `pushback` merely because a government, lawmaker, regulator, military, or national-security agency is involved. Supportive or expansionary policy belongs in `general`, including government AI adoption, investment, procurement, infrastructure support, national strategies, research programs, and exploratory ownership proposals. Use `pushback` only when the core event restricts, opposes, challenges, warns about, or responds to harms from AI.

### Audit E: Chips, compute, cloud, networking, memory, energy, and infrastructure

Check separately:

- Nvidia, AMD, Intel, Huawei Ascend, Cerebras, Groq, SambaNova, Tenstorrent, CoreWeave, hyperscalers, and sovereign-compute programs.
- Accelerators, inference hardware, networking, storage, HBM/memory, data-center construction, cloud capacity, and edge AI.
- Power, water, grid access, cooling, siting, permitting, supply-chain constraints, and geopolitical/export-control effects.

These stories normally use `general` unless the core event is financing (`funding`), a research artifact (`papers`), or resistance/regulation (`pushback`).

### Audit F: Products, agents, developer tooling, and enterprise adoption

Check separately:

- Consumer and enterprise AI products, agent platforms, coding tools, developer infrastructure, workflow automation, and important integrations.
- Material deployments and partnerships with evidence of scale, operational change, or strategic significance.
- Measurable operational outcomes from AI adoption, including fraud detected or prevented, losses avoided, productivity or cost changes, customer volumes, national or company-wide deployments, and documented workflow transformation.
- Newly released adoption surveys, workforce reports, and C-suite studies with a clear methodology and material findings. Distinguish self-reported survey evidence from measured operational results, but include strong reports when they materially clarify the adoption gap.
- Agent protocols, governance, observability, security tooling, and production infrastructure.

Reject routine feature announcements and generic partnerships that do not materially change capability, adoption, or market structure.

Before completing this audit, run targeted searches for `AI adoption report`, `AI deployment results`, `AI fraud`, `AI productivity report`, `AI workforce report`, and `AI business outcomes`, plus the latest AI/business pages from Reuters, AP, The Guardian business/technology, Financial Times where accessible, PR Newswire, Business Wire, and major consulting/research institutions.

### Audit G: Physical AI, robotics, autonomous systems, and industrial AI

Check separately:

- Humanoids, factory robots, autonomous vehicles, drones, warehouse/logistics systems, and embodied-agent research.
- Industrial digital twins, physical-world agents, manufacturing deployments, agriculture, and construction/mining applications.
- Important hardware-software reference platforms and real-world deployment evidence.

### Audit H: Healthcare, biology, drug discovery, and AI for science

Check separately:

- Clinical AI, diagnostics, medical imaging, healthcare operations, biomedical models, protein/molecule/material design, and drug discovery.
- Scientific discovery in physics, chemistry, climate, earth science, and other fields.
- Nature, Science, medical journals, university labs, research institutes, health systems, and official company/lab announcements.

Do not imply clinical efficacy from a preprint, laboratory result, company claim, or early pilot.

### Audit I: Regional ecosystems and smaller important developments

Run a final geographic and ecosystem gap check:

- China, India, Japan, South Korea, Southeast Asia, Europe, the Middle East, Africa, and Latin America.
- Smaller labs, open-source communities, local-language models, vertical agents, and technically meaningful developments that broad U.S. news sources may miss.

### Audit J: Broad-news reconciliation

Return to broad/current sources after the specialist audits. Reconcile major breaking stories against the category findings and catch important events that do not fit neatly elsewhere.

This audit is mandatory on every refresh, even if the category audits already found many stories or the user did not explicitly request a thorough pass.

As part of reconciliation, explicitly inspect every individually named source below:

- The latest or AI category pages from every source group below, using direct page inspection or a site-restricted fallback query where the page is inaccessible:
  - AI specialists: VentureBeat AI, AI News (`artificialintelligence-news.com`), Unite.AI, and The Register AI/ML.
  - Technology publications: TechCrunch AI/latest, The Verge AI, MIT Technology Review AI, and Wired AI where accessible.
  - Broad/business reporting: Reuters, Associated Press, Axios AI/technology, Fortune, The Guardian technology/business, and Financial Times where accessible.
  - Announcement wires: Business Wire, PR Newswire, and GlobeNewswire.
  - Primary-source newsrooms: OpenAI, Anthropic, Google/DeepMind, Microsoft, Meta, Nvidia, Apple, AWS, major government AI offices, and major research labs when their activity is relevant to the pass.
- Major business and general-news AI pages for operational-impact stories that technology-only sources may underweight.
- Newly published survey/report announcements from PR Newswire, Business Wire, universities, research institutes, consultancies, and workforce organizations.
- A 30-day query for major AI-linked layoffs, restructurings, fraud/loss figures, and scaled deployments absent from the existing feed.
- Record each named source individually. Do not record only the five source groups, and do not infer that checking one publication covers another publication in the same group.
- Prefer the source's latest page, AI section, newsroom, RSS feed, or direct recent-story listing. If it is inaccessible or does not expose current items, run a site-restricted fallback query for `today`, `yesterday`, and the exact current date.
- For each source, record the exact page or fallback query used plus the newest relevant headline and publication date observed. This evidence is required even when the source yields no additions.
- If a source page and its fallback query both fail, mark that individual source `unavailable after fallback` and record the failure. Do not silently omit it.
- Before closing Audit J, compare every material candidate found against the current feed and record `included`, `merged/duplicate`, or `excluded` with a concrete reason.
- Do not mark reconciliation complete until every individual source-ledger row is closed.

5. Produce a coverage ledger before writing.

Create a compact working ledger with one row for every audit above:

| Audit | Sources checked | Included stories | Important exclusions and reason | Status |
| --- | --- | --- | --- | --- |
| Models | ... | ... | ... | complete/incomplete |

Do not write the final feed while any audit is incomplete. A category may legitimately produce zero additions, but only after its audit is complete and the ledger explains why. The final number of additions may be small or large; completeness and importance matter, not count.

The ledger must name the targeted enterprise-outcomes, workforce, and report/survey searches used in Audits D, F, and J. Do not mark those audits complete based only on product-news or broad-news browsing.

The ledger must also include a separate named-site source ledger with one row per individually named source from Audit J. A single combined row, a row per source group, or a note such as "broad news checked" is insufficient.

Use this structure:

| Named source | Page or fallback query inspected | Newest relevant headline/date observed | Decision and reason | Status |
| --- | --- | --- | --- | --- |
| VentureBeat AI | `https://venturebeat.com/ai/` | `Headline`, YYYY-MM-DD | included / merged / excluded because ... | checked |
| AI News | `site:artificialintelligence-news.com ...` | `Headline`, YYYY-MM-DD | no material addition because ... | fallback checked |

Create rows for all named AI specialists, technology publications, broad/business publications, announcement wires, and primary-source newsrooms. Add rows for relevant government offices and research labs inspected during the pass.

Run a final source-ledger scan before writing the feed. If any named source has no row, lacks inspection evidence, or has no closed status, Audit J and the entire refresh remain incomplete.

6. De-duplicate stories before writing the curated JSON. Merge coverage when several sources describe the same underlying story. Do not delete older, still-valid stories just because they are no longer fresh.

7. For each curated story, write:

- `summary`: one or two punchy sentences with the core fact.
- `fullSummary`: a fuller 100-180 word explanation with the key numbers, named companies/people, context, why it matters, and what to watch.
- `keyFacts`: exact numbers, dates, funding amounts, valuations, acquisition prices, model names, institutions, or round names.
- `filterCategory`: exactly one of `funding`, `models`, `papers`, `pushback`, or `general`. Choose the best reader-facing filter match for the whole story, not every keyword it happens to mention:
  - `funding`: startup funding, strategic investments, acquisitions, mergers, IPOs, public listings, and liquidity/financing market stories.
  - `models`: new or materially updated AI model releases, previews, checkpoints, open-weight releases, benchmarked model updates, and model/API launches.
  - `papers`: research papers, arXiv/preprint items, benchmarks, datasets, evaluation methods, and academic/research-lab findings.
  - `pushback`: resistance or risk-focused events such as AI backlash, lawsuits, bans, restrictive regulation, labor disputes, copyright/privacy complaints, public opposition, safety/security warnings, environmental harms, and other actions whose core purpose is limiting, challenging, or warning about AI.
  - `general`: everything else, including ordinary product launches, infrastructure, partnerships, deployments, applications, broad AI news, supportive policy, government AI adoption, national AI strategies, public investment proposals, research programs, and procurement actions that are not a better fit above.
- `sourceConfidence`: `high`, `medium`, or `low`.
- `summaryEngine`: `chat-curated`.
- `curatedAt`: the ISO timestamp when AI Brief first added the story. Preserve this value on later refreshes.
- `updatedAt`: the ISO timestamp when AI Brief materially changes the summary, facts, sourcing, or interpretation. Omit it when the story has not been materially updated.

Never use the original source's `publishedAt` value as `curatedAt`. `publishedAt` describes the underlying source/event; `curatedAt` and `updatedAt` describe AI Brief's own publication history and power accurate Article metadata and Google News sitemap entries.

8. Rank by recency and importance:

- New or materially updated stories should sit near the top.
- Older stories should keep their original `publishedAt` and receive lower `importance` so they naturally move down.
- Keep stable `id` values for existing stories so the feed behaves like a database.
- After writing, verify both relevance order and recency order. The app's `Recent` view sorts strictly by `publishedAt`, so check the newest 8-12 stories by timestamp.
- Also count how many items are newer than the previous `generatedAt`. If the count is surprisingly low for the elapsed time, reopen the completed audit ledger and re-check the categories most likely to have been missed before committing.

9. Save the feed to:

```text
public/curated-feed.json
```

10. Build the production SEO site. This generates an indexable page for every qualifying curated story, topic/archive discovery pages, trust pages, `robots.txt`, `sitemap.xml`, and the rolling two-day `news-sitemap.xml`:

```powershell
npm run build:seo-site
```

The generated `.production-site/` directory is ignored by Git. Never edit generated files directly. Fix the source feed, app, or `scripts/build-seo-site.js`, then rebuild.

Verify the SEO build before deployment:

```powershell
$manifest = Get-Content '.production-site/seo-build-manifest.json' -Raw | ConvertFrom-Json
$manifest.stories.Count
Get-ChildItem '.production-site/stories' -Recurse -Filter index.html | Measure-Object
Get-Content '.production-site/robots.txt'
```

Confirm the manifest count matches the expected publishable feed count, every generated story has a unique title/canonical URL, and production story pages do not contain `noindex`.

11. Restart the local server if needed. Verify:

```powershell
Invoke-RestMethod -Uri 'http://localhost:4173/api/feed' | Select-Object summaryEngine,curated,generatedAt
$payload = Invoke-RestMethod -Uri 'http://localhost:4173/api/feed'
$payload.items | Sort-Object {[datetime]$_.publishedAt} -Descending | Select-Object -First 8 title,publishedAt,sourceName,lane,filterCategory
$payload.items | Group-Object filterCategory | Sort-Object Count -Descending | Select-Object Count,Name
```

Also review the completed coverage ledger. Category counts are diagnostic, not quotas: an unexpectedly empty or sparse category requires re-checking that audit, but it does not justify adding weak stories merely to balance the numbers.

12. Open the app and check the first card plus `Read more` when browser automation is available. Check representative `funding`, `models`, `papers`, `pushback`, and `general` cards and confirm that the visible tag text and color match `filterCategory`, not the internal `lane`. Also open at least one generated `/stories/{id}/` page and confirm it renders the same reader card, focuses the requested story, stays on the story URL, and permits normal swiping. If browser automation is blocked, say that and rely on generated HTML plus HTTP endpoint verification.

13. Publish the refreshed feed when the user expects the public app to update:

```powershell
& 'C:\Users\arshd\Documents\Codex\2026-05-07\is-there-a-plugin-for-firebase\bin\firebase.cmd' deploy --only hosting --project test-e667e
```

Always run the SEO build immediately before deployment so the deployed feed and generated story pages stay synchronized. Firebase Hosting uploads only changed files. The public URL is:

```text
https://goargulaainews.web.app
```

14. Verify the public deployment:

```powershell
Invoke-WebRequest -UseBasicParsing 'https://goargulaainews.web.app' -TimeoutSec 20
Invoke-WebRequest -UseBasicParsing 'https://goargulaainews.web.app/curated-feed.json' -TimeoutSec 20
Invoke-WebRequest -UseBasicParsing 'https://goargulaainews.web.app/robots.txt' -TimeoutSec 20
Invoke-WebRequest -UseBasicParsing 'https://goargulaainews.web.app/sitemap.xml' -TimeoutSec 20
Invoke-WebRequest -UseBasicParsing 'https://goargulaainews.web.app/news-sitemap.xml' -TimeoutSec 20
```

Then check the live browser if available. Confirm the visible app still shows real stories, not sample fallback data. Open representative live story URLs and verify their title, canonical URL, visible pre-rendered story text, structured data, and absence of `noindex`.

15. Verify the secondary site after the production deployment. It should remain a `noindex` preview unless intentionally promoted. Rebuild and deploy it only when its preview behavior also needs updating:

```powershell
npm run build:secondary-preview
& 'C:\Users\arshd\Documents\Codex\2026-05-07\is-there-a-plugin-for-firebase\bin\firebase.cmd' deploy --only hosting --config firebase.secondary-preview.json --project test-e667e
```

16. Before committing or pushing, scan for accidental frontend secrets:

```powershell
rg -n "AIza|FIREBASE_API_KEY|FIRESTORE_FEED_URL|GOOGLE_ACCESS_TOKEN|feeds/current|firestore" -S .
```

This command should return no exposed frontend Firebase key or abandoned Firestore feed path. If it finds one, remove it before deploy/push and rotate any key that was already pushed.

17. Commit and push only the intended refresh/deployment files. Leave `.production-site/`, `.preview-secondary/`, unrelated generated files, and attachment folders untouched.

18. In the final refresh report, state:

- That the individual named-site reconciliation was completed.
- The number of named-source rows closed.
- Any sources marked `unavailable after fallback`.
- The material stories added because of the named-site pass, or explicitly state that it yielded no material additions.

If these facts cannot be reported from the source ledger, do not describe the refresh as complete.

## Quality Bar

- Do not write generic summaries.
- Never call a refresh complete unless the individual named-site source ledger is fully closed. Story count, category coverage, broad search results, and source-group-level notes do not satisfy this requirement.
- Preserve all important numbers.
- Do not optimize for a fixed number of additions. Optimize for complete category audits and inclusion of every material development found.
- Do not let abundant broad news, funding, press releases, policy stories, or company announcements crowd out the dedicated models and papers audits.
- A category with zero additions is acceptable only when its audit is complete and the coverage ledger records the checked sources and exclusion reasoning.
- If source details are thin, say only what is known and mark confidence `medium` or `low`.
- Prefer fewer, well-written, merged stories over hundreds of weak headlines.
- Keep the feed comprehensive across the mandatory audits; do not mistake visual balance or category quotas for completeness.
- Prefer primary sources and reputable reporting. For biomedical or public-health claims, use official research institutions, journals, WHO/CDC/public-health sources, or reputable science outlets; avoid implying a treatment works until validated in lab, animal, or clinical testing.
- For semiconductor/geopolitical AI stories, distinguish company claims, analyst estimates, and confirmed production or revenue. Do not present roadmap claims as achieved performance.
