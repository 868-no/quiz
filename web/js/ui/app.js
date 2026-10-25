// The quiz application: setup → questions with immediate feedback → results.
// All content is rendered through vnodes (no innerHTML). State changes go through
// the pure engine in ../quiz/engine.js.

import { h, toDOM } from '../render/vnode.js';
import { plainText, renderInlines, renderRich } from '../render/richtext.js';
import { renderVisual } from '../visuals/registry.js';
import {
  advance, createSession, currentItem, feedbackVisible, indexBank, pool, restoreSession, submitAnswer, summary,
} from '../quiz/engine.js';
import { randomSeed } from '../quiz/rng.js';
import {
  clearMissed, clearSession, clearSolved, loadMissed, loadMode, loadSession, loadSolved, saveMissed, saveMode, saveSession,
  saveSolved,
} from '../quiz/storage.js';
import { missedIds, parseMissed, recordAnswer, recordSolved, solvedByChapter } from '../quiz/progress.js';
import { createGlossary } from './glossary.js';
import { chapterDial, roundDial, setDialWidth } from './dial.js';
import { fitFigures } from './figures.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const DIFFICULTY_LABEL = { easy: 'Lett', medium: 'Middels', hard: 'Vanskelig' };
const STYLE_LABEL = { recall: 'Faktakunnskap', concept: 'Forståelse', scenario: 'Praktiske situasjoner', calculation: 'Regneoppgaver' };
const COUNT_CHOICES = [5, 10, 20, 30, 50];
const MISSED_ROUND = 20; // most questions in one round of practising earlier mistakes
// The licence exam: 100 questions, 75 right to pass. No time limit is applied here.
const EXAM_QUESTIONS = 100;
const EXAM_PASS_SHARE = 0.75;
const examPassMark = (total) => Math.ceil(total * EXAM_PASS_SHARE);
const LINK_RE = /^#(q-\d+)$/;

const reducedMotion = () => Boolean(globalThis.matchMedia && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);

