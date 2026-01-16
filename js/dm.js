// js/dm.js

import { authState } from "./state.js";
import { toast } from "./ui.js";

let activeConversation = null;
let unsubMessages = null;

// Generate conversation ID (alphabetically sorted UIDs)
export function getConversationId(uid1, uid2) {
    return [uid1, uid2].sort().join('_');
}

// Open DM with a user
export async function openDM(otherUserUid, otherUserName) {
    const myUid = authState.user?.uid;

    if (!myUid) {
        toast("Sign in to send messages", "info");
        return;
    }

    if (myUid === otherUserUid) {
        toast("Can't message yourself", "info");
        return;
    }

    activeConversation = {
        id: getConversationId(myUid, otherUserUid),
        otherUid: otherUserUid,
        otherName: otherUserName,
    };

    // Open DM modal
    const dmModal = document.getElementById('dmModal');
    if (dmModal) {
        document.getElementById('dmRecipientName').textContent = otherUserName;
        dmModal.classList.remove('hidden');
        loadDMMessages();
    }
}

// Load DM messages
export function loadDMMessages() {
    if (!activeConversation) return;

    const fs = window.firebaseStore;
    if (!fs) return;

    // Stop previous listener
    if (unsubMessages) unsubMessages();

    const messagesCol = fs.collection(
        fs.db,
        `directMessages/${activeConversation.id}/messages`
    );

    const q = fs.query(
        messagesCol,
        fs.orderBy('createdAt', 'asc'),
        fs.limit(100)
    );

    unsubMessages = fs.onSnapshot(q, (snap) => {
        const messages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderDMMessages(messages);
    }, (err) => {
        console.warn('DM messages listener failed', err);
    });
}

// Add to js/dm.js:

// Send GIF in DM
export async function sendDMGif(gifUrl) {
    if (!activeConversation) return;

    const fs = window.firebaseStore;
    const myUid = authState.user?.uid;

    if (!fs || !myUid) return;

    try {
        const convRef = fs.doc(fs.db, 'directMessages', activeConversation.id);
        await fs.setDoc(
            convRef,
            {
                participants: [myUid, activeConversation.otherUid],
                lastMessage: '[GIF]',
                lastMessageAt: fs.serverTimestamp(),
                updatedAt: fs.serverTimestamp(),
            },
            { merge: true }
        );

        await fs.addDoc(
            fs.collection(fs.db, `directMessages/${activeConversation.id}/messages`),
            {
                type: 'gif',
                gifUrl: gifUrl,
                senderId: myUid,
                createdAt: fs.serverTimestamp(),
            }
        );
    } catch (e) {
        console.error('Failed to send GIF', e);
        toast("Failed to send GIF", "error");
    }
}

// Send Sticker in DM
export async function sendDMSticker(stickerUrl) {
    if (!activeConversation) return;

    const fs = window.firebaseStore;
    const myUid = authState.user?.uid;

    if (!fs || !myUid) return;

    try {
        const convRef = fs.doc(fs.db, 'directMessages', activeConversation.id);
        await fs.setDoc(
            convRef,
            {
                participants: [myUid, activeConversation.otherUid],
                lastMessage: '[Sticker]',
                lastMessageAt: fs.serverTimestamp(),
                updatedAt: fs.serverTimestamp(),
            },
            { merge: true }
        );

        await fs.addDoc(
            fs.collection(fs.db, `directMessages/${activeConversation.id}/messages`),
            {
                type: 'sticker',
                stickerUrl: stickerUrl,
                senderId: myUid,
                createdAt: fs.serverTimestamp(),
            }
        );
    } catch (e) {
        console.error('Failed to send sticker', e);
        toast("Failed to send sticker", "error");
    }
}

// Send Voice Note in DM
export async function sendDMVoice(voiceUrl, duration) {
    if (!activeConversation) return;

    const fs = window.firebaseStore;
    const myUid = authState.user?.uid;

    if (!fs || !myUid) return;

    try {
        const convRef = fs.doc(fs.db, 'directMessages', activeConversation.id);
        await fs.setDoc(
            convRef,
            {
                participants: [myUid, activeConversation.otherUid],
                lastMessage: '[Voice]',
                lastMessageAt: fs.serverTimestamp(),
                updatedAt: fs.serverTimestamp(),
            },
            { merge: true }
        );

        await fs.addDoc(
            fs.collection(fs.db, `directMessages/${activeConversation.id}/messages`),
            {
                type: 'voice',
                voiceUrl: voiceUrl,
                voiceDuration: duration,
                senderId: myUid,
                createdAt: fs.serverTimestamp(),
            }
        );
    } catch (e) {
        console.error('Failed to send voice note', e);
        toast("Failed to send voice note", "error");
    }
}

