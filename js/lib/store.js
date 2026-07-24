// Firestore data-access layer. Every event's price list, discount rules, sales log,
// expenses and running aggregates live under events/{eventId}/...
import { db } from '../firebase-config.js';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  writeBatch,
  serverTimestamp,
  increment,
  getDocs,
  getDoc,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

function toObj(snap) {
  return { id: snap.id, ...snap.data() };
}

/* ---------------- Events ---------------- */

export function subscribeEvents(cb) {
  const q = query(collection(db, 'events'), orderBy('date', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map(toObj)));
}

export async function getEvent(eventId) {
  const snap = await getDoc(doc(db, 'events', eventId));
  return snap.exists() ? toObj(snap) : null;
}

export function subscribeEvent(eventId, cb) {
  return onSnapshot(doc(db, 'events', eventId), (snap) => cb(snap.exists() ? toObj(snap) : null));
}

export async function createEvent({ name, date }, createdBy) {
  const ref = await addDoc(collection(db, 'events'), {
    name,
    date,
    status: 'active',
    createdBy,
    createdAt: serverTimestamp(),
    revenueTotal: 0,
    cogsTotal: 0,
    discountTotal: 0,
    transactionCount: 0,
  });
  return ref.id;
}

export async function updateEvent(eventId, patch) {
  await updateDoc(doc(db, 'events', eventId), patch);
}

// Firestore doesn't cascade-delete subcollections, so every subcollection under the
// event has to be cleared out explicitly before (or after) removing the event doc.
export async function deleteEvent(eventId) {
  const subcollections = ['items', 'discountRules', 'sales', 'expenses', 'aggregatePerItem'];
  const allRefs = [];
  for (const name of subcollections) {
    const snap = await getDocs(collection(db, 'events', eventId, name));
    snap.docs.forEach((d) => allRefs.push(d.ref));
  }
  allRefs.push(doc(db, 'events', eventId));

  const CHUNK_SIZE = 450;
  for (let i = 0; i < allRefs.length; i += CHUNK_SIZE) {
    const batch = writeBatch(db);
    allRefs.slice(i, i + CHUNK_SIZE).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

/* ---------------- Price list items ---------------- */

export function subscribeItems(eventId, cb) {
  return onSnapshot(collection(db, 'events', eventId, 'items'), (snap) => {
    const items = snap.docs.map(toObj);
    items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    cb(items);
  });
}

export async function addItem(eventId, item) {
  const ref = await addDoc(collection(db, 'events', eventId, 'items'), {
    name: item.name,
    category: item.category || 'Uncategorized',
    costPrice: Number(item.costPrice) || 0,
    sellingPrice: Number(item.sellingPrice) || 0,
    stockOnHand: Number(item.stockOnHand) || 0,
    lowStockThreshold: Number(item.lowStockThreshold) || 3,
    active: true,
  });
  return ref.id;
}

export async function updateItem(eventId, itemId, patch) {
  await updateDoc(doc(db, 'events', eventId, 'items', itemId), patch);
}

export async function deleteItem(eventId, itemId) {
  await deleteDoc(doc(db, 'events', eventId, 'items', itemId));
}

/* ---------------- Discount rules ---------------- */

export function subscribeDiscountRules(eventId, cb) {
  return onSnapshot(collection(db, 'events', eventId, 'discountRules'), (snap) =>
    cb(snap.docs.map(toObj))
  );
}

export async function addDiscountRule(eventId, rule) {
  const ref = await addDoc(collection(db, 'events', eventId, 'discountRules'), rule);
  return ref.id;
}

export async function updateDiscountRule(eventId, ruleId, patch) {
  await updateDoc(doc(db, 'events', eventId, 'discountRules', ruleId), patch);
}

export async function deleteDiscountRule(eventId, ruleId) {
  await deleteDoc(doc(db, 'events', eventId, 'discountRules', ruleId));
}

/* ---------------- Seeding & cloning a catalog into an event ---------------- */

export async function importSeedPriceList(eventId, seed) {
  const batch = writeBatch(db);
  const nameToRef = new Map();
  for (const item of seed.items) {
    const ref = doc(collection(db, 'events', eventId, 'items'));
    nameToRef.set(item.name, ref);
    batch.set(ref, {
      name: item.name,
      category: item.category || 'Uncategorized',
      costPrice: Number(item.costPrice) || 0,
      sellingPrice: Number(item.sellingPrice) || 0,
      stockOnHand: Number(item.stockOnHand) || 0,
      lowStockThreshold: Number(item.lowStockThreshold) || 3,
      active: true,
    });
  }
  for (const rule of seed.discountRules || []) {
    const ref = doc(collection(db, 'events', eventId, 'discountRules'));
    const payload = { type: rule.type, label: rule.label };
    if (rule.type === 'categoryQtyDiscount') {
      Object.assign(payload, { category: rule.category, minQty: rule.minQty, discountAmount: rule.discountAmount });
    } else if (rule.type === 'itemTierPrice') {
      const itemRef = nameToRef.get(rule.itemName);
      Object.assign(payload, { itemId: itemRef ? itemRef.id : null, tiers: rule.tiers });
    } else if (rule.type === 'itemPairDiscount') {
      const refA = nameToRef.get(rule.itemNameA);
      const refB = nameToRef.get(rule.itemNameB);
      Object.assign(payload, {
        itemIdA: refA ? refA.id : null,
        itemIdB: refB ? refB.id : null,
        discountAmount: rule.discountAmount,
      });
    }
    batch.set(ref, payload);
  }
  await batch.commit();
}

export async function cloneEventCatalog(fromEventId, toEventId) {
  const [itemsSnap, rulesSnap] = await Promise.all([
    getDocs(collection(db, 'events', fromEventId, 'items')),
    getDocs(collection(db, 'events', fromEventId, 'discountRules')),
  ]);
  const batch = writeBatch(db);
  const oldIdToNewRef = new Map();
  itemsSnap.docs.forEach((snap) => {
    const data = snap.data();
    const ref = doc(collection(db, 'events', toEventId, 'items'));
    oldIdToNewRef.set(snap.id, ref);
    batch.set(ref, { ...data, stockOnHand: 0 });
  });
  rulesSnap.docs.forEach((snap) => {
    const data = snap.data();
    const ref = doc(collection(db, 'events', toEventId, 'discountRules'));
    const payload = { ...data };
    if (data.type === 'itemTierPrice' && data.itemId && oldIdToNewRef.has(data.itemId)) {
      payload.itemId = oldIdToNewRef.get(data.itemId).id;
    }
    if (data.type === 'itemPairDiscount') {
      payload.itemIdA = oldIdToNewRef.get(data.itemIdA)?.id || null;
      payload.itemIdB = oldIdToNewRef.get(data.itemIdB)?.id || null;
    }
    batch.set(ref, payload);
  });
  await batch.commit();
}

/* ---------------- Sales ---------------- */

export function subscribeSales(eventId, cb) {
  const q = query(collection(db, 'events', eventId, 'sales'), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snap) => cb(snap.docs.map(toObj)));
}

export async function commitSale(eventId, sale, createdBy) {
  const saleRef = doc(collection(db, 'events', eventId, 'sales'));
  await runTransaction(db, async (tx) => {
    const itemRefs = sale.lineItems.map((l) => doc(db, 'events', eventId, 'items', l.itemId));
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));

    let cogs = 0;
    itemSnaps.forEach((snap, i) => {
      const line = sale.lineItems[i];
      const costPrice = snap.exists() ? Number(snap.data().costPrice) || 0 : 0;
      cogs += costPrice * line.qty;
    });

    tx.set(saleRef, {
      ...sale,
      createdBy,
      timestamp: serverTimestamp(),
      voided: false,
    });

    itemSnaps.forEach((snap, i) => {
      if (!snap.exists()) return;
      const line = sale.lineItems[i];
      tx.update(itemRefs[i], { stockOnHand: increment(-line.qty) });
    });

    const eventRef = doc(db, 'events', eventId);
    tx.update(eventRef, {
      revenueTotal: increment(sale.grandTotal),
      cogsTotal: increment(round2(cogs)),
      discountTotal: increment(sale.totalDiscount),
      transactionCount: increment(1),
    });

    sale.lineItems.forEach((line) => {
      const perItemRef = doc(db, 'events', eventId, 'aggregatePerItem', line.itemId);
      tx.set(
        perItemRef,
        {
          name: line.name,
          qtySold: increment(line.qty),
          revenue: increment(round2(line.unitPrice * line.qty)),
        },
        { merge: true }
      );
    });
  });
  return saleRef.id;
}

