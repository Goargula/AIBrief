# Phase 2: Named-Source Pass

Load `refresh/sources.json`. Inspect every source independently.

Add relevant government offices, research labs, or other material sources to the
active ledger with `add-source` so they are subject to the same closure gate.

For each source:

1. Inspect its direct latest/category page when accessible.
2. Record a sample of newest relevant visible headlines and dates.
   Record an include, merge, exclude, or investigate decision for every sampled
   headline; listing headlines without reconciling them does not close a source.
3. If inaccessible or stale, run a site-restricted fallback for today,
   yesterday, and the exact current date.
4. Add every material candidate to the ledger before deduplication.
5. Mark the source `checked`, `fallback_checked`, or
   `unavailable_after_fallback`.

This pass is headline-led, not category-led. Capture unexpected stories even if
they do not fit the source's usual coverage.

Do not replace this pass with broad searches. Do not mark a source group complete
in place of its individual sources.
