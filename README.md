# AI Brief

Personal AI intelligence reader. It pulls AI news, research papers, startup funding, acquisitions, and community signal into an Inshorts-style vertical story deck.

## Run locally

```powershell
node server.js
```

Then open:

```text
http://localhost:4173
```

## Firebase Hosting

The app can be deployed as a static Firebase Hosting site because `public/app.js`
falls back to `public/curated-feed.json` when the local Node `/api/feed` route is
not available. The current Firebase Hosting config deploys the `public/` folder
to:

```text
https://goargulaainews.web.app
```

The Firebase project is `test-e667e`, and the Hosting site is
`goargulaainews`.

## Refresh behavior

The local server reloads sources every 3 hours by default. Change it with:

```powershell
$env:REFRESH_MS=7200000; node server.js
```

The refresh button also forces a live reload.

## Chat-curated refresh

The app checks `public/curated-feed.json` first. When that file exists, the app serves the manually curated feed written in this chat, so no API key is required.

Use `REFRESH_FEED_WITH_CHAT.md` whenever the feed needs to be refreshed this way. The workflow is:

1. Fetch current AI news, papers, funding rounds, acquisitions, policy stories, and product launches.
2. Merge duplicate coverage into one story.
3. Write each story with a short summary, a longer `fullSummary`, exact `keyFacts`, source links, and `summaryEngine: "chat-curated"`.
   Include `filterCategory` for each story as one of `funding`, `models`, `papers`, `pushback`, or `general`; the filter UI uses this field first.
4. Save the result to `public/curated-feed.json`.
5. Restart the local server and check `/api/feed`.

To go back to live RSS/model-generated summaries, remove or rename `public/curated-feed.json`.

## Model summaries

Optional: set `OPENAI_API_KEY` before starting the server to have the server summarize live RSS stories after duplicate stories are merged:

```powershell
$env:OPENAI_API_KEY="sk-..."
node server.js
```

Optional settings:

```powershell
$env:OPENAI_SUMMARY_MODEL="gpt-5.5"
$env:OPENAI_SUMMARY_MAX_ITEMS=250
$env:OPENAI_SUMMARY_CONCURRENCY=4
$env:OPENAI_SUMMARY_WEB_SEARCH=1
```

You can also put these values in a local `.env` file. If no key is set, the app falls back to local summaries and reports that in `/api/feed`.

## Reader behavior

- The feed is continuous: higher-signal stories appear first, then the rest keep flowing as you swipe.
- Each story fills the screen with a visual, headline, short brief, and expandable context.
- Swipe up to move to the next story.
- Sort by `Relevant` or `Recent`.
- Use `Save`, `Share`, or `Original` from each story.
- `Profile` works without login and shows saved and opened story counts on the current device.

## Saves

Saved stories still work locally through browser `localStorage` under `ai-brief-state-v2`. When Firebase Authentication and Firestore are enabled, signing in with Google migrates those local saves into `userSaves/{uid}/stories/{storyId}` so they can sync across devices.

The frontend uses Firebase Hosting reserved SDK/init URLs and does not commit Firebase Web API keys into `public/app.js`. To activate backend save sync on the hosted app, enable Firestore, Google Auth, and App Check for project `test-e667e`. After creating the App Check reCAPTCHA key, place its public site key in the `firebase-app-check-site-key` meta tag in `public/index.html`.

## V2 notes

- Keep account sync focused on saved stories.
- Add duplicate suppression per user. The current backend dedupes exact URLs/titles globally, but V2 should track a user's seen story fingerprints so the same underlying news does not reappear from multiple sources or refresh cycles.

## APK status

This workspace currently does not have Android SDK, Java, Gradle, Flutter, or npm available on PATH. The app is built as a PWA-ready mobile web app first, with a manifest and service worker. Once Android tooling is available, it can be wrapped as an APK with Flutter, Capacitor, or a Trusted Web Activity wrapper.
