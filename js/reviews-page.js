// js/reviews-page.js

import { tmdb } from "./tmdb.js";

let authUser = null;
let lastVisible = null;
let selectedMovieForReview = null;
const REVIEWS_PER_PAGE = 20;

const LSTHEME = "mnp:theme:v1";

function loadTheme() {
    try {
        const saved = localStorage.getItem(LSTHEME);
        const theme = saved ? JSON.parse(saved) : 'synthwave';
        document.documentElement.setAttribute('data-theme', theme);
        console.log('Theme loaded:', theme);
    } catch {
        document.documentElement.setAttribute('data-theme', 'synthwave');
    }
}

loadTheme();

// Initialize
async function init() {
    loadTheme();

    const fa = window.firebaseAuth;

    if (fa) {
        fa.onAuthStateChanged(fa.auth, (user) => {
            authUser = user;
            updateUI();
            loadReviews();
        });
    }

    // Wire up buttons
    document.getElementById('btnUser')?.addEventListener('click', handleUserClick);
    document.getElementById('btnSearchMovie')?.addEventListener('click', searchMovie);
    document.getElementById('btnLoadMore')?.addEventListener('click', loadMoreReviews);
    document.getElementById('reviewsFilter')?.addEventListener('change', () => {
        lastVisible = null;
        loadReviews();
    });

    // ADD THIS - THEME TOGGLE:
    document.getElementById('themeToggle')?.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'cupcake';
        const next = current === 'cupcake' ? 'noir' : current === 'noir' ? 'synthwave' : 'cupcake';

        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(LSTHEME, JSON.stringify(next));
        console.log('Theme changed to:', next);
    });

    // Initial load
    loadReviews();
}


function updateUI() {
    const userLabel = document.getElementById('userLabel');
    const writeSection = document.getElementById('writeReviewSection');

    if (authUser) {
        userLabel.textContent = authUser.displayName || authUser.email || 'User';
        // ALWAYS SHOW - let them search
        writeSection?.classList.remove('hidden');
    } else {
        userLabel.textContent = 'Sign in';
        // SHOW IT EVEN WHEN SIGNED OUT - allow browsing
        writeSection?.classList.remove('hidden');
    }
}

function handleUserClick() {
    if (authUser) {
        // Sign out
        window.firebaseAuth.auth.signOut();
    } else {
        // Redirect to main page for sign in
        window.location.href = 'index.html';
    }
}

// Load reviews from Firestore
async function loadReviews() {
    const fs = window.firebaseStore;
    if (!fs) return;

    const feed = document.getElementById('reviewsFeed');
    const filter = document.getElementById('reviewsFilter')?.value || 'recent';

    if (!lastVisible) {
        feed.innerHTML = '<div class="text-center py-10"><span class="loading loading-spinner loading-lg"></span></div>';
    }

    try {
        const reviewsCol = fs.collection(fs.db, "publicReviews");
        let q;

        if (filter === 'my-reviews' && authUser) {
            q = fs.query(
                reviewsCol,
                fs.where('userId', '==', authUser.uid),
                fs.orderBy('createdAt', 'desc'),
                fs.limit(REVIEWS_PER_PAGE)
            );
        } else if (filter === 'top-rated') {
            q = fs.query(
                reviewsCol,
                fs.orderBy('rating', 'desc'),
                fs.orderBy('createdAt', 'desc'),
                fs.limit(REVIEWS_PER_PAGE)
            );
        } else {
            // Recent
            q = fs.query(
                reviewsCol,
                fs.orderBy('createdAt', 'desc'),
                fs.limit(REVIEWS_PER_PAGE)
            );
        }

        if (lastVisible) {
            q = fs.query(q, fs.startAfter(lastVisible));
        }

        const snap = await fs.getDocs(q);

        if (snap.empty && !lastVisible) {
            feed.innerHTML = '<div class="text-center py-10 opacity-60">No reviews yet. Be the first!</div>';
            return;
        }

        if (!lastVisible) {
            feed.innerHTML = '';
        }

        snap.forEach(doc => {
            const review = doc.data();
            renderReviewCard(review, feed);
        });

        lastVisible = snap.docs[snap.docs.length - 1];

        // Hide load more if no more results
        const btnLoadMore = document.getElementById('btnLoadMore');
        if (snap.docs.length < REVIEWS_PER_PAGE) {
            btnLoadMore?.classList.add('hidden');
        } else {
            btnLoadMore?.classList.remove('hidden');
        }

    } catch (e) {
        console.error('Failed to load reviews', e);
        feed.innerHTML = '<div class="text-center py-10 text-error">Failed to load reviews</div>';
    }
}

