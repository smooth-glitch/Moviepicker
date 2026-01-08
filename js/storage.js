// js/storage.js
// SessionStorage JSON helpers (safe fallback), matching the original app.js behavior. [file:189]

export const LSPOOL = "mnpoolv1";
export const LSWATCHED = "mnpwatchedv1";
export const LSTHEME = "mnpthemev1";
export const LSFILTERS = "mnpfiltersv1";

// Use sessionStorage, but gracefully no-op if blocked (Safari private mode, strict settings, etc.) [file:189]
export const STORE = (() => {
    try {
        sessionStorage.setItem("mnptest", "1");
        sessionStorage.removeItem("mnptest");
        return sessionStorage;
    } catch {
        return null;
    }
})();

export function loadJson(key, fallback) {
    try {
        if (!STORE) return fallback;
        const raw = STORE.getItem(key);
        if (raw == null) return fallback;
        const v = JSON.parse(raw);
        return v ?? fallback;
    } catch {
        return fallback;
    }
}

export function saveJson(key, value) {
    try {
        if (!STORE) return;
        STORE.setItem(key, JSON.stringify(value));
    } catch {
        // ignore write errors to keep app usable [file:189]
    }
}
