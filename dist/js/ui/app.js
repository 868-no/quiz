// The quiz application: setup → questions with immediate feedback → results.
// All content is rendered through vnodes (no innerHTML). State changes go through
// the pure engine in ../quiz/engine.js.

import { h, toDOM } from '../render/vnode.js';
import { plainText, renderInlines, renderRich } from '../render/richtext.js';
import { renderVisual } from '../visuals/registry.js';
import {
  advance, createSession, currentItem, indexBank, pool, restoreSession, submitAnswer, summary,
} from '../quiz/engine.js';
import { randomSeed } from '../quiz/rng.js';
import { clearSession, loadSession, saveSession } from '../quiz/storage.js';
import { createGlossary } from './glossary.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const DIFFICULTY_LABEL = { easy: 'Lett', medium: 'Middels', hard: 'Vanskelig' };
const STYLE_LABEL = { recall: 'Faktakunnskap', concept: 'Forståelse', scenario: 'Praktiske situasjoner', calculation: 'Regneoppgaver' };
const COUNT_CHOICES = [5, 10, 20, 30, 50];

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
      difficulties: new Set(),
      styles: new Set(),
    },
    resumable: restoreSession(loadSession(), bank),
    message: '',
  };

  const chapterOf = (n) => bank.chapters.find((c) => c.number === n);
  const chapterName = (n) => {
    const c = chapterOf(n);
    return c && c.title ? `Kapittel ${n} – ${c.title}` : `Kapittel ${n}`;
  };

  function mount(vnode, focusSelector) {
    glossaryUi.close();
    root.replaceChildren(toDOM(vnode));
    if (reducedMotion()) root.querySelectorAll('.fig-anim-toggle').forEach((b) => b.remove());
    const target = focusSelector && root.querySelector(focusSelector);
    if (target) target.focus({ preventScroll: false });
  }

  function persist() {
    if (state.session) saveSession(state.session);
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
      h('p', { class: 'hint' }, 'Ingen valgt betyr alle.'),
      h('ul', { class: 'check-list check-inline' }, Object.keys(labels).filter((v) => values.includes(v)).map((v) =>
        h('li', {}, h('input', { type: 'checkbox', id: `${key}-${v}`, name: key, value: v, checked: selected.has(v), 'data-filter': key }),
          h('label', { for: `${key}-${v}` }, labels[v])))));
  }

  function renderSetup(focus = 'h2') {
    const avail = selectionPool().length;
    const anyAvailable = bank.chapters.some((c) => c.status === 'available');
    const counts = COUNT_CHOICES.filter((n) => n < avail);
    if (avail > 0) counts.push(avail);
    if (!counts.includes(state.selection.count)) state.selection.count = counts.includes(10) ? 10 : counts[counts.length - 1];
    const resume = state.resumable && !state.resumable.finished ? state.resumable : null;
    const view = h('section', { class: 'setup', 'aria-labelledby': 'setup-title' },
      h('h2', { id: 'setup-title', tabindex: '-1' }, 'Sett opp en øvingsrunde'),
      h('p', { class: 'lead' }, 'Velg kapitlene du vil øve på og hvor mange spørsmål du vil ha. Etter hvert svar får du vite om det var riktig, hvorfor, og hvor i læreboka du kan lese mer.'),
      resume ? h('div', { class: 'notice', role: 'status' },
        h('p', {}, `Du har en påbegynt runde (spørsmål ${resume.index + 1} av ${resume.items.length}).`),
        h('div', { class: 'actions' },
          h('button', { type: 'button', class: 'btn', 'data-action': 'resume' }, 'Fortsett runden'),
          h('button', { type: 'button', class: 'btn btn-secondary', 'data-action': 'discard' }, 'Forkast den'))) : null,
      !anyAvailable ? h('div', { class: 'notice notice-empty', role: 'status' },
        h('p', {}, 'Det er ikke publisert noen godkjente spørsmål ennå. Kom tilbake senere.')) : null,
      h('form', { id: 'setup-form', novalidate: true },
        h('fieldset', { class: 'chapters' },
          h('legend', {}, 'Kapitler'),
          h('div', { class: 'actions actions-compact' },
            h('button', { type: 'button', class: 'btn-small', 'data-action': 'select-all', disabled: !anyAvailable }, 'Velg alle'),
            h('button', { type: 'button', class: 'btn-small', 'data-action': 'select-none', disabled: !anyAvailable }, 'Fjern alle')),
          h('ul', { class: 'check-list' }, bank.chapters.map((c) => {
            const ok = c.status === 'available';
            const status = ok ? `${c.questions} spørsmål`
              : c.status === 'no_questions' ? 'ingen godkjente spørsmål ennå' : 'ikke tilgjengelig ennå';
            return h('li', { class: ok ? '' : 'is-unavailable' },
              h('input', { type: 'checkbox', id: `ch-${c.number}`, name: 'chapter', value: String(c.number), checked: ok && state.selection.chapters.has(c.number), disabled: !ok, 'aria-describedby': `ch-${c.number}-st` }),
              h('label', { for: `ch-${c.number}` }, chapterName(c.number)),
              h('span', { class: 'ch-status', id: `ch-${c.number}-st` }, ` (${status})`));
          }))),
        filterFieldset('difficulty', DIFFICULTY_LABEL, 'Vanskelighetsgrad', state.selection.difficulties),
        filterFieldset('style', STYLE_LABEL, 'Spørsmålstyper', state.selection.styles),
        h('div', { class: 'count-row' },
          h('label', { for: 'count' }, 'Antall spørsmål'),
          h('select', { id: 'count', name: 'count', disabled: avail === 0 }, counts.map((n) =>
            h('option', { value: String(n), selected: n === state.selection.count }, n === avail && !COUNT_CHOICES.includes(n) ? `Alle (${n})` : String(n))))),
        h('p', { class: 'avail', id: 'avail', role: 'status' },
          avail === 0
            ? (state.selection.chapters.size === 0 ? 'Velg minst ett kapittel.' : 'Det finnes ingen spørsmål for dette valget.')
            : `${avail} spørsmål er tilgjengelige i valget ditt.`),
        state.message ? h('p', { class: 'error', role: 'alert' }, state.message) : null,
        h('button', { type: 'submit', class: 'btn btn-primary', disabled: avail === 0 }, 'Start')));
    mount(view, focus);
  }

  // ------------------------------------------------------------- question
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

  // Pre-filled GitHub issue for a question (id + revision identify it exactly).
  function reportLink(q) {
    const issues = bank.site && bank.site.issues_url;
    if (!issues) return null;
    const title = `[${q.id} v${q.rev}] `;
    const body = [
      `Spørsmål: ${q.id} (versjon ${q.rev}), kapittel ${q.chapter}`,
      `> ${plainText(q.stem).replace(/\n/g, ' ')}`,
      '',
      '**Hva er feil eller uklart?**',
      '',
      '',
      '**Forslag til retting:**',
      '',
      '',
      '**Sidehenvisning i boka (hvis du har den):**',
      '',
    ].join('\n');
    const href = `${issues}/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    return h('p', { class: 'report' },
      h('span', { class: 'qid' }, `Spørsmål ${q.id}, versjon ${q.rev}. `),
      h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, 'Fant du en feil? Rapporter den på GitHub'),
      h('span', { class: 'visually-hidden' }, ' (åpnes i ny fane)'));
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
      reportLink(q),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'next' }, last ? 'Se resultatet' : 'Neste spørsmål')));
  }

  function renderQuestion(focus) {
    const s = state.session;
    const it = currentItem(s);
    const q = byId.get(it.qid);
    const answered = Boolean(it.answer);
    const total = s.items.length;
    const visual = q.visual ? renderVisual(q.visual, bank.templates, { phase: answered ? 'after' : 'before' }) : null;
    const opts = richOpts(q, answered);
    const view = h('section', { class: 'question', 'aria-labelledby': 'q-progress' },
      h('div', { class: 'q-head' },
        h('h2', { id: 'q-progress', class: 'q-progress', tabindex: '-1' }, `Spørsmål ${s.index + 1} av ${total}`),
        h('progress', { max: String(total), value: String(s.index + (answered ? 1 : 0)), 'aria-hidden': 'true' }),
        h('p', { class: 'q-meta' }, h('span', {}, [chapterName(q.chapter),
          ...q.topics.filter((t) => bank.topics[t]).map((t) => ` · ${bank.topics[t].title}`)].join('')),
          q.priority === 'exam_important' ? h('span', { class: 'badge', title: 'Markert med ! i læreboka: forvent dette til eksamen' }, '! Eksamensrelevant') : null,
          bank.mode === 'preview' ? h('span', { class: 'badge badge-preview' }, `Status: ${q.preview_status}`) : null),
        h('button', { type: 'button', class: 'btn-small btn-quit', 'data-action': 'quit' }, 'Avslutt runden')),
      q.context && q.context.length ? h('div', { class: 'q-context' }, renderRich(q.context, opts)) : null,
      visual ? visual.node : null,
      h('form', { id: 'answer-form', class: 'answer-form', novalidate: true },
        h('fieldset', { 'aria-labelledby': 'q-stem' },
          h('div', { class: 'q-stem', id: 'q-stem' }, renderRich(q.stem, opts)),
          h('div', { class: 'opts' }, it.order.map((id, i) => optionView(q, it, id, i, answered)))),
        !answered ? h('div', { class: 'actions' },
          h('button', { type: 'submit', class: 'btn btn-primary', disabled: !state.choice }, 'Svar'),
          !state.choice ? h('span', { class: 'hint', id: 'choose-hint' }, 'Velg et alternativ først.') : null) : null),
      h('div', { class: 'fb-live', 'aria-live': 'polite' }, answered ? feedbackView(q, it, s.index + 1 === total) : null));
    mount(view, focus || (answered ? '#fb-title' : '#q-progress'));
  }

  // -------------------------------------------------------------- results
  function renderResults() {
    const sum = summary(state.session, byId);
    const pct = sum.total ? Math.round((100 * sum.correct) / sum.total) : 0;
    const items = sum.items.filter((x) => !state.onlyWrong || !x.correct);
    const view = h('section', { class: 'results', 'aria-labelledby': 'res-title' },
      h('h2', { id: 'res-title', tabindex: '-1' }, 'Resultat'),
      h('p', { class: 'score' }, h('strong', {}, `${sum.correct} av ${sum.total}`), ` riktige (${pct} %)`),
      sum.byChapter.length > 1 ? h('table', { class: 'by-chapter' },
        h('caption', {}, 'Resultat per kapittel'),
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Kapittel'), h('th', { scope: 'col' }, 'Riktige'))),
        h('tbody', {}, sum.byChapter.map((r) => h('tr', {}, h('th', { scope: 'row' }, chapterName(r.chapter)), h('td', {}, `${r.correct} av ${r.total}`))))) : null,
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn btn-primary', 'data-action': 'restart-same' }, 'Ny runde med samme valg'),
        h('button', { type: 'button', class: 'btn btn-secondary', 'data-action': 'new' }, 'Velg andre kapitler')),
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
              h('span', { class: x.correct ? 'mark-correct' : 'mark-wrong' }, h('span', { 'aria-hidden': 'true' }, x.correct ? '✓ ' : '✗ '), x.correct ? 'Riktig: ' : 'Feil: '),
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
              reportLink(q))));
      })));
    mount(view, '#res-title');
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
      state.choice = null;
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
      return;
    }
    switch (el.dataset.action) {
      case 'select-all':
        bank.chapters.filter((c) => c.status === 'available').forEach((c) => state.selection.chapters.add(c.number));
        renderSetup('[data-action=select-all]');
        break;
      case 'select-none':
        state.selection.chapters.clear();
        renderSetup('[data-action=select-none]');
        break;
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
      case 'quit':
        if (globalThis.confirm('Vil du avslutte runden? Svarene dine så langt blir ikke lagret.')) {
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

  render(null); // no focus move on first load
  return { state };
}
