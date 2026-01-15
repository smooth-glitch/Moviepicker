// js/collections.js

import { state, authState } from "./state.js";
import { loadJson, saveJson } from "./storage.js";
import { toast } from "./ui.js";

const LSCOLLECTIONS = "mnp:collections:v1";

// Load collections from localStorage
export function loadCollections() {
    state.collections = loadJson(LSCOLLECTIONS, []);
}

// Save collections to localStorage
export function saveCollections() {
    saveJson(LSCOLLECTIONS, state.collections);

    // Also save to Firestore if logged in
    saveCollectionsToCloud();
}

// Create new collection
export function createCollection(name) {
    if (!name || !name.trim()) {
        toast("Collection name required", "error");
        return null;
    }

    const collection = {
        id: Date.now().toString(),
        name: name.trim(),
        movies: [],
        createdAt: Date.now(),
    };

    state.collections.unshift(collection);
    saveCollections();
    renderCollections();
    toast(`"${name}" created`, "success");

    return collection;
}

// Add movie to collection
export function addToCollection(collectionId, movie) {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    // Check if already in collection
    if (collection.movies.some(m => m.id === movie.id)) {
        toast("Already in this collection", "info");
        return;
    }

    collection.movies.push({
        id: movie.id,
        title: movie.title,
        posterPath: movie.posterPath,
        voteAverage: movie.voteAverage,
        releaseDate: movie.releaseDate,
        mediaType: movie.mediaType || "movie",
    });

    saveCollections();
    renderCollections(); // THIS IS CRUCIAL
    toast(`Added to "${collection.name}"`, "success");
}

// Remove movie from collection
export function removeFromCollection(collectionId, movieId) {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    collection.movies = collection.movies.filter(m => m.id !== movieId);
    saveCollections();
    renderCollections();
}

// Replace the deleteCollection function with this:
export function deleteCollection(collectionId) {
    if (!confirm("Delete this collection? This cannot be undone.")) return;

    state.collections = state.collections.filter(c => c.id !== collectionId);
    saveCollections();
    renderCollections(); // Refresh settings list

    // REFRESH PICKER MODAL IF IT'S OPEN
    const pickerDlg = document.getElementById('dlgCollectionPicker');
    const pickerList = document.getElementById('collectionPickerList');

    if (pickerDlg && !pickerDlg.classList.contains('hidden') && pickerList) {
        // If picker is open, refresh it with current movie
        if (state.currentDetails) {
            renderCollectionPickerList({
                id: state.currentDetails.id,
                title: state.currentDetails.title || state.currentDetails.name,
                posterPath: state.currentDetails.poster_path,
                voteAverage: state.currentDetails.vote_average,
                releaseDate: state.currentDetails.release_date || state.currentDetails.first_air_date,
                mediaType: state.currentDetails.mediaType || 'movie',
            });
        }
    }

    toast("Collection deleted", "info");
}

