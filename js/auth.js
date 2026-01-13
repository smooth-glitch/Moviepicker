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
        toast(
            `Signed in as ${authState.user.displayName || authState.user.email}`,
            "info"
        );
        return;
    }
    id("authName")?.value;
    dlg.showModal();
}

export async function handleAuthSubmit() {
    const name = document.getElementById("authName")?.value.trim();
    const email = document.getElementById("authEmail")?.value.trim();
    const pass = document.getElementById("authPass")?.value;
    const btn = document.getElementById("btnAuthSubmit");

    if (!email || !pass) {
        toast("Email and password required.", "error");
        return;
    }

    const fa = window.firebaseAuth;
    if (!fa) return;

    const originalText = btn?.innerHTML;
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span>';
    }

    try {
        let userCredential;

        // Try to sign in first
        try {
            userCredential = await fa.signInWithEmailAndPassword(fa.auth, email, pass);
        } catch (signInError) {
            // If sign-in fails with "user not found", try creating account
            if (signInError.code === "auth/user-not-found" || signInError.code === "auth/invalid-credential") {
                if (!name) {
                    toast("Name required for new account.", "error");
                    if (btn) {
                        btn.disabled = false;
                        btn.innerHTML = originalText;
                    }
                    return;
                }

                // Create new account
                userCredential = await fa.createUserWithEmailAndPassword(fa.auth, email, pass);

                // Set display name
                if (userCredential.user && name) {
                    await window.firebaseAuth.updateProfile(userCredential.user, { displayName: name });
                }

                toast("Account created successfully!", "success");
            } else {
                throw signInError; // Re-throw if it's a different error
            }
        }

        document.getElementById("dlgAuth")?.close();
        toast("Signed in successfully!", "success");

    } catch (error) {
        console.error("Auth error:", error);

        let errorMsg = "Authentication failed.";
        if (error.code === "auth/invalid-email") {
            errorMsg = "Invalid email address.";
        } else if (error.code === "auth/wrong-password") {
            errorMsg = "Incorrect password.";
        } else if (error.code === "auth/weak-password") {
            errorMsg = "Password should be at least 6 characters.";
        } else if (error.code === "auth/email-already-in-use") {
            errorMsg = "Email already in use. Try signing in instead.";
        }

        toast(errorMsg, "error");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText || "Sign in";
        }
    }
}


export function handleGoogleSignIn() {
    const fa = window.firebaseAuth;
    if (!fa) {
        toast("Auth not ready. Check Firebase config.", "error");
        return;
    }
    const dlgAuth = id("dlgAuth");
    fa.signInWithPopup(fa.auth, fa.googleProvider)
        .then(() => {
            dlgAuth?.close();
            toast("Signed in with Google.", "success");
        })
        .catch((err) => {
            if (err.code !== "auth/popup-closed-by-user") {
                toast(err.message || "Google sign-in failed.", "error");
            }
        });
}

export function handleGithubSignIn() {
    const fa = window.firebaseAuth;
    if (!fa || !fa.githubProvider) {
        toast("GitHub auth not configured.", "error");
        return;
    }
    const dlgAuth = id("dlgAuth");
    fa.signInWithPopup(fa.auth, fa.githubProvider)
        .then(() => {
            dlgAuth?.close();
            toast("Signed in with GitHub.", "success");
        })
        .catch((err) => {
            if (err.code !== "auth/popup-closed-by-user") {
                toast(err.message || "GitHub sign-in failed.", "error");
            }
        });
}

export function handleTwitterSignIn() {
    const fa = window.firebaseAuth;
    if (!fa || !fa.twitterProvider) {
        toast("X/Twitter auth not configured.", "error");
        return;
    }
    const dlgAuth = id("dlgAuth");
    fa.signInWithPopup(fa.auth, fa.twitterProvider)
        .then(() => {
            dlgAuth?.close();
            toast("Signed in with X.", "success");
        })
        .catch((err) => {
            if (err.code !== "auth/popup-closed-by-user") {
                toast(err.message || "X sign-in failed.", "error");
            }
        });
}

export function handleSignOut() {
    const fa = window.firebaseAuth;
    if (!fa) return;
    fa
        .signOut(fa.auth)
        .then(() => toast("Signed out.", "info"))
        .catch((err) => toast(err.message || "Sign-out failed.", "error"));
}
