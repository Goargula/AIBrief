import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const feed = JSON.parse(await readFile(path.join(root, "public", "curated-feed.json"), "utf8"));
const sinceArg = process.argv.find((arg) => arg.startsWith("--since="));
const since = sinceArg ? new Date(sinceArg.slice("--since=".length)) : null;

if (since && Number.isNaN(since.getTime())) {
  throw new Error(`Invalid --since timestamp: ${sinceArg}`);
}

const stories = feed.items.filter((story) => {
  if (!since) return true;
  const changedAt = story.updatedAt || story.curatedAt;
  return changedAt && new Date(changedAt) >= since;
});

const failures = [];
const warnings = [];
let cursor = 0;

async function check(story) {
  let parsed;
  try {
    parsed = new URL(story.url);
  } catch {
    failures.push({ status: "invalid", story });
    return;
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    failures.push({ status: "invalid", story });
    return;
  }

  try {
    const response = await fetch(story.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; AI-Brief-Link-Check/1.0)"
      }
    });
    const result = { status: response.status, finalUrl: response.url, story };
    if ([404, 410].includes(response.status)) failures.push(result);
    else if (!response.ok) warnings.push(result);
  } catch (error) {
    warnings.push({ status: "network-error", message: error.message, story });
  }
}

async function worker() {
  while (cursor < stories.length) {
    const story = stories[cursor++];
    await check(story);
  }
}

await Promise.all(Array.from({ length: Math.min(12, stories.length) }, worker));

for (const result of failures) {
  console.error(`BROKEN ${result.status} ${result.story.title}\n  ${result.story.url}`);
}
for (const result of warnings) {
  console.warn(`REVIEW ${result.status} ${result.story.title}\n  ${result.story.url}`);
}

console.log(`Checked ${stories.length} source links: ${failures.length} broken, ${warnings.length} need manual review.`);
if (failures.length) process.exitCode = 1;
