const STORAGE_KEY = 'murabbi_activeEventId';
const target = new EventTarget();

export function getActiveEventId() {
  return localStorage.getItem(STORAGE_KEY);
}

export function setActiveEventId(eventId) {
  if (eventId) localStorage.setItem(STORAGE_KEY, eventId);
  else localStorage.removeItem(STORAGE_KEY);
  target.dispatchEvent(new CustomEvent('change', { detail: eventId }));
}

export function onActiveEventChange(cb) {
  const handler = (e) => cb(e.detail);
  target.addEventListener('change', handler);
  return () => target.removeEventListener('change', handler);
}
