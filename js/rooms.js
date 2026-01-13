// js/rooms.js
import { id } from "./dom.js";
import {
    state,
    authState,
    roomState,
    inRoom,
    normalizeFilters,
    lastPickedMovieId,
    setLastPickedMovieId,
    lastAutoOpenedPickKey,
    setLastAutoOpenedPickKey,
} from "./state.js";
import { loadJson, saveJson, LSPOOL, LSWATCHED, LSFILTERS } from "./storage.js";
import { toast } from "./ui.js";
import { renderPool, renderResults } from "./render.js";
import { openDetails } from "./details.js";
import { openAuthDialog } from "./auth.js";

let unsubUserDoc = null;
let applyingRemote = false;
let saveTimer = null;

let unsubMembers = null;
let heartbeatTimer = null;

const HEARTBEATMS = 25000;
const ONLINEWINDOWMS = 70000;

// main.js should call setSyncControls(syncControlsFn)
let syncControlsCb = null;
// Top-level (near unsubMembers)
let membersInitDone = false;
let lastClientWriteId = 0;

// Teleparty playback sync
let lastPlaybackApplyTs = 0;

// Messages
let unsubMessages = null;
// helper set from main.js (simple global)
export let setReplyDraft = null;
export function registerReplyDraftSetter(fn) {
    setReplyDraft = typeof fn === "function" ? fn : null;
}


// ========== USER PROFILE CACHE FOR AVATARS ==========
const userProfileCache = {};

async function getUserProfile(uid) {
    // Check cache first
    if (userProfileCache[uid]) {
        return userProfileCache[uid];
    }

    const fs = window.firebaseStore;
    if (!fs) return null;

    try {
        const userRef = fs.doc(fs.db, "users", uid);
        const snap = await fs.getDoc(userRef);

        if (snap.exists()) {
            const data = snap.data();
            const profile = {
                displayName: data.displayName || "Anonymous",
                photoURL: data.photoURL || null,
                profileFrame: data.profileFrame || "none", // ← ADD THIS
            };

            // Cache it
            userProfileCache[uid] = profile;
            return profile;
        }
    } catch (e) {
        console.warn("Failed to fetch user profile:", uid, e);
    }

    return null;
}


