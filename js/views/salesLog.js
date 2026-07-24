import { subscribeSales, voidSale } from '../lib/store.js';
import { showToast } from '../lib/toast.js';
import { openModal, closeModal } from '../lib/modal.js';
import { formatMoney } from '../lib/discounts.js';
import { escapeHtml } from '../lib/utils.js';

export function render(container, { eventId }) {
  container.innerHTML = `
    <div class="content-max stack">
      <div class="row-between">
        <h1>Sales Log</h1>
        <div class="row" id="mode-filter" style="gap:6px;">
          <button class="btn btn-outline btn-sm active" data-mode="all">All</button>
          <button class="btn btn-outline btn-sm" data-mode="cash">Cash</button>
          <button class="btn btn-outline btn-sm" data-mode="paynow">PayNow</button>
        </div>
      </div>
      <div id="sales-list" class="stack"></div>
    </div>`;

  let sales = [];
  let modeFilter = 'all';

  const unsub = subscribeSales(eventId, (list) => {
    sales = list;
    renderList();
  });

  document.getElementById('mode-filter').querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => {
      modeFilter = btn.dataset.mode;
      document.querySelectorAll('#mode-filter button').forEach((b) => b.classList.toggle('active', b === btn));
      renderList();
    });
  });

  function renderList() {
    const listEl = document.getElementById('sales-list');
    const filtered = modeFilter === 'all' ? sales : sales.filter((s) => s.paymentMode === modeFilter);

    if (!filtered.length) {
      listEl.innerHTML = `<div class="empty-state card">No sales logged yet for this event.</div>`;
      return;
    }

    listEl.innerHTML = filtered
      .map((sale) => {
        const time = sale.timestamp?.toDate ? sale.timestamp.toDate() : null;
        const timeStr = time ? time.toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }) : 'Just now';
        const itemsSummary = sale.lineItems.map((l) => `${l.qty}× ${l.name}`).join(', ');
        return `
        <div class="card ${sale.voided ? 'strike' : ''}" data-id="${sale.id}">
          <div class="row-between">
            <div style="min-width:0;">
              <div class="row" style="gap:8px;">
                <span style="font-weight:600;">${formatMoney(sale.grandTotal)}</span>
                <span class="chip">${sale.paymentMode === 'paynow' ? 'PayNow' : 'Cash'}</span>
                ${sale.voided ? '<span class="chip chip-error">Voided</span>' : ''}
              </div>
              <div class="text-muted" style="font-size:13px;margin-top:2px;">${timeStr}</div>
              <div class="text-muted" style="font-size:13px;margin-top:4px;">${escapeHtml(itemsSummary)}</div>
            </div>
            ${sale.voided ? '' : `<button class="btn btn-ghost btn-sm void-btn" data-id="${sale.id}">Void</button>`}
          </div>
        </div>`;
      })
      .join('');

    listEl.querySelectorAll('.void-btn').forEach((btn) => {
      btn.addEventListener('click', () => confirmVoid(btn.dataset.id));
    });
  }

  function confirmVoid(saleId) {
    const sheet = openModal(`
      <h2>Void this sale?</h2>
      <p class="text-muted">Stock will be added back and totals/profit will be recalculated. This can't be undone.</p>
      <div class="row" style="gap:8px;">
        <button id="void-cancel-btn" class="btn btn-outline" style="flex:1;">Cancel</button>
        <button id="void-confirm-btn" class="btn btn-danger" style="flex:1;">Void sale</button>
      </div>
    `);
    sheet.querySelector('#void-cancel-btn').addEventListener('click', closeModal);
    sheet.querySelector('#void-confirm-btn').addEventListener('click', async () => {
      closeModal();
      try {
        await voidSale(eventId, saleId);
        showToast('Sale voided', 'default');
      } catch (err) {
        showToast(err.message || 'Could not void sale', 'error');
      }
    });
  }

  return () => unsub();
}
