// ============================================================
// Anotime — app logic
// ============================================================

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const TRASH_RETENTION_DAYS = 30;
const RATING_ORDER = { verygood: 5, good: 4, neutral: 3, bad: 2, verybad: 1, "": 0 };
const RATING_LABELS = { verygood: "VERY GOOD", good: "GOOD", neutral: "NEUTRAL", bad: "BAD", verybad: "VERY BAD" };

let currentUser = null;
let unsubscribeSnapshot = null;
let entries = [];              // all entries for the signed-in user, live from Firestore
let activeTab = "all";         // 'all' | 'watchlist' | 'trash'
let searchQuery = "";
let sortMode = "newest";
let ratingFilter = "all";
let activeTagFilter = null;
let editingId = null;
let modalListMode = "watched"; // 'watched' | 'watchlist'

const $ = (id) => document.getElementById(id);

const authScreen = $("auth-screen");
const appEl = $("app");
const authForm = $("auth-form");
const authError = $("auth-error");

const modalBackdrop = $("modal-backdrop");
const entryForm = $("entry-form");
const watchedFields = $("watched-fields");
const lookupStatus = $("lookup-status");
const deleteBtn = $("delete-entry-btn");
const seasonDetailFields = $("season-detail-fields");
const lastSeasonCheckbox = $("field-last-season");

const statsModalBackdrop = $("stats-modal-backdrop");

// ============================================================
// AUTH
// ============================================================

auth.onAuthStateChanged((user) => {
  currentUser = user;
  if (user) {
    authScreen.hidden = true;
    appEl.hidden = false;
    $("user-email").textContent = user.email;
    subscribeToEntries();
  } else {
    appEl.hidden = true;
    authScreen.hidden = false;
    if (unsubscribeSnapshot) unsubscribeSnapshot();
    entries = [];
  }
});

authForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  authError.hidden = true;
  auth.signInWithEmailAndPassword(email, password).catch((err) => showAuthError(err));
});

$("auth-signup-btn").addEventListener("click", () => {
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  if (!email || !password) {
    showAuthError({ message: "Enter an email and password first, then click Create account." });
    return;
  }
  authError.hidden = true;
  auth.createUserWithEmailAndPassword(email, password).catch((err) => showAuthError(err));
});

$("sign-out-btn").addEventListener("click", () => auth.signOut());

function showAuthError(err) {
  authError.textContent = err.message || "Something went wrong. Try again.";
  authError.hidden = false;
}

// ============================================================
// FIRESTORE — live sync
// ============================================================

function entriesCollection() {
  return db.collection("users").doc(currentUser.uid).collection("anime");
}

function subscribeToEntries() {
  if (unsubscribeSnapshot) unsubscribeSnapshot();
  unsubscribeSnapshot = entriesCollection()
    .orderBy("createdAt", "desc")
    .onSnapshot(
      (snap) => {
        entries = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        purgeOldTrash();
        render();
      },
      (err) => {
        console.error(err);
        alert("Couldn't load your data. Check your Firestore setup / security rules (see README).");
      }
    );
}

