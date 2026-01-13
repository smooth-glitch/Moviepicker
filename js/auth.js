import { id } from "./dom.js";
import { authState } from "./state.js";
import { toast } from "./ui.js";

export function updateUserChip() {
    const btn = document.getElementById("btnUser");
    const u = authState.user;

    if (!u) {
        // Not logged in - show default icon
        if (btn) {
            btn.innerHTML = `
          <span class="inline-flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 11c-1.5 0-2.5.5-3 2"/>
              <path d="M4 6a2 2 0 0 0-2 2v4a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V8a2 2 0 0 0-2-2h-3a8 8 0 0 0-5 2 8 8 0 0 0-5-2z"/>
              <path d="M6 11c1.5 0 2.5.5 3 2"/>
            </svg>
          </span>
          <span id="userChipLabel" class="text-xs md:text-sm font-medium">Save pools</span>
        `;
        }
        return;
    }

    // User is logged in - show avatar with frame
    const displayName = u.displayName || u.email?.split("@")[0] || "User";

    // PRIORITY: Firestore photoURL (Base64) > Google photoURL > Avatar API
    let photoURL = window.firestoreUserData?.photoURL;

    if (!photoURL || (!photoURL.startsWith("data:image/") && photoURL.length < 200)) {
        photoURL = u.photoURL;
    }

    if (!photoURL) {
        photoURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&size=80`;
    }

    // Get profile frame
    const userFrame = window.firestoreUserData?.profileFrame || "none";
    const frameClass = (userFrame && userFrame !== "none") ? `has-frame-${userFrame}` : "";

    if (btn) {
        btn.innerHTML = `
        <div class="avatar">
          <div class="w-10 md:w-12 rounded-full ring-4 ring-offset-base-100 ring-offset-2" style="background: hsl(var(--b3));" id="headerAvatarRing">
            <img src="${photoURL}" alt="${displayName}" class="rounded-full ${frameClass}" />
          </div>
        </div>
        <span id="userChipLabel" class="text-xs md:text-sm font-medium truncate max-w-[100px]">${displayName}</span>
      `;

        // Apply frame animation to header avatar ring
        if (userFrame && userFrame !== "none") {
            setTimeout(() => {
                const ring = document.getElementById("headerAvatarRing");
                if (ring) {
                    ring.classList.add(`profile-frame-${userFrame}`);
                }
            }, 100);
        }
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
