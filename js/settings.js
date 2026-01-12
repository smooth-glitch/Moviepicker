import { id } from "./dom.js";
import { loadJson, saveJson, LSTHEME, LSFILTERS } from "./storage.js";
import { normalizeFilters } from "./state.js";

const LSSETTINGS = "mnp_settings_v1";
// 1. Force default to match your HTML (synthwave)
const DEFAULT_SETTINGS = {
    theme: "synthwave",
    textScale: 1,
    reduceMotion: false,
    defaultExcludeWatched: true,
    defaultMinRating: 6
};

// --- Safe Helper ---
const safeId = (eid) => document.getElementById(eid);

// --- Core Logic ---
function applyTheme(theme) {
    // 2. COMMENTED OUT: Don't touch the HTML tag automatically
    // document.documentElement.setAttribute("data-theme", theme);

    saveJson(LSTHEME, theme);
    const toggle = safeId("themeToggle");
    if (toggle) toggle.checked = (theme === "synthwave");
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

// --- Boot & UI ---
async function boot() {
    const local = loadJson(LSSETTINGS, {});
    const s = { ...DEFAULT_SETTINGS, ...local };

    // 3. CRITICAL CHANGE: Stop applying visual changes on load
    // applyTheme(s.theme);       <-- THIS WAS CHANGING YOUR THEME
    // applyTextScale(s.textScale); <-- THIS WAS CHANGING YOUR FONT SIZE

    // Only init the modal listeners
    if (safeId('settingsModal')) {
        initModalLogic();
    }

    // Watch for Changes (Only apply when YOU click the toggle)
    const watchList = ["themeToggle", "setTextScale", "setDefaultExcludeWatched", "setDefaultMinRating"];
    watchList.forEach(key => {
        const el = safeId(key);
        if (el) {
            el.addEventListener("change", () => {
                const newSettings = readUI();
                saveJson(LSSETTINGS, newSettings);

                // Only apply if user explicitly changes it now
                if (key === "themeToggle") {
                    document.documentElement.setAttribute("data-theme", newSettings.theme);
                }

                applyDefaultFiltersToStorage(newSettings);
            });
        }
    });

    // Logout
    const logoutBtn = safeId('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (window.firebaseAuth) window.firebaseAuth.auth.signOut().then(() => window.location.reload());
        });
    }
}

function readUI() {
    return {
        theme: safeId("themeToggle")?.checked ? "synthwave" : "cupcake",
        textScale: Number(safeId("setTextScale")?.value || 1),
        defaultExcludeWatched: !!safeId("setDefaultExcludeWatched")?.checked,
        defaultMinRating: Number(safeId("setDefaultMinRating")?.value || 6),
    };
}

function initModalLogic() {
    const modal = safeId('settingsModal');
    const openBtn = safeId('btnMenuSettings');
    const closeBtn = safeId('closeSettingsBtn');
    const backdrop = safeId('settingsBackdrop');

    const open = () => {
        modal.classList.remove('hidden');
        populateProfile();
    };
    const close = () => modal.classList.add('hidden');

    if (openBtn) openBtn.addEventListener('click', open);
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (backdrop) backdrop.addEventListener('click', close);

    // Tabs logic
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active', 'bg-base-300'));
            document.querySelectorAll('.settings-content').forEach(c => c.classList.add('hidden'));
            btn.classList.add('active', 'bg-base-300');
            const target = safeId(`tab-${btn.dataset.tab}`);
            if (target) target.classList.remove('hidden');
        });
    });
}

function populateProfile() {
    const user = window.firebaseAuth?.auth?.currentUser;
    if (!user) return;
    const avatar = safeId('settingsAvatar');
    const name = safeId('settingsDisplayName');
    const uid = safeId('settingsUidDisplay');
    const nameInput = safeId('inputDisplayName');

    if (avatar) avatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}`;
    if (name) name.textContent = user.displayName || 'Anonymous';
    if (uid) uid.textContent = user.uid.substring(0, 4);
    if (nameInput) nameInput.value = user.displayName || '';
}

// Start
document.addEventListener('DOMContentLoaded', boot);
