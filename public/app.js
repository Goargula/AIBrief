const STORAGE_KEY = "ai-brief-state-v2";
const INITIAL_RENDER_COUNT = 10;
const RENDER_BATCH = 8;
const FILTER_CATEGORIES = new Set(["funding", "models", "papers", "pushback", "general"]);
const COMMENT_LIMIT = 20;
const COMMENT_MAX_LENGTH = 1000;
const DISPLAY_NAME_MAX_LENGTH = 40;
const SAVE_SYNC_NOTICE_KEY = "ai-brief-save-sync-notice-v1";
const COMMENT_BACKEND_UNAVAILABLE_MESSAGE = "Public comments need the hosted Firebase app. Saves still work locally on this device.";
const VISUAL_COLORS = {
  papers: "#f0b84a",
  startups: "#3bd671",
  deals: "#ff6b6b",
  signal: "#65a7ff",
  news: "#65a7ff"
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
  localCommented: new Set(),
  comments: new Map(),
  firebaseReady: false,
  firebaseError: "",
  authReady: false,
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
const refreshButton = document.querySelector("#refreshButton");
const storyPosition = document.querySelector("#storyPosition");
const commentDialog = document.querySelector("#commentDialog");
const commentForm = document.querySelector("#commentForm");
const commentName = document.querySelector("#commentName");
const commentText = document.querySelector("#commentText");
const commentStatus = document.querySelector("#commentStatus");
const cancelComment = document.querySelector("#cancelComment");
const profileButton = document.querySelector("#profileButton");
const profileDialog = document.querySelector("#profileDialog");
const closeProfile = document.querySelector("#closeProfile");
const signInButton = document.querySelector("#signInButton");
const signOutButton = document.querySelector("#signOutButton");
const authStatus = document.querySelector("#authStatus");
const savedCount = document.querySelector("#savedCount");
const commentedCount = document.querySelector("#commentedCount");
const openedCount = document.querySelector("#openedCount");
const savedList = document.querySelector("#savedList");
const commentedList = document.querySelector("#commentedList");
const toast = document.querySelector("#toast");

let observer;
let toastTimer;
let firebaseInitPromise;

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.saved = new Set(saved.saved || []);
    state.opened = new Set(saved.opened || []);
    state.notes = saved.notes || {};
    state.localCommented = new Set(saved.localCommented || Object.keys(saved.notes || {}).filter((id) => saved.notes[id]));
  } catch {
    state.saved = new Set();
    state.opened = new Set();
    state.notes = {};
    state.localCommented = new Set();
  }
}

function persistLocalState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      saved: [...state.saved],
      opened: [...state.opened],
      notes: state.notes,
      localCommented: [...state.localCommented]
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

