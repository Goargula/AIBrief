import { FILTER_CATEGORIES, storyFilterType } from "./category.js";
import { prioritizeSharedStory } from "./story-order.js";

const STORAGE_KEY = "ai-brief-state-v2";
const INITIAL_RENDER_COUNT = 10;
const RENDER_BATCH = 8;
const SAVE_SYNC_NOTICE_KEY = "ai-brief-save-sync-notice-v1";
const FIREBASE_SDK_VERSION = "10.12.4";
const SIGN_IN_BUTTON_TEXT = "Sign in with Google";
const SIGN_IN_PENDING_TEXT = "Signing in...";
const REDIRECT_START_TIMEOUT_MS = 5000;
const ANALYTICS_COLLECTION = "analytics";
const PAGE_HITS_DOC = "pageHits";
const STORY_READS_DOC = "storyReads";
const SECONDARY_PREVIEW_HOST = "ai-brief-arsh-20260604.web.app";
const PRIMARY_HOST = "goargulaainews.web.app";
const SECONDARY_PREVIEW_STORY_COUNT = 20;
const CATEGORY_COLORS = {
  funding: "#3bd671",
  models: "#b28cff",
  papers: "#f0b84a",
  pushback: "#ff6b6b",
  general: "#65a7ff"
};

const state = {
  items: [],
  sort: "relevance",
  filter: "all",
  renderedCount: INITIAL_RENDER_COUNT,
  activeIndex: 0,
  saved: new Set(),
  savedSnapshots: new Map(),
  opened: new Set(),
  notes: {},
  firebaseReady: false,
  firebaseError: "",
  authReady: false,
  authInFlight: false,
  user: null,
  auth: null,
  db: null,
  selectedId: null
};

const fallbackItems = [
  {
    id: "sample-1",
    title: "Frontier model release changes the agent race",
    summary: "A major AI lab shipped a new model update focused on tool use, coding, and lower latency. The practical impact is faster agent workflows and fresh pressure on enterprise AI vendors.",
    url: "https://openai.com/news/",
    imageUrl: "/visual.svg?lane=news&title=Frontier%20model%20release",
    sourceName: "Sample Brief",
    lane: "news",
    filterCategory: "models",
    publishedAt: new Date().toISOString(),
    importance: 112
  },
  {
    id: "sample-2",
    title: "New paper improves long-context retrieval reliability",
    summary: "Researchers introduced a benchmark and training recipe that reduces missed evidence in long documents. This matters for legal, finance, and research assistants.",
    url: "https://arxiv.org/list/cs.AI/recent",
    imageUrl: "/visual.svg?lane=papers&title=Long-context%20retrieval",
    sourceName: "Sample Paper",
    lane: "papers",
    filterCategory: "papers",
    publishedAt: new Date(Date.now() - 2 * 36e5).toISOString(),
    importance: 86
  },
  {
    id: "sample-3",
    title: "AI infrastructure startup raises a large Series A",
    summary: "The round signals continued investor appetite for tools that make inference cheaper and easier to monitor in production.",
    url: "https://news.crunchbase.com/",
    imageUrl: "/visual.svg?lane=startups&title=AI%20infrastructure%20funding",
    sourceName: "Sample Startup",
    lane: "startups",
    filterCategory: "funding",
    publishedAt: new Date(Date.now() - 4 * 36e5).toISOString(),
    importance: 79
  }
];

const storyDeck = document.querySelector("#storyDeck");
const storyTemplate = document.querySelector("#storyTemplate");
const filterButton = document.querySelector("#filterButton");
const filterMenu = document.querySelector("#filterMenu");
const storyPosition = document.querySelector("#storyPosition");
const profileButton = document.querySelector("#profileButton");
const profileDialog = document.querySelector("#profileDialog");
const closeProfile = document.querySelector("#closeProfile");
const signInButton = document.querySelector("#signInButton");
const signOutButton = document.querySelector("#signOutButton");
const authStatus = document.querySelector("#authStatus");
const savedCount = document.querySelector("#savedCount");
const openedCount = document.querySelector("#openedCount");
const savedList = document.querySelector("#savedList");
const toast = document.querySelector("#toast");

