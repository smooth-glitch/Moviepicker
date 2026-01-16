import { state, inRoom } from "./state.js";
import { LSPOOL, LSWATCHED, saveJson } from "./storage.js";
import { toast } from "./ui.js";
import { renderPool, renderResults } from "./render.js";
import { scheduleCloudSave, requireLoginForRoomWrite } from "./rooms.js";

export function pickFields(m) {
    const kind = state.filters.mediaType || "movie";
    const title =
        m.title || m.name || m.original_title || m.original_name || "Untitled";

    return {
        id: m.id,
        title,
        poster_path: m.poster_path ?? null,
        vote_average: m.vote_average ?? 0,
        release_date: m.release_date || m.first_air_date || "",
        mediaType: kind,
    };
}


export function addToPoolById(id) {
    if (!requireLoginForRoomWrite()) return;

    const m = state.results.find((x) => x.id === id);
    if (!m) return;

    if (state.pool.some((x) => x.id === id)) {
        toast("Already in pool", "info");
        return;
    }

    state.pool.unshift(pickFields(m));
    saveJson(LSPOOL, state.pool);
    renderPool();

    // DO NOT CALL renderResults() here!
    // Instead, just update the button:
    const btn = document.querySelector(`#results button[data-action="add"][data-id="${id}"]`);
    if (btn) {
        btn.classList.add('btn-disabled');
        btn.disabled = true;
        btn.textContent = 'In pool';
    }

    scheduleCloudSave();
    toast("Added to pool", "success");
}



function updateMovieButton(movieId, inPool) {
    // Find the button in results grid
    const btn = document.querySelector(`#results button[data-action="add"][data-id="${movieId}"]`);

    if (btn) {
        if (inPool) {
            btn.classList.add('btn-disabled');
            btn.textContent = 'In pool';
        } else {
            btn.classList.remove('btn-disabled');
            btn.textContent = 'Add';
        }
    }
}

export function removeFromPool(id) {
    if (!requireLoginForRoomWrite()) return;

    // Find the row in the DOM
    const poolWrap = document.getElementById('pool');
    const rows = poolWrap?.querySelectorAll('div[class*="flex items-center"]');
    let rowToRemove = null;

    rows?.forEach(row => {
        const removeBtn = row.querySelector(`button[data-action="remove"][data-id="${id}"]`);
        if (removeBtn) {
            rowToRemove = row;
        }
    });

    // Animate out, THEN remove from state
    if (rowToRemove) {
        rowToRemove.classList.add('removing');

        setTimeout(() => {
            // Now remove from state and re-render
            state.pool = state.pool.filter((x) => x.id !== id);
            saveJson(LSPOOL, state.pool);
            renderPool();

            // Update button in results grid
            const btn = document.querySelector(`#results button[data-action="add"][data-id="${id}"]`);
            if (btn) {
                btn.classList.remove('btn-disabled');
                btn.disabled = false;
                btn.textContent = 'Add';
            }

            scheduleCloudSave();
        }, 400); // Wait for animation
    } else {
        // Fallback if row not found
        state.pool = state.pool.filter((x) => x.id !== id);
        saveJson(LSPOOL, state.pool);
        renderPool();
        scheduleCloudSave();
    }
}




export function toggleWatched(id) {
    if (!requireLoginForRoomWrite()) return;
    if (state.watched.has(id)) state.watched.delete(id);
    else state.watched.add(id);

    saveJson(LSWATCHED, Array.from(state.watched));
    renderPool();
    scheduleCloudSave();
}

export function clearPool() {
    if (!requireLoginForRoomWrite()) return;
    state.pool = [];
    saveJson(LSPOOL, state.pool);
    renderPool();
    scheduleCloudSave();
    toast("Pool cleared", "info");
}

export function getPickCandidates() {
    const minRating = Number(state.filters.minRating ?? 0);
    const excludeWatched = !!state.filters.excludeWatched;

    return state.pool.filter((m) => {
        const okRating = Number(m.vote_average ?? 0) >= minRating;
        const okWatched = excludeWatched ? !state.watched.has(m.id) : true;
        return okRating && okWatched;
    });
}
