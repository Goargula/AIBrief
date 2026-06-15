import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "refresh-audit.js");

function run(args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    ...options
  });
}

test("source registry has unique ids and required source groups", async () => {
  const registry = JSON.parse(await readFile(path.join(root, "refresh", "sources.json"), "utf8"));
  const ids = registry.sources.map((source) => source.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    new Set(registry.sources.map((source) => source.group)),
    new Set(["ai-specialist", "technology", "broad-business", "announcement-wire", "primary-newsroom"])
  );
});

test("category registry has unique audits and sufficiency dimensions", async () => {
  const registry = JSON.parse(await readFile(path.join(root, "refresh", "categories.json"), "utf8"));
  const ids = registry.audits.map((audit) => audit.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.length, 9);
  assert.ok(registry.audits.every((audit) => audit.requiredSearches.length && audit.primaryTargets.length));
  assert.ok(registry.sufficiencyDimensions.length >= ids.length);
});

test("freshness registry has unique surfaces with meaningful headline minimums", async () => {
  const registry = JSON.parse(await readFile(path.join(root, "refresh", "freshness-surfaces.json"), "utf8"));
  const ids = registry.surfaces.map((surface) => surface.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(registry.surfaces.length >= 4);
  assert.ok(registry.surfaces.every((surface) => surface.query && surface.windowHours && surface.minimumHeadlines >= 10));
});

test("all sequential phase files exist and the orchestrator names them", async () => {
  const orchestrator = await readFile(path.join(root, "refresh", "README.md"), "utf8");
  for (let phase = 1; phase <= 6; phase += 1) {
    const prefix = String(phase).padStart(2, "0");
    assert.match(orchestrator, new RegExp(`refresh/${prefix}-`));
  }
});

test("gates fail incomplete work, pass completed work, and reopen on challenge", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "ai-brief-refresh-"));
  const ledgerPath = path.join(temp, "ledger.json");

  const init = run(["init", `--ledger=${ledgerPath}`]);
  assert.equal(init.status, 0, init.stderr);
  const overwrite = run(["init", `--ledger=${ledgerPath}`]);
  assert.notEqual(overwrite.status, 0);
  assert.match(overwrite.stderr, /already exists/);

  const incomplete = run(["check", "--gate=discovery", `--ledger=${ledgerPath}`]);
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /source .* is pending/);
  assert.match(incomplete.stderr, /sufficiency verdict is pending/);

  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  ledger.baseline.removedStoriesReconciled = true;
  for (const source of Object.values(ledger.sources)) {
    source.status = "checked";
    source.inspected = [source.url];
    source.headlineSample = ["Current relevant headline, 2026-06-13"];
    source.decisions = ["Current relevant headline included or excluded"];
  }
  for (const audit of Object.values(ledger.audits)) {
    audit.status = "complete";
    audit.searches = audit.requiredSearches.map((search) => `${search} 2026-06-13`);
  }
  for (const surface of Object.values(ledger.freshnessSurfaces)) {
    surface.status = "complete";
    surface.inspected = [`News search: ${surface.query}`];
    surface.headlines = Array.from({ length: surface.minimumHeadlines }, (_, index) => `Headline ${index + 1}`);
    surface.decisions = surface.headlines.map((headline) => `${headline} excluded as duplicate or immaterial`);
  }
  ledger.sufficiency.verdict = "pass";
  ledger.sufficiency.searches = [
    "adversarial missing-category search",
    "adversarial missing-region search",
    "adversarial unresolved-candidate search"
  ];
  ledger.sufficiency.reasons = ["Sparse categories and unresolved candidates were rechecked"];
  ledger.candidates.push({
    id: "included-story",
    title: "Included story",
    material: true,
    discoveredBy: ["named-source:test", "category:models", "sufficiency:gap-check"],
    urls: ["https://example.com/story"],
    decision: "included",
    linkStatus: "verified",
    duplicateOf: null,
    exclusionReason: null
  });
  Object.assign(ledger.publication, {
    localVerified: true,
    productionBuilt: true,
    previewBuilt: true,
    primaryVerified: true,
    secondaryVerified: true,
    secondaryNoindexVerified: true,
    secretsScanned: true,
    committed: true,
    pushed: true
  });
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

  for (const gate of ["discovery", "publish", "complete"]) {
    const result = run(["check", `--gate=${gate}`, `--ledger=${ledgerPath}`]);
    assert.equal(result.status, 0, result.stderr);
  }

  const challenge = run([
    "challenge",
    "--reason=Not enough stories",
    "--sources=reuters-ai",
    "--audits=funding",
    `--ledger=${ledgerPath}`
  ]);
  assert.equal(challenge.status, 0, challenge.stderr);
  const reopened = run(["check", "--gate=discovery", `--ledger=${ledgerPath}`]);
  assert.notEqual(reopened.status, 0);
  assert.match(reopened.stderr, /sufficiency verdict is reopen/);
  assert.match(reopened.stderr, /source reuters-ai is pending/);
  assert.match(reopened.stderr, /audit funding is pending/);
  assert.match(reopened.stderr, /freshness surface broad-ai-news is pending/);
});

