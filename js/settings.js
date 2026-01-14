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

function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'cupcake';
}

function syncThemeToggles() {
    const isDark = getCurrentTheme() === 'synthwave';

    const heroBtn = document.getElementById('themeToggleBtn');
    const settingsToggle = document.getElementById('themeToggle'); // the checkbox in Appearance tab

    // Hero button: add/remove an "active" class if you want a visual state
    if (heroBtn) {
        heroBtn.classList.toggle('btn-active', isDark);
    }

    // Settings toggle: checked = dark, unchecked = light
    if (settingsToggle) {
        settingsToggle.checked = isDark;
    }
}

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
    // FIX: Read theme directly from HTML attribute so it never gets out of sync
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'cupcake';

    return {
        theme: currentTheme,
        defaultExcludeWatched: !!document.getElementById('setDefaultExcludeWatched')?.checked,
        defaultMinRating: Number(document.getElementById('setDefaultMinRating')?.value || 6),
        profileFrame: document.getElementById('profileFrameSelect')?.value || 'none',
        chatBackground: document.getElementById('chatBackgroundSelect')?.value || 'default',
    };
}

function syncUI(s) {
    // We no longer need to sync a theme checkbox because the button is stateless
    // (it just toggles whatever is current).

    const excludeWatched = document.getElementById('setDefaultExcludeWatched');
    const minRating = document.getElementById('setDefaultMinRating');
    const profileFrame = document.getElementById('profileFrameSelect');
    const chatBackground = document.getElementById('chatBackgroundSelect');
    const minRatingDisplay = document.getElementById('minRatingDisplay'); // ADD THIS

    if (excludeWatched) excludeWatched.checked = !!s.defaultExcludeWatched;
    if (minRating) minRating.value = String(s.defaultMinRating ?? 6);

    // Update display immediately
    if (minRatingDisplay) minRatingDisplay.textContent = (Number(s.defaultMinRating) ?? 6).toFixed(1);

    if (profileFrame) profileFrame.value = s.profileFrame || 'none';
    if (chatBackground) chatBackground.value = s.chatBackground || 'default';
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

                // ========== UPDATE HEADER BUTTON IMMEDIATELY ==========
                if (typeof window.updateUserChip === "function") {
                    window.updateUserChip();
                } else if (typeof updateUserChip === "function") {
                    updateUserChip();
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

            // Update Firebase Auth profile
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

    // Load rooms when "My Rooms" tab is clicked
    document.querySelectorAll(".settings-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tabName = btn.dataset.tab;
            if (tabName === "rooms") {
                loadUserRooms(); // Load rooms when tab opens
            }
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
    // Update preview in settings
    updateFramePreview(frame);

    // ========== UPDATE HEADER AVATAR RING IMMEDIATELY ==========
    const headerRing = document.getElementById("headerAvatarRing");
    if (headerRing) {
        // Remove all frame classes
        headerRing.classList.remove(
            "profile-frame-gradient-spin",
            "profile-frame-neon-pulse",
            "profile-frame-fire-glow",
            "profile-frame-ice-shimmer",
            "profile-frame-gold-shine"
        );

        // Reset background
        headerRing.style.background = "hsl(var(--b3))";

        // Add new frame
        if (frame && frame !== "none") {
            headerRing.classList.add(`profile-frame-${frame}`);
        }
    }

    // Update ALL chat avatars for current user
    const chatAvatars = document.querySelectorAll(".chat-message-avatar");
    chatAvatars.forEach(avatar => {
        avatar.classList.remove(
            "has-frame-gradient-spin",
            "has-frame-neon-pulse",
            "has-frame-fire-glow",
            "has-frame-ice-shimmer",
            "has-frame-gold-shine"
        );

        const messageRow = avatar.closest(".chat-message");
        const authorSpan = messageRow?.querySelector(".chat-message-author");
        if (authorSpan && authorSpan.textContent === "You") {
            if (frame && frame !== "none") {
                avatar.classList.add(`has-frame-${frame}`);
            }
        }
    });

    // Update cache
    const myUid = window.firebaseAuth?.auth?.currentUser?.uid;
    if (myUid && window.userProfileCache) {
        if (!window.userProfileCache[myUid]) {
            window.userProfileCache[myUid] = {};
        }
        window.userProfileCache[myUid].profileFrame = frame;
    }
}



function applyChatBackground(bg) {
    const chatMessages = document.getElementById("roomChatMessages");
    const preview = document.getElementById("chatBgPreviewLayer");

    // Remove ALL background classes
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
        // Remove all classes
        allBgs.forEach(cls => chatMessages.classList.remove(cls));

        // Force reflow to ensure CSS updates
        void chatMessages.offsetHeight;

        // Add new class
        chatMessages.classList.add(`chat-bg-${bg}`);

        // Force browser to recalculate styles
        chatMessages.style.display = 'none';
        setTimeout(() => {
            chatMessages.style.display = '';
        }, 10);
    }

    // Update preview
    if (preview) {
        allBgs.forEach(cls => preview.classList.remove(cls));
        void preview.offsetHeight;
        preview.classList.add(`chat-bg-${bg}`);
    }
}


// ========== MY ROOMS FUNCTIONALITY ==========
async function loadUserRooms() {
    const fs = getFs();
    const user = getAuthUser();

    if (!fs || !user) {
        const noAuthMsg = '<div class="text-xs opacity-60 p-3 bg-base-200 border border-base-300">Sign in to see your rooms</div>';
        document.getElementById("createdRoomsList").innerHTML = noAuthMsg;
        document.getElementById("joinedRoomsList").innerHTML = noAuthMsg;
        return;
    }

    try {
        // Fetch all rooms where user is owner
        const roomsCol = fs.collection(fs.db, "rooms");
        const createdQuery = fs.query(roomsCol, fs.where("ownerUid", "==", user.uid));
        const createdSnap = await fs.getDocs(createdQuery);

        const createdRooms = [];
        for (const docSnap of createdSnap.docs) {
            const memberCount = await getRoomMemberCount(docSnap.id);
            createdRooms.push({
                id: docSnap.id,
                ...docSnap.data(),
                memberCount
            });
        }

        // Fetch rooms where user is a member (but not owner)
        const joinedRooms = [];
        const allRoomsSnap = await fs.getDocs(roomsCol);

        for (const roomDoc of allRoomsSnap.docs) {
            const roomData = roomDoc.data();
            if (roomData.ownerUid === user.uid) continue;

            const memberRef = fs.doc(fs.db, `rooms/${roomDoc.id}/members/${user.uid}`);
            const memberSnap = await fs.getDoc(memberRef);

            if (memberSnap.exists()) {
                const memberCount = await getRoomMemberCount(roomDoc.id);
                joinedRooms.push({
                    id: roomDoc.id,
                    ...roomData,
                    memberCount
                });
            }
        }

        renderRoomsList(createdRooms, "createdRoomsList", "created");
        renderRoomsList(joinedRooms, "joinedRoomsList", "joined");

    } catch (e) {
        console.error("Failed to load rooms:", e);
        const errorMsg = '<div class="text-xs opacity-60 p-3 bg-base-200 border border-base-300">Failed to load rooms</div>';
        document.getElementById("createdRoomsList").innerHTML = errorMsg;
        document.getElementById("joinedRoomsList").innerHTML = errorMsg;
    }
}

async function getRoomMemberCount(roomId) {
    const fs = getFs();
    if (!fs) return 0;

    try {
        const membersCol = fs.collection(fs.db, `rooms/${roomId}/members`);
        const snap = await fs.getDocs(membersCol);

        const now = Date.now();
        let onlineCount = 0;

        snap.forEach(doc => {
            const data = doc.data();
            const lastSeen = data.lastSeenAt?.toMillis?.() || 0;
            if (now - lastSeen < 70000) {
                onlineCount++;
            }
        });

        return onlineCount;
    } catch (e) {
        console.warn("Failed to get member count:", e);
        return 0;
    }
}

function renderRoomsList(rooms, containerId, type) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (rooms.length === 0) {
        container.innerHTML = `
        <div class="text-xs opacity-60 p-3 bg-base-200 border border-base-300">
          ${type === "created" ? "You haven't created any rooms yet" : "You haven't joined any rooms yet"}
        </div>
      `;
        return;
    }

    container.innerHTML = "";

    rooms.forEach(room => {
        const card = document.createElement("div");
        card.className = "room-card";

        // Info section
        const info = document.createElement("div");
        info.className = "room-card-info";

        const name = document.createElement("div");
        name.className = "room-card-name";
        name.textContent = room.name || `Room ${room.id.substring(0, 8)}`;

        const meta = document.createElement("div");
        meta.className = "room-card-meta";

        // Members count
        const members = document.createElement("div");
        members.className = "room-card-members";
        members.innerHTML = `
        <svg fill="currentColor" viewBox="0 0 20 20">
          <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
        </svg>
        <span>${room.memberCount} online</span>
      `;
        meta.appendChild(members);

        // Created date
        const createdDate = room.createdAt?.toDate?.();
        if (createdDate) {
            const dateSpan = document.createElement("span");
            dateSpan.className = "text-xs opacity-50";
            dateSpan.textContent = createdDate.toLocaleDateString();
            meta.appendChild(dateSpan);
        }

        info.appendChild(name);
        info.appendChild(meta);

        // Actions section
        const actions = document.createElement("div");
        actions.className = "room-card-actions";

        // Delete button (only for created rooms)
        if (type === "created") {
            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btn btn-error btn-outline btn-xs rounded-none";
            deleteBtn.innerHTML = `
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            `;
            deleteBtn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                if (confirm("Delete this room? This cannot be undone.")) {
                    // Disable button
                    deleteBtn.disabled = true;
                    deleteBtn.innerHTML = '<span class="loading loading-spinner loading-xs"></span>';

                    const success = await deleteRoom(room.id);

                    if (success) {
                        // Reload rooms list to remove deleted room
                        await loadUserRooms();
                    } else {
                        // Re-enable button if failed
                        deleteBtn.disabled = false;
                        deleteBtn.innerHTML = `
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  `;
                    }
                }
            });
            actions.appendChild(deleteBtn);
        }

        // Join button
        const joinBtn = document.createElement("button");
        joinBtn.className = "btn btn-primary btn-xs rounded-none";
        joinBtn.innerHTML = `
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"/>
        </svg>
        <span>Join</span>
      `;
        joinBtn.addEventListener("click", () => {
            joinRoomById(room.id);
            document.getElementById("settingsModal").classList.add("hidden");
        });

        actions.appendChild(joinBtn);

        card.appendChild(info);
        card.appendChild(actions);
        container.appendChild(card);
    });
}

