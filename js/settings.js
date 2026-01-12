import { id } from "./dom.js";
import { loadJson, saveJson, LSTHEME, LSFILTERS } from "./storage.js";
import { normalizeFilters } from "./state.js";

const LSSETTINGS = "mnp_settings_v1";
const DEFAULT_SETTINGS = {
    theme: "synthwave",
    defaultExcludeWatched: true,
    defaultMinRating: 6,
};

// ========== FIREBASE HELPERS ==========
function getAuthUser() {
    return window.firebaseAuth?.auth?.currentUser ?? null;
}

function getFs() {
    return window.firebaseStore ?? null;
}

function getUserDocRef(uid) {
    const fs = getFs();
    if (!fs) return null;
    return fs.doc(fs.db, "users", uid);
}

// ========== THEME MANAGEMENT ==========
export function setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    saveJson(LSTHEME, theme);
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

// ========== CLOUD SYNC (FIRESTORE) ==========
async function loadSettingsForUser() {
    const fs = getFs();
    const user = getAuthUser();
    const local = loadJson(LSSETTINGS, {});
    const base = { ...DEFAULT_SETTINGS, ...local };

    if (!fs || !user) return base;

    try {
        const userRef = getUserDocRef(user.uid);
        if (!userRef) return base;

        const snap = await fs.getDoc(userRef);
        const data = snap.exists() ? snap.data() : null;
        const cloud = data?.settings && typeof data.settings === "object" ? data.settings : {};
        const merged = { ...base, ...cloud };

        setTheme(merged.theme);
        applyDefaultFiltersToStorage(merged);
        return merged;
    } catch (e) {
        console.warn("Cloud load failed:", e);
        return base;
    }
}

async function saveSettingsToCloud(settings) {
    const fs = getFs();
    const user = getAuthUser();

    saveJson(LSSETTINGS, settings);

    if (!fs || !user) return;

    try {
        const userRef = getUserDocRef(user.uid);
        if (!userRef) return;

        const snap = await fs.getDoc(userRef);
        const data = snap.exists() ? snap.data() : null;
        const curCloudFilters = data?.filters && typeof data.filters === "object" ? data.filters : {};

        const mergedFilters = normalizeFilters({
            ...curCloudFilters,
            excludeWatched: !!settings.defaultExcludeWatched,
            minRating: Number(settings.defaultMinRating ?? 6),
        });

        await fs.setDoc(
            userRef,
            {
                settings,
                settingsUpdatedAt: fs.serverTimestamp(),
                filters: mergedFilters,
                updatedAt: fs.serverTimestamp(),
            },
            { merge: true }
        );
    } catch (e) {
        console.warn("Cloud save failed:", e);
    }
}

// ========== UI FUNCTIONS ==========
function readUI() {
    return {
        theme: document.getElementById("themeToggle")?.checked ? "synthwave" : "cupcake",
        defaultExcludeWatched: !!document.getElementById("setDefaultExcludeWatched")?.checked,
        defaultMinRating: Number(document.getElementById("setDefaultMinRating")?.value || 6),
    };
}

function syncUI(s) {
    const themeToggle = document.getElementById("themeToggle");
    const excludeWatched = document.getElementById("setDefaultExcludeWatched");
    const minRating = document.getElementById("setDefaultMinRating");

    if (themeToggle) themeToggle.checked = s.theme === "synthwave";
    if (excludeWatched) excludeWatched.checked = !!s.defaultExcludeWatched;
    if (minRating) minRating.value = String(s.defaultMinRating ?? 6);
}

// ========== MODAL FUNCTIONS ==========
function initModalLogic() {
    const modal = document.getElementById("settingsModal");
    if (!modal) return;

    const openBtn = document.getElementById("btnMenuSettings");
    const closeBtn = document.getElementById("closeSettingsBtn");
    const backdrop = document.getElementById("settingsBackdrop");

    const open = () => {
        modal.classList.remove("hidden");
        populateProfileData();
    };

    const close = () => modal.classList.add("hidden");

    if (openBtn) openBtn.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (backdrop) backdrop.addEventListener("click", close);

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !modal.classList.contains("hidden")) {
            close();
        }
    });

    // Tab switching
    document.querySelectorAll(".settings-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".settings-tab-btn").forEach((b) => {
                b.classList.remove("active", "bg-base-300");
            });
            document.querySelectorAll(".settings-content").forEach((c) => {
                c.classList.add("hidden");
            });
            btn.classList.add("active", "bg-base-300");
            const target = document.getElementById(`tab-${btn.dataset.tab}`);
            if (target) target.classList.remove("hidden");
        });
    });
}

