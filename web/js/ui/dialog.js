// Dialogs in the site's own style, used instead of window.confirm() and window.prompt().
//
// * a native <dialog> opened with showModal() where the browser has it: focus stays
//   inside, the page behind is inert, and Escape cancels;
// * focus starts on the safe choice (cancel) or the text field, and returns to where it
//   was when the dialog is cancelled;
// * the buttons say what they do ("Forkast og start", "Gå til spørsmålet"), not "OK";
// * the action runs inside the click or submit, so the caller's flow stays synchronous;
//   cancelling (button, Escape, a click outside the box) does nothing.

import { h, toDOM } from '../render/vnode.js';

let current = null;

/**
 * Show a dialog built from `box` (the content inside the frame). Returns
 * {dialog, close(restoreFocus = true)}. Focus goes back to `returnTo`, by default the
 * element that had it (a clicked button does not get focus in every browser).
 */
function open(box, labelledBy, describedBy, focusSel, doc, returnTo = doc.activeElement) {
  if (current) current.close();
  // the content sits in an inner box, so a click on the dialog element itself is a
  // click on the backdrop
  const dialog = toDOM(h('dialog', { class: 'confirm-dialog', 'aria-labelledby': labelledBy, 'aria-describedby': describedBy }, box), doc);

  let done = false;
  function close(restoreFocus = true) {
    if (done) return;
    done = true;
    current = null;
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    dialog.remove();
    doc.removeEventListener('keydown', onKey, true);
    if (restoreFocus && returnTo && returnTo.isConnected && typeof returnTo.focus === 'function') returnTo.focus();
  }
  // without showModal (old browsers, tests) Escape is handled here
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  }

  dialog.addEventListener('click', (e) => {
    const btn = e.target instanceof doc.defaultView.Element ? e.target.closest('[data-dialog=cancel]') : null;
    if (btn || e.target === dialog) close(); // the cancel button, or a click on the backdrop
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); }); // Escape with showModal

  doc.body.appendChild(dialog);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else {
    dialog.setAttribute('open', '');
    dialog.classList.add('is-fallback');
    doc.addEventListener('keydown', onKey, true);
  }
  dialog.querySelector(focusSel).focus();
  current = { close };
  return { dialog, close };
}

function actions(cancel, confirm, type = 'button') {
  return h('div', { class: 'confirm-actions' },
    h('button', { type: 'button', class: 'btn btn-secondary', 'data-dialog': 'cancel' }, cancel || 'Avbryt'),
    h('button', { type, class: 'btn btn-primary', 'data-dialog': 'confirm' }, confirm));
}

/**
 * Ask before doing something that cannot be undone.
 * opts: {title, message, confirm (label of the action button), cancel = 'Avbryt'}.
 */
export function askConfirm(opts, onConfirm, doc = globalThis.document) {
  const { dialog, close } = open(
    h('div', { class: 'confirm-box' },
      h('h2', { id: 'confirm-title', class: 'confirm-title' }, opts.title),
      h('p', { id: 'confirm-message', class: 'confirm-message' }, opts.message),
      actions(opts.cancel, opts.confirm)),
    'confirm-title', 'confirm-message', '[data-dialog=cancel]', doc);
  dialog.querySelector('[data-dialog=confirm]').addEventListener('click', () => {
    close();
    onConfirm();
  });
  return { close };
}

/**
 * Ask for a short text.
 * opts: {title, message, label, submit (label of the action button), cancel = 'Avbryt',
 * inputmode, placeholder, prefix (fixed text shown in front of the field),
 * normalize(value) -> the value to keep in the field (applied while typing),
 * returnTo (where focus goes back on cancel),
 * validate(value) -> error message, or '' when the value is fine}.
 * An error is shown under the field and the dialog stays open; otherwise it closes and
 * onSubmit(value) runs (focus is then left to onSubmit).
 */
export function askText(opts, onSubmit, doc = globalThis.document) {
  const { dialog, close } = open(
    h('form', { class: 'confirm-box', novalidate: true },
      h('h2', { id: 'prompt-title', class: 'confirm-title' }, opts.title),
      opts.message ? h('p', { id: 'prompt-message', class: 'confirm-message' }, opts.message) : null,
      h('div', { class: 'prompt-field' },
        h('label', { for: 'prompt-input', id: 'prompt-label' }, opts.label),
        h('div', { class: 'prompt-input' },
          // the prefix is part of the label for screen readers ("Spørsmålsnummer, q-")
          opts.prefix ? h('span', { class: 'prompt-prefix', id: 'prompt-prefix' }, opts.prefix) : null,
          h('input', {
            type: 'text', id: 'prompt-input', name: 'value', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false',
            inputmode: opts.inputmode || 'text', placeholder: opts.placeholder || null, 'aria-describedby': 'prompt-error',
            'aria-labelledby': opts.prefix ? 'prompt-label prompt-prefix' : null,
          })),
        h('p', { id: 'prompt-error', class: 'error prompt-error', role: 'alert' })),
      actions(opts.cancel, opts.submit, 'submit')),
    'prompt-title', opts.message ? 'prompt-message' : null, '#prompt-input', doc, opts.returnTo);
  const input = dialog.querySelector('#prompt-input');
  const error = dialog.querySelector('#prompt-error');
  dialog.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const value = (opts.normalize ? opts.normalize(input.value) : input.value).trim();
    const problem = opts.validate ? opts.validate(value) : '';
    if (problem) {
      error.textContent = problem;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    close(false);
    onSubmit(value);
  });
  input.addEventListener('input', () => {
    if (opts.normalize) {
      const v = opts.normalize(input.value);
      if (v !== input.value) input.value = v;
    }
    if (!error.textContent) return;
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  });
  return { close };
}
