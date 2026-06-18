# Phase 5: Editorial And Validation

Run `npm run refresh:check -- --gate=discovery` before editing the feed.

For every candidate:

- Include, merge, or exclude it with a concrete reason.
- Preserve exact discovered URLs. Never infer publisher slugs.
- Recover broken links through exact-title, distinctive-fact, publisher-site,
  and syndication searches before excluding a material story.
- Merge duplicate coverage of the same underlying event.
- Write editorial summaries with important numbers and uncertainty labels.
- Keep `summary` and `fullSummary` strictly reader-facing: summarize the story
  and all relevant source-backed points, but do not explain why the story was
  included in the feed, what audit lane found it, or how it was classified.
- Write a custom `whyItMatters` for every added or materially updated story.
  This should be specific to the story, not a generic category fallback.
- Preserve stable IDs and existing `curatedAt`; set `updatedAt` for material
  changes.
- Use exactly one visible category: `funding`, `models`, `papers`, `pushback`,
  or `general`.

After writing:

```powershell
npm run check:source-links -- --since=<previous-generatedAt>
npm run refresh:check -- --gate=publish
```

Resolve every broken link and every unresolved material candidate before
publishing.
