// js/pick.js
import { state, authState, inRoom, setLastPickedMovieId, lastPickedMovieId } from "./state.js";
import { toast } from "./ui.js";
import { openAuthDialog } from "./auth.js";
import { openDetails } from "./details.js";
import { getPickCandidates } from "./pool.js";
import { activeDocRef } from "./rooms.js";

export async function pickForMe(opts = {}) {
    let candidates = getPickCandidates();

    // fallback: if filters exclude everything, still allow picking from full pool
    if (!candidates.length && state.pool.length) candidates = [...state.pool];

    if (!candidates.length) {
        toast("No movies in the pool to pick from.", "error");
        return;
    }

    // avoid repeating the same pick on reroll when possible
    if (opts.avoidId && candidates.length > 1) {
        candidates = candidates.filter((m) => m.id !== opts.avoidId);
    }

    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    setLastPickedMovieId(chosen.id);

    const mediaType = chosen.mediaType || state.filters.mediaType || "movie";

    // If in a room, also write the pick to the room doc so everyone sees it
    if (inRoom()) {
        if (!authState.user) {
            toast("Login to pick in this room.", "info");
            openAuthDialog();
            return;
        }

        const fs = window.firebaseStore;
        await fs.setDoc(
            activeDocRef(),
            {
                lastPick: {
                    movieId: chosen.id,
                    title: chosen.title || null,
                    mediaType, // helps other clients open the correct type
                    pickedBy: authState.user.uid,
                    pickedAt: fs.serverTimestamp(),
                },
                updatedAt: fs.serverTimestamp(),
            },
            { merge: true }
        );
    }

    return openDetails(chosen.id, { highlight: true, mediaType });
}

export function rerollPick() {
    pickForMe({ avoidId: lastPickedMovieId });
}