export function createApp(root, bank) {
  const byId = indexBank(bank);
  const glossaryUi = createGlossary(() => bank.glossary);
  const state = {
    session: null,
    choice: null,
    onlyWrong: true,
    selection: {
      chapters: new Set(bank.chapters.filter((c) => c.status === 'available').map((c) => c.number)),
      count: 10,
      // every chapter, difficulty and question type starts selected; none selected means none
      difficulties: new Set(distinct('difficulty')),
      styles: new Set(distinct('style')),
    },
    resumable: restoreSession(loadSession(), bank),
    missed: parseMissed(loadMissed()),
    solved: parseMissed(loadSolved()),
    mode: loadMode() === 'exam' ? 'exam' : 'practice', // the start screen's mode switch
    message: '',
    linkNotice: '',
  };

  const chapterOf = (n) => bank.chapters.find((c) => c.number === n);
  const narrow = () => (root.clientWidth || globalThis.innerWidth || 640) < 480;
  const chapterName = (n) => {
    const c = chapterOf(n);
    return c && c.title ? `Kapittel ${n} – ${c.title}` : `Kapittel ${n}`;
  };

  let lastNeedleX = null;

  // Let the needle glide from where it was to its new position (unless reduced motion).
  function glideNeedle() {
    const needle = root.querySelector('.dial-needle');
    const x = needle ? Number(needle.getAttribute('data-x')) : null;
    if (needle && lastNeedleX !== null && x !== lastNeedleX && !reducedMotion() && needle.animate) {
      needle.animate([{ transform: `translateX(${lastNeedleX - x}px)` }, { transform: 'translateX(0)' }],
        { duration: 450, easing: 'cubic-bezier(.3,.7,.2,1)' });
    }
    lastNeedleX = x;
  }

  function mount(vnode, focusSelector) {
    glossaryUi.close();
    if (startObserver) startObserver.disconnect();
    startObserver = null;
    root.replaceChildren(toDOM(vnode));
    // Animations play by themselves (with a button to stop them), unless the visitor
    // has asked the system for reduced motion: then they are left out entirely.
    if (reducedMotion()) root.querySelectorAll('.fig-anim-toggle').forEach((b) => b.remove());
    else {
      root.querySelectorAll('.fig-anim-toggle').forEach((b) => {
        root.querySelector(`#${b.dataset.fig}`)?.classList.add('is-playing');
        b.setAttribute('aria-pressed', 'true');
        b.textContent = 'Stopp animasjon';
      });
    }
    fitFigures(root);
    glideNeedle();
    const target = focusSelector && root.querySelector(focusSelector);
    if (target) target.focus({ preventScroll: false });
  }

  // A question opened from a link is not saved, so it never replaces a round in progress.
  function persist() {
    if (state.session && state.session.kind !== 'single') saveSession(state.session);
  }

  const isSingle = () => Boolean(state.session && state.session.kind === 'single');

  // ---------------------------------------------------------------- links
  function questionUrl(id) {
    const loc = globalThis.location;
    return loc ? `${loc.origin}${loc.pathname}#${id}` : `#${id}`;
  }

  function linkedId() {
    const m = LINK_RE.exec((globalThis.location && globalThis.location.hash) || '');
    return m ? m[1] : null;
  }

  function clearHash() {
    const loc = globalThis.location;
    if (loc && loc.hash && globalThis.history) globalThis.history.replaceState(null, '', loc.pathname + loc.search);
  }

  /** Open one question from a link (#q-0045) as a round of its own. */
  function openLinked(id, focus) {
    const q = byId.get(id);
    const res = q ? createSession(bank, { chapters: [q.chapter], ids: [id], count: 1, kind: 'single', seed: randomSeed() }) : { ok: false };
    if (!res.ok) {
      clearHash();
      state.session = null;
      state.linkNotice = `Fant ikke spørsmål ${id}. Det kan ha blitt fjernet.`;
      renderSetup(focus === null ? null : '.link-notice');
      return;
    }
    state.linkNotice = '';
    state.session = res.session;
    state.choice = null;
    renderQuestion(focus);
  }

  /** Leave a round and go back to the setup screen (a saved round stays resumable). */
  function toSetup() {
    if (isSingle()) clearHash();
    else clearSession();
    state.session = null;
    state.resumable = restoreSession(loadSession(), bank);
    renderSetup();
  }

  // --------------------------------------------------------------- missed
  const missedNow = () => missedIds(state.missed, bank);

  function startMissed() {
    const ids = missedNow();
    if (!ids.length) {
      renderSetup();
      return;
    }
    const chapters = [...new Set(ids.map((id) => byId.get(id).chapter))].sort((a, b) => a - b);
    start({ chapters, ids, count: Math.min(ids.length, MISSED_ROUND), kind: 'missed' });
  }

  // ----------------------------------------------------------------- exam
  const isExam = () => Boolean(state.session && state.session.policy === 'exam');
  const availableChapters = () => bank.chapters.filter((c) => c.status === 'available').map((c) => c.number);

  function examSize() {
    return Math.min(EXAM_QUESTIONS, pool(bank, { chapters: availableChapters() }).length);
  }

  function examSection(resume) {
    const n = examSize();
    if (!n) return null;
    const pass = examPassMark(n);
    const rule = n === EXAM_QUESTIONS
      ? `Du består med ${pass} riktige, som på eksamen.`
      : `Du består med ${pass} riktige (75 %, som på eksamen).`;
    return h('section', { class: 'exam', 'aria-labelledby': 'setup-title' },
      h('h2', { id: 'setup-title', tabindex: '-1' }, 'Prøveeksamen'),
      h('p', { class: 'lead' }, `${n} tilfeldige spørsmål fra alle tilgjengelige kapitler, uten fasit underveis. ${rule} Du ser svarene og forklaringene til slutt.`),
      h('p', { class: 'hint' }, 'Prøveeksamenen har ingen tidsfrist.'),
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'start-exam' }, 'Start prøveeksamen'),
      resume ? h('p', { class: 'hint' }, 'Den påbegynte runden din blir forkastet.') : null);
  }

  function startExam() {
    const resumable = state.resumable && !state.resumable.finished && !state.session;
    if (resumable && !globalThis.confirm('Du har en påbegynt runde. Vil du forkaste den og starte en prøveeksamen?')) return;
    state.session = null;
    clearSession();
    start({ chapters: availableChapters(), count: examSize(), policy: 'exam', kind: 'exam' });
  }

  // Explains "riktig besvart" in the chapter list once there is any progress, with a reset.
  function progressNote() {
    const n = Object.keys(solvedByChapter(state.solved, bank)).length;
    if (!n) return null;
    return h('p', { class: 'hint progress-note' },
      'Riktig besvart betyr at du har svart riktig på spørsmålet minst én gang, i denne nettleseren. ',
      h('button', { type: 'button', class: 'btn-link', 'data-action': 'clear-solved' }, 'Nullstill fremgangen'));
  }

  // One box for picking up where you left off: a round in progress and/or earlier mistakes.
  function continueNotice(resume) {
    const n = missedNow().length;
    if (!resume && !n) return null;
    const what = n === 1 ? 'ett spørsmål' : `${n} spørsmål`;
    return h('section', { class: 'notice notice-continue', 'aria-labelledby': 'continue-title' },
      h('h2', { id: 'continue-title' }, 'Fortsett der du slapp'), // a section of its own, above the mode switch
      resume ? h('div', { class: 'continue-row continue-resume' },
        h('p', {}, `Du har en påbegynt runde (spørsmål ${resume.index + 1} av ${resume.items.length}).`),
        h('div', { class: 'continue-actions' },
          h('button', { type: 'button', class: 'btn', 'data-action': 'resume' }, 'Fortsett runden'),
          h('button', { type: 'button', class: 'btn-link', 'data-action': 'discard' }, 'Forkast den'))) : null,
      n ? h('div', { class: 'continue-row continue-missed' },
        h('p', {}, `Du har svart feil på ${what} som du ikke har fått riktig senere.`),
        h('p', { class: 'hint' }, `Et spørsmål forsvinner fra lista når du svarer riktig på det.${n > MISSED_ROUND ? ` En runde tar ${MISSED_ROUND} av dem om gangen.` : ''}`),
        h('div', { class: 'continue-actions' },
          h('button', { type: 'button', class: 'btn', 'data-action': 'practice-missed' }, 'Øv på de du bommet på'),
          h('button', { type: 'button', class: 'btn-link', 'data-action': 'clear-missed' }, 'Tøm lista'))) : null);
  }

  // ---------------------------------------------------------------- setup
  function selectionPool() {
    return pool(bank, {
      chapters: [...state.selection.chapters],
      difficulties: [...state.selection.difficulties],
      styles: [...state.selection.styles],
    });
  }

  function distinct(key) {
    return [...new Set(bank.questions.map((q) => q[key]))];
  }

  function filterFieldset(key, labels, title, selected) {
    const values = distinct(key);
    if (values.length < 2) return null;
    return h('fieldset', { class: 'filter' },
      h('legend', {}, title),
      h('div', { class: 'actions actions-compact' },
        h('button', { type: 'button', class: 'btn-small', 'data-action': 'filter-all', 'data-filter': key }, 'Velg alle'),
        h('button', { type: 'button', class: 'btn-small', 'data-action': 'filter-none', 'data-filter': key }, 'Fjern alle')),
      h('ul', { class: 'check-list check-inline' }, Object.keys(labels).filter((v) => values.includes(v)).map((v) =>
        h('li', {}, h('input', { type: 'checkbox', id: `${key}-${v}`, name: key, value: v, checked: selected.has(v), 'data-filter': key }),
          h('label', { for: `${key}-${v}` }, labels[v])))));
  }

  // One row per chapter: the number in its own column (it matches the dial), the title
  // beside it and the status on a short line underneath, so a long title only wraps
  // inside its own column. Runs of upcoming chapters (no content yet) collapse into one row.
  function chapterRows() {
    const rows = [];
    const solved = solvedByChapter(state.solved, bank);
    const cs = bank.chapters;
    const name = (c) => [
      h('span', { class: 'ch-num' }, h('span', { class: 'visually-hidden' }, 'Kapittel '), String(c.number)),
      h('span', { class: 'ch-title' }, c.title || `Kapittel ${c.number}`)];
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.status === 'upcoming') {
        let j = i;
        while (j + 1 < cs.length && cs[j + 1].status === 'upcoming') j += 1;
        const label = j > i ? `${c.number}–${cs[j].number}` : String(c.number);
        rows.push(h('li', { class: 'ch-row is-unavailable is-upcoming' },
          h('span', { class: 'ch-name' },
            h('span', { class: 'ch-num' }, h('span', { class: 'visually-hidden' }, j > i ? 'Kapitlene ' : 'Kapittel '), label),
            h('span', { class: 'ch-title' }, 'Kommer senere')),
          h('span', { class: 'ch-status' }, 'ingen spørsmål ennå')));
        i = j;
        continue;
      }
      const ok = c.status === 'available';
      const done = solved[c.number] || 0;
      const status = !ok ? 'ingen godkjente spørsmål ennå'
        : done === 0 ? `${c.questions} spørsmål`
          : done >= c.questions ? `alle ${c.questions} riktig besvart` : `${done} av ${c.questions} riktig besvart`;
      rows.push(ok
        ? h('li', { class: 'ch-row' },
          h('input', { type: 'checkbox', id: `ch-${c.number}`, name: 'chapter', value: String(c.number), checked: state.selection.chapters.has(c.number), 'aria-describedby': `ch-${c.number}-st` }),
          h('label', { for: `ch-${c.number}`, class: 'ch-name' }, name(c)),
          h('span', { class: 'ch-status', id: `ch-${c.number}-st` }, status))
        : h('li', { class: 'ch-row is-unavailable' },
          h('span', { class: 'ch-name' }, name(c)),
          h('span', { class: 'ch-status', id: `ch-${c.number}-st` }, status)));
    }
    return rows;
  }

  // Why the selection has no questions, naming the empty choice if there is one.
  function emptyReason() {
    if (state.selection.chapters.size === 0) return 'Velg minst ett kapittel.';
    if (distinct('difficulty').length > 1 && state.selection.difficulties.size === 0) return 'Velg minst én vanskelighetsgrad.';
    if (distinct('style').length > 1 && state.selection.styles.size === 0) return 'Velg minst én spørsmålstype.';
    return null;
  }

  function renderSetup(focus = 'h2') {
    fitDial();
    const avail = selectionPool().length;
    const anyAvailable = bank.chapters.some((c) => c.status === 'available');
    const counts = COUNT_CHOICES.filter((n) => n < avail);
    if (avail > 0) counts.push(avail);
    if (!counts.includes(state.selection.count)) state.selection.count = counts.includes(10) ? 10 : counts[counts.length - 1];
    const resume = state.resumable && !state.resumable.finished ? state.resumable : null;
    const exam = state.mode === 'exam';
    const view = h('div', { class: 'setup' },
      state.linkNotice ? h('div', { class: 'notice notice-error link-notice', role: 'alert', tabindex: '-1' }, h('p', {}, state.linkNotice)) : null,
      continueNotice(resume),
      !anyAvailable ? h('div', { class: 'notice notice-empty', role: 'status' },
        h('p', {}, 'Det er ikke publisert noen godkjente spørsmål ennå. Kom tilbake senere.')) : null,
      modeSwitch(),
      exam ? examSection(resume) : practiceSection(avail, anyAvailable, counts, resume));
    mount(view, focus);
    if (!exam) watchStart();
  }

  // Practice or practice exam, chosen first; only the chosen mode's setup is shown.
  // Native radio buttons, so keyboard and screen readers work as for any radio group.
  function modeSwitch() {
    const opt = (value, text) => [
      h('input', { type: 'radio', name: 'mode', id: `mode-${value}`, value, checked: state.mode === value }),
      h('label', { for: `mode-${value}` }, text),
    ];
    return h('div', { class: 'mode-switch', role: 'radiogroup', 'aria-label': 'Velg øvingsform' },
      opt('practice', 'Øv på kapitler'), opt('exam', 'Prøveeksamen'));
  }

  function practiceSection(avail, anyAvailable, counts, resume) {
    return h('section', { class: 'practice', 'aria-labelledby': 'setup-title' },
      h('h2', { id: 'setup-title', tabindex: '-1' }, 'Øvingsrunde'),
      h('p', { class: 'lead' }, 'Velg kapitlene du vil øve på og hvor mange spørsmål du vil ha. Etter hvert svar får du vite om det var riktig, hvorfor, og hvor i læreboka du kan lese mer.'),
      h('div', { class: 'dial-wrap' }, chapterDial(bank.chapters, state.selection.chapters)),
      h('form', { id: 'setup-form', novalidate: true },
        h('fieldset', { class: 'chapters' },
          h('legend', {}, 'Kapitler'),
          h('div', { class: 'actions actions-compact' },
            h('button', { type: 'button', class: 'btn-small', 'data-action': 'select-all', disabled: !anyAvailable }, 'Velg alle'),
            h('button', { type: 'button', class: 'btn-small', 'data-action': 'select-none', disabled: !anyAvailable }, 'Fjern alle')),
          h('ul', { class: 'check-list' }, chapterRows()),
          progressNote()),
        filterFieldset('difficulty', DIFFICULTY_LABEL, 'Vanskelighetsgrad', state.selection.difficulties),
        filterFieldset('style', STYLE_LABEL, 'Spørsmålstyper', state.selection.styles),
        h('div', { class: 'count-row' },
          h('label', { for: 'count' }, 'Antall spørsmål'),
          h('select', { id: 'count', name: 'count', disabled: avail === 0 }, counts.map((n) =>
            h('option', { value: String(n), selected: n === state.selection.count }, n === avail && !COUNT_CHOICES.includes(n) ? `Alle (${n})` : String(n))))),
        h('p', { class: 'avail', id: 'avail', role: 'status' },
          avail === 0
            ? (emptyReason() || 'Det finnes ingen spørsmål for dette valget.')
            : `${avail} spørsmål er tilgjengelige i valget ditt.`),
        state.message ? h('p', { class: 'error', role: 'alert' }, state.message) : null,
        h('button', { type: 'submit', class: 'btn btn-primary', disabled: avail === 0 }, resume ? 'Start ny runde' : 'Start')),
      startBar(avail, resume));
  }

  // A bar fixed to the bottom of the screen while the form's Start button is further
  // down, so a round can be started right after choosing chapters. It waits until the
  // "Fortsett der du slapp" box is out of view, so continuing and starting anew are
  // never offered side by side. It is a shortcut for pointer and touch: hidden from
  // assistive technology and left out of the tab order, where the form and its own
  // Start button work as before.
  function startBar(avail, resume) {
    const k = [...state.selection.chapters].filter((n) => chapterOf(n) && chapterOf(n).status === 'available').length;
    const text = avail === 0
      ? [emptyReason() || 'Ingen spørsmål for dette valget.']
      : [h('strong', {}, `${resume ? 'Ny runde:' : 'Runde på'} ${state.selection.count} spørsmål`),
        h('span', { class: 'start-bar-sub' }, ` av ${avail} i ${k} ${k === 1 ? 'kapittel' : 'kapitler'}`)];
    return h('div', { class: 'start-bar', 'aria-hidden': 'true', hidden: true },
      h('div', { class: 'start-bar-inner' },
        h('span', { class: 'start-bar-text' }, text),
        h('button', { type: 'button', class: 'btn btn-primary', tabindex: '-1', 'data-action': 'start-bar', disabled: avail === 0 }, resume ? 'Start ny runde' : 'Start')));
  }

  let startObserver = null;
  function watchStart() {
    const bar = root.querySelector('.start-bar');
    const btn = root.querySelector('#setup-form button[type=submit]');
    const box = root.querySelector('.notice-continue');
    if (!bar || !btn || typeof globalThis.IntersectionObserver !== 'function') return;
    // shown only while the real button is below the visible part of the page and the
    // continue box is not in view
    let startBelow = false;
    let boxInView = Boolean(box);
    startObserver = new globalThis.IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === btn) startBelow = !e.isIntersecting && e.boundingClientRect.top > 0;
        if (e.target === box) boxInView = e.isIntersecting;
      }
      bar.hidden = !startBelow || boxInView;
    });
    startObserver.observe(btn);
    if (box) startObserver.observe(box);
  }

  // ------------------------------------------------------------- question
  function marksOf(session) {
    return session.items.map((it, i) => {
      if (!it.answer) return null;
      if (!feedbackVisible(session, i)) return 'answered';
      return it.answer.correct ? 'correct' : 'wrong';
    });
  }

  function refText(q) {
    const r = q.ref;
    const parts = [chapterName(r.chapter)];
    if (r.section && bank.sections[r.section]) parts.push(`avsnittet «${bank.sections[r.section].title}»`);
    if (r.pages.length) {
      parts.push(r.pages.length === 1 ? `side ${r.pages[0]}` : `sidene ${r.pages.slice(0, -1).join(', ')} og ${r.pages[r.pages.length - 1]}`);
    }
    const book = bank.book && bank.book.title ? ` i læreboka «${bank.book.title}»` : ' i læreboka';
    return `${parts.join(', ')}${book}.`;
  }

  // Question id with a link that opens it, and (if configured) a pre-filled GitHub
  // issue; id + revision identify the question exactly.
  function questionLinks(q) {
    const issues = bank.site && bank.site.issues_url;
    let report = null;
    if (issues) {
      // the "Feil i et spørsmål" issue form (.github/ISSUE_TEMPLATE/sporsmal.yml), pre-filled
      const fields = {
        template: 'sporsmal.yml',
        title: `[${q.id} v${q.rev}] `,
        sporsmal: `${q.id} (versjon ${q.rev})`,
        kapittel: String(q.chapter),
        lenke: questionUrl(q.id),
        tekst: plainText(q.stem),
      };
      const href = `${issues}/new?${Object.entries(fields).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
      report = h('p', {},
        h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, 'Fant du en feil? Rapporter den på GitHub'),
        h('span', { class: 'visually-hidden' }, ' (åpnes i ny fane)'));
    }
    return h('div', { class: 'report' },
      h('p', {},
        h('span', { class: 'qid' }, `Spørsmål ${q.id}, versjon ${q.rev}. `),
        h('button', { type: 'button', class: 'btn-link', 'data-action': 'copy-link', 'data-qid': q.id },
          'Kopier lenke', h('span', { class: 'visually-hidden' }, ` til spørsmål ${q.id}`)),
        h('span', { class: 'copy-status', role: 'status' })),
      report);
  }

  async function copyLink(btn) {
    const url = questionUrl(btn.dataset.qid);
    const status = btn.parentElement.querySelector('.copy-status');
    try {
      await globalThis.navigator.clipboard.writeText(url);
      status.textContent = ' Lenken er kopiert.';
    } catch {
      status.replaceChildren(toDOM(h('span', {}, ' Lenke: ', h('a', { href: `#${btn.dataset.qid}` }, url))));
    }
  }

  function richOpts(q, answered) {
    return { glossary: bank.glossary, plainTerms: answered ? null : new Set(q.glossary_after_answer || []) };
  }

  function optionView(q, it, optId, idx, answered) {
    const opt = q.options.find((o) => o.id === optId);
    const isCorrect = q.correct.includes(optId);
    const chosen = it.answer && it.answer.option === optId;
    let mark = null;
    let cls = 'opt';
    if (answered) {
      if (isCorrect) {
        cls += ' is-correct';
        mark = h('span', { class: 'opt-mark mark-correct' }, h('span', { 'aria-hidden': 'true' }, '✓ '), chosen ? 'Ditt svar – riktig' : 'Riktig svar');
      } else if (chosen) {
        cls += ' is-wrong';
        mark = h('span', { class: 'opt-mark mark-wrong' }, h('span', { 'aria-hidden': 'true' }, '✗ '), 'Ditt svar – feil');
      } else cls += ' is-other';
    }
    const id = `opt-${optId}`;
    return h('div', { class: cls },
      h('input', { type: 'radio', name: 'answer', id, value: optId, disabled: answered, checked: answered ? chosen : state.choice === optId }),
      h('label', { for: id },
        h('span', { class: 'opt-letter', 'aria-hidden': 'true' }, LETTERS[idx]),
        h('span', { class: 'visually-hidden' }, `Alternativ ${LETTERS[idx]}: `),
        h('span', { class: 'opt-text' }, renderInlines(opt.content, richOpts(q, answered))),
        mark));
  }

  function feedbackView(q, it, last) {
    const ok = it.answer.correct;
    const correctId = q.correct[0];
    const letterOf = (id) => LETTERS[it.order.indexOf(id)];
    const optText = (id) => renderInlines(q.options.find((o) => o.id === id).content, richOpts(q, true));
    const chosen = q.options.find((o) => o.id === it.answer.option);
    const correctOpt = q.options.find((o) => o.id === correctId);
    const others = it.order.filter((id) => id !== correctId && id !== it.answer.option);
    const opts = richOpts(q, true);
    return h('section', { class: `feedback ${ok ? 'feedback-correct' : 'feedback-wrong'}`, 'aria-labelledby': 'fb-title' },
      h('h3', { id: 'fb-title', tabindex: '-1' }, h('span', { 'aria-hidden': 'true', class: 'fb-icon' }, ok ? '✓' : '✗'), ok ? ' Riktig!' : ' Ikke riktig'),
      h('p', { class: 'fb-answer' }, h('strong', {}, `Riktig svar: ${letterOf(correctId)} – `), optText(correctId)),
      !ok ? h('div', { class: 'fb-block' },
        h('h4', {}, `Hvorfor ${letterOf(chosen.id)} er feil`),
        renderRich(chosen.feedback, opts)) : null,
      h('div', { class: 'fb-block' }, h('h4', {}, 'Forklaring'), renderRich(q.explanation, opts),
        correctOpt.feedback && correctOpt.feedback.length ? renderRich(correctOpt.feedback, opts) : null),
      others.length ? h('details', { class: 'fb-others' },
        h('summary', {}, 'Om de andre alternativene'),
        h('ul', {}, others.map((id) => h('li', {},
          h('strong', {}, `${letterOf(id)}: `), optText(id),
          renderRich(q.options.find((o) => o.id === id).feedback, opts))))) : null,
      h('p', { class: 'ref' }, h('span', { 'aria-hidden': 'true' }, '📖 '), h('strong', {}, 'Les mer: '), refText(q)),
      questionLinks(q),
      h('div', { class: 'actions' },
        isSingle()
          ? h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'leave' }, 'Øv på flere spørsmål')
          : h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'next' }, last ? 'Se resultatet' : 'Neste spørsmål')));
  }

  function renderQuestion(focus) {
    fitDial();
    const s = state.session;
    const it = currentItem(s);
    const q = byId.get(it.qid);
    const exam = isExam();
    const answered = Boolean(it.answer) && !exam; // an exam never shows feedback before the end
    const total = s.items.length;
    const last = s.index + 1 === total;
    const visual = q.visual ? renderVisual(q.visual, bank.templates, { phase: answered ? 'after' : 'before' }) : null;
    const opts = richOpts(q, answered);
    const view = h('section', { class: 'question', 'aria-labelledby': 'q-progress' },
      h('div', { class: 'q-head' },
        h('h2', { id: 'q-progress', class: 'q-progress', tabindex: '-1' },
          isSingle() ? `Spørsmål ${q.id}` : `Spørsmål ${s.index + 1} av ${total}`),
        isSingle() ? null : h('div', { class: 'dial-wrap' }, roundDial(marksOf(s), s.index, { compact: narrow() })),
        h('p', { class: 'q-meta' },
          s.kind === 'missed' ? h('span', { class: 'tag' }, 'Feil fra før') : null,
          exam ? h('span', { class: 'tag' }, 'Prøveeksamen') : null,
          h('span', { class: 'q-chapter' }, `Kapittel ${q.chapter}`,
            chapterOf(q.chapter) && chapterOf(q.chapter).title ? h('span', { class: 'q-chapter-title' }, ` – ${chapterOf(q.chapter).title}`) : null),
          q.topics.filter((t) => bank.topics[t]).map((t) => h('span', { class: 'q-topic' }, bank.topics[t].title)),
          q.priority === 'exam_important' ? h('span', { class: 'badge', title: 'Markert med ! i læreboka: forvent dette til eksamen' }, '! Eksamensrelevant') : null,
          bank.mode === 'preview' ? h('span', { class: 'badge badge-preview' }, `Status: ${q.preview_status}`) : null),
        isSingle()
          ? h('button', { type: 'button', class: 'btn-small btn-quit', 'data-action': 'leave' }, 'Til forsiden')
          : h('button', { type: 'button', class: 'btn-small btn-quit', 'data-action': 'quit' }, exam ? 'Avslutt prøven' : 'Avslutt runden')),
      q.context && q.context.length ? h('div', { class: 'q-context' }, renderRich(q.context, opts)) : null,
      visual ? visual.node : null,
      h('form', { id: 'answer-form', class: 'answer-form', novalidate: true },
        h('fieldset', { 'aria-labelledby': 'q-stem' },
          h('div', { class: 'q-stem', id: 'q-stem' }, renderRich(q.stem, opts)),
          h('div', { class: 'opts' }, it.order.map((id, i) => optionView(q, it, id, i, answered)))),
        !answered ? h('div', { class: 'actions' },
          h('button', { type: 'submit', class: 'btn btn-primary', disabled: !state.choice },
            exam ? (last ? 'Svar og se resultatet' : 'Svar og gå videre') : 'Svar'),
          exam ? h('button', { type: 'button', class: 'btn-link', 'data-action': 'skip' }, last ? 'Hopp over og se resultatet' : 'Hopp over') : null,
          !state.choice ? h('span', { class: 'hint', id: 'choose-hint' }, 'Velg et alternativ først.') : null) : null),
      h('div', { class: 'fb-live', 'aria-live': 'polite' }, answered ? feedbackView(q, it, last) : null));
    mount(view, focus || (answered ? '#fb-title' : '#q-progress'));
  }

  // -------------------------------------------------------------- results
  function resultActions() {
    if (state.session.kind === 'exam') {
      return [
        h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'start-exam' }, 'Ny prøveeksamen'),
        h('button', { type: 'button', class: 'btn btn-secondary', 'data-action': 'new' }, 'Til forsiden'),
      ];
    }
    if (state.session.kind === 'missed') {
      const left = missedNow().length;
      return [
        left ? h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'practice-missed' }, `Øv videre på feilene (${left} igjen)`) : null,
        h('button', { type: 'button', class: left ? 'btn btn-secondary' : 'btn btn-primary', 'data-action': 'new' }, 'Til forsiden'),
      ];
    }
    return [
      h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'restart-same' }, 'Ny runde med samme valg'),
      h('button', { type: 'button', class: 'btn btn-secondary', 'data-action': 'new' }, 'Velg andre kapitler'),
    ];
  }

  function examVerdict(sum) {
    const pass = examPassMark(sum.total);
    const ok = sum.correct >= pass;
    return h('div', { class: `exam-verdict ${ok ? 'is-pass' : 'is-fail'}` },
      h('p', { class: 'exam-verdict-title' }, h('span', { 'aria-hidden': 'true' }, ok ? '✓ ' : '✗ '), ok ? 'Bestått' : 'Ikke bestått'),
      h('p', {}, `Du trengte ${pass} riktige for å bestå${ok ? '' : `, og manglet ${pass - sum.correct}`}.`),
      sum.unanswered ? h('p', {}, `${sum.unanswered} spørsmål ble hoppet over og teller som feil.`) : null);
  }

  function renderResults() {
    fitDial();
    const sum = summary(state.session, byId);
    const pct = sum.total ? Math.round((100 * sum.correct) / sum.total) : 0;
    const items = sum.items.filter((x) => !state.onlyWrong || !x.correct);
    const view = h('section', { class: 'results', 'aria-labelledby': 'res-title' },
      h('h2', { id: 'res-title', tabindex: '-1' }, 'Resultat'),
      h('div', { class: 'dial-wrap' }, roundDial(marksOf(state.session), null)),
      h('p', { class: 'score' }, h('strong', {}, `${sum.correct} av ${sum.total}`), ` riktige (${pct} %)`),
      isExam() ? examVerdict(sum) : null,
      sum.byChapter.length > 1 ? h('table', { class: 'by-chapter' },
        h('caption', {}, 'Resultat per kapittel'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Kapittel'), h('th', { scope: 'col' }, 'Riktige'))),
        h('tbody', {}, sum.byChapter.map((r) => h('tr', {}, h('th', { scope: 'row' }, chapterName(r.chapter)), h('td', {}, `${r.correct} av ${r.total}`))))) : null,
      h('div', { class: 'actions' }, resultActions()),
      h('h3', {}, 'Gjennomgang'),
      sum.wrong > 0 ? h('div', { class: 'toggle' },
        h('input', { type: 'checkbox', id: 'only-wrong', checked: state.onlyWrong, 'data-action': 'only-wrong' }),
        h('label', { for: 'only-wrong' }, 'Vis bare spørsmål jeg svarte feil på')) : h('p', {}, 'Alle svarene dine var riktige. Godt jobbet!'),
      h('ol', { class: 'review' }, items.map((x) => {
        const q = x.question;
        const it = x.item;
        const letterOf = (id) => LETTERS[it.order.indexOf(id)];
        const opts = richOpts(q, true);
        const optText = (id) => renderInlines(q.options.find((o) => o.id === id).content, opts);
        const chosen = it.answer && q.options.find((o) => o.id === it.answer.option);
        return h('li', { value: String(x.index + 1) },
          h('details', { open: !x.correct },
            h('summary', {},
              h('span', { class: x.correct ? 'mark-correct' : 'mark-wrong' }, h('span', { 'aria-hidden': 'true' }, x.correct ? '✓ ' : '✗ '),
                x.correct ? 'Riktig: ' : x.item.answer ? 'Feil: ' : 'Ikke besvart: '),
              plainText(q.stem).slice(0, 140)),
            h('div', { class: 'review-body' },
              q.context && q.context.length ? renderRich(q.context, opts) : null,
              q.visual ? renderVisual(q.visual, bank.templates, { phase: 'after', idPrefix: `rv${x.index}` }).node : null,
              renderRich(q.stem, opts),
              h('p', {}, h('strong', {}, 'Ditt svar: '), chosen ? [`${letterOf(chosen.id)} – `, optText(chosen.id)] : 'ikke besvart'),
              h('p', {}, h('strong', {}, 'Riktig svar: '), `${letterOf(q.correct[0])} – `, optText(q.correct[0])),
              chosen && !x.correct ? h('div', { class: 'fb-block' }, h('h4', {}, 'Hvorfor svaret ditt er feil'), renderRich(chosen.feedback, opts)) : null,
              h('div', { class: 'fb-block' }, h('h4', {}, 'Forklaring'), renderRich(q.explanation, opts)),
              h('p', { class: 'ref' }, h('strong', {}, 'Les mer: '), refText(q)),
              questionLinks(q))));
      })));
    mount(view, '#res-title');
  }

  // Match the dial's drawing width to the text column before building a screen,
  // so its numbers are not scaled down on phones.
  function fitDial() {
    const w = root.clientWidth || (globalThis.innerWidth || 640);
    setDialWidth(Math.min(w, 672) - 32);
  }

  function render(focus) {
    if (!state.session) renderSetup(focus);
    else if (state.session.finished) renderResults();
    else renderQuestion(focus);
  }

  // --------------------------------------------------------------- events
  function start(opts) {
    const res = createSession(bank, { ...opts, seed: randomSeed() });
    if (!res.ok) {
      state.message = res.error === 'insufficient'
        ? `Det finnes bare ${res.available} spørsmål for dette valget. Velg færre spørsmål eller flere kapitler.`
        : 'Kunne ikke starte runden med dette valget.';
      renderSetup('.error');
      return;
    }
    state.message = '';
    state.linkNotice = '';
    clearHash();
    state.session = res.session;
    state.choice = null;
    state.onlyWrong = true;
    persist();
    render();
  }

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'setup-form') {
      start({
        chapters: [...state.selection.chapters].sort((a, b) => a - b),
        count: state.selection.count,
        difficulties: [...state.selection.difficulties],
        styles: [...state.selection.styles],
      });
    } else if (e.target.id === 'answer-form' && state.choice) {
      try {
        state.session = submitAnswer(state.session, byId, state.choice);
      } catch {
        return; // already answered: ignore repeated submissions
      }
      const it = currentItem(state.session);
      state.missed = recordAnswer(state.missed, it.qid, it.answer.correct);
      saveMissed(state.missed);
      const solved = recordSolved(state.solved, it.qid, it.answer.correct);
      if (solved !== state.solved) {
        state.solved = solved;
        saveSolved(solved);
      }
      state.choice = null;
      if (isExam()) {
        state.session = advance(state.session);
        persist();
        render('#q-progress');
        return;
      }
      persist();
      renderQuestion('#fb-title');
    }
  });

  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'chapter') {
      const n = Number(t.value);
      if (t.checked) state.selection.chapters.add(n);
      else state.selection.chapters.delete(n);
      state.message = '';
      renderSetup(`#${t.id}`);
    } else if (t.dataset && t.dataset.filter) {
      const set = t.dataset.filter === 'difficulty' ? state.selection.difficulties : state.selection.styles;
      if (t.checked) set.add(t.value);
      else set.delete(t.value);
      renderSetup(`#${t.id}`);
    } else if (t.name === 'mode') {
      state.mode = t.value === 'exam' ? 'exam' : 'practice';
      saveMode(state.mode);
      renderSetup(`#mode-${state.mode}`);
    } else if (t.id === 'count') {
      state.selection.count = Number(t.value);
      renderSetup('#count');
    } else if (t.name === 'answer' && state.session && !currentItem(state.session).answer) {
      state.choice = t.value;
      const btn = root.querySelector('#answer-form button[type=submit]');
      if (btn) btn.disabled = false;
      const hint = root.querySelector('#choose-hint');
      if (hint) hint.remove();
    } else if (t.id === 'only-wrong') {
      state.onlyWrong = t.checked;
      renderResults();
      root.querySelector('#only-wrong')?.focus();
    }
  });

  root.addEventListener('click', (e) => {
    const el = e.target instanceof Element ? e.target.closest('[data-action], .fig-anim-toggle') : null;
    if (!el) return;
    if (el.classList.contains('fig-anim-toggle')) {
      const fig = root.querySelector(`#${el.dataset.fig}`);
      const playing = fig.classList.toggle('is-playing');
      el.setAttribute('aria-pressed', String(playing));
      el.textContent = playing ? 'Stopp animasjon' : 'Spill av animasjon';
      fitFigures(root); // the still and the animated drawing can differ in size
      return;
    }
    switch (el.dataset.action) {
      case 'copy-link':
        copyLink(el);
        break;
      case 'leave':
        toSetup();
        break;
      case 'practice-missed':
        if (state.session) {
          state.session = null;
          clearSession();
        }
        startMissed();
        break;
      case 'clear-solved':
        if (globalThis.confirm('Vil du nullstille fremgangen? Lista over spørsmål du har svart feil på beholdes.')) {
          state.solved = {};
          clearSolved();
          renderSetup('#setup-title');
        }
        break;
      case 'clear-missed':
        if (globalThis.confirm('Vil du tømme lista over spørsmål du har svart feil på?')) {
          state.missed = {};
          clearMissed();
          renderSetup();
        }
        break;
      case 'start-bar':
        root.querySelector('#setup-form button[type=submit]').click();
        break;
      case 'select-all':
        bank.chapters.filter((c) => c.status === 'available').forEach((c) => state.selection.chapters.add(c.number));
        renderSetup('[data-action=select-all]');
        break;
      case 'select-none':
        state.selection.chapters.clear();
        renderSetup('[data-action=select-none]');
        break;
      case 'filter-all':
      case 'filter-none': {
        const key = el.dataset.filter;
        const set = key === 'difficulty' ? state.selection.difficulties : state.selection.styles;
        set.clear();
        if (el.dataset.action === 'filter-all') distinct(key).forEach((v) => set.add(v));
        renderSetup(`[data-action=${el.dataset.action}][data-filter=${key}]`);
        break;
      }
      case 'resume':
        state.session = state.resumable;
        state.resumable = null;
        render();
        break;
      case 'discard':
        state.resumable = null;
        clearSession();
        renderSetup();
        break;
      case 'next':
        state.session = advance(state.session);
        persist();
        render();
        break;
      case 'start-exam':
        startExam();
        break;
      case 'skip':
        state.choice = null;
        state.session = advance(state.session);
        persist();
        render('#q-progress');
        break;
      case 'quit':
        if (globalThis.confirm(isExam() ? 'Vil du avslutte prøveeksamenen? Du kan ikke fortsette den senere.' : 'Vil du avslutte runden? Du kan ikke fortsette den senere.')) {
          state.session = null;
          clearSession();
          renderSetup();
        }
        break;
      case 'restart-same': {
        const s = state.session;
        state.session = null;
        clearSession();
        start({ chapters: s.chapters, count: Math.min(s.count, pool(bank, s).length), difficulties: s.difficulties, styles: s.styles });
        break;
      }
      case 'new':
        state.session = null;
        clearSession();
        renderSetup();
        break;
      default:
    }
  });

  // A link to one question (#q-0045) opens it, also when pasted into an open tab.
  globalThis.addEventListener?.('hashchange', () => {
    const id = linkedId();
    if (id) openLinked(id, '#q-progress');
    else if (isSingle()) toSetup();
  });

  // Figures that become wider than the screen (rotation, resizing) get their hint.
  let resizeTimer = null;
  globalThis.addEventListener?.('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => fitFigures(root), 150);
  });

  const first = linkedId();
  if (first) openLinked(first, null); // no focus move on first load
  else render(null);
  return { state };
}
