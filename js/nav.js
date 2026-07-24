export const NAV_ITEMS = [
  {
    route: 'cashier',
    label: 'Cashier',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  },
  {
    route: 'sales-log',
    label: 'Sales Log',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/></svg>',
  },
  {
    route: 'price-list',
    label: 'Price List',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24H4a1 1 0 0 0-1 1v5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l5.59-5.59a2 2 0 0 0 0-2.83Z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
  },
  {
    route: 'dashboard',
    label: 'Dashboard',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  },
];

export function renderNav(activeRoute) {
  const sidenav = document.getElementById('sidenav');
  const bottomnav = document.getElementById('bottomnav');
  const itemHtml = (item, extraClass) => `
    <button class="nav-item ${extraClass} ${item.route === activeRoute ? 'active' : ''}" data-route="${item.route}" type="button">
      ${item.icon}
      <span>${item.label}</span>
    </button>`;

  sidenav.innerHTML = NAV_ITEMS.map((i) => itemHtml(i, '')).join('');
  bottomnav.innerHTML = NAV_ITEMS.map((i) => itemHtml(i, '')).join('');

  [sidenav, bottomnav].forEach((nav) => {
    nav.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        location.hash = `#/${btn.dataset.route}`;
      });
    });
  });
}
