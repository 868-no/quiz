// Quiz engine: pure functions over the public bank and a serialisable session.
// No DOM access here, so everything is unit-tested in tests/js.

import { makeRng, shuffle } from './rng.js';
import { getPolicy } from './policies.js';

export const SESSION_VERSION = 1;

/**
 * Questions in the selected chapters that match the filters (and, if given, the id
 * list). A filter of null means "no filter"; an empty list selects nothing.
 */
export function pool(bank, { chapters, difficulties = null, styles = null, ids = null }) {
  const chapterSet = new Set(chapters);
  const idSet = ids ? new Set(ids) : null;
  const available = new Set(bank.chapters.filter((c) => c.status === 'available').map((c) => c.number));
  return bank.questions.filter((q) =>
    chapterSet.has(q.chapter) && available.has(q.chapter) &&
    (!difficulties || difficulties.includes(q.difficulty)) &&
    (!styles || styles.includes(q.style)) &&
    (!idSet || idSet.has(q.id)));
}

/**
 * Pick `count` distinct questions. Each section is shuffled, then sections are
 * visited round-robin in random order, so topics are spread out while every
 * question within a section has the same chance. The final order is shuffled.
 */
export function selectQuestions(candidates, count, rng) {
  const groups = new Map();
  for (const q of shuffle(candidates, rng)) {
    const key = `${q.chapter}/${(q.sections && q.sections[0]) || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(q);
  }
  const queues = shuffle([...groups.values()], rng);
  const picked = [];
  while (picked.length < count && queues.some((g) => g.length)) {
    for (const g of queues) {
      if (picked.length >= count) break;
      if (g.length) picked.push(g.shift());
    }
  }
  return shuffle(picked, rng);
}

/**
 * Create a session. Returns {ok: true, session} or {ok: false, error, available}.
 * Never pads with questions from other chapters and never repeats a question.
 * `ids` limits the round to those questions; `kind` marks special rounds
 * ('missed': practising earlier mistakes, 'single': one question opened from a link).
 */
export function createSession(bank, { chapters, count, difficulties = null, styles = null, ids = null, kind = null, policy = 'learning', seed }) {
  const pol = getPolicy(policy);
  if (!pol.enabled) return { ok: false, error: 'policy_unavailable', available: 0 };
  if (!Array.isArray(chapters) || chapters.length === 0) return { ok: false, error: 'no_chapters', available: 0 };
  const candidates = pool(bank, { chapters, difficulties, styles, ids });
  if (candidates.length === 0) return { ok: false, error: 'no_questions', available: 0 };
  if (!Number.isInteger(count) || count < 1) return { ok: false, error: 'invalid_count', available: candidates.length };
  if (count > candidates.length) return { ok: false, error: 'insufficient', available: candidates.length };
  const rng = makeRng(seed);
  const items = selectQuestions(candidates, count, rng).map((q) => ({
    qid: q.id,
    rev: q.rev,
    order: shuffle(q.options.map((o) => o.id), rng),
    answer: null,
  }));
  return {
    ok: true,
    session: {
      v: SESSION_VERSION, bankId: bank.bank_id, policy, seed, chapters: [...chapters], count,
      difficulties: difficulties ? [...difficulties] : null, styles: styles ? [...styles] : null,
      ids: ids ? [...ids] : null, kind, items, index: 0, finished: false,
    },
  };
}

export function indexBank(bank) {
  return new Map(bank.questions.map((q) => [q.id, q]));
}

export function currentItem(session) {
  return session.items[session.index];
}

/**
 * Lock in an answer for the current item. Returns a new session.
 * Throws if the item was already answered or the option does not belong to it.
 */
export function submitAnswer(session, byId, optionId) {
  const item = currentItem(session);
  if (!item) throw new Error('no current question');
  if (item.answer) throw new Error('already answered');
  const q = byId.get(item.qid);
  if (!q || q.rev !== item.rev) throw new Error('question changed or missing');
  if (!q.options.some((o) => o.id === optionId)) throw new Error('unknown option');
  const items = session.items.slice();
  items[session.index] = { ...item, answer: { option: optionId, correct: q.correct.includes(optionId) } };
  return { ...session, items };
}

export function canAdvance(session) {
  const pol = getPolicy(session.policy);
  const item = currentItem(session);
  return Boolean(item && (item.answer || pol.allowAdvanceBeforeFeedback));
}

export function advance(session) {
  if (!canAdvance(session)) throw new Error('answer the question first');
  if (session.index + 1 >= session.items.length) return { ...session, finished: true };
  return { ...session, index: session.index + 1 };
}

export function feedbackVisible(session, itemIndex) {
  const pol = getPolicy(session.policy);
  const item = session.items[itemIndex];
  if (!item || !item.answer) return false;
  return pol.feedback === 'immediate' || session.finished;
}

export function summary(session, byId) {
  const byChapter = new Map();
  let correct = 0;
  let answered = 0;
  const items = session.items.map((it, i) => {
    const q = byId.get(it.qid);
    const ok = Boolean(it.answer && it.answer.correct);
    if (it.answer) answered += 1;
    if (ok) correct += 1;
    const ch = q ? q.chapter : null;
    if (!byChapter.has(ch)) byChapter.set(ch, { chapter: ch, total: 0, correct: 0 });
    const row = byChapter.get(ch);
    row.total += 1;
    if (ok) row.correct += 1;
    return { index: i, item: it, question: q, correct: ok };
  });
  return {
    total: session.items.length,
    answered,
    correct,
    wrong: answered - correct,
    unanswered: session.items.length - answered,
    byChapter: [...byChapter.values()].sort((a, b) => a.chapter - b.chapter),
    items,
  };
}

/**
 * Validate a stored session against the current bank. Returns the session or null.
 * A session is discarded if any of its questions or revisions are no longer published.
 */
export function restoreSession(raw, bank) {
  try {
    const s = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!s || s.v !== SESSION_VERSION || !Array.isArray(s.items) || s.items.length === 0) return null;
    getPolicy(s.policy);
    // sessions saved before empty filters meant "none" used [] for "all"
    for (const k of ['difficulties', 'styles']) if (Array.isArray(s[k]) && s[k].length === 0) s[k] = null;
    const byId = indexBank(bank);
    for (const it of s.items) {
      const q = byId.get(it.qid);
      if (!q || q.rev !== it.rev) return null;
      const ids = q.options.map((o) => o.id).sort().join('|');
      if (!Array.isArray(it.order) || [...it.order].sort().join('|') !== ids) return null;
      if (it.answer) {
        if (!ids.split('|').includes(it.answer.option)) return null;
        it.answer = { option: it.answer.option, correct: q.correct.includes(it.answer.option) };
      }
    }
    if (!Number.isInteger(s.index) || s.index < 0 || s.index >= s.items.length) return null;
    return s;
  } catch {
    return null;
  }
}
