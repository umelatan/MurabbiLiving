import {
  subscribeItems,
  subscribeDiscountRules,
  addItem,
  updateItem,
  deleteItem,
  addDiscountRule,
  updateDiscountRule,
  deleteDiscountRule,
} from '../lib/store.js';
import { showToast } from '../lib/toast.js';
import { openModal, closeModal } from '../lib/modal.js';
import { formatMoney } from '../lib/discounts.js';
import { escapeHtml, positionSegmentedThumb } from '../lib/utils.js';

const NEW_CATEGORY_VALUE = '__new__';

// A <select> of existing categories plus an explicit "+ Add new category" option,
// which reveals a text input. Deliberately not a <datalist> — datalist's "type
// something not in the list" behavior is unreliable on iPad Safari, which made
// adding a new category look impossible even though it technically worked.
function categoryFieldHtml(fieldId, categories, currentValue) {
  const isNew = !!currentValue && !categories.includes(currentValue);
  const showNewInput = isNew || categories.length === 0;
  const options = categories
    .map((c) => `<option value="${escapeHtml(c)}" ${currentValue === c ? 'selected' : ''}>${escapeHtml(c)}</option>`)
    .join('');
  return `
    <select id="${fieldId}-select">
      ${options}
      <option value="${NEW_CATEGORY_VALUE}" ${showNewInput ? 'selected' : ''}>+ Add new category…</option>
    </select>
    <input id="${fieldId}-new" type="text" placeholder="New category name" value="${escapeHtml(isNew ? currentValue : '')}" class="${showNewInput ? '' : 'hidden'}" style="margin-top:8px;" />
  `;
}

function wireCategoryField(sheet, fieldId) {
  const select = sheet.querySelector(`#${fieldId}-select`);
  const newInput = sheet.querySelector(`#${fieldId}-new`);
  select.addEventListener('change', () => {
    const showNew = select.value === NEW_CATEGORY_VALUE;
    newInput.classList.toggle('hidden', !showNew);
    if (showNew) newInput.focus();
  });
}

function getCategoryFieldValue(sheet, fieldId) {
  const select = sheet.querySelector(`#${fieldId}-select`);
  const newInput = sheet.querySelector(`#${fieldId}-new`);
  return select.value === NEW_CATEGORY_VALUE ? newInput.value.trim() : select.value;
}

