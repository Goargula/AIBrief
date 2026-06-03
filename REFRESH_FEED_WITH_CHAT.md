# Chat-Curated Feed Refresh

Use this file whenever the user asks: "refresh the feed" or "refresh the stories" without wanting an API key.

Default to a thorough refresh. A narrow top-up from two or three obvious sources is not enough unless the user explicitly asks for a small update.

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

3. Do a recency-first sweep before the relevance sweep:

- Check the latest pages or feeds from at least two broad news sources, such as TechCrunch Latest/AI, VentureBeat AI, Reuters/AP where available, The Verge, MIT Technology Review, Business Wire, PR Newswire, and Google News-style searches.
- Search for both `today` and `yesterday` using the current date. If the newest curated story is older than 12 hours, explicitly look for a fresher factual story before finalizing.
- Do not add conference calendars, earnings-call reminders, scraped reposts, Reddit-only claims, or generic investor notices just to make the feed look fresh.
- If no fresher story passes the quality bar, keep the older top story and note why.

4. Use a thorough multi-lane search, not only basic filters:

- Run both recency queries and category queries. Search `today`, `yesterday`, the exact dates, and source-specific pages. Do not rely only on generic Google News-style results.
- Inspect at least 6 distinct source lanes before writing: broad AI/news reporting, primary lab/company announcements, funding/deals trackers, chips/compute/infrastructure, research/arXiv/benchmarks, practical applications, and policy/security/safety.
- For each source lane, prefer primary sources and reputable reporting, but use press releases for funding/product launches when no stronger source exists; mark confidence `medium` when claims are primarily company-provided.
- Do not stop after finding a few major headlines. Keep searching until the coverage checklist below is answered with concrete included or intentionally excluded stories.

Search these volatile/high-value categories every time:

- AI news and policy
- AI startup funding
- AI acquisitions and partnerships
- AI research papers and benchmark releases
- Product/model launches from OpenAI, Google/DeepMind, Anthropic, Microsoft, Nvidia, Meta, AWS
- Smaller and regional model releases, including Cohere, Mistral, Qwen/Alibaba, Baidu, DeepSeek, Tencent, Huawei, Moonshot, MiniMax, Zhipu, Sarvam, Sakana, Naver, Kakao, Stability, Runway, ElevenLabs, and open-weight releases on Hugging Face
- AI chips, compute, and infrastructure, including Nvidia, AMD, Intel, Huawei Ascend, Cerebras, Groq, SambaNova, Tenstorrent, CoreWeave, cloud providers, AI storage/networking, export controls, and sovereign-compute moves
- Practical applications, including healthcare, drug discovery, diagnostics, robotics, agriculture, education, finance, legal, security operations, creative tools, industrial AI, and public-sector deployments
- Science and biomedical AI sources, including Nature, Science, EurekAlert, News-Medical, university labs, research institutes, and official company/lab announcements

Suggested source lanes to check:

- Broad/current: TechCrunch AI/latest, VentureBeat AI, Reuters, AP, The Verge, MIT Technology Review, Wired, The Information where available, Axios, Fortune Term Sheet, Crunchbase News.
- Primary labs and platforms: OpenAI, Anthropic, Google/DeepMind, Microsoft/Azure, Meta, Nvidia, AWS, xAI, Mistral, Cohere, Hugging Face, Stability, Runway, ElevenLabs.
- Regional and open model ecosystems: Alibaba/Qwen, Baidu, Tencent, Huawei, DeepSeek, Moonshot, MiniMax, Zhipu, Sarvam, Sakana, Naver, Kakao, and local-language model labs.
- Infrastructure: Nvidia/AMD/Intel announcements, cloud-provider news, data-center power/water stories, AI networking/storage, memory suppliers, export controls, sovereign compute, and local permitting/backlash.
- Funding/deals: TechCrunch funding, Axios Pro Rata, Fortune Term Sheet, Crunchbase News, Business Wire, PR Newswire, GlobeNewswire, company blogs, and reputable local business press.
- Research/applications: arXiv recent AI/ML/CL/CV/robotics, Papers with Code-style benchmark releases where available, Nature/Science/EurekAlert, university labs, medical institutions, robotics companies, agriculture/industrial/education/legal/security publications.

5. Run a coverage checklist before writing. At minimum, ask whether the refresh includes or intentionally excludes:

- Latest model releases and open-weight releases
- Latest funding rounds and acquisitions
- Latest AI-chip/compute/geopolitical infrastructure stories
- Latest notable AI applications outside software, especially healthcare, drug discovery, robotics, agriculture, and education
- Latest policy/safety/security stories
- Latest research papers, benchmarks, and evaluation/tooling releases
- Latest infrastructure constraints beyond chips, including power, water, data-center siting, networking, memory, and cloud capacity
- Smaller but interesting stories that are not front-page AI news but are useful to a reader, including regional releases, vertical agents, operational workflow AI, and consumer backlash/signals

If the refresh window is roughly 24 hours and fewer than 15-20 quality candidate stories are found, treat that as a warning sign and run another source-lane pass before finalizing. It is acceptable to add fewer than 15 only when the search was genuinely broad and the rejected candidates were weak, duplicative, non-AI, or low-confidence; say that explicitly.

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
- Also count how many items are newer than the previous `generatedAt`. If the count is surprisingly low for the elapsed time, repeat the thorough multi-lane search before committing.

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

11. Open the app and check the first card plus `Read more` when browser automation is available. If browser automation is blocked, say that and rely on JSON plus HTTP endpoint verification.

12. Publish the refreshed feed when the user expects the public app to update:

```powershell
& 'C:\Users\arshd\Documents\Codex\2026-05-07\is-there-a-plugin-for-firebase\bin\firebase.cmd' deploy --only hosting --project test-e667e
```

Firebase Hosting uploads only changed files, so a normal feed refresh mostly uploads `public/curated-feed.json`, not a full application package. The public URL is:

```text
https://ai-brief-arsh-20260604.web.app
```

13. Verify the public deployment:

```powershell
Invoke-WebRequest -UseBasicParsing 'https://ai-brief-arsh-20260604.web.app' -TimeoutSec 20
Invoke-WebRequest -UseBasicParsing 'https://ai-brief-arsh-20260604.web.app/curated-feed.json' -TimeoutSec 20
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
- If source details are thin, say only what is known and mark confidence `medium` or `low`.
- Prefer fewer, well-written, merged stories over hundreds of weak headlines.
- Keep the feed balanced across news, funding, deals, papers, products, policy, and practical adoption.
- Prefer primary sources and reputable reporting. For biomedical or public-health claims, use official research institutions, journals, WHO/CDC/public-health sources, or reputable science outlets; avoid implying a treatment works until validated in lab, animal, or clinical testing.
- For semiconductor/geopolitical AI stories, distinguish company claims, analyst estimates, and confirmed production or revenue. Do not present roadmap claims as achieved performance.
