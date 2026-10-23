import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  advance, canAdvance, createSession, currentItem, feedbackVisible, indexBank, pool, restoreSession, selectQuestions,
  submitAnswer, summary,
} from '../../web/js/quiz/engine.js';
import { makeRng, shuffle } from '../../web/js/quiz/rng.js';
import { validateBank } from '../../web/js/content/bank.js';
import { makeBank, question } from './fixtures.mjs';

const bank = makeBank();
const byId = indexBank(bank);

function answerAll(session, pick) {
  let s = session;
  while (!s.finished) {
    const it = currentItem(s);
    const q = byId.get(it.qid);
    s = submitAnswer(s, byId, pick(q));
    s = advance(s);
  }
  return s;
}

test('only questions from the selected chapters are drawn, without duplicates', () => {
  for (let seed = 1; seed < 200; seed++) {
    const res = createSession(bank, { chapters: [3, 6], count: 5, seed });
    assert.ok(res.ok);
    const ids = res.session.items.map((i) => i.qid);
    assert.equal(new Set(ids).size, 5);
    for (const id of ids) assert.ok([3, 6].includes(byId.get(id).chapter));
  }
});

test('insufficient stock is reported, never padded from other chapters', () => {
  const res = createSession(bank, { chapters: [6], count: 3, seed: 1 });
  assert.deepEqual(res, { ok: false, error: 'insufficient', available: 2 });
  assert.equal(createSession(bank, { chapters: [], count: 1, seed: 1 }).error, 'no_chapters');
  assert.equal(createSession(bank, { chapters: [1], count: 1, seed: 1 }).error, 'no_questions');
  assert.equal(createSession(bank, { chapters: [7], count: 1, seed: 1 }).error, 'no_questions');
  assert.equal(createSession(bank, { chapters: [2], count: 0, seed: 1 }).error, 'invalid_count');
});

test('unavailable chapters are excluded even if requested', () => {
  const b = makeBank();
  b.chapters.find((c) => c.number === 3).status = 'not_scanned';
  assert.equal(pool(b, { chapters: [3] }).length, 0);
});

test('shuffling options never changes which answer is correct', () => {
  for (let seed = 1; seed < 100; seed++) {
    const { session } = createSession(bank, { chapters: [2, 3, 6], count: 11, seed });
    for (const it of session.items) {
      const q = byId.get(it.qid);
      assert.deepEqual([...it.order].sort(), ['o1', 'o2', 'o3', 'o4']);
      const s2 = submitAnswer({ ...session, index: session.items.indexOf(it) }, byId, 'o1');
      assert.equal(s2.items[session.items.indexOf(it)].answer.correct, true);
      assert.ok(q.correct.includes('o1'));
    }
  }
});

test('option order is actually shuffled across sessions', () => {
  const firsts = new Set();
  for (let seed = 1; seed < 60; seed++) firsts.add(createSession(bank, { chapters: [2], count: 1, seed }).session.items[0].order[0]);
  assert.equal(firsts.size, 4);
});

test('selection spreads across sections and is roughly uniform', () => {
  const counts = new Map();
  const qs = bank.questions.filter((q) => q.chapter === 2);
  for (let seed = 1; seed < 3001; seed++) {
    const picked = selectQuestions(qs, 2, makeRng(seed));
    assert.notEqual(picked[0].sections[0], picked[1].sections[0], 'two questions should come from different sections');
    for (const q of picked) counts.set(q.id, (counts.get(q.id) || 0) + 1);
  }
  for (const n of counts.values()) assert.ok(n > 800 && n < 1200, `uneven selection: ${[...counts.values()]}`);
});

test('fisher-yates shuffle is unbiased', () => {
  const pos = [0, 0, 0, 0];
  const rng = makeRng(42);
  for (let i = 0; i < 20000; i++) pos[shuffle([0, 1, 2, 3], rng).indexOf(0)] += 1;
  for (const p of pos) assert.ok(p > 4600 && p < 5400, String(pos));
});

