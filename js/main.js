// js/main.js
import { id } from "./dom.js";
import { loadPrefs, savePrefs, applyTheme } from "./prefs.js";
import {
    state,
    authState,
    roomState,
    ensureWatchFilterDefaults,
    normalizeFilters,
    lastPickedMovieId,
} from "./state.js";
import {
    LSPOOL,
    LSWATCHED,
    LSFILTERS,
    LSTHEME,
    loadJson,
    saveJson,
} from "./storage.js";
import { toast, bindDropdownRowToggle } from "./ui.js";
import { tmdb, loadTmdbConfig } from "./tmdb.js";
import {
    renderPager,
    renderPool,
    toggleHiddenPoolItems,
    renderResults,
    renderResultsLoading,
    setBusy,
} from "./render.js";
import { openDetails, markCurrentWatched, getCurrentDetailsId } from "./details.js";
import { clearPool, addToPoolById } from "./pool.js";
import { loadTrending, doSearch } from "./search.js";
import { initWatchFiltersUI } from "./watchFilters.js";
import {
    updateUserChip,
    openAuthDialog,
    handleAuthSubmit,
    handleGoogleSignIn,
    handleGithubSignIn,
    handleTwitterSignIn,
    handleSignOut,
} from "./auth.js";

import { pickForMe, rerollPick } from "./pick.js";
import { importSharedListToAccount } from "./importList.js";
import { sharePoolOnWhatsApp } from "./share.js";
import {
    updateRoomUI,
    createRoom,
    leaveRoom,
    startRoomListener,
    startMembersListener,
    startHeartbeat,
    ensureUserDoc,
    startUserDocListener,
    copyRoomLink,
    joinRoom,
    registerReplyDraftSetter,
} from "./rooms.js";
import { setSyncControls } from "./rooms.js";
import { searchGifs } from "./gif.js";
import { searchStickers } from "./stickers.js";
// Update your import at the top:
import {
    loadCollections,
    createCollection,
    renderCollections,
    addToCollection  // ADD THIS
} from "./collections.js";
import { loadFriends, addFriend, renderFriends } from "./friends.js";
import { openDM, sendDM, closeDM } from "./dm.js";

let liveSearchTimer = null;
// reply draft for chat
let currentReplyTarget = null;
let trayMode = null;
let traySearchTimer = null;
let emojiCache = null;

// ========== VOICE NOTE RECORDING ==========
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = 0;
let timerInterval = null;

const voiceBtn = document.getElementById("roomVoiceBtn");
const voiceUI = document.getElementById("voiceRecordingUI");
const voiceTimer = document.getElementById("voiceTimer");
const voiceCancelBtn = document.getElementById("voiceCancelBtn");
const voiceSendBtn = document.getElementById("voiceSendBtn");
const chatInput = document.getElementById("roomChatInput"); // ← DEFINE IT HERE


const THEME_SEQUENCE = ["cupcake", "noir", "synthwave"];

function getCurrentTheme() {
    if (state?.prefs?.theme) return state.prefs.theme;
    return document.documentElement.getAttribute("data-theme") || "cupcake";
}

function setTheme(theme) {
    applyTheme(theme); // now also updates state.prefs + storage
}

function openTray(mode, tray, trayGrid, traySearch, tabGif, tabSticker, tabEmoji) {
    if (!tray || !trayGrid || !traySearch) return;

    trayMode = mode;
    tray.classList.remove("hidden");

    // Set active tab
    [tabGif, tabSticker, tabEmoji].forEach(tab => tab?.classList.remove('active'));
    if (mode === 'gif') tabGif?.classList.add('active');
    if (mode === 'sticker') tabSticker?.classList.add('active');
    if (mode === 'emoji') tabEmoji?.classList.add('active');

    traySearch.value = '';
    traySearch.placeholder = mode === 'gif' ? 'Search GIFs' :
        mode === 'sticker' ? 'Search stickers' :
            'Search emoji';
    traySearch.focus();
}

function initScrollIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'scrollIndicator';
    indicator.innerHTML = '↑';
    document.body.appendChild(indicator);

    window.addEventListener('scroll', () => {
        indicator.classList.toggle('visible', window.scrollY > 300);
    });

    indicator.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}
// ===== CHAT ENHANCEMENTS =====

// 1. Send button pulse when input has text
function initChatInputEffects() {
    const chatInput = document.getElementById('roomChatInput');
    const sendBtn = document.querySelector('#roomChatForm button[type="submit"]');

    if (chatInput && sendBtn) {
        chatInput.addEventListener('input', () => {
            if (chatInput.value.trim()) {
                sendBtn.classList.add('has-text');
            } else {
                sendBtn.classList.remove('has-text');
            }
        });
    }
}

// 2. Typing indicator (show when user is typing)
let typingTimeout;
function showTypingIndicator(userId, userName) {
    const chatMessages = document.getElementById('roomChatMessages');
    if (!chatMessages) return;

    // Remove existing indicator
    const existing = chatMessages.querySelector('.typing-indicator');
    if (existing) existing.remove();

    // Create new indicator
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator chat-message';
    indicator.innerHTML = `
      <div class="chat-message-avatar">
        <img src="https://ui-avatars.com/api/?name=${userName}&size=32" alt="${userName}">
      </div>
      <div class="typing-indicator">
        <span></span>
        <span></span>
        <span></span>
      </div>
    `;

    chatMessages.appendChild(indicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Auto remove after 3 seconds
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => indicator.remove(), 3000);
}

// 3. New message flash highlight
function highlightNewMessage(messageElement) {
    messageElement.classList.add('new-message');
    setTimeout(() => messageElement.classList.remove('new-message'), 1000);
}

// 4. Smooth scroll to bottom on new message
function smoothScrollChatToBottom() {
    const chatMessages = document.getElementById('roomChatMessages');
    if (chatMessages) {
        chatMessages.scrollTo({
            top: chatMessages.scrollHeight,
            behavior: 'smooth'
        });
    }
}

// 5. Reaction button scale animation
function addReactionAnimation(reactionButton) {
    reactionButton.addEventListener('click', (e) => {
        const rect = reactionButton.getBoundingClientRect();
        const emoji = reactionButton.textContent.trim().charAt(0);

        // Create floating emoji
        const floater = document.createElement('div');
        floater.textContent = emoji;
        floater.style.position = 'fixed';
        floater.style.left = rect.left + 'px';
        floater.style.top = rect.top + 'px';
        floater.style.fontSize = '2rem';
        floater.style.pointerEvents = 'none';
        floater.style.zIndex = '9999';
        floater.style.animation = 'emojiFloat 1s cubic-bezier(0.4, 0, 1, 1) forwards';

        document.body.appendChild(floater);
        setTimeout(() => floater.remove(), 1000);
    });
}

// 6. Voice note waveform pulse on play
function enhanceVoiceNoteAnimations() {
    document.addEventListener('click', (e) => {
        const playBtn = e.target.closest('.voice-note-play-btn');
        if (!playBtn) return;

        const waveform = playBtn.closest('.voice-note-container')?.querySelector('.voice-note-waveform');
        if (waveform) {
            waveform.style.animation = 'waveformPulse 0.3s ease';
            setTimeout(() => waveform.style.animation = '', 300);
        }
    });
}