// Render conversations list in floating button
export async function renderConversationsList() {
    const container = document.getElementById('dmConversationsList');
    const floatingBtn = document.getElementById('floatingDMBtn');
    const unreadBadge = document.getElementById('dmUnreadBadge');

    if (!container || !floatingBtn) return;

    const conversations = await getMyConversations();

    if (conversations.length === 0) {
        container.innerHTML = '<p class="text-xs opacity-60 p-2">No messages yet</p>';
        floatingBtn.classList.add('hidden');
        return;
    }

    // Show floating button if user has conversations
    floatingBtn.classList.remove('hidden');

    container.innerHTML = '';

    for (const conv of conversations) {
        // Get other person's UID
        const myUid = authState.user?.uid;
        const otherUid = conv.participants.find(uid => uid !== myUid);

        const userInfo = await getUserInfo(otherUid);

        const item = document.createElement('button');
        item.className = 'w-full text-left p-2 hover:bg-base-200 rounded-lg transition';

        item.innerHTML = `
        <div class="flex items-center gap-2">
          <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo?.name || 'User')}&size=32" 
               class="w-8 h-8 rounded-full">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-xs truncate">${escapeHtml(userInfo?.name || 'User')}</p>
            <p class="text-xs opacity-60 truncate">${escapeHtml(conv.lastMessage || '')}</p>
          </div>
        </div>
      `;

        item.addEventListener('click', () => {
            openDM(otherUid, userInfo?.name || 'User');
            document.getElementById('dmQuickList')?.classList.add('hidden');
        });

        container.appendChild(item);
    }

    // Update unread count (you can enhance this later)
    // For now, just show conversation count
    if (unreadBadge && conversations.length > 0) {
        unreadBadge.textContent = conversations.length;
        unreadBadge.classList.remove('hidden');
    }
}


// Update renderDMMessages to handle all message types:
function renderDMMessages(messages) {
    const container = document.getElementById('dmMessages');
    if (!container) return;

    const myUid = authState.user?.uid;

    container.innerHTML = '';

    messages.forEach(msg => {
        const isMe = msg.senderId === myUid;

        const msgDiv = document.createElement('div');
        msgDiv.className = `flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`;

        let content = '';

        // Handle different message types
        if (msg.type === 'gif' && msg.gifUrl) {
            content = `<img src="${msg.gifUrl}" class="max-w-xs rounded-lg" alt="GIF">`;
        } else if (msg.type === 'sticker' && msg.stickerUrl) {
            content = `<img src="${msg.stickerUrl}" class="w-32 h-32 object-contain" alt="Sticker">`;
        } else if (msg.type === 'voice' && msg.voiceUrl) {
            content = `
          <div class="voice-note-container">
            <!-- Voice note player - reuse your existing component -->
            <audio src="${msg.voiceUrl}" controls class="max-w-xs"></audio>
          </div>
        `;
        } else {
            // Text message
            content = `<p class="text-sm">${escapeHtml(msg.text || '')}</p>`;
        }

        msgDiv.innerHTML = `
        <div class="${isMe ? 'bg-primary text-primary-content' : 'bg-base-200'} 
                    px-3 py-2 rounded-lg max-w-xs">
          ${content}
          <p class="text-xs opacity-70 mt-1">
            ${msg.createdAt?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ''}
          </p>
        </div>
      `;

        container.appendChild(msgDiv);
    });

    container.scrollTop = container.scrollHeight;
}

// Send DM
export async function sendDM(text) {
    if (!activeConversation || !text.trim()) return;

    const fs = window.firebaseStore;
    const myUid = authState.user?.uid;

    if (!fs || !myUid) return;

    try {
        // Create conversation document if it doesn't exist
        const convRef = fs.doc(fs.db, 'directMessages', activeConversation.id);
        await fs.setDoc(
            convRef,
            {
                participants: [myUid, activeConversation.otherUid],
                lastMessage: text.trim().slice(0, 50),
                lastMessageAt: fs.serverTimestamp(),
                updatedAt: fs.serverTimestamp(),
            },
            { merge: true }
        );

        // Add message
        await fs.addDoc(
            fs.collection(fs.db, `directMessages/${activeConversation.id}/messages`),
            {
                text: text.trim(),
                senderId: myUid,
                createdAt: fs.serverTimestamp(),
            }
        );

        // Clear input
        const input = document.getElementById('dmInput');
        if (input) input.value = '';

    } catch (e) {
        console.error('Failed to send DM', e);
        toast("Failed to send message", "error");
    }
}

// Close DM
export function closeDM() {
    if (unsubMessages) unsubMessages();
    unsubMessages = null;
    activeConversation = null;

    const dmModal = document.getElementById('dmModal');
    if (dmModal) dmModal.classList.add('hidden');
}

// Get my conversations list
export async function getMyConversations() {
    const fs = window.firebaseStore;
    const myUid = authState.user?.uid;

    if (!fs || !myUid) return [];

    try {
        const convsCol = fs.collection(fs.db, 'directMessages');
        const q = fs.query(
            convsCol,
            fs.where('participants', 'array-contains', myUid),
            fs.orderBy('lastMessageAt', 'desc')
        );

        const snap = await fs.getDocs(q);
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (e) {
        console.warn('Failed to load conversations', e);
        return [];
    }
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}
