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
  const dom = new JSDOM('<!doctype html><html lang="nb"><body><main id="app"></main><footer><p id="footer-jump" hidden></p></footer></body></html>', { url });
  const w = dom.window;
  Object.assign(globalThis, {
    window: w, document: w.document, Element: w.Element, Node: w.Node, localStorage: w.localStorage,
    location: w.location, history: w.history,
    confirm: () => { throw new Error('window.confirm is not used; the app has its own dialog'); }, matchMedia: () => ({ matches: false }),
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

// the app's confirmation dialog (instead of window.confirm), placed at the end of <body>
const dialogOf = (node) => node.ownerDocument.querySelector('dialog.confirm-dialog');
function answerDialog(node, yes) {
  const d = dialogOf(node);
  assert.ok(d, 'a confirmation dialog is open');
  d.querySelector(`[data-dialog=${yes ? 'confirm' : 'cancel'}]`).click();
}

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

test('figures render with a text description, and animations play until stopped', { skip }, async () => {
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
  assert.ok(fig.classList.contains('is-playing'), 'an animation starts by itself');
  assert.equal(toggle.getAttribute('aria-pressed'), 'true');
  assert.equal(toggle.textContent, 'Stopp animasjon');
  toggle.click();
  assert.ok(!$(root, 'figure.fig').classList.contains('is-playing'));
  assert.equal(toggle.getAttribute('aria-pressed'), 'false');
  assert.equal(toggle.textContent, 'Spill av animasjon');
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
  assert.ok(!$(root, 'figure.fig').classList.contains('is-playing'), 'nothing plays with reduced motion');
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
  answerDialog(env.root, true);
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

test('question ids are read from what people type or paste', async () => {
  const { parseQuestionId } = await import('../../web/js/ui/app.js');
  for (const [text, id] of [['q-0045', 'q-0045'], ['Q45', 'q-0045'], ['45', 'q-0045'], [' #q-0045 ', 'q-0045'],
    ['https://quiz.868.no/#q-0045', 'q-0045'], ['q 7', 'q-0007'], ['q-12345', 'q-12345']]) assert.equal(parseQuestionId(text), id, text);
  for (const text of ['', 'abc', 'q-', '4,5', 'kapittel 4']) assert.equal(parseQuestionId(text), null, text);
});

test('"Gå til et bestemt spørsmål" in the footer asks for the number and opens that question', { skip }, async () => {
  const { root, w } = await app(makeBank({ perChapter: { 2: 3 } }));
  const doc = root.ownerDocument;
  assert.equal($(doc, '#footer-jump').hidden, false, 'the link is shown in the footer');
  const opener = $(doc, '#footer-jump button');
  opener.click();
  const d = $(doc, 'dialog.confirm-dialog');
  assert.ok(d, 'the dialog opens');
  assert.equal(d.getAttribute('aria-labelledby'), 'prompt-title');
  const input = $(d, '#prompt-input');
  assert.equal(doc.activeElement, input, 'the field has focus');
  assert.equal($(d, `label[for=prompt-input]`).textContent, 'Spørsmålsnummer');
  assert.equal($(d, '.prompt-prefix').textContent, 'q-', '"q-" stands in front of the field');
  assert.equal(input.getAttribute('aria-labelledby'), 'prompt-label prompt-prefix');
  // a typed or pasted "q-", or a whole link, is taken off: the prefix is already there
  for (const [typed, kept] of [['q-0045', '0045'], ['Q45', '45'], ['https://quiz.868.no/#q-0012', '0012'], ['q', ''], ['-', ''], ['-45', '45']]) {
    input.value = typed;
    input.dispatchEvent(new w.Event('input', { bubbles: true }));
    assert.equal(input.value, kept, typed);
  }
  input.value = '';
  const submit = () => $(d, '[data-dialog=confirm]').click();
  // empty, nonsense and unknown numbers are explained in the dialog, which stays open
  submit();
  assert.equal($(d, '#prompt-error').textContent, 'Skriv nummeret på spørsmålet.');
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  input.value = 'abc';
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal($(d, '#prompt-error').textContent, '', 'typing clears the error');
  assert.equal(input.getAttribute('aria-invalid'), null);
  submit();
  assert.match($(d, '#prompt-error').textContent, /^Skriv bare sifrene/);
  input.value = '9999';
  submit();
  assert.match($(d, '#prompt-error').textContent, /^Fant ikke spørsmål q-9999\./);
  assert.ok(d.isConnected);
  // cancelling returns focus to the link
  $(d, '[data-dialog=cancel]').click();
  assert.equal($(doc, 'dialog.confirm-dialog'), null);
  assert.equal(doc.activeElement, opener);
  // a known number opens the question, with its link in the address
  opener.click();
  $(doc, '#prompt-input').value = 'Q2002'; // not typed, so not stripped yet: submitting reads it the same way
  $(doc, 'dialog.confirm-dialog [data-dialog=confirm]').click();
  assert.equal($(doc, 'dialog.confirm-dialog'), null);
  assert.equal($(root, '#q-progress').textContent, 'Spørsmål q-2002');
  assert.equal(doc.activeElement, $(root, '#q-progress'));
  assert.equal(w.location.hash, '#q-2002');
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

test('with a round in progress the bar shows too, and a new round asks before replacing it', { skip }, async () => {
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
    assert.ok($(root, '.continue-resume'));
    const startBtn = $(root, '#setup-form button[type=submit]');
    assert.equal(startBtn.textContent, 'Start ny runde');
    assert.equal($(root, '[data-action=start-bar]').textContent, 'Start ny runde');
    assert.match($(root, '.start-bar-text').textContent, /^Ny runde: \d+ spørsmål av 6 i 1 kapittel$/);
    const io = observed.at(-1);
    assert.deepEqual(io.els, [startBtn], 'only Start is watched, not the continue box');
    io.cb([{ target: startBtn, isIntersecting: false, boundingClientRect: { top: 900 } }]);
    assert.equal($(root, '.start-bar').hidden, false, 'shown although "Fortsett der du slapp" is on screen');
    // declining keeps the paused round
    $(root, '[data-action=start-bar]').click();
    const d = dialogOf(root);
    assert.ok(d, 'the dialog opens');
    assert.equal(d.getAttribute('aria-labelledby'), 'confirm-title');
    assert.equal($(d, '.confirm-title').textContent, 'Forkaste den påbegynte runden?');
    assert.match($(d, '.confirm-message').textContent, /påbegynt runde \(spørsmål 1 av 6\)\. Starter du en ny runde, blir den forkastet\./);
    assert.equal($(d, '[data-dialog=confirm]').textContent, 'Forkast og start');
    assert.equal(d.ownerDocument.activeElement, $(d, '[data-dialog=cancel]'), 'the safe choice has focus');
    answerDialog(root, false);
    assert.equal(dialogOf(root), null, 'the dialog is gone');
    assert.equal($(root, '#answer-form'), null, 'no new round');
    assert.ok($(root, '.continue-resume'), 'the paused round is still offered');
    // Escape cancels too
    $(root, '#setup-form button[type=submit]').click();
    assert.ok(dialogOf(root));
    root.ownerDocument.dispatchEvent(new env.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.equal(dialogOf(root), null, 'Escape closes it');
    assert.equal($(root, '#answer-form'), null);
    // accepting starts the new round and drops the old one
    $(root, '#setup-form button[type=submit]').click();
    answerDialog(root, true);
    assert.ok($(root, '#answer-form'), 'the new round starts');
    assert.equal($(root, '.continue-resume'), null);
  } finally {
    delete globalThis.IntersectionObserver;
  }
});

test('quitting asks first, and cancelling keeps the round and the focus', { skip }, async () => {
  const { root } = await app(makeBank({ perChapter: { 2: 3 } }));
  start(root, [2]);
  const quit = $(root, '[data-action=quit]');
  quit.focus();
  quit.click();
  const d = dialogOf(root);
  assert.equal($(d, '.confirm-title').textContent, 'Avslutte runden?');
  assert.equal($(d, '[data-dialog=confirm]').textContent, 'Avslutt runden');
  answerDialog(root, false);
  assert.ok($(root, '#answer-form'), 'still in the round');
  assert.equal(root.ownerDocument.activeElement, quit, 'focus is back on the button');
  quit.click();
  answerDialog(root, true);
  assert.ok($(root, '#setup-form'), 'back to the start page');
});

test('after a new round replaces a paused one, the start page no longer offers the old one', { skip }, async () => {
  const env = setupDom();
  const { createApp } = await import('../../web/js/ui/app.js');
  const bank = makeBank({ perChapter: { 2: 6 } });
  createApp(env.root, bank);
  start(env.root, [2]);
  answer(env.root, true);
  // a fresh page load with the round saved
  const root = env.w.document.createElement('main');
  env.root.replaceChildren();
  env.w.document.body.appendChild(root);
  createApp(root, bank);
  assert.ok($(root, '.continue-resume'));
  // a new round replaces it and is played to the end
  $(root, '#setup-form button[type=submit]').click();
  answerDialog(root, true);
  finishRound(root, () => true);
  assert.ok($(root, '.results'), 'the new round is finished');
  $(root, '[data-action=new]').click();
  assert.ok($(root, '#setup-form'));
  assert.equal($(root, '.continue-resume'), null, 'the discarded round is not offered again');
});

test('a chapter outside the quiz is left out of the chapter list', { skip }, async () => {
  const bank = makeBank({ perChapter: { 2: 3 } });
  bank.chapters.find((c) => c.number === 3).status = 'not_in_quiz';
  const { root } = await app(bank);
  assert.equal($(root, '#ch-3'), null);
  assert.ok(!$$(root, '.check-list li').some((li) => li.querySelector('.ch-num')?.textContent.endsWith('3')), 'no row for it');
  assert.ok($(root, '#ch-2'), 'the others are listed');
});

test('without a paused round a new round starts without asking', { skip }, async () => {
  const { root } = await app(makeBank({ perChapter: { 2: 3 } }));
  $(root, '#setup-form button[type=submit]').click();
  assert.equal(dialogOf(root), null);
  assert.ok($(root, '#answer-form'));
});

test('a list of missed questions alone does not hold back the start bar', { skip }, async () => {
  const observed = [];
  const env = setupDom();
  globalThis.IntersectionObserver = fakeObserver(observed);
  try {
    const { createApp } = await import('../../web/js/ui/app.js');
    const bank = makeBank({ perChapter: { 2: 6 } });
    createApp(env.root, bank);
    start(env.root, [2]);
    answer(env.root, false);
    $(env.root, '[data-action=quit]').click();
    answerDialog(env.root, true);
    // a fresh page load: no round to continue, but a mistake to practise
    const root = env.w.document.createElement('main');
    env.root.replaceChildren();
    env.w.document.body.appendChild(root);
    createApp(root, bank);
    assert.ok($(root, '.continue-missed'), 'the box with missed questions is shown');
    assert.equal($(root, '.continue-resume'), null);
    const startBtn = $(root, '#setup-form button[type=submit]');
    const io = observed.at(-1);
    assert.deepEqual(io.els, [startBtn], 'only Start is watched');
    io.cb([{ target: startBtn, isIntersecting: false, boundingClientRect: { top: 900 } }]);
    assert.equal($(root, '.start-bar').hidden, false, 'shown as soon as Start is below the screen');
  } finally {
    delete globalThis.IntersectionObserver;
  }
});

test('the chapter list shows progress, explains it, and can be reset', { skip }, async () => {
  const bank = makeBank({ perChapter: { 2: 3, 3: 2 } });
  const { root, w } = await app(bank);
  assert.ok($(root, '#ch-2-st').textContent.includes('3 spørsmål'));
  assert.equal($(root, '.progress-note'), null, 'no note before any progress');
  start(root, [2]);
  answer(root, true);
  $(root, '[data-action=next]').click();
  answer(root, false);
  $(root, '[data-action=quit]').click();
  answerDialog(root, true);
  assert.ok($(root, '#ch-2-st').textContent.includes('1 av 3 riktig besvart'));
  assert.ok($(root, '#ch-3-st').textContent.includes('2 spørsmål'));
  assert.ok($(root, '.progress-note').textContent.includes('minst én gang'));
  assert.equal(Object.keys(JSON.parse(w.localStorage.getItem('radioquiz.solved.v1'))).length, 1);
  $(root, '[data-action=clear-solved]').click();
  answerDialog(root, true);
  assert.ok($(root, '#ch-2-st').textContent.includes('3 spørsmål'));
  assert.equal(w.localStorage.getItem('radioquiz.solved.v1'), null);
  assert.ok(w.localStorage.getItem('radioquiz.missed.v1'), 'the list of mistakes is kept');
});

function examAnswer(root, correct) {
  const idx = $$(root, '.opt input').findIndex((i) => (i.value === 'o1') === correct);
  $$(root, '.opt label')[idx].click();
  $(root, '#answer-form button[type=submit]').click();
}

test('a practice exam gives no feedback until the end and then a pass or fail', { skip }, async () => {
  const { root } = await app(makeBank({ perChapter: { 2: 4, 3: 4 } }));
  $(root, '#mode-exam').click();
  const exam = $(root, '.exam');
  assert.ok(exam.textContent.includes('8 tilfeldige spørsmål fra alle tilgjengelige kapitler'));
  assert.ok(exam.textContent.includes('Du består med 6 riktige (75 %'), '75 % of 8, rounded up');
  assert.ok(!/kapittel \d/.test(exam.textContent), 'the exam text does not list chapters');
  $(root, '[data-action=start-exam]').click();
  assert.equal($(root, '.q-meta .tag').textContent, 'Prøveeksamen');
  assert.equal($(root, '[data-action=quit]').textContent, 'Avslutt prøven');
  examAnswer(root, true);
  assert.equal($(root, '.feedback'), null, 'no feedback during the exam');
  assert.equal($(root, '#q-progress').textContent, 'Spørsmål 2 av 8');
  assert.equal($$(root, '.dial-mark-answered').length, 1);
  assert.equal($$(root, '.dial-mark-ok').length + $$(root, '.dial-mark-bad').length, 0, 'right and wrong are not shown');
  $(root, '[data-action=skip]').click();
  assert.equal($(root, '#q-progress').textContent, 'Spørsmål 3 av 8');
  for (let i = 0; i < 6; i++) examAnswer(root, true);
  assert.ok($(root, '.exam-verdict.is-pass'));
  assert.ok($(root, '.exam-verdict').textContent.includes('Bestått'));
  assert.ok($(root, '.exam-verdict').textContent.includes('1 spørsmål ble hoppet over'));
  assert.ok($(root, '.score').textContent.startsWith('7 av 8'));
  assert.ok($(root, '.review').textContent.includes('Ikke besvart'));
  $(root, '[data-action=start-exam]').click();
  assert.equal($(root, '#q-progress').textContent, 'Spørsmål 1 av 8', 'a new exam starts from the results');
});

test('a failed practice exam says how many were missing', { skip }, async () => {
  const { root } = await app(makeBank({ perChapter: { 2: 4 } }));
  $(root, '#mode-exam').click();
  $(root, '[data-action=start-exam]').click();
  examAnswer(root, true);
  for (let i = 0; i < 3; i++) examAnswer(root, false);
  const v = $(root, '.exam-verdict.is-fail');
  assert.ok(v.textContent.includes('Ikke bestått'));
  assert.ok(v.textContent.includes('Du trengte 3 riktige for å bestå, og manglet 2'));
});

test('difficulty and question type start checked, and none checked means none', { skip }, async () => {
  const bank = makeBank({ perChapter: { 2: 4 } });
  bank.questions[1].difficulty = 'hard';
  bank.questions[2].style = 'calculation';
  const { root } = await app(bank);
  const boxes = (name) => $$(root, `input[name=${name}]`);
  assert.ok(boxes('difficulty').length >= 2 && boxes('difficulty').every((b) => b.checked), 'all difficulties start checked');
  assert.ok(boxes('style').every((b) => b.checked), 'all question types start checked');
  assert.ok($(root, '#avail').textContent.startsWith('4 spørsmål'));
  $(root, '[data-action=filter-none][data-filter=difficulty]').click();
  assert.ok(boxes('difficulty').every((b) => !b.checked));
  assert.equal($(root, '#avail').textContent, 'Velg minst én vanskelighetsgrad.');
  assert.equal($(root, '#setup-form button[type=submit]').disabled, true);
  $(root, '#difficulty-hard').click();
  assert.ok($(root, '#avail').textContent.startsWith('1 spørsmål'), 'only the checked difficulty counts');
  $(root, '[data-action=filter-all][data-filter=difficulty]').click();
  $(root, '[data-action=filter-none][data-filter=style]').click();
  assert.equal($(root, '#avail').textContent, 'Velg minst én spørsmålstype.');
  $(root, '[data-action=filter-all][data-filter=style]').click();
  assert.ok($(root, '#avail').textContent.startsWith('4 spørsmål'));
});

test('the start screen chooses between practice and practice exam first', { skip }, async () => {
  const { root, w } = await app(makeBank({ perChapter: { 2: 4 } }));
  const sw = $(root, '.mode-switch');
  assert.equal(sw.getAttribute('role'), 'radiogroup');
  assert.equal(sw.getAttribute('aria-label'), 'Velg øvingsform');
  assert.ok($(root, '#mode-practice').checked, 'practice is the default');
  assert.equal($(root, '#setup-title').textContent, 'Øvingsrunde');
  assert.ok($(root, '#setup-form') && $(root, '.start-bar'));
  assert.equal($(root, '.exam'), null, 'the exam setup is not shown in practice mode');
  $(root, '#mode-exam').click();
  assert.equal($(root, '#setup-title').textContent, 'Prøveeksamen');
  assert.equal($(root, '#setup-form'), null, 'no chapter form in exam mode');
  assert.equal($(root, '.start-bar'), null);
  assert.ok($(root, '[data-action=start-exam]'));
  assert.equal(w.localStorage.getItem('radioquiz.mode.v1'), 'exam', 'the choice is remembered');
  // a fresh page load opens in the remembered mode
  const { createApp } = await import('../../web/js/ui/app.js');
  const root2 = w.document.createElement('main');
  root.replaceChildren();
  w.document.body.appendChild(root2);
  createApp(root2, makeBank({ perChapter: { 2: 4 } }));
  assert.ok(root2.querySelector('#mode-exam').checked);
  root2.querySelector('#mode-practice').click();
  assert.ok(root2.querySelector('#setup-form'));
});
