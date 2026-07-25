export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Sizes/positions a .segmented-thumb to exactly match its .active .segmented-btn,
// rather than assuming an even split — segments can be different widths (e.g. "Books"
// vs "Discount Rules (5)") without the thumb over- or under-shooting either label.
export function positionSegmentedThumb(segmentedEl) {
  const activeBtn = segmentedEl.querySelector('.segmented-btn.active');
  const thumb = segmentedEl.querySelector('.segmented-thumb');
  if (!activeBtn || !thumb) return;
  const containerRect = segmentedEl.getBoundingClientRect();
  const btnRect = activeBtn.getBoundingClientRect();
  thumb.style.width = `${btnRect.width}px`;
  thumb.style.left = `${btnRect.left - containerRect.left}px`;
}
