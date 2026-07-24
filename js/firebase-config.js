import { firebaseConfig } from './firebase-keys.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith('PASTE_');

export let app = null;
export let auth = null;
export let db = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  // browserLocalPersistence is already the default — no setPersistence() call needed,
  // and skipping it removes an unawaited async timing window before auth is used.
  auth = getAuth(app);
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
}
