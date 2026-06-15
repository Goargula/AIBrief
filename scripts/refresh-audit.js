import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const command = process.argv[2] || "help";
const args = new Map(
  process.argv.slice(3).filter((arg) => arg.startsWith("--")).map((arg) => {
    const [key, ...value] = arg.slice(2).split("=");
    return [key, value.length ? value.join("=") : "true"];
  })
);
const today = new Date().toISOString().slice(0, 10);
const ledgerPath = path.resolve(root, args.get("ledger") || `.refresh-ledger/${today}/ledger.json`);
const closedSourceStatuses = new Set(["checked", "fallback_checked", "unavailable_after_fallback"]);
const closedCandidateDecisions = new Set(["included", "merged", "excluded"]);
const verifiedLinkStatuses = new Set(["verified", "manual_verified", "not_applicable"]);
const categoryRegistry = await readJson(path.join(root, "refresh", "categories.json"));
const freshnessRegistry = await readJson(path.join(root, "refresh", "freshness-surfaces.json"));
const requiredAudits = categoryRegistry.audits.map((audit) => audit.id);
const requiredFreshnessSurfaces = freshnessRegistry.surfaces.map((surface) => surface.id);

function list(value) {
  if (!value) return [];
  return value.split("|").map((item) => item.trim()).filter(Boolean);
}

function bool(value) {
  return ["true", "1", "yes"].includes(String(value).toLowerCase());
}

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loadLedger() {
  try {
    const ledger = await readJson(ledgerPath);
    ledger.freshnessSurfaces ||= {};
    for (const surface of freshnessRegistry.surfaces) {
      ledger.freshnessSurfaces[surface.id] ||= {
        ...surface,
        status: "pending",
        inspected: [],
        headlines: [],
        decisions: [],
        included: [],
        notes: ""
      };
    }
    return ledger;
  } catch {
    throw new Error(`Refresh ledger not found: ${ledgerPath}. Run npm run refresh:init first.`);
  }
}

function sourceProblems(ledger) {
  const problems = [];
  for (const source of Object.values(ledger.sources)) {
    if (!closedSourceStatuses.has(source.status)) problems.push(`source ${source.id} is ${source.status}`);
    else if (!source.inspected.length) problems.push(`source ${source.id} has no inspected page or fallback query`);
    else if (source.status !== "unavailable_after_fallback" && !source.headlineSample.length) {
      problems.push(`source ${source.id} has no headline sample`);
    } else if (source.status !== "unavailable_after_fallback" && source.decisions.length < source.headlineSample.length) {
      problems.push(`source ${source.id} has decisions for ${source.decisions.length}/${source.headlineSample.length} sampled headlines`);
    }
  }
  return problems;
}

function auditProblems(ledger) {
  const problems = [];
  for (const id of requiredAudits) {
    const audit = ledger.audits[id];
    if (audit?.status !== "complete") problems.push(`audit ${id} is ${audit?.status || "missing"}`);
    else if (audit.searches.length < audit.requiredSearches.length) {
      problems.push(`audit ${id} has ${audit.searches.length}/${audit.requiredSearches.length} required independent searches`);
    }
  }
  return problems;
}

function freshnessProblems(ledger) {
  const problems = [];
  for (const id of requiredFreshnessSurfaces) {
    const surface = ledger.freshnessSurfaces?.[id];
    if (surface?.status !== "complete") {
      problems.push(`freshness surface ${id} is ${surface?.status || "missing"}`);
      continue;
    }
    if (surface.headlines.length < surface.minimumHeadlines) {
      problems.push(`freshness surface ${id} has ${surface.headlines.length}/${surface.minimumHeadlines} required top headlines`);
    }
    if (surface.decisions.length < surface.headlines.length) {
      problems.push(`freshness surface ${id} has decisions for ${surface.decisions.length}/${surface.headlines.length} headlines`);
    }
  }
  return problems;
}

function candidateProblems(ledger) {
  const problems = [];
  for (const candidate of ledger.candidates) {
    if (!closedCandidateDecisions.has(candidate.decision)) {
      problems.push(`candidate ${candidate.id} has no final decision`);
      continue;
    }
    if (candidate.decision === "excluded" && candidate.material && !candidate.exclusionReason) {
      problems.push(`material candidate ${candidate.id} is excluded without a reason`);
    }
    if (["included", "merged"].includes(candidate.decision) && !verifiedLinkStatuses.has(candidate.linkStatus)) {
      problems.push(`candidate ${candidate.id} has unverified link status ${candidate.linkStatus}`);
    }
  }
  return problems;
}

