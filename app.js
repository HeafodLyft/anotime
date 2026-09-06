// ============================================================
// Anime Ledger — app logic 
// ============================================================

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let unsubscribeSnapshot = null;
let entries = [];          // all entries for the signed-in user, live from Firestore
let activeTab = "all";     // 'all' | 'good' | 'bad' | 'watchlist'
let searchQuery = "";
let editingId = null;      // set when the modal is editing an existing entry
let modalListMode = "watched"; // 'watched' | 'watchlist'

// ---------------- DOM shortcuts ----------------
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
  return entriesCollection().add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
}

function deleteEntry(id) {
  return entriesCollection().doc(id).delete();
}

// ============================================================
// RENDERING
// ============================================================

function render() {
  const container = $("list-container");
  const emptyState = $("empty-state");

  const q = searchQuery.trim().toLowerCase();

  let visible = entries.filter((e) => {
    if (activeTab === "watchlist") return e.list === "watchlist";
    if (e.list === "watchlist") return false; // watchlist items only show in that tab
    if (activeTab === "good") return e.rating === "good";
    if (activeTab === "bad") return e.rating === "bad";
    return true; // 'all'
  });

  if (q) {
    visible = visible.filter((e) => {
      const title = (e.title || "").toLowerCase();
      const romaji = (e.romaji || "").toLowerCase();
      return title.includes(q) || romaji.includes(q);
    });
  }

  container.querySelectorAll(".entry-card").forEach((n) => n.remove());
  emptyState.hidden = visible.length > 0;

  visible.forEach((e) => container.appendChild(renderCard(e)));

  const watchlistCount = entries.filter((e) => e.list === "watchlist").length;
  $("watchlist-count").textContent = watchlistCount ? `(${watchlistCount})` : "";
}

const SEASON_LABELS = {
  single: "Only one season",
  caughtup: "Fully caught up",
  newseason: "New season out — want to watch",
  notreleased: "Sequel announced, not out yet",
};

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

  if (e.list !== "watchlist" && e.seasonStatus && e.seasonStatus !== "single") {
    const meta = document.createElement("div");
    meta.className = "entry-meta";
    meta.innerHTML = `<span class="season-flag">${SEASON_LABELS[e.seasonStatus] || ""}</span>`;
    main.appendChild(meta);
  }

  card.appendChild(main);

  const side = document.createElement("div");
  side.className = "entry-side";

  if (e.list === "watchlist") {
    const moveBtn = document.createElement("button");
    moveBtn.className = "btn btn-outline watchlist-move-btn";
    moveBtn.textContent = "Mark watched →";
    moveBtn.addEventListener("click", (evt) => {
      evt.stopPropagation();
      openModal(e, "watched");
    });
    side.appendChild(moveBtn);
  } else if (e.rating === "good") {
    const badge = document.createElement("span");
    badge.className = "stamp-badge stamp-good";
    badge.textContent = "GOOD";
    side.appendChild(badge);
  } else if (e.rating === "bad") {
    const badge = document.createElement("span");
    badge.className = "stamp-badge stamp-bad";
    badge.textContent = "BAD";
    side.appendChild(badge);
  }

  card.appendChild(side);
  card.addEventListener("click", () => openModal(e));
  return card;
}

// ============================================================
// TABS + SEARCH
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

function openModal(entry, forceListMode) {
  editingId = entry ? entry.id : null;
  $("modal-title").textContent = entry ? "Edit entry" : "Add an anime";
  deleteBtn.hidden = !entry;
  lookupStatus.hidden = true;

  const mode = forceListMode || (entry ? entry.list : "watched");
  setModalListMode(mode);

  $("field-title").value = entry ? entry.title || "" : "";
  $("field-romaji").value = entry ? entry.romaji || "" : "";
  $("field-notes").value = entry ? entry.notes || "" : "";
  $("field-season").value = entry ? entry.seasonStatus || "single" : "single";

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
}

$("open-add-modal").addEventListener("click", () => openModal(null));
$("modal-close").addEventListener("click", closeModal);
$("modal-cancel").addEventListener("click", closeModal);
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

deleteBtn.addEventListener("click", () => {
  if (!editingId) return;
  if (confirm("Delete this entry? This can't be undone.")) {
    deleteEntry(editingId).then(closeModal);
  }
});

entryForm.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!currentUser) {
    alert("You're not signed in yet — close this and sign in first.");
    return;
  }
  const title = $("field-title").value.trim();
  if (!title) return;

  const data = {
    title,
    romaji: $("field-romaji").value.trim(),
    notes: $("field-notes").value.trim(),
    list: modalListMode,
  };

  if (modalListMode === "watched") {
    const ratingInput = entryForm.querySelector('input[name="rating"]:checked');
    data.rating = ratingInput ? ratingInput.value : "";
    data.seasonStatus = $("field-season").value;
  } else {
    data.rating = "";
    data.seasonStatus = "";
  }

  if (entryForm.dataset.malId) data.malId = entryForm.dataset.malId;

  saveEntry(data)
    .then(closeModal)
    .catch((err) => alert("Couldn't save: " + err.message));
});

// ============================================================
// JIKAN (MyAnimeList) LOOKUP — romaji title + sequel check
// ============================================================

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
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1&sfw`
    );
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

    const relRes = await fetch(`https://api.jikan.moe/v4/anime/${hit.mal_id}/relations`);
    const relJson = await relRes.json();
    const sequelRel = (relJson.data || []).find((r) => r.relation === "Sequel");

    if (sequelRel && sequelRel.entry && sequelRel.entry[0]) {
      $("field-season").value = "newseason";
      lookupStatus.textContent = `Found: "${romaji}". MAL lists a sequel: "${sequelRel.entry[0].name}" — season status set accordingly.`;
    } else {
      lookupStatus.textContent = `Found: "${romaji}". No sequel listed on MAL right now.`;
    }
  } catch (err) {
    console.error(err);
    lookupStatus.textContent = "Lookup failed (MAL may be rate-limiting). You can type the rōmaji manually.";
  }
});
