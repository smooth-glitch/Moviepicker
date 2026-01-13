import { id } from "./dom.js";
import { loadJson, saveJson, LSTHEME, LSFILTERS } from "./storage.js";
import { normalizeFilters } from "./state.js";
import { applyTheme } from "./prefs.js";

const LSSETTINGS = "mnp_settings_v1";
const DEFAULT_SETTINGS = {
    theme: "cupcake",
    defaultExcludeWatched: true,
    defaultMinRating: 6,
    profileFrame: "none",
    chatBackground: "default",
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

if (!window.firestoreUserData) {
    window.firestoreUserData = {};
}

// Update frame preview live
function initFramePreview() {
    const frameSelect = document.getElementById("profileFrameSelect");
    const chatBgSelect = document.getElementById("chatBackgroundSelect");

    if (frameSelect) {
        frameSelect.addEventListener("change", () => {
            updateFramePreview(frameSelect.value);
        });
    }

    if (chatBgSelect) {
        chatBgSelect.addEventListener("change", () => {
            applyChatBackground(chatBgSelect.value);
        });
    }
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

        // DON'T apply theme automatically
        applyDefaultFiltersToStorage(merged);

        // Apply profile frame and chat background on load
        applyProfileFrame(merged.profileFrame || "none");
        applyChatBackground(merged.chatBackground || "default");

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
                profileFrame: settings.profileFrame || "none", // ← ADD THIS
                chatBackground: settings.chatBackground || "default", // ← ADD THIS
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
        profileFrame: document.getElementById("profileFrameSelect")?.value || "none",
        chatBackground: document.getElementById("chatBackgroundSelect")?.value || "default",
    };
}


function syncUI(s) {
    const themeToggle = document.getElementById("themeToggle");
    const excludeWatched = document.getElementById("setDefaultExcludeWatched");
    const minRating = document.getElementById("setDefaultMinRating");
    const profileFrame = document.getElementById("profileFrameSelect");
    const chatBackground = document.getElementById("chatBackgroundSelect");

    if (themeToggle) themeToggle.checked = s.theme === "synthwave";
    if (excludeWatched) excludeWatched.checked = !!s.defaultExcludeWatched;
    if (minRating) minRating.value = String(s.defaultMinRating ?? 6);
    if (profileFrame) profileFrame.value = s.profileFrame || "none";
    if (chatBackground) chatBackground.value = s.chatBackground || "default";
}


// ========== MODAL FUNCTIONS ==========
async function populateProfileData() {
    const user = getAuthUser();
    if (!user) return;

    // ========== RE-FETCH FIRESTORE DATA EVERY TIME ==========
    const fs = getFs();
    if (fs && user.uid) {
        try {
            const userRef = getUserDocRef(user.uid);
            if (userRef) {
                const snap = await fs.getDoc(userRef);
                if (snap.exists()) {
                    window.firestoreUserData = snap.data();
                }
            }
        } catch (e) {
            console.warn("Failed to refresh profile:", e);
        }
    }

    const avatar = document.getElementById("settingsAvatar");
    const name = document.getElementById("settingsDisplayName");
    const uid = document.getElementById("settingsUidDisplay");
    const nameInput = document.getElementById("inputDisplayName");
    const uidInput = document.getElementById("inputUid");

    // PRIORITY: Firestore photoURL (Base64) > Google photoURL > Avatar API
    let photoURL = window.firestoreUserData?.photoURL;

    // If no custom Firestore photo or it's not Base64, use Google's
    if (!photoURL || (!photoURL.startsWith("data:image/") && photoURL.length < 200)) {
        photoURL = user.photoURL;
    }

    // Final fallback to avatar API
    if (!photoURL) {
        photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "User")}`;
    }

    if (avatar) avatar.src = photoURL;
    if (name) name.textContent = user.displayName || "Anonymous";
    if (uid) uid.textContent = user.uid;
    if (nameInput) nameInput.value = user.displayName || "";
    if (uidInput) uidInput.value = user.uid;

    // Also update frame preview when modal opens
    const frameSelect = document.getElementById("profileFrameSelect");
    if (frameSelect) {
        updateFramePreview(frameSelect.value);
    }

}

// ========== PROFILE FRAME PREVIEW ==========
function updateFramePreview(frame) {
    const ring = document.getElementById("framePreviewRing");
    const img = document.getElementById("framePreviewImg");

    if (!ring) return;

    // Update preview image to user's actual photo
    const user = getAuthUser();
    if (user && img) {
        let photoURL = window.firestoreUserData?.photoURL;
        if (!photoURL || (!photoURL.startsWith("data:image/") && photoURL.length < 200)) {
            photoURL = user.photoURL;
        }
        if (!photoURL) {
            photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.displayName || "User")}`;
        }
        img.src = photoURL;
    }

    // Remove all frame classes
    ring.classList.remove(
        "profile-frame-gradient-spin",
        "profile-frame-neon-pulse",
        "profile-frame-fire-glow",
        "profile-frame-ice-shimmer",
        "profile-frame-gold-shine"
    );

    // Reset to default style
    ring.style.background = "hsl(var(--b3))";
    ring.style.animation = "none";

    // Apply selected frame
    if (frame && frame !== "none") {
        ring.classList.add(`profile-frame-${frame}`);
    }
}

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

                // ONLY update photoURL in Firestore, NOTHING ELSE
                await fs.setDoc(
                    userRef,
                    {
                        photoURL: base64Data,
                        photoUpdatedAt: fs.serverTimestamp(),
                    },
                    { merge: true }
                );

                // Update window cache
                if (!window.firestoreUserData) {
                    window.firestoreUserData = {};
                }
                window.firestoreUserData.photoURL = base64Data;

                // Update UI
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

            // Update Firebase Auth profile FIRST
            await window.firebaseAuth.updateProfile(user, { displayName: newName });

            // Update Firestore
            const userRef = getUserDocRef(user.uid);
            if (userRef) {
                const fs = getFs();
                await fs.setDoc(
                    userRef,
                    {
                        displayName: newName,
                        photoURL: base64Data,
                        photoUpdatedAt: fs.serverTimestamp(),
                        updatedAt: fs.serverTimestamp(),
                        profileFrame: document.getElementById("profileFrameSelect")?.value || "none",
                    },
                    { merge: true }
                );
            }

            // Update UI immediately in modal
            const nameDisplay = document.getElementById("settingsDisplayName");
            if (nameDisplay) nameDisplay.textContent = newName;

            // Update name in user dropdown (if exists)
            const userChipLabel = document.getElementById("userChipLabel");
            if (userChipLabel) userChipLabel.textContent = newName;

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

