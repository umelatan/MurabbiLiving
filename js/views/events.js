import {
  subscribeEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  cloneEventCatalog,
  importSeedPriceList,
} from '../lib/store.js';
import { getActiveEventId, setActiveEventId } from '../lib/eventState.js';
import { getCurrentUser } from '../auth.js';
import { showToast } from '../lib/toast.js';
import { openModal, closeModal } from '../lib/modal.js';
import { navigate } from '../router.js';
import { formatMoney } from '../lib/discounts.js';
import { escapeHtml } from '../lib/utils.js';

export function render(container) {
  container.innerHTML = `
    <div class="content-max stack">
      <div class="row-between">
        <div>
          <h1>Book Fair Events</h1>
          <p class="text-muted" style="margin:0;">Each fair keeps its own price list, sales log and profit.</p>
        </div>
        <button id="new-event-btn" class="btn btn-primary">+ New Event</button>
      </div>
      <div id="events-list" class="stack"></div>
    </div>`;

  document.getElementById('new-event-btn').addEventListener('click', () => openNewEventModal(events));

  let events = [];
  const unsub = subscribeEvents((list) => {
    events = list;
    renderList(list);
  });

  function renderList(list) {
    const listEl = document.getElementById('events-list');
    if (!list.length) {
      listEl.innerHTML = `<div class="empty-state card">No events yet. Create your first book fair to get started.</div>`;
      return;
    }
    const activeId = getActiveEventId();
    listEl.innerHTML = list
      .map((ev) => {
        const isSelected = ev.id === activeId;
        const dateStr = ev.date ? new Date(ev.date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
        return `
        <div class="card row-between" data-id="${ev.id}">
          <div>
            <div class="row" style="gap:8px;">
              <h3 style="margin:0;">${escapeHtml(ev.name)}</h3>
              ${ev.status === 'closed' ? '<span class="chip">Closed</span>' : '<span class="chip chip-success">Active</span>'}
              ${isSelected ? '<span class="chip chip-gold">Current</span>' : ''}
            </div>
            <p class="text-muted" style="margin:4px 0 0;">${dateStr} · ${ev.transactionCount || 0} sales · ${formatMoney(ev.revenueTotal || 0)} revenue</p>
          </div>
          <div class="row">
            <button class="btn btn-outline btn-sm toggle-status-btn" data-id="${ev.id}" data-status="${ev.status}">${ev.status === 'closed' ? 'Reopen' : 'Close'}</button>
            <button class="btn btn-primary btn-sm select-btn" data-id="${ev.id}">${isSelected ? 'Open' : 'Select'}</button>
            <button class="btn btn-ghost btn-icon btn-sm delete-event-btn" data-id="${ev.id}" aria-label="Delete event">🗑</button>
          </div>
        </div>`;
      })
      .join('');

    listEl.querySelectorAll('.select-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        setActiveEventId(btn.dataset.id);
        navigate('cashier');
      });
    });
    listEl.querySelectorAll('.toggle-status-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const newStatus = btn.dataset.status === 'closed' ? 'active' : 'closed';
        await updateEvent(btn.dataset.id, { status: newStatus });
      });
    });
    listEl.querySelectorAll('.delete-event-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ev = list.find((e) => e.id === btn.dataset.id);
        if (ev) openDeleteEventModal(ev);
      });
    });
  }

  return () => unsub();
}

function openNewEventModal(existingEvents) {
  const hasEvents = existingEvents.length > 0;
  const sheet = openModal(`
    <h2>New Book Fair</h2>
    <form id="new-event-form" class="stack">
      <div class="field">
        <label class="label-sm" for="ne-name">Event name</label>
        <input id="ne-name" type="text" placeholder="e.g. Ramadan Bazaar 2026" required />
      </div>
      <div class="field">
        <label class="label-sm" for="ne-date">Date</label>
        <input id="ne-date" type="date" required />
      </div>
      <div class="field" style="margin-bottom:0;">
        <label class="label-sm">Starting price list</label>
        <div class="stack" style="gap:8px;">
          ${
            hasEvents
              ? `<label class="row"><input type="radio" name="source" value="clone" checked/> Duplicate from
                  <select id="ne-clone-from" style="width:auto;">
                    ${existingEvents.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('')}
                  </select>
                </label>
                <label class="row"><input type="radio" name="source" value="blank"/> Start blank</label>`
              : `<label class="row"><input type="radio" name="source" value="seed" checked/> Import the Murabbi Living starter catalog</label>
                <label class="row"><input type="radio" name="source" value="blank"/> Start blank</label>`
          }
        </div>
      </div>
      <button class="btn btn-primary btn-block btn-lg" type="submit">Create event</button>
    </form>
  `);

  document.getElementById('ne-date').valueAsDate = new Date();

  sheet.querySelector('#new-event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';
    try {
      const name = document.getElementById('ne-name').value.trim();
      const date = document.getElementById('ne-date').value;
      const source = sheet.querySelector('input[name="source"]:checked').value;

      const eventId = await createEvent({ name, date }, getCurrentUser()?.uid || null);

      if (source === 'seed') {
        const seed = await fetch('data/seed-price-list.json').then((r) => r.json());
        await importSeedPriceList(eventId, seed);
      } else if (source === 'clone') {
        const fromId = document.getElementById('ne-clone-from').value;
        await cloneEventCatalog(fromId, eventId);
      }

      setActiveEventId(eventId);
      closeModal();
      showToast('Event created', 'success');
      navigate('price-list');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Could not create event', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create event';
    }
  });
}

function openDeleteEventModal(ev) {
  const sheet = openModal(`
    <h2>Delete "${escapeHtml(ev.name)}"?</h2>
    <p class="text-muted">This permanently deletes the price list, sales log (${ev.transactionCount || 0} sales), expenses and profit numbers for this event. This cannot be undone.</p>
    <div class="field">
      <label class="label-sm" for="de-confirm-input">Type the event name to confirm</label>
      <input id="de-confirm-input" type="text" autocomplete="off" placeholder="${escapeHtml(ev.name)}" />
    </div>
    <div class="row" style="gap:8px;">
      <button id="de-cancel-btn" class="btn btn-outline" style="flex:1;">Cancel</button>
      <button id="de-confirm-btn" class="btn btn-danger" style="flex:1;" disabled>Delete permanently</button>
    </div>
  `);

  const input = sheet.querySelector('#de-confirm-input');
  const confirmBtn = sheet.querySelector('#de-confirm-btn');
  input.addEventListener('input', () => {
    confirmBtn.disabled = input.value.trim() !== ev.name;
  });
  sheet.querySelector('#de-cancel-btn').addEventListener('click', closeModal);
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting…';
    try {
      await deleteEvent(ev.id);
      if (getActiveEventId() === ev.id) setActiveEventId(null);
      closeModal();
      showToast('Event deleted');
    } catch (err) {
      showToast(err.message || 'Could not delete event', 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Delete permanently';
    }
  });
}
