import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missedIds, parseMissed, recordAnswer, recordSolved, solvedByChapter } from '../../web/js/quiz/progress.js';
import { makeBank } from './fixtures.mjs';

test('a wrong answer adds a question and a right answer removes it', () => {
  let m = {};
  m = recordAnswer(m, 'q-2000', false, 10);
  m = recordAnswer(m, 'q-2001', false, 20);
  assert.deepEqual(m, { 'q-2000': 10, 'q-2001': 20 });
  m = recordAnswer(m, 'q-2000', true, 30);
  assert.deepEqual(m, { 'q-2001': 20 });
  assert.deepEqual(recordAnswer(m, 'q-2001', false, 40), { 'q-2001': 40 }, 'a new mistake updates the time');
});

test('malformed stored data counts as an empty list', () => {
  for (const raw of [null, '', '{', '[]', '"x"', '{"q-1": "x"}']) assert.deepEqual(parseMissed(raw), {});
  assert.deepEqual(parseMissed('{"q-1": 5, "evil": 1}'), { 'q-1': 5 });
});

test('only questions still published in available chapters are offered, oldest first', () => {
  const bank = makeBank();
  assert.deepEqual(missedIds({ 'q-3000': 5, 'q-2001': 1, 'q-9999': 0 }, bank), ['q-2001', 'q-3000']);
});

test('progress keeps questions answered right at least once, per chapter', () => {
  let s = {};
  s = recordSolved(s, 'q-2000', false, 1);
  assert.deepEqual(s, {}, 'a wrong answer is not progress');
  s = recordSolved(s, 'q-2000', true, 2);
  const same = recordSolved(s, 'q-2000', true, 3);
  assert.equal(same, s, 'answering right again changes nothing');
  s = recordSolved(s, 'q-2001', true, 4);
  s = recordSolved(s, 'q-3000', true, 5);
  s = recordSolved(s, 'q-9999', true, 6);
  assert.deepEqual(solvedByChapter(s, makeBank()), { 2: 2, 3: 1 }, 'questions no longer published do not count');
});