function renderReviewCard(review, container) {
    const card = document.createElement('div');
    card.className = 'card bg-base-100 shadow-xl border border-base-300';

    const date = review.createdAt?.toDate?.() || new Date();

    card.innerHTML = `
    <div class="card-body p-4">
      <!-- Header -->
      <div class="flex items-start gap-3">
        <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(review.userName || 'User')}&size=48" 
             class="w-12 h-12 rounded-full" alt="User">
        
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="font-semibold text-sm">${escapeHtml(review.userName || 'Anonymous')}</p>
              <p class="text-xs opacity-60">${timeAgo(date)}</p>
            </div>
            <span class="badge badge-primary badge-lg font-bold">${review.rating.toFixed(1)}/10</span>
          </div>
          
          <!-- Movie title -->
          <h4 class="font-bold mt-2">${escapeHtml(review.movieTitle)}</h4>
          
          <!-- Review text -->
          ${review.review
            ? `<p class="text-sm mt-2 opacity-90">${escapeHtml(review.review)}</p>`
            : '<p class="text-xs opacity-50 mt-2 italic">No written review</p>'
        }
          
          <!-- Actions -->
          <div class="flex items-center gap-4 mt-3">
            <button class="btn btn-xs btn-ghost gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
              </svg>
              <span class="text-xs">${review.likes || 0}</span>
            </button>
            
            <button class="btn btn-xs btn-ghost text-xs" onclick="window.location.href='index.html#movie-${review.movieId}'">
              View Movie
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

    container.appendChild(card);
}

function timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

    return date.toLocaleDateString();
}

function loadMoreReviews() {
    loadReviews();
}

// Search movie to review
async function searchMovie() {
    const query = document.getElementById('movieSearch')?.value.trim();
    if (!query) return;

    const selectedMovie = document.getElementById('selectedMovie');
    if (!selectedMovie) return;

    selectedMovie.innerHTML = '<div class="text-center py-4"><span class="loading loading-spinner"></span></div>';
    selectedMovie.classList.remove('hidden');

    try {
        // Use your existing tmdb function
        const data = await tmdb('search/movie', {
            query: query,
            language: 'en-US',
            include_adult: false,
        });

        if (!data.results || data.results.length === 0) {
            selectedMovie.innerHTML = '<p class="text-sm opacity-60 py-4">No movies found</p>';
            return;
        }

        // Show top 3 results
        selectedMovie.innerHTML = '<div class="space-y-2"></div>';
        const container = selectedMovie.querySelector('div');

        data.results.slice(0, 3).forEach(movie => {
            const item = document.createElement('button');
            item.className = 'w-full flex items-center gap-3 p-3 bg-base-200 hover:bg-base-300 rounded-lg border border-base-300 transition text-left';

            const posterUrl = movie.poster_path
                ? `https://image.tmdb.org/t/p/w92${movie.poster_path}`
                : '';

            item.innerHTML = `
        ${posterUrl
                    ? `<img src="${posterUrl}" class="w-12 h-16 rounded object-cover" alt="${escapeHtml(movie.title)}">`
                    : '<div class="w-12 h-16 rounded bg-base-300"></div>'
                }
        <div class="flex-1">
          <p class="font-semibold text-sm">${escapeHtml(movie.title)}</p>
          <p class="text-xs opacity-60">${movie.release_date?.slice(0, 4) || 'N/A'} • ⭐ ${Number(movie.vote_average || 0).toFixed(1)}/10</p>
        </div>
      `;

            item.addEventListener('click', () => {
                selectMovieForReview(movie);
            });

            container.appendChild(item);
        });

    } catch (e) {
        console.error('Search failed', e);
        selectedMovie.innerHTML = '<p class="text-sm text-error py-4">Search failed</p>';
    }
}

