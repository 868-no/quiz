// UI integration tests in a simulated DOM (jsdom). jsdom is an optional dev
// dependency: `npm install` in the repository, or set RADIOQUIZ_JSDOM to a
// directory containing node_modules/jsdom. Without it these tests are skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { makeBank, question } from './fixtures.mjs';

let JSDOM = null;
try {
  const base = process.env.RADIOQUIZ_JSDOM ? join(process.env.RADIOQUIZ_JSDOM, 'x.js') : import.meta.url;
  ({ JSDOM } = createRequire(base)('jsdom'));
} catch {
  JSDOM = null;
}
if (!JSDOM && process.env.RADIOQUIZ_REQUIRE_JSDOM) throw new Error('jsdom is required (RADIOQUIZ_REQUIRE_JSDOM is set) but could not be loaded');
const skip = JSDOM ? false : 'jsdom not installed';

function setupDom(url = 'http://localhost/') {
  const dom = new JSDOM('<!doctype html><html lang="nb"><body><main id="app"></main></body></html>', { url });
  const w = dom.window;
  Object.assign(globalThis, {
    window: w, document: w.document, Element: w.Element, Node: w.Node, localStorage: w.localStorage,
    location: w.location, history: w.history,
    confirm: () => true, matchMedia: () => ({ matches: false }),
    addEventListener: w.addEventListener.bind(w), removeEventListener: w.removeEventListener.bind(w),
  });
  return { dom, root: w.document.getElementById('app'), w };
}

function bankWithTerms() {
  const bank = makeBank({ perChapter: { 2: 3, 6: 1 } });
  const q = bank.questions[0];
  q.options[1].content = ['Feil svar med ', { term: 'strom', text: 'strøm' }];
  q.stem = [['Hva gjelder ', { term: 'hemmelig', text: 'hemmelig' }, '?']];
  q.glossary_after_answer = ['hemmelig'];
  q.ref = { chapter: 2, section: 's2-x', pages: ['2-3', '2-4'] };
  bank.sections = { 's2-x': { chapter: 2, title: 'Testavsnitt' } };
  return bank;
}

async function app(bank, url) {
  const { createApp } = await import('../../web/js/ui/app.js');
  const env = setupDom(url);
  const instance = createApp(env.root, bank);
  return { ...env, instance };
}

const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => [...root.querySelectorAll(sel)];

function start(root, chapters) {
  for (const cb of $$(root, 'input[name=chapter]')) {
    if (cb.disabled) continue;
    if (chapters.includes(Number(cb.value)) !== cb.checked) cb.click();
  }
  $(root, '#setup-form button[type=submit]').click();
}

function choose(root, letterIndex) {
  $$(root, '.opt label')[letterIndex].click();
}

test('setup lists chapters and marks unavailable ones', { skip }, async () => {
  const { root } = await app(bankWithTerms());
  assert.equal($(root, 'svg.dial').getAttribute('aria-hidden'), 'true');
  assert.equal($$(root, '.dial-station.is-on').length, 2, 'selected chapters are lit on the dial');
  const items = $$(root, '.check-list li');
  assert.equal(items.length, 7);
  assert.equal($(root, '#ch-7'), null, 'unscanned chapters have no checkbox');
  assert.ok(items[6].textContent.includes('Kapittel 7'));
  assert.ok(items[6].textContent.includes('ingen spørsmål ennå'));
  assert.ok(items[0].textContent.includes('ingen godkjente spørsmål ennå'));
  assert.ok(items[1].textContent.includes('3 spørsmål'));
  $(root, '[data-action=select-none]').click();
  assert.equal($(root, '#setup-form button[type=submit]').disabled, true);
  assert.ok($(root, '#avail').textContent.includes('Velg minst ett kapittel'));
  $(root, '#ch-6').click();
  const opts = $$(root, '#count option').map((o) => o.textContent);
  assert.deepEqual(opts, ['Alle (1)']);
});

