// js/prefs.js
import { state } from "./state.js";
import { LSTHEME, saveJson, loadJson } from "./storage.js";

const PREFS_KEY = "cinecircle:prefs";

export function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);

    // Keep in-memory prefs + both storages in sync
    state.prefs = state.prefs || {};
    state.prefs.theme = theme;
    saveJson(LSTHEME, theme);

    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
    } catch { }
}

export function loadPrefs() {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        if (raw) {
            const stored = JSON.parse(raw);
            state.prefs = { ...state.prefs, ...stored };
        }
    } catch { }

    const theme = state.prefs?.theme || loadJson(LSTHEME, "cupcake");
    applyTheme(theme);
}

export function savePrefs() {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
    } catch { }
}
