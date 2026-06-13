# Phase 1: Baseline And Recovery

Read the existing feed and the latest successful refresh commit before searching.

Record in the active ledger:

- Current `generatedAt`, item count, category counts, and newest 12 stories.
- Latest known-good item count and commit.
- Any stories removed by link repair, cleanup, or validation since that state.
- Every unresolved material candidate inherited from a prior challenged pass.

For every removed or unresolved material story, create a recovery row. A broken
URL does not invalidate the story. Check exact-title, distinctive-fact,
publisher-site, and syndication/secondary-coverage routes.

Do not begin discovery with an unexplained smaller baseline.
