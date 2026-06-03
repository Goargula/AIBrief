import fs from "node:fs/promises";

const projectId = process.env.FIREBASE_PROJECT_ID || "test-e667e";
const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";
const feedPath = process.env.FEED_PATH || "public/curated-feed.json";
const token = process.env.GOOGLE_ACCESS_TOKEN || process.env.FIRESTORE_ACCESS_TOKEN;

if (!token) {
  throw new Error("Set GOOGLE_ACCESS_TOKEN or FIRESTORE_ACCESS_TOKEN before running this script.");
}

const rawFeed = await fs.readFile(feedPath, "utf8");
const parsedFeed = JSON.parse(rawFeed);
const payload = JSON.stringify(parsedFeed);

if (payload.length > 950000) {
  throw new Error(`Feed payload is ${payload.length} characters, too close to Firestore's 1 MiB document limit.`);
}

const url = new URL(
  `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/feeds/current`
);
url.searchParams.append("updateMask.fieldPaths", "payload");
url.searchParams.append("updateMask.fieldPaths", "updatedAt");

const response = await fetch(url, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    fields: {
      payload: { stringValue: payload },
      updatedAt: { timestampValue: new Date().toISOString() }
    }
  })
});

if (!response.ok) {
  throw new Error(`Firestore upload failed: ${response.status} ${await response.text()}`);
}

const itemCount = Array.isArray(parsedFeed.items) ? parsedFeed.items.length : 0;
console.log(`Uploaded ${itemCount} feed items to Firestore feeds/current in ${projectId}.`);