// Get avatar URL with fallback
function getAvatarUrl(uid, userName, photoURL) {
    // Priority: Custom uploaded (Base64) > Google photo > Avatar API
    if (photoURL && photoURL.startsWith("data:image/")) {
        return photoURL; // Base64 from Firestore
    }
    if (photoURL && photoURL.startsWith("http")) {
        return photoURL; // Google photo URL
    }
    // Fallback to avatar API
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(userName || uid || "User")}&size=32&background=random`;
}

// --- new helpers for mentions + reply preview ---

function renderTextWithMentions(text, mentions) {
    const root = document.createElement("span");
    const parts = String(text || "").split(/(\s+)/); // keep spaces

    const mentionNames = new Set(
        (Array.isArray(mentions) ? mentions : [])
            .map((m) => (m?.name || "").toLowerCase())
            .filter(Boolean)
    );

    for (const part of parts) {
        if (part.startsWith("@")) {
            const name = part.slice(1);
            const key = name.toLowerCase();
            const span = document.createElement("span");
            span.textContent = part;
            if (mentionNames.has(key)) {
                span.className = "text-primary font-semibold";
            }
            root.appendChild(span);
        } else {
            root.appendChild(document.createTextNode(part));
        }
    }
    return root;
}

function renderReplyPreview(replyTo) {
    if (!replyTo || (!replyTo.text && !replyTo.gifUrl && !replyTo.stickerUrl && !replyTo.voiceUrl)) {
        return null;
    }

    const box = document.createElement("div");
    box.className = "mb-1 px-2 py-1 rounded-lg bg-base-100/30 border border-base-300/80 text-[0.65rem] leading-snug";

    const rName = replyTo.userName || "Anon";
    const label = document.createElement("div");
    label.className = "font-semibold flex items-center gap-1";

    // Add reply arrow icon
    label.innerHTML = `
      <svg class="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/>
      </svg>
      <span>${rName}</span>
    `;
    box.appendChild(label);

    const content = document.createElement("div");
    content.className = "flex items-center gap-1 opacity-80 mt-0.5";

    if (replyTo.type === "gif" && replyTo.gifUrl) {
        content.innerHTML = `
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="2" width="20" height="20" rx="2"/>
          <path d="M8 12h8M12 8v8" stroke="white" stroke-width="2"/>
        </svg>
        <span>GIF</span>
      `;
    } else if (replyTo.type === "sticker" && replyTo.stickerUrl) {
        content.innerHTML = `
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          ircle cx="9" cy="9" r="1.5"/>
          ircle cx="15" cy="9" r="1.5"/>
          <path d="M8 13s1.5 2 4 2 4-2 4-2"/>
        </svg>
        <span>Sticker</span>
      `;
    } else if (replyTo.type === "voice" && replyTo.voiceUrl) {
        // ========== VOICE NOTE REPLY PREVIEW ==========
        const voiceDuration = replyTo.voiceDuration || 0;
        const timeLabel = `${Math.floor(voiceDuration / 60)}:${(voiceDuration % 60).toString().padStart(2, '0')}`;

        content.innerHTML = `
        <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        </svg>
        <span>Voice message (${timeLabel})</span>
      `;
    } else {
        const t = replyTo.text || "";
        content.textContent = t.length > 40 ? t.slice(0, 40) + "..." : t;
    }

    box.appendChild(content);
    return box;
}


// --- messages ---

export function stopMessagesListener() {
    if (unsubMessages) unsubMessages();
    unsubMessages = null;
}

export function startMessagesListener() {
    const fs = window.firebaseStore;
    if (!fs || !inRoom()) return stopMessagesListener();

    const colRef = fs.collection(fs.db, "rooms", roomState.id, "messages");
    const q = fs.query(colRef, fs.orderBy("createdAt", "asc"), fs.limit(200));

    unsubMessages = fs.onSnapshot(
        q,
        (snap) => {
            const msgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            renderRoomMessages(msgs);
        },
        (err) => {
            console.warn("Messages listener failed", err);
        }
    );
}

// --- reactions ---

function messageDocRef(messageId) {
    const fs = window.firebaseStore;
    return fs.doc(fs.db, "rooms", roomState.id, "messages", messageId);
}

export async function toggleReaction(messageId, emoji) {
    const fs = window.firebaseStore;
    const uid = authState.user?.uid ?? null;
    if (!fs || !roomState.id || !uid) return;

    const ref = messageDocRef(messageId);

    // 1) Read current reactions
    const snap = await fs.getDoc(ref);
    if (!snap.exists()) return;

    const data = snap.data() || {};
    const reactions = { ...(data.reactions || {}) };

    // 2) Toggle this user in the emoji array
    const arr = Array.isArray(reactions[emoji]) ? reactions[emoji].slice() : [];
    const idx = arr.indexOf(uid);

    if (idx === -1) arr.push(uid);
    else arr.splice(idx, 1);

    if (arr.length) reactions[emoji] = arr;
    else delete reactions[emoji];

    // 3) Write back using setDoc + merge (no updateDoc)
    await fs.setDoc(ref, { reactions }, { merge: true });
}

function positionPopupUnderChat(el) {
    const form = document.getElementById("roomChatForm");
    if (!form) return;
    const rect = form.getBoundingClientRect();
    const margin = 6;

    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top - el.offsetHeight - margin + window.scrollY}px`;

    const maxRight = window.innerWidth - 8;
    const right = rect.left + el.offsetWidth;
    if (right > maxRight) {
        const shift = right - maxRight;
        el.style.left = `${rect.left - shift}px`;
    }
}

function removeEmojiPicker() {
    const existing = document.getElementById("msgEmojiPicker");
    if (existing) existing.remove();
}