function recoveryProblems(ledger) {
  return ledger.recovery
    .filter((item) => !["resolved", "exhausted"].includes(item.status))
    .map((item) => `recovery ${item.candidateId} is ${item.status}`);
}

function discoveryProblems(ledger) {
  const problems = [
    ...sourceProblems(ledger),
    ...auditProblems(ledger),
    ...freshnessProblems(ledger)
  ];
  if (!ledger.baseline.removedStoriesReconciled) {
    problems.push("baseline removed-story reconciliation is incomplete");
  }
  if (ledger.sufficiency.verdict !== "pass") {
    problems.push(`sufficiency verdict is ${ledger.sufficiency.verdict}`);
  } else {
    if (ledger.sufficiency.searches.length < 3) problems.push("sufficiency pass has fewer than 3 adversarial searches");
    if (!ledger.sufficiency.reasons.length) problems.push("sufficiency pass has no reasoned verdict");
  }
  return problems;
}

function publishProblems(ledger) {
  return [...discoveryProblems(ledger), ...candidateProblems(ledger), ...recoveryProblems(ledger)];
}

function completionProblems(ledger) {
  const problems = publishProblems(ledger);
  const requiredPublication = [
    "localVerified",
    "productionBuilt",
    "previewBuilt",
    "primaryVerified",
    "secondaryVerified",
    "secondaryNoindexVerified",
    "secretsScanned",
    "committed",
    "pushed"
  ];
  for (const key of requiredPublication) {
    if (!ledger.publication[key]) problems.push(`publication.${key} is not complete`);
  }
  return problems;
}

function gateProblems(ledger, gate) {
  if (gate === "discovery") return discoveryProblems(ledger);
  if (gate === "publish") return publishProblems(ledger);
  if (gate === "complete") return completionProblems(ledger);
  throw new Error(`Unknown gate: ${gate}`);
}

function requireArg(name) {
  const value = args.get(name);
  if (!value) throw new Error(`Missing --${name}=...`);
  return value;
}