// Replace the movie thumbnails section with this enhanced version:
export function renderCollections() {
    const container = document.getElementById('collectionsList');
    if (!container) return;

    if (state.collections.length === 0) {
        container.innerHTML = `
        <div class="text-xs opacity-60 p-3 bg-base-200 border border-base-300">
          No collections yet. Create your first playlist!
        </div>
      `;
        return;
    }

    container.innerHTML = '';

    state.collections.forEach(collection => {
        const card = document.createElement('div');
        card.className = 'p-4 bg-base-100 border border-base-300 rounded-lg space-y-3';

        // Header
        const header = document.createElement('div');
        header.className = 'flex items-center justify-between';
        // In renderCollections(), update the header section:
        header.innerHTML = `
<div>
  <h4 class="font-bold text-sm">${escapeHtml(collection.name)}</h4>
  <p class="text-xs opacity-60">${collection.movies.length} movies</p>
</div>
<div class="flex gap-2">
  <button class="btn btn-xs btn-ghost" data-action="view" data-id="${collection.id}">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
    </svg>
  </button>
  
  <!-- ADD SHARE BUTTON -->
  <button class="btn btn-xs btn-ghost" data-action="share" data-id="${collection.id}">
    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
    </svg>
  </button>
  
  <button class="btn btn-xs btn-error btn-outline" data-action="delete" data-id="${collection.id}">
    Delete
  </button>
</div>
`;


        // Movie thumbnails with hover actions
        const thumbnails = document.createElement('div');
        thumbnails.className = 'flex gap-2 overflow-x-auto pb-2';

        collection.movies.slice(0, 6).forEach(movie => {
            const movieCard = document.createElement('div');
            movieCard.className = 'relative flex-shrink-0 group';

            const posterUrl = movie.posterPath
                ? `https://image.tmdb.org/t/p/w185${movie.posterPath}`
                : '';

            movieCard.innerHTML = `
          ${posterUrl
                    ? `<img src="${posterUrl}" class="w-16 h-24 rounded object-cover" alt="${escapeHtml(movie.title)}" loading="lazy">`
                    : `<div class="w-16 h-24 rounded bg-base-200 grid place-items-center text-xs opacity-60">No</div>`
                }
          
          <!-- Hover overlay with actions -->
          <div class="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 rounded">
            <button class="btn btn-xs btn-ghost" data-action="details" data-movie-id="${movie.id}" data-media-type="${movie.mediaType}">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
            </button>
            <button class="btn btn-xs btn-error btn-outline" data-action="remove-movie" data-collection-id="${collection.id}" data-movie-id="${movie.id}">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>
        `;

            thumbnails.appendChild(movieCard);
        });

        // "+X more" indicator
        if (collection.movies.length > 6) {
            const more = document.createElement('div');
            more.className = 'w-16 h-24 rounded bg-base-300 grid place-items-center text-xs font-semibold cursor-pointer hover:bg-base-200 transition';
            more.textContent = `+${collection.movies.length - 6}`;
            more.dataset.action = 'view';
            more.dataset.id = collection.id;
            thumbnails.appendChild(more);
        }

        card.appendChild(header);
        card.appendChild(thumbnails);

        // Update the click handler to include share action:
        card.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action], div[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;

            if (action === 'view') {
                viewCollection(btn.dataset.id || collection.id);
            } else if (action === 'delete') {
                deleteCollection(btn.dataset.id);
            } else if (action === 'share') {  // ADD THIS
                shareCollection(btn.dataset.id);
            } else if (action === 'details') {
                import('./details.js').then(module => {
                    module.openDetails(Number(btn.dataset.movieId), {
                        mediaType: btn.dataset.mediaType
                    });
                });
                document.getElementById('settingsModal')?.classList.add('hidden');
            } else if (action === 'remove-movie') {
                removeFromCollection(btn.dataset.collectionId, Number(btn.dataset.movieId));
            }
        });


        container.appendChild(card);
    });
}

// Add these functions to collections.js:

// Share collection to Firestore and get link
export async function shareCollection(collectionId) {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    const fs = window.firebaseStore;
    if (!fs) {
        toast("Firestore not ready", "error");
        return;
    }

    try {
        // Create shareable document
        const ref = fs.doc(fs.collection(fs.db, "sharedCollections"));

        await fs.setDoc(ref, {
            name: collection.name,
            movies: collection.movies,
            createdBy: window.firebaseAuth?.auth?.currentUser?.uid || 'anonymous',
            createdAt: fs.serverTimestamp(),
        });

        // Create share URL
        const shareUrl = new URL(window.location.href);
        shareUrl.searchParams.set('collection', ref.id);

        // Copy to clipboard
        try {
            await navigator.clipboard.writeText(shareUrl.toString());
            toast(`Share link copied for "${collection.name}"`, "success");
        } catch {
            window.prompt('Copy collection link:', shareUrl.toString());
        }

        return ref.id;
    } catch (e) {
        console.error('Failed to share collection', e);
        toast("Failed to create share link", "error");
    }
}

