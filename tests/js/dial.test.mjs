import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chapterDial, roundDial, scaleX } from '../../web/js/ui/dial.js';
import { findAll, textContent, toString } from '../../web/js/render/vnode.js';

const cls = (node, c) => findAll(node, (n) => (n.a.class || '').split(' ').includes(c));

test('the dial is decorative and hidden from screen readers', () => {
  const svg = chapterDial([{ number: 1, status: 'available' }], new Set());
  assert.equal(svg.a['aria-hidden'], 'true');
  assert.ok(!/NaN|undefined/.test(toString(svg)));
});

test('chapter dial: stations for available chapters, lit when selected, blank scale when not scanned', () => {
  const chapters = [1, 2, 3, 4, 5].map((n) => ({ number: n, status: n === 1 ? 'no_questions' : n <= 3 ? 'available' : 'upcoming' }));
  const svg = chapterDial(chapters, new Set([3]));
  assert.equal(cls(svg, 'dial-station').length, 2);
  assert.equal(cls(svg, 'is-on').length, 1);
  const nums = cls(svg, 'dial-num').map(textContent);
  assert.deepEqual(nums, ['1', '2', '3']);
  assert.equal(cls(svg, 'dial-faint').length, 1);
  assert.ok(textContent(svg).includes('kommer senere'));
});

test('round dial: marks differ by shape, needle at the current question', () => {
  const svg = roundDial(['correct', 'wrong', null, null], 2);
  assert.equal(cls(svg, 'dial-mark-ok')[0].t, 'circle');
  assert.equal(cls(svg, 'dial-mark-bad')[0].t, 'path');
  const needle = cls(svg, 'dial-needle')[0];
  assert.equal(Number(needle.a['data-x']), Number(scaleX(3, 4).toFixed(1)));
  assert.equal(cls(roundDial(['correct'], null), 'dial-needle').length, 0);
});

test('long rounds label only every 5th or 10th tick', () => {
  const nums = (n) => cls(roundDial(Array(n).fill(null), 0), 'dial-num').map(textContent);
  assert.equal(nums(10).length, 10);
  assert.deepEqual(nums(20), ['1', '5', '10', '15', '20']);
  assert.deepEqual(nums(121).slice(0, 3), ['1', '10', '20']);
});

test('the compact round scale is slimmer and has no numbers', () => {
  const svg = roundDial(['correct', 'wrong', null], 1, { compact: true });
  assert.equal(cls(svg, 'dial-num').length, 0);
  assert.equal(cls(svg, 'dial-needle').length, 1);
  assert.ok(svg.a.viewBox.endsWith(' 40'));
});