export async function renderRoomMessages(list) {
    const wrap = document.getElementById("roomChatMessages");
    if (!wrap) return;

    wrap.innerHTML = "";
    const myId = authState.user?.uid ?? null;

    // Quick reactions
    const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢"];

    for (const m of list) {
        const isMe = m.userId && m.userId === myId;

        // ========== FETCH USER PROFILE FOR AVATAR ==========
        let userProfile = null;
        if (m.userId) {
            userProfile = await getUserProfile(m.userId);
        }

        const avatarUrl = getAvatarUrl(
            m.userId,
            userProfile?.displayName || m.userName,
            userProfile?.photoURL
        );
        const displayName = userProfile?.displayName || m.userName || "Anonymous";

        // ========== CREATE MESSAGE ROW ==========
        const row = document.createElement("div");
        row.className = "chat-message";

        // Avatar with frame support
        const avatarDiv = document.createElement("div");
        avatarDiv.className = "chat-message-avatar-container";

        // Check if user has a frame (from Firestore)
        const userFrame = userProfile?.profileFrame || "none";
        const frameClass = (userFrame && userFrame !== "none") ? `has-frame-${userFrame}` : "";

        avatarDiv.innerHTML = `<img src="${avatarUrl}" alt="${displayName}" class="chat-message-avatar ${frameClass}" />`;
        row.appendChild(avatarDiv);


        // Content wrapper
        const content = document.createElement("div");
        content.className = "chat-message-content";

        // Header (name + time)
        const header = document.createElement("div");
        header.className = "chat-message-header";

        const nameSpan = document.createElement("span");
        nameSpan.className = "chat-message-author";
        nameSpan.textContent = isMe ? "You" : displayName;
        nameSpan.style.color = isMe ? "hsl(var(--p))" : "hsl(var(--bc))";
        header.appendChild(nameSpan);

        // Time
        const ts = m.createdAt && typeof m.createdAt.toDate === "function" ? m.createdAt.toDate() : null;
        if (ts) {
            const timeLabel = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const timeSpan = document.createElement("span");
            timeSpan.className = "chat-message-time";
            timeSpan.textContent = timeLabel;
            header.appendChild(timeSpan);
        }

        content.appendChild(header);

        // Message bubble
        const bubble = document.createElement("div");
        const isMedia = m.type === "gif" || m.type === "sticker";
        bubble.className = isMedia
            ? "text-xs max-w-80"
            : `chat-bubble text-xs max-w-80 ${isMe ? "chat-bubble-primary" : "chat-bubble-neutral"}`;

        // Context menu for reactions
        bubble.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            removeEmojiPicker();

            const picker = document.createElement("div");
            picker.id = "msgEmojiPicker";
            picker.className = "fixed z-[9999] flex items-center gap-1 px-2 py-1 rounded-full bg-base-100 border border-base-300 shadow-xl";

            for (const emoji of QUICK_EMOJIS) {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "w-8 h-8 rounded-full hover:bg-base-200 grid place-items-center text-lg";
                btn.textContent = emoji;
                btn.addEventListener("click", async (e2) => {
                    e2.preventDefault();
                    e2.stopPropagation();
                    await toggleReaction(m.id, emoji);
                    removeEmojiPicker();
                });
                picker.appendChild(btn);
            }

            document.body.appendChild(picker);
            positionPopupUnderChat(picker);
        });

        // Click to set reply
        row.addEventListener("click", () => {
            removeEmojiPicker();
            if (typeof setReplyDraft === "function") {
                setReplyDraft(m);
            }
        });

        // Reply preview
        const replyBox = renderReplyPreview(m.replyTo);
        if (replyBox) bubble.appendChild(replyBox);

        // Main content (text, gif, or sticker)
        if (m.type === "gif" && m.gifUrl) {
            const img = document.createElement("img");
            img.src = m.gifUrl;
            img.alt = m.text || "GIF";
            img.className = "max-w-full rounded-md mt-1 mb-0.5";
            img.loading = "lazy";
            bubble.appendChild(img);
        } else if (m.type === "sticker" && m.stickerUrl) {
            const img = document.createElement("img");
            img.src = m.stickerUrl;
            img.alt = "Sticker";
            img.className = "h-24 w-24 object-contain mt-1";
            img.loading = "lazy";
            bubble.appendChild(img);
        } else if (m.type === "voice" && m.voiceUrl) {
            // ========== WHATSAPP-STYLE VOICE NOTE ==========
            const voiceContainer = document.createElement("div");
            voiceContainer.className = `voice-note-container ${isMe ? "voice-note-primary" : "voice-note-neutral"}`;
            // Add click handler for reply (like other messages)
            voiceContainer.addEventListener("click", (e) => {
                // Don't trigger if clicking the play button
                if (e.target.closest(".voice-note-play-btn")) return;

                removeEmojiPicker();
                if (typeof setReplyDraft === "function") {
                    setReplyDraft(m);
                }
            });

            // Play button
            const playBtn = document.createElement("button");
            playBtn.type = "button";
            playBtn.className = "voice-note-play-btn";
            playBtn.innerHTML = `
              <svg class="voice-play-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <svg class="voice-pause-icon hidden" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
              </svg>
            `;

            // Audio element (hidden)
            const audio = document.createElement("audio");
            audio.src = m.voiceUrl;
            audio.preload = "metadata";

            // Waveform + duration container
            const waveContainer = document.createElement("div");
            waveContainer.className = "voice-note-wave-container";

            // Waveform bars (WhatsApp style)
            const waveform = document.createElement("div");
            waveform.className = "voice-note-waveform";
            const bars = [4, 7, 5, 9, 6, 8, 7, 9, 5, 8, 6, 9, 7, 10, 6, 8];
            bars.forEach(height => {
                const bar = document.createElement("div");
                bar.className = "voice-wave-bar";
                bar.style.height = `${height * 2}px`;
                waveform.appendChild(bar);
            });

            // Duration/Timer label
            const totalDuration = m.voiceDuration || 0;
            const durationLabel = document.createElement("span");
            durationLabel.className = "voice-note-duration";
            durationLabel.textContent = `${Math.floor(totalDuration / 60)}:${(totalDuration % 60).toString().padStart(2, '0')}`;

            waveContainer.appendChild(waveform);
            waveContainer.appendChild(durationLabel);

            // Play/Pause logic with timer and animation
            let isPlaying = false;
            let progressInterval = null;

            playBtn.addEventListener("click", () => {
                if (isPlaying) {
                    audio.pause();
                    playBtn.querySelector(".voice-play-icon").classList.remove("hidden");
                    playBtn.querySelector(".voice-pause-icon").classList.add("hidden");
                    waveform.classList.remove("playing");
                    clearInterval(progressInterval);
                    isPlaying = false;
                } else {
                    audio.play();
                    playBtn.querySelector(".voice-play-icon").classList.add("hidden");
                    playBtn.querySelector(".voice-pause-icon").classList.remove("hidden");
                    waveform.classList.add("playing");
                    isPlaying = true;

                    // Update timer during playback
                    progressInterval = setInterval(() => {
                        const remaining = totalDuration - Math.floor(audio.currentTime);
                        const mins = Math.floor(remaining / 60);
                        const secs = remaining % 60;
                        durationLabel.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
                    }, 500);
                }
            });

            audio.addEventListener("ended", () => {
                playBtn.querySelector(".voice-play-icon").classList.remove("hidden");
                playBtn.querySelector(".voice-pause-icon").classList.add("hidden");
                waveform.classList.remove("playing");
                clearInterval(progressInterval);
                durationLabel.textContent = `${Math.floor(totalDuration / 60)}:${(totalDuration % 60).toString().padStart(2, '0')}`;
                isPlaying = false;
            });

            voiceContainer.appendChild(playBtn);
            voiceContainer.appendChild(waveContainer);
            voiceContainer.appendChild(audio);
            bubble.appendChild(voiceContainer);

        } else {
            const body = renderTextWithMentions(m.text || "", m.mentions);
            body.classList.add("block", "mt-0.5");
            bubble.appendChild(body);
        }

        content.appendChild(bubble);

        // Reactions bar
        if (m.reactions && typeof m.reactions === "object") {
            const emojis = Object.keys(m.reactions);
            if (emojis.length) {
                const reactionsBar = document.createElement("div");
                reactionsBar.className = "mt-1 flex flex-wrap gap-1 text-[0.7rem] items-center";

                for (const emoji of emojis) {
                    const users = Array.isArray(m.reactions[emoji]) ? m.reactions[emoji] : [];
                    if (!users.length) continue;

                    const mine = myId ? users.includes(myId) : false;
                    const pill = document.createElement("button");
                    pill.type = "button";
                    pill.className = mine
                        ? "px-2 py-0.5 rounded-full border text-[0.7rem] flex items-center gap-1 bg-primary text-black border-primary"
                        : "px-2 py-0.5 rounded-full border text-[0.7rem] flex items-center gap-1 bg-base-100/70 text-base-content border-base-300/80";
                    pill.textContent = `${emoji} ${users.length}`;
                    pill.addEventListener("click", (ev) => {
                        ev.stopPropagation();
                        toggleReaction(m.id, emoji);
                        removeEmojiPicker();
                    });

                    reactionsBar.appendChild(pill);
                }

                content.appendChild(reactionsBar);
            }
        }

        row.appendChild(content);
        wrap.appendChild(row);
    }

    // Scroll to bottom
    wrap.scrollTop = wrap.scrollHeight;
}


