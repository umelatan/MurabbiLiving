let backdropEl = null;

export function openModal(innerHtml, { onMount, onClose } = {}) {
  closeModal();
  backdropEl = document.createElement('div');
  backdropEl.className = 'modal-backdrop';
  backdropEl.innerHTML = `<div class="modal-sheet">${innerHtml}</div>`;
  backdropEl.addEventListener('click', (e) => {
    if (e.target === backdropEl) closeModal();
  });
  document.body.appendChild(backdropEl);
  const sheet = backdropEl.querySelector('.modal-sheet');
  if (onMount) onMount(sheet);
  backdropEl._onClose = onClose;
  return sheet;
}

export function closeModal() {
  if (!backdropEl) return;
  if (backdropEl._onClose) backdropEl._onClose();
  backdropEl.remove();
  backdropEl = null;
}
