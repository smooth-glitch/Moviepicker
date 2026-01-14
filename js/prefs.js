// js/prefs.js
import { state } from "./state.js";
import { LSTHEME, saveJson, loadJson } from "./storage.js";

const PREFS_KEY = "cinecircle:prefs";

export function applyTheme(theme) {
    // Update DOM
    document.documentElement.setAttribute("data-theme", theme);

    // Persist theme in both storages
    state.prefs.theme = theme;
    saveJson(LSTHEME, theme);

    // Also keep the prefs blob up to date
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

    // Fallback to cupcake if nothing set
    const theme = state.prefs.theme || loadJson(LSTHEME, "cupcake");
    applyTheme(theme);
}

export function savePrefs() {
    try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs));
    } catch { }
}
