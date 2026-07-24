import { onAuthChange, logout } from './auth.js';
import { isFirebaseConfigured } from './firebase-config.js';
import { renderLoginScreen } from './loginScreen.js';
import { startRouter, navigate } from './router.js';
import { getActiveEventId, onActiveEventChange } from './lib/eventState.js';
import { subscribeEvents } from './lib/store.js';

const loginScreenEl = document.getElementById('login-screen');
const appShellEl = document.getElementById('app-shell');

let routerStarted = false;
let allEvents = [];
let unsubEvents = null;

function updateEventSwitcherLabel() {
  const label = document.getElementById('event-switcher-label');
  const activeId = getActiveEventId();
  const active = allEvents.find((e) => e.id === activeId);
  label.textContent = active ? active.name : 'Select event';
}

function boot() {
  if (!isFirebaseConfigured) {
    loginScreenEl.classList.remove('hidden');
    appShellEl.classList.add('hidden');
    renderLoginScreen();
    return;
  }

  onAuthChange((user) => {
    if (user) {
      loginScreenEl.classList.add('hidden');
      appShellEl.classList.remove('hidden');

      if (!unsubEvents) {
        unsubEvents = subscribeEvents((events) => {
          allEvents = events;
          updateEventSwitcherLabel();
        });
      }

      if (!routerStarted) {
        routerStarted = true;
        startRouter();
      }
    } else {
      loginScreenEl.classList.remove('hidden');
      appShellEl.classList.add('hidden');
      renderLoginScreen();
      if (unsubEvents) {
        unsubEvents();
        unsubEvents = null;
      }
      routerStarted = false;
      location.hash = '';
    }
  });
}

document.getElementById('event-switcher-btn').addEventListener('click', () => navigate('events'));
document.getElementById('logout-btn').addEventListener('click', () => logout());
onActiveEventChange(updateEventSwitcherLabel);

function updateOfflineIndicator() {
  document.getElementById('offline-indicator').classList.toggle('hidden', navigator.onLine);
}
window.addEventListener('online', updateOfflineIndicator);
window.addEventListener('offline', updateOfflineIndicator);
updateOfflineIndicator();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.error('SW registration failed', err));
  });
}

boot();
