import { id } from "./dom.js";
import { state } from "./state.js";
import { escapeHtml } from "./utils.js";
import { openDetails } from "./details.js";
import { addToPoolById, removeFromPool, toggleWatched } from "./pool.js";
let showHiddenPoolItems = false;

export function toggleHiddenPoolItems() {
  showHiddenPoolItems = !showHiddenPoolItems;
  renderPool();
}

export function year(dateStr) {
  return dateStr ? String(dateStr).slice(0, 4) : "";
}

export function posterUrl(path) {
  if (!path) return "";
  return `${state.imgBase}${state.posterSize}${path}`;
}

export function setBusy(on) {
  state.busy = !!on;
  const ids = ["btnSearch", "btnTrending", "btnPick", "btnClearPool", "btnPrevPage", "btnNextPage"];
  for (const k of ids) {
    const b = id(k);
    if (b) b.disabled = state.busy;
  }
  renderPager();
}

export function renderPager() {
  const cur = id("pageCurrent");
  const tot = id("pageTotal");
  const prev = id("btnPrevPage");
  const next = id("btnNextPage");
  if (!cur || !tot || !prev || !next) return;

  cur.textContent = String(state.page);
  tot.textContent = String(state.totalPages);

  prev.disabled = state.page <= 1 || state.busy;
  next.disabled = state.page >= state.totalPages || state.busy;
}

export function renderResultsLoading() {
  const wrap = id("results");
  const empty = id("resultsEmpty");
  if (!wrap) return;

  wrap.innerHTML = "";
  empty?.classList.add("hidden");

  for (let i = 0; i < 8; i++) {
    const sk = document.createElement("div");
    sk.className = "card bg-base-100 shadow-md";
    sk.innerHTML = `
      <div class="m-3 rounded-xl bg-base-200 aspect-23 animate-pulse"></div>
      <div class="p-4 space-y-3">
        <div class="h-4 bg-base-200 rounded animate-pulse"></div>
        <div class="h-3 bg-base-200 rounded w-2/3 animate-pulse"></div>
        <div class="flex justify-end gap-2 pt-2">
          <div class="h-8 w-20 bg-base-200 rounded animate-pulse"></div>
          <div class="h-8 w-16 bg-base-200 rounded animate-pulse"></div>
        </div>
      </div>`;
    wrap.appendChild(sk);
  }
}

export function normalizeItem(item, kind) {
  if (!item) return null;
  if (kind === "tv") {
    return {
      ...item,
      title: item.name || item.original_name || "Untitled",
      release_date: item.first_air_date,
      poster_path: item.poster_path || null,
    };
  }
  return {
    ...item,
    title: item.title || item.original_title || "Untitled",
    release_date: item.release_date,
    poster_path: item.poster_path || null,
  };
}

