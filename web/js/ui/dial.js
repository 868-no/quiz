// The tuning dial: the site's one signature element. A glass scale with ticks
// and numbers and a red needle, used for the chapter selection, the progress of
// a round and the result. It is decorative (aria-hidden): the same information
// is always available as text and real form controls next to it.

import { h } from '../render/vnode.js';

// Geometry in SVG units. On narrow screens the dial is drawn narrower (not just scaled
// down), so numbers and marks stay readable at phone width.
let W = 640;
const PAD = 28;

export function setDialWidth(width) {
  W = Math.max(320, Math.min(640, Math.round(width)));
}

function scaleX(i, n) {
  // positions 1..n spread across the glass, with a margin at both ends
  return n <= 1 ? W / 2 : PAD + ((W - 2 * PAD) * (i - 1)) / (n - 1);
}

function glass(height, extra = {}) {
  return h('svg', {
    viewBox: `0 0 ${W} ${height}`, class: 'dial', 'aria-hidden': 'true', focusable: 'false',
    preserveAspectRatio: 'xMidYMid meet', ...extra,
  }, h('rect', { x: 1, y: 1, width: W - 2, height: height - 2, rx: 6, class: 'dial-glass' }));
}

function needle(x, top, bottom) {
  return h('g', { class: 'dial-needle', 'data-x': x.toFixed(1) },
    h('line', { x1: x, y1: top, x2: x, y2: bottom }),
    h('polygon', { points: `${x - 5},${top - 1} ${x + 5},${top - 1} ${x},${top + 6}` }));
}

/**
 * Chapter scale for the setup screen. chapters: [{number, status}]; selected: Set of numbers.
 * Available chapters are stations (hollow, or lit when selected); chapters without
 * questions are faint; upcoming chapters are blank scale. Chapters not in the quiz at
 * all (the exam syllabus) are left out, and the others are spaced evenly.
 */
export function chapterDial(chapters, selected) {
  const shown = chapters.filter((c) => c.status !== 'not_in_quiz');
  const n = shown.length;
  // the scale line runs through the middle; the lamps above it and the numbers below it
  // reach equally far, so the glass has the same margin at the top and the bottom
  const H = 76;
  const base = H / 2;
  const svg = glass(H);
  const els = [h('line', { x1: PAD - 10, y1: base, x2: W - PAD + 10, y2: base, class: 'dial-base' })];
  const pos = new Map(shown.map((c, i) => [c.number, scaleX(i + 1, n)]));
  const blank = shown.filter((c) => c.status === 'upcoming');
  for (const c of shown) {
    const x = pos.get(c.number);
    if (c.status === 'upcoming') {
      els.push(h('line', { x1: x, y1: base, x2: x, y2: base + 5, class: 'dial-tick dial-tick-minor' }));
      continue;
    }
    const avail = c.status === 'available';
    els.push(h('line', { x1: x, y1: base, x2: x, y2: base + 10, class: avail ? 'dial-tick' : 'dial-tick dial-tick-faint' }));
    els.push(h('text', { x, y: base + 24, class: avail ? 'dial-num' : 'dial-num dial-faint', 'text-anchor': 'middle' }, String(c.number)));
    if (avail) {
      els.push(h('circle', { cx: x, cy: base - 18, r: 6, class: selected.has(c.number) ? 'dial-station is-on' : 'dial-station' }));
    }
  }
  if (blank.length) {
    const x1 = pos.get(blank[0].number);
    const x2 = pos.get(blank[blank.length - 1].number);
    els.push(h('text', { x: (x1 + x2) / 2, y: base - 14, class: 'dial-note', 'text-anchor': 'middle' }, 'kommer senere'));
  }
  svg.c.push(...els);
  return svg;
}

/**
 * Progress scale for a round. marks: array of 'correct' | 'wrong' | 'answered' | null
 * per question ('answered': during a practice exam, where right and wrong are not shown);
 * current: index of the question being shown, or null on the results screen.
 * Correct answers leave a dot and wrong answers a cross, so the marks differ by
 * shape and not only by colour. `compact` (phones, during a round) draws a slimmer
 * scale without numbers; the heading above it says which question this is.
 */
export function roundDial(marks, current, { compact = false } = {}) {
  const n = marks.length;
  // full size: the scale line through the middle, the marks above and the numbers below it
  // equally far out (as on the chapter scale); compact has no numbers and keeps its own balance
  const H = compact ? 40 : 70;
  const base = compact ? 22 : H / 2;
  const markY = base - (compact ? 11 : 18);
  const svg = glass(H, { class: 'dial dial-round' });
  const els = [h('line', { x1: PAD - 10, y1: base, x2: W - PAD + 10, y2: base, class: 'dial-base' })];
  const every = n <= 12 ? 1 : n <= 30 ? 5 : 10;
  marks.forEach((m, i) => {
    const x = scaleX(i + 1, n);
    const major = (i + 1) % every === 0 || i === 0;
    const tick = compact ? (major ? 7 : 4) : (major ? 10 : 5);
    els.push(h('line', { x1: x, y1: base, x2: x, y2: base + tick, class: major ? 'dial-tick' : 'dial-tick dial-tick-minor' }));
    if (major && !compact) els.push(h('text', { x, y: base + 23, class: 'dial-num', 'text-anchor': 'middle' }, String(i + 1)));
    const r = n <= 30 ? (compact ? 4 : 4.5) : 3;
    if (m === 'correct') els.push(h('circle', { cx: x, cy: markY, r, class: 'dial-mark-ok' }));
    if (m === 'answered') els.push(h('circle', { cx: x, cy: markY, r: r * 0.8, class: 'dial-mark-answered' }));
    if (m === 'wrong') {
      els.push(h('path', { d: `M ${x - r} ${markY - r} L ${x + r} ${markY + r} M ${x + r} ${markY - r} L ${x - r} ${markY + r}`, class: 'dial-mark-bad' }));
    }
  });
  if (current !== null && current !== undefined) els.push(needle(scaleX(current + 1, n), compact ? 4 : 6, H - (compact ? 4 : 6)));
  svg.c.push(...els);
  return svg;
}

export { scaleX };