async function deleteRoom(roomId) {
    const fs = getFs();
    const user = getAuthUser();

    if (!fs || !user) {
        alert("Not signed in");
        return false; // Return false on failure
    }

    try {
        const roomRef = fs.doc(fs.db, "rooms", roomId);
        const snap = await fs.getDoc(roomRef);

        if (!snap.exists()) {
            alert("Room not found");
            return false;
        }

        const roomData = snap.data();

        if (roomData.ownerUid !== user.uid) {
            alert("You can only delete rooms you created");
            return false;
        }

        // Delete the room document
        await fs.deleteDoc(roomRef);

        // Delete all members subcollection
        const membersCol = fs.collection(fs.db, `rooms/${roomId}/members`);
        const membersSnap = await fs.getDocs(membersCol);

        const deletePromises = [];
        membersSnap.forEach(memberDoc => {
            deletePromises.push(fs.deleteDoc(memberDoc.ref));
        });
        await Promise.all(deletePromises);

        return true; // Return true on success

    } catch (e) {
        console.error("Failed to delete room:", e);
        alert(`Failed to delete room: ${e.message}`);
        return false;
    }
}


function joinRoomById(roomId) {
    window.location.href = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
}

// ========== REAL-TIME PREFERENCE UPDATES ==========
function initPreferenceUpdates() {
    const excludeWatched = document.getElementById("setDefaultExcludeWatched");
    const minRating = document.getElementById("setDefaultMinRating");
    const minRatingDisplay = document.getElementById("minRatingDisplay");

    // Update min rating display in real-time
    if (minRating && minRatingDisplay) {
        minRating.addEventListener("input", () => {
            const value = Number(minRating.value);
            minRatingDisplay.textContent = value.toFixed(1);
        });
    }

    // Auto-save on change (already handled in boot, but we can add immediate visual feedback)
    if (excludeWatched) {
        excludeWatched.addEventListener("change", () => {
            const isChecked = excludeWatched.checked;
            console.log("Exclude watched changed:", isChecked);
            // Visual feedback
            const parent = excludeWatched.closest(".flex");
            if (parent) {
                parent.style.background = isChecked ? "hsl(var(--su) / 0.1)" : "";
                setTimeout(() => {
                    parent.style.background = "";
                }, 300);
            }
        });
    }
}


