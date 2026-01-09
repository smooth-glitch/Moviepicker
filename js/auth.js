import { id } from "./dom.js";
import { authState } from "./state.js";
import { toast } from "./ui.js";

export function updateUserChip() {
    const label = id("userChipLabel");
    const btn = id("btnUser");

    if (!label) return;

    if (authState.user) {
        const u = authState.user;
        const text = u.displayName || u.email || "Signed in";
        label.textContent = text;
        if (btn) btn.title = text;
    } else {
        label.textContent = "Sign in";
        if (btn) btn.title = "Sign in";
    }
}


export function openAuthDialog() {
    const dlg = id("dlgAuth");
    if (!dlg) return;

    if (authState.user) {
        toast(`Signed in as ${authState.user.displayName || authState.user.email}`, "info");
        return;
    }

    (id("authName") || {}).value = (id("authName")?.value ?? "");
    dlg.showModal();
}

export function handleAuthSubmit() {
    const fa = window.firebaseAuth;
    if (!fa) {
        toast("Auth not ready. Check Firebase config.", "error");
        return;
    }

    const dlgAuth = id("dlgAuth");
    const name = id("authName")?.value.trim() || "";
    const email = id("authEmail")?.value.trim() || "";
    const pass = id("authPass")?.value.trim() || "";

    if (!email || !pass) {
        toast("Email and password required.", "error");
        return;
    }

    fa.signInWithEmailAndPassword(fa.auth, email, pass)
        .then(() => {
            dlgAuth?.close();
            toast("Signed in.", "success");
        })
        .catch((err) => {
            if (err.code === "auth/user-not-found") {
                return fa.createUserWithEmailAndPassword(fa.auth, email, pass).then(() => {
                    dlgAuth?.close();
                    toast("Account created & signed in.", "success");
                });
            }
            toast(err.message || "Sign-in failed.", "error");
        });
}

export function handleGoogleSignIn() {
    const fa = window.firebaseAuth;
    if (!fa) {
        toast("Auth not ready. Check Firebase config.", "error");
        return;
    }
    const dlgAuth = id("dlgAuth");

    fa.signInWithPopup(fa.auth, fa.provider)
        .then(() => {
            dlgAuth?.close();
            toast("Signed in with Google.", "success");
        })
        .catch((err) => {
            if (err.code !== "auth/popup-closed-by-user") toast(err.message || "Google sign-in failed.", "error");
        });
}

export function handleSignOut() {
    const fa = window.firebaseAuth;
    if (!fa) return;

    fa.signOut(fa.auth)
        .then(() => toast("Signed out.", "info"))
        .catch((err) => toast(err.message || "Sign-out failed.", "error"));
}
