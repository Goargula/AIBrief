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

## Refresh behavior

The local server reloads sources every 3 hours by default. Change it with:

```powershell
$env:REFRESH_MS=7200000; node server.js
```

The refresh button also forces a live reload.

## Reader behavior

- `Important` shows the top ranked stories first.
- `All` shows the complete stream and renders more stories as you swipe.
- Each story fills the screen with a visual, headline, short brief, and expandable context.
- Swipe up to move to the next story.
- Use `Save`, `Comment`, `Share`, or `Original` from each story.
- `Profile` works without login and shows saved, commented, and opened story counts on the current device.

## V2 notes

- Add account sync so saved stories and comments travel across devices.
- Add duplicate suppression per user. The current backend dedupes exact URLs/titles globally, but V2 should track a user's seen story fingerprints so the same underlying news does not reappear from multiple sources or refresh cycles.

## APK status

This workspace currently does not have Android SDK, Java, Gradle, Flutter, or npm available on PATH. The app is built as a PWA-ready mobile web app first, with a manifest and service worker. Once Android tooling is available, it can be wrapped as an APK with Flutter, Capacitor, or a Trusted Web Activity wrapper.
