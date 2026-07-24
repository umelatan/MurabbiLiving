let host = null;

function getHost() {
  if (!host) host = document.getElementById('toast-host');
  return host;
}

export function showToast(message, type = 'default', duration = 2600) {
  const el = document.createElement('div');
  el.className = `toast${type !== 'default' ? ` toast-${type}` : ''}`;
  el.textContent = message;
  getHost().appendChild(el);
  setTimeout(() => el.remove(), duration);
}