export function renderResults(list) {
  state.results = Array.isArray(list) ? list : [];
  const wrap = id("results");
  const empty = id("resultsEmpty");
  if (!wrap) return;

  wrap.innerHTML = "";
  if (!state.results.length) {
    empty?.classList.remove("hidden");
    renderPager();
    return;
  }
  empty?.classList.add("hidden");

  for (const raw of state.results) {
    const m = normalizeItem(raw, state.filters.mediaType || "movie");
    if (!m) continue;

    const inPool = state.pool.some((x) => x.id === m.id);
    const p = posterUrl(m.poster_path);

    const card = document.createElement("div");
    card.className = "card bg-base-100 shadow-md hover:shadow-xl transition-shadow w-full";

    const poster = p
      ? `<figure class="px-3 pt-3 cursor-pointer" data-click="details">
           <img class="rounded-xl aspect-23 object-cover w-full" src="${p}" alt="${escapeHtml(m.title)} Poster" loading="lazy" />
         </figure>`
      : `<div class="m-3 rounded-xl bg-base-200 aspect-23 grid place-items-center text-base-content/60 cursor-pointer" data-click="details">No poster</div>`;

    card.innerHTML = `
      ${poster}
      <div class="card-body p-4 gap-2">
        <div class="flex items-start justify-between gap-3">
          <h3 class="card-title text-base leading-snug line-clamp-2 flex-1">${escapeHtml(m.title)}</h3>
          <span class="badge badge-primary badge-outline shrink-0">${Number(m.vote_average ?? 0).toFixed(1)}</span>
        </div>
        <p class="text-sm text-base-content/60">${escapeHtml(year(m.release_date))}</p>
        <div class="card-actions mt-3 justify-end gap-2">
          <button class="btn btn-sm btn-ghost" data-action="details" data-id="${m.id}">Details</button>
          <button class="btn btn-sm ${inPool ? "btn-disabled" : "btn-secondary"}" data-action="add" data-id="${m.id}">
            ${inPool ? "In pool" : "Add"}
          </button>
        </div>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest('[data-click="details"]')) {
        openDetails(m.id);
        return;
      }
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      const mid = Number(btn.dataset.id);
      if (action === "details") openDetails(mid);
      if (action === "add") {
        addToPoolById(mid);
        refreshResultsPoolButtons();
      }
      if (action === "remove") {
        removeFromPool(mid);   // updates state + storage + cloud
        renderPool();          // UI refresh lives here
        // if you added refreshResultsPoolButtons(), keep it here as well
        refreshResultsPoolButtons();
        return;
      }


    });

    // After rendering, add stagger animation
    const cards = document.querySelectorAll('#results .card');
    cards.forEach((card, index) => {
      card.style.animationDelay = `${index * 0.05}s`;
    });
    wrap.appendChild(card);
  }

  renderPager();
}

export function refreshResultsPoolButtons() {
  const wrap = id("results");
  if (!wrap) return;

  const idsInPool = new Set(state.pool.map((x) => x.id));

  wrap.querySelectorAll('button[data-action="add"]').forEach((btn) => {
    const mid = Number(btn.dataset.id);
    const inPool = idsInPool.has(mid);

    if (inPool) {
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-disabled");
      btn.textContent = "In pool";
    } else {
      btn.classList.remove("btn-disabled");
      btn.classList.add("btn-secondary");
      btn.textContent = "Add";
    }
  });
}

export function renderPool() {
  const btnHidden = id("btnToggleHiddenPool");
  const ex = id("excludeWatched");
  const exBtn = id("btnExcludeWatchedPool");
  const mr = id("minRatingPool");
  const mrBtn = id("btnMinRatingPool");

  const wrap = id("pool");
  const empty = id("poolEmpty");
  if (!wrap) return;

  const minRating = Number(state.filters.minRating ?? 0);
  const excludeWatched = !!state.filters.excludeWatched;

  // Keep the header checkbox in sync
  if (ex) ex.checked = excludeWatched;

  if (exBtn) {
    exBtn.classList.toggle("btn-primary", excludeWatched);
    exBtn.classList.toggle("btn-outline", !excludeWatched);
  }

  if (mr) mr.value = String(state.filters.minRating ?? 6);

  const isDefaultMin = Number(state.filters.minRating ?? 6) === 6;
  if (mrBtn) {
    mrBtn.classList.toggle("btn-outline", isDefaultMin);
    mrBtn.classList.toggle("btn-primary", !isDefaultMin);
  }

  // Split pool into visible vs hidden
  const hidden = [];
  const visible = [];

  for (const m of state.pool) {
    const okRating = Number(m.vote_average ?? 0) >= minRating;
    const okWatched = excludeWatched ? !state.watched.has(m.id) : true;
    (okRating && okWatched ? visible : hidden).push(m);
  }

  if (btnHidden) {
    const n = hidden.length;
    btnHidden.disabled = n === 0;
    btnHidden.textContent = showHiddenPoolItems ? `Hide hidden (${n})` : `Show hidden (${n})`;
    if (n === 0) showHiddenPoolItems = false;
  }

  const listToRender = showHiddenPoolItems ? [...visible, ...hidden] : visible;

  // Empty pool state
  if (!state.pool.length) {
    wrap.innerHTML = "";
    if (empty) {
      empty.innerHTML = `
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-base-200/60 mb-4" 
             style="animation: floatIcon 3s ease-in-out infinite;">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" class="text-primary opacity-70">
                <rect x="3" y="4" width="18" height="18" rx="3"/>
                <path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>
            </svg>
        </div>
        <h4 class="font-headline font-bold text-lg mb-2 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Your Pool is Empty
        </h4>
        <p class="text-sm text-base-content/70 max-w-xs mx-auto leading-relaxed mb-4">
            Start building your movie night selection by adding titles from the search results.
        </p>
        <div class="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-full text-xs font-semibold text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M5 12h14"/><path d="M12 5v14"/>
            </svg>
            Click "Add" on any movie →
        </div>
      `;
      empty.classList.remove("hidden");
    }
    return;
  }

  // No movies match filters
  if (!listToRender.length) {
    wrap.innerHTML = "";
    if (empty) {
      empty.innerHTML = `
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-base-200/60 mb-4" 
             style="animation: floatIcon 3s ease-in-out infinite;">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" stroke-width="2" class="text-warning opacity-70">
                <path d="M4 4h16l-4 7H8l-4-7Z"/>
                <path d="M10 11v9"/><path d="M14 11v9"/>
            </svg>
        </div>
        <h4 class="font-headline font-bold text-lg mb-2 text-warning">
            No Movies Match Your Filters
        </h4>
        <p class="text-sm text-base-content/70 max-w-xs mx-auto leading-relaxed mb-4">
            Try adjusting your minimum rating or toggle "Exclude Watched" to see more movies.
        </p>
        <button class="btn btn-sm btn-outline" onclick="document.getElementById('btnResetFilters')?.click()">
            Reset Filters
        </button>
      `;
      empty.classList.remove("hidden");
    }
    return;
  }

  empty?.classList.add("hidden");

  // Build all rows in a fragment (atomic operation)
  const fragment = document.createDocumentFragment();

  for (const m of listToRender) {
    const p = posterUrl(m.poster_path);
    const thumb = p
      ? `<img class="w-12 h-16 rounded-lg object-cover" src="${p}" alt="" loading="lazy" />`
      : `<div class="w-12 h-16 rounded-lg bg-base-200 grid place-items-center text-xs text-base-content/60">No</div>`;

    const isWatched = state.watched.has(m.id);
    const okRating = Number(m.vote_average ?? 0) >= minRating;
    const okWatched = excludeWatched ? !isWatched : true;
    const isHiddenByFilters = !(okRating && okWatched);

    const row = document.createElement("div");
    row.className = "flex items-center gap-3 p-2 rounded-xl bg-base-200/40 border border-base-300";
    row.style.opacity = isHiddenByFilters && showHiddenPoolItems ? "0.65" : "1";

    row.innerHTML = `
      ${thumb}
      <div class="flex-1 min-w-0">
        <div class="font-semibold truncate">${escapeHtml(m.title || "Untitled")}</div>
        <div class="text-xs text-base-content/60 flex gap-2 items-center flex-wrap">
          <span>${escapeHtml(year(m.release_date))}</span>
          <span class="badge badge-outline badge-sm">${Number(m.vote_average ?? 0).toFixed(1)}</span>
          ${isWatched ? `<span class="badge badge-accent badge-sm">Watched</span>` : ""}
          ${isHiddenByFilters && showHiddenPoolItems ? `<span class="badge badge-ghost badge-sm">Hidden</span>` : ""}
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-xs btn-ghost" data-action="details" data-id="${m.id}">Details</button>
        <button class="btn btn-xs ${isWatched ? "btn-ghost" : "btn-accent"}" data-action="toggleWatched" data-id="${m.id}">
          ${isWatched ? "Unwatch" : "Watched"}
        </button>
        <button class="btn btn-xs btn-error btn-outline" data-action="remove" data-id="${m.id}">Remove</button>
      </div>
    `;

    row.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (!btn) return;

      const mid = Number(btn.dataset.id);
      const action = btn.dataset.action;

      if (action === "details") {
        openDetails(mid, { mediaType: m.mediaType || "movie" });
        return;
      }
      if (action === "toggleWatched") {
        toggleWatched(mid);
        renderPool();
        return;
      }
      if (action === "remove") {
        removeFromPool(mid);
        renderPool();
        refreshResultsPoolButtons?.();
        return;
      }
    });

    fragment.appendChild(row);
  }

  // Clear and replace in ONE atomic operation
  wrap.innerHTML = "";
  wrap.appendChild(fragment);
}


