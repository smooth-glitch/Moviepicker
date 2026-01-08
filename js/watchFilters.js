import { id } from "./dom.js";
import { state, ensureWatchFilterDefaults } from "./state.js";
import { LSFILTERS, saveJson } from "./storage.js";
import { tmdb } from "./tmdb.js";

let providerIdsByKey = { netflix: null, prime: null, hotstar: null };

export function updateOttDropdownLabel() {
    const countEl = id("ottDropdownCount");
    if (!countEl) return;
    const ott = state.filters?.ott || {};
    const n = Number(!!ott.netflix) + Number(!!ott.prime) + Number(!!ott.hotstar);
    countEl.textContent = n ? `${n} selected` : "";
}

export async function loadProviderIdsForRegion(region) {
    const data = await tmdb("watch/providers/movie", { watch_region: region, language: "en-US" });
    const list = Array.isArray(data?.results) ? data.results : [];

    const findId = (patterns) => {
        const hit = list.find((p) => patterns.some((rx) => rx.test(String(p.provider_name).toLowerCase())));
        return hit?.provider_id ?? null;
    };

    providerIdsByKey.netflix = findId([/netflix/]);
    providerIdsByKey.prime = findId([/prime video/, /amazon prime/]);
    providerIdsByKey.hotstar = findId([/hotstar/, /disney hotstar/, /disney\+ hotstar/]);
}

export function selectedProviderIds() {
    const ids = [];
    if (state.filters.ott?.netflix) ids.push(providerIdsByKey.netflix);
    if (state.filters.ott?.prime) ids.push(providerIdsByKey.prime);
    if (state.filters.ott?.hotstar) ids.push(providerIdsByKey.hotstar);
    return ids.filter((x) => Number.isFinite(x));
}

export async function initWatchFiltersUI({ onChange } = {}) {
    const cbNetflix = id("ottNetflix");
    const cbPrime = id("ottPrime");
    const cbHotstar = id("ottHotstar");
    if (!cbNetflix || !cbPrime || !cbHotstar) return;

    ensureWatchFilterDefaults();
    saveJson(LSFILTERS, state.filters);

    state.filters.region = state.filters.region || "IN";
    cbNetflix.checked = !!state.filters.ott?.netflix;
    cbPrime.checked = !!state.filters.ott?.prime;
    cbHotstar.checked = !!state.filters.ott?.hotstar;
    updateOttDropdownLabel();

    await loadProviderIdsForRegion(state.filters.region);

    const onOttChange = async () => {
        state.filters.ott = { netflix: cbNetflix.checked, prime: cbPrime.checked, hotstar: cbHotstar.checked };
        updateOttDropdownLabel();
        saveJson(LSFILTERS, state.filters);
        if (typeof onChange === "function") onChange();
    };

    cbNetflix.addEventListener("change", onOttChange);
    cbPrime.addEventListener("change", onOttChange);
    cbHotstar.addEventListener("change", onOttChange);
}

export async function filterResultsByOtt(kind, items) {
    const providerIds = selectedProviderIds();
    if (!providerIds.length) return items;

    const region = String(state.filters.region || "IN").toUpperCase();
    const batch = items.slice(0, 20);

    const checks = await Promise.allSettled(
        batch.map(async (it) => {
            const wp = await tmdb(`${kind}/${it.id}/watch/providers`, {});
            const entry = wp?.results?.[region];
            const flatrate = Array.isArray(entry?.flatrate) ? entry.flatrate : [];
            const ids = new Set(flatrate.map((p) => p.provider_id));
            const ok = providerIds.some((pid) => ids.has(pid));
            return ok ? it : null;
        })
    );

    return checks
        .map((r) => (r.status === "fulfilled" ? r.value : null))
        .filter(Boolean);
}

export function pickWatchCountry(wpResults) {
    const preferred = String(state.filters?.region || "").toUpperCase();
    if (preferred && wpResults?.[preferred]) return preferred;
    if (wpResults?.IN) return "IN";
    if (wpResults?.US) return "US";
    const keys = wpResults ? Object.keys(wpResults) : [];
    return keys[0] || null;
}

export function renderWatchProvidersSection(wpData) {
    const results = wpData?.results;
    if (!results || typeof results !== "object") return null;

    const country = pickWatchCountry(results);
    if (!country) return null;

    const entry = results[country];
    if (!entry) return null;

    const wrap = document.createElement("div");
    wrap.className = "wp-section";

    const title = document.createElement("div");
    title.className = "wp-title";
    title.textContent = `Where to watch (${country})`;
    wrap.appendChild(title);

    const badgeWrap = document.createElement("div");
    badgeWrap.className = "wp-badges";
    wrap.appendChild(badgeWrap);

    const buckets = [
        ["Stream", entry.flatrate],
        ["Rent", entry.rent],
        ["Buy", entry.buy],
        ["Free", entry.free],
        ["Ads", entry.ads],
    ];

    const byId = new Map();
    for (const [type, arr] of buckets) {
        if (!Array.isArray(arr)) continue;
        for (const p of arr) {
            const id = p?.provider_id;
            if (!id) continue;
            if (!byId.has(id)) byId.set(id, { provider: p, types: new Set() });
            byId.get(id).types.add(type);
        }
    }

    const providers = Array.from(byId.values());
    providers.sort((a, b) => {
        const aStream = a.types.has("Stream") ? 1 : 0;
        const bStream = b.types.has("Stream") ? 1 : 0;
        if (aStream !== bStream) return bStream - aStream;
        return String(a.provider.provider_name).localeCompare(String(b.provider.provider_name));
    });

    for (const item of providers.slice(0, 12)) {
        const p = item.provider;
        const types = Array.from(item.types);

        const pill = document.createElement("a");
        pill.className = "wp-pill";
        pill.href = entry.link;
        pill.target = "_blank";
        pill.rel = "noopener noreferrer";
        pill.title = `${p.provider_name} • ${types.join(", ")}`;

        const icon = document.createElement("img");
        icon.alt = p.provider_name;
        icon.loading = "lazy";
        icon.src = p.logo_path ? `https://image.tmdb.org/t/p/w45${p.logo_path}` : "";
        icon.onerror = () => (icon.style.display = "none");

        const text = document.createElement("span");
        text.textContent = p.provider_name;

        const tag = document.createElement("span");
        tag.className = "opacity-70";
        tag.style.fontSize = "0.7rem";
        tag.textContent = types.join(", ");

        pill.appendChild(icon);
        pill.appendChild(text);
        pill.appendChild(tag);
        badgeWrap.appendChild(pill);
    }

    return providers.length ? wrap : null;
}
