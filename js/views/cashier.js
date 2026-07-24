import { subscribeItems, subscribeDiscountRules, commitSale } from '../lib/store.js';
import { getCurrentUser } from '../auth.js';
import { showToast } from '../lib/toast.js';
import { openModal, closeModal } from '../lib/modal.js';
import { escapeHtml } from '../lib/utils.js';
import {
  addLineItem,
  updateLineQty,
  removeLineItem,
  computeCartTotals,
  computeChangeDue,
  cartItemCount,
  formatMoney,
} from '../lib/discounts.js';

const QUICK_CASH = [10, 20, 50, 100];

export function render(container, { eventId }) {
  container.innerHTML = `
    <div class="two-col">
      <div class="stack">
        <div class="field" style="margin-bottom:0;">
          <input id="item-search" type="text" placeholder="Search books…" />
        </div>
        <div id="category-chips" class="row" style="flex-wrap:wrap;gap:8px;"></div>
        <div id="item-grid" class="stack"></div>
      </div>
      <div class="col-side">
        <div class="card" id="cart-panel"></div>
      </div>
    </div>`;

  let items = [];
  let discountRules = [];
  let cart = [];
  let removedRuleIds = [];
  let manualDiscounts = [];
  let paymentMode = 'cash';
  let amountPaid = 0;
  let amountPaidStr = '';
  let searchTerm = '';
  let activeCategory = 'All';
  let submitting = false;

  const unsubItems = subscribeItems(eventId, (list) => {
    items = list.filter((i) => i.active !== false);
    renderPicker();
  });
  const unsubRules = subscribeDiscountRules(eventId, (rules) => {
    discountRules = rules;
    renderCart();
  });

  function categories() {
    return ['All', ...new Set(items.map((i) => i.category))];
  }

  function renderPicker() {
    const chipsEl = document.getElementById('category-chips');
    chipsEl.innerHTML = categories()
      .map((c) => `<button type="button" class="btn btn-outline btn-sm ${c === activeCategory ? 'active' : ''}" data-cat="${escapeAttr(c)}">${escapeHtml(c)}</button>`)
      .join('');
    chipsEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat;
        renderPicker();
      });
    });

    const term = searchTerm.trim().toLowerCase();
    const filtered = items.filter((i) => {
      const matchesCat = activeCategory === 'All' || i.category === activeCategory;
      const matchesTerm = !term || i.name.toLowerCase().includes(term);
      return matchesCat && matchesTerm;
    });

    const gridEl = document.getElementById('item-grid');
    if (!filtered.length) {
      gridEl.innerHTML = `<div class="empty-state card">No books match. Try a different search or add books in the Price List.</div>`;
      return;
    }
    gridEl.innerHTML = filtered
      .map((item) => {
        const lowStock = item.stockOnHand <= item.lowStockThreshold;
        const outOfStock = item.stockOnHand <= 0;
        return `
        <button type="button" class="card row-between item-tile" data-id="${item.id}" ${outOfStock ? '' : ''} style="text-align:left;cursor:pointer;">
          <div>
            <div style="font-weight:600;">${escapeHtml(item.name)}</div>
            <div class="text-muted" style="font-size:13px;">${escapeHtml(item.category)}${outOfStock ? ' · <span class="text-error">Out of stock</span>' : lowStock ? ` · <span class="text-error">${item.stockOnHand} left</span>` : ''}</div>
          </div>
          <div class="price" style="font-size:18px;">${formatMoney(item.sellingPrice)}</div>
        </button>`;
      })
      .join('');
    gridEl.querySelectorAll('.item-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = items.find((i) => i.id === btn.dataset.id);
        cart = addLineItem(cart, item, 1);
        renderCart();
      });
    });
  }

  function totals() {
    return computeCartTotals(cart, discountRules, { removedRuleIds, manualDiscounts });
  }

  function renderCart() {
    const t = totals();
    const change = computeChangeDue(t.grandTotal, amountPaid);
    const panel = document.getElementById('cart-panel');

    panel.innerHTML = `
      <div class="row-between" style="margin-bottom:12px;">
        <h3 style="margin:0;">Current Sale</h3>
        <div class="row">
          <span class="chip">${cartItemCount(cart)} items</span>
          ${cart.length ? '<button id="clear-cart-btn" class="btn btn-ghost btn-sm">Clear</button>' : ''}
        </div>
      </div>

      ${
        cart.length === 0
          ? `<div class="empty-state" style="padding:24px 0;">Cart is empty.<br/>Tap a book to add it.</div>`
          : `<div class="stack" style="gap:10px;margin-bottom:12px;">
              ${cart
                .map(
                  (line) => `
                <div class="row-between" data-line="${line.itemId}">
                  <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;">${escapeHtml(line.name)}</div>
                    <div class="text-muted" style="font-size:13px;">${formatMoney(line.unitPrice)} each</div>
                  </div>
                  <div class="row" style="gap:6px;">
                    <button class="btn btn-outline btn-icon btn-sm qty-btn" data-id="${line.itemId}" data-delta="-1">−</button>
                    <span style="min-width:20px;text-align:center;">${line.qty}</span>
                    <button class="btn btn-outline btn-icon btn-sm qty-btn" data-id="${line.itemId}" data-delta="1">+</button>
                  </div>
                  <div class="price" style="width:70px;text-align:right;">${formatMoney(line.unitPrice * line.qty)}</div>
                  <button class="btn btn-ghost btn-icon btn-sm remove-line-btn" data-id="${line.itemId}" aria-label="Remove">✕</button>
                </div>`
                )
                .join('')}
            </div>`
      }

      ${
        t.allDiscounts.length
          ? `<div class="stack" style="gap:6px;margin-bottom:12px;">
              ${t.allDiscounts
                .map(
                  (d, i) => `
                <div class="row-between chip-success" style="padding:8px 12px;border-radius:var(--radius);">
                  <span style="font-weight:600;">${escapeHtml(d.label)}${d.auto ? '' : ' (manual)'}</span>
                  <span class="row" style="gap:8px;">
                    <span>−${formatMoney(d.amount)}</span>
                    <button class="btn-ghost btn-icon" style="min-height:auto;width:20px;height:20px;padding:0;" data-discount-remove="${d.auto ? 'rule:' + d.ruleId : 'manual:' + i}" aria-label="Cancel discount">✕</button>
                  </span>
                </div>`
                )
                .join('')}
            </div>`
          : ''
      }

      <button id="add-manual-discount-btn" class="btn btn-outline btn-sm btn-block" style="margin-bottom:12px;">+ Add manual discount</button>

      <div class="stack" style="gap:4px;border-top:1px solid var(--color-outline-variant);padding-top:12px;margin-bottom:12px;">
        <div class="row-between"><span class="text-muted">Subtotal</span><span>${formatMoney(t.subtotal)}</span></div>
        ${t.totalDiscount > 0 ? `<div class="row-between"><span class="text-muted">Discount</span><span class="text-success">−${formatMoney(t.totalDiscount)}</span></div>` : ''}
        <div class="row-between" style="font-family:var(--font-headline);font-weight:700;font-size:20px;"><span>Grand Total</span><span class="price">${formatMoney(t.grandTotal)}</span></div>
      </div>

      <div class="label-sm" style="margin-bottom:6px;">Payment mode</div>
      <div class="row" style="margin-bottom:12px;">
        <button class="btn btn-outline ${paymentMode === 'cash' ? 'active' : ''}" data-mode="cash" style="flex:1;">Cash</button>
        <button class="btn btn-outline ${paymentMode === 'paynow' ? 'active' : ''}" data-mode="paynow" style="flex:1;">PayNow</button>
      </div>

      <div class="label-sm" style="margin-bottom:6px;">Amount paid</div>
      <div class="input-prefix" style="margin-bottom:8px;">
        <span>$</span>
        <input id="amount-paid-input" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0.00" value="${amountPaidStr}" />
      </div>
      <div class="row" style="gap:8px;margin-bottom:12px;flex-wrap:wrap;">
        ${QUICK_CASH.map((v) => `<button class="btn btn-outline btn-sm quick-cash-btn" data-amount="${v}">$${v}</button>`).join('')}
        <button class="btn btn-outline btn-sm" id="exact-amount-btn">Exact</button>
      </div>

      <div class="row-between" style="padding:12px;border-radius:var(--radius);background:${change < 0 ? 'var(--color-error-container)' : 'var(--color-surface-container)'};margin-bottom:12px;">
        <span style="font-weight:600;">${change < 0 ? 'Still owed' : 'Change due'}</span>
        <span class="price" style="font-size:20px;">${formatMoney(Math.abs(change))}</span>
      </div>

      <button id="complete-sale-btn" class="btn btn-primary btn-lg btn-block" ${cart.length === 0 || submitting ? 'disabled' : ''}>
        ${submitting ? 'Logging sale…' : 'Complete Sale & Log'}
      </button>
    `;

    attachCartListeners(t);
  }

  function attachCartListeners(t) {
    const panel = document.getElementById('cart-panel');
    panel.querySelectorAll('.qty-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const line = cart.find((l) => l.itemId === btn.dataset.id);
        if (!line) return;
        cart = updateLineQty(cart, btn.dataset.id, line.qty + Number(btn.dataset.delta));
        renderCart();
      });
    });
    panel.querySelectorAll('.remove-line-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        cart = removeLineItem(cart, btn.dataset.id);
        renderCart();
      });
    });
    const clearBtn = document.getElementById('clear-cart-btn');
    if (clearBtn) clearBtn.addEventListener('click', () => resetCart());

    panel.querySelectorAll('[data-discount-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [kind, val] = btn.dataset.discountRemove.split(':');
        if (kind === 'rule') removedRuleIds = [...removedRuleIds, val];
        else manualDiscounts = manualDiscounts.filter((_, i) => String(i) !== val);
        renderCart();
      });
    });

    document.getElementById('add-manual-discount-btn').addEventListener('click', () => {
      openManualDiscountModal();
    });

    panel.querySelectorAll('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        paymentMode = btn.dataset.mode;
        renderCart();
      });
    });

    const amountInput = document.getElementById('amount-paid-input');
    amountInput.addEventListener('input', () => {
      amountPaidStr = amountInput.value;
      amountPaid = Number(amountInput.value) || 0;
      updateChangeOnly();
    });
    amountInput.addEventListener('focus', () => amountInput.select());

    panel.querySelectorAll('.quick-cash-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        amountPaid = Number(btn.dataset.amount);
        amountPaidStr = String(amountPaid);
        renderCart();
      });
    });
    document.getElementById('exact-amount-btn').addEventListener('click', () => {
      amountPaid = t.grandTotal;
      amountPaidStr = amountPaid.toFixed(2);
      renderCart();
    });

    const completeBtn = document.getElementById('complete-sale-btn');
    completeBtn.addEventListener('click', () => handleCompleteSale(t));
  }

  // Avoid a full re-render (and losing input focus) on every keystroke in the amount field.
  function updateChangeOnly() {
    const t = totals();
    const change = computeChangeDue(t.grandTotal, amountPaid);
    const box = document.querySelector('#cart-panel > div.row-between[style*="border-radius"]');
    if (!box) return;
    box.style.background = change < 0 ? 'var(--color-error-container)' : 'var(--color-surface-container)';
    box.querySelector('span:first-child').textContent = change < 0 ? 'Still owed' : 'Change due';
    box.querySelector('.price').textContent = formatMoney(Math.abs(change));
  }

  async function handleCompleteSale(t) {
    if (!cart.length || submitting) return;
    submitting = true;
    renderCart();
    try {
      const sale = {
        lineItems: cart.map((l) => ({ itemId: l.itemId, name: l.name, unitPrice: l.unitPrice, qty: l.qty, lineTotal: Math.round(l.unitPrice * l.qty * 100) / 100 })),
        discountsApplied: t.allDiscounts,
        subtotal: t.subtotal,
        totalDiscount: t.totalDiscount,
        grandTotal: t.grandTotal,
        amountPaid,
        changeGiven: Math.max(0, computeChangeDue(t.grandTotal, amountPaid)),
        paymentMode,
      };
      await commitSale(eventId, sale, getCurrentUser()?.uid || null);
      showToast('Sale logged', 'success');
      resetCart();
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Could not log sale (it will retry once you\'re back online)', 'error');
    } finally {
      submitting = false;
      renderCart();
    }
  }

  function openManualDiscountModal() {
    const sheet = openModal(`
      <h2>Add manual discount</h2>
      <form id="manual-discount-form" class="stack">
        <div class="field">
          <label class="label-sm" for="md-label">Label</label>
          <input id="md-label" type="text" placeholder="e.g. Friend discount" required />
        </div>
        <div class="field" style="margin-bottom:0;">
          <label class="label-sm" for="md-amount">Amount</label>
          <div class="input-prefix"><span>$</span><input id="md-amount" type="number" inputmode="decimal" step="0.01" min="0.01" placeholder="0.00" required /></div>
        </div>
        <button class="btn btn-primary btn-block btn-lg" type="submit">Add discount</button>
      </form>
    `);
    sheet.querySelector('#manual-discount-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const label = document.getElementById('md-label').value.trim();
      const amount = Number(document.getElementById('md-amount').value);
      if (!label || !(amount > 0)) return;
      manualDiscounts = [...manualDiscounts, { label, amount: Math.round(amount * 100) / 100 }];
      closeModal();
      renderCart();
    });
  }

  function resetCart() {
    cart = [];
    removedRuleIds = [];
    manualDiscounts = [];
    amountPaid = 0;
    amountPaidStr = '';
    renderCart();
  }

  document.getElementById('item-search').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderPicker();
  });

  renderPicker();
  renderCart();

  return () => {
    unsubItems();
    unsubRules();
  };
}

const escapeAttr = escapeHtml;