function saveEntry(data) {
  if (editingId) {
    return entriesCollection().doc(editingId).update(data);
  }
  return entriesCollection().add({
    ...data,
    deleted: false,
    deletedAt: null,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function softDeleteEntry(id) {
  return entriesCollection().doc(id).update({
    deleted: true,
    deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
}

function restoreEntry(id) {
  return entriesCollection().doc(id).update({ deleted: false, deletedAt: null });
}

function hardDeleteEntry(id) {
  return entriesCollection().doc(id).delete();
}

function purgeOldTrash() {
  const now = Date.now();
  entries.forEach((e) => {
    if (e.deleted && e.deletedAt && e.deletedAt.toDate) {
      const ageDays = (now - e.deletedAt.toDate().getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > TRASH_RETENTION_DAYS) {
        hardDeleteEntry(e.id).catch(() => {});
      }
    }
  });
}

// ============================================================
// RENDERING
// ============================================================

function render() {
  const container = $("list-container");
  const emptyState = $("empty-state");
  const q = searchQuery.trim().toLowerCase();

  renderTagFilterRow();

  let visible;
  if (activeTab === "trash") {
    visible = entries.filter((e) => e.deleted);
    visible.sort((a, b) => tsMillis(b.deletedAt) - tsMillis(a.deletedAt));
  } else {
    visible = entries.filter((e) => {
      if (e.deleted) return false;
      if (activeTab === "watchlist") return e.list === "watchlist";
      return e.list !== "watchlist";
    });

    if (activeTab === "all" && ratingFilter !== "all") {
      visible = visible.filter((e) => (ratingFilter === "unrated" ? !e.rating : e.rating === ratingFilter));
    }

    if (activeTagFilter) {
      visible = visible.filter((e) => (e.tags || []).includes(activeTagFilter));
    }

    if (q) {
      visible = visible.filter((e) => {
        const title = (e.title || "").toLowerCase();
        const romaji = (e.romaji || "").toLowerCase();
        const tags = (e.tags || []).join(" ").toLowerCase();
        return title.includes(q) || romaji.includes(q) || tags.includes(q);
      });
    }

    visible = sortEntries(visible, sortMode);
  }

  container.querySelectorAll(".entry-card").forEach((n) => n.remove());
  emptyState.hidden = visible.length > 0;
  emptyState.textContent =
    activeTab === "trash" ? "Trash is empty." : "No entries yet — add your first one.";

  visible.forEach((e) => container.appendChild(renderCard(e)));

  const watchlistCount = entries.filter((e) => !e.deleted && e.list === "watchlist").length;
  $("watchlist-count").textContent = watchlistCount ? `(${watchlistCount})` : "";
  const trashCount = entries.filter((e) => e.deleted).length;
  $("trash-count").textContent = trashCount ? `(${trashCount})` : "";
}

function tsMillis(ts) {
  return ts && ts.toDate ? ts.toDate().getTime() : 0;
}

function sortEntries(list, mode) {
  const sorted = [...list];
  switch (mode) {
    case "oldest":
      sorted.sort((a, b) => tsMillis(a.createdAt) - tsMillis(b.createdAt));
      break;
    case "title-asc":
      sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
      break;
    case "title-desc":
      sorted.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
      break;
    case "rating-desc":
      sorted.sort((a, b) => (RATING_ORDER[b.rating || ""] || 0) - (RATING_ORDER[a.rating || ""] || 0));
      break;
    case "rating-asc":
      sorted.sort((a, b) => (RATING_ORDER[a.rating || ""] || 0) - (RATING_ORDER[b.rating || ""] || 0));
      break;
    default: // newest
      sorted.sort((a, b) => tsMillis(b.createdAt) - tsMillis(a.createdAt));
  }
  return sorted;
}

function renderTagFilterRow() {
  const row = $("tag-filter-row");
  if (activeTab === "trash") {
    row.hidden = true;
    return;
  }
  const allTags = new Set();
  entries.forEach((e) => {
    if (!e.deleted) (e.tags || []).forEach((t) => allTags.add(t));
  });

  row.hidden = allTags.size === 0;
  row.innerHTML = "";
  [...allTags].sort().forEach((tag) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-chip" + (activeTagFilter === tag ? " active" : "");
    chip.textContent = tag;
    chip.addEventListener("click", () => {
      activeTagFilter = activeTagFilter === tag ? null : tag;
      render();
    });
    row.appendChild(chip);
  });
}

function seasonBadgeInfo(e) {
  if (e.isLastSeason) return null;
  if (e.seasonStatus === "out") {
    const dateStr = e.seasonDate ? ` (since ${e.seasonDate})` : "";
    return { text: `🔔 New season out${dateStr}`, cls: "season-flag-out" };
  }
  if (e.seasonDate) {
    return { text: `📅 Next season: ${e.seasonDate}`, cls: "season-flag-upcoming" };
  }
  return null;
}

function renderCard(e) {
  const card = document.createElement("div");
  card.className = "entry-card" + (e.rating ? ` rating-${e.rating}` : "");

  const main = document.createElement("div");
  main.className = "entry-main";

  const title = document.createElement("div");
  title.className = "entry-title";
  title.textContent = e.title;
  main.appendChild(title);

  if (e.romaji) {
    const romaji = document.createElement("div");
    romaji.className = "entry-romaji";
    romaji.textContent = e.romaji;
    main.appendChild(romaji);
  }

  if (e.tags && e.tags.length) {
    const tagsRow = document.createElement("div");
    tagsRow.className = "entry-tags";
    e.tags.forEach((t) => {
      const chip = document.createElement("span");
      chip.className = "entry-tag-chip";
      chip.textContent = t;
      tagsRow.appendChild(chip);
    });
    main.appendChild(tagsRow);
  }

  if (activeTab === "trash") {
    const meta = document.createElement("div");
    meta.className = "entry-meta";
    const days = e.deletedAt && e.deletedAt.toDate
      ? Math.max(0, TRASH_RETENTION_DAYS - Math.floor((Date.now() - e.deletedAt.toDate().getTime()) / 86400000))
      : TRASH_RETENTION_DAYS;
    meta.textContent = `Deleted — auto-removed in ${days} day${days === 1 ? "" : "s"}`;
    main.appendChild(meta);
  } else if (e.list !== "watchlist") {
    const badgeInfo = seasonBadgeInfo(e);
    if (badgeInfo) {
      const meta = document.createElement("div");
      meta.className = "entry-meta";
      meta.innerHTML = `<span class="season-flag ${badgeInfo.cls}">${badgeInfo.text}</span>`;
      main.appendChild(meta);
    }
  }

  card.appendChild(main);

  const side = document.createElement("div");
  side.className = "entry-side";

  if (activeTab === "trash") {
    const restoreBtn = document.createElement("button");
    restoreBtn.className = "btn btn-outline watchlist-move-btn";
    restoreBtn.textContent = "Restore";
    restoreBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      restoreEntry(e.id).catch((err) => alert("Couldn't restore: " + err.message));
    });
    side.appendChild(restoreBtn);
  } else if (e.list === "watchlist") {
    const moveBtn = document.createElement("button");
    moveBtn.className = "btn btn-outline watchlist-move-btn";
    moveBtn.textContent = "Mark watched →";
    moveBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      openModal(e, "watched");
    });
    side.appendChild(moveBtn);
  } else if (e.rating) {
    const badge = document.createElement("span");
    badge.className = `stamp-badge stamp-${e.rating}`;
    badge.textContent = RATING_LABELS[e.rating] || "";
    side.appendChild(badge);
  }

  card.appendChild(side);
  if (activeTab !== "trash") {
    card.addEventListener("click", () => openModal(e));
  } else {
    card.style.cursor = "default";
  }
  return card;
}

