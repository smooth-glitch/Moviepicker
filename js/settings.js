import { id } from "./dom.js";
import { loadJson, saveJson, LSTHEME, LSFILTERS } from "./storage.js";
import { normalizeFilters } from "./state.js";

const LSSETTINGS = "mnp_settings_v1";

const DEFAULT_SETTINGS = {
    theme: "synthwave",
    textScale: 1,
    reduceMotion: false,
    defaultExcludeWatched: true,
    defaultMinRating: 6,
};

function getAuthUser() {
    return window.firebaseAuth?.auth?.currentUser ?? null;
}

function getFs() {
    return window.firebaseStore ?? null;
}

function getUserDocRef(uid) {
    const fs = getFs();
    return fs.doc(fs.db, "users", uid);
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    saveJson(LSTHEME, theme);
}

function applyTextScale(scale) {
    document.documentElement.style.fontSize = `${Number(scale) * 100}%`;
}

function applyReduceMotion(on) {
    document.documentElement.toggleAttribute("data-reduce-motion", !!on);
}

function applyDefaultFiltersToStorage(settings) {
    const cur = loadJson(LSFILTERS, {});
    const next = normalizeFilters({
        ...cur,
        excludeWatched: !!settings.defaultExcludeWatched,
        minRating: Number(settings.defaultMinRating ?? 6),
    });
    saveJson(LSFILTERS, next);
    return next;
}

async function loadSettingsFromCloudOrLocal() {
    const local = loadJson(LSSETTINGS, {});
    const mergedLocal = { ...DEFAULT_SETTINGS, ...local };

    const fs = getFs();
    const user = getAuthUser();
    if (!fs || !user) return mergedLocal;

    const snap = await fs.getDoc(getUserDocRef(user.uid));
    const data = snap.exists() ? snap.data() : null;
    const cloud = data?.settings && typeof data.settings === "object" ? data.settings : {};

    return { ...DEFAULT_SETTINGS, ...mergedLocal, ...cloud };
}

async function saveSettingsEverywhere(s) {
    // Local cache (fast startup / offline)
    saveJson(LSSETTINGS, s);

    // Apply immediately on this page
    applyTheme(s.theme);
    applyTextScale(s.textScale);
    applyReduceMotion(s.reduceMotion);

    // Update local filters defaults
    const nextFilters = applyDefaultFiltersToStorage(s);

    // Signed-out → done
    const fs = getFs();
    const user = getAuthUser();
    if (!fs || !user) return;

    // IMPORTANT: also update Firestore filters so index.html picks it up when signed in
    const snap = await fs.getDoc(getUserDocRef(user.uid));
    const data = snap.exists() ? snap.data() : null;
    const curCloudFilters =
        data?.filters && typeof data.filters === "object" ? data.filters : {};

    const mergedFilters = normalizeFilters({
        ...curCloudFilters,
        excludeWatched: nextFilters.excludeWatched,
        minRating: nextFilters.minRating,
    });

    await fs.setDoc(
        getUserDocRef(user.uid),
        {
            settings: s,
            settingsUpdatedAt: fs.serverTimestamp(),
            filters: mergedFilters,
            updatedAt: fs.serverTimestamp(),
        },
        { merge: true }
    );
}

function syncUI(s) {
    id("setTheme").value = s.theme;
    id("setTextScale").value = String(s.textScale);
    id("setReduceMotion").checked = !!s.reduceMotion;
    id("setDefaultExcludeWatched").checked = !!s.defaultExcludeWatched;
    id("setDefaultMinRating").value = String(s.defaultMinRating ?? 6);
}

function readUI() {
    return {
        theme: id("setTheme").value,
        textScale: Number(id("setTextScale").value || 1),
        reduceMotion: !!id("setReduceMotion").checked,
        defaultExcludeWatched: !!id("setDefaultExcludeWatched").checked,
        defaultMinRating: Number(id("setDefaultMinRating").value || 6),
    };
}

async function boot() {
    const s = await loadSettingsFromCloudOrLocal();
    syncUI(s);

    // Apply on load (preview)
    await saveSettingsEverywhere(s);

    // Live preview when toggling/changing values
    ["setTheme", "setTextScale", "setReduceMotion", "setDefaultExcludeWatched", "setDefaultMinRating"]
        .forEach((key) => id(key)?.addEventListener("change", () => saveSettingsEverywhere(readUI())));

    id("btnSaveSettings")?.addEventListener("click", async () => {
        await saveSettingsEverywhere(readUI());
        window.location.href = "index.html";
    });

    id("btnResetSettings")?.addEventListener("click", async () => {
        syncUI(DEFAULT_SETTINGS);
        await saveSettingsEverywhere(DEFAULT_SETTINGS);
    });
}

boot();