function populateProfileData() {
    const user = getAuthUser();
    if (!user) return;

    const avatar = document.getElementById("settingsAvatar");
    const name = document.getElementById("settingsDisplayName");
    const uid = document.getElementById("settingsUidDisplay");
    const nameInput = document.getElementById("inputDisplayName");
    const uidInput = document.getElementById("inputUid");

    if (avatar) {
        avatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "User")}`;
    }
    if (name) name.textContent = user.displayName || "Anonymous";
    if (uid) uid.textContent = user.uid;
    if (nameInput) nameInput.value = user.displayName || "";
    if (uidInput) uidInput.value = user.uid;
}

// ========== PROFILE PICTURE UPLOAD (BASE64 IN FIRESTORE) ==========
async function uploadProfilePicture(file) {
    const fs = getFs();
    const user = getAuthUser();

    if (!fs || !user) {
        alert("Not signed in or Firebase not ready");
        return;
    }

    if (!file.type.startsWith("image/")) {
        alert("Please select a valid image file");
        return;
    }

    if (file.size > 1 * 1024 * 1024) {
        alert("Image must be smaller than 1MB");
        return;
    }

    try {
        const statusDiv = document.getElementById("uploadStatus");
        const statusText = document.getElementById("uploadStatusText");

        if (statusDiv) {
            statusDiv.classList.remove("hidden", "alert-error");
            statusDiv.classList.add("alert-info");
            statusText.textContent = "Processing image...";
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const base64Data = e.target.result;

                if (statusText) statusText.textContent = "Saving to database...";

                const userRef = getUserDocRef(user.uid);
                if (!userRef) {
                    throw new Error("Could not create user reference");
                }

                // Save Base64 to Firestore
                await fs.setDoc(
                    userRef,
                    {
                        photoURL: base64Data,
                        photoUpdatedAt: fs.serverTimestamp(),
                        updatedAt: fs.serverTimestamp(),
                    },
                    { merge: true }
                );

                // Update Firebase Auth profile - FIX HERE
                await window.firebaseAuth.updateProfile(user, { photoURL: base64Data });

                // Update UI immediately
                const avatarEl = document.getElementById("settingsAvatar");
                if (avatarEl) {
                    avatarEl.src = base64Data;
                }

                // Show success
                if (statusDiv) {
                    statusDiv.classList.remove("alert-info");
                    statusDiv.classList.add("alert-success");
                    statusText.textContent = "✓ Profile picture updated!";
                    setTimeout(() => statusDiv.classList.add("hidden"), 3000);
                }

            } catch (error) {
                console.error("Save failed:", error);
                if (statusDiv) {
                    statusDiv.classList.remove("alert-info");
                    statusDiv.classList.add("alert-error");
                    statusText.textContent = "Save failed: " + error.message;
                    setTimeout(() => statusDiv.classList.add("hidden"), 5000);
                }
            }
        };

        reader.onerror = () => {
            if (statusDiv) {
                statusDiv.classList.remove("alert-info");
                statusDiv.classList.add("alert-error");
                statusText.textContent = "Failed to read image file";
            }
        };

        reader.readAsDataURL(file);

    } catch (error) {
        console.error("Upload error:", error);
        const statusDiv = document.getElementById("uploadStatus");
        if (statusDiv) {
            statusDiv.classList.remove("alert-info");
            statusDiv.classList.add("alert-error");
            statusDiv.classList.remove("hidden");
            document.getElementById("uploadStatusText").textContent = "Upload error: " + error.message;
        }
    }
}



function handleProfileUpdate() {
    const btn = document.getElementById("saveNameBtn");
    const nameInput = document.getElementById("inputDisplayName");

    if (!btn || !nameInput) return;

    btn.onclick = async () => {
        const user = getAuthUser();
        const newName = nameInput.value.trim();
        if (!user || !newName) return;

        try {
            const orig = btn.innerHTML;
            btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span>';
            btn.disabled = true;

            // Update Firebase Auth - FIX HERE
            await window.firebaseAuth.updateProfile(user, { displayName: newName });

            // Update Firestore
            const userRef = getUserDocRef(user.uid);
            if (userRef) {
                const fs = getFs();
                await fs.setDoc(
                    userRef,
                    {
                        displayName: newName,
                        updatedAt: fs.serverTimestamp(),
                    },
                    { merge: true }
                );
            }

            // Update UI
            const nameDisplay = document.getElementById("settingsDisplayName");
            if (nameDisplay) nameDisplay.textContent = newName;

            btn.innerHTML = "✓ Saved!";
            setTimeout(() => {
                btn.innerHTML = orig;
                btn.disabled = false;
            }, 2000);
        } catch (e) {
            console.error("Profile update failed:", e);
            btn.innerHTML = "❌ Error";
            btn.disabled = false;
            setTimeout(() => (btn.innerHTML = "Save"), 2000);
        }
    };
}


function initAvatarUpload() {
    const fileInput = document.getElementById("avatarUpload");
    if (fileInput) {
        fileInput.addEventListener("change", (e) => {
            const files = e.target.files;
            if (files && files[0]) {
                uploadProfilePicture(files[0]);
            }
            fileInput.value = "";
        });
    }
}

// ========== MAIN BOOT ==========
async function boot() {
    // 1. Load settings
    const s = await loadSettingsForUser();

    // 2. Sync UI
    syncUI(s);

    // 3. Init modal & handlers
    initModalLogic();
    handleProfileUpdate();
    initAvatarUpload();

    // 4. Watch for changes
    ["themeToggle", "setDefaultExcludeWatched", "setDefaultMinRating"].forEach((key) => {
        const el = document.getElementById(key);
        if (!el) return;

        el.addEventListener("change", async () => {
            const newSettings = readUI();
            setTheme(newSettings.theme);
            applyDefaultFiltersToStorage(newSettings);
            await saveSettingsToCloud(newSettings);
        });
    });

    // 5. Logout
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            if (window.firebaseAuth?.auth) {
                window.firebaseAuth.auth.signOut().then(() => window.location.reload());
            }
        });
    }
}

// Start
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
} else {
    boot();
}
