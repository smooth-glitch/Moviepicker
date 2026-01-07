# 🎬 PickMe – Movie Night Picker

A modern, responsive **movie night helper** built with **HTML**, **CSS (Tailwind + daisyUI)**, and **Vanilla JavaScript**, powered by **TMDB** and **Firebase (Auth + Firestore)**. Build a pool, filter it, and hit **Pick for me** to get tonight’s movie in a clean, themeable UI.

***

## ✨ Highlights

- 🔍 Search or discover movies by **title**, **sort order**, **year**, and **genres**
- 🎛️ **Genres multi-select dropdown** with live “N selected” count
- 🧼 **Reset filters** button to instantly return to defaults
- 📺 “Watch filters”: auto-detected **region** + **OTT accounts (multi)** to refine Discover results
- 🎲 **Pick for me**: random “Tonight’s pick” from your curated pool
- 👤 Firebase **authentication** (email/password + Google)
- 🧑‍🤝‍🧑 Optional **Room mode**: share a link, see members, and sync “Tonight’s pick”
- 📤 Share your pool as a link (easy import on another device/account)
- 🎛️ Two themes (**Synthwave** & **Cupcake**) with a custom animated theme toggle
- 📱 Responsive layout with a polished card grid and consistent control sizing

***

## 🧱 Tech Stack

<p align="center">
  <!-- Core -->
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5"/>
  <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white" alt="CSS3"/>
  <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=000" alt="JavaScript"/>

  <!-- UI -->
  <img src="https://img.shields.io/badge/Tailwind%20CSS-0EA5E9?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind CSS"/>
  <img src="https://img.shields.io/badge/daisyUI-7E22CE?style=for-the-badge&logo=daisyui&logoColor=white" alt="daisyUI"/>

  <!-- APIs -->
  <img src="https://img.shields.io/badge/TMDB-01D277?style=for-the-badge&logo=themoviedatabase&logoColor=white" alt="TMDB"/>

  <!-- Firebase -->
  <img src="https://img.shields.io/badge/Firebase%20Auth-FFCA28?style=for-the-badge&logo=firebase&logoColor=000" alt="Firebase Auth"/>
  <img src="https://img.shields.io/badge/Firestore-FFA000?style=for-the-badge&logo=firebase&logoColor=000" alt="Firestore"/>

  <!-- Storage -->
  <img src="https://img.shields.io/badge/SessionStorage-334155?style=for-the-badge" alt="SessionStorage"/>

  <!-- Hosting & Tools -->
  <img src="https://img.shields.io/badge/GitHub-121011?style=for-the-badge&logo=github&logoColor=white" alt="GitHub"/>
  <img src="https://img.shields.io/badge/Git-F05033?style=for-the-badge&logo=git&logoColor=white" alt="Git"/>
  <img src="https://img.shields.io/badge/GitHub%20Pages-222222?style=for-the-badge&logo=githubpages&logoColor=white" alt="GitHub Pages"/>
  <img src="https://img.shields.io/badge/Netlify-00C7B7?style=for-the-badge&logo=netlify&logoColor=white" alt="Netlify"/>
</p>

***

## 🚀 Getting Started

### ✅ Run locally

1. **Clone the repo:**
```bash
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>
```
### Configure API keys
Create/edit config.js:
  // config.js
  
  window.APP_CONFIG = {
    TMDB_API_KEY: "YOUR_TMDB_API_KEY",
    firebaseConfig: {
      apiKey: "YOUR_FIREBASE_API_KEY",
      authDomain: "YOUR_FIREBASE_AUTH_DOMAIN",
      projectId: "YOUR_FIREBASE_PROJECT_ID",
      storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET",
      messagingSenderId: "YOUR_FIREBASE_SENDER_ID",
      appId: "YOUR_FIREBASE_APP_ID"
    }
  };
  
  // Compatibility shim (optional):
  // If app.js expects window.APPCONFIG.TMDBAPIKEY, keep this so TMDB works.
  window.APPCONFIG = {
    TMDBAPIKEY: window.APP_CONFIG.TMDB_API_KEY
  };
Note: TMDB + Firebase web config are public client keys for frontend usage, but always secure access with Firebase rules, quotas, and sensible limits

### Start a local server
VS Code: Live Server

or:
```bash
python -m http.server 5500
```
Open in browser
```
http://127.0.0.1:5500/index.html
```
## 🎛️ Features
### 🔍 Search, Discover, Trending
Search mode: type a title and hit Search.

Discover mode: leave the search box empty and use:

Result sort: Popular / Rating / Newest

Genres: multi-select dropdown (shows how many you selected)

### Year

Watch filters (right panel): region + OTT accounts

Trending: fetches TMDB daily trending movies with one click.

### 🎚️ Filters & Reset
Reset filters restores defaults (media type, year, genres, watch filters, etc.) so you can quickly start a fresh discover/search session.

### 🎥 Pool & “Pick for Me”
Add movies from results into your pool.

Apply pool filters:

### Exclude watched

Min rating

Pick for me randomly selects from your filtered pool and highlights Tonight’s pick in the details dialog.

### 📋 Details & Watched State
Clicking Details opens a modal with poster/meta + overview.

Mark watched updates:

Pool row status (Watched badge)

Future filtering when Exclude watched is enabled

### 📺 Where to Watch (TMDB providers)
Details modal can show Where to watch provider badges (based on region/provider data).

### 🧑‍🤝‍🧑 Rooms (optional)
Create room → share/copy link → others join to view and participate.

Room members list shows who’s online.

“Tonight’s pick” can sync across the room.

### 📤 Sharing
Share your pool as a link (useful for sending to friends or importing on another device).

Import shared list into your account after signing in.

## 🔐 Firebase Auth + Firestore
Email/password sign-in and sign-up

### Google sign-in via popup

When signed in, the app can sync data (pool/filters) using Firestore, and enables room features.

### Setup notes
Create a Firebase project and enable:

Email/Password

(Optional) Google

Add your Firebase web config to config.js.

Ensure your Firebase Auth domain matches your local/hosted URL.

### 🛠️ UI / Layout Notes
The top filter toolbar is designed to keep controls consistently sized.

Genres is implemented as a dropdown menu with checkbox rows for multi-select.

## 📌 Roadmap (Future Enhancements)

### 💾 Harden Firestore persistence:

Clear separation between local (guest) and cloud (signed-in) state

Better merge/conflict handling for multi-device usage

### 🧑‍🤝‍🧑 Improve Rooms:

Host controls / permissions

Room-level settings (region, OTT, min rating)

Better “live activity” signals (who picked, when)

### 🧠 Smarter suggestions:

Recommend based on watch history + preferred genres

“Surprise me” picks that avoid repeats

### 📲 PWA improvements:

Offline-friendly UI

Installable app experience

### 🎛️ Better filtering:

More OTT providers

Language / runtime filters

Separate TV-only and movie-only tuning

## 🙌 Author

Designed & developed by Arjun.