let observer;
let toastTimer;
let firebaseInitPromise;
let firebaseSdkPromise;
let initialSharedStoryHandled = false;
let pageHitTracked = false;
const sessionTrackedReads = new Set();

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.saved = new Set(saved.saved || []);
    state.opened = new Set(saved.opened || []);
    state.notes = saved.notes || {};
  } catch {
    state.saved = new Set();
    state.opened = new Set();
    state.notes = {};
  }
}

function persistLocalState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      saved: [...state.saved],
      opened: [...state.opened],
      notes: state.notes
    })
  );
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

function firebaseServerTimestamp() {
  return window.firebase?.firestore?.FieldValue?.serverTimestamp?.() || new Date();
}

function hasSyncedUser() {
  return Boolean(state.user && !state.user.isAnonymous);
}

function storySnapshot(item) {
  return {
    storyId: item.id,
    savedAt: firebaseServerTimestamp(),
    title: String(item.title || "").slice(0, 240),
    summary: String(item.summary || "").slice(0, 500),
    sourceName: String(item.sourceName || "").slice(0, 120),
    url: String(item.url || "").slice(0, 1000),
    publishedAt: String(item.publishedAt || ""),
    lane: String(item.lane || "news").slice(0, 40),
    filterCategory: storyFilterType(item)
  };
}

function storyById(id) {
  return state.items.find((item) => item.id === id);
}

function sharedStoryIdFromUrl() {
  const queryStoryId = new URLSearchParams(window.location.search).get("story");
  if (queryStoryId) return queryStoryId;
  const storyPathMatch = window.location.pathname.match(/^\/stories\/([^/]+)\/?$/);
  return storyPathMatch ? decodeURIComponent(storyPathMatch[1]) : null;
}

function sharedStoryUrl(item) {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  if (window.location.hostname === PRIMARY_HOST || (window.location.hostname === SECONDARY_PREVIEW_HOST && secondaryPreviewStoryIds().has(item.id))) {
    url.pathname = `/stories/${encodeURIComponent(item.id)}/`;
    return url.toString();
  }
  url.pathname = "/";
  url.searchParams.set("story", item.id);
  return url.toString();
}

function secondaryPreviewStoryIds() {
  return new Set(
    [...state.items]
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, SECONDARY_PREVIEW_STORY_COUNT)
      .map((item) => item.id)
  );
}

function userSaveRef(storyId) {
  return state.db.collection("userSaves").doc(state.user.uid).collection("stories").doc(storyId);
}

function currentHostingAuthDomain() {
  const host = window.location.hostname;
  return host.endsWith(".web.app") || host.endsWith(".firebaseapp.com") ? host : "";
}

