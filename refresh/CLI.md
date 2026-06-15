# Refresh Audit CLI

All commands accept `--ledger=<path>`. List values use `|` separators.

```powershell
npm run refresh:init

node scripts/refresh-audit.js add-source `
  --id=us-ai-office `
  --name="U.S. AI Office" `
  --url=https://example.gov/ai `
  --categories="policy-safety|infrastructure"

node scripts/refresh-audit.js record-baseline `
  --removed-stories-reconciled=true `
  --known-good-commit=<sha> `
  --known-good-count=<count>

node scripts/refresh-audit.js record-request `
  --pass=named-source `
  --purpose=latest-page `
  --target=https://example.com/ai

node scripts/refresh-audit.js record-source `
  --id=techcrunch-ai `
  --status=checked `
  --inspected=https://techcrunch.com/category/artificial-intelligence/ `
  --headlines="Headline A, 2026-06-13|Headline B, 2026-06-12" `
  --decisions="Headline A included|Headline B duplicate"

node scripts/refresh-audit.js record-audit `
  --id=funding `
  --status=complete `
  --searches="AI funding today|AI acquisition 2026-06-13" `
  --sources=techcrunch-ai `
  --included=candidate-id

node scripts/refresh-audit.js record-freshness `
  --id=broad-ai-news `
  --status=complete `
  --inspected="Google News AI news, rolling 24 hours" `
  --headlines="Headline A|Headline B" `
  --decisions="Headline A included|Headline B excluded as duplicate" `
  --included=candidate-id

node scripts/refresh-audit.js add-candidate `
  --id=candidate-id `
  --title="Candidate title" `
  --discovered-by="named-source:techcrunch-ai|category:funding" `
  --urls=https://example.com/story

node scripts/refresh-audit.js decide-candidate `
  --id=candidate-id `
  --decision=included `
  --link-status=verified `
  --url=https://example.com/story

node scripts/refresh-audit.js record-recovery `
  --candidate=candidate-id `
  --status=resolved `
  --routes="exact-title|publisher-site|syndication" `
  --replacement-url=https://example.com/story

node scripts/refresh-audit.js sufficiency `
  --verdict=pass `
  --searches="missing healthcare AI|missing regional models" `
  --reasons="All sparse categories rechecked|No material unresolved candidates"

node scripts/refresh-audit.js challenge `
  --reason="User challenged story sufficiency" `
  --sources="reuters-ai|business-wire-ai" `
  --audits="funding|products-adoption" `
  --concerns="Low addition count|Sparse enterprise outcomes"

node scripts/refresh-audit.js record-publication `
  --localVerified=true `
  --productionBuilt=true `
  --previewBuilt=true `
  --primaryVerified=true `
  --secondaryVerified=true `
  --secondaryNoindexVerified=true `
  --secretsScanned=true `
  --committed=true `
  --pushed=true
```

Use `npm run refresh:report` to expose incomplete rows, evidence distribution,
and repeated identical-purpose requests.