function setCommentStatus(message = "") {
  if (!commentStatus) return;
  commentStatus.textContent = message;
  commentStatus.hidden = !message;
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

function userSaveRef(storyId) {
  return state.db.collection("userSaves").doc(state.user.uid).collection("stories").doc(storyId);
}

function storyCommentsRef(storyId) {
  return state.db.collection("storyComments").doc(storyId).collection("comments");
}

function useCurrentHostingAuthDomain() {
  const app = window.firebase?.apps?.[0];
  const host = window.location.hostname;
  if (!app || !host.endsWith(".web.app")) return;
  app.options.authDomain = host;
}

async function initializeFirebase() {
  if (state.firebaseReady && state.auth && state.db) return;
  try {
    await waitForFirebaseInit();
    if (!window.firebase?.apps?.length || !window.firebase.auth || !window.firebase.firestore) {
      state.firebaseError = COMMENT_BACKEND_UNAVAILABLE_MESSAGE;
      state.authReady = true;
      updateAuthUi();
      return;
    }

    useCurrentHostingAuthDomain();

    const appCheckKey = document.querySelector('meta[name="firebase-app-check-site-key"]')?.content?.trim();
    if (appCheckKey && window.firebase.appCheck) {
      window.firebase.appCheck().activate(appCheckKey, true);
    }

    state.auth = window.firebase.auth();
    state.db = window.firebase.firestore();
    state.firebaseReady = true;
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
      if (window.firebase?.apps?.length || Date.now() - started > 8000) {
        resolve();
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

async function ensureFirebaseReady() {
  if (state.firebaseReady && state.auth && state.db) return true;
  if (firebaseInitPromise) await firebaseInitPromise;
  if (state.firebaseReady && state.auth && state.db) return true;
  firebaseInitPromise = initializeFirebase();
  await firebaseInitPromise;
  return Boolean(state.firebaseReady && state.auth && state.db);
}

function commentFailureMessage(error) {
  if (error?.code === "auth/operation-not-allowed" || error?.code === "auth/admin-restricted-operation") {
    return "Anonymous comments are not enabled for this Firebase project yet.";
  }
  if (error?.code === "permission-denied") {
    return "Firebase rejected this comment. Check Firestore rules, Anonymous Auth, and App Check for this site.";
  }
  return error?.message || "Could not post comment.";
}

async function signInWithGoogle() {
  if (!(await ensureFirebaseReady()) || !window.firebase?.auth) {
    showToast(state.firebaseError || "Sign-in is available on the hosted Firebase app.");
    return;
  }

  const provider = new window.firebase.auth.GoogleAuthProvider();
  try {
    if (state.user?.isAnonymous) {
      try {
        await state.user.linkWithPopup(provider);
      } catch (error) {
        if (error.code !== "auth/credential-already-in-use") throw error;
        await state.auth.signInWithPopup(provider);
      }
    } else {
      await state.auth.signInWithPopup(provider);
    }
    showToast("Signed in. Saved stories will sync across devices.");
  } catch (error) {
    showToast(error.message || "Google sign-in failed.");
  }
}

async function signOut() {
  if (!state.auth) return;
  await state.auth.signOut();
  showToast("Signed out. New saves will stay local on this device.");
}

async function ensureCommentIdentity() {
  if (!(await ensureFirebaseReady())) throw new Error(state.firebaseError || COMMENT_BACKEND_UNAVAILABLE_MESSAGE);
  if (state.auth.currentUser) return state.auth.currentUser;
  const credential = await state.auth.signInAnonymously();
  return credential.user;
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

  if (hasSyncedUser()) {
    authStatus.textContent = `Signed in as ${state.user.displayName || state.user.email || "Google user"}. Saved stories sync across devices.`;
    signInButton.hidden = true;
    signOutButton.hidden = false;
    return;
  }

  signInButton.hidden = false;
  signOutButton.hidden = true;
  authStatus.textContent = state.firebaseReady
    ? "Saves are local until you sign in with Google."
    : "Saves are local on this device. Sync and public comments need Firebase setup.";
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

function laneLabel(lane) {
  return {
    news: "News",
    papers: "Paper",
    startups: "Startup",
    deals: "Deal",
    signal: "Signal"
  }[lane] || "News";
}

function escapeSvgText(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function generatedVisualUrl(lane) {
  const safeLane = String(lane || "news").toLowerCase();
  const color = VISUAL_COLORS[safeLane] || VISUAL_COLORS.news;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d1117"/><stop offset="1" stop-color="${color}" stop-opacity="0.38"/></linearGradient></defs><rect width="900" height="1200" fill="url(#g)"/><circle cx="760" cy="180" r="260" fill="${color}" opacity="0.24"/><circle cx="110" cy="1040" r="310" fill="${color}" opacity="0.16"/><path d="M-40 790 C210 690 330 780 510 660 S810 450 980 540" fill="none" stroke="${color}" stroke-width="96" opacity="0.08"/><path d="M-70 925 C180 820 360 905 540 755 S790 620 980 690" fill="none" stroke="#f5f7fa" stroke-width="42" opacity="0.05"/><text x="72" y="144" fill="${color}" font-family="Arial, sans-serif" font-size="36" font-weight="700">${escapeSvgText(safeLane.toUpperCase())}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function storyVisualUrl(item) {
  if (item.imageUrl && !item.imageUrl.startsWith("/visual.svg")) return item.imageUrl;
  return generatedVisualUrl(item.lane);
}

function storySearchText(item) {
  return [
    item.title,
    item.summary,
    item.fullSummary,
    item.sourceName,
    item.lane,
    ...(Array.isArray(item.keyFacts) ? item.keyFacts : []),
    ...(Array.isArray(item.relatedSources) ? item.relatedSources : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function storyFilterType(item) {
  if (FILTER_CATEGORIES.has(item.filterCategory)) return item.filterCategory;

  const text = storySearchText(item);
  const headlineText = [
    item.title,
    ...(Array.isArray(item.keyFacts) ? item.keyFacts : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const titleText = String(item.title || "").toLowerCase();

  if (
    /\b(raised|raises|funding|funded|series [a-z]|seed round|venture|valuation|invested|investment|acquire|acquires|acquired|acquisition|merger|m&a|ipo|initial public offering|public listing|going public)\b/.test(text)
  ) {
    return "funding";
  }

  if (/\b(pushback|backlash|lawsuit|sued|sues|ban|blocked|protest|opposition|criticism|criticized|copyright|privacy|security risk|moratorium|strike|layoff|job loss|environmental|unauthorized|regulation|regulator)\b/.test(headlineText) || /\b(pushback|backlash|lawsuit|sued|sues|protest|opposition|moratorium|strike|unauthorized)\b/.test(text)) {
    return "pushback";
  }

  if (
    !/\bmodel context protocol\b/.test(text) &&
    (/\b(model release|released|launch(?:ed|es)?|ship(?:ped|s)?|unveil(?:ed|s)?|debut(?:ed|s)?|introduc(?:ed|es)|preview|open-weight|checkpoint|access)\b/.test(titleText) || /\b(open-weight|checkpoint|model release)\b/.test(text)) &&
    /\b(model|gpt|claude|gemini|llama|mistral|deepseek|qwen|grok|holo|mai-|weathermesh|diffusion|embedding|reasoning|audio|video|image)\b/.test(headlineText)
  ) {
    return "models";
  }

  if (item.lane === "papers" || /\b(arxiv|chatpaper|preprint|research paper|paper|benchmark|dataset|evaluation method|eval|leaderboard)\b/.test(text)) {
    return "papers";
  }

  return "general";
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
  if (state.sort === "recency") {
    return items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }

  return items.sort((a, b) => (b.importance || 0) - (a.importance || 0) || new Date(b.publishedAt) - new Date(a.publishedAt));
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

  return {
    hook: summary,
    change: fullSummary,
    facts,
    coverage,
    watch: `What to watch next: ${watch}`
  };
}

function renderComments(list, count, comments) {
  list.replaceChildren();
  count.textContent = `${comments.length} visible`;

  if (!comments.length) {
    const empty = document.createElement("p");
    empty.className = "comments-empty";
    empty.textContent = state.firebaseReady ? "No comments yet." : "Comments are unavailable here.";
    list.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  comments.forEach((comment) => {
    const node = document.createElement("article");
    node.className = "comment-item";
    const created = comment.createdAt?.toDate ? formatRelative(comment.createdAt.toDate()) : "";
    node.innerHTML = `<header><strong></strong><span></span></header><p></p>`;
    node.querySelector("strong").textContent = comment.displayName || "Anonymous";
    node.querySelector("span").textContent = `${comment.authorType === "google" ? "Google" : "Guest"}${created ? ` · ${created}` : ""}`;
    node.querySelector("p").textContent = comment.body || "";
    fragment.append(node);
  });
  list.append(fragment);
}

async function loadStoryComments(storyId, list, count) {
  if (!list || !count) return;
  if (!state.firebaseReady || !state.db) {
    renderComments(list, count, []);
    return;
  }

  list.textContent = "";
  count.textContent = "Loading";
  try {
    const snapshot = await storyCommentsRef(storyId)
      .where("status", "==", "active")
      .orderBy("createdAt", "desc")
      .limit(COMMENT_LIMIT)
      .get();
    const comments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    state.comments.set(storyId, comments);
    renderComments(list, count, comments);
  } catch {
    count.textContent = "Unavailable";
    const empty = document.createElement("p");
    empty.className = "comments-empty";
    empty.textContent = "Comments could not load.";
    list.replaceChildren(empty);
  }
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
  const details = fragment.querySelector("details");
  const facts = fragment.querySelector(".facts");
  const coverage = fragment.querySelector(".coverage");
  const watch = fragment.querySelector(".watch");
  const commentsList = fragment.querySelector(".comments-list");
  const commentsCount = fragment.querySelector(".comments-count");
  const save = fragment.querySelector(".save");
  const comment = fragment.querySelector(".comment");
  const share = fragment.querySelector(".share");
  const original = fragment.querySelector(".original");

  card.dataset.index = String(index);
  card.dataset.id = item.id;
  image.src = storyVisualUrl(item);
  image.alt = "";
  lane.textContent = laneLabel(item.lane);
  lane.classList.add(item.lane);
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
  comment.textContent = state.localCommented.has(item.id) ? "Commented" : "Comment";

  details.addEventListener("toggle", () => {
    if (details.open) loadStoryComments(item.id, commentsList, commentsCount);
  });

  save.addEventListener("click", () => toggleSave(item, save));

  comment.addEventListener("click", () => openComment(item.id));
  share.addEventListener("click", () => shareStory(item, share));

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
      state.opened.add(visible.target.dataset.id);
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

async function openComment(id) {
  state.selectedId = id;
  setCommentStatus("");
  if (!(await ensureFirebaseReady())) {
    showToast(state.firebaseError || COMMENT_BACKEND_UNAVAILABLE_MESSAGE);
    return;
  }
  commentName.value = localStorage.getItem("ai-brief-comment-name") || "";
  commentText.value = "";
  if (typeof commentDialog.showModal === "function") commentDialog.showModal();
  else commentDialog.setAttribute("open", "");
  commentText.focus();
}

function closeCommentDialog(reset = true) {
  if (reset) {
    commentText.value = "";
  }
  setCommentStatus("");
  commentDialog.close();
}

async function submitComment(event) {
  event.preventDefault();
  const storyId = state.selectedId;
  const body = commentText.value.trim();
  const name = commentName.value.trim().slice(0, DISPLAY_NAME_MAX_LENGTH) || "Anonymous";
  if (!storyId || !body) {
    showToast("Add a comment before posting.");
    return;
  }
  if (body.length > COMMENT_MAX_LENGTH) {
    showToast("Comments must be 1,000 characters or fewer.");
    return;
  }

  try {
    setCommentStatus("");
    submitCommentButtonState(true);
    const user = await ensureCommentIdentity();
    const authorType = user.isAnonymous ? "guest" : "google";
    const displayName = authorType === "google" ? user.displayName || name : name;
    await storyCommentsRef(storyId).add({
      storyId,
      body,
      displayName,
      authorType,
      authorUid: user.uid,
      status: "active",
      createdAt: firebaseServerTimestamp()
    });
    localStorage.setItem("ai-brief-comment-name", name === "Anonymous" ? "" : name);
    state.localCommented.add(storyId);
    persistLocalState();
    closeCommentDialog();
    showToast("Comment posted.");
    const card = storyDeck.querySelector(`[data-id="${CSS.escape(storyId)}"]`);
    card?.querySelector(".comment") && (card.querySelector(".comment").textContent = "Commented");
    if (card?.querySelector("details")?.open) {
      await loadStoryComments(storyId, card.querySelector(".comments-list"), card.querySelector(".comments-count"));
    }
  } catch (error) {
    setCommentStatus(commentFailureMessage(error));
  } finally {
    submitCommentButtonState(false);
  }
}

function submitCommentButtonState(disabled) {
  const button = document.querySelector("#submitComment");
  if (!button) return;
  button.disabled = disabled;
  button.textContent = disabled ? "Posting" : "Post";
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
    button.innerHTML = `<span>${laneLabel(item.lane)}</span><strong></strong>`;
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
  const commentedIds = [...state.localCommented];
  savedCount.textContent = state.saved.size;
  commentedCount.textContent = commentedIds.length;
  openedCount.textContent = state.opened.size;
  renderProfileList(savedList, [...state.saved]);
  renderProfileList(commentedList, commentedIds);
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
  const text = `${item.title}\n\n${item.summary}\n\n${item.url}`;
  if (navigator.share) {
    await navigator.share({ title: item.title, text, url: item.url });
    return;
  }
  await navigator.clipboard.writeText(text);
  button.textContent = "Copied";
  setTimeout(() => {
    button.textContent = "Share";
  }, 1200);
}

async function loadFeed(force = false) {
  refreshButton.disabled = true;
  try {
    const payload = await fetchFeed(force);
    state.items = payload.items && payload.items.length ? payload.items : fallbackItems;
    updateFilterCounts();
  } catch {
    state.items = fallbackItems;
    updateFilterCounts();
  } finally {
    refreshButton.disabled = false;
    render();
  }
}

async function fetchFeed(force) {
  const apiResponse = await fetch(`/api/feed${force ? "?refresh=1" : ""}`, { cache: "no-store" });
  if (apiResponse.ok && apiResponse.headers.get("content-type")?.includes("application/json")) {
    return apiResponse.json();
  }

  const staticResponse = await fetch(`/curated-feed.json?t=${Date.now()}`, { cache: "no-store" });
  if (staticResponse.ok) return staticResponse.json();

  throw new Error(`Feed returned ${apiResponse.status}; static feed returned ${staticResponse.status}`);
}

function setFilter(filter) {
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
  if (isEditingTarget(event.target) || commentDialog.open || profileDialog.open) return;
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
    toggleFilterMenu(false);
  });
});
refreshButton.addEventListener("click", () => loadFeed(true));
profileButton.addEventListener("click", openProfile);
signInButton?.addEventListener("click", signInWithGoogle);
signOutButton?.addEventListener("click", signOut);
document.querySelectorAll(".sort").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(".sort.active")?.classList.remove("active");
    button.classList.add("active");
    state.sort = button.dataset.sort;
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
cancelComment.addEventListener("click", () => closeCommentDialog());
commentForm.addEventListener("submit", submitComment);
commentDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeCommentDialog();
});
commentDialog.addEventListener("click", (event) => {
  if (event.target === commentDialog) closeCommentDialog();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

loadLocalState();
loadFeed();
firebaseInitPromise = initializeFirebase();
setInterval(() => loadFeed(), 15 * 60 * 1000);
