import {
  subscribeEvent,
  subscribeItems,
  subscribePerItemAggregates,
  subscribeExpenses,
  addExpense,
  deleteExpense,
} from '../lib/store.js';
import { showToast } from '../lib/toast.js';
import { openModal, closeModal } from '../lib/modal.js';
import { formatMoney, round2 } from '../lib/discounts.js';
import { escapeHtml } from '../lib/utils.js';

const EXPENSE_LABELS = { booth: 'Booth', display: 'Display / Decor', misc: 'Misc' };

export function render(container, { eventId }) {
  let event = null;
  let items = [];
  let perItem = [];
  let expenses = [];

  container.innerHTML = `<div class="content-max stack" id="dashboard-body"></div>`;

  const unsubEvent = subscribeEvent(eventId, (ev) => {
    event = ev;
    renderBody();
  });
  const unsubItems = subscribeItems(eventId, (list) => {
    items = list;
    renderBody();
  });
  const unsubPerItem = subscribePerItemAggregates(eventId, (list) => {
    perItem = list;
    renderBody();
  });
  const unsubExpenses = subscribeExpenses(eventId, (list) => {
    expenses = list;
    renderBody();
  });

  function renderBody() {
    if (!event) return;
    const bodyEl = document.getElementById('dashboard-body');
    const revenue = event.revenueTotal || 0;
    const cogs = event.cogsTotal || 0;
    const discount = event.discountTotal || 0;
    const grossProfit = round2(revenue - cogs);
    const expensesTotal = round2(expenses.reduce((s, e) => s + e.amount, 0));
    const finalProfit = round2(grossProfit - expensesTotal);

    const topProducts = [...perItem].filter((p) => p.qtySold > 0).sort((a, b) => b.qtySold - a.qtySold);
    const maxQty = topProducts[0]?.qtySold || 1;

    const itemById = new Map(items.map((i) => [i.id, i]));

    bodyEl.innerHTML = `
      <h1>Profit Dashboard</h1>

      <div class="grid-stats">
        <div class="stat-tile"><div class="label">Total Revenue</div><div class="value">${formatMoney(revenue)}</div></div>
        <div class="stat-tile"><div class="label">Total Cost (COGS)</div><div class="value">${formatMoney(cogs)}</div></div>
        <div class="stat-tile"><div class="label">Discounts Given</div><div class="value">${formatMoney(discount)}</div></div>
        <div class="stat-tile"><div class="label">Transactions</div><div class="value">${event.transactionCount || 0}</div></div>
      </div>

      <div class="tonal-card">
        <div class="label-sm" style="color:rgba(255,255,255,0.75);">Final Net Profit</div>
        <div class="price" style="font-size:36px;">${formatMoney(finalProfit)}</div>
        <div class="stack" style="gap:2px;margin-top:12px;font-size:14px;opacity:0.9;">
          <div class="row-between"><span>Revenue</span><span>${formatMoney(revenue)}</span></div>
          <div class="row-between"><span>Less COGS</span><span>-${formatMoney(cogs)}</span></div>
          <div class="row-between"><span>Less expenses</span><span>-${formatMoney(expensesTotal)}</span></div>
        </div>
      </div>

      <h2>Top Products</h2>
      <div class="card stack" style="gap:14px;">
        ${
          topProducts.length
            ? topProducts
                .slice(0, 10)
                .map(
                  (p, i) => `
          <div>
            <div class="row-between" style="margin-bottom:4px;">
              <span style="font-weight:600;">#${i + 1} ${escapeHtml(p.name)}</span>
              <span class="text-muted">${p.qtySold} sold · ${formatMoney(p.revenue)}</span>
            </div>
            <div style="height:6px;border-radius:99px;background:var(--color-surface-container);overflow:hidden;">
              <div style="height:100%;width:${Math.round((p.qtySold / maxQty) * 100)}%;background:var(--color-primary);"></div>
            </div>
          </div>`
                )
                .join('')
            : `<div class="empty-state">No sales yet.</div>`
        }
      </div>

      <h2>Profit Breakdown by Item</h2>
      <div class="card card-flush table-scroll">
        <table class="data-table">
          <thead><tr><th>Item</th><th class="text-right">Qty Sold</th><th class="text-right">Cost Total</th><th class="text-right">Revenue</th><th class="text-right">Profit</th></tr></thead>
          <tbody>
            ${
              topProducts.length
                ? topProducts
                    .map((p) => {
                      const item = itemById.get(p.id);
                      const costTotal = round2((item?.costPrice || 0) * p.qtySold);
                      const profit = round2(p.revenue - costTotal);
                      return `<tr>
                        <td>${escapeHtml(p.name)}</td>
                        <td class="text-right">${p.qtySold}</td>
                        <td class="text-right">${formatMoney(costTotal)}</td>
                        <td class="text-right">${formatMoney(p.revenue)}</td>
                        <td class="text-right ${profit < 0 ? 'text-error' : 'text-success'}">${formatMoney(profit)}</td>
                      </tr>`;
                    })
                    .join('')
                : `<tr><td colspan="5" class="text-muted text-center" style="padding:24px;">No sales yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>

      <div class="row-between">
        <h2 style="margin:0;">Event Expenses</h2>
        <button id="add-expense-btn" class="btn btn-outline btn-sm">+ Add Expense</button>
      </div>
      <div class="stack">
        ${
          expenses.length
            ? expenses
                .map(
                  (e) => `
          <div class="card row-between" data-id="${e.id}">
            <div>
              <span style="font-weight:600;">${escapeHtml(e.label)}</span>
              <span class="chip" style="margin-left:8px;">${EXPENSE_LABELS[e.category] || 'Misc'}</span>
            </div>
            <div class="row">
              <span class="price">${formatMoney(e.amount)}</span>
              <button class="btn btn-ghost btn-icon btn-sm delete-expense-btn" data-id="${e.id}" aria-label="Delete">🗑</button>
            </div>
          </div>`
                )
                .join('')
            : `<div class="empty-state card">No expenses logged (booth rental, display/decor, misc).</div>`
        }
      </div>
    `;

    document.getElementById('add-expense-btn').addEventListener('click', openExpenseModal);
    bodyEl.querySelectorAll('.delete-expense-btn').forEach((btn) =>
      btn.addEventListener('click', async () => {
        await deleteExpense(eventId, btn.dataset.id);
        showToast('Expense removed');
      })
    );
  }

  function openExpenseModal() {
    const sheet = openModal(`
      <h2>Add Expense</h2>
      <form id="expense-form" class="stack">
        <div class="field">
          <label class="label-sm" for="ex-label">Label</label>
          <input id="ex-label" type="text" placeholder="e.g. Booth rental" required />
        </div>
        <div class="field">
          <label class="label-sm" for="ex-category">Category</label>
          <select id="ex-category">
            <option value="booth">Booth</option>
            <option value="display">Display / Decor</option>
            <option value="misc">Misc</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:0;">
          <label class="label-sm" for="ex-amount">Amount</label>
          <div class="input-prefix"><span>$</span><input id="ex-amount" type="number" step="0.01" min="0.01" required /></div>
        </div>
        <button class="btn btn-primary btn-block btn-lg" type="submit">Add expense</button>
      </form>
    `);
    sheet.querySelector('#expense-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const label = document.getElementById('ex-label').value.trim();
      const category = document.getElementById('ex-category').value;
      const amount = Number(document.getElementById('ex-amount').value);
      if (!label || !(amount > 0)) return;
      try {
        await addExpense(eventId, { label, category, amount });
        closeModal();
        showToast('Expense added', 'success');
      } catch (err) {
        showToast(err.message || 'Could not add expense', 'error');
      }
    });
  }

  return () => {
    unsubEvent();
    unsubItems();
    unsubPerItem();
    unsubExpenses();
  };
}