async function init() {
  try {
    await access(ledgerPath);
    if (!bool(args.get("force"))) {
      throw new Error(`Refresh ledger already exists: ${ledgerPath}. Reuse it or pass --force=true.`);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const feed = await readJson(path.join(root, "public", "curated-feed.json"));
  const registry = await readJson(path.join(root, "refresh", "sources.json"));
  const categoryCounts = Object.fromEntries(
    Object.entries(
      feed.items.reduce((counts, story) => {
        counts[story.filterCategory] = (counts[story.filterCategory] || 0) + 1;
        return counts;
      }, {})
    ).sort(([a], [b]) => a.localeCompare(b))
  );
  const ledger = {
    version: 1,
    date: args.get("date") || today,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "in_progress",
    baseline: {
      generatedAt: feed.generatedAt,
      itemCount: feed.items.length,
      categoryCounts,
      newestStories: feed.items
        .toSorted((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
        .slice(0, 12)
        .map(({ id, title, publishedAt }) => ({ id, title, publishedAt })),
      knownGoodCommit: args.get("known-good-commit") || null,
      knownGoodCount: args.get("known-good-count") ? Number(args.get("known-good-count")) : null,
      removedStoriesReconciled: false
    },
    requests: [],
    sources: Object.fromEntries(
      registry.sources.map((source) => [
        source.id,
        {
          ...source,
          status: "pending",
          inspected: [],
          headlineSample: [],
          decisions: [],
          notes: ""
        }
      ])
    ),
    audits: Object.fromEntries(
      categoryRegistry.audits.map((audit) => [
        audit.id,
        {
          ...audit,
          status: "pending",
          searches: [],
          sourcesUsed: [],
          included: [],
          exclusions: [],
          notes: ""
        }
      ])
    ),
    freshnessSurfaces: Object.fromEntries(
      freshnessRegistry.surfaces.map((surface) => [
        surface.id,
        {
          ...surface,
          status: "pending",
          inspected: [],
          headlines: [],
          decisions: [],
          included: [],
          notes: ""
        }
      ])
    ),
    candidates: [],
    recovery: [],
    sufficiency: {
      verdict: "pending",
      concerns: [],
      searches: [],
      reasons: [],
      challengedAt: null,
      challengeReason: null
    },
    publication: {
      localVerified: false,
      productionBuilt: false,
      previewBuilt: false,
      primaryVerified: false,
      secondaryVerified: false,
      secondaryNoindexVerified: false,
      secretsScanned: false,
      committed: false,
      pushed: false,
      evidence: []
    }
  };
  await writeJson(ledgerPath, ledger);
  console.log(`Initialized refresh ledger: ${ledgerPath}`);
}

async function mutate(update) {
  const ledger = await loadLedger();
  await update(ledger);
  ledger.updatedAt = new Date().toISOString();
  await writeJson(ledgerPath, ledger);
  console.log(`Updated refresh ledger: ${ledgerPath}`);
}

async function recordRequest() {
  await mutate((ledger) => {
    ledger.requests.push({
      purpose: requireArg("purpose"),
      target: requireArg("target"),
      pass: requireArg("pass"),
      observedAt: new Date().toISOString(),
      notes: args.get("notes") || ""
    });
  });
}

async function recordBaseline() {
  await mutate((ledger) => {
    if (args.has("removed-stories-reconciled")) {
      ledger.baseline.removedStoriesReconciled = bool(args.get("removed-stories-reconciled"));
    }
    if (args.has("known-good-commit")) ledger.baseline.knownGoodCommit = args.get("known-good-commit");
    if (args.has("known-good-count")) ledger.baseline.knownGoodCount = Number(args.get("known-good-count"));
    ledger.baseline.notes = args.get("notes") || ledger.baseline.notes || "";
  });
}

async function recordSource() {
  await mutate((ledger) => {
    const id = requireArg("id");
    const source = ledger.sources[id];
    if (!source) throw new Error(`Unknown source id: ${id}`);
    source.status = requireArg("status");
    source.inspected.push(...list(args.get("inspected")));
    source.headlineSample.push(...list(args.get("headlines")));
    source.decisions.push(...list(args.get("decisions")));
    source.notes = args.get("notes") || source.notes;
  });
}

async function addSource() {
  await mutate((ledger) => {
    const id = requireArg("id");
    if (ledger.sources[id]) throw new Error(`Source already exists: ${id}`);
    ledger.sources[id] = {
      id,
      name: requireArg("name"),
      group: args.get("group") || "additional",
      url: requireArg("url"),
      fallbackDomain: args.get("fallback-domain") || new URL(requireArg("url")).hostname,
      categories: list(args.get("categories")),
      status: "pending",
      inspected: [],
      headlineSample: [],
      decisions: [],
      notes: args.get("notes") || ""
    };
  });
}

async function recordAudit() {
  await mutate((ledger) => {
    const id = requireArg("id");
    const audit = ledger.audits[id];
    if (!audit) throw new Error(`Unknown audit id: ${id}`);
    audit.status = requireArg("status");
    audit.searches.push(...list(args.get("searches")));
    audit.sourcesUsed.push(...list(args.get("sources")));
    audit.included.push(...list(args.get("included")));
    audit.exclusions.push(...list(args.get("exclusions")));
    audit.notes = args.get("notes") || audit.notes;
  });
}

async function recordFreshnessSurface() {
  await mutate((ledger) => {
    const id = requireArg("id");
    const surface = ledger.freshnessSurfaces?.[id];
    if (!surface) throw new Error(`Unknown freshness surface id: ${id}`);
    surface.status = requireArg("status");
    surface.inspected.push(...list(args.get("inspected")));
    surface.headlines.push(...list(args.get("headlines")));
    surface.decisions.push(...list(args.get("decisions")));
    surface.included.push(...list(args.get("included")));
    surface.notes = args.get("notes") || surface.notes;
  });
}

async function addCandidate() {
  await mutate((ledger) => {
    const title = requireArg("title");
    const id = args.get("id") || slug(title);
    let candidate = ledger.candidates.find((item) => item.id === id);
    if (!candidate) {
      candidate = {
        id,
        title,
        material: bool(args.get("material") ?? "true"),
        discoveredBy: [],
        urls: [],
        decision: "pending",
        linkStatus: "unchecked",
        duplicateOf: null,
        exclusionReason: null,
        notes: ""
      };
      ledger.candidates.push(candidate);
    }
    candidate.discoveredBy.push(...list(args.get("discovered-by")));
    candidate.urls.push(...list(args.get("urls")));
    candidate.notes = args.get("notes") || candidate.notes;
  });
}

async function decideCandidate() {
  await mutate((ledger) => {
    const id = requireArg("id");
    const candidate = ledger.candidates.find((item) => item.id === id);
    if (!candidate) throw new Error(`Unknown candidate id: ${id}`);
    candidate.decision = requireArg("decision");
    candidate.linkStatus = args.get("link-status") || candidate.linkStatus;
    candidate.finalUrl = args.get("url") || candidate.finalUrl || null;
    candidate.duplicateOf = args.get("duplicate-of") || null;
    candidate.exclusionReason = args.get("reason") || null;
    candidate.notes = args.get("notes") || candidate.notes;
  });
}

async function recordRecovery() {
  await mutate((ledger) => {
    const candidateId = requireArg("candidate");
    const existing = ledger.recovery.find((item) => item.candidateId === candidateId);
    const value = existing || {
      candidateId,
      brokenUrl: args.get("broken-url") || null,
      routes: [],
      status: "open",
      replacementUrl: null,
      reason: null
    };
    value.routes.push(...list(args.get("routes")));
    value.status = requireArg("status");
    value.replacementUrl = args.get("replacement-url") || value.replacementUrl;
    value.reason = args.get("reason") || value.reason;
    if (!existing) ledger.recovery.push(value);
  });
}

async function sufficiency() {
  await mutate((ledger) => {
    ledger.sufficiency.verdict = requireArg("verdict");
    ledger.sufficiency.concerns.push(...list(args.get("concerns")));
    ledger.sufficiency.searches.push(...list(args.get("searches")));
    ledger.sufficiency.reasons.push(...list(args.get("reasons")));
    if (ledger.sufficiency.verdict === "pass") ledger.status = "ready_to_publish";
  });
}

async function challenge() {
  await mutate((ledger) => {
    ledger.status = "challenged";
    ledger.sufficiency.verdict = "reopen";
    ledger.sufficiency.challengedAt = new Date().toISOString();
    ledger.sufficiency.challengeReason = requireArg("reason");
    ledger.sufficiency.concerns.push(...list(args.get("concerns")));
    for (const id of list(args.get("sources"))) {
      if (!ledger.sources[id]) throw new Error(`Unknown source id: ${id}`);
      ledger.sources[id].status = "pending";
    }
    for (const id of list(args.get("audits"))) {
      if (!ledger.audits[id]) throw new Error(`Unknown audit id: ${id}`);
      ledger.audits[id].status = "pending";
    }
    for (const surface of Object.values(ledger.freshnessSurfaces || {})) {
      surface.status = "pending";
    }
  });
}

async function recordPublication() {
  await mutate((ledger) => {
    for (const [key, value] of args) {
      if (key === "ledger" || key === "evidence") continue;
      if (!(key in ledger.publication)) throw new Error(`Unknown publication field: ${key}`);
      ledger.publication[key] = bool(value);
    }
    ledger.publication.evidence.push(...list(args.get("evidence")));
    if (!completionProblems(ledger).length) ledger.status = "complete";
  });
}

async function check() {
  const ledger = await loadLedger();
  const gate = args.get("gate") || "complete";
  const problems = gateProblems(ledger, gate);
  if (problems.length) {
    console.error(`${gate} gate failed with ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(`${gate} gate passed.`);
}

async function report() {
  const ledger = await loadLedger();
  const closedSources = Object.values(ledger.sources).filter((source) => closedSourceStatuses.has(source.status));
  const unavailable = closedSources.filter((source) => source.status === "unavailable_after_fallback");
  const included = ledger.candidates.filter((candidate) => candidate.decision === "included");
  const unresolved = ledger.candidates.filter((candidate) => !closedCandidateDecisions.has(candidate.decision));
  const materialExcluded = ledger.candidates.filter((candidate) => candidate.material && candidate.decision === "excluded");
  const singlePassCandidates = ledger.candidates.filter((candidate) => new Set(candidate.discoveredBy).size < 2);
  const sparseAudits = Object.values(ledger.audits).filter((audit) => !audit.included.length);
  const passCounts = ledger.candidates.reduce((counts, candidate) => {
    for (const pass of candidate.discoveredBy) counts[pass] = (counts[pass] || 0) + 1;
    return counts;
  }, {});
  console.log(`Refresh ledger: ${ledgerPath}`);
  console.log(`Status: ${ledger.status}`);
  console.log(`Baseline: ${ledger.baseline.itemCount} items at ${ledger.baseline.generatedAt}`);
  console.log(`Hours since baseline: ${((Date.now() - new Date(ledger.baseline.generatedAt)) / 3_600_000).toFixed(1)}`);
  console.log(`Named sources closed: ${closedSources.length}/${Object.keys(ledger.sources).length}`);
  console.log(`Unavailable after fallback: ${unavailable.length}${unavailable.length ? ` (${unavailable.map((source) => source.id).join(", ")})` : ""}`);
  console.log(`Audits complete: ${Object.values(ledger.audits).filter((audit) => audit.status === "complete").length}/${requiredAudits.length}`);
  const completedFreshnessSurfaces = Object.values(ledger.freshnessSurfaces || {}).filter((surface) => surface.status === "complete");
  const reconciledFreshnessHeadlines = completedFreshnessSurfaces.reduce((count, surface) => count + Math.min(surface.headlines.length, surface.decisions.length), 0);
  console.log(`Freshness surfaces complete: ${completedFreshnessSurfaces.length}/${requiredFreshnessSurfaces.length}; headlines reconciled: ${reconciledFreshnessHeadlines}`);
  console.log(`Audits with no included candidates: ${sparseAudits.length}${sparseAudits.length ? ` (${sparseAudits.map((audit) => audit.id).join(", ")})` : ""}`);
  console.log(`Candidates: ${ledger.candidates.length}; included: ${included.length}; unresolved: ${unresolved.length}`);
  console.log(`Material exclusions: ${materialExcluded.length}; single-pass candidates: ${singlePassCandidates.length}`);
  console.log(`Recovery rows open: ${recoveryProblems(ledger).length}`);
  console.log(`Sufficiency verdict: ${ledger.sufficiency.verdict}`);
  console.log(`Discovery evidence: ${JSON.stringify(passCounts)}`);
  const repeatedRequests = Object.values(
    ledger.requests.reduce((groups, request) => {
      const key = `${request.pass}|${request.purpose}|${request.target}`;
      groups[key] ||= { key, count: 0 };
      groups[key].count += 1;
      return groups;
    }, {})
  ).filter((group) => group.count > 1);
  console.log(`Repeated identical-purpose requests: ${repeatedRequests.length}`);
  if (ledger.sufficiency.concerns.length) {
    console.log(`Sufficiency concerns: ${ledger.sufficiency.concerns.join(" | ")}`);
  }
  for (const gate of ["discovery", "publish", "complete"]) {
    console.log(`${gate} gate problems: ${gateProblems(ledger, gate).length}`);
  }
}

function help() {
  console.log(`Usage: node scripts/refresh-audit.js <command> [--key=value]

Commands:
  init                 Create a ledger from the current feed and source registry
  record-request       Record a page/query request and its distinct purpose
  record-baseline      Record known-good and removed-story reconciliation state
  add-source           Add a relevant government, research, or other source row
  record-source        Close or update one named-source row
  record-audit         Close or update one category-audit row
  record-freshness     Reconcile top headlines from a broad freshness surface
  add-candidate        Add discovery evidence for a candidate
  decide-candidate     Include, merge, or exclude a candidate
  record-recovery      Track broken-link recovery work
  sufficiency          Record pass/reopen verdict and evidence
  challenge            Reopen the refresh after a sufficiency challenge
  record-publication   Record build, deploy, verification, commit, and push state
  check                Validate discovery, publish, or complete gate
  report               Print a compact sufficiency and completion report

All commands accept --ledger=<path>. List values use | separators.`);
}

const handlers = {
  init,
  "record-request": recordRequest,
  "record-baseline": recordBaseline,
  "add-source": addSource,
  "record-source": recordSource,
  "record-audit": recordAudit,
  "record-freshness": recordFreshnessSurface,
  "add-candidate": addCandidate,
  "decide-candidate": decideCandidate,
  "record-recovery": recordRecovery,
  sufficiency,
  challenge,
  "record-publication": recordPublication,
  check,
  report,
  help
};

try {
  const handler = handlers[command];
  if (!handler) throw new Error(`Unknown command: ${command}`);
  await handler();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
