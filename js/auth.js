import { auth, isFirebaseConfigured } from './firebase-config.js';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// Only these Google accounts may use the app. Firestore rules enforce this too —
// this client-side check is just so an unauthorized sign-in is rejected immediately
// with a clear message, rather than silently failing on the first Firestore read.
const ALLOWED_EMAILS = new Set([
  'nurnasuhaa@gmail.com',
  'murabbi.books@gmail.com',
  'shaf.r210003@gmail.com',
]);

// iPadOS Safari reports a desktop "Macintosh" user agent by default, so a real Mac
// has to be told apart from an iPad by touch support instead (Macs report 0).
function isMobileDevice() {
  const ua = navigator.userAgent;
  const isPhone = /Android|iPhone|iPod/i.test(ua);
  const isIPad = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isPhone || isIPad;
}

let currentUser = null;
let lastAuthError = null;
const listeners = [];

export function onAuthChange(cb) {
  listeners.push(cb);
  cb(currentUser);
  return () => {
    const i = listeners.indexOf(cb);
    if (i >= 0) listeners.splice(i, 1);
  };
}

export function getCurrentUser() {
  return currentUser;
}

export function getLastAuthError() {
  return lastAuthError;
}

// Popup and redirect each break in different places depending on platform: some
// desktop browsers (confirmed: Firefox's storage partitioning) silently break
// redirect's pending-state persistence across the trip to accounts.google.com, while
// mobile browsers — especially iOS Safari and installed/home-screen PWAs — frequently
// block or can't complete popup-based sign-in at all. Popup on desktop, redirect on
// mobile is Firebase's own recommended split for exactly this reason.
export async function loginWithGoogle() {
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured yet.');
  lastAuthError = null; // clear any previous rejection message before a fresh attempt
  const provider = new GoogleAuthProvider();

  if (isMobileDevice()) {
    console.log('[auth] starting signInWithRedirect (mobile)');
    await signInWithRedirect(auth, provider);
    return;
  }

  console.log('[auth] starting signInWithPopup (desktop)');
  try {
    const result = await signInWithPopup(auth, provider);
    console.log('[auth] signInWithPopup resolved:', result.user.email);
  } catch (err) {
    console.log('[auth] signInWithPopup error:', err.code, err.message);
    lastAuthError = err.message || 'Could not sign in.';
    throw err;
  }
}

export async function logout() {
  if (!isFirebaseConfigured) return;
  await signOut(auth);
}

function isAllowed(user) {
  return !!(user && user.email && ALLOWED_EMAILS.has(user.email.toLowerCase()));
}

// Resolves once any pending Google-redirect sign-in (mobile path) has been fully
// processed. main.js waits on this before letting the service worker reload the
// page, so an in-flight redirect result can never get interrupted and silently lost.
export const redirectResultReady = isFirebaseConfigured
  ? getRedirectResult(auth)
      .then((result) => {
        console.log('[auth] getRedirectResult resolved:', result ? result.user?.email : '(no pending redirect)');
      })
      .catch((err) => {
        console.log('[auth] getRedirectResult error:', err.code, err.message);
        lastAuthError = err.message || 'Could not sign in.';
      })
  : Promise.resolve();

if (isFirebaseConfigured) {
  onAuthStateChanged(auth, async (user) => {
    console.log('[auth] onAuthStateChanged fired, user:', user ? user.email : null);
    if (user && !isAllowed(user)) {
      console.log('[auth] rejecting — not on the whitelist:', JSON.stringify(user.email));
      lastAuthError = `${user.email} isn't authorized to use this app.`;
      await signOut(auth);
      return; // signOut triggers this listener again with user = null; lastAuthError
      // is deliberately left set so the login screen can display it on that next call.
    }
    if (user) lastAuthError = null; // successful sign-in clears any prior error
    currentUser = user;
    console.log('[auth] notifying listeners, currentUser:', currentUser ? currentUser.email : null);
    listeners.forEach((cb) => cb(currentUser));
  });
}
