import { loadBank } from './content/bank.js';
import { createApp } from './ui/app.js';
import { h, toDOM } from './render/vnode.js';

async function boot() {
  const root = document.getElementById('app');
  const res = await loadBank();
  if (!res.ok) {
    root.replaceChildren(toDOM(h('div', { class: 'notice notice-error', role: 'alert' },
      h('h2', {}, 'Noe gikk galt'), h('p', {}, res.error))));
    return;
  }
  if (res.dropped.length) console.warn('Questions left out because they failed validation:', res.dropped);
  if (res.bank.mode === 'preview') {
    document.getElementById('preview-banner').hidden = false;
  }
  createApp(root, res.bank);
}

boot();
