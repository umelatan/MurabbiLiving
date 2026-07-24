// Pure cart/discount math for the cashier. No DOM, no Firestore — easy to reason about and test.

export function addLineItem(cart, item, qty = 1) {
  const existing = cart.find((l) => l.itemId === item.id);
  if (existing) {
    return cart.map((l) =>
      l.itemId === item.id ? { ...l, qty: l.qty + qty } : l
    );
  }
  return [
    ...cart,
    {
      itemId: item.id,
      name: item.name,
      category: item.category,
      unitPrice: item.sellingPrice,
      qty,
    },
  ];
}

export function updateLineQty(cart, itemId, qty) {
  if (qty <= 0) return removeLineItem(cart, itemId);
  return cart.map((l) => (l.itemId === itemId ? { ...l, qty } : l));
}

export function removeLineItem(cart, itemId) {
  return cart.filter((l) => l.itemId !== itemId);
}

export function cartSubtotal(cart) {
  return round2(cart.reduce((sum, l) => sum + l.unitPrice * l.qty, 0));
}

export function cartItemCount(cart) {
  return cart.reduce((sum, l) => sum + l.qty, 0);
}

// A "category quantity" rule (e.g. Busy Books: 2 for $10 off) applies once per
// complete group of minQty items in that category — buying 4 gives two discounts.
function categoryQtyDiscount(cart, rule) {
  const qtyInCategory = cart
    .filter((l) => l.category === rule.category)
    .reduce((sum, l) => sum + l.qty, 0);
  const groups = Math.floor(qtyInCategory / rule.minQty);
  if (groups <= 0) return null;
  return {
    ruleId: rule.id,
    label: rule.label,
    amount: round2(groups * rule.discountAmount),
    auto: true,
  };
}

// An "item tier price" rule (e.g. Sticker: 1 for $3.50, 3 for $9.00) re-prices that
// item's line using the best combination of tiers, largest tier first (greedy).
function itemTierDiscount(cart, rule) {
  const line = cart.find((l) => l.itemId === rule.itemId);
  if (!line || line.qty <= 0) return null;

  const tiers = [...rule.tiers].sort((a, b) => b.qty - a.qty);
  let remaining = line.qty;
  let tieredTotal = 0;
  for (const tier of tiers) {
    if (tier.qty <= 1) continue;
    const count = Math.floor(remaining / tier.qty);
    tieredTotal += count * tier.price;
    remaining -= count * tier.qty;
  }
  const singleTier = tiers.find((t) => t.qty === 1);
  const unitPrice = singleTier ? singleTier.price : line.unitPrice;
  tieredTotal += remaining * unitPrice;

  const rawTotal = line.unitPrice * line.qty;
  const amount = round2(rawTotal - tieredTotal);
  if (amount <= 0) return null;
  return { ruleId: rule.id, label: rule.label, amount, auto: true };
}

// A "pair" rule (e.g. Pelangi + Solehah's Dress Up = bundle) applies once per matched
// pair — if she buys 2 Pelangi and 2 Solehah, that's two bundles.
function itemPairDiscount(cart, rule) {
  const lineA = cart.find((l) => l.itemId === rule.itemIdA);
  const lineB = cart.find((l) => l.itemId === rule.itemIdB);
  if (!lineA || !lineB) return null;
  const pairs = Math.min(lineA.qty, lineB.qty);
  if (pairs <= 0) return null;
  return {
    ruleId: rule.id,
    label: rule.label,
    amount: round2(pairs * rule.discountAmount),
    auto: true,
  };
}

export function computeAutoDiscounts(cart, discountRules, removedRuleIds = []) {
  const results = [];
  for (const rule of discountRules) {
    if (removedRuleIds.includes(rule.id)) continue;
    let discount = null;
    if (rule.type === 'categoryQtyDiscount') discount = categoryQtyDiscount(cart, rule);
    if (rule.type === 'itemTierPrice') discount = itemTierDiscount(cart, rule);
    if (rule.type === 'itemPairDiscount') discount = itemPairDiscount(cart, rule);
    if (discount) results.push(discount);
  }
  return results;
}

/**
 * @param {Array} cart - line items
 * @param {Array} discountRules - event's discount rules
 * @param {Object} opts
 * @param {string[]} opts.removedRuleIds - auto discounts she's cancelled with the x button
 * @param {Array<{label:string, amount:number}>} opts.manualDiscounts - manual overrides she added
 */
export function computeCartTotals(cart, discountRules, opts = {}) {
  const { removedRuleIds = [], manualDiscounts = [] } = opts;
  const subtotal = cartSubtotal(cart);
  const autoDiscounts = computeAutoDiscounts(cart, discountRules, removedRuleIds);
  const allDiscounts = [
    ...autoDiscounts,
    ...manualDiscounts.map((d) => ({ ...d, auto: false })),
  ];
  const totalDiscount = round2(allDiscounts.reduce((sum, d) => sum + d.amount, 0));
  const grandTotal = Math.max(0, round2(subtotal - totalDiscount));
  return { subtotal, autoDiscounts, manualDiscounts, allDiscounts, totalDiscount, grandTotal };
}

export function computeChangeDue(grandTotal, amountPaid) {
  return round2((amountPaid || 0) - grandTotal);
}

export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(n) {
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
