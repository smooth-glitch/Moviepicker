// config.js

window.APP_CONFIG = {
  firebaseConfig: {
    apiKey: "AIzaSyB8fW-bBx26cMPUDjZH6Xnuqrsw5Nkizu4",
    authDomain: "movienight-picker.firebaseapp.com",
    projectId: "movienight-picker",
    storageBucket: "movienight-picker.firebasestorage.app",
    messagingSenderId: "169239854984",
    appId: "1:169239854984:web:a25b26739ed82a37f4c43d",
    measurementId: "G-3P11RRJQ4K",
  },

  // Keep it here if you want, but we also export it below.
  GIPHY_API_KEY: "8yONfoSWS51lRx1f0vpOVutdcwcLRkug",
};

// This is what your app reads everywhere else (tmdb.js, firebase-init.js, gif.js, etc.)
window.APPCONFIG = {
  firebaseConfig: window.APP_CONFIG.firebaseConfig,

  // NEW: expose it here so searchGifs() can use it
  GIPHY_API_KEY: window.APP_CONFIG.GIPHY_API_KEY,
};
