import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missedIds, parseMissed, recordAnswer } from '../../web/js/quiz/progress.js';
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
