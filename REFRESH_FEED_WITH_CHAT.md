# Chat-Curated Feed Refresh

Use this entrypoint whenever the user asks to refresh the feed.

The detailed workflow is intentionally split into sequential phases so each phase
can write durable evidence before the next begins. This reduces accidental
duplicate requests without removing the deliberate overlap needed for high recall.

## Start Here

Read:

```text
refresh/README.md
```

Then initialize the active ledger:

```powershell
npm run refresh:init
```

Execute the phase files in numeric order. Do not load all phase files at once:

```text
refresh/01-baseline-and-recovery.md
refresh/02-named-source-pass.md
refresh/03-category-pass.md
refresh/04-sufficiency-challenge.md
refresh/05-editorial-and-validation.md
refresh/06-publish-and-verify.md
```

## Non-Negotiable Gates

The refresh must contain three independent, overlapping discovery passes:

1. Direct named-source inspection.
2. Independent category-targeted searches.
3. An adversarial sufficiency challenge.

Named-source and category overlap is intentional. Record direct-page and query
requests in the ledger so evidence can be reused and the exact same request is
not repeated accidentally.

Do not edit the feed until:

```powershell
npm run refresh:check -- --gate=discovery
```

Do not publish until:

```powershell
npm run refresh:check -- --gate=publish
```

Do not report completion until:

```powershell
npm run refresh:check -- --gate=complete
npm run refresh:report
```

If the user questions whether the stories are enough, reopen rather than defend:

```powershell
npm run refresh:challenge -- --reason="User challenged story sufficiency"
```

Preserve the existing ledger, rerun the adversarial sufficiency phase, and reopen
any named-source or category rows identified by the challenge.

## Durable Rules

- Treat `public/curated-feed.json` as an append-and-merge database.
- Preserve older valid stories and stable IDs.
- Never infer or construct source URLs.
- Treat link validity and story validity separately.
- Recover broken material-story links before excluding the story.
- Keep every material candidate until included, merged, or concretely excluded.
- Build, deploy, verify both Firebase hosts, commit, and push intended files.
- Leave unrelated working-tree files untouched.
