# Chat-Curated Feed Refresh

Use this file whenever the user asks: "refresh the feed" or "refresh the stories" without wanting an API key.

## Goal

Maintain `public/curated-feed.json` by using this chat model to fetch current AI news, research papers, funding rounds, acquisitions, policy stories, and product announcements, then summarize them manually in high-quality editorial form.

Treat the file like a small database, not a disposable export. Keep existing curated stories unless they are exact duplicates or clearly broken. Add new stories near the top, update an existing story when new coverage belongs to the same underlying event, and let older stories move down by file order and lower `importance`.

The app serves `public/curated-feed.json` first when the file exists. No OpenAI API key is required.

## Workflow

1. Fetch the current raw feed from the running app:

```powershell
$payload = Invoke-RestMethod -Uri 'http://localhost:4173/api/feed?refresh=1' -TimeoutSec 100
$payload.items | Select-Object title,sourceName,lane,publishedAt,url,summary,keyFacts,relatedSources | ConvertTo-Json -Depth 8
```

2. Use web search for the volatile/high-value items:

- AI news and policy
- AI startup funding
- AI acquisitions and partnerships
- AI research papers and benchmark releases
- Product/model launches from OpenAI, Google/DeepMind, Anthropic, Microsoft, Nvidia, Meta, AWS

3. Load the existing `public/curated-feed.json` before writing. Preserve older items and append/merge new items into the existing list.

4. De-duplicate stories before writing the curated JSON. Merge coverage when several sources describe the same underlying story. Do not delete older, still-valid stories just because they are no longer fresh.

5. For each curated story, write:

- `summary`: one or two punchy sentences with the core fact.
- `fullSummary`: a fuller 100-180 word explanation with the key numbers, named companies/people, context, why it matters, and what to watch.
- `keyFacts`: exact numbers, dates, funding amounts, valuations, acquisition prices, model names, institutions, or round names.
- `sourceConfidence`: `high`, `medium`, or `low`.
- `summaryEngine`: `chat-curated`.

6. Rank by recency and importance:

- New or materially updated stories should sit near the top.
- Older stories should keep their original `publishedAt` and receive lower `importance` so they naturally move down.
- Keep stable `id` values for existing stories so the feed behaves like a database.

7. Save the feed to:

```text
public/curated-feed.json
```

8. Restart the local server if needed. Verify:

```powershell
Invoke-RestMethod -Uri 'http://localhost:4173/api/feed' | Select-Object summaryEngine,curated,generatedAt
```

9. Open the app and check the first card plus `Read more`.

## Quality Bar

- Do not write generic summaries.
- Preserve all important numbers.
- If source details are thin, say only what is known and mark confidence `medium` or `low`.
- Prefer fewer, well-written, merged stories over hundreds of weak headlines.
- Keep the feed balanced across news, funding, deals, papers, products, policy, and practical adoption.
