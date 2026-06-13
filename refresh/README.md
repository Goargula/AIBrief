# Feed Refresh Orchestrator

Use this workflow whenever the user asks to refresh the feed. Read this file first,
then execute the phase files in numeric order. Do not load every phase file at
once. Each completed phase must write its evidence to the active refresh ledger
before the next phase begins.

Use `refresh/CLI.md` as the command reference while recording evidence.

## Core Principle

The workflow deliberately uses three overlapping discovery passes:

1. Named-source inspection catches unexpected and non-obvious headlines.
2. Category searches catch stories outside the named-source list.
3. The sufficiency challenge assumes the first two passes missed material news.

Overlap between these passes is required. Repeating the exact same page request
without a distinct purpose is not. Record requests and findings in the ledger so
later passes can reuse evidence while still running independent targeted searches.

## Start

```powershell
npm run refresh:init
```

The command prints the active ledger directory. Use that directory for every
subsequent refresh command. The default is `.refresh-ledger/YYYY-MM-DD/`.

Read and execute:

1. `refresh/01-baseline-and-recovery.md`
2. `refresh/02-named-source-pass.md`
3. `refresh/03-category-pass.md`
4. `refresh/04-sufficiency-challenge.md`
5. `refresh/05-editorial-and-validation.md`
6. `refresh/06-publish-and-verify.md`

## Completion Gates

Before editing `public/curated-feed.json`:

```powershell
npm run refresh:check -- --gate=discovery
```

Before publishing:

```powershell
npm run refresh:check -- --gate=publish
```

Before reporting completion:

```powershell
npm run refresh:check -- --gate=complete
npm run refresh:report
```

The CLI must report a passing gate. Do not bypass a failing gate by describing
the work as complete.

## Challenge And Reopen

If the user questions whether enough stories were found, do not defend the
existing result. Reopen the ledger:

```powershell
npm run refresh:challenge -- --reason="User challenged story sufficiency"
```

Then rerun `refresh/04-sufficiency-challenge.md`, plus any source or category
rows flagged by the challenge report. Preserve earlier evidence and candidates.

## Durable Rules

- Treat `public/curated-feed.json` as an append-and-merge database.
- Preserve stable IDs and older valid stories.
- Never infer or construct publisher URLs.
- A broken link triggers recovery work; it does not invalidate the story.
- Keep every material candidate until it is included, merged, or excluded with
  a concrete reason.
- Keep unrelated working-tree files untouched.
- Build, deploy, verify both Firebase hosts, commit, and push intended changes.
