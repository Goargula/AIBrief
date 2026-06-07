# Chat-Curated Feed Refresh

Use this file whenever the user asks: "refresh the feed" or "refresh the stories" without wanting an API key.

Default to a thorough refresh. The objective is to capture all important developments across the AI world, not to reach a target number of stories. A narrow top-up from two or three obvious sources is not enough unless the user explicitly asks for a small update.

## Goal

Maintain `public/curated-feed.json` by using this chat model to fetch current AI news, research papers, funding rounds, acquisitions, policy stories, infrastructure updates, practical applications, and product announcements, then summarize them manually in high-quality editorial form.

Treat the file like a small database, not a disposable export. Keep existing curated stories unless they are exact duplicates or clearly broken. Add new stories near the top, update an existing story when new coverage belongs to the same underlying event, and let older stories move down by file order and lower `importance`.

The app serves `public/curated-feed.json` first when the file exists. No OpenAI API key is required.

The public Firebase-hosted app serves this same static file after deployment. Do not add Firebase Web API keys, Firestore client URLs, or other frontend secrets to `public/app.js` for feed refreshes. The current production-safe flow is to update `public/curated-feed.json`, deploy Firebase Hosting, and verify the live URL.

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
- Search for both `today` and `yesterday` using the current date. If the newest curated story is older than 12 hours, explicitly look for a fresher factual story before finalizing.
- Do not add conference calendars, earnings-call reminders, scraped reposts, Reddit-only claims, or generic investor notices just to make the feed look fresh.
- If no fresher story passes the quality bar, keep the older top story and note why.
- Use this pass only to establish the day's major themes and breaking events. Do not let broad-news results substitute for the mandatory category audits below.

4. Run mandatory category audits one by one.

Complete every audit below independently. Do not stop because another category already produced many stories. Do not use the total candidate count or total added count as a completion criterion. An audit is complete only after checking its primary sources, specialist sources, and targeted searches, then recording important inclusions and explicit exclusions.

For every audit:

1. Search `today`, `yesterday`, exact dates, and a 48-72 hour catch-up window.
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
- AI misuse, cyber threats, safety warnings, environmental opposition, and credible loss-of-control concerns.
- Policy and safety work from governments, standards bodies, courts, labs, civil-society groups, and reputable reporting.

Distinguish substantive research artifacts, which can belong in `papers`, from the policy response or warning event, which belongs in `pushback`.

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
- Agent protocols, governance, observability, security tooling, and production infrastructure.

Reject routine feature announcements and generic partnerships that do not materially change capability, adoption, or market structure.

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

5. Produce a coverage ledger before writing.

Create a compact working ledger with one row for every audit above:

| Audit | Sources checked | Included stories | Important exclusions and reason | Status |
| --- | --- | --- | --- | --- |
| Models | ... | ... | ... | complete/incomplete |

Do not write the final feed while any audit is incomplete. A category may legitimately produce zero additions, but only after its audit is complete and the ledger explains why. The final number of additions may be small or large; completeness and importance matter, not count.

6. De-duplicate stories before writing the curated JSON. Merge coverage when several sources describe the same underlying story. Do not delete older, still-valid stories just because they are no longer fresh.

7. For each curated story, write:

- `summary`: one or two punchy sentences with the core fact.
- `fullSummary`: a fuller 100-180 word explanation with the key numbers, named companies/people, context, why it matters, and what to watch.
- `keyFacts`: exact numbers, dates, funding amounts, valuations, acquisition prices, model names, institutions, or round names.
- `filterCategory`: exactly one of `funding`, `models`, `papers`, `pushback`, or `general`. Choose the best reader-facing filter match for the whole story, not every keyword it happens to mention:
  - `funding`: startup funding, strategic investments, acquisitions, mergers, IPOs, public listings, and liquidity/financing market stories.
  - `models`: new or materially updated AI model releases, previews, checkpoints, open-weight releases, benchmarked model updates, and model/API launches.
  - `papers`: research papers, arXiv/preprint items, benchmarks, datasets, evaluation methods, and academic/research-lab findings.
  - `pushback`: AI backlash, lawsuits, bans, labor disputes, copyright/privacy complaints, regulation, public opposition, safety/security warnings, environmental concerns, and other resistance or risk stories.
  - `general`: everything else, including ordinary product launches, infrastructure, partnerships, deployments, applications, and broad AI news that is not a better fit above.