export async function voidSale(eventId, saleId) {
  const saleRef = doc(db, 'events', eventId, 'sales', saleId);
  await runTransaction(db, async (tx) => {
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists() || saleSnap.data().voided) return;
    const sale = saleSnap.data();

    const itemRefs = sale.lineItems.map((l) => doc(db, 'events', eventId, 'items', l.itemId));
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)));

    let cogs = 0;
    itemSnaps.forEach((snap, i) => {
      const line = sale.lineItems[i];
      const costPrice = snap.exists() ? Number(snap.data().costPrice) || 0 : 0;
      cogs += costPrice * line.qty;
    });

    tx.update(saleRef, { voided: true, voidedAt: serverTimestamp() });

    itemSnaps.forEach((snap, i) => {
      if (!snap.exists()) return;
      const line = sale.lineItems[i];
      tx.update(itemRefs[i], { stockOnHand: increment(line.qty) });
    });

    const eventRef = doc(db, 'events', eventId);
    tx.update(eventRef, {
      revenueTotal: increment(-sale.grandTotal),
      cogsTotal: increment(-round2(cogs)),
      discountTotal: increment(-sale.totalDiscount),
      transactionCount: increment(-1),
    });

    sale.lineItems.forEach((line) => {
      const perItemRef = doc(db, 'events', eventId, 'aggregatePerItem', line.itemId);
      tx.set(
        perItemRef,
        { qtySold: increment(-line.qty), revenue: increment(-round2(line.unitPrice * line.qty)) },
        { merge: true }
      );
    });
  });
}

export function subscribePerItemAggregates(eventId, cb) {
  return onSnapshot(collection(db, 'events', eventId, 'aggregatePerItem'), (snap) =>
    cb(snap.docs.map(toObj))
  );
}

/* ---------------- Expenses ---------------- */

export function subscribeExpenses(eventId, cb) {
  return onSnapshot(collection(db, 'events', eventId, 'expenses'), (snap) => cb(snap.docs.map(toObj)));
}

export async function addExpense(eventId, expense) {
  await addDoc(collection(db, 'events', eventId, 'expenses'), {
    label: expense.label,
    amount: Number(expense.amount) || 0,
    category: expense.category || 'misc',
  });
}

export async function deleteExpense(eventId, expenseId) {
  await deleteDoc(doc(db, 'events', eventId, 'expenses', expenseId));
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