test('answering locks the question and shows complete feedback', { skip }, async () => {
  const { root, w } = await app(bankWithTerms());
  start(root, [2]);
  assert.ok($(root, '#q-progress').textContent.startsWith('Spørsmål 1 av 3'));
  const submit = $(root, '#answer-form button[type=submit]');
  assert.equal(submit.disabled, true);
  // pick a wrong option
  const labels = $$(root, '.opt label');
  const wrongIdx = $$(root, '.opt input').findIndex((i) => i.value !== 'o1');
  labels[wrongIdx].click();
  assert.equal(submit.disabled, false);
  submit.click();
  const fb = $(root, '.feedback');
  assert.ok(fb, 'feedback shown immediately');
  assert.ok(fb.textContent.includes('Ikke riktig'));
  assert.ok(fb.textContent.includes('Riktig svar:'));
  assert.ok(fb.textContent.includes('Hvorfor'));
  assert.ok(fb.textContent.includes('Les mer'));
  assert.equal(w.document.activeElement.id, 'fb-title');
  assert.ok($$(root, '.opt input').every((i) => i.disabled));
  const correct = $(root, '.opt.is-correct');
  assert.ok(correct.textContent.includes('Riktig svar'));
  assert.ok($(root, '.opt.is-wrong').textContent.includes('Ditt svar – feil'));
  assert.equal($$(root, '.opt.is-correct').length, 1);
  // the submit control is gone; a forced second submit changes nothing
  assert.equal($(root, '#answer-form button[type=submit]'), null);
  $(root, '#answer-form').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  assert.equal($$(root, '.feedback').length, 1);
});

