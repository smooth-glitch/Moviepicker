// js/friends.js

import { state, authState } from "./state.js";
import { loadJson, saveJson } from "./storage.js";
import { toast } from "./ui.js";

const LSFRIENDS = "mnp:friends:v1";

// Load friends from localStorage
export function loadFriends() {
    const data = loadJson(LSFRIENDS, { following: [], followers: [] });
    state.friends = {
        following: data.following || [],
        followers: data.followers || [],
    };
}

// Save friends to localStorage
export function saveFriends() {
    saveJson(LSFRIENDS, state.friends);
    saveFriendsToCloud();
}

// Add friend (follow someone)
export async function addFriend(uid) {
    const myUid = authState.user?.uid;

    if (!myUid) {
        toast("Sign in to add friends", "info");
        return false;
    }

    if (uid === myUid) {
        toast("You can't follow yourself", "info");
        return false;
    }

    if (state.friends.following.includes(uid)) {
        toast("Already following this user", "info");
        return false;
    }

    // Add to my following list
    state.friends.following.push(uid);
    saveFriends();

    // Update their followers list in Firestore
    await addToTheirFollowers(uid, myUid);

    toast("Friend added", "success");
    return true;
}

// Remove friend (unfollow)
export async function removeFriend(uid) {
    const myUid = authState.user?.uid;

    if (!myUid) return false;

    state.friends.following = state.friends.following.filter(id => id !== uid);
    saveFriends();

    // Remove from their followers in Firestore
    await removeFromTheirFollowers(uid, myUid);

    toast("Unfollowed", "info");
    return true;
}

// Check if following someone
export function isFollowing(uid) {
    return state.friends.following.includes(uid);
}

// Get follower/following counts
export function getFriendStats() {
    return {
        following: state.friends.following.length,
        followers: state.friends.followers.length,
    };
}

// Firestore sync - save my following list
async function saveFriendsToCloud() {
    const fs = window.firebaseStore;
    const user = authState.user;

    if (!fs || !user) return;

    try {
        const userRef = fs.doc(fs.db, "users", user.uid);
        await fs.setDoc(
            userRef,
            {
                following: state.friends.following,
                friendsUpdatedAt: fs.serverTimestamp(),
                updatedAt: fs.serverTimestamp(),
            },
            { merge: true }
        );
    } catch (e) {
        console.warn("Failed to save friends to cloud", e);
    }
}

// Load friends from Firestore
export async function loadFriendsFromCloud() {
    const fs = window.firebaseStore;
    const user = window.firebaseAuth?.auth?.currentUser;

    if (!fs || !user) {
        loadFriends();
        return;
    }

    try {
        const userRef = fs.doc(fs.db, "users", user.uid);
        const snap = await fs.getDoc(userRef);

        if (snap.exists()) {
            const data = snap.data();

            state.friends.following = Array.isArray(data.following) ? data.following : [];
            state.friends.followers = Array.isArray(data.followers) ? data.followers : [];

            saveJson(LSFRIENDS, state.friends);
            console.log('Friends loaded from Firestore');
            return;
        }

        loadFriends();
    } catch (e) {
        console.warn('Failed to load friends from Firestore', e);
        loadFriends();
    }
}

// Add me to someone's followers list
async function addToTheirFollowers(theirUid, myUid) {
    const fs = window.firebaseStore;
    if (!fs) return;

    try {
        const theirRef = fs.doc(fs.db, "users", theirUid);
        const snap = await fs.getDoc(theirRef);

        let followers = [];
        if (snap.exists()) {
            const data = snap.data();
            followers = Array.isArray(data.followers) ? data.followers : [];
        }

        if (!followers.includes(myUid)) {
            followers.push(myUid);
            await fs.setDoc(
                theirRef,
                { followers, updatedAt: fs.serverTimestamp() },
                { merge: true }
            );
        }
    } catch (e) {
        console.warn("Failed to update followers", e);
    }
}

