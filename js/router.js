import { renderNav } from './nav.js';
import { getActiveEventId } from './lib/eventState.js';

const routeLoaders = {
  events: () => import('./views/events.js'),
  cashier: () => import('./views/cashier.js'),
  'sales-log': () => import('./views/salesLog.js'),
  'price-list': () => import('./views/priceList.js'),
  dashboard: () => import('./views/dashboard.js'),
};

const EVENT_REQUIRED_ROUTES = ['cashier', 'sales-log', 'price-list', 'dashboard'];

let currentCleanup = null;
let routing = false;

function parseHash() {
  const raw = location.hash.replace(/^#\//, '');
  return raw || 'cashier';
}

export function navigate(route) {
  location.hash = `#/${route}`;
}

async function renderRoute() {
  if (routing) return;
  routing = true;
  try {
    let route = parseHash();

    if (route !== 'events' && EVENT_REQUIRED_ROUTES.includes(route) && !getActiveEventId()) {
      location.hash = '#/events';
      return;
    }
    if (!routeLoaders[route]) route = 'cashier';

    if (currentCleanup) {
      try {
        currentCleanup();
      } catch (e) {
        console.error(e);
      }
      currentCleanup = null;
    }

    renderNav(route);

    const container = document.getElementById('view');
    container.innerHTML = '';
    const mod = await routeLoaders[route]();
    const result = await mod.render(container, { eventId: getActiveEventId() });
    if (typeof result === 'function') currentCleanup = result;
  } finally {
    routing = false;
  }
}

export function startRouter() {
  window.addEventListener('hashchange', renderRoute);
  renderRoute();
}

export function rerenderCurrentRoute() {
  renderRoute();
}