// ============================================================
// TABS + SEARCH + SORT + FILTER
// ============================================================

$("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  btn.classList.add("active");
  activeTab = btn.dataset.tab;
  render();
});

$("search-input").addEventListener("input", (e) => {
  searchQuery = e.target.value;
  render();
});

$("sort-select").addEventListener("change", (e) => {
  sortMode = e.target.value;
  render();
});

$("rating-filter-select").addEventListener("change", (e) => {
  ratingFilter = e.target.value;
  render();
});

// ============================================================
// MODAL
// ============================================================

function setModalListMode(mode) {
  modalListMode = mode;
  document.querySelectorAll(".list-toggle-btn").forEach((b) => b.classList.toggle("active", b.dataset.list === mode));
  watchedFields.hidden = mode === "watchlist";
}

document.querySelectorAll(".list-toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => setModalListMode(btn.dataset.list));
});

lastSeasonCheckbox.addEventListener("change", () => {
  seasonDetailFields.hidden = lastSeasonCheckbox.checked;
});

$("clear-date-btn").addEventListener("click", () => {
  $("field-season-date").value = "";
});

function openModal(entry, forceListMode) {
  editingId = entry ? entry.id : null;
  $("modal-title").textContent = entry ? "Edit entry" : "Add an anime";
  deleteBtn.hidden = !entry;
  lookupStatus.hidden = true;

  const mode = forceListMode || (entry ? entry.list : "watched");
  setModalListMode(mode);

  $("field-title").value = entry ? entry.title || "" : "";
  $("field-romaji").value = entry ? entry.romaji || "" : "";
  $("field-tags").value = entry && entry.tags ? entry.tags.join(", ") : "";
  $("field-notes").value = entry ? entry.notes || "" : "";

  lastSeasonCheckbox.checked = entry ? !!entry.isLastSeason : false;
  seasonDetailFields.hidden = lastSeasonCheckbox.checked;
  $("field-season-status").value = entry ? entry.seasonStatus || "caughtup" : "caughtup";
  $("field-season-date").value = entry ? entry.seasonDate || "" : "";

  const ratingValue = entry ? entry.rating || "" : "";
  entryForm.querySelectorAll('input[name="rating"]').forEach((r) => (r.checked = r.value === ratingValue));

  entryForm.dataset.malId = entry && entry.malId ? entry.malId : "";
  modalBackdrop.hidden = false;
  $("field-title").focus();
}