// Remove me from someone's followers list
async function removeFromTheirFollowers(theirUid, myUid) {
    const fs = window.firebaseStore;
    if (!fs) return;

    try {
        const theirRef = fs.doc(fs.db, "users", theirUid);
        const snap = await fs.getDoc(theirRef);

        if (snap.exists()) {
            const data = snap.data();
            let followers = Array.isArray(data.followers) ? data.followers : [];
            followers = followers.filter(id => id !== myUid);

            await fs.setDoc(
                theirRef,
                { followers, updatedAt: fs.serverTimestamp() },
                { merge: true }
            );
        }
    } catch (e) {
        console.warn("Failed to update followers", e);
    }
}

// Get user info by UID
export async function getUserInfo(uid) {
    const fs = window.firebaseStore;
    if (!fs) return null;

    try {
        const userRef = fs.doc(fs.db, "users", uid);
        const snap = await fs.getDoc(userRef);

        if (snap.exists()) {
            const data = snap.data();
            return {
                uid: uid,
                name: data.displayName || data.email || 'User',
                email: data.email || null,
                photoURL: data.photoURL || null,
                reviewCount: Object.keys(data.reviews || {}).length,
            };
        }
    } catch (e) {
        console.warn('Failed to get user info', e);
    }

    return null;
}

// Add to js/friends.js:

// Render friends lists
export async function renderFriends() {
    const followingList = document.getElementById('followingList');
    const followersList = document.getElementById('followersList');
    const followingCount = document.getElementById('followingCount');
    const followersCount = document.getElementById('followersCount');

    // Update stats
    if (followingCount) followingCount.textContent = state.friends.following.length;
    if (followersCount) followersCount.textContent = state.friends.followers.length;

    // Render following
    if (followingList) {
        if (state.friends.following.length === 0) {
            followingList.innerHTML = `
          <div class="text-xs opacity-60 p-3 bg-base-200 border border-base-300">
            Not following anyone yet
          </div>
        `;
        } else {
            followingList.innerHTML = '';

            for (const uid of state.friends.following) {
                const userInfo = await getUserInfo(uid);

                const card = document.createElement('div');
                card.className = 'flex items-center justify-between p-3 bg-base-100 border border-base-300 rounded-lg';

                card.innerHTML = `
            <div class="flex items-center gap-3">
              <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo?.name || 'User')}&size=40" 
                   class="w-10 h-10 rounded-full">
              <div>
                <p class="font-semibold text-sm">${escapeHtml(userInfo?.name || 'User')}</p>
                <p class="text-xs opacity-60 font-mono">${uid.slice(0, 8)}...</p>
              </div>
            </div>
            <button class="btn btn-ghost btn-xs" data-action="unfollow" data-uid="${uid}">
              Unfollow
            </button>
          `;

                // Unfollow handler
                card.querySelector('button')?.addEventListener('click', async () => {
                    await removeFriend(uid);
                    renderFriends(); // Refresh
                });

                followingList.appendChild(card);
            }
        }
    }

    // Render followers
    if (followersList) {
        if (state.friends.followers.length === 0) {
            followersList.innerHTML = `
          <div class="text-xs opacity-60 p-3 bg-base-200 border border-base-300">
            No followers yet
          </div>
        `;
        } else {
            followersList.innerHTML = '';

            for (const uid of state.friends.followers) {
                const userInfo = await getUserInfo(uid);
                const isFollowingBack = state.friends.following.includes(uid);

                const card = document.createElement('div');
                card.className = 'flex items-center justify-between p-3 bg-base-100 border border-base-300 rounded-lg';

                card.innerHTML = `
            <div class="flex items-center gap-3">
              <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(userInfo?.name || 'User')}&size=40" 
                   class="w-10 h-10 rounded-full">
              <div>
                <p class="font-semibold text-sm">${escapeHtml(userInfo?.name || 'User')}</p>
                <p class="text-xs opacity-60 font-mono">${uid.slice(0, 8)}...</p>
              </div>
            </div>
            ${isFollowingBack
                        ? '<span class="badge badge-sm badge-primary">Following</span>'
                        : `<button class="btn btn-primary btn-xs" data-action="follow-back" data-uid="${uid}">Follow Back</button>`
                    }
          `;

                // Follow back handler
                if (!isFollowingBack) {
                    card.querySelector('button')?.addEventListener('click', async () => {
                        await addFriend(uid);
                        renderFriends(); // Refresh
                    });
                }

                followersList.appendChild(card);
            }
        }
    }
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}