export async function updatePlaybackFromLocal({
    mediaId,
    mediaType,
    position,
    isPlaying,
}) {
    if (!inRoom()) return;
    const fs = window.firebaseStore;
    if (!fs) return;

    const uid = authState.user?.uid ?? null;

    await fs.setDoc(
        roomDocRef(),
        {
            playback: {
                mediaId,
                mediaType,
                position,
                isPlaying,
                updatedBy: uid,
                updatedAt: fs.serverTimestamp(),
            },
            updatedAt: fs.serverTimestamp(),
        },
        { merge: true }
    );
}

/**
 * Called when Firestore playback payload changes.
 */
function onPlaybackChange({ mediaId, mediaType }) {
    if (!mediaId) return;
    openDetails(mediaId, { highlight: true, mediaType: mediaType ?? "movie" });
}

export function stopMembersListener() {
    if (unsubMembers) unsubMembers();
    unsubMembers = null;
    membersInitDone = false;
}

export function startMembersListener() {
    const fs = window.firebaseStore;
    if (!fs || !inRoom()) return;

    stopMembersListener();

    const roomMembersWrap = id("roomMembersWrap");
    const roomMembersList = id("roomMembersList");
    const roomOnlineCount = id("roomOnlineCount");

    roomMembersWrap?.classList.remove("hidden");

    unsubMembers = fs.onSnapshot(
        membersColRef(),
        (snap) => {
            if (!membersInitDone) {
                membersInitDone = true;
            } else {
                const selfUid = authState.user?.uid ?? null;

                for (const ch of snap.docChanges()) {
                    const data = ch.doc.data?.() ?? {};
                    const label = data.name || data.email || ch.doc.id;

                    if (selfUid && ch.doc.id === selfUid) continue;

                    if (ch.type === "added") toast(`${label} joined`, "info");
                    if (ch.type === "removed") toast(`${label} left`, "info");
                }
            }

            const now = Date.now();

            const members = snap.docs
                .map((d) => {
                    const m = d.data();
                    const ms =
                        typeof m.lastSeenAt?.toMillis === "function" ? m.lastSeenAt.toMillis() : 0;
                    return {
                        id: d.id,
                        name: m.name || m.email || d.id,
                        email: m.email,
                        lastSeenMs: ms,
                        online: ms && now - ms < ONLINEWINDOWMS,
                    };
                })
                .sort((a, b) => (b.lastSeenMs || 0) - (a.lastSeenMs || 0));

            // Store for @-mention feature
            roomState.members = members;

            const onlineCount = members.filter((x) => x.online).length;
            if (roomOnlineCount) roomOnlineCount.textContent = `Online ${onlineCount}`;

            if (!roomMembersList) return;
            roomMembersList.innerHTML = members
                .map((m) => {
                    const label = m.name || m.email || m.id;
                    const badge = m.online ? "badge-success" : "badge-ghost";
                    const status = m.online ? "online" : "offline";
                    return `
        <div class="flex items-center justify-between p-2 rounded-xl bg-base-200/40 border border-base-300">
          <div class="truncate">${label}</div>
          <span class="badge badge-sm ${badge}">${status}</span>
        </div>
      `;
                })
                .join("");
        },
        (err) => {
            console.warn("Members listener failed", err);
            toast(err?.message || "Failed to load room members.", "error");
        }
    );
}

export function setSyncControls(fn) {
    syncControlsCb = typeof fn === "function" ? fn : null;
}

export async function copyRoomLink() {
    if (!inRoom()) return;

    const url = new URL(window.location.href);
    url.searchParams.set("room", roomState.id);

    try {
        await navigator.clipboard.writeText(url.toString());
        toast("Room link copied.", "success");
    } catch {
        window.prompt("Copy room link:", url.toString());
    }
}

export function fsReady() {
    return !!window.firebaseStore && !!authState.user;
}

export function userDocRef() {
    const fs = window.firebaseStore;
    return fs.doc(fs.db, "users", authState.user.uid);
}

export function roomDocRef() {
    const fs = window.firebaseStore;
    return fs.doc(fs.db, "rooms", roomState.id);
}

export function activeDocRef() {
    return inRoom() ? roomDocRef() : userDocRef();
}

export function membersColRef() {
    const fs = window.firebaseStore;
    return fs.collection(fs.db, "rooms", roomState.id, "members");
}

export function requireLoginForRoomWrite() {
    if (!inRoom()) return true;
    if (authState.user) return true;
    toast("Login to edit this room.", "info");
    openAuthDialog();
    return false;
}

export function scheduleCloudSave() {
    if (!authState.user) return;
    if (!fsReady()) return;
    if (applyingRemote) return;

    clearTimeout(saveTimer);

    const delay = inRoom() ? 0 : 400;

    saveTimer = setTimeout(async () => {
        try {
            const fs = window.firebaseStore;

            lastClientWriteId = Date.now();

            await fs.setDoc(
                activeDocRef(),
                {
                    pool: state.pool,
                    watched: Array.from(state.watched),
                    filters: state.filters,
                    updatedBy: authState.user.uid,
                    clientWriteId: lastClientWriteId,
                    updatedAt: fs.serverTimestamp(),
                },
                { merge: true }
            );
        } catch (e) {
            console.warn("Firestore save failed", e);
        }
    }, delay);
}

export async function ensureUserDoc() {
    if (!fsReady()) return;

    const fs = window.firebaseStore;
    const ref = userDocRef();
    const snap = await fs.getDoc(ref);

    if (!snap.exists()) {
        await fs.setDoc(
            ref,
            {
                pool: state.pool,
                watched: Array.from(state.watched),
                filters: state.filters,
                createdAt: fs.serverTimestamp(),
                updatedAt: fs.serverTimestamp(),
            },
            { merge: true }
        );
    }
}

export function stopUserDocListener() {
    if (unsubUserDoc) unsubUserDoc();
    unsubUserDoc = null;
}

export function startUserDocListener() {
    if (!fsReady()) return;

    const fs = window.firebaseStore;
    stopUserDocListener();

    unsubUserDoc = fs.onSnapshot(
        userDocRef(),
        (snap) => {
            if (!snap.exists()) return;

            const data = snap.data();
            if (data.settings && typeof data.settings === "object") {
                const s = data.settings;
                if (s.theme) document.documentElement.setAttribute("data-theme", s.theme);
                if (typeof s.textScale === "number") {
                    document.documentElement.style.fontSize = `${s.textScale * 100}%`;
                }
                document.documentElement.toggleAttribute("data-reduce-motion", !!s.reduceMotion);
            }

            applyingRemote = true;
            try {
                if (Array.isArray(data.pool)) state.pool = data.pool;
                if (Array.isArray(data.watched)) state.watched = new Set(data.watched);
                if (data.filters && typeof data.filters === "object")
                    state.filters = normalizeFilters(data.filters);

                saveJson(LSPOOL, state.pool);
                saveJson(LSWATCHED, Array.from(state.watched));
                saveJson(LSFILTERS, state.filters);

                syncControlsCb?.();
                renderPool();
                renderResults(state.results);
            } finally {
                applyingRemote = false;
            }
        },
        (err) => {
            console.warn("Firestore onSnapshot failed", err);
            toast(err?.message || "Error loading data from Firestore.", "error");
        }
    );
}

export function updateRoomUI() {
    const badge = id("roomBadge");
    const btnCreate = id("btnCreateRoom");
    const btnCopy = id("btnCopyRoomLink");
    const btnLeave = id("btnLeaveRoom");
    const chatCol = document.getElementById("roomChatColumn");
    const hasRoom = inRoom();
    document.body.classList.toggle("has-room", hasRoom);

    const membersWrap = document.getElementById("roomMembersWrap");

    // Show/hide right-side panels
    if (membersWrap) {
        membersWrap.classList.toggle("hidden", !hasRoom);
    }
    if (chatCol) {
        chatCol.classList.toggle("hidden", !hasRoom);
        chatCol.classList.toggle("flex", hasRoom);
    }

    if (badge && chatCol) {
        badge.onclick = () => {
            chatCol.scrollIntoView({ behavior: "smooth" });
            const input = document.getElementById("roomChatInput");
            if (input) input.focus();
        };
    }

    if (badge) {
        const labelEl = document.getElementById("roomBadgeLabel");
        badge.classList.toggle("hidden", !hasRoom);
        if (!hasRoom) {
            if (labelEl) labelEl.textContent = "Room: —";
        } else {
            const u = authState.user;
            const rawName =
                u?.displayName ||
                (u?.email ? u.email.split("@")[0] : null) ||
                "Friends";
            const alias = `${rawName}'s room`;
            if (labelEl) labelEl.textContent = alias;
        }
    }

    if (btnCreate) btnCreate.classList.toggle("hidden", hasRoom);
    if (btnCopy) btnCopy.classList.toggle("hidden", !hasRoom);
    if (btnLeave) btnLeave.classList.toggle("hidden", !hasRoom);

    const chatBar = document.getElementById("roomChatBar");
    if (chatBar) {
        chatBar.classList.toggle("hidden", !hasRoom);
    }

    const wrap = document.getElementById("poolChatWrap");
    if (wrap) {
        wrap.classList.toggle("md:grid-cols-2", hasRoom);
    }
}



export function stopRoomListener() {
    if (roomState.unsub) roomState.unsub();
    roomState.unsub = null;
}

export function startRoomListener() {
    const fs = window.firebaseStore;
    if (!fs || !inRoom()) return stopRoomListener();

    stopRoomListener();

    roomState.unsub = fs.onSnapshot(
        roomDocRef(),
        (snap) => {
            if (!snap.exists()) return;

            const data = snap.data();

            const tpUrl = data.telepartyUrl || null;
            const banner = id("roomPickBanner");
            const text = id("roomPickText");

            if (banner && tpUrl) {
                banner.classList.remove("hidden");
                text.textContent = text.textContent + " · Teleparty ready";
            }

            const lp = data.lastPick;
            if (lp?.movieId) {
                const banner2 = id("roomPickBanner");
                const text2 = id("roomPickText");
                if (banner2 && text2) {
                    const title = lp.title ? String(lp.title) : "";
                    banner2.classList.remove("hidden");
                    text2.textContent = title ? `Tonight's pick: ${title}` : "Tonight's pick";
                }

                const pickedAtMs =
                    typeof lp.pickedAt?.toMillis === "function" ? lp.pickedAt.toMillis() : 0;
                const key = lp.pickId ?? `${lp.movieId}_${lp.clientPickedAt ?? 0}`;

                if (key && key !== lastAutoOpenedPickKey) {
                    setLastAutoOpenedPickKey(key);
                    setLastPickedMovieId(lp.movieId);
                    openDetails(lp.movieId, {
                        highlight: true,
                        mediaType: lp.mediaType ?? "movie",
                    });
                }
            }

            const selfUid = authState.user?.uid ?? null;
            const incomingBy = data.updatedBy ?? null;
            const incomingWriteId = Number(data.clientWriteId ?? 0);

            if (
                selfUid &&
                incomingBy === selfUid &&
                incomingWriteId &&
                incomingWriteId < lastClientWriteId
            ) {
                return;
            }

            const playback = data.playback || null;
            if (playback) {
                const { mediaId, mediaType, position, isPlaying, updatedBy, updatedAt } = playback;

                const myUid = authState.user?.uid ?? null;

                const tsMs =
                    typeof updatedAt?.toMillis === "function" ? updatedAt.toMillis() : 0;
                if (!myUid || !updatedBy || updatedBy !== myUid) {
                    if (tsMs && tsMs > lastPlaybackApplyTs) {
                        lastPlaybackApplyTs = tsMs;
                        onPlaybackChange({ mediaId, mediaType, position, isPlaying });
                    }
                }
            }

            applyingRemote = true;
            try {
                if (Array.isArray(data.pool)) state.pool = data.pool;
                if (Array.isArray(data.watched)) state.watched = new Set(data.watched);
                if (data.filters && typeof data.filters === "object")
                    state.filters = normalizeFilters(data.filters);

                syncControlsCb?.();
                renderPool();
                renderResults(state.results);
            } finally {
                applyingRemote = false;
            }
        },
        (err) => {
            console.warn("Room listener failed", err);
            toast(err?.message || "Failed to load room.", "error");
        }
    );
}

