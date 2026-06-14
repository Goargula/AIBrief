# Phase 6: Publish And Verify

Build and verify:

```powershell
npm run build:seo-site
npm run build:secondary-preview
```

Verify the local API, visible reader, first card, Read more, representative
categories, and at least one generated story page. Scan for frontend secrets.

```powershell
rg -n "AIza|FIREBASE_API_KEY|FIRESTORE_FEED_URL|GOOGLE_ACCESS_TOKEN|feeds/current|firestore" -S .
```

Deploy the primary and secondary Firebase sites:

```powershell
& 'C:\Users\arshd\Documents\Codex\2026-05-07\is-there-a-plugin-for-firebase\bin\firebase.cmd' deploy --only hosting --project test-e667e
& 'C:\Users\arshd\Documents\Codex\2026-05-07\is-there-a-plugin-for-firebase\bin\firebase.cmd' deploy --only hosting --config firebase.secondary-preview.json --project test-e667e
```

Verify both hosted feeds, a new story page, and the secondary site's
`noindex, nofollow` behavior.

Record publication evidence in the ledger:

- Local feed count and generated timestamp.
- Stories newer than the previous `generatedAt`, and backlog corrections as a
  separate count.
- Build story counts.
- Primary and secondary feed counts.
- Representative hosted story status.
- Secondary noindex status.
- Commit and push status.

Run:

```powershell
npm run refresh:check -- --gate=complete
npm run refresh:report
```

Commit and push only intended files. Leave generated sites and unrelated files
untouched.