test('an answer is locked after submission and cannot be scored twice', () => {
  const { session } = createSession(bank, { chapters: [2], count: 2, seed: 7 });
  const s1 = submitAnswer(session, byId, 'o2');
  assert.throws(() => submitAnswer(s1, byId, 'o1'), /already answered/);
  assert.equal(s1.items[0].answer.correct, false);
  assert.equal(session.items[0].answer, null, 'sessions are immutable');
  assert.throws(() => submitAnswer(session, byId, 'zz'), /unknown option/);
});

test('cannot advance before feedback in learning mode', () => {
  const { session } = createSession(bank, { chapters: [2], count: 2, seed: 7 });
  assert.equal(canAdvance(session), false);
  assert.throws(() => advance(session));
  const s1 = submitAnswer(session, byId, 'o1');
  assert.equal(feedbackVisible(s1, 0), true);
  assert.equal(advance(s1).index, 1);
});

test('scoring: all correct, all wrong, partial', () => {
  const { session } = createSession(bank, { chapters: [2, 3], count: 6, seed: 3 });
  const right = summary(answerAll(session, (q) => q.correct[0]), byId);
  assert.deepEqual([right.correct, right.wrong, right.total], [6, 0, 6]);
  const wrong = summary(answerAll(session, () => 'o4'), byId);
  assert.deepEqual([wrong.correct, wrong.wrong], [0, 6]);
  let n = 0;
  const partial = summary(answerAll(session, (q) => (n++ % 2 ? 'o3' : q.correct[0])), byId);
  assert.deepEqual([partial.correct, partial.wrong], [3, 3]);
  const total = partial.byChapter.reduce((a, r) => a + r.total, 0);
  assert.equal(total, 6);
  assert.ok(partial.byChapter.every((r) => [2, 3].includes(r.chapter)));
});

test('stored sessions are validated against the current bank', () => {
  const { session } = createSession(bank, { chapters: [2], count: 3, seed: 5 });
  const s1 = submitAnswer(session, byId, 'o3');
  const raw = JSON.stringify(s1);
  const restored = restoreSession(raw, bank);
  assert.equal(restored.items[0].answer.option, 'o3');
  assert.equal(restored.items[0].answer.correct, false);
  // tampered correctness is recomputed from the bank
  const tampered = JSON.parse(raw);
  tampered.items[0].answer.correct = true;
  assert.equal(restoreSession(tampered, bank).items[0].answer.correct, false);
  // a question revision that is no longer published invalidates the session
  const b2 = makeBank();
  b2.questions.find((q) => q.id === s1.items[0].qid).rev = 2;
  assert.equal(restoreSession(raw, b2), null);
  assert.equal(restoreSession('{not json', bank), null);
  assert.equal(restoreSession(JSON.stringify({ ...s1, v: 99 }), bank), null);
  assert.equal(restoreSession(JSON.stringify({ ...s1, index: 10 }), bank), null);
});

test('bank validation drops invalid questions and fixes chapter availability', () => {
  const b = makeBank({ perChapter: { 6: 2 } });
  b.questions[0].correct = ['nope'];
  b.questions[1].stem = [['Se ', { term: 'mangler', text: 'x' }]];
  const res = validateBank(b);
  assert.ok(res.ok);
  assert.equal(res.bank.questions.length, 0);
  assert.equal(res.dropped.length, 2);
  assert.equal(res.bank.chapters.find((c) => c.number === 6).status, 'no_questions');
  assert.equal(validateBank({}).ok, false);
  assert.equal(validateBank(null).ok, false);
  const empty = validateBank(makeBank({ perChapter: {} }));
  assert.ok(empty.ok);
  assert.equal(empty.bank.questions.length, 0);
});

test('bank validation rejects a visual with invalid parameters', () => {
  const b = makeBank({ perChapter: {} });
  b.chapters[1].status = 'available';
  b.questions = [question('q-1', 2, 's', { visual: { template: 'dc-circuit', version: 1, params: { topology: 'series', source: { voltage_v: 5 }, resistors: [] } } })];
  assert.equal(validateBank(b).bank.questions.length, 0);
});
