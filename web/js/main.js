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
  const site = res.bank.site || {};
  if (site.issues_url) {
    const p = document.getElementById('footer-report');
    p.replaceChildren(toDOM(h('span', {},
      'Siden er et dugnadsprosjekt fra Meshtastic Users Norway, og alle kan hjelpe til med å lese korrektur på spørsmålene. Har du funnet en feil eller har et forslag, ',
      h('a', { href: site.issues_url, target: '_blank', rel: 'noopener noreferrer' }, 'meld fra på GitHub'),
      ' (det krever en gratis konto).')));
    p.hidden = false;
  }
  createApp(root, res.bank);
}

// Offline copy (sw.js). When a newer version of the site takes over while this
// page is open, offer a reload; the page keeps working with what it has loaded.
function registerOffline() {
  const sw = globalThis.navigator && navigator.serviceWorker;
  if (!sw) return;
  const hadController = Boolean(sw.controller);
  sw.addEventListener('controllerchange', () => {
    if (!hadController) return;
    const banner = document.getElementById('update-banner');
    banner.replaceChildren(toDOM(h('div', { class: 'notice notice-update' },
      h('p', {}, 'En ny versjon av siden er lastet ned. ',
        h('button', { type: 'button', class: 'btn-small', 'data-action': 'reload' }, 'Last inn på nytt')))));
    banner.hidden = false;
  });
  document.getElementById('update-banner').addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('[data-action=reload]')) location.reload();
  });
  sw.register('sw.js').catch(() => { /* offline copy is optional */ });
}

registerOffline();

boot();