test('feedback has a pre-filled GitHub issue link identifying the question', { skip }, async () => {
  const bank = bankWithTerms();
  bank.site = { issues_url: 'https://github.com/868-no/quiz/issues' };
  const { root } = await app(bank);
  start(root, [2]);
  choose(root, 0);
  $(root, '#answer-form button[type=submit]').click();
  const a = $(root, '.feedback .report a');
  const id = $(root, '.feedback .report .qid').textContent;
  assert.match(id, /Spørsmål q-\d+, versjon 1/);
  const url = new URL(a.getAttribute('href'));
  assert.equal(url.origin + url.pathname, 'https://github.com/868-no/quiz/issues/new');
  assert.match(url.searchParams.get('title'), /^\[q-\d+ v1\] $/);
  assert.equal(url.searchParams.get('template'), 'sporsmal.yml');
  assert.match(url.searchParams.get('sporsmal'), /^q-\d+ \(versjon 1\)$/);
  assert.equal(url.searchParams.get('kapittel'), '2');
  assert.match(url.searchParams.get('lenke'), /^http:\/\/localhost\/#q-\d+$/);
  assert.match(url.searchParams.get('tekst'), /\?$/, 'the question text is included');
  assert.equal(a.getAttribute('rel'), 'noopener noreferrer');
});

test('no report link when the site has no issue tracker configured', { skip }, async () => {
  const { root } = await app(bankWithTerms());
  start(root, [2]);
  choose(root, 0);
  $(root, '#answer-form button[type=submit]').click();
  assert.equal($(root, '.feedback .report a'), null);
  assert.match($(root, '.feedback .report .qid').textContent, /Spørsmål q-\d+/);
  assert.ok($(root, '.feedback [data-action=copy-link]'), 'the question can still be linked');
});

test('a correct answer still gets an explanation and a study reference', { skip }, async () => {
  const { root, instance } = await app(bankWithTerms());
  start(root, [2]);
  const idx = $$(root, '.opt input').findIndex((i) => i.value === 'o1');
  choose(root, idx);
  $(root, '#answer-form button[type=submit]').click();
  const fb = $(root, '.feedback');
  assert.ok(fb.textContent.includes('Riktig!'));
  assert.ok(fb.textContent.includes('Forklaring'));
  assert.ok(instance.state.session.items[0].answer.correct);
});

test('study reference shows printed pages and verified section names', { skip }, async () => {
  const bank = bankWithTerms();
  bank.questions = [bank.questions[0]];
  bank.chapters.find((c) => c.number === 2).questions = 1;
  const { root } = await app(bank);
  start(root, [2]);
  choose(root, 0);
  $(root, '#answer-form button[type=submit]').click();
  const ref = $(root, '.feedback .ref').textContent;
  assert.ok(ref.includes('Kapittel 2 – Kapittel-tittel 2'));
  assert.ok(ref.includes('avsnittet «Testavsnitt»'));
  assert.ok(ref.includes('sidene 2-3 og 2-4'));
  assert.ok(ref.includes('«Testbok»'));
});

test('full run: results, per-chapter breakdown and review of wrong answers', { skip }, async () => {
  const { root } = await app(bankWithTerms());
  start(root, [2, 6]);
  let n = 0;
  while ($(root, '#answer-form')) {
    const inputs = $$(root, '.opt input');
    const idx = inputs.findIndex((i) => (n % 2 === 0 ? i.value === 'o1' : i.value === 'o2'));
    choose(root, idx);
    $(root, '#answer-form button[type=submit]').click();
    $(root, '[data-action=next]').click();
    n += 1;
  }
  assert.equal(n, 4);
  assert.ok($(root, '.score').textContent.includes('2 av 4'));
  assert.equal($$(root, '.by-chapter tbody tr').length, 2);
  assert.equal($$(root, '.review > li').length, 2, 'only wrong answers by default');
  assert.ok($$(root, '.review details').every((d) => d.open));
  assert.ok($(root, '.review').textContent.includes('Ditt svar:'));
  $(root, '#only-wrong').click();
  assert.equal($$(root, '.review > li').length, 4);
  $(root, '[data-action=new]').click();
  assert.ok($(root, '#setup-title'));
});

test('glossary popover inside an answer does not select the answer', { skip }, async () => {
  const bank = bankWithTerms();
  bank.questions = [bank.questions[0]];
  bank.chapters.find((c) => c.number === 2).questions = 1;
  const { root, w } = await app(bank);
  start(root, [2]);
  // the term held back until answering is plain text
  assert.equal($(root, '.q-stem button.term'), null);
  assert.ok($(root, '.q-stem').textContent.includes('hemmelig'));
  const term = $(root, '.opt button.term');
  assert.ok(term);
  term.click();
  const radio = term.closest('.opt').querySelector('input');
  assert.equal(radio.checked, false, 'opening the explanation must not select the option');
  const pop = $(root, '.term-pop');
  assert.ok(pop);
  assert.ok(pop.textContent.includes('current'));
  assert.equal(term.getAttribute('aria-expanded'), 'true');
  pop.click();
  assert.equal(radio.checked, false);
  term.focus();
  w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal($(root, '.term-pop'), null);
  assert.equal(term.getAttribute('aria-expanded'), 'false');
  assert.equal(w.document.activeElement, term);
  // keyboard focus alone opens a preview
  term.blur();
  term.dispatchEvent(new w.FocusEvent('focusin', { bubbles: true }));
  assert.ok($(root, '.term-pop'));
});

test('a popover is never placed inside the no-wrap wrapper around a term', { skip }, async () => {
  const bank = bankWithTerms();
  bank.questions = [bank.questions[0]];
  bank.questions[0].explanation = [['Se ', { term: 'strom', text: 'strøm' }, '. Mer tekst.']];
  bank.chapters.find((c) => c.number === 2).questions = 1;
  const { root } = await app(bank);
  start(root, [2]);
  choose(root, 0);
  $(root, '#answer-form button[type=submit]').click();
  const term = $(root, '.feedback .nowrap > button.term');
  assert.ok(term, 'term with trailing punctuation is wrapped');
  term.click();
  const pop = $(root, '.term-pop');
  assert.ok(pop);
  assert.equal(pop.closest('.nowrap'), null);
});

test('an in-progress quiz can be resumed or discarded', { skip }, async () => {
  const bank = bankWithTerms();
  const first = await app(bank);
  start(first.root, [2]);
  choose(first.root, 0);
  $(first.root, '#answer-form button[type=submit]').click();
  const stored = first.w.localStorage.getItem('radioquiz.session.v1');
  assert.ok(stored);
  const parsed = JSON.parse(stored);
  assert.deepEqual(Object.keys(parsed.items[0]).sort(), ['answer', 'order', 'qid', 'rev']);
  // a fresh page load with the same storage
  const { createApp } = await import('../../web/js/ui/app.js');
  const root2 = first.w.document.createElement('main');
  first.w.document.body.appendChild(root2);
  createApp(root2, bank);
  assert.ok(root2.textContent.includes('påbegynt runde'));
  root2.querySelector('[data-action=resume]').click();
  assert.ok(root2.querySelector('.feedback'), 'the answered question comes back with its feedback');
});

test('empty bank shows an explicit message', { skip }, async () => {
  const bank = makeBank({ perChapter: {} });
  const { root } = await app(bank);
  assert.ok(root.textContent.includes('Det er ikke publisert noen godkjente spørsmål ennå'));
  assert.equal($(root, '#setup-form button[type=submit]').disabled, true);
});

test('figures render with a text description and an animation toggle', { skip }, async () => {
  const bank = makeBank({ perChapter: { 2: 1 } });
  bank.questions[0].visual = {
    template: 'dc-circuit', version: 1,
    params: { topology: 'series', source: { voltage_v: 12 }, resistors: [{ ohms: 470 }], ammeter: { branch: 'main' }, animate_current: true },
    params_after: { ammeter: { show_reading: true } },
  };
  const { root } = await app(bank);
  start(root, [2]);
  const fig = $(root, 'figure.fig');
  assert.ok(fig.querySelector('svg[role=img]'));
  assert.ok(fig.querySelector('.fig-desc').textContent.includes('amperemeter'));
  assert.ok(!fig.textContent.includes('25,5'));
  const toggle = fig.querySelector('.fig-anim-toggle');
  toggle.click();
  assert.ok($(root, 'figure.fig').classList.contains('is-playing'));
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  choose(root, 0);
  $(root, '#answer-form button[type=submit]').click();
  assert.ok($(root, 'figure.fig').textContent.includes('25,5'), 'after answering, the figure shows the reading');
});

test('reduced motion removes the animation control', { skip }, async () => {
  const bank = makeBank({ perChapter: { 2: 1 } });
  bank.questions[0].visual = { template: 'dc-circuit', version: 1, params: { topology: 'series', source: { voltage_v: 1 }, resistors: [{ ohms: 1 }], animate_current: true } };
  const { createApp } = await import('../../web/js/ui/app.js');
  const { root } = setupDom();
  globalThis.matchMedia = () => ({ matches: true });
  createApp(root, bank);
  start(root, [2]);
  assert.equal($(root, '.fig-anim-toggle'), null);
  assert.ok($(root, 'figure.fig svg'));
});

function answer(root, correct) {
  const idx = $$(root, '.opt input').findIndex((i) => (i.value === 'o1') === correct);
  $$(root, '.opt label')[idx].click();
  $(root, '#answer-form button[type=submit]').click();
}

function finishRound(root, correctFor) {
  while ($(root, '#answer-form')) {
    answer(root, correctFor($(root, '.q-stem').textContent));
    $(root, '[data-action=next]').click();
  }
}

test('wrong answers are remembered and can be practised until answered right', { skip }, async () => {
  const bank = makeBank({ perChapter: { 2: 4 } });
  const { root, w } = await app(bank);
  assert.equal($(root, '[data-action=practice-missed]'), null, 'nothing to practise yet');
  $(root, '#count').value = String(4);
  $(root, '#count').dispatchEvent(new w.Event('change', { bubbles: true }));
  start(root, [2]);
  // wrong on q-2000 and q-2001, right on the others
  const wrongOn = new Set(['q-2000', 'q-2001']);
  finishRound(root, (stem) => ![...wrongOn].some((id) => stem.includes(id)));
  assert.deepEqual(Object.keys(JSON.parse(w.localStorage.getItem('radioquiz.missed.v1'))).sort(), ['q-2000', 'q-2001']);
  $(root, '[data-action=new]').click();
  assert.ok($(root, '.continue-missed').textContent.includes('2 spørsmål'));
  $(root, '[data-action=practice-missed]').click();
  assert.ok($(root, '.q-meta .tag').textContent.includes('Feil fra før'));
  assert.ok($(root, '#q-progress').textContent.endsWith('av 2'));
  // right on q-2000, wrong again on q-2001
  finishRound(root, (stem) => stem.includes('q-2000'));
  assert.deepEqual(Object.keys(JSON.parse(w.localStorage.getItem('radioquiz.missed.v1'))), ['q-2001']);
  assert.ok($(root, '[data-action=practice-missed]').textContent.includes('1 igjen'));
  $(root, '[data-action=practice-missed]').click();
  finishRound(root, () => true);
  assert.equal($(root, '[data-action=practice-missed]'), null, 'list is empty');
  $(root, '[data-action=new]').click();
  assert.equal($(root, '.continue-missed'), null);
});

test('the list of mistakes can be cleared and ignores questions no longer published', { skip }, async () => {
  const bank = makeBank({ perChapter: { 2: 2 } });
  const env = setupDom();
  env.w.localStorage.setItem('radioquiz.missed.v1', JSON.stringify({ 'q-2000': 1, 'q-9999': 2, bad: 3 }));
  const { createApp } = await import('../../web/js/ui/app.js');
  createApp(env.root, bank);
  assert.ok($(env.root, '.continue-missed').textContent.includes('ett spørsmål'));
  $(env.root, '[data-action=clear-missed]').click();
  assert.equal($(env.root, '.continue-missed'), null);
  assert.equal(env.w.localStorage.getItem('radioquiz.missed.v1'), null);
});

test('a link to a question opens just that question without touching a saved round', { skip }, async () => {
  const bank = makeBank({ perChapter: { 2: 4 } });
  bank.site = { issues_url: 'https://github.com/868-no/quiz/issues' };
  const first = await app(bank);
  start(first.root, [2]);
  answer(first.root, true);
  const saved = first.w.localStorage.getItem('radioquiz.session.v1');
  // open a new page with a link to q-2003
  first.w.history.replaceState(null, '', '/#q-2003');
  first.root.replaceChildren(); // one app per page, so element ids stay unique
  const { createApp } = await import('../../web/js/ui/app.js');
  const root = first.w.document.createElement('main');
  first.w.document.body.appendChild(root);
  createApp(root, bank);
  assert.equal($(root, '#q-progress').textContent, 'Spørsmål q-2003');
  assert.ok($(root, '.q-stem').textContent.includes('q-2003'));
  assert.equal($(root, '.dial-wrap'), null);
  answer(root, false);
  assert.equal(first.w.localStorage.getItem('radioquiz.session.v1'), saved, 'the saved round is unchanged');
  assert.ok(JSON.parse(first.w.localStorage.getItem('radioquiz.missed.v1'))['q-2003'], 'the mistake is remembered');
  const link = new URL($(root, '.report a').getAttribute('href')).searchParams.get('lenke');
  assert.equal(link, 'http://localhost/#q-2003');
  // copying falls back to showing the address when the clipboard is unavailable
  $(root, '[data-action=copy-link]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal($(root, '.copy-status a').getAttribute('href'), '#q-2003');
  assert.equal($(root, '.copy-status a').textContent, 'http://localhost/#q-2003');
  $(root, '[data-action=leave]').click();
  assert.equal(first.w.location.hash, '');
  assert.ok(root.textContent.includes('påbegynt runde'), 'the saved round can still be resumed');
});

test('a link to an unknown question explains itself on the setup screen', { skip }, async () => {
  const { root, w } = await app(makeBank({ perChapter: { 2: 2 } }), 'http://localhost/#q-9999');
  assert.ok($(root, '.link-notice').textContent.includes('Fant ikke spørsmål q-9999'));
  assert.ok($(root, '#setup-form'));
  assert.equal(w.location.hash, '');
});

test('pasting a question link into an open tab opens that question', { skip }, async () => {
  const { root, w } = await app(makeBank({ perChapter: { 2: 2 } }));
  w.location.hash = '#q-2001';
  await new Promise((r) => w.addEventListener('hashchange', r, { once: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal($(root, '#q-progress').textContent, 'Spørsmål q-2001');
});

function fakeObserver(observed) {
  return class {
    constructor(cb) { this.cb = cb; this.els = []; observed.push(this); }
    observe(el) { this.els.push(el); }
    disconnect() { this.gone = true; }
  };
}

test('the start bar follows the selection and appears only while Start is out of view', { skip }, async () => {
  const observed = [];
  const env = setupDom();
  globalThis.IntersectionObserver = fakeObserver(observed);
  try {
    const { createApp } = await import('../../web/js/ui/app.js');
    createApp(env.root, makeBank({ perChapter: { 2: 6, 3: 3 } }));
    const root = env.root;
    const bar = $(root, '.start-bar');
    const start = $(root, '#setup-form button[type=submit]');
    assert.equal(bar.getAttribute('aria-hidden'), 'true');
    assert.equal($(root, '[data-action=start-bar]').getAttribute('tabindex'), '-1');
    assert.equal(bar.hidden, true, 'hidden until we know where the Start button is');
    const io = observed.at(-1);
    assert.deepEqual(io.els, [start], 'without a round in progress only Start is watched');
    io.cb([{ target: start, isIntersecting: false, boundingClientRect: { top: 900 } }]);
    assert.equal(bar.hidden, false, 'shown while Start is below the screen');
    assert.equal($(root, '.start-bar-text').textContent, 'Runde på 9 spørsmål av 9 i 2 kapitler');
    assert.equal($(root, '[data-action=start-bar]').textContent, 'Start');
    io.cb([{ target: start, isIntersecting: true, boundingClientRect: { top: 400 } }]);
    assert.equal(bar.hidden, true);
    // the selection is reflected, and the old observer is let go on re-render
    $(root, '#ch-3').click();
    assert.ok(io.gone);
    assert.equal($(root, '.start-bar-text').textContent, 'Runde på 6 spørsmål av 6 i 1 kapittel');
    $(root, '[data-action=select-none]').click();
    assert.equal($(root, '.start-bar-text').textContent, 'Velg minst ett kapittel.');
    assert.equal($(root, '[data-action=start-bar]').disabled, true);
    $(root, '[data-action=select-all]').click();
    $(root, '#count').value = '5';
    $(root, '#count').dispatchEvent(new env.w.Event('change', { bubbles: true }));
    assert.equal($(root, '.start-bar-text').textContent, 'Runde på 5 spørsmål av 9 i 2 kapitler');
    $(root, '[data-action=start-bar]').click();
    assert.ok($(root, '#answer-form'), 'the bar starts the round');
    assert.equal($(root, '.start-bar'), null);
  } finally {
    delete globalThis.IntersectionObserver;
  }
});

test('with a round in progress the bar offers a new round only once the continue box is out of view', { skip }, async () => {
  const observed = [];
  const env = setupDom();
  globalThis.IntersectionObserver = fakeObserver(observed);
  try {
    const { createApp } = await import('../../web/js/ui/app.js');
    const bank = makeBank({ perChapter: { 2: 6 } });
    createApp(env.root, bank);
    start(env.root, [2]);
    choose(env.root, 0);
    $(env.root, '#answer-form button[type=submit]').click();
    // a fresh page load with the round saved
    const root = env.w.document.createElement('main');
    env.root.replaceChildren();
    env.w.document.body.appendChild(root);
    createApp(root, bank);
    const box = $(root, '.notice-continue');
    const startBtn = $(root, '#setup-form button[type=submit]');
    assert.ok(box);
    assert.equal(startBtn.textContent, 'Start ny runde');
    assert.equal($(root, '[data-action=start-bar]').textContent, 'Start ny runde');
    assert.match($(root, '.start-bar-text').textContent, /^Ny runde: \d+ spørsmål av 6 i 1 kapittel$/);
    const io = observed.at(-1);
    assert.deepEqual(io.els, [startBtn, box]);
    const bar = $(root, '.start-bar');
    io.cb([{ target: startBtn, isIntersecting: false, boundingClientRect: { top: 900 } }, { target: box, isIntersecting: true, boundingClientRect: { top: 300 } }]);
    assert.equal(bar.hidden, true, 'not while "Fortsett der du slapp" is on screen');
    io.cb([{ target: box, isIntersecting: false, boundingClientRect: { top: -200 } }]);
    assert.equal(bar.hidden, false, 'shown once the box has scrolled away');
  } finally {
    delete globalThis.IntersectionObserver;
  }
});