function closeModal() {
  modalBackdrop.hidden = true;
  editingId = null;
  entryForm.reset();
  seasonDetailFields.hidden = false;
}

$("open-add-modal").addEventListener("click", () => openModal(null));
$("modal-close").addEventListener("click", closeModal);
$("modal-cancel").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

deleteBtn.addEventListener("click", () => {
  if (!editingId) return;
  softDeleteEntry(editingId).then(closeModal).catch((err) => alert("Couldn't delete: " + err.message));
});

entryForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!currentUser) {
    alert("You're not signed in yet — close this and sign in first.");
    return;
  }
  const title = $("field-title").value.trim();
  if (!title) return;

  const tags = $("field-tags").value
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const data = {
    title,
    romaji: $("field-romaji").value.trim(),
    notes: $("field-notes").value.trim(),
    tags,
    list: modalListMode,
  };

  if (modalListMode === "watched") {
    const ratingInput = entryForm.querySelector('input[name="rating"]:checked');
    data.rating = ratingInput ? ratingInput.value : "";
    data.isLastSeason = lastSeasonCheckbox.checked;
    if (lastSeasonCheckbox.checked) {
      data.seasonStatus = "";
      data.seasonDate = "";
    } else {
      data.seasonStatus = $("field-season-status").value;
      data.seasonDate = $("field-season-date").value;
    }
  } else {
    data.rating = "";
    data.isLastSeason = false;
    data.seasonStatus = "";
    data.seasonDate = "";
  }

  if (entryForm.dataset.malId) data.malId = entryForm.dataset.malId;

  saveEntry(data)
    .then(closeModal)
    .catch((err) => alert("Couldn't save: " + err.message));
});

// ============================================================
// JIKAN (MyAnimeList) LOOKUP — romaji title + sequel check
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

$("lookup-btn").addEventListener("click", async () => {
  const title = $("field-title").value.trim();
  if (!title) {
    lookupStatus.hidden = false;
    lookupStatus.textContent = "Type an English title first.";
    return;
  }

  lookupStatus.hidden = false;
  lookupStatus.textContent = "Looking up on MyAnimeList…";

  try {
    const searchRes = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1&sfw=true`
    );

    if (!searchRes.ok) {
      if (searchRes.status === 429) {
        lookupStatus.textContent = "MyAnimeList is rate-limiting lookups right now — wait a few seconds and try again, or type it manually.";
      } else {
        lookupStatus.textContent = `Lookup failed (HTTP ${searchRes.status}). You can type the rōmaji manually.`;
      }
      return;
    }

    const searchJson = await searchRes.json();
    const hit = searchJson.data && searchJson.data[0];

    if (!hit) {
      lookupStatus.textContent = "No match found on MyAnimeList — you can type the rōmaji manually.";
      return;
    }

    const defaultTitle = (hit.titles || []).find((t) => t.type === "Default");
    const romaji = defaultTitle ? defaultTitle.title : hit.title;
    $("field-romaji").value = romaji || "";
    entryForm.dataset.malId = hit.mal_id;

    lookupStatus.textContent = `Found: "${romaji}". Checking for a sequel…`;

    // Small delay to stay comfortably under Jikan's rate limit (3 req/sec).
    await sleep(400);

    const relRes = await fetch(`https://api.jikan.moe/v4/anime/${hit.mal_id}/relations`);
    if (!relRes.ok) {
      lookupStatus.textContent = `Found: "${romaji}". Couldn't check sequel status (HTTP ${relRes.status}).`;
      return;
    }
    const relJson = await relRes.json();
    const sequelRel = (relJson.data || []).find((r) => r.relation === "Sequel");

    if (sequelRel && sequelRel.entry && sequelRel.entry[0]) {
      lastSeasonCheckbox.checked = false;
      seasonDetailFields.hidden = false;
      $("field-season-status").value = "out";
      lookupStatus.textContent = `Found: "${romaji}". MAL lists a sequel: "${sequelRel.entry[0].name}" — season status set accordingly.`;
    } else {
      lookupStatus.textContent = `Found: "${romaji}". No sequel listed on MAL right now.`;
    }
  } catch (err) {
    console.error(err);
    lookupStatus.textContent = "Lookup failed — this can happen if your browser or network blocks the request. You can type the rōmaji manually.";
  }
});

