import { authState, state } from "./state.js";
import { toast } from "./ui.js";

export function openWhatsAppShare(text) {
    const url = `https://wa.me?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
}

export async function createSharedList() {
    const fs = window.firebaseStore;
    if (!fs) throw new Error("Firestore not ready");

    const ref = fs.doc(fs.collection(fs.db, "sharedLists"));
    await fs.setDoc(ref, {
        pool: state.pool,
        watched: Array.from(state.watched),
        filters: state.filters,
        createdAt: fs.serverTimestamp(),
    });

    return ref.id;
}

export async function sharePoolOnWhatsApp() {
    if (!authState.user) return toast("Sign in to share your list.", "error");

    try {
        const id = await createSharedList();
        const shareUrl = new URL(window.location.href);
        shareUrl.searchParams.set("list", id);
        const msg = `Movie Night list: ${shareUrl.toString()}`;
        openWhatsAppShare(msg);
    } catch (e) {
        console.warn(e);
        toast(e?.message || "Failed to create share link.", "error");
    }
}
