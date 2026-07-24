import { login } from './auth.js';
import { isFirebaseConfigured } from './firebase-config.js';
import { showToast } from './lib/toast.js';

export function renderLoginScreen() {
  const el = document.getElementById('login-screen');

  if (!isFirebaseConfigured) {
    el.innerHTML = `
      <div class="login-card card">
        <img src="assets/icons/icon-192.png" alt="Murabbi Living" class="login-logo" />
        <h2 class="text-center">Firebase not configured</h2>
        <p class="text-muted text-center">Paste your Firebase project config into <code>js/firebase-keys.js</code> to enable sign-in.</p>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="login-card card stack">
      <img src="assets/icons/icon-192.png" alt="Murabbi Living" class="login-logo" />
      <h1 class="text-center" style="margin-bottom:0;">Murabbi Living</h1>
      <p class="text-muted text-center" style="margin-top:0;">Book fair sales & cashier</p>
      <form id="login-form" class="stack">
        <div class="field">
          <label class="label-sm" for="login-email">Email</label>
          <input id="login-email" type="email" autocomplete="username" required />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label class="label-sm" for="login-password">Password</label>
          <input id="login-password" type="password" autocomplete="current-password" required />
        </div>
        <button class="btn btn-primary btn-block btn-lg" type="submit">Log in</button>
      </form>
    </div>`;

  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';
    try {
      await login(email, password);
    } catch (err) {
      showToast(friendlyAuthError(err), 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log in';
    }
  });
}

function friendlyAuthError(err) {
  const code = err && err.code;
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Incorrect email or password.';
  }
  if (code === 'auth/too-many-requests') return 'Too many attempts — try again in a bit.';
  return err.message || 'Could not log in.';
}
