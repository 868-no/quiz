// A confirmation dialog in the site's own style, used instead of window.confirm().
//
// * a native <dialog> opened with showModal() where the browser has it: focus stays
//   inside, the page behind is inert, and Escape cancels;
// * the safe choice (cancel) has focus when it opens, and focus returns to where it was;
// * the buttons say what they do ("Forkast og start"), not "OK";
// * onConfirm runs inside the click on the confirm button, so the caller's flow stays
//   synchronous; cancelling (button, Escape, a click outside the box) does nothing.

import { h, toDOM } from '../render/vnode.js';

let current = null;

/**
 * Ask before doing something that cannot be undone.
 * opts: {title, message, confirm (label of the action button), cancel = 'Avbryt'}.
 */
export function askConfirm(opts, onConfirm, doc = globalThis.document) {
  if (current) current.close();
  const returnTo = doc.activeElement;
  // the content sits in an inner box, so a click on the dialog element itself is a
  // click on the backdrop
  const dialog = toDOM(h('dialog', { class: 'confirm-dialog', 'aria-labelledby': 'confirm-title', 'aria-describedby': 'confirm-message' },
    h('div', { class: 'confirm-box' },
      h('h2', { id: 'confirm-title', class: 'confirm-title' }, opts.title),
      h('p', { id: 'confirm-message', class: 'confirm-message' }, opts.message),
      h('div', { class: 'confirm-actions' },
        h('button', { type: 'button', class: 'btn btn-secondary', 'data-dialog': 'cancel' }, opts.cancel || 'Avbryt'),
        h('button', { type: 'button', class: 'btn btn-primary', 'data-dialog': 'confirm' }, opts.confirm)))), doc);

  let done = false;
  function close() {
    if (done) return;
    done = true;
    current = null;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    dialog.remove();
    doc.removeEventListener('keydown', onKey, true);
    if (returnTo && returnTo.isConnected && typeof returnTo.focus === 'function') returnTo.focus();
  }
  // without showModal (old browsers, tests) Escape is handled here
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  dialog.addEventListener('click', (e) => {
    const btn = e.target instanceof doc.defaultView.Element ? e.target.closest('[data-dialog]') : null;
    if (btn) {
      const yes = btn.dataset.dialog === 'confirm';
      close();
      if (yes) onConfirm();
    } else if (e.target === dialog) {
      close(); // a click on the backdrop, outside the box
    }
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Escape with showModal

  doc.body.appendChild(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else {
    dialog.setAttribute('open', '');
    dialog.classList.add('is-fallback');
    doc.addEventListener('keydown', onKey, true);
  }
  dialog.querySelector('[data-dialog=cancel]').focus();
  current = { close };
  return current;
}
