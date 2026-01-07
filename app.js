(() => {
    // =========
    // Helpers
    // =========
    const $ = (id) => document.getElementById(id);
    const API = "https://api.themoviedb.org/3";
  
    const LS_POOL = "mnp_pool_v1";
    const LS_WATCHED = "mnp_watched_v1";
    const LS_THEME = "mnp_theme_v1";
    const LS_FILTERS = "mnp_filters_v1";
  
    const state = {
      imgBase: "https://image.tmdb.org/t/p/",
      posterSize: "w500",
      results: [],
      pool: loadJson(LS_POOL, []),
      watched: new Set(loadJson(LS_WATCHED, [])),
      filters: loadJson(LS_FILTERS, { excludeWatched: true, minRating: 6 }),
      currentDetails: null
    };
  
    function loadJson(key, fallback) {
      try {
        const v = JSON.parse(localStorage.getItem(key));
        return v ?? fallback;
      } catch {
        return fallback;
      }
    }
  
    function saveJson(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    }
  
    function toast(msg, type = "info") {
      let wrap = document.getElementById("toasts");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.id = "toasts";
        wrap.className = "toast toast-top toast-end z-[999]";
        document.body.appendChild(wrap);
      }
  
      const el = document.createElement("div");
      const klass =
        type === "success" ? "alert alert-success" :
        type === "error" ? "alert alert-error" :
        "alert alert-info";
  
      el.className = klass;
      el.innerHTML = `<span>${escapeHtml(msg)}</span>`;
      wrap.appendChild(el);
  
      setTimeout(() => {
        el.remove();
        if (!wrap.children.length) wrap.remove();
      }, 2200);
    }
  
    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
      }[c]));
    }
  
    function year(dateStr) {
      return (dateStr || "").slice(0, 4) || "—";
    }
  
    function posterUrl(path) {
      if (!path) return "";
      return `${state.imgBase}${state.posterSize}${path}`;
    }
  
    async function tmdb(path, params = {}) {
      const key = window.APP_CONFIG?.TMDB_API_KEY;
      if (!key) throw new Error("Missing TMDB key in config.js");
  
      const u = new URL(API + path);
      u.searchParams.set("api_key", key);
      u.searchParams.set("include_adult", "false");
  
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null || v === "") continue;
        u.searchParams.set(k, v);
      }
  
      const res = await fetch(u);
      if (!res.ok) throw new Error(`TMDB error: ${res.status}`);
      return res.json();
    }
  
    // ===================
    // TMDB configuration
    // ===================
    async function loadTmdbConfig() {
      // TMDB returns image paths; base url + size come from /configuration
      // (fallback remains the default image.tmdb.org URL).
      try {
        const cfg = await tmdb("/configuration");
        const images = cfg?.images;
        if (images?.secure_base_url) state.imgBase = images.secure_base_url;
        const sizes = images?.poster_sizes || [];
        state.posterSize = sizes.includes("w500") ? "w500" : (sizes[0] || "w500");
      } catch {
        // ok to ignore; fallback works for demo
      }
    }
  
    // =========
    // Rendering
    // =========
    function renderResults(list) {
      state.results = Array.isArray(list) ? list : [];
      const $results = $("results");
      const $empty = $("resultsEmpty");
  
      $results.innerHTML = "";
  
      if (!state.results.length) {
        $empty?.classList.remove("hidden");
        return;
      }
      $empty?.classList.add("hidden");
  
      for (const m of state.results) {
        const inPool = state.pool.some(x => x.id === m.id);
  
        const card = document.createElement("div");
        card.className = "card bg-base-100 shadow-md hover:shadow-xl transition-shadow";
  
        const img = posterUrl(m.poster_path)
          ? `<figure class="px-3 pt-3"><img class="rounded-xl aspect-[2/3] object-cover w-full" src="${posterUrl(m.poster_path)}" alt="${escapeHtml(m.title || "Poster")}" loading="lazy"></figure>`
          : `<div class="m-3 rounded-xl bg-base-200 aspect-[2/3] grid place-items-center text-base-content/60">No poster</div>`;
  
        card.innerHTML = `
          ${img}
          <div class="card-body p-4">
            <div class="flex items-start justify-between gap-2">
              <h3 class="card-title text-base leading-snug">${escapeHtml(m.title || "Untitled")}</h3>
              <span class="badge badge-primary badge-outline">${(m.vote_average ?? 0).toFixed(1)}</span>
            </div>
            <p class="text-sm text-base-content/60">${year(m.release_date)}</p>
  
            <div class="card-actions mt-2 justify-end">
              <button class="btn btn-sm btn-ghost" data-action="details" data-id="${m.id}">Details</button>
              <button class="btn btn-sm ${inPool ? "btn-disabled" : "btn-secondary"}" data-action="add" data-id="${m.id}">
                ${inPool ? "In pool" : "Add"}
              </button>
            </div>
          </div>
        `;
  
        card.addEventListener("click", (e) => {
          const btn = e.target.closest("button[data-action]");
          if (!btn) return;
          const id = Number(btn.dataset.id);
          const action = btn.dataset.action;
  
          if (action === "details") openDetails(id);
          if (action === "add") addToPoolById(id);
        });
  
        $results.appendChild(card);
      }
    }
  
    function renderPool() {
      const $pool = $("pool");
      const $empty = $("poolEmpty");
  
      $pool.innerHTML = "";
  
      const minRating = Number(state.filters.minRating ?? 0);
      const excludeWatched = !!state.filters.excludeWatched;
  
      const filtered = state.pool.filter(m => {
        const okRating = (Number(m.vote_average ?? 0) >= minRating);
        const okWatched = excludeWatched ? !state.watched.has(m.id) : true;
        return okRating && okWatched;
      });
  
      if (!filtered.length) {
        $empty.textContent = state.pool.length
          ? "No movies match your filters."
          : "Add movies from results to build your pool.";
        $empty.classList.remove("hidden");
      } else {
        $empty.classList.add("hidden");
      }
  
      for (const m of filtered) {
        const row = document.createElement("div");
        row.className = "flex items-center gap-3 p-2 rounded-xl bg-base-200/40 border border-base-300";
  
        const thumb = posterUrl(m.poster_path)
          ? `<img class="w-12 h-16 rounded-lg object-cover" src="${posterUrl(m.poster_path)}" alt="" loading="lazy">`
          : `<div class="w-12 h-16 rounded-lg bg-base-200 grid place-items-center text-xs text-base-content/60">—</div>`;
  
        const isWatched = state.watched.has(m.id);
  
        row.innerHTML = `
          ${thumb}
          <div class="flex-1 min-w-0">
            <div class="font-semibold truncate">${escapeHtml(m.title || "Untitled")}</div>
            <div class="text-xs text-base-content/60 flex gap-2 items-center">
              <span>${year(m.release_date)}</span>
              <span class="badge badge-outline badge-sm">${(m.vote_average ?? 0).toFixed(1)}</span>
              ${isWatched ? `<span class="badge badge-accent badge-sm">Watched</span>` : ``}
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
  
          const id = Number(btn.dataset.id);
          const action = btn.dataset.action;
  
          if (action === "details") openDetails(id);
          if (action === "toggleWatched") toggleWatched(id);
          if (action === "remove") removeFromPool(id);
        });
  
        $pool.appendChild(row);
      }
    }
  
    function syncControls() {
      $("excludeWatched").checked = !!state.filters.excludeWatched;
      $("minRating").value = String(state.filters.minRating ?? 6);
    }
  
    // ==============
    // Pool operations
    // ==============
    function pickFields(m) {
      return {
        id: m.id,
        title: m.title,
        poster_path: m.poster_path,
        vote_average: m.vote_average,
        release_date: m.release_date
      };
    }
  
    function addToPoolById(id) {
      const m = state.results.find(x => x.id === id);
      if (!m) return;
  
      if (state.pool.some(x => x.id === id)) {
        toast("Already in pool", "info");
        return;
      }
  
      state.pool.unshift(pickFields(m));
      saveJson(LS_POOL, state.pool);
      renderPool();
      renderResults(state.results);
      toast("Added to pool", "success");
    }
  
    function removeFromPool(id) {
      state.pool = state.pool.filter(x => x.id !== id);
      saveJson(LS_POOL, state.pool);
      renderPool();
      toast("Removed", "info");
    }
  
    function toggleWatched(id) {
      if (state.watched.has(id)) state.watched.delete(id);
      else state.watched.add(id);
  
      saveJson(LS_WATCHED, Array.from(state.watched));
      renderPool();
    }
  
    function clearPool() {
      state.pool = [];
      saveJson(LS_POOL, state.pool);
      renderPool();
      toast("Pool cleared", "info");
    }
  
    // =========
    // Picking logic
    // =========
    function getPickCandidates() {
      const minRating = Number(state.filters.minRating ?? 0);
      const excludeWatched = !!state.filters.excludeWatched;
  
      return state.pool.filter(m => {
        const okRating = (Number(m.vote_average ?? 0) >= minRating);
        const okWatched = excludeWatched ? !state.watched.has(m.id) : true;
        return okRating && okWatched;
      });
    }
  
    function pickForMe() {
      const candidates = getPickCandidates();
      if (!candidates.length) {
        toast("No movies match your filters.", "error");
        return;
      }
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      openDetails(chosen.id, { highlight: true });
    }
  
    // =========
    // Details modal
    // =========
    async function openDetails(id, opts = {}) {
      try {
        const data = await tmdb(`/movie/${id}`, { language: "en-US" });
        state.currentDetails = data;
  
        $("dlgTitle").textContent = data.title || "Untitled";
  
        const parts = [];
        parts.push(year(data.release_date));
        if (typeof data.runtime === "number" && data.runtime > 0) parts.push(`${data.runtime} min`);
        if (Array.isArray(data.genres) && data.genres.length) parts.push(data.genres.map(g => g.name).join(", "));
        parts.push(`★ ${(data.vote_average ?? 0).toFixed(1)}`);
  
        $("dlgMeta").textContent = parts.join(" • ");
  
        // Build a nicer body (poster + overview) without changing your HTML too much
        const box = $("dlgOverview");
        box.innerHTML = "";
  
        const wrap = document.createElement("div");
        wrap.className = "flex gap-4 flex-col sm:flex-row";
  
        const left = document.createElement("div");
        left.className = "sm:w-40";
  
        const p = posterUrl(data.poster_path);
        left.innerHTML = p
          ? `<img class="rounded-xl w-full aspect-[2/3] object-cover" src="${p}" alt="" loading="lazy">`
          : `<div class="rounded-xl bg-base-200 aspect-[2/3] grid place-items-center text-base-content/60">No poster</div>`;
  
        const right = document.createElement("div");
        right.className = "flex-1";
        const ov = document.createElement("p");
        ov.className = "leading-relaxed";
        ov.textContent = data.overview || "No overview available.";
        right.appendChild(ov);
  
        if (opts.highlight) {
          const hint = document.createElement("div");
          hint.className = "mt-3 badge badge-primary badge-outline";
          hint.textContent = "Tonight’s pick";
          right.appendChild(hint);
        }
  
        wrap.appendChild(left);
        wrap.appendChild(right);
        box.appendChild(wrap);
  
        $("dlg").showModal();
      } catch (e) {
        toast("Failed to load details.", "error");
      }
    }
  
    function markCurrentWatched() {
      const id = state.currentDetails?.id;
      if (!id) return;
      state.watched.add(id);
      saveJson(LS_WATCHED, Array.from(state.watched));
      renderPool();
      toast("Marked watched", "success");
    }
  
    // =========
    // Search/trending
    // =========
    async function loadTrending() {
      // TMDB offers a trending movies endpoint with time windows (e.g., day/week).
      const data = await tmdb("/trending/movie/day", { language: "en-US" });
      renderResults(data.results || []);
    }
  
    async function doSearch() {
      const q = $("q").value.trim();
      if (!q) {
        toast("Type something to search.", "info");
        return;
      }
      const data = await tmdb("/search/movie", { query: q, language: "en-US" });
      renderResults(data.results || []);
    }
  
    // =========
    // Theme
    // =========
    function applyTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      saveJson(LS_THEME, theme);
      $("themeToggle").checked = theme !== "synthwave";
    }
  
    function initTheme() {
      const saved = loadJson(LS_THEME, "synthwave");
      applyTheme(saved);
    }
  
    // =========
    // Boot
    // =========
    async function boot() {
      initTheme();
  
      syncControls();
      $("excludeWatched").addEventListener("change", () => {
        state.filters.excludeWatched = $("excludeWatched").checked;
        saveJson(LS_FILTERS, state.filters);
        renderPool();
      });
  
      $("minRating").addEventListener("input", () => {
        const v = Number($("minRating").value);
        state.filters.minRating = Number.isFinite(v) ? v : 0;
        saveJson(LS_FILTERS, state.filters);
        renderPool();
      });
  
      $("btnSearch").addEventListener("click", doSearch);
      $("btnTrending").addEventListener("click", loadTrending);
      $("btnPick").addEventListener("click", pickForMe);
      $("btnClearPool").addEventListener("click", clearPool);
      $("btnWatched").addEventListener("click", markCurrentWatched);
  
      $("q").addEventListener("keydown", (e) => {
        if (e.key === "Enter") doSearch();
      });
  
      $("themeToggle").addEventListener("change", () => {
        // toggle between two fun themes
        const theme = $("themeToggle").checked ? "cupcake" : "synthwave";
        applyTheme(theme);
      });
  
      renderPool();
  
      await loadTmdbConfig();
      await loadTrending();
    }
  
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  })();
  