export async function saveTelepartyUrl(url) {
    if (!inRoom()) return;
    const fs = window.firebaseStore;
    if (!fs || !authState.user) return;

    await fs.setDoc(
        roomDocRef(),
        {
            telepartyUrl: url,
            updatedAt: fs.serverTimestamp(),
        },
        { merge: true }
    );
}

export async function heartbeatOnce() {
    if (!inRoom() || !authState.user) return;

    const fs = window.firebaseStore;
    const u = authState.user;

    await fs.setDoc(
        fs.doc(fs.db, "rooms", roomState.id, "members", u.uid),
        {
            uid: u.uid,
            name: u.displayName || null,
            email: u.email || null,
            lastSeenAt: fs.serverTimestamp(),
        },
        { merge: true }
    );
}

export function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = null;
}

export function startHeartbeat() {
    stopHeartbeat();
    if (!inRoom() || !authState.user) return;

    heartbeatOnce().catch(() => { });
    heartbeatTimer = setInterval(() => heartbeatOnce().catch(() => { }), HEARTBEATMS);

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") heartbeatOnce().catch(() => { });
    });
}

export function setRoomInUrl(roomId) {
    const url = new URL(window.location.href);
    if (roomId) url.searchParams.set("room", roomId);
    else url.searchParams.delete("room");
    history.replaceState({}, "", url.toString());
}

export async function createRoom() {
    const fs = window.firebaseStore;
    if (!fs) return toast("Firestore not ready.", "error");

    if (!authState.user) {
        openAuthDialog();
        toast("Sign in to create a room.", "info");
        return;
    }

    const ref = fs.doc(fs.collection(fs.db, "rooms"));
    await fs.setDoc(ref, {
        ownerUid: authState.user.uid,
        pool: state.pool,
        watched: Array.from(state.watched),
        filters: state.filters,
        createdAt: fs.serverTimestamp(),
        updatedAt: fs.serverTimestamp(),
    });

    joinRoom(ref.id);
}

export function joinRoom(roomId) {
    stopUserDocListener();

    roomState.id = roomId;
    setRoomInUrl(roomId);

    updateRoomUI();
    startRoomListener();
    startMembersListener();
    startHeartbeat();
    startMessagesListener();
}

export async function leaveRoom() {
    const fs = window.firebaseStore;
    const uid = authState.user?.uid;
    const rid = roomState.id;

    if (fs && uid && rid) {
        try {
            await fs.deleteDoc(fs.doc(fs.db, "rooms", rid, "members", uid));
        } catch (e) {
            console.warn("Failed to delete member doc", e);
        }
    }

    stopRoomListener();
    stopMembersListener();
    stopHeartbeat();
    stopMessagesListener();

    id("roomMembersWrap")?.classList.add("hidden");
    id("roomPickBanner")?.classList.add("hidden");

    setLastPickedMovieId(null);

    roomState.id = null;
    setRoomInUrl(null);
    updateRoomUI();

    state.pool = loadJson(LSPOOL, []);
    state.watched = new Set(loadJson(LSWATCHED, []));
    state.filters = loadJson(LSFILTERS, { excludeWatched: true, minRating: 6 });

    syncControlsCb?.();
    renderPool();

    if (authState.user) {
        ensureUserDoc().then(startUserDocListener);
    }
}
// Listen for profile frame changes
window.addEventListener('profileFrameChanged', () => {
    // Clear cache for current user so it fetches new frame
    const myUid = window.firebaseAuth?.auth?.currentUser?.uid;
    if (myUid && userProfileCache[myUid]) {
        delete userProfileCache[myUid];
    }
});

