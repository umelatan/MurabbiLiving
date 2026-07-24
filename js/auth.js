import { auth, isFirebaseConfigured } from './firebase-config.js';
import {
  onAuthStateChanged,
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

export async function loginWithGoogle() {
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured yet.');
  lastAuthError = null; // clear any previous rejection message before a fresh attempt
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider);
}

export async function logout() {
  if (!isFirebaseConfigured) return;
  await signOut(auth);
}

function isAllowed(user) {
  return !!(user && user.email && ALLOWED_EMAILS.has(user.email.toLowerCase()));
}

// Resolves once any pending Google-redirect sign-in has been fully processed.
// main.js waits on this before letting the service worker reload the page, so an
// in-flight redirect result can never get interrupted (and silently lost) by a
// reload triggered by an unrelated app-update check landing at the same moment.
export const redirectResultReady = isFirebaseConfigured
  ? getRedirectResult(auth)
      .catch((err) => {
        lastAuthError = err.message || 'Could not sign in.';
      })
  : Promise.resolve();

if (isFirebaseConfigured) {
  onAuthStateChanged(auth, async (user) => {
    if (user && !isAllowed(user)) {
      lastAuthError = `${user.email} isn't authorized to use this app.`;
      await signOut(auth);
      return; // signOut triggers this listener again with user = null; lastAuthError
      // is deliberately left set so the login screen can display it on that next call.
    }
    if (user) lastAuthError = null; // successful sign-in clears any prior error
    currentUser = user;
    listeners.forEach((cb) => cb(currentUser));
  });
}
