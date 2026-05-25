const STORAGE_KEY = "ai-brief-state-v2";
const INITIAL_RENDER_COUNT = 10;
const RENDER_BATCH = 8;

const state = {
  items: [],
  sort: "relevance",
  renderedCount: INITIAL_RENDER_COUNT,
  activeIndex: 0,
  saved: new Set(),
  opened: new Set(),
  notes: {},
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
    publishedAt: new Date(Date.now() - 4 * 36e5).toISOString(),
    importance: 79
  }
];

const storyDeck = document.querySelector("#storyDeck");
const storyTemplate = document.querySelector("#storyTemplate");
const refreshButton = document.querySelector("#refreshButton");
const storyPosition = document.querySelector("#storyPosition");
const commentDialog = document.querySelector("#commentDialog");
const commentText = document.querySelector("#commentText");
const closeComment = document.querySelector("#closeComment");
const profileButton = document.querySelector("#profileButton");
const profileDialog = document.querySelector("#profileDialog");
const closeProfile = document.querySelector("#closeProfile");
const savedCount = document.querySelector("#savedCount");
const commentedCount = document.querySelector("#commentedCount");
const openedCount = document.querySelector("#openedCount");
const savedList = document.querySelector("#savedList");
const commentedList = document.querySelector("#commentedList");

let observer;

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

function visibleItems() {
  return sortedItems().slice(0, state.renderedCount);
}

function sortedItems() {
  const items = [...state.items];
  if (state.sort === "recency") {
    return items.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  }

  return items.sort((a, b) => (b.importance || 0) - (a.importance || 0) || new Date(b.publishedAt) - new Date(a.publishedAt));
}

function buildStory(item) {
  const summary = item.summary || "A new AI update is worth tracking.";
  const lower = `${item.title} ${summary}`.toLowerCase();

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
    change: `What changed: ${summary}`,
    watch: `What to watch next: ${watch}`
  };
}

function setPosition() {
  const total = sortedItems().length || visibleItems().length;
  const current = Math.min(state.activeIndex + 1, total || 1);
  storyPosition.textContent = `Story ${current} of ${total || 1}`;
}

function render() {
  if (observer) observer.disconnect();
  storyDeck.replaceChildren();

  const items = visibleItems();
  if (!items.length) {
    const empty = document.createElement("section");
    empty.className = "empty-state";
    empty.textContent = "Loading AI stories...";
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
  const watch = fragment.querySelector(".watch");
  const save = fragment.querySelector(".save");
  const comment = fragment.querySelector(".comment");
  const share = fragment.querySelector(".share");
  const original = fragment.querySelector(".original");

  card.dataset.index = String(index);
  card.dataset.id = item.id;
  image.src = item.imageUrl || `/visual.svg?lane=${encodeURIComponent(item.lane)}&title=${encodeURIComponent(item.title)}`;
  image.alt = "";
  lane.textContent = laneLabel(item.lane);
  lane.classList.add(item.lane);
  source.textContent = item.sourceName;
  time.textContent = formatRelative(item.publishedAt);
  title.textContent = item.title;
  hook.textContent = story.hook;
  change.textContent = story.change;
  watch.textContent = story.watch;
  original.href = item.url;
  save.textContent = state.saved.has(item.id) ? "Saved" : "Save";
  comment.textContent = state.notes[item.id] ? "Commented" : "Comment";

  save.addEventListener("click", () => {
    if (state.saved.has(item.id)) state.saved.delete(item.id);
    else state.saved.add(item.id);
    save.textContent = state.saved.has(item.id) ? "Saved" : "Save";
    persistLocalState();
  });

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

function openComment(id) {
  state.selectedId = id;
  commentText.value = state.notes[id] || "";
  if (typeof commentDialog.showModal === "function") commentDialog.showModal();
  else commentDialog.setAttribute("open", "");
  commentText.focus();
}

function closeCommentDialog() {
  if (state.selectedId) {
    state.notes[state.selectedId] = commentText.value.trim();
    persistLocalState();
    render();
  }
  commentDialog.close();
}

function renderProfileList(container, ids) {
  container.replaceChildren();
  const items = ids
    .map((id) => state.items.find((item) => item.id === id))
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
      jumpToStory(item.id);
    });
    fragment.append(button);
  });
  container.append(fragment);
}

function openProfile() {
  const commentedIds = Object.keys(state.notes).filter((id) => state.notes[id]);
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
  if (index < 0) return;
  state.renderedCount = Math.max(state.renderedCount, index + 4);
  render();
  const target = storyDeck.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const response = await fetch(`/api/feed${force ? "?refresh=1" : ""}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);
    const payload = await response.json();
    state.items = payload.items && payload.items.length ? payload.items : fallbackItems;
  } catch {
    state.items = fallbackItems;
  } finally {
    refreshButton.disabled = false;
    render();
  }
}

refreshButton.addEventListener("click", () => loadFeed(true));
profileButton.addEventListener("click", openProfile);
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
closeComment.addEventListener("click", closeCommentDialog);
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
setInterval(() => loadFeed(), 15 * 60 * 1000);
