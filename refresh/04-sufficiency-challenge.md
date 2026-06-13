# Phase 4: Sufficiency Challenge

Assume the earlier passes missed important stories. This is a required
adversarial pass, not a summary of work already done.

Load `sufficiencyDimensions` from `refresh/categories.json` and explicitly assess
each dimension.

Review:

- Additions relative to elapsed time since the previous refresh.
- Categories with zero or unusually few additions.
- Major labs, companies, regions, and application areas with no activity found.
- Named sources that were unavailable or produced unresolved headlines.
- Material excluded candidates and incomplete link recovery.
- Stories discovered by only one pass with weak evidence.
- Current headlines from competitors or broad sources absent from the feed.

Run new gap-oriented searches rather than repeating the same general queries.
Examples include missing regions, missing healthcare/robotics/research coverage,
workforce changes, operational outcomes, and reports with concrete methodology.

Record a sufficiency verdict:

- `pass`: plausibly complete, with reasons.
- `reopen`: specify sources, audits, and queries to rerun.

If the user challenges the count, set the verdict to `reopen`, preserve all
earlier evidence, and perform another adversarial pass.
