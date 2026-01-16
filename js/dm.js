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

// Render messages
function renderDMMessages(messages) {
    const container = document.getElementById('dmMessages');
    if (!container) return;

    const myUid = authState.user?.uid;

    container.innerHTML = '';

    messages.forEach(msg => {
        const isMe = msg.senderId === myUid;

        const msgDiv = document.createElement('div');
        msgDiv.className = `flex ${isMe ? 'justify-end' : 'justify-start'} mb-2`;

        msgDiv.innerHTML = `
      <div class="${isMe ? 'bg-primary text-primary-content' : 'bg-base-200'} 
                  px-3 py-2 rounded-lg max-w-xs">
        <p class="text-sm">${escapeHtml(msg.text)}</p>
        <p class="text-xs opacity-70 mt-1">
          ${msg.createdAt?.toDate?.().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ''}
        </p>
      </div>
    `;

        container.appendChild(msgDiv);
    });

    // Scroll to bottom
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