// Share via WhatsApp
export async function shareCollectionOnWhatsApp(collectionId) {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    const fs = window.firebaseStore;
    if (!fs) {
        toast("Firestore not ready", "error");
        return;
    }

    try {
        const shareId = await shareCollection(collectionId);
        if (!shareId) return;

        const shareUrl = new URL(window.location.href);
        shareUrl.searchParams.set('collection', shareId);

        const message = `Check out my "${collection.name}" collection (${collection.movies.length} movies):\n${shareUrl.toString()}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    } catch (e) {
        console.error('Failed to share on WhatsApp', e);
        toast("Failed to share", "error");
    }
}

// Import shared collection
export async function importSharedCollection() {
    const fs = window.firebaseStore;
    if (!fs) return;

    const url = new URL(window.location.href);
    const collectionId = url.searchParams.get('collection');

    if (!collectionId) return;

    try {
        const snap = await fs.getDoc(fs.doc(fs.db, "sharedCollections", collectionId));

        if (!snap.exists()) {
            toast("Shared collection not found", "error");
            return;
        }

        const data = snap.data();

        // Create new collection with shared data
        const newCollection = {
            id: Date.now().toString(),
            name: `${data.name} (Shared)`,
            movies: data.movies || [],
            createdAt: Date.now(),
        };

        state.collections.unshift(newCollection);
        saveCollections();
        renderCollections();

        toast(`Imported collection "${data.name}" (${data.movies.length} movies)`, "success");

        // Remove from URL
        url.searchParams.delete('collection');
        window.history.replaceState({}, '', url.toString());

    } catch (e) {
        console.error('Failed to import collection', e);
        toast("Failed to import collection", "error");
    }
}

// Firestore sync
// Update this function in collections.js:
async function saveCollectionsToCloud() {
    const fs = window.firebaseStore;
    const user = window.firebaseAuth?.auth?.currentUser;

    if (!fs || !user) return;

    try {
        const userRef = fs.doc(fs.db, "users", user.uid);
        await fs.setDoc(
            userRef,
            {
                collections: state.collections,
                collectionsUpdatedAt: fs.serverTimestamp(),
                updatedAt: fs.serverTimestamp(),
            },
            { merge: true }
        );
        console.log('Collections saved to Firestore');
    } catch (e) {
        console.warn("Failed to save collections to cloud", e);
    }
}

// Add function to load collections from Firestore
export async function loadCollectionsFromCloud() {
    const fs = window.firebaseStore;
    const user = window.firebaseAuth?.auth?.currentUser;

    if (!fs || !user) {
        // Load from localStorage only
        loadCollections();
        return;
    }

    try {
        const userRef = fs.doc(fs.db, "users", user.uid);
        const snap = await fs.getDoc(userRef);

        if (snap.exists()) {
            const data = snap.data();
            if (Array.isArray(data.collections)) {
                state.collections = data.collections;
                // Also save to localStorage as backup
                saveJson(LSCOLLECTIONS, state.collections);
                console.log('Collections loaded from Firestore:', state.collections.length);
                return;
            }
        }

        // Fallback to localStorage
        loadCollections();
    } catch (e) {
        console.warn('Failed to load collections from Firestore', e);
        loadCollections();
    }
}


// Add these functions to js/collections.js

// Open collection picker for a movie
export function openCollectionPicker(movie) {
    const dlg = document.getElementById('dlgCollectionPicker');
    if (!dlg) return;

    renderCollectionPickerList(movie);
    dlg.showModal();
}

// Render collection picker list
export function renderCollectionPickerList(movie) {
    const container = document.getElementById('collectionPickerList');
    if (!container) return;

    if (state.collections.length === 0) {
        container.innerHTML = `
        <div class="text-center text-sm opacity-60 py-4">
          No collections yet. Create one below!
        </div>
      `;
        return;
    }

    container.innerHTML = '';

    state.collections.forEach(collection => {
        const inCollection = collection.movies.some(m => m.id === movie.id);

        const item = document.createElement('button');
        item.className = `w-full text-left p-3 rounded-lg border transition ${inCollection
            ? 'border-primary bg-primary/10'
            : 'border-base-300 hover:bg-base-200'
            }`;

        item.innerHTML = `
        <div class="flex items-center justify-between">
          <div>
            <div class="font-semibold text-sm">${escapeHtml(collection.name)}</div>
            <div class="text-xs opacity-60">${collection.movies.length} movies</div>
          </div>
          ${inCollection
                ? '<span class="badge badge-primary badge-sm">Added ✓</span>'
                : '<span class="text-xs opacity-60">Click to add</span>'}
        </div>
      `;

        if (!inCollection) {
            item.addEventListener('click', () => {
                addToCollection(collection.id, movie);
                renderCollectionPickerList(movie); // Refresh
            });
        }

        container.appendChild(item);
    });
}

// View collection in modal
// Replace the viewCollection function with this enhanced version:
export function viewCollection(collectionId) {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    const dlg = document.getElementById('dlgViewCollection');
    const title = document.getElementById('viewCollectionTitle');
    const count = document.getElementById('viewCollectionCount');
    const moviesGrid = document.getElementById('viewCollectionMovies');
    const btnLoad = document.getElementById('btnLoadCollection');

    if (!dlg) return;

    title.textContent = collection.name;
    count.textContent = `${collection.movies.length} movies`;

    // Render movies with BOTH actions
    moviesGrid.innerHTML = '';

    collection.movies.forEach(movie => {
        const card = document.createElement('div');
        card.className = 'relative group cursor-pointer';

        const posterUrl = movie.posterPath
            ? `https://image.tmdb.org/t/p/w185${movie.posterPath}`
            : '';

        card.innerHTML = `
        ${posterUrl
                ? `<img src="${posterUrl}" class="w-full aspect-[2/3] rounded object-cover" alt="${escapeHtml(movie.title)}" loading="lazy">`
                : `<div class="w-full aspect-[2/3] rounded bg-base-200 grid place-items-center text-xs opacity-60">No poster</div>`
            }
        
        <!-- Hover overlay with BOTH actions -->
        <div class="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 rounded p-2">
          <!-- View Details Button -->
          <button class="btn btn-xs btn-primary w-full" data-action="view-details" data-id="${movie.id}" data-media-type="${movie.mediaType}">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
            </svg>
            View
          </button>
          
          <!-- Remove Button -->
          <button class="btn btn-xs btn-error btn-outline w-full" data-action="remove" data-id="${movie.id}">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            Remove
          </button>
        </div>
        
        <p class="text-xs mt-1 truncate">${escapeHtml(movie.title)}</p>
      `;

        // Event handlers
        card.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;

            e.stopPropagation();
            const action = btn.dataset.action;
            const movieId = Number(btn.dataset.id);

            if (action === 'view-details') {
                // Open movie details
                import('./details.js').then(module => {
                    module.openDetails(movieId, {
                        mediaType: btn.dataset.mediaType || 'movie'
                    });
                });
                dlg.close();
            } else if (action === 'remove') {
                removeFromCollection(collectionId, movieId);
                viewCollection(collectionId); // Refresh
            }
        });

        moviesGrid.appendChild(card);
    });

    // Load to pool button
    btnLoad.onclick = () => {
        loadCollectionToPool(collectionId);
        dlg.close();
    };

    dlg.showModal();
}

// Load entire collection to pool
export function loadCollectionToPool(collectionId) {
    const collection = state.collections.find(c => c.id === collectionId);
    if (!collection) return;

    let added = 0;
    collection.movies.forEach(movie => {
        // Check if already in pool
        if (!state.pool.some(p => p.id === movie.id)) {
            state.pool.push(movie);
            added++;
        }
    });

    if (added > 0) {
        saveJson("mnp:pool:v1", state.pool);
        // Call your existing renderPool function
        if (typeof window.renderPool === 'function') {
            window.renderPool();
        }
        toast(`Added ${added} movies from "${collection.name}"`, "success");
    } else {
        toast("All movies already in pool", "info");
    }
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}