// 7. Chat bubble color based on user
function generateUserColor(userId) {
    const hash = userId.split('').reduce((acc, char) => {
        return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 70%, 65%)`;
}

// 8. Message context menu (right-click) animation
function initMessageContextMenu() {
    document.addEventListener('contextmenu', (e) => {
        const msg = e.target.closest('.chat-message');
        if (!msg) return;

        const picker = document.getElementById('msgEmojiPicker');
        if (picker) {
            picker.style.animation = 'contextMenuPop 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)';
        }
    });
}

// 9. Mention suggestion slide in
function showMentionSuggestions(suggestions) {
    const mentionBox = document.getElementById('mentionSuggestions');
    if (!mentionBox) return;

    mentionBox.style.animation = 'mentionSlideIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)';
}

// 10. Chat resize handle glow on hover
function initChatResizeEffects() {
    const resizeHandle = document.getElementById('roomChatResize');
    if (!resizeHandle) return;

    resizeHandle.addEventListener('mouseenter', () => {
        resizeHandle.style.background = 'hsl(var(--p) / 0.2)';
        resizeHandle.style.transition = 'all 0.3s ease';
    });

    resizeHandle.addEventListener('mouseleave', () => {
        resizeHandle.style.background = '';
    });

    resizeHandle.addEventListener('dblclick', () => {
        resizeHandle.style.animation = 'resizeFlash 0.4s ease';
    });
}

// 2. CONFETTI ON ADD TO POOL
function triggerConfetti(x, y) {
    for (let i = 0; i < 15; i++) {
        const particle = document.createElement('div');
        particle.className = 'confetti-piece';
        particle.style.left = x + 'px';
        particle.style.top = y + 'px';
        particle.style.setProperty('--x', `${(Math.random() - 0.5) * 200}px`);
        particle.style.setProperty('--y', `${Math.random() * 100 + 50}px`);
        particle.style.background = `hsl(${Math.random() * 360}, 70%, 60%)`;
        particle.style.animationDelay = `${Math.random() * 0.3}s`;
        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 2000);
    }
}

// Listen for pool additions
document.addEventListener('poolItemAdded', (e) => {
    // Add stagger animation class
    setTimeout(() => {
        const poolItems = document.querySelectorAll('#pool > *');
        const newItem = poolItems[0]; // Assuming unshift adds to top
        if (newItem) {
            newItem.classList.add('just-added');
            setTimeout(() => newItem.classList.remove('just-added'), 500);
        }
    }, 50);

    // Trigger confetti at button location
    triggerConfetti(window.innerWidth / 2, window.innerHeight / 2);
});

// 4. MAGNETIC HOVER FOR PICK BUTTONS
function initMagneticButtons() {
    const buttons = ['#btnPick', '#btnPickPool', '#pickMeNow'];

    buttons.forEach(selector => {
        const btn = document.querySelector(selector);
        if (!btn) return;

        btn.classList.add('magnetic-hover');

        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width - 0.5) * 15;
            const y = ((e.clientY - rect.top) / rect.height - 0.5) * 15;
            btn.style.setProperty('--mouse-x', `${x}px`);
            btn.style.setProperty('--mouse-y', `${y}px`);
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.setProperty('--mouse-x', '0px');
            btn.style.setProperty('--mouse-y', '0px');
        });
    });
}


// 6. PARALLAX HERO ON SCROLL
function initParallaxHero() {
    const hero = document.getElementById('hero');
    if (!hero) return;

    window.addEventListener('scroll', () => {
        const scrolled = window.pageYOffset;
        hero.style.setProperty('--scroll', scrolled);

        if (scrolled > 300) {
            hero.classList.add('scrolled');
        } else {
            hero.classList.remove('scrolled');
        }
    });
}

// 7. PARTICLE BURST ON BUTTON CLICKS
function addParticleBurst(button) {
    button.addEventListener('click', (e) => {
        const rect = button.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        for (let i = 0; i < 8; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle-burst';
            particle.style.left = x + 'px';
            particle.style.top = y + 'px';

            const angle = (Math.PI * 2 * i) / 8;
            const distance = 50 + Math.random() * 30;
            const offsetX = Math.cos(angle) * distance;
            const offsetY = Math.sin(angle) * distance;

            particle.style.setProperty('--x', `${offsetX}px`);
            particle.style.setProperty('--y', `${offsetY}px`);
            particle.style.background = `hsl(var(--p))`;

            document.body.appendChild(particle);
            setTimeout(() => particle.remove(), 800);
        }
    });
}

// 9. SMOOTH NUMBER COUNTER FOR RATINGS
function animateCounter(element, target) {
    const duration = 500;
    const start = parseFloat(element.textContent) || 0;
    const increment = (target - start) / (duration / 16);
    let current = start;

    const timer = setInterval(() => {
        current += increment;
        if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
            current = target;
            clearInterval(timer);
        }
        element.textContent = current.toFixed(1);
    }, 16);
}

function spinThemeButtonOnce() {
    const btn = document.getElementById("themeToggleBtn");
    if (!btn) return;
    btn.classList.remove("theme-spin-right");
    void btn.offsetWidth;
    btn.classList.add("theme-spin-right");
}

const heroThemeBtn = document.getElementById("themeToggleBtn");

if (heroThemeBtn) {
    heroThemeBtn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme") || "cupcake";

        const next =
            current === "cupcake" ? "noir" :
                current === "noir" ? "synthwave" :
                    "cupcake";

        console.log("current:", current, "next:", next);
        document.documentElement.setAttribute("data-theme", next);
        document.dispatchEvent(new Event('themeChanged'));
    });
}




if (voiceBtn && voiceUI && chatInput) {
    voiceBtn.addEventListener("click", async () => {
        if (!roomState.id) {
            toast("Join a room first.", "info");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.addEventListener("dataavailable", (event) => {
                audioChunks.push(event.data);
            });

            mediaRecorder.addEventListener("stop", () => {
                stream.getTracks().forEach((track) => track.stop());
            });

            mediaRecorder.start();
            recordingStartTime = Date.now();

            // Show recording UI
            voiceUI.classList.remove("hidden");
            chatInput.disabled = true;

            // Start timer
            timerInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
                const mins = Math.floor(elapsed / 60);
                const secs = elapsed % 60;
                if (voiceTimer) {
                    voiceTimer.textContent = `${mins}:${secs.toString().padStart(2, "0")}`;
                }
            }, 1000);

        } catch (error) {
            console.error("Microphone access denied:", error);
            toast("Microphone access denied.", "error");
        }
    });

    // Cancel recording
    voiceCancelBtn?.addEventListener("click", () => {
        if (mediaRecorder && mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }
        clearInterval(timerInterval);
        voiceUI.classList.add("hidden");
        chatInput.disabled = false;
        audioChunks = [];
    });

    // Send voice note
    voiceSendBtn?.addEventListener("click", async () => {
        if (!mediaRecorder) return;

        if (mediaRecorder.state === "recording") {
            mediaRecorder.stop();
        }

        clearInterval(timerInterval);

        mediaRecorder.addEventListener("stop", async () => {
            const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

            // Convert to Base64
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Audio = e.target.result;

                // Send to Firestore
                const fs = window.firebaseStore;
                const u = authState.user;

                const payload = {
                    type: "voice",
                    text: null,
                    voiceUrl: base64Audio,
                    voiceDuration: Math.floor((Date.now() - recordingStartTime) / 1000),
                    gifUrl: null,
                    stickerUrl: null,
                    mentions: [],
                    userId: u?.uid ?? null,
                    userName: u?.displayName ?? u?.email ?? "Anon",
                    createdAt: fs.serverTimestamp(),
                    reactions: {},
                };

                if (currentReplyTarget) {
                    payload.replyTo = {
                        id: currentReplyTarget.id,
                        userName: currentReplyTarget.userName || "Anon",
                        type: currentReplyTarget.type || "text",
                        text: currentReplyTarget.text || null,
                        gifUrl: currentReplyTarget.gifUrl || null,
                        stickerUrl: currentReplyTarget.stickerUrl || null,
                        voiceUrl: currentReplyTarget.voiceUrl || null,
                        voiceDuration: currentReplyTarget.voiceDuration || 0,
                    };
                }

                try {
                    await fs.addDoc(
                        fs.collection(fs.db, `rooms/${roomState.id}/messages`),
                        payload
                    );

                    // Use the clearReplyDraft function that's already defined in main.js
                    if (typeof clearReplyDraft === "function") {
                        clearReplyDraft();
                    } else {
                        currentReplyTarget = null; // Fallback
                    }

                    voiceUI.classList.add("hidden");
                    chatInput.disabled = false;
                    audioChunks = [];
                } catch (err) {
                    toast("Failed to send voice note.", "error");
                    console.warn(err);
                    voiceUI.classList.add("hidden");
                    chatInput.disabled = false;
                }
            };

            reader.readAsDataURL(audioBlob);
        }, { once: true });
    });
}


function setPageLoading(on) {
    const el = document.getElementById("pageLoader");
    if (!el) return;
    el.classList.toggle("hidden", !on);
}

function updateGenreDropdownLabel() {
    const countEl = id("genreDropdownCount");
    const n = Array.isArray(state.filters.genres) ? state.filters.genres.length : 0;
    if (countEl) {
        countEl.textContent = n ? `${n} selected` : "";
        // ADD PULSE ANIMATION
        countEl.classList.add('updated');
        setTimeout(() => countEl.classList.remove('updated'), 500);
    }
}


async function loadGenres(kind) {
    const data = await tmdb(`genre/${kind}/list`, { language: "en-US" });
    return Array.isArray(data.genres) ? data.genres : [];
}

async function populateGenreSelect(kind) {
    const menu = id("genreDropdownMenu");
    if (!menu) return;

    if (!Array.isArray(state.filters.genres)) state.filters.genres = [];
    const chosen = new Set(state.filters.genres);

    menu.innerHTML = `<div class="text-xs opacity-60 p-2">Loading...</div>`;
    const genres = await loadGenres(kind);
    menu.innerHTML = "";

    for (const g of genres) {
        const row = document.createElement("label");
        row.className =
            "flex items-center gap-2 p-2 rounded-lg hover:bg-base-200/40 cursor-pointer";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "checkbox checkbox-xs";
        cb.checked = chosen.has(g.id);

        cb.addEventListener("change", () => {
            if (cb.checked) chosen.add(g.id);
            else chosen.delete(g.id);

            state.filters.genres = Array.from(chosen);
            saveJson(LSFILTERS, state.filters);
            updateGenreDropdownLabel();

            if (state.lastMode !== "trending") doSearch(1);
        });

        const txt = document.createElement("span");
        txt.className = "text-sm";
        txt.textContent = g.name;

        row.appendChild(cb);
        row.appendChild(txt);
        menu.appendChild(row);
    }

    updateGenreDropdownLabel();
}

function syncCreateRoomButton() {
    const signedIn = !!authState.user;
    id("btnCreateRoom")?.classList.toggle("hidden", !signedIn);
}

function syncControls() {
    const ex = id("excludeWatched");
    const mr = id("minRatingPool");
    const mediaType = id("mediaType");
    const yearFilter = id("yearFilter");

    if (ex) ex.checked = !!state.filters.excludeWatched;
    if (mr) mr.value = String(state.filters.minRating ?? 6);
    if (mediaType) mediaType.value = state.filters.mediaType || "movie";
    if (yearFilter) yearFilter.value = String(state.filters.year || "");

    updateGenreDropdownLabel();
}

setSyncControls(syncControls);

function updateSignOutLabel() {
    const el = id("btnMenuSignOut");
    if (!el) return;

    const u = authState.user;
    const name = u ? u.displayName || u.email || "Signed in" : "";

    el.textContent = u ? `Sign out (${name})` : "Sign out";
}

function resetAllFilters() {
    state.filters = normalizeFilters({
        excludeWatched: true,
        minRating: 6,
        region: state.filters.region || "IN",
        ott: { netflix: false, prime: false, hotstar: false },
    });

    state.filters.mediaType = "movie";
    state.filters.year = "";
    state.filters.genres = [];

    ensureWatchFilterDefaults();

    const qEl = id("q");
    const mediaTypeEl = id("mediaType");
    const yearEl = id("yearFilter");
    const sortEl = id("resultSort");
    const excludeEl = id("excludeWatched");
    const minRatingEl = id("minRating");

    if (qEl) qEl.value = "";
    if (mediaTypeEl) mediaTypeEl.value = "movie";
    if (yearEl) yearEl.value = "";
    if (sortEl) sortEl.value = "popularity.desc";
    if (excludeEl) excludeEl.checked = true;
    if (minRatingEl) minRatingEl.value = "6";

    const cbNetflix = id("ottNetflix");
    const cbPrime = id("ottPrime");
    const cbHotstar = id("ottHotstar");
    if (cbNetflix) cbNetflix.checked = false;
    if (cbPrime) cbPrime.checked = false;
    if (cbHotstar) cbHotstar.checked = false;

    saveJson(LSFILTERS, state.filters);

    populateGenreSelect("movie");
    renderPool();
    loadTrending(1);

    toast("Filters reset.", "info");
}

// --------------------------------------------------
// Docked tray (GIF / Sticker / Emoji)
// --------------------------------------------------


async function loadEmojis() {
    if (emojiCache) return emojiCache;
    try {
        const res = await fetch("https://emojihub.yurace.pro/api/all");
        if (!res.ok) throw new Error("Failed to load emojis");
        const data = await res.json();
        emojiCache = data.map((e) => {
            const code = Array.isArray(e.htmlCode) ? e.htmlCode[0] : null;
            const num = code ? Number(code.replace(/[&#;]/g, "")) : null;
            return {
                char: Number.isFinite(num) ? String.fromCodePoint(num) : null,
                name: (e.name || "").toLowerCase(),
            };
        }).filter((x) => x.char);
    } catch (e) {
        console.warn("Emoji API failed", e);
        emojiCache = [
            { char: "😀", name: "grinning" },
            { char: "😅", name: "sweat" },
            { char: "😂", name: "joy" },
            { char: "😍", name: "heart eyes" },
            { char: "😎", name: "cool" },
            { char: "😢", name: "cry" },
            { char: "😡", name: "angry" },
            { char: "👍", name: "thumbs up" },
            { char: "👀", name: "eyes" },
            { char: "🔥", name: "fire" },
            { char: "🙏", name: "pray" },
        ];
    }
    return emojiCache;
}

function setActiveTab(mode, tabGif, tabSticker, tabEmoji) {
    [tabGif, tabSticker, tabEmoji].forEach((b) =>
        b?.classList.remove("is-active")
    );
    if (mode === "gif") tabGif?.classList.add("is-active");
    if (mode === "sticker") tabSticker?.classList.add("is-active");
    if (mode === "emoji") tabEmoji?.classList.add("is-active");
}

function closeTray(tray) {
    trayMode = null;
    tray?.classList.add("hidden");
}

async function renderTrayGifs(q, trayGrid, sendGifMessage) {
    if (!trayGrid) return;
    trayGrid.innerHTML =
        `<div class="col-span-2 text-xs opacity-70 p-2">Loading…</div>`;

    try {
        const gifs = await searchGifs(q);
        if (!gifs.length) {
            trayGrid.innerHTML =
                `<div class="col-span-2 text-xs opacity-70 p-2">No GIFs found.</div>`;
            return;
        }

        trayGrid.className =
            "mt-2 grid grid-cols-2 gap-2 max-h-72 overflow-y-auto";
        trayGrid.innerHTML = "";
        for (const g of gifs) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className =
                "relative w-full aspect-[4/3] overflow-hidden rounded-lg border border-base-300";
            btn.innerHTML = `<img src="${g.thumb}" alt="${g.title || "GIF"}" class="w-full h-full object-cover" loading="lazy">`;
            btn.addEventListener("click", async () => {
                await sendGifMessage(g);
                // tray closed by caller
            });
            trayGrid.appendChild(btn);
        }
    } catch (e) {
        console.warn(e);
        trayGrid.innerHTML =
            `<div class="col-span-2 text-xs opacity-70 p-2">Failed to load GIFs.</div>`;
    }
}

async function renderTrayStickers(q, trayGrid, sendStickerMessage) {
    if (!trayGrid) return;
    trayGrid.innerHTML =
        `<div class="col-span-3 text-xs opacity-70 p-2">Loading…</div>`;
    trayGrid.className =
        "mt-2 grid grid-cols-3 gap-2 max-h-72 overflow-y-auto";

    try {
        const stickers = await searchStickers(q || "");
        if (!stickers.length) {
            trayGrid.innerHTML =
                `<div class="col-span-3 text-xs opacity-70 p-2">No stickers found.</div>`;
            return;
        }

        trayGrid.innerHTML = "";
        for (const s of stickers) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className =
                "relative w-full aspect-square overflow-hidden rounded-lg border border-base-300 " +
                "bg-base-100 hover:bg-base-200 transition";
            btn.innerHTML = `
        <div class="w-full h-full flex items-center justify-center">
          <img src="${s.thumb}" alt="${s.title || ""}"
               class="max-w-[80%] max-h-[80%] object-contain" loading="lazy" />
        </div>
      `;
            btn.addEventListener("click", async () => {
                await sendStickerMessage(s);
            });
            trayGrid.appendChild(btn);
        }
    } catch (e) {
        console.warn(e);
        trayGrid.innerHTML =
            `<div class="col-span-3 text-xs opacity-70 p-2">Failed to load stickers.</div>`;
    }
}

async function renderTrayEmojis(q, trayGrid, chatInput, tray) {
    if (!trayGrid) return;
    trayGrid.innerHTML =
        `<div class="col-span-2 text-xs opacity-70 p-2">Loading…</div>`;

    try {
        const all = await loadEmojis();
        const query = (q || "").toLowerCase();
        const list = query ? all.filter((x) => x.name.includes(query)) : all;
        const subset = list.slice(0, 120);

        trayGrid.className =
            "mt-2 grid grid-cols-8 gap-1 max-h-72 overflow-y-auto";
        trayGrid.innerHTML = "";

        for (const e of subset) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className =
                "w-8 h-8 grid place-items-center rounded-lg hover:bg-base-200 text-lg";
            btn.textContent = e.char;

            btn.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (!chatInput) return;
                const start = chatInput.selectionStart ?? chatInput.value.length;
                const end = chatInput.selectionEnd ?? chatInput.value.length;
                const v = chatInput.value;
                chatInput.value = v.slice(0, start) + e.char + v.slice(end);
                const caret = start + e.char.length;
                chatInput.setSelectionRange(caret, caret);
                chatInput.focus();
                closeTray(tray);
            });

            trayGrid.appendChild(btn);
        }
    } catch (e) {
        console.warn(e);
        trayGrid.innerHTML =
            `<div class="col-span-2 text-xs opacity-70 p-2">Failed to load emojis.</div>`;
    }
}

function renderTray(trayGrid, traySearch) {
    // no-op here: actual dispatch is wired inside boot where we know chatInput
}

// --------------------------------------------------
// Shared Emoji popup helper (no longer used for tray)
// --------------------------------------------------

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

function createBubbleParticles() {
    if (document.documentElement.getAttribute('data-theme') !== 'cupcake') return;

    const bubble = document.createElement('div');
    bubble.style.cssText = `
      position: fixed;
      bottom: -50px;
      left: ${Math.random() * 100}%;
      width: ${20 + Math.random() * 30}px;
      height: ${20 + Math.random() * 30}px;
      background: radial-gradient(
        circle at 30% 30%,
        rgba(255, 255, 255, 0.4),
        rgba(101, 80, 225, 0.15)
      );
      border-radius: 50%;
      pointer-events: none;
      z-index: 1;
      opacity: 0.6;
      animation: bubbleRise ${8 + Math.random() * 4}s ease-in-out forwards;
      box-shadow: inset 0 0 10px rgba(255, 255, 255, 0.3);
    `;

    document.body.appendChild(bubble);
    setTimeout(() => bubble.remove(), 12000);
}

// CSS for bubble animation
const bubbleStyle = document.createElement('style');
bubbleStyle.textContent = `
    @keyframes bubbleRise {
      0% {
        bottom: -50px;
        opacity: 0;
      }
      10% {
        opacity: 0.6;
      }
      90% {
        opacity: 0.6;
      }
      100% {
        bottom: 110vh;
        opacity: 0;
        transform: translateX(${(Math.random() - 0.5) * 100}px);
      }
    }
  `;
document.head.appendChild(bubbleStyle);

// Start bubble generator for cupcake theme
let bubbleInterval;

function startBubbles() {
    if (document.documentElement.getAttribute('data-theme') !== 'cupcake') return;

    // Create initial bubbles
    for (let i = 0; i < 5; i++) {
        setTimeout(() => createBubbleParticles(), i * 800);
    }

    // Create new bubbles periodically
    bubbleInterval = setInterval(() => {
        if (document.documentElement.getAttribute('data-theme') === 'cupcake') {
            createBubbleParticles();
        }
    }, 3000);
}

function stopBubbles() {
    clearInterval(bubbleInterval);
    document.querySelectorAll('[style*="bubbleRise"]').forEach(el => el.remove());
}

// Update initCupcakeEffects:
function initCupcakeEffects() {
    console.log('Cupcake theme effects initialized');

    // Heart particles on add to pool
    const poolItemHandler = (e) => {
        if (document.documentElement.getAttribute('data-theme') !== 'cupcake') return;
        triggerHeartParticles();
    };

    document.addEventListener('poolItemAdded', poolItemHandler);

    // Start floating bubbles
    startBubbles();
}
// --------------------------------------------------
// Boot
// --------------------------------------------------

async function loadSharedListFromUrl() {
    const fs = window.firebaseStore;
    if (!fs) return;

    const url = new URL(window.location.href);
    const listId = url.searchParams.get("list");
    if (!listId) return;

    const snap = await fs.getDoc(fs.doc(fs.db, "sharedLists", listId));
    if (!snap.exists()) return toast("Shared list not found.", "error");

    const data = snap.data();
    if (Array.isArray(data.pool)) state.pool = data.pool;
    if (Array.isArray(data.watched))
        state.watched = new Set(data.watched);
    if (data.filters && typeof data.filters === "object")
        state.filters = data.filters;

    renderPool();
    syncControls();

    id("btnImportList")?.classList.remove("hidden");
}

function syncUserMenu() {
    const signedIn = !!authState.user;
    id("btnMenuSignIn")?.classList.toggle("hidden", signedIn);
    id("btnMenuSignOut")?.classList.toggle("hidden", !signedIn);
    id("btnMenuCopyUid")?.classList.toggle("hidden", !signedIn);
}


function applyPrefsToUI() {
    // Theme is already applied inside loadPrefs()

    // Map prefs -> filters
    state.filters.mediaType = state.prefs.defaultMediaType;
    state.filters.minRating = state.prefs.defaultMinRating;
    state.filters.excludeWatched = state.prefs.defaultExcludeWatched;
    state.filters.year = state.prefs.defaultYear;
    state.filters.sort = state.prefs.defaultSort;

    // Pool-related defaults
    state.filters.minRating = state.prefs.poolMinRating;
    state.filters.excludeWatched = state.prefs.poolExcludeWatched;

    // Reflect into DOM controls if present
    const mediaTypeEl = id("mediaType");
    if (mediaTypeEl) mediaTypeEl.value = state.prefs.defaultMediaType;

    const yearEl = id("yearFilter");
    if (yearEl) yearEl.value = state.prefs.defaultYear || "";

    const sortEl = id("resultSort");
    if (sortEl) sortEl.value = state.prefs.defaultSort;

    const minRatingPoolEl = id("minRatingPool");
    if (minRatingPoolEl) {
        minRatingPoolEl.value = String(state.prefs.poolMinRating);
    }

    const excludePoolEl = id("excludeWatched");
    if (excludePoolEl) {
        excludePoolEl.checked = state.prefs.poolExcludeWatched;
    }
}

// ===== CUPCAKE THEME EFFECTS =====

function triggerHeartParticles() {
    if (document.documentElement.getAttribute('data-theme') !== 'cupcake') return;

    const hearts = ['💖', '💗', '💕', '💓', '💝'];
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    hearts.forEach((emoji, i) => {
        const heart = document.createElement('div');
        heart.className = 'heart-particle';
        heart.textContent = emoji;

        // Spread them out in a circle pattern
        const angle = (Math.PI * 2 * i) / hearts.length;
        const distance = 50;
        const offsetX = Math.cos(angle) * distance;

        heart.style.left = (centerX + offsetX) + 'px';
        heart.style.top = centerY + 'px';
        heart.style.animationDelay = (i * 0.1) + 's';

        document.body.appendChild(heart);
        setTimeout(() => heart.remove(), 2500);
    });
}

function initThemeEffects() {
    const theme = document.documentElement.getAttribute('data-theme');

    // Clean up old effects
    document.querySelectorAll('.heart-particle').forEach(el => el.remove());
    stopBubbles();

    // Remove old tracking line
    const oldLine = document.getElementById('vhsTrackingLine');
    if (oldLine) oldLine.remove();

    // Initialize theme-specific effects
    if (theme === 'cupcake') {
        initCupcakeEffects();
    }
}

function initSynthwaveEffects() {
    console.log('Synthwave theme effects initialized');
    // CSS-based effects only, no JS needed
}

async function boot() {
    await loadTmdbConfig();

    // Initial homepage load – show skeletons before first trending call
    renderResultsLoading();
    await loadTrending(1);
    // persisted state
    state.pool = loadJson(LSPOOL, []);
    state.watched = new Set(loadJson(LSWATCHED, []));
    state.filters = loadJson(LSFILTERS, { excludeWatched: true, minRating: 6 });

    ensureWatchFilterDefaults();
    loadPrefs();
    applyPrefsToUI();
    syncControls();
    loadCollections();
    loadFriends();
    await initWatchFiltersUI({
        onChange: () => {
            if (state.lastMode !== "trending") doSearch(1);
        },
    });

    const minRatingPoolInput = document.getElementById('minRatingPool');
    const minRatingPoolDisplay = document.getElementById('minRatingPoolDisplay');

    if (minRatingPoolInput && minRatingPoolDisplay) {
        minRatingPoolInput.addEventListener('input', () => {
            minRatingPoolDisplay.textContent = Number(minRatingPoolInput.value).toFixed(1);
        });
    }

    // When opening settings, sync inputs from state
    id("btnMenuSettings")?.addEventListener("click", () => {
        const dlg = document.getElementById("dlgSettings");
        if (!dlg) return;

        const exclude = id("settingsExcludeWatched");
        const themeToggle = id("settingsThemeToggle");

        // filters
        if (exclude) exclude.checked = !!state.filters.excludeWatched;

        // theme: checked = synthwave, unchecked = cupcake
        const currentTheme =
            document.documentElement.getAttribute("data-theme") || "synthwave";
        if (themeToggle) themeToggle.checked = currentTheme === "synthwave";

        // ADD THIS - RENDER COLLECTIONS WHEN OPENING SETTINGS:
        renderCollections();

        dlg.showModal();
    });

    // Wire up add friend button:
    const btnAddFriend = document.getElementById('btnAddFriend');
    const friendUidInput = document.getElementById('friendUidInput');

    if (btnAddFriend && friendUidInput) {
        btnAddFriend.addEventListener('click', async () => {
            const uid = friendUidInput.value.trim();

            if (!uid) {
                toast("Enter a UID", "info");
                return;
            }

            const success = await addFriend(uid);
            if (success) {
                friendUidInput.value = '';
                renderFriends(); // Refresh
            }
        });

        friendUidInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                btnAddFriend.click();
            }
        });
    }

    // Wire up DM modal
    const btnCloseDM = document.getElementById('btnCloseDM');
    const dmForm = document.getElementById('dmForm');
    const dmInput = document.getElementById('dmInput');

    if (btnCloseDM) {
        btnCloseDM.addEventListener('click', closeDM);
    }

    if (dmForm && dmInput) {
        dmForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = dmInput.value.trim();
            if (text) {
                sendDM(text);
            }
        });
    }

    // Floating DM button
    const floatingDMBtn = document.getElementById('floatingDMBtn');
    const dmQuickList = document.getElementById('dmQuickList');

    if (floatingDMBtn && dmQuickList) {
        // Toggle conversations list
        floatingDMBtn.addEventListener('click', async () => {
            const isHidden = dmQuickList.classList.contains('hidden');

            if (isHidden) {
                // Load and show conversations
                const { renderConversationsList } = await import('./dm.js');
                await renderConversationsList();
                dmQuickList.classList.remove('hidden');
            } else {
                dmQuickList.classList.add('hidden');
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!floatingDMBtn.contains(e.target) && !dmQuickList.contains(e.target)) {
                dmQuickList.classList.add('hidden');
            }
        });
    }

    // Show floating button when user has conversations
    if (authState.user) {
        const { renderConversationsList } = await import('./dm.js');
        await renderConversationsList();
    }

    // ADD THIS - Tab switching for settings modal:
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // Switch active tab
            document.querySelectorAll('.settings-tab-btn').forEach(b => {
                b.classList.remove('active');
            });
            document.querySelectorAll('.settings-content').forEach(c => {
                c.classList.add('hidden');
            });

            btn.classList.add('active');
            const targetTab = document.getElementById(`tab-${btn.dataset.tab}`);
            if (targetTab) {
                targetTab.classList.remove('hidden');
            }

            // REFRESH COLLECTIONS WHEN COLLECTIONS TAB IS CLICKED
            if (btn.dataset.tab === 'collections') {
                renderCollections();
            }
            if (btn.dataset.tab === 'friends') {
                renderFriends();
            }
        });
    });


    id("btnAddFromDetails")?.addEventListener("click", async () => {
        const idNum = getCurrentDetailsId();
        const cur = state.currentDetails;
        if (!idNum || !cur) return;

        const mediaType = cur.mediaType || state.filters.mediaType || "movie";
        try {
            await addToPoolById(idNum, mediaType);
            toast("Added to pool.", "success");
        } catch {
            toast("Failed to add to pool.", "error");
        }
        document.getElementById("dlg")?.close();
    });

    // Wire up create collection button
    const btnCreateCollection = document.getElementById('btnCreateCollection');
    const newCollectionName = document.getElementById('newCollectionName');

    if (btnCreateCollection && newCollectionName) {
        btnCreateCollection.addEventListener('click', () => {
            const name = newCollectionName.value.trim();
            if (createCollection(name)) {
                newCollectionName.value = '';
            }
        });

        newCollectionName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                btnCreateCollection.click();
            }
        });
    }

    id("btnSettingsToggleTheme")?.addEventListener("click", () => {
        const current =
            document.documentElement.getAttribute("data-theme") || "synthwave";
        applyTheme(current === "synthwave" ? "cupcake" : "synthwave");
    });

    id("btnSettingsSave")?.addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        const originalContent = btn.innerHTML;

        // 1. Read values from inputs
        const typeSelect = id("settingsDefaultMediaType");
        if (typeSelect) state.prefs.defaultMediaType = typeSelect.value;

        const minRating = id("settingsDefaultMinRating");
        if (minRating) state.prefs.defaultMinRating = Number(minRating.value);

        const exclude = id("settingsDefaultExcludeWatched");
        if (exclude) state.prefs.defaultExcludeWatched = exclude.checked;

        // 2. Persist
        savePrefs(); // local storage
        if (state.user) {
            // If you have a firebase function, await it here
            await saveUserPrefsToFirebase(state.user.uid, state.prefs);
        }
        applyPrefsToUI(); // Update UI immediately

        // 3. Animation: Switch to success state
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-success", "text-white");
        btn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Saved!
        `;

        // 4. Close after delay
        setTimeout(() => {
            id("dlgSettings")?.close();

            // Reset button state for next time
            setTimeout(() => {
                btn.classList.add("btn-primary");
                btn.classList.remove("btn-success", "text-white");
                btn.innerHTML = originalContent;
            }, 200);
        }, 1000);
    });

    id("settingsThemeToggle")?.addEventListener("change", () => {
        const toggle = id("settingsThemeToggle");
        if (!toggle) return;

        const nextTheme = toggle.checked ? "synthwave" : "cupcake";
        applyTheme(nextTheme); // you already have applyTheme(theme)
    });

    // Persist settings changes
    id("settingsExcludeWatched")?.addEventListener("change", () => {
        const on = id("settingsExcludeWatched").checked;
        state.filters.excludeWatched = on;
        saveJson(LSFILTERS, state.filters);
    });

    id("settingsMinRating")?.addEventListener("input", () => {
        const v = Number(id("settingsMinRating").value);
        state.filters.minRating = Number.isFinite(v) ? v : 0;
        saveJson(LSFILTERS, state.filters);
    });

    bindDropdownRowToggle("genreDropdownMenu");
    bindDropdownRowToggle("ottDropdownMenu");

    await populateGenreSelect(state.filters.mediaType || "movie");

    renderPager();
    updateUserChip();
    syncUserMenu();
    updateSignOutLabel();
    await loadSharedListFromUrl();
    const { importSharedCollection } = await import('./collections.js');
    await importSharedCollection();
    syncCreateRoomButton();

    // in boot(), right after determining roomId
    const url = new URL(window.location.href);
    const roomId = url.searchParams.get("room");

    if (!roomId) {
        // ensure we are not considered "in a room" from old state
        roomState.id = null;
    }

    const fa = window.firebaseAuth;

    fa.onAuthStateChanged(fa.auth, async (user) => {
        authState.user = user || null;
        const fs = window.firebaseStore;

        if (user && fs) {
            // Create/update user document
            await fs.setDoc(
                fs.doc(fs.db, "users", user.uid),
                { email: user.email || null, createdAt: fs.serverTimestamp() },
                { merge: true }

            );

            // LOAD COLLECTIONS FROM FIRESTORE - FIX: import both functions
            const { loadCollectionsFromCloud, renderCollections } = await import('./collections.js');
            await loadCollectionsFromCloud();
            renderCollections();
            const { loadFriendsFromCloud } = await import('./friends.js');
            await loadFriendsFromCloud();

            // ========== LOAD FIRESTORE DATA FIRST (COMBINED FETCH) ==========
            try {
                const userRef = fs.doc(fs.db, "users", user.uid);
                const snap = await fs.getDoc(userRef);

                if (snap.exists()) {
                    const data = snap.data();

                    // Store user data globally
                    window.firestoreUserData = data;

                    // Load preferences if they exist
                    if (data.prefs && typeof data.prefs === "object") {
                        state.prefs = { ...state.prefs, ...data.prefs };
                        savePrefs();
                        applyPrefsToUI();
                        applyTheme(state.prefs.theme);
                    }
                }
            } catch (e) {
                console.warn("Failed to load user data:", e);
            }

            // ========== UPDATE UI AFTER DATA IS LOADED ==========
            updateUserChip();
            syncUserMenu();
            updateSignOutLabel();
            syncCreateRoomButton();

            // Handle room joining
            const url = new URL(window.location.href);
            const roomId = url.searchParams.get("room");

            if (roomId) {
                joinRoom(roomId);
                return;
            }

            roomState.id = null;
            updateRoomUI();

            await ensureUserDoc();
            startUserDocListener();

        } else {
            // User signed out - FIX: load from localStorage
            window.firestoreUserData = {};
            roomState.id = null;

            // Load collections from localStorage when signed out
            const { loadCollections } = await import('./collections.js');
            loadCollections();

            updateRoomUI();
            updateUserChip();
            syncUserMenu();
            updateSignOutLabel();
        }
    });




    const qEl = id("q");

    // Replace your exclude watched handler (around line 780) with this:
    id("excludeWatched")?.addEventListener("change", () => {
        const poolWrap = document.getElementById('pool');

        // Fade out
        if (poolWrap) {
            poolWrap.style.transition = 'opacity 0.15s ease';
            poolWrap.style.opacity = '0';
        }

        // Update state
        state.filters.excludeWatched = id("excludeWatched").checked;
        saveJson(LSFILTERS, state.filters);

        // Wait for fade, then render and fade in
        setTimeout(() => {
            renderPool();

            if (poolWrap) {
                setTimeout(() => {
                    poolWrap.style.opacity = '1';
                }, 10);
            }
        }, 150);
    });


    let minRatingTimer;
    id("minRatingPool")?.addEventListener("input", () => {
        const slider = id("minRatingPool");
        const display = id("minRatingPoolDisplay");
        const v = Number(slider.value);

        // Update display immediately (no lag)
        if (display) {
            display.textContent = v.toFixed(1);
        }

        // Update state immediately
        state.filters.minRating = Number.isFinite(v) ? v : 0;

        // Debounce the save and render (reduce rapid calls)
        clearTimeout(minRatingTimer);
        minRatingTimer = setTimeout(() => {
            saveJson(LSFILTERS, state.filters);
            renderPool();
        }, 150); // Wait 150ms after user stops dragging
    });

    id("btnMenuSettings")?.addEventListener("click", () => {
        document.getElementById("dlgSettings")?.showModal();
    });

    id("btnRoomBadge")?.addEventListener("click", () => {
        document.getElementById("roomChatColumn")?.scrollIntoView({ behavior: "smooth" });
        id("roomChatInput")?.focus();
    });

    id("btnSearch")?.addEventListener("click", () => doSearch(1));
    id("btnTrending")?.addEventListener("click", () => loadTrending(1));

    id("btnPick")?.addEventListener("click", () => pickForMe());
    id("btnPickPool")?.addEventListener("click", pickForMe);

    id("btnReroll")?.addEventListener("click", rerollPick);
    id("btnWatched")?.addEventListener("click", markCurrentWatched);

    id("btnCopyRoomLink")?.addEventListener("click", copyRoomLink);

    id("btnImportList")?.addEventListener("click", importSharedListToAccount);
    id("btnToggleHiddenPool")?.addEventListener("click", toggleHiddenPoolItems);
    id("btnOpenPicked")?.addEventListener("click", () => {
        if (!lastPickedMovieId) return toast("No pick yet.", "info");
        openDetails(lastPickedMovieId, { highlight: true });
    });

    id("btnClearPool")?.addEventListener("click", clearPool);
    id("btnShareList")?.addEventListener("click", sharePoolOnWhatsApp);

    id("btnCreateRoom")?.addEventListener("click", createRoom);
    id("btnLeaveRoom")?.addEventListener("click", async () => {
        await leaveRoom();
        // optional immediate UI reset
        const members = document.getElementById("roomMembersWrap");
        const chatCol = document.getElementById("roomChatColumn");
        members?.classList.add("hidden");
        chatCol?.classList.add("hidden");
    });

    function boot() {
        loadPrefs();
        applyPrefsToUI(); // your function that syncs filters/controls from state.prefs
        // rest of init
    }

    id("btnResetFilters")?.addEventListener("click", resetAllFilters);

    id("q")?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doSearch(1);
    });

    id("q")?.addEventListener("input", () => {
        if (liveSearchTimer) clearTimeout(liveSearchTimer);

        liveSearchTimer = setTimeout(() => {
            const query = id("q")?.value.trim() || "";

            if (!query) return loadTrending(1);
            if (query.length < 2) return;

            doSearch(1);
        }, 350);
    });

    id("resultSort")?.addEventListener("change", () => {
        if (state.lastMode === "trending") loadTrending(1);
        else doSearch(1);
    });

    id("mediaType")?.addEventListener("change", async () => {
        state.filters.mediaType = id("mediaType").value;
        saveJson(LSFILTERS, state.filters);
        await populateGenreSelect(state.filters.mediaType);
        doSearch(1);
    });

    id("yearFilter")?.addEventListener("input", () => {
        state.filters.year = id("yearFilter").value;
        saveJson(LSFILTERS, state.filters);
    });

    id("btnMenuSignIn")?.addEventListener("click", openAuthDialog);
    id("btnMenuSignOut")?.addEventListener("click", handleSignOut);

    id("btnMenuCopyUid")?.addEventListener("click", async () => {
        const uid = authState.user?.uid;
        if (!uid) return toast("Not signed in.", "info");
        try {
            await navigator.clipboard.writeText(uid);
            toast("UID copied.", "success");
        } catch {
            window.prompt("Copy UID:", uid);
        }
    });

    id("btnAuthSubmit")?.addEventListener("click", handleAuthSubmit);
    id("btnGoogleDemo")?.addEventListener("click", handleGoogleSignIn);
    id("btnGithub")?.addEventListener("click", handleGithubSignIn);
    id("btnTwitter")?.addEventListener("click", handleTwitterSignIn);


    id("btnPrevPage")?.addEventListener("click", () => {
        if (state.page <= 1 || state.busy) return;
        const nextPage = state.page - 1;
        if (state.lastMode === "trending") loadTrending(nextPage);
        else doSearch(nextPage);
    });

    id("btnNextPage")?.addEventListener("click", () => {
        if (state.page >= state.totalPages || state.busy) return;
        const nextPage = state.page + 1;
        if (state.lastMode === "trending") loadTrending(nextPage);
        else doSearch(nextPage);
    });

    // --------------------------------------------------
    // Chat form + reply + mentions + tray wiring
    // --------------------------------------------------
    const chatForm = id("roomChatForm");
    const chatShell = id("roomChatShell");
    const chatMessages = id("roomChatMessages");
    const chatResize = id("roomChatResize");

    if (chatShell && chatMessages && chatResize) {
        let resizing = false;
        let startY = 0;
        let startHeight = 0;

        chatResize.addEventListener("mousedown", (e) => {
            if (chatShell.classList.contains("fullscreen")) return;
            resizing = true;
            startY = e.clientY;
            startHeight = chatMessages.offsetHeight;
            document.body.style.userSelect = "none";
        });

        window.addEventListener("mousemove", (e) => {
            if (!resizing) return;
            const delta = e.clientY - startY;
            let next = startHeight + delta;
            next = Math.max(120, Math.min(next, window.innerHeight * 0.8));
            chatMessages.style.height = `${next}px`;
        });

        window.addEventListener("mouseup", () => {
            if (!resizing) return;
            resizing = false;
            document.body.style.userSelect = "";
        });

        // Double‑click handle to toggle a pseudo‑fullscreen modal
        chatResize.addEventListener("dblclick", () => {
            chatShell.classList.toggle("fullscreen");
        });
    }

    const chatInput = id("roomChatInput");
    const gifBtn = id("roomGifBtn");
    const stickerBtn = id("roomStickerBtn");
    const emojiBtn = id("roomEmojiBtn");
    const gifTab = document.getElementById("chatTrayTabGif");
    const stickerTab = document.getElementById("chatTrayTabSticker");
    const emojiTab = document.getElementById("chatTrayTabEmoji");

    function linkTrayHover(tabEl, btnEl) {
        if (!tabEl || !btnEl) return;
        tabEl.addEventListener("mouseenter", () => {
            btnEl.classList.add("chat-tray-pulse");
        });
        tabEl.addEventListener("mouseleave", () => {
            btnEl.classList.remove("chat-tray-pulse");
        });
    }

    linkTrayHover(gifTab, gifBtn);
    linkTrayHover(stickerTab, stickerBtn);
    linkTrayHover(emojiTab, emojiBtn);

    const tray = id("chatTray");
    const trayGrid = id("chatTrayGrid");
    const traySearch = id("chatTraySearch");
    const trayClose = id("chatTrayClose");
    const tabGif = id("chatTrayTabGif");
    const tabSticker = id("chatTrayTabSticker");
    const tabEmoji = id("chatTrayTabEmoji");

    const replyPreview = id("roomReplyPreview");
    const replyToName = id("roomReplyToName");
    const replyToSnippet = id("roomReplyToSnippet");
    const replyClear = id("roomReplyClear");

    const mentionBox = id("mentionSuggestions");
    let mentionActive = false;
    let mentionStartIndex = -1;

    const dmGifBtn = document.getElementById('dmGifBtn');
    const dmStickerBtn = document.getElementById('dmStickerBtn');
    const dmEmojiBtn = document.getElementById('dmEmojiBtn');
    const dmVoiceBtn = document.getElementById('dmVoiceBtn');

    console.log('DM Buttons found:', {
        gif: !!dmGifBtn,
        sticker: !!dmStickerBtn,
        emoji: !!dmEmojiBtn,
        voice: !!dmVoiceBtn
    });

    // DM-specific handlers
    async function sendDMGifHandler(gif) {
        console.log('Sending DM GIF:', gif.url);
        const { sendDMGif } = await import('./dm.js');
        await sendDMGif(gif.url);
        closeTray(tray);
    }

    async function sendDMStickerHandler(sticker) {
        console.log('Sending DM Sticker:', sticker.url);
        const { sendDMSticker } = await import('./dm.js');
        await sendDMSticker(sticker.url);
        closeTray(tray);
    }

    // Wire up DM buttons
    if (dmGifBtn) {
        console.log('Wiring DM GIF button');
        dmGifBtn.addEventListener('click', () => {
            console.log('DM GIF clicked!');
            openTray('gif', tray, trayGrid, traySearch, tabGif, tabSticker, tabEmoji);
            renderTrayGifs('', trayGrid, sendDMGifHandler);
        });
    }

    if (dmStickerBtn) {
        console.log('Wiring DM Sticker button');
        dmStickerBtn.addEventListener('click', () => {
            console.log('DM Sticker clicked!');
            openTray('sticker', tray, trayGrid, traySearch, tabGif, tabSticker, tabEmoji);
            renderTrayStickers('', trayGrid, sendDMStickerHandler);
        });
    }

    if (dmEmojiBtn && dmInput) {
        console.log('Wiring DM Emoji button');
        dmEmojiBtn.addEventListener('click', () => {
            console.log('DM Emoji clicked!');
            openTray('emoji', tray, trayGrid, traySearch, tabGif, tabSticker, tabEmoji);
            renderTrayEmojis('', trayGrid, dmInput, tray);
        });
    }

    // Voice note for DM (reuse your existing voice recording logic)
    if (dmVoiceBtn) {
        dmVoiceBtn.addEventListener('click', async () => {
            // Start recording (reuse existing mediaRecorder logic)
            // Same as room voice, but call sendDMVoice instead
            // TODO: Extract your voice recording to a shared function
        });
    }

    // Close DM on backdrop click
    document.getElementById('dmModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'dmModal') {
            closeDM();
        }
    });

    function hideMentionBox() {
        mentionActive = false;
        mentionStartIndex = -1;
        if (mentionBox) mentionBox.classList.add("hidden");
    }

    function renderMentionBox(list) {
        if (!mentionBox) return;
        mentionBox.innerHTML = "";

        mentionBox.className =
            "absolute bottom-9 left-0 w-56 bg-base-100 border border-base-300 " +
            "rounded-xl shadow-lg z-20 py-1";

        for (const m of list) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className =
                "w-full text-left px-3 py-1.5 text-xs hover:bg-base-200 flex items-center";

            const name = document.createElement("span");
            name.className = "font-semibold truncate";
            name.textContent = m.name || "Anon";

            btn.appendChild(name);

            btn.addEventListener("click", () => {
                applyMention(m);
            });
            mentionBox.appendChild(btn);
        }
        mentionBox.classList.remove("hidden");
    }

    function applyMention(member) {
        if (!mentionActive || mentionStartIndex < 0 || !chatInput) return;
        const value = chatInput.value;
        const caret = chatInput.selectionStart ?? value.length;
        const before = value.slice(0, mentionStartIndex);
        const after = value.slice(caret);
        const mentionText = "@" + (member.name || "Anon") + " ";
        chatInput.value = before + mentionText + after;
        const newCaret = before.length + mentionText.length;
        chatInput.focus();
        chatInput.setSelectionRange(newCaret, newCaret);
        hideMentionBox();
    }

    function extractMentions(text) {
        const names = new Set();
        const regex = /@([^\s@]+)/g;
        let m;
        while ((m = regex.exec(text))) {
            names.add(m[1]);
        }

        const members = roomState.members || [];
        const result = [];
        for (const name of names) {
            const match = members.find((u) => {
                const n = (u.name || "").split(" ")[0];
                return n === name || (u.name || "") === name;
            });
            if (match) {
                result.push({ userId: match.id, name: match.name });
            }
        }
        return result;
    }

    function clearReplyDraft() {
        currentReplyTarget = null;
        if (replyPreview) replyPreview.classList.add("hidden");
    }

    registerReplyDraftSetter((msg) => {
        currentReplyTarget = msg || null;
        if (!msg) {
            if (replyPreview) replyPreview.classList.add("hidden");
            return;
        }
        if (replyPreview) replyPreview.classList.remove("hidden");
        if (replyToName) replyToName.textContent = msg.userName || "Anon";
        if (replyToSnippet) {
            if (msg.type === "gif") {
                replyToSnippet.textContent = "GIF";
            } else if (msg.type === "sticker") {
                replyToSnippet.textContent = "Sticker";
            } else {
                const t = msg.text || "";
                replyToSnippet.textContent =
                    t.length > 30 ? t.slice(0, 30) + "…" : t || "";
            }
        }
    });

    if (replyClear) {
        replyClear.addEventListener("click", () => {
            clearReplyDraft();
        });
    }

    // Prevent duplicate message submissions
    let lastMessageTime = 0;
    let lastMessageText = "";

    if (chatForm && chatInput) {
        chatForm.addEventListener("submit", async (e) => {
            e.preventDefault();

            const text = chatInput.value.trim();
            if (!text || !roomState.id) return;

            // Prevent duplicate messages (same text within 1 second)
            const now = Date.now();
            if (text === lastMessageText && now - lastMessageTime < 1000) {
                console.log("Duplicate message blocked");
                return;
            }

            lastMessageTime = now;
            lastMessageText = text;

            const fs = window.firebaseStore;
            if (!fs) return;

            const u = authState.user;
            const mentions = extractMentions(text);

            const payload = {
                type: "text",
                text,
                gifUrl: null,
                stickerUrl: null,
                mentions,
                userId: u?.uid ?? null,
                userName: u?.displayName ?? u?.email ?? "Anon",
                createdAt: fs.serverTimestamp(),
                reactions: {},
            };

            if (currentReplyTarget) {
                payload.replyTo = {
                    id: currentReplyTarget.id,
                    userName: currentReplyTarget.userName || "Anon",
                    type: currentReplyTarget.type || "text",
                    text: currentReplyTarget.text || null,
                    gifUrl: currentReplyTarget.gifUrl || null,
                    stickerUrl: currentReplyTarget.stickerUrl || null,
                };
            }

            try {
                await fs.addDoc(
                    fs.collection(fs.db, `rooms/${roomState.id}/messages`),
                    payload
                );
                chatInput.value = "";
                clearReplyDraft();
                hideMentionBox();
            } catch (err) {
                toast("Failed to send message.", "error");
                console.warn(err);
            }
        });
    }



    // Send GIF / Sticker helpers used by tray
    async function sendGifMessage(gif) {
        if (!roomState.id) return;
        const fs = window.firebaseStore;
        if (!fs) return;
        const u = authState.user;

        const payload = {
            type: "gif",
            text: null,
            gifUrl: gif.url,
            stickerUrl: null,
            mentions: [],
            userId: u?.uid ?? null,
            userName: u?.displayName ?? u?.email ?? "Anon",
            createdAt: fs.serverTimestamp(),
            reactions: {},
        };

        if (currentReplyTarget) {
            payload.replyTo = {
                id: currentReplyTarget.id,
                userName: currentReplyTarget.userName || "Anon",
                type: currentReplyTarget.type || "text",
                text: currentReplyTarget.text || null,
                gifUrl: currentReplyTarget.gifUrl || null,
                stickerUrl: currentReplyTarget.stickerUrl || null,
            };
        }

        try {
            await fs.addDoc(
                fs.collection(fs.db, "rooms", roomState.id, "messages"),
                payload
            );
            clearReplyDraft();
            closeTray(tray);
        } catch (err) {
            toast("Failed to send GIF.", "error");
            console.warn(err);
        }
    }

    async function sendStickerMessage(sticker) {
        if (!roomState.id) return;
        const fs = window.firebaseStore;
        if (!fs) return;
        const u = authState.user;

        const payload = {
            type: "sticker",
            text: null,
            gifUrl: null,
            stickerUrl: sticker.url,
            mentions: [],
            userId: u?.uid ?? null,
            userName: u?.displayName ?? u?.email ?? "Anon",
            createdAt: fs.serverTimestamp(),
            reactions: {},
        };

        if (currentReplyTarget) {
            payload.replyTo = {
                id: currentReplyTarget.id,
                userName: currentReplyTarget.userName || "Anon",
                type: currentReplyTarget.type || "text",
                text: currentReplyTarget.text || null,
                gifUrl: currentReplyTarget.gifUrl || null,
                stickerUrl: currentReplyTarget.stickerUrl || null,
            };
        }

        try {
            await fs.addDoc(
                fs.collection(fs.db, "rooms", roomState.id, "messages"),
                payload
            );
            clearReplyDraft();
            closeTray(tray);
        } catch (err) {
            toast("Failed to send sticker.", "error");
            console.warn(err);
        }
    }

    // Open from small buttons
    if (gifBtn && tray && trayGrid && traySearch) {
        gifBtn.addEventListener("click", () =>
            openTray("gif", tray, trayGrid, traySearch, tabGif, tabSticker, tabEmoji)
        );
    }
    if (stickerBtn && tray && trayGrid && traySearch) {
        stickerBtn.addEventListener("click", () =>
            openTray("sticker", tray, trayGrid, traySearch, tabGif, tabSticker, tabEmoji)
        );
    }
    if (emojiBtn && tray && trayGrid && traySearch) {
        emojiBtn.addEventListener("click", () =>
            openTray("emoji", tray, trayGrid, traySearch, tabGif, tabSticker, tabEmoji)
        );
    }

    // Tabs inside the tray
    tabGif?.addEventListener("click", () => {
        openTray("gif", tray, trayGrid, traySearch, tabGif, tabSticker, tabEmoji);
        // initial list
        renderTrayGifs("", trayGrid, sendGifMessage);
    });

    tabSticker?.addEventListener("click", () => {
        openTray("sticker", tray, trayGrid, traySearch, tabGif, tabSticker, tabEmoji);
        renderTrayStickers("", trayGrid, sendStickerMessage);
    });

    tabEmoji?.addEventListener("click", () => {
        openTray("emoji", tray, trayGrid, traySearch, tabGif, tabSticker, tabEmoji);
        renderTrayEmojis("", trayGrid, chatInput, tray);
    });

    trayClose?.addEventListener("click", () => closeTray(tray));

    // Search inside tray
    if (traySearch) {
        traySearch.addEventListener("input", () => {
            if (traySearchTimer) clearTimeout(traySearchTimer);
            traySearchTimer = setTimeout(() => {
                const q = traySearch.value.trim();
                if (trayMode === "gif") {
                    renderTrayGifs(q, trayGrid, sendGifMessage);
                } else if (trayMode === "sticker") {
                    renderTrayStickers(q, trayGrid, sendStickerMessage);
                } else if (trayMode === "emoji") {
                    renderTrayEmojis(q, trayGrid, chatInput, tray);
                }
            }, 250);
        });
    }


    if (trayClose) {
        trayClose.addEventListener("click", () => closeTray(tray));
    }

    // Find this code (around line 1900) and UPDATE it:
    document.addEventListener("click", (e) => {
        if (!tray || tray.classList.contains("hidden")) return;
        const t = e.target;
        const insideTray = tray.contains(t);

        // ADD DM BUTTONS HERE:
        const insideBtns =
            gifBtn?.contains(t) ||
            stickerBtn?.contains(t) ||
            emojiBtn?.contains(t) ||
            dmGifBtn?.contains(t) ||      // ADD
            dmStickerBtn?.contains(t) ||  // ADD
            dmEmojiBtn?.contains(t);       // ADD

        if (!insideTray && !insideBtns) closeTray(tray);
    }, false);

    // Add to js/main.js (at the end of boot function)

    window.addEventListener('scroll', () => {
        const hero = document.getElementById('hero');
        const scrolled = window.pageYOffset;

        if (hero && scrolled < 300) {
            hero.style.transform = `translateY(${scrolled * 0.5}px)`;
            hero.style.opacity = 1 - (scrolled / 500);
        }
    });

    // Initialize scroll indicator
    initScrollIndicator();

    // Initialize magnetic buttons
    initMagneticButtons();

    // Initialize parallax hero
    initParallaxHero();

    // Add particle burst to action buttons
    const burstButtons = [
        '#btnSearch',
        '#btnPick',
        '#btnPickPool',
        '#btnReroll'
    ];
    burstButtons.forEach(selector => {
        const btn = document.querySelector(selector);
        if (btn) addParticleBurst(btn);
    });

    // CHAT ENHANCEMENTS - ADD THESE:
    initChatInputEffects();
    enhanceVoiceNoteAnimations();
    initMessageContextMenu();
    initChatResizeEffects();

    // Add reaction animations to existing reactions
    document.addEventListener('click', (e) => {
        const reactionBtn = e.target.closest('.chat-message button[class*="badge"]');
        if (reactionBtn) {
            addReactionAnimation(reactionBtn);
        }
    });

    // At END of boot() - ONLY listen for changes, don't init immediately
    document.addEventListener('themeChanged', () => {
        const theme = document.documentElement.getAttribute('data-theme');

        // Clean up old effects
        document.querySelectorAll('.heart-particle').forEach(el => el.remove());
        stopBubbles();
        const oldLine = document.getElementById('vhsTrackingLine');
        if (oldLine) oldLine.remove();

        // Initialize NEW theme effects
        if (theme === 'cupcake') {
            initCupcakeEffects();
        } else if (theme === 'synthwave') {
            initSynthwaveEffects();
        }
    });

    // Initialize for current theme ONCE on page load
    const currentTheme = document.documentElement.getAttribute('data-theme');
    if (currentTheme === 'cupcake') {
        initCupcakeEffects();
    }

    // In boot() function, add:
    const btnQuickCreate = document.getElementById('btnQuickCreate');
    const quickCollectionName = document.getElementById('quickCollectionName');

    if (btnQuickCreate && quickCollectionName) {
        btnQuickCreate.addEventListener('click', async () => {
            const name = quickCollectionName.value.trim();
            if (!name) return;

            const collection = createCollection(name);
            if (collection && state.currentDetails) {
                // Import addToCollection
                const { addToCollection } = await import('./collections.js');

                // Add current movie to new collection
                addToCollection(collection.id, {
                    id: state.currentDetails.id,
                    title: state.currentDetails.title || state.currentDetails.name,
                    posterPath: state.currentDetails.poster_path,
                    voteAverage: state.currentDetails.vote_average,
                    releaseDate: state.currentDetails.release_date || state.currentDetails.first_air_date,
                    mediaType: state.currentDetails.mediaType || 'movie',
                });

                quickCollectionName.value = '';

                // CLOSE THE MODAL
                document.getElementById('dlgCollectionPicker')?.close();

                toast(`Added to new collection "${name}"`, "success");
            }
        });
    }

}

if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
else boot();