- `sourceConfidence`: `high`, `medium`, or `low`.
- `summaryEngine`: `chat-curated`.

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

10. Restart the local server if needed. Verify:

```powershell
Invoke-RestMethod -Uri 'http://localhost:4173/api/feed' | Select-Object summaryEngine,curated,generatedAt
$payload = Invoke-RestMethod -Uri 'http://localhost:4173/api/feed'
$payload.items | Sort-Object {[datetime]$_.publishedAt} -Descending | Select-Object -First 8 title,publishedAt,sourceName,lane,filterCategory
$payload.items | Group-Object filterCategory | Sort-Object Count -Descending | Select-Object Count,Name
```

Also review the completed coverage ledger. Category counts are diagnostic, not quotas: an unexpectedly empty or sparse category requires re-checking that audit, but it does not justify adding weak stories merely to balance the numbers.

11. Open the app and check the first card plus `Read more` when browser automation is available. Check representative `funding`, `models`, `papers`, `pushback`, and `general` cards and confirm that the visible tag text and color match `filterCategory`, not the internal `lane`. If browser automation is blocked, say that and rely on JSON plus HTTP endpoint verification.

12. Publish the refreshed feed when the user expects the public app to update:

```powershell
& 'C:\Users\arshd\Documents\Codex\2026-05-07\is-there-a-plugin-for-firebase\bin\firebase.cmd' deploy --only hosting --project test-e667e
```

Firebase Hosting uploads only changed files, so a normal feed refresh mostly uploads `public/curated-feed.json`, not a full application package. The public URL is:

```text
https://goargulaainews.web.app
```

13. Verify the public deployment:

```powershell
Invoke-WebRequest -UseBasicParsing 'https://goargulaainews.web.app' -TimeoutSec 20
Invoke-WebRequest -UseBasicParsing 'https://goargulaainews.web.app/curated-feed.json' -TimeoutSec 20
```

Then check the live browser if available. Confirm the visible app still shows real stories, not sample fallback data.

14. Before committing or pushing, scan for accidental frontend secrets:

```powershell
rg -n "AIza|FIREBASE_API_KEY|FIRESTORE_FEED_URL|GOOGLE_ACCESS_TOKEN|feeds/current|firestore" -S .
```

This command should return no exposed frontend Firebase key or abandoned Firestore feed path. If it finds one, remove it before deploy/push and rotate any key that was already pushed.

15. Commit and push only the intended refresh/deployment files. Leave unrelated generated or attachment folders untouched.

## Quality Bar

- Do not write generic summaries.
- Preserve all important numbers.
- Do not optimize for a fixed number of additions. Optimize for complete category audits and inclusion of every material development found.
- Do not let abundant broad news, funding, press releases, policy stories, or company announcements crowd out the dedicated models and papers audits.
- A category with zero additions is acceptable only when its audit is complete and the coverage ledger records the checked sources and exclusion reasoning.
- If source details are thin, say only what is known and mark confidence `medium` or `low`.
- Prefer fewer, well-written, merged stories over hundreds of weak headlines.
- Keep the feed comprehensive across the mandatory audits; do not mistake visual balance or category quotas for completeness.
- Prefer primary sources and reputable reporting. For biomedical or public-health claims, use official research institutions, journals, WHO/CDC/public-health sources, or reputable science outlets; avoid implying a treatment works until validated in lab, animal, or clinical testing.
- For semiconductor/geopolitical AI stories, distinguish company claims, analyst estimates, and confirmed production or revenue. Do not present roadmap claims as achieved performance.
