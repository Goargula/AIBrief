# AI Brief SEO Owner Setup Guide

The app now generates indexable story pages, topic pages, an archive, trust pages, `robots.txt`, `sitemap.xml`, and a rolling Google News sitemap. The steps below require access to external accounts and must be completed by the site owner.

## 1. Set Up Google Search Console

1. Open `https://search.google.com/search-console`.
2. Click **Add property**.
3. Choose **URL prefix**.
4. Enter `https://goargulaainews.web.app/`.
5. Complete the offered verification method.
6. Open **Sitemaps** for the verified property.
7. Submit `sitemap.xml`.
8. Submit `news-sitemap.xml`. It will contain entries only for stories with accurate AI Brief `curatedAt` timestamps from future refreshes.
9. Open **URL inspection** and inspect:
   - `https://goargulaainews.web.app/`
   - `https://goargulaainews.web.app/archive/`
   - Two representative `/stories/{id}/` URLs
10. Request indexing for those representative pages.
11. Review **Pages**, **Search results**, **Discover**, and enhancement reports weekly.

## 2. Choose and Connect a Branded Domain

1. Purchase a short branded domain appropriate for AI Brief.
2. In Firebase Console, open project `test-e667e`.
3. Open **Hosting** and select site `goargulaainews`.
4. Click **Add custom domain**.
5. Enter the chosen domain and follow Firebase's DNS verification instructions.
6. Add the DNS records at the domain registrar.
7. Wait for Firebase to issue the SSL certificate.
8. Do not switch canonical URLs immediately.
9. Update the production origin in `scripts/build-seo-site.js`, rebuild, deploy, and verify the custom-domain pages first.
10. Add the custom domain to Search Console and submit its sitemaps.
11. Keep the Firebase URL redirecting or canonicalized to the branded domain.

## 3. Add Google Analytics 4

1. Open `https://analytics.google.com/`.
2. Create a GA4 property for AI Brief.
3. Create a Web data stream for the canonical domain.
4. Copy the Measurement ID.
5. Add GA4 using Google Tag Manager or the Google tag.
6. Configure events for story views, original-source clicks, shares, saves, filter usage, and newsletter sign-ups.
7. Link the GA4 property to Search Console.
8. Confirm events in GA4 Realtime before relying on reports.

## 4. Register Bing Webmaster Tools

1. Open `https://www.bing.com/webmasters/`.
2. Import the verified site from Google Search Console or add it manually.
3. Submit `https://goargulaainews.web.app/sitemap.xml`.
4. Review crawl and indexing reports.
5. Enable IndexNow only after a stable canonical custom domain is selected.

## 5. Publish Original Content and Build Authority

1. Publish a daily original brief that synthesizes major developments rather than repeating individual summaries.
2. Clearly display the author, publication date, update date, supporting sources, and original analysis.
3. Publish recurring original assets such as funding trackers, model-release comparisons, policy timelines, and enterprise-outcome reports.
4. Share each original asset from a consistent LinkedIn publication or author profile.
5. Launch an email newsletter that links back to canonical story or analysis pages.
6. Ask cited researchers, companies, and experts to review or share relevant original analysis.
7. Track backlinks, branded searches, indexed pages, non-branded impressions, Discover traffic, and citations in answer engines monthly.

## 6. Ongoing Checks After Every Feed Refresh

1. Confirm the production deploy completed successfully.
2. Open a newly generated story URL.
3. Confirm it shows the requested story in the normal swipe reader.
4. View page source and confirm the story title, summary, canonical URL, and structured data are present.
5. Confirm `robots.txt`, `sitemap.xml`, and `news-sitemap.xml` load.
6. Confirm the story page does not contain `noindex`.
7. Review Search Console for new indexing or structured-data problems.
