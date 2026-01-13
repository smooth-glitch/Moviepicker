import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  addDoc,
  query,
  orderBy,
  limit,
  updateDoc,
  deleteField,
  where,
  getDocs,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

const cfg =
  window.APPCONFIG?.firebaseConfig ?? window.APP_CONFIG?.firebaseConfig;

if (!cfg) {
  console.error(
    "Missing firebaseConfig in config.js (window.APPCONFIG / window.APP_CONFIG)."
  );
} else {
  const app = initializeApp(cfg);
  const auth = getAuth(app);
  const googleProvider = new GoogleAuthProvider();
  const db = getFirestore(app);
  const storage = getStorage(app);

  window.firebaseAuth = {
    auth,
    googleProvider,
    onAuthStateChanged,
    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    updateProfile,
  };

  window.firebaseStore = {
    db,
    storage,
    collection,
    doc,
    setDoc,
    getDoc,
    deleteDoc,
    onSnapshot,
    serverTimestamp,
    addDoc,
    query,
    orderBy,
    limit,
    updateDoc,
    deleteField,
    // Storage functions
    ref,
    uploadBytes,
    getDownloadURL,
    where,
    getDocs,
  };
}
