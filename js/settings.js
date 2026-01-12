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
    return fs?.doc(fs.db, "users", uid);
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
        const snap = await fs.getDoc(getUserDocRef(user.uid));
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
        const snap = await fs.getDoc(getUserDocRef(user.uid));
        const data = snap.exists() ? snap.data() : null;
        const curCloudFilters = data?.filters && typeof data.filters === "object" ? data.filters : {};

        const mergedFilters = normalizeFilters({
            ...curCloudFilters,
            excludeWatched: !!settings.defaultExcludeWatched,
            minRating: Number(settings.defaultMinRating ?? 6),
        });

        await fs.setDoc(
            getUserDocRef(user.uid),
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

// ========== PROFILE PICTURE UPLOAD ==========
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

    if (file.size > 5 * 1024 * 1024) {
        alert("Image must be smaller than 5MB");
        return;
    }

    try {
        const statusDiv = document.getElementById("uploadStatus");
        const statusText = document.getElementById("uploadStatusText");

        if (statusDiv) {
            statusDiv.classList.remove("hidden");
            statusDiv.classList.remove("alert-error");
            statusDiv.classList.add("alert-info");
            statusText.textContent = "Uploading image...";
        }

        const fileName = `profile-${user.uid}-${Date.now()}`;
        const storagePath = `users/${user.uid}/avatar/${fileName}`;
        const fileRef = fs.ref(fs.storage, storagePath);

        // Upload file to Firebase Storage
        await fs.uploadBytes(fileRef, file);

        // Get download URL
        const downloadURL = await fs.getDownloadURL(fileRef);

        // Update Firebase Auth profile
        await user.updateProfile({ photoURL: downloadURL });

        // Update Firestore
        const snap = await fs.getDoc(getUserDocRef(user.uid));
        const data = snap.exists() ? snap.data() : {};

        await fs.setDoc(
            getUserDocRef(user.uid),
            {
                ...data,
                photoURL: downloadURL,
                updatedAt: fs.serverTimestamp(),
            },
            { merge: true }
        );

        // ===== UPDATE UI IMMEDIATELY =====
        const avatarEl = document.getElementById("settingsAvatar");
        if (avatarEl) {
            avatarEl.src = downloadURL;
            avatarEl.onload = () => {
                if (statusDiv) {
                    statusDiv.classList.remove("alert-info");
                    statusDiv.classList.add("alert-success");
                    statusText.textContent = "✓ Profile picture updated!";
                    setTimeout(() => statusDiv.classList.add("hidden"), 3000);
                }
            };
        }

    } catch (error) {
        console.error("Upload failed:", error);
        const statusDiv = document.getElementById("uploadStatus");
        const statusText = document.getElementById("uploadStatusText");
        if (statusDiv) {
            statusDiv.classList.remove("alert-info");
            statusDiv.classList.add("alert-error");
            statusText.textContent = "Upload failed: " + error.message;
            setTimeout(() => statusDiv.classList.add("hidden"), 5000);
        }
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
    if (uid) uid.textContent = user.uid; // ===== FULL USER ID =====
    if (nameInput) nameInput.value = user.displayName || "";
    if (uidInput) uidInput.value = user.uid; // ===== FULL USER ID IN INPUT =====
}

function handleProfileUpdate() {
    const btn = document.getElementById("saveNameBtn");
    const nameInput = document.getElementById("inputDisplayName");
    if (!btn || !nameInput) return;

    btn.addEventListener("click", async () => {
        const user = getAuthUser();
        const newName = nameInput.value.trim();
        if (!user || !newName) return;

        try {
            const orig = btn.innerHTML;
            btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span>';

            // Save display name to Firebase Auth
            await user.updateProfile({ displayName: newName });

            // Update Firestore as well
            const snap = await getFs().getDoc(getUserDocRef(user.uid));
            const data = snap.exists() ? snap.data() : {};

            await getFs().setDoc(
                getUserDocRef(user.uid),
                {
                    ...data,
                    displayName: newName,
                    updatedAt: getFs().serverTimestamp(),
                },
                { merge: true }
            );

            // Update UI
            const nameDisplay = document.getElementById("settingsDisplayName");
            if (nameDisplay) nameDisplay.textContent = newName;

            btn.innerHTML = "✓ Saved!";
            setTimeout(() => (btn.innerHTML = orig), 2000);
        } catch (e) {
            console.error("Profile update failed:", e);
            btn.innerHTML = "Error";
        }
    });
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
    // 1. Load settings (cloud or local)
    const s = await loadSettingsForUser();

    // 2. Sync UI with settings
    syncUI(s);

    // 3. Init modal
    initModalLogic();
    handleProfileUpdate();
    initAvatarUpload();

    // 4. Watch for changes and auto-save
    ["themeToggle", "setDefaultExcludeWatched", "setDefaultMinRating"].forEach((key) => {
        const el = document.getElementById(key);
        if (!el) return;

        el.addEventListener("change", async () => {
            const newSettings = readUI();

            // Apply theme immediately
            setTheme(newSettings.theme);

            // Update filters
            applyDefaultFiltersToStorage(newSettings);

            // Save to cloud
            await saveSettingsToCloud(newSettings);
        });
    });

    // 5. Logout button
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            if (window.firebaseAuth?.auth) {
                window.firebaseAuth.auth.signOut().then(() => window.location.reload());
            }
        });
    }
}

// Start when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
} else {
    boot();
}