export function render(container, { eventId }) {
  let viewMode = 'staff'; // 'staff' | 'customer'
  let staffTab = 'books'; // 'books' | 'rules'
  let items = [];
  let rules = [];
  let searchTerm = '';

  container.innerHTML = `
    <div class="content-max stack">
      <div class="row-between">
        <h1>Price List</h1>
        <div class="segmented" id="mode-toggle" data-active="staff">
          <div class="segmented-thumb"></div>
          <button class="segmented-btn active" data-mode="staff">Staff</button>
          <button class="segmented-btn" data-mode="customer">Customer</button>
        </div>
      </div>
      <div id="price-list-body"></div>
    </div>`;

  const modeToggleEl = document.getElementById('mode-toggle');
  modeToggleEl.querySelectorAll('.segmented-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      viewMode = btn.dataset.mode;
      modeToggleEl.dataset.active = viewMode;
      modeToggleEl.querySelectorAll('.segmented-btn').forEach((b) => b.classList.toggle('active', b === btn));
      positionSegmentedThumb(modeToggleEl);
      renderBody();
    });
  });
  positionSegmentedThumb(modeToggleEl);

  const unsubItems = subscribeItems(eventId, (list) => {
    items = list;
    renderBody();
  });
  const unsubRules = subscribeDiscountRules(eventId, (list) => {
    rules = list;
    renderBody();
  });

  function renderBody() {
    const bodyEl = document.getElementById('price-list-body');
    bodyEl.innerHTML = viewMode === 'staff' ? staffTemplate() : customerTemplate();
    if (viewMode === 'staff') attachStaffListeners();
    else attachCustomerListeners();
  }

  /* ---------------- Staff view ---------------- */

  function staffTemplate() {
    return `
      <div class="segmented segmented-sm" id="staff-tab-toggle" data-active="${staffTab}" style="margin:12px 0;">
        <div class="segmented-thumb"></div>
        <button class="segmented-btn ${staffTab === 'books' ? 'active' : ''}" data-tab="books">Books</button>
        <button class="segmented-btn ${staffTab === 'rules' ? 'active' : ''}" data-tab="rules">Discount Rules${rules.length ? ` (${rules.length})` : ''}</button>
      </div>
      ${staffTab === 'books' ? booksTemplate() : rulesTemplate()}
    `;
  }

  function booksTemplate() {
    return `
      <div class="row-between" style="margin-bottom:12px;">
        <input id="pl-search" type="text" placeholder="Search books…" style="max-width:280px;" value="${escapeHtml(searchTerm)}" />
        <button id="add-item-btn" class="btn btn-primary btn-sm">+ Add Book</button>
      </div>
      <div class="card card-flush table-scroll">
        <table class="data-table">
          <thead><tr>
            <th>Name</th><th>Category</th><th class="text-right">Cost</th><th class="text-right">Selling</th>
            <th class="text-right">Margin</th><th class="text-right">Stock</th><th></th>
          </tr></thead>
          <tbody>
            ${filteredItems()
              .map((item) => {
                const margin = item.sellingPrice > 0 ? (((item.sellingPrice - item.costPrice) / item.sellingPrice) * 100).toFixed(0) : '0';
                const low = item.stockOnHand <= item.lowStockThreshold;
                return `
                <tr data-id="${item.id}">
                  <td>${escapeHtml(item.name)}</td>
                  <td><span class="chip">${escapeHtml(item.category)}</span></td>
                  <td class="text-right">${formatMoney(item.costPrice)}</td>
                  <td class="text-right price">${formatMoney(item.sellingPrice)}</td>
                  <td class="text-right">${margin}%</td>
                  <td class="text-right ${low ? 'text-error' : ''}">${item.stockOnHand}</td>
                  <td class="text-right">
                    <button class="btn btn-ghost btn-icon btn-sm edit-item-btn" data-id="${item.id}" aria-label="Edit">✎</button>
                    <button class="btn btn-ghost btn-icon btn-sm delete-item-btn" data-id="${item.id}" aria-label="Delete">🗑</button>
                  </td>
                </tr>`;
              })
              .join('') || `<tr><td colspan="7" class="text-muted text-center" style="padding:24px;">No books yet — add your first one.</td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function rulesTemplate() {
    return `
      <div class="row-between" style="margin-bottom:12px;">
        <h2 style="margin:0;">Discount Rules</h2>
        <button id="add-rule-btn" class="btn btn-outline btn-sm">+ Add Rule</button>
      </div>
      <div class="stack">
        ${
          rules.length
            ? rules
                .map(
                  (rule) => `
          <div class="card row-between" data-id="${rule.id}">
            <div>
              <div style="font-weight:600;">${escapeHtml(rule.label)}</div>
              <div class="text-muted" style="font-size:13px;">${ruleDescription(rule)}</div>
            </div>
            <div class="row">
              <button class="btn btn-ghost btn-icon btn-sm edit-rule-btn" data-id="${rule.id}" aria-label="Edit">✎</button>
              <button class="btn btn-ghost btn-icon btn-sm delete-rule-btn" data-id="${rule.id}" aria-label="Delete">🗑</button>
            </div>
          </div>`
                )
                .join('')
            : `<div class="empty-state card">No discount rules yet.</div>`
        }
      </div>
    `;
  }

  function ruleDescription(rule) {
    if (rule.type === 'categoryQtyDiscount') {
      return `Buy ${rule.minQty}+ from "${escapeHtml(rule.category)}" → $${rule.discountAmount} off (per ${rule.minQty})`;
    }
    if (rule.type === 'itemTierPrice') {
      const item = items.find((i) => i.id === rule.itemId);
      const tiers = [...rule.tiers].sort((a, b) => a.qty - b.qty).map((t) => `${t.qty} for ${formatMoney(t.price)}`).join(', ');
      return `${item ? escapeHtml(item.name) : 'Item'}: ${tiers}`;
    }
    if (rule.type === 'itemPairDiscount') {
      const itemA = items.find((i) => i.id === rule.itemIdA);
      const itemB = items.find((i) => i.id === rule.itemIdB);
      return `${itemA ? escapeHtml(itemA.name) : 'Item A'} + ${itemB ? escapeHtml(itemB.name) : 'Item B'} → ${formatMoney(rule.discountAmount)} off per pair`;
    }
    return '';
  }

  function filteredItems() {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return items;
    return items.filter((i) => i.name.toLowerCase().includes(term) || i.category.toLowerCase().includes(term));
  }

  function attachStaffListeners() {
    const tabToggleEl = document.getElementById('staff-tab-toggle');
    tabToggleEl.querySelectorAll('.segmented-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        staffTab = btn.dataset.tab;
        renderBody();
      });
    });
    positionSegmentedThumb(tabToggleEl);

    if (staffTab === 'books') {
      const searchEl = document.getElementById('pl-search');
      searchEl.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        renderBody();
        document.getElementById('pl-search').focus();
        const v = document.getElementById('pl-search');
        v.selectionStart = v.selectionEnd = v.value.length;
      });
      document.getElementById('add-item-btn').addEventListener('click', () => openItemModal());
      document.querySelectorAll('.edit-item-btn').forEach((btn) =>
        btn.addEventListener('click', () => openItemModal(items.find((i) => i.id === btn.dataset.id)))
      );
      document.querySelectorAll('.delete-item-btn').forEach((btn) =>
        btn.addEventListener('click', () => confirmDeleteItem(btn.dataset.id))
      );
    } else {
      document.getElementById('add-rule-btn').addEventListener('click', () => openRuleModal());
      document.querySelectorAll('.edit-rule-btn').forEach((btn) =>
        btn.addEventListener('click', () => openRuleModal(rules.find((r) => r.id === btn.dataset.id)))
      );
      document.querySelectorAll('.delete-rule-btn').forEach((btn) =>
        btn.addEventListener('click', async () => {
          await deleteDiscountRule(eventId, btn.dataset.id);
          showToast('Rule removed');
        })
      );
    }
  }

  function openItemModal(item) {
    const isEdit = !!item;
    const categories = [...new Set(items.map((i) => i.category))];
    const sheet = openModal(`
      <h2>${isEdit ? 'Edit Book' : 'Add Book'}</h2>
      <form id="item-form" class="stack">
        <div class="field">
          <label class="label-sm" for="it-name">Name</label>
          <input id="it-name" type="text" required value="${escapeHtml(item?.name || '')}" />
        </div>
        <div class="field">
          <label class="label-sm" for="it-category-select">Category</label>
          ${categoryFieldHtml('it-category', categories, item?.category)}
        </div>
        <div class="row" style="gap:12px;">
          <div class="field" style="flex:1;">
            <label class="label-sm" for="it-cost">Cost price</label>
            <div class="input-prefix"><span>$</span><input id="it-cost" type="number" step="0.01" min="0" value="${item?.costPrice ?? ''}" /></div>
          </div>
          <div class="field" style="flex:1;">
            <label class="label-sm" for="it-sell">Selling price</label>
            <div class="input-prefix"><span>$</span><input id="it-sell" type="number" step="0.01" min="0" required value="${item?.sellingPrice ?? ''}" /></div>
          </div>
        </div>
        <div class="row" style="gap:12px;">
          <div class="field" style="flex:1;">
            <label class="label-sm" for="it-stock">Stock on hand</label>
            <input id="it-stock" type="number" step="1" min="0" value="${item?.stockOnHand ?? 0}" />
          </div>
          <div class="field" style="flex:1;">
            <label class="label-sm" for="it-lowstock">Low stock at</label>
            <input id="it-lowstock" type="number" step="1" min="0" value="${item?.lowStockThreshold ?? 3}" />
          </div>
        </div>
        <button class="btn btn-primary btn-block btn-lg" type="submit">${isEdit ? 'Save changes' : 'Add book'}</button>
      </form>
    `);
    wireCategoryField(sheet, 'it-category');
    sheet.querySelector('#item-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const category = getCategoryFieldValue(sheet, 'it-category');
      if (!category) {
        showToast('Enter a name for the new category', 'error');
        return;
      }
      const payload = {
        name: document.getElementById('it-name').value.trim(),
        category,
        costPrice: Number(document.getElementById('it-cost').value) || 0,
        sellingPrice: Number(document.getElementById('it-sell').value) || 0,
        stockOnHand: Number(document.getElementById('it-stock').value) || 0,
        lowStockThreshold: Number(document.getElementById('it-lowstock').value) || 0,
      };
      try {
        if (isEdit) await updateItem(eventId, item.id, payload);
        else await addItem(eventId, payload);
        closeModal();
        showToast(isEdit ? 'Book updated' : 'Book added', 'success');
      } catch (err) {
        showToast(err.message || 'Could not save book', 'error');
      }
    });
  }

  function confirmDeleteItem(itemId) {
    const item = items.find((i) => i.id === itemId);
    const sheet = openModal(`
      <h2>Delete "${escapeHtml(item?.name || '')}"?</h2>
      <p class="text-muted">This removes it from the price list and cashier. Past sales already logged are not affected.</p>
      <div class="row" style="gap:8px;">
        <button id="di-cancel" class="btn btn-outline" style="flex:1;">Cancel</button>
        <button id="di-confirm" class="btn btn-danger" style="flex:1;">Delete</button>
      </div>
    `);
    sheet.querySelector('#di-cancel').addEventListener('click', closeModal);
    sheet.querySelector('#di-confirm').addEventListener('click', async () => {
      await deleteItem(eventId, itemId);
      closeModal();
      showToast('Book deleted');
    });
  }

  function openRuleModal(rule) {
    const isEdit = !!rule;
    const categories = [...new Set(items.map((i) => i.category))];
    const type = rule?.type || 'categoryQtyDiscount';
    const sheet = openModal(`
      <h2>${isEdit ? 'Edit Discount Rule' : 'Add Discount Rule'}</h2>
      <form id="rule-form" class="stack">
        <div class="field">
          <label class="label-sm" for="rl-type">Rule type</label>
          <select id="rl-type">
            <option value="categoryQtyDiscount" ${type === 'categoryQtyDiscount' ? 'selected' : ''}>Category quantity discount (e.g. Busy Books: 2 for $10 off)</option>
            <option value="itemTierPrice" ${type === 'itemTierPrice' ? 'selected' : ''}>Item tiered price (e.g. Sticker: 3 for $9)</option>
            <option value="itemPairDiscount" ${type === 'itemPairDiscount' ? 'selected' : ''}>Bundle pair (e.g. Pelangi + Solehah's Dress Up)</option>
          </select>
        </div>
        <div class="field">
          <label class="label-sm" for="rl-label">Label</label>
          <input id="rl-label" type="text" required value="${escapeHtml(rule?.label || '')}" />
        </div>
        <div id="rl-fields"></div>
        <button class="btn btn-primary btn-block btn-lg" type="submit">${isEdit ? 'Save changes' : 'Add rule'}</button>
      </form>
    `);

    const fieldsEl = sheet.querySelector('#rl-fields');
    function renderFields() {
      const t = sheet.querySelector('#rl-type').value;
      if (t === 'categoryQtyDiscount') {
        fieldsEl.innerHTML = `
          <div class="field">
            <label class="label-sm" for="rl-category-select">Category</label>
            ${categoryFieldHtml('rl-category', categories, rule?.category)}
          </div>
          <div class="row" style="gap:12px;">
            <div class="field" style="flex:1;">
              <label class="label-sm" for="rl-minqty">Minimum qty</label>
              <input id="rl-minqty" type="number" min="2" step="1" required value="${rule?.minQty || 2}" />
            </div>
            <div class="field" style="flex:1;">
              <label class="label-sm" for="rl-discount">Discount ($)</label>
              <div class="input-prefix"><span>$</span><input id="rl-discount" type="number" min="0.01" step="0.01" required value="${rule?.discountAmount || ''}" /></div>
            </div>
          </div>`;
        wireCategoryField(sheet, 'rl-category');
      } else if (t === 'itemTierPrice') {
        fieldsEl.innerHTML = `
          <div class="field">
            <label class="label-sm" for="rl-item">Item</label>
            <select id="rl-item" required>
              ${items.map((i) => `<option value="${i.id}" ${rule?.itemId === i.id ? 'selected' : ''}>${escapeHtml(i.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label class="label-sm">Tiers (qty for price), one per line</label>
            <textarea id="rl-tiers" placeholder="1 for 3.50&#10;3 for 9.00">${(rule?.tiers || []).map((t) => `${t.qty} for ${t.price}`).join('\n')}</textarea>
          </div>`;
      } else {
        fieldsEl.innerHTML = `
          <div class="field">
            <label class="label-sm" for="rl-item-a">First item (the one that triggers the bundle)</label>
            <select id="rl-item-a" required>
              ${items.map((i) => `<option value="${i.id}" ${rule?.itemIdA === i.id ? 'selected' : ''}>${escapeHtml(i.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="label-sm" for="rl-item-b">Paired with</label>
            <select id="rl-item-b" required>
              ${items.map((i) => `<option value="${i.id}" ${rule?.itemIdB === i.id ? 'selected' : ''}>${escapeHtml(i.name)}</option>`).join('')}
            </select>
          </div>
          <div class="field" style="margin-bottom:0;">
            <label class="label-sm" for="rl-pair-discount">Discount per pair ($)</label>
            <div class="input-prefix"><span>$</span><input id="rl-pair-discount" type="number" min="0.01" step="0.01" required value="${rule?.discountAmount || ''}" /></div>
          </div>`;
      }
    }
    sheet.querySelector('#rl-type').addEventListener('change', renderFields);
    renderFields();

    sheet.querySelector('#rule-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = sheet.querySelector('#rl-type').value;
      const label = document.getElementById('rl-label').value.trim();
      let payload = { type: t, label };
      if (t === 'categoryQtyDiscount') {
        const category = getCategoryFieldValue(sheet, 'rl-category');
        if (!category) {
          showToast('Enter a name for the new category', 'error');
          return;
        }
        payload.category = category;
        payload.minQty = Number(document.getElementById('rl-minqty').value) || 2;
        payload.discountAmount = Number(document.getElementById('rl-discount').value) || 0;
      } else if (t === 'itemTierPrice') {
        payload.itemId = document.getElementById('rl-item').value;
        const tiersText = document.getElementById('rl-tiers').value;
        payload.tiers = tiersText
          .split('\n')
          .map((line) => {
            const m = line.match(/(\d+(?:\.\d+)?)\s*for\s*\$?(\d+(?:\.\d+)?)/i);
            return m ? { qty: Number(m[1]), price: Number(m[2]) } : null;
          })
          .filter(Boolean);
      } else {
        payload.itemIdA = document.getElementById('rl-item-a').value;
        payload.itemIdB = document.getElementById('rl-item-b').value;
        payload.discountAmount = Number(document.getElementById('rl-pair-discount').value) || 0;
      }
      try {
        if (isEdit) await updateDiscountRule(eventId, rule.id, payload);
        else await addDiscountRule(eventId, payload);
        closeModal();
        showToast(isEdit ? 'Rule updated' : 'Rule added', 'success');
      } catch (err) {
        showToast(err.message || 'Could not save rule', 'error');
      }
    });
  }

  /* ---------------- Customer view ---------------- */

  function customerTemplate() {
    const term = searchTerm.trim().toLowerCase();
    const filtered = items.filter((i) => !term || i.name.toLowerCase().includes(term));
    const byCategory = {};
    filtered.forEach((i) => {
      byCategory[i.category] = byCategory[i.category] || [];
      byCategory[i.category].push(i);
    });
    return `
      <input id="pl-customer-search" type="text" placeholder="Search for a book…" style="margin:12px 0;font-size:18px;" value="${escapeHtml(searchTerm)}" />
      ${Object.keys(byCategory)
        .sort()
        .map(
          (cat) => `
        <h3 style="margin-top:20px;">${escapeHtml(cat)}</h3>
        <div class="stack" style="gap:8px;">
          ${byCategory[cat]
            .map(
              (item) => `
            <div class="card row-between">
              <span style="font-size:18px;font-weight:600;">${escapeHtml(item.name)}</span>
              <span class="price" style="font-size:24px;">${formatMoney(item.sellingPrice)}</span>
            </div>`
            )
            .join('')}
        </div>`
        )
        .join('') || `<div class="empty-state card">No books to show.</div>`}
    `;
  }

  function attachCustomerListeners() {
    const el = document.getElementById('pl-customer-search');
    el.addEventListener('input', (e) => {
      searchTerm = e.target.value;
      renderBody();
      const v = document.getElementById('pl-customer-search');
      v.focus();
      v.selectionStart = v.selectionEnd = v.value.length;
    });
  }

  renderBody();

  return () => {
    unsubItems();
    unsubRules();
  };
}