// ============================================================
// STATS
// ============================================================

$("open-stats-modal").addEventListener("click", () => {
  renderStats();
  statsModalBackdrop.hidden = false;
});
$("stats-close").addEventListener("click", () => (statsModalBackdrop.hidden = true));
statsModalBackdrop.addEventListener("click", (e) => {
  if (e.target === statsModalBackdrop) statsModalBackdrop.hidden = true;
});

function renderStats() {
  const active = entries.filter((e) => !e.deleted);
  const watched = active.filter((e) => e.list !== "watchlist");
  const watchlist = active.filter((e) => e.list === "watchlist");

  const ratingCounts = { verygood: 0, good: 0, neutral: 0, bad: 0, verybad: 0, unrated: 0 };
  watched.forEach((e) => {
    if (e.rating && ratingCounts.hasOwnProperty(e.rating)) ratingCounts[e.rating]++;
    else ratingCounts.unrated++;
  });

  const monthCounts = {};
  active.forEach((e) => {
    if (e.createdAt && e.createdAt.toDate) {
      const d = e.createdAt.toDate();
      const key = `${d.toLocaleString("default", { month: "long" })} ${d.getFullYear()}`;
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    }
  });
  let topMonth = null;
  Object.entries(monthCounts).forEach(([month, count]) => {
    if (!topMonth || count > topMonth.count) topMonth = { month, count };
  });

  const tagCounts = {};
  active.forEach((e) => (e.tags || []).forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1)));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const el = $("stats-content");
  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-box"><div class="stat-num">${active.length}</div><div class="stat-label">Total entries</div></div>
      <div class="stat-box"><div class="stat-num">${watched.length}</div><div class="stat-label">Watched</div></div>
      <div class="stat-box"><div class="stat-num">${watchlist.length}</div><div class="stat-label">On watchlist</div></div>
    </div>

    <h3>Ratings breakdown</h3>
    <div class="stats-bars">
      ${["verygood", "good", "neutral", "bad", "verybad", "unrated"]
        .map((k) => {
          const label = k === "unrated" ? "Unrated" : RATING_LABELS[k];
          const count = ratingCounts[k];
          const max = Math.max(1, ...Object.values(ratingCounts));
          const pct = Math.round((count / max) * 100);
          return `<div class="stats-bar-row">
            <span class="stats-bar-label">${label}</span>
            <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${pct}%"></div></div>
            <span class="stats-bar-count">${count}</span>
          </div>`;
        })
        .join("")}
    </div>

    ${topMonth ? `<p class="stats-line">Most active month: <strong>${topMonth.month}</strong> (${topMonth.count} added)</p>` : ""}

    ${topTags.length ? `<h3>Top tags</h3><div class="tag-filter-row" style="margin-bottom:0">${topTags
      .map(([t, c]) => `<span class="tag-chip">${t} · ${c}</span>`)
      .join("")}</div>` : ""}
  `;
}

// ============================================================
// EXPORT
// ============================================================

$("export-btn").addEventListener("click", () => {
  const active = entries.filter((e) => !e.deleted).map((e) => {
    const { id, deleted, deletedAt, ...rest } = e;
    return {
      ...rest,
      createdAt: e.createdAt && e.createdAt.toDate ? e.createdAt.toDate().toISOString() : null,
    };
  });

  const blob = new Blob([JSON.stringify(active, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `anotime-export-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