function installFirebaseBrowserGlobals() {
  window.global = window.global || window;
  window.process = window.process || { env: {} };
  window.process.env = window.process.env || {};
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-firebase-loader="${src}"]`);
    if (existing?.dataset.loaded === "true") {
      resolve();
      return;
    }

    const script = existing || document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.firebaseLoader = src;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error(`Could not load ${src}`));
    };
    if (!existing) document.head.appendChild(script);
  });
}

async function loadFirebaseScript(fileName, isReady) {
  if (isReady()) return;
  const candidates = [
    `/__/firebase/${FIREBASE_SDK_VERSION}/${fileName}`,
    `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/${fileName}`
  ];

  let lastError;
  for (const src of candidates) {
    try {
      await loadScript(src);
      if (isReady()) return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error(`Firebase SDK did not expose ${fileName}.`);
}

async function loadFirebaseSdk() {
  if (firebaseSdkPromise) return firebaseSdkPromise;

  firebaseSdkPromise = (async () => {
    installFirebaseBrowserGlobals();
    await loadFirebaseScript("firebase-app-compat.js", () => Boolean(window.firebase?.initializeApp));
    await loadFirebaseScript("firebase-auth-compat.js", () => Boolean(window.firebase?.auth));
    await loadFirebaseScript("firebase-firestore-compat.js", () => Boolean(window.firebase?.firestore));
    await initializeFirebaseApp();
  })();

  return firebaseSdkPromise;
}

async function initializeFirebaseApp() {
  if (window.firebase?.apps?.length) return;

  const response = await fetch("/__/firebase/init.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Firebase config could not load.");

  const config = await response.json();
  const authDomain = currentHostingAuthDomain();
  window.firebase.initializeApp(authDomain ? { ...config, authDomain } : config);
}

async function initializeFirebase() {
  if (state.firebaseReady && state.auth && state.db) return;
  try {
    await loadFirebaseSdk();
    await waitForFirebaseInit();
    if (!window.firebase?.apps?.length || !window.firebase.auth || !window.firebase.firestore) {
      state.firebaseError = "Firebase sync is unavailable in this environment.";
      state.authReady = true;
      updateAuthUi();
      return;
    }

    state.auth = window.firebase.auth();
    state.db = window.firebase.firestore();
    state.firebaseReady = true;
    state.auth.getRedirectResult().catch((error) => {
      showToast(authErrorMessage(error));
    });
    state.auth.onAuthStateChanged(async (user) => {
      state.user = user;
      state.authReady = true;
      if (hasSyncedUser()) {
        await loadSyncedSaves();
        await migrateLocalSaves();
      }
      updateAuthUi();
      render();
    });
  } catch (error) {
    state.firebaseError = error.message || "Firebase could not start.";
    state.firebaseReady = false;
    state.authReady = true;
    updateAuthUi();
  }
}

function waitForFirebaseInit() {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => {
      if (
        (window.firebase?.apps?.length && window.firebase.auth && window.firebase.firestore) ||
        Date.now() - started > 8000
      ) {
        resolve();
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

function authErrorMessage(error) {
  if (error?.code === "auth/cancelled-popup-request") {
    return "Google sign-in is already open. Close the previous sign-in window and try again.";
  }
  if (error?.code === "auth/popup-closed-by-user") {
    return "Google sign-in was closed before it finished.";
  }
  if (error?.code === "auth/popup-blocked") {
    return "The browser blocked the Google sign-in popup. Try again or allow popups for this site.";
  }
  if (error?.code === "auth/unauthorized-domain") {
    return "This Firebase domain is not authorized for Google sign-in.";
  }
  return error?.message || "Google sign-in failed.";
}

async function ensureFirebaseReady() {
  if (state.firebaseReady && state.auth && state.db) return true;
  if (firebaseInitPromise) await firebaseInitPromise;
  if (state.firebaseReady && state.auth && state.db) return true;
  firebaseInitPromise = initializeFirebase();
  await firebaseInitPromise;
  return Boolean(state.firebaseReady && state.auth && state.db);
}

function analyticsDayId(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function trackGaEvent(name, parameters = {}) {
  if (typeof window.gtag !== "function" || window.location.hostname !== PRIMARY_HOST) return;
  window.gtag("event", name, parameters);
}

function gaStoryParameters(item) {
  return {
    story_id: String(item?.id || "").slice(0, 100),
    story_title: String(item?.title || "").slice(0, 100),
    source_name: String(item?.sourceName || "").slice(0, 100),
    story_category: storyFilterType(item || {})
  };
}

function safeAnalyticsId(value) {
  return String(value || "unknown")
    .replace(/[/.#[\]\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180) || "unknown";
}

function incrementValue() {
  return window.firebase?.firestore?.FieldValue?.increment?.(1);
}

function analyticsPayload(extra = {}) {
  const increment = incrementValue();
  if (!increment) return null;
  return {
    ...extra,
    count: increment,
    updatedAt: firebaseServerTimestamp()
  };
}

async function commitAnalytics(updates) {
  if (!updates.length || !(await ensureFirebaseReady())) return;
  const batch = state.db.batch();
  updates.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
  await batch.commit();
}

async function trackPageHit() {
  if (pageHitTracked) return;
  pageHitTracked = true;
  if (!(await ensureFirebaseReady())) return;

  const day = analyticsDayId();
  const totalPayload = analyticsPayload();
  const dailyPayload = analyticsPayload();
  if (!totalPayload || !dailyPayload) return;

  try {
    await commitAnalytics([
      { ref: state.db.collection(ANALYTICS_COLLECTION).doc(PAGE_HITS_DOC), data: totalPayload },
      { ref: state.db.collection(ANALYTICS_COLLECTION).doc(PAGE_HITS_DOC).collection("days").doc(day), data: dailyPayload }
    ]);
  } catch {
    // Analytics must never interrupt reading.
  }
}

async function trackStoryRead(item) {
  if (!item?.id || sessionTrackedReads.has(item.id)) return;
  sessionTrackedReads.add(item.id);
  trackGaEvent("story_view", gaStoryParameters(item));
  if (!(await ensureFirebaseReady())) return;

  const day = analyticsDayId();
  const storyDocId = safeAnalyticsId(item.id);
  const storyMeta = {
    storyId: String(item.id).slice(0, 200),
    title: String(item.title || "").slice(0, 240),
    sourceName: String(item.sourceName || "").slice(0, 120),
    url: String(item.url || "").slice(0, 1000),
    publishedAt: String(item.publishedAt || "").slice(0, 80)
  };
  const totalPayload = analyticsPayload();
  const dailyPayload = analyticsPayload();
  const storyPayload = analyticsPayload(storyMeta);
  const dailyStoryPayload = analyticsPayload(storyMeta);
  if (!totalPayload || !dailyPayload || !storyPayload || !dailyStoryPayload) return;

  try {
    const storyReads = state.db.collection(ANALYTICS_COLLECTION).doc(STORY_READS_DOC);
    await commitAnalytics([
      { ref: storyReads, data: totalPayload },
      { ref: storyReads.collection("days").doc(day), data: dailyPayload },
      { ref: storyReads.collection("stories").doc(storyDocId), data: storyPayload },
      { ref: storyReads.collection("days").doc(day).collection("stories").doc(storyDocId), data: dailyStoryPayload }
    ]);
  } catch {
    // Analytics must never interrupt reading.
  }
}

async function signInWithGoogle() {
  if (state.authInFlight) {
    showToast("Google sign-in is already in progress.");
    return;
  }

  if (!(state.firebaseReady && state.auth && state.db && window.firebase?.auth)) {
    if (!firebaseInitPromise) firebaseInitPromise = initializeFirebase();
    showToast(state.firebaseError || "Google sign-in is still starting. Try again in a moment.");
    updateAuthUi();
    return;
  }

  state.authInFlight = true;
  updateAuthUi();

  const provider = new window.firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const recoveryTimer = setTimeout(() => {
    if (!document.hidden && state.authInFlight) {
      state.authInFlight = false;
      updateAuthUi();
      showToast("Google sign-in did not open. Please try again.");
    }
  }, REDIRECT_START_TIMEOUT_MS);

  try {
    const redirectPromise = state.user?.isAnonymous
      ? state.user.linkWithRedirect(provider)
      : state.auth.signInWithRedirect(provider);
    await redirectPromise;
  } catch (error) {
    clearTimeout(recoveryTimer);
    showToast(authErrorMessage(error));
    state.authInFlight = false;
    updateAuthUi();
  }
}

async function signOut() {
  if (!state.auth) return;
  await state.auth.signOut();
  showToast("Signed out. New saves will stay local on this device.");
}

async function loadSyncedSaves() {
  if (!hasSyncedUser() || !state.db) return;
  const snapshot = await state.db.collection("userSaves").doc(state.user.uid).collection("stories").get();
  snapshot.forEach((doc) => {
    state.saved.add(doc.id);
    state.savedSnapshots.set(doc.id, doc.data());
  });
  persistLocalState();
}

async function migrateLocalSaves() {
  if (!hasSyncedUser() || !state.db || !state.saved.size) return;
  await Promise.all(
    [...state.saved].map((id) => {
      const item = storyById(id);
      if (!item) return null;
      return userSaveRef(id).set(storySnapshot(item), { merge: true });
    }).filter(Boolean)
  );
}

function updateAuthUi() {
  if (!authStatus || !signInButton || !signOutButton) return;

  signInButton.textContent = SIGN_IN_BUTTON_TEXT;
  signInButton.disabled = false;

  if (hasSyncedUser()) {
    authStatus.textContent = `Signed in as ${state.user.displayName || state.user.email || "Google user"}. Saved stories sync across devices.`;
    signInButton.hidden = true;
    signOutButton.hidden = false;
    return;
  }

  signInButton.hidden = false;
  signOutButton.hidden = true;
  if (state.authInFlight) {
    signInButton.disabled = true;
    signInButton.textContent = SIGN_IN_PENDING_TEXT;
    authStatus.textContent = "Opening Google sign-in...";
    return;
  }
  authStatus.textContent = state.firebaseReady
    ? "Saves are local until you sign in with Google."
    : "Saves are local on this device. Sync needs Firebase setup.";
}

function formatRelative(dateLike) {
  const date = new Date(dateLike);
  const diff = Date.now() - date.getTime();
  if (Number.isNaN(date.getTime())) return "";
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function categoryLabel(category) {
  return {
    funding: "Funding",
    models: "Models",
    papers: "Papers",
    pushback: "Pushback",
    general: "General"
  }[category] || "General";
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generatedVisualUrl(category) {
  const safeCategory = FILTER_CATEGORIES.has(category) ? category : "general";
  const color = CATEGORY_COLORS[safeCategory];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d1117"/><stop offset="1" stop-color="${color}" stop-opacity="0.38"/></linearGradient></defs><rect width="900" height="1200" fill="url(#g)"/><circle cx="760" cy="180" r="260" fill="${color}" opacity="0.24"/><circle cx="110" cy="1040" r="310" fill="${color}" opacity="0.16"/><path d="M-40 790 C210 690 330 780 510 660 S810 450 980 540" fill="none" stroke="${color}" stroke-width="96" opacity="0.08"/><path d="M-70 925 C180 820 360 905 540 755 S790 620 980 690" fill="none" stroke="#f5f7fa" stroke-width="42" opacity="0.05"/><text x="72" y="144" fill="${color}" font-family="Arial, sans-serif" font-size="36" font-weight="700">${escapeSvgText(safeCategory.toUpperCase())}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function storyVisualUrl(item) {
  if (item.imageUrl && !item.imageUrl.startsWith("/visual.svg")) return item.imageUrl;
  return generatedVisualUrl(storyFilterType(item));
}

function filteredItems() {
  if (state.filter === "all") return [...state.items];
  return state.items.filter((item) => storyFilterType(item) === state.filter);
}

function visibleItems() {
  return sortedItems().slice(0, state.renderedCount);
}

function sortedItems() {
  const items = filteredItems();
  let sorted;
  if (state.sort === "recency") {
    sorted = items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  } else {
    sorted = items.sort((a, b) => (b.importance || 0) - (a.importance || 0) || new Date(b.publishedAt) - new Date(a.publishedAt));
  }

  return prioritizeSharedStory(sorted, state.selectedId);
}

function buildStory(item) {
  const summary = item.summary || "A new AI update is worth tracking.";
  const fullSummary = item.fullSummary || summary;
  const lower = `${item.title} ${summary}`.toLowerCase();
  const coverage =
    item.relatedSources && item.relatedSources.length > 1
      ? `Merged coverage from ${item.relatedSources.slice(0, 3).join(", ")}${item.relatedSources.length > 3 ? " and others" : ""}.`
      : "";
  const facts = item.keyFacts && item.keyFacts.length ? `Key details: ${item.keyFacts.slice(0, 8).join(", ")}.` : "";

  let watch = "Watch whether this becomes a product feature, a new standard others copy, or a short-lived announcement.";
  if (lower.includes("openai") || lower.includes("anthropic") || lower.includes("deepmind")) {
    watch = "Watch benchmarks, pricing, developer adoption, and competitor responses.";
  } else if (lower.includes("raise") || lower.includes("funding") || lower.includes("series")) {
    watch = "Watch hiring, customer proof, and whether the company turns capital into distribution.";
  } else if (item.lane === "papers") {
    watch = "Watch reproductions, open-source implementations, and real workflow impact.";
  }

  const whyItMatters = item.whyItMatters || "";

  return {
    hook: summary,
    change: fullSummary,
    facts,
    coverage,
    watch: whyItMatters ? `Why it matters: ${whyItMatters}` : `Why it matters: ${watch}`
  };
}

function setPosition() {
  const total = sortedItems().length || visibleItems().length;
  const current = Math.min(state.activeIndex + 1, total || 1);
  const prefix = state.filter === "all" ? "Story" : document.querySelector(`.filter[data-filter="${state.filter}"]`)?.dataset.label || "Story";
  storyPosition.textContent = `${prefix} ${current} of ${total || 1}`;
}

function render() {
  if (observer) observer.disconnect();
  storyDeck.replaceChildren();

  const items = visibleItems();
  if (!items.length) {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    empty.textContent = state.items.length ? "No stories match this filter yet." : "Loading AI stories...";
    storyDeck.append(empty);
    setPosition();
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item, index) => fragment.append(createStoryCard(item, index)));
  storyDeck.append(fragment);
  setupObserver();
  setPosition();
}

function createStoryCard(item, index) {
  const story = buildStory(item);
  const fragment = storyTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".story-card");
  const image = fragment.querySelector(".story-image");
  const lane = fragment.querySelector(".lane");
  const source = fragment.querySelector(".source");
  const time = fragment.querySelector(".time");
  const title = fragment.querySelector("h1");
  const hook = fragment.querySelector(".hook");
  const change = fragment.querySelector(".change");
  const facts = fragment.querySelector(".facts");
  const coverage = fragment.querySelector(".coverage");
  const watch = fragment.querySelector(".watch");
  const save = fragment.querySelector(".save");
  const share = fragment.querySelector(".share");
  const original = fragment.querySelector(".original");

  card.dataset.index = String(index);
  card.dataset.id = item.id;
  image.src = storyVisualUrl(item);
  image.alt = "";
  const category = storyFilterType(item);
  lane.textContent = categoryLabel(category);
  lane.classList.add(category);
  source.textContent = item.sourceName;
  time.textContent = formatRelative(item.publishedAt);
  title.textContent = item.title;
  hook.textContent = story.hook;
  change.textContent = story.change;
  facts.textContent = story.facts;
  facts.hidden = !story.facts;
  coverage.textContent = story.coverage;
  coverage.hidden = !story.coverage;
  watch.textContent = story.watch;
  original.href = item.url;
  save.textContent = state.saved.has(item.id) ? "Saved" : "Save";

  save.addEventListener("click", () => toggleSave(item, save));

  share.addEventListener("click", () => shareStory(item, share));
  original.addEventListener("click", () => trackGaEvent("original_source_click", gaStoryParameters(item)));

  return fragment;
}

function setupObserver() {
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;

      state.activeIndex = Number(visible.target.dataset.index || 0);
      const storyId = visible.target.dataset.id;
      state.opened.add(storyId);
      trackStoryRead(storyById(storyId));
      persistLocalState();
      setPosition();

      if (state.activeIndex >= state.renderedCount - 3 && state.renderedCount < sortedItems().length) {
        state.renderedCount += RENDER_BATCH;
        render();
      }
    },
    { root: storyDeck, threshold: [0.55, 0.75] }
  );

  storyDeck.querySelectorAll(".story-card").forEach((card) => observer.observe(card));
}

async function toggleSave(item, button) {
  const wasSaved = state.saved.has(item.id);
  if (wasSaved) {
    state.saved.delete(item.id);
    state.savedSnapshots.delete(item.id);
  } else {
    state.saved.add(item.id);
    state.savedSnapshots.set(item.id, storySnapshot(item));
  }
  button.textContent = state.saved.has(item.id) ? "Saved" : "Save";
  persistLocalState();
  trackGaEvent(wasSaved ? "story_unsave" : "story_save", gaStoryParameters(item));

  if (!wasSaved && !hasSyncedUser() && !localStorage.getItem(SAVE_SYNC_NOTICE_KEY)) {
    localStorage.setItem(SAVE_SYNC_NOTICE_KEY, "1");
    showToast("Saved locally. Sign in with Google to keep saves across devices.");
  }

  if (!hasSyncedUser() || !state.db) return;

  try {
    if (wasSaved) await userSaveRef(item.id).delete();
    else await userSaveRef(item.id).set(storySnapshot(item), { merge: true });
  } catch {
    if (wasSaved) {
      state.saved.add(item.id);
      state.savedSnapshots.set(item.id, storySnapshot(item));
    } else {
      state.saved.delete(item.id);
      state.savedSnapshots.delete(item.id);
    }
    button.textContent = state.saved.has(item.id) ? "Saved" : "Save";
    persistLocalState();
    showToast("Could not sync this save. It is still stored locally.");
  }
}

function renderProfileList(container, ids) {
  container.replaceChildren();
  const items = ids
    .map((id) => state.items.find((item) => item.id === id) || state.savedSnapshots.get(id))
    .filter(Boolean)
    .slice(0, 20);

  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "profile-empty";
    empty.textContent = "Nothing here yet.";
    container.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "profile-story";
    button.innerHTML = `<span>${categoryLabel(storyFilterType(item))}</span><strong></strong>`;
    button.querySelector("strong").textContent = item.title;
    button.addEventListener("click", () => {
      closeProfileDialog();
      if (state.items.some((story) => story.id === item.storyId || story.id === item.id)) {
        jumpToStory(item.storyId || item.id);
      } else if (item.url) {
        window.open(item.url, "_blank", "noopener,noreferrer");
      }
    });
    fragment.append(button);
  });
  container.append(fragment);
}

function openProfile() {
  savedCount.textContent = state.saved.size;
  openedCount.textContent = state.opened.size;
  renderProfileList(savedList, [...state.saved]);
  if (typeof profileDialog.showModal === "function") profileDialog.showModal();
  else profileDialog.setAttribute("open", "");
}

function closeProfileDialog() {
  profileDialog.close();
}

function jumpToStory(id) {
  const index = sortedItems().findIndex((item) => item.id === id);
  if (index < 0) {
    setFilter("all");
    jumpToStory(id);
    return;
  }
  state.renderedCount = Math.max(state.renderedCount, index + 4);
  render();
  const target = storyDeck.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function openInitialSharedStory() {
  if (initialSharedStoryHandled) return;
  const storyId = sharedStoryIdFromUrl();
  if (!storyId) {
    initialSharedStoryHandled = true;
    return;
  }
  if (!state.items.some((item) => item.id === storyId)) return;
  initialSharedStoryHandled = true;
  state.selectedId = storyId;
  state.filter = "all";
  state.activeIndex = 0;
  state.renderedCount = INITIAL_RENDER_COUNT;
}

function isEditingTarget(target) {
  const tagName = target?.tagName;
  return target?.isContentEditable || tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

function goToStoryOffset(offset) {
  const items = sortedItems();
  if (!items.length) return;

  const nextIndex = Math.max(0, Math.min(items.length - 1, state.activeIndex + offset));
  if (nextIndex === state.activeIndex) return;

  state.activeIndex = nextIndex;
  if (nextIndex >= state.renderedCount) {
    state.renderedCount = Math.min(items.length, nextIndex + 4);
    render();
  }

  const target = storyDeck.querySelector(`[data-index="${nextIndex}"]`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  setPosition();
}

async function shareStory(item, button) {
  const url = sharedStoryUrl(item);
  trackGaEvent("story_share", { ...gaStoryParameters(item), share_url: url });
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = "Share";
    }, 1200);
    return;
  }
  if (navigator.share) await navigator.share({ title: item.title, text: item.summary, url });
}

async function loadFeed() {
  try {
    const payload = await fetchFeed();
    state.items = payload.items && payload.items.length ? payload.items : fallbackItems;
    updateFilterCounts();
  } catch {
    state.items = fallbackItems;
    updateFilterCounts();
  } finally {
    openInitialSharedStory();
    render();
    storyDeck.scrollTo({ top: 0, behavior: "instant" });
  }
}

async function fetchFeed() {
  const apiResponse = await fetch("/api/feed", { cache: "no-store" });
  if (apiResponse.ok && apiResponse.headers.get("content-type")?.includes("application/json")) {
    return apiResponse.json();
  }

  const staticResponse = await fetch(`/curated-feed.json?t=${Date.now()}`, { cache: "no-store" });
  if (staticResponse.ok) return staticResponse.json();

  throw new Error(`Feed returned ${apiResponse.status}; static feed returned ${staticResponse.status}`);
}

function setFilter(filter) {
  state.selectedId = null;
  state.filter = filter;
  state.activeIndex = 0;
  state.renderedCount = INITIAL_RENDER_COUNT;
  document.querySelector(".filter.active")?.classList.remove("active");
  document.querySelector(`.filter[data-filter="${filter}"]`)?.classList.add("active");
  render();
  storyDeck.scrollTo({ top: 0, behavior: "instant" });
}

function updateFilterCounts() {
  const filterButtons = document.querySelectorAll(".filter");
  if (!filterButtons.length) return;

  const counts = state.items.reduce(
    (totals, item) => {
      totals.all += 1;
      totals[storyFilterType(item)] += 1;
      return totals;
    },
    { all: 0, funding: 0, models: 0, papers: 0, pushback: 0, general: 0 }
  );

  filterButtons.forEach((button) => {
    const label = button.dataset.label || button.textContent.replace(/\s+\d+$/, "");
    button.dataset.label = label;
    button.textContent = `${label} ${counts[button.dataset.filter] || 0}`;
  });
}

function toggleFilterMenu(forceOpen) {
  if (!filterButton || !filterMenu) return;
  const open = typeof forceOpen === "boolean" ? forceOpen : filterMenu.hidden;
  filterMenu.hidden = !open;
  filterButton.setAttribute("aria-expanded", String(open));
}

filterButton?.addEventListener("click", () => toggleFilterMenu());
document.addEventListener("click", (event) => {
  if (!filterButton || !filterMenu || filterMenu.hidden || filterMenu.contains(event.target) || filterButton.contains(event.target)) return;
  toggleFilterMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && filterMenu && !filterMenu.hidden) toggleFilterMenu(false);
});
document.addEventListener("keydown", (event) => {
  if (isEditingTarget(event.target) || profileDialog.open) return;
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    event.preventDefault();
    goToStoryOffset(1);
  } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    event.preventDefault();
    goToStoryOffset(-1);
  }
});
document.querySelectorAll(".filter").forEach((button) => {
  button.dataset.label = button.textContent;
  button.addEventListener("click", () => {
    setFilter(button.dataset.filter);
    trackGaEvent("story_filter", { filter_name: button.dataset.filter });
    toggleFilterMenu(false);
  });
});
profileButton.addEventListener("click", openProfile);
signInButton?.addEventListener("click", signInWithGoogle);
signOutButton?.addEventListener("click", signOut);
document.querySelectorAll(".sort").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".sort.active")?.classList.remove("active");
    button.classList.add("active");
    state.sort = button.dataset.sort;
    state.selectedId = null;
    trackGaEvent("story_sort", { sort_name: button.dataset.sort });
    state.activeIndex = 0;
    state.renderedCount = INITIAL_RENDER_COUNT;
    render();
    storyDeck.scrollTo({ top: 0, behavior: "instant" });
  });
});
closeProfile.addEventListener("click", closeProfileDialog);
profileDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeProfileDialog();
});
profileDialog.addEventListener("click", (event) => {
  if (event.target === profileDialog) closeProfileDialog();
});
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

loadLocalState();
firebaseInitPromise = initializeFirebase();
trackPageHit();
loadFeed();
setInterval(() => loadFeed(), 15 * 60 * 1000);