test("discovery gate requires top-headline reconciliation on broad freshness surfaces", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "ai-brief-refresh-"));
  const ledgerPath = path.join(temp, "ledger.json");
  execFileSync(process.execPath, [script, "init", `--ledger=${ledgerPath}`], { cwd: root });
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  ledger.baseline.removedStoriesReconciled = true;
  for (const source of Object.values(ledger.sources)) {
    source.status = "checked";
    source.inspected = [source.url];
    source.headlineSample = ["Current relevant headline, 2026-06-13"];
    source.decisions = ["Current relevant headline included or excluded"];
  }
  for (const audit of Object.values(ledger.audits)) {
    audit.status = "complete";
    audit.searches = audit.requiredSearches.map((search) => `${search} 2026-06-13`);
  }
  for (const surface of Object.values(ledger.freshnessSurfaces)) {
    surface.status = "complete";
    surface.inspected = [`News search: ${surface.query}`];
    surface.headlines = Array.from({ length: surface.minimumHeadlines }, (_, index) => `Headline ${index + 1}`);
    surface.decisions = surface.headlines.slice(0, -1).map((headline) => `${headline} excluded`);
  }
  ledger.sufficiency.verdict = "pass";
  ledger.sufficiency.searches = ["gap one", "gap two", "gap three"];
  ledger.sufficiency.reasons = ["All gaps checked"];
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

  const result = run(["check", "--gate=discovery", `--ledger=${ledgerPath}`]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /freshness surface .* has decisions for 9\/10 headlines/);
});

test("older ledgers are hydrated with required freshness surfaces", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "ai-brief-refresh-"));
  const ledgerPath = path.join(temp, "ledger.json");
  execFileSync(process.execPath, [script, "init", `--ledger=${ledgerPath}`], { cwd: root });
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  delete ledger.freshnessSurfaces;
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

  const result = run([
    "record-freshness",
    "--id=broad-ai-news",
    "--status=complete",
    "--inspected=Broad AI news results",
    "--headlines=Headline 1",
    "--decisions=Headline 1 included",
    `--ledger=${ledgerPath}`
  ]);
  assert.equal(result.status, 0, result.stderr);
  const hydrated = JSON.parse(await readFile(ledgerPath, "utf8"));
  assert.equal(hydrated.freshnessSurfaces["broad-ai-news"].status, "complete");
  assert.equal(hydrated.freshnessSurfaces["ai-business-impact"].status, "pending");
});

test("material exclusions and unresolved recovery block publication", async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "ai-brief-refresh-"));
  const ledgerPath = path.join(temp, "ledger.json");
  execFileSync(process.execPath, [script, "init", `--ledger=${ledgerPath}`], { cwd: root });
  const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
  ledger.baseline.removedStoriesReconciled = true;
  for (const source of Object.values(ledger.sources)) {
    source.status = "checked";
    source.inspected = [source.url];
    source.headlineSample = ["Current relevant headline, 2026-06-13"];
    source.decisions = ["Current relevant headline included or excluded"];
  }
  for (const audit of Object.values(ledger.audits)) {
    audit.status = "complete";
    audit.searches = audit.requiredSearches.map((search) => `${search} 2026-06-13`);
  }
  for (const surface of Object.values(ledger.freshnessSurfaces)) {
    surface.status = "complete";
    surface.inspected = [`News search: ${surface.query}`];
    surface.headlines = Array.from({ length: surface.minimumHeadlines }, (_, index) => `Headline ${index + 1}`);
    surface.decisions = surface.headlines.map((headline) => `${headline} excluded as duplicate or immaterial`);
  }
  ledger.sufficiency.verdict = "pass";
  ledger.sufficiency.searches = [
    "adversarial missing-category search",
    "adversarial missing-region search",
    "adversarial unresolved-candidate search"
  ];
  ledger.sufficiency.reasons = ["Sparse categories and unresolved candidates were rechecked"];
  ledger.candidates.push({
    id: "excluded-story",
    title: "Excluded story",
    material: true,
    discoveredBy: ["named-source:test"],
    urls: ["https://example.com/broken"],
    decision: "excluded",
    linkStatus: "unchecked",
    duplicateOf: null,
    exclusionReason: null
  });
  ledger.recovery.push({ candidateId: "excluded-story", status: "open", routes: [] });
  await writeFile(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

  const result = run(["check", "--gate=publish", `--ledger=${ledgerPath}`]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /excluded without a reason/);
  assert.match(result.stderr, /recovery excluded-story is open/);
});