// ========== LOAD USER PROFILE FROM FIRESTORE ==========
async function loadUserProfileFromFirestore() {
    const fs = getFs();
    const user = getAuthUser();

    if (!fs || !user) return;

    try {
        const userRef = getUserDocRef(user.uid);
        if (!userRef) return;

        const snap = await fs.getDoc(userRef);
        if (!snap.exists()) return;

        const data = snap.data();

        // Store Firestore data globally (PRIORITY over Google)
        window.firestoreUserData = data;

        // Don't try to update Firebase Auth with Base64 (it will fail)
        // Just keep it in window cache and Firestore

    } catch (e) {
        console.warn("Failed to load profile from Firestore:", e);
    }
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

    // Profile Frame selector
    const frameSelect = document.getElementById("profileFrameSelect");
    if (frameSelect) {
        frameSelect.addEventListener("change", () => {
            const selectedFrame = frameSelect.value;
            updateFramePreview(selectedFrame);
        });
    }

    // Chat Background selector  
    const chatBgSelect = document.getElementById("chatBackgroundSelect");
    if (chatBgSelect) {
        chatBgSelect.addEventListener("change", () => {
            const selectedBg = chatBgSelect.value;
            applyChatBackground(selectedBg);
        });
    }

}

// ========== PROFILE FRAME & CHAT BACKGROUND ==========
function applyProfileFrame(frame) {
    const avatars = document.querySelectorAll(".chat-message-avatar-container");
    avatars.forEach(container => {
        const ring = container.querySelector(".chat-message-avatar");
        if (!ring) return;

        // Remove all frame classes
        ring.classList.remove(
            "profile-frame-gradient-spin",
            "profile-frame-neon-pulse",
            "profile-frame-fire-glow",
            "profile-frame-ice-shimmer",
            "profile-frame-gold-shine"
        );

        if (frame !== "none") {
            ring.classList.add(`profile-frame-${frame}`);
            container.classList.add("has-frame");
        } else {
            container.classList.remove("has-frame");
        }
    });
}

function applyChatBackground(bg) {
    const chatMessages = document.getElementById("roomChatMessages");
    const preview = document.getElementById("chatBgPreviewLayer");

    // Remove all background classes
    const allBgs = [
        "chat-bg-default",
        "chat-bg-gradient-purple",
        "chat-bg-gradient-blue",
        "chat-bg-gradient-sunset",
        "chat-bg-pattern-dots",
        "chat-bg-pattern-grid",
        "chat-bg-matrix",
        "chat-bg-stars"
    ];

    if (chatMessages) {
        allBgs.forEach(cls => chatMessages.classList.remove(cls));
        chatMessages.classList.add(`chat-bg-${bg}`);
    }

    // Update preview
    if (preview) {
        allBgs.forEach(cls => preview.classList.remove(cls));
        preview.classList.add(`chat-bg-${bg}`);
    }
}


// Update boot() to load Firestore data FIRST
// ========== MAIN BOOT ==========
async function boot() {
    // 1. Load Firestore profile data FIRST
    await loadUserProfileFromFirestore();

    // 2. Load settings
    const s = await loadSettingsForUser();

    // 3. Sync UI with settings
    syncUI(s);

    applyProfileFrame(s.profileFrame || "none");
    applyChatBackground(s.chatBackground || "default");

    // 4. Init modal & handlers
    initModalLogic();
    handleProfileUpdate();
    initAvatarUpload();
    initFramePreview();


    // 5. Watch for changes - Use applyTheme from prefs.js
    ["themeToggle", "setDefaultExcludeWatched", "setDefaultMinRating", "profileFrameSelect", "chatBackgroundSelect"].forEach((key) => {
        const el = document.getElementById(key);
        if (!el) return;

        el.addEventListener("change", async () => {
            const newSettings = readUI();

            // Apply theme
            if (key === "themeToggle") {
                applyTheme(newSettings.theme);
            }

            // Apply profile frame
            if (key === "profileFrameSelect") {
                applyProfileFrame(newSettings.profileFrame);
            }

            // Apply chat background
            if (key === "chatBackgroundSelect") {
                applyChatBackground(newSettings.chatBackground);
            }

            applyDefaultFiltersToStorage(newSettings);
            await saveSettingsToCloud(newSettings);
        });
    });

    // 6. Logout
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