// make theme helpers usable from other modules (like main.js)
window.getCurrentTheme = getCurrentTheme;
window.syncThemeToggles = syncThemeToggles;


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
    syncThemeToggles();
    // 4. Init modal & handlers
    initModalLogic();
    handleProfileUpdate();
    initAvatarUpload();
    initFramePreview();
    initPreferenceUpdates();

    // FIX: New Theme Button Logic (Click instead of Change)
    const settingsThemeBtn = document.getElementById("settingsThemeBtn");
    if (settingsThemeBtn) {
        settingsThemeBtn.addEventListener("click", async () => {
            const current = getCurrentTheme();
            const next = current === "synthwave" ? "cupcake" : "synthwave";

            applyTheme(next);       // actually changes theme
            syncThemeToggles();     // keep hero + settings toggles in sync

            const newSettings = readUI();
            await saveSettingsToCloud(newSettings);
        });
    }


    // Profile frame
    const profileFrameSelect = document.getElementById("profileFrameSelect");
    if (profileFrameSelect) {
        profileFrameSelect.addEventListener("change", async () => {
            const newSettings = readUI();
            applyProfileFrame(newSettings.profileFrame);
            await saveSettingsToCloud(newSettings);
        });
    }

    // Chat background (ONLY updates chat, NOT page theme)
    // Chat background (ONLY updates chat, NOT page theme)
    const chatBackgroundSelect = document.getElementById('chatBackgroundSelect');
    if (chatBackgroundSelect) {
        chatBackgroundSelect.addEventListener('change', async () => {
            // ...
            const newSettings = readUI();
            applyChatBackground(newSettings.chatBackground);
            await saveSettingsToCloud(newSettings);
        });
    }

    // Filter settings
    ["setDefaultExcludeWatched", "setDefaultMinRating"].forEach((key) => {
        const el = document.getElementById(key);
        if (!el) return;

        el.addEventListener("change", async () => {
            const newSettings = readUI();
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
