import { auth, isFirebaseConfigured } from './firebase-config.js';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

let currentUser = null;
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

export async function login(email, password) {
  if (!isFirebaseConfigured) throw new Error('Firebase is not configured yet.');
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  if (!isFirebaseConfigured) return;
  await signOut(auth);
}

if (isFirebaseConfigured) {
  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    listeners.forEach((cb) => cb(currentUser));
  });
}