// Select movie for review
function selectMovieForReview(movie) {
    selectedMovieForReview = movie;

    const selectedMovie = document.getElementById('selectedMovie');
    if (!selectedMovie) return;

    const posterUrl = movie.poster_path
        ? `https://image.tmdb.org/t/p/w185${movie.poster_path}`
        : '';

    selectedMovie.innerHTML = `
    <div class="bg-base-200 p-4 rounded-lg border border-base-300">
      <div class="flex gap-4 mb-4">
        ${posterUrl
            ? `<img src="${posterUrl}" class="w-24 h-36 rounded object-cover" alt="${escapeHtml(movie.title)}">`
            : '<div class="w-24 h-36 rounded bg-base-300"></div>'
        }
        
        <div class="flex-1">
          <h4 class="font-bold text-lg">${escapeHtml(movie.title)}</h4>
          <p class="text-sm opacity-70">${movie.release_date?.slice(0, 4) || 'N/A'}</p>
          <p class="text-sm mt-2">${escapeHtml(movie.overview?.slice(0, 150) || 'No description')}...</p>
        </div>
      </div>
      
      <!-- Rating -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <label class="text-sm font-semibold">Your Rating:</label>
          <span id="newReviewRating" class="badge badge-primary badge-lg font-mono">0.0</span>
        </div>
        <input type="range" id="newReviewSlider" class="range range-primary range-sm w-full" 
               min="0" max="10" step="0.5" value="0">
      </div>
      
      <!-- Review text -->
      <textarea id="newReviewText" class="textarea textarea-bordered w-full mt-3" 
                placeholder="Write your review (optional)..." rows="4"></textarea>
      
      <!-- Post button -->
      <div class="flex gap-2 mt-3">
        <button id="btnPostReview" class="btn btn-primary flex-1">Post Review</button>
        <button id="btnCancelReview" class="btn btn-ghost">Cancel</button>
      </div>
    </div>
  `;

    selectedMovie.classList.remove('hidden');

    // Wire up
    const slider = document.getElementById('newReviewSlider');
    const display = document.getElementById('newReviewRating');
    const btnPost = document.getElementById('btnPostReview');
    const btnCancel = document.getElementById('btnCancelReview');

    slider?.addEventListener('input', () => {
        display.textContent = Number(slider.value).toFixed(1);
    });

    btnPost?.addEventListener('click', () => postReview());
    btnCancel?.addEventListener('click', () => {
        selectedMovie.classList.add('hidden');
        selectedMovieForReview = null;
        document.getElementById('movieSearch').value = '';
    });
}

// Post review to Firestore
async function postReview() {
    if (!authUser) {
        // Redirect to sign in instead of just alerting
        if (confirm('Sign in to post your review?')) {
            window.location.href = 'index.html';
        }
        return;
    }

    if (!selectedMovieForReview) return;

    const slider = document.getElementById('newReviewSlider');
    const reviewText = document.getElementById('newReviewText')?.value.trim();
    const rating = Number(slider?.value || 0);

    if (rating === 0) {
        alert('Please select a rating');
        return;
    }

    const fs = window.firebaseStore;
    if (!fs) return;

    try {
        const review = {
            movieId: selectedMovieForReview.id,
            movieTitle: selectedMovieForReview.title,
            moviePoster: selectedMovieForReview.poster_path,
            rating: rating,
            review: reviewText,
            userId: authUser.uid,
            userName: authUser.displayName || authUser.email || 'Anonymous',
            userPhoto: authUser.photoURL || null,
            createdAt: fs.serverTimestamp(),
            likes: 0,
        };

        await fs.addDoc(fs.collection(fs.db, "publicReviews"), review);

        alert('Review posted successfully!');

        // Clear form
        document.getElementById('selectedMovie').classList.add('hidden');
        document.getElementById('movieSearch').value = '';
        selectedMovieForReview = null;

        // Reload reviews
        lastVisible = null;
        loadReviews();

    } catch (e) {
        console.error('Failed to post review', e);
        alert('Failed to post review: ' + e.message);
    }
}

function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
}

// Start
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
