// Original SVG primitives for circuit diagrams, drawn with IEC-style symbols
// (rectangular resistor, long/short battery plates, semicircle inductor).
// All geometry is computed here; no external artwork is used.

import { h } from '../render/vnode.js';

export const STROKE = 'currentColor';

export function wire(points, extra = {}) {
  return h('polyline', {
    points: points.map(([x, y]) => `${x},${y}`).join(' '),
    fill: 'none', stroke: STROKE, 'stroke-width': 2, 'stroke-linejoin': 'round', ...extra,
  });
}

export function line(x1, y1, x2, y2, extra = {}) {
  return h('line', { x1, y1, x2, y2, stroke: STROKE, 'stroke-width': 2, ...extra });
}

export function label(x, y, text, extra = {}) {
  return h('text', { x, y, 'font-size': 14, fill: STROKE, 'text-anchor': 'middle', 'dominant-baseline': 'middle', ...extra }, text);
}

/**
 * Label with an optional subscript, e.g. ("R", "1", " = 100 Ω"). The subscript is
 * lowered with dy (baseline-shift is not supported by all browsers), and spaces are
 * non-breaking so SVG whitespace collapsing cannot remove them.
 */
export function symLabel(x, y, sym, sub, rest, extra = {}) {
  const nb = (t) => t.replace(/ /g, '\u00a0');
  return h('text', { x, y, 'font-size': 14, fill: STROKE, 'text-anchor': 'middle', 'dominant-baseline': 'middle', ...extra },
    h('tspan', { 'font-style': 'italic' }, sym),
    sub ? h('tspan', { dy: 4, 'font-size': 10 }, sub) : null,
    rest ? h('tspan', { dy: sub ? -4 : null, dx: /^\s/.test(rest) ? 4 : null }, nb(rest.trimStart())) : null);
}

/** Resistor box between (x1,y)-(x2,y) horizontally or (x,y1)-(x,y2) vertically. */
export function resistor(cx, cy, vertical = false, len = 52, wid = 18) {
  const [w, hh] = vertical ? [wid, len] : [len, wid];
  return h('rect', { x: cx - w / 2, y: cy - hh / 2, width: w, height: hh, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 });
}

/** Battery on a vertical wire, positive (long thin plate) on top; polarity signs on the left. */
export function battery(cx, cy) {
  return h('g', { class: 'battery' },
    h('rect', { x: cx - 22, y: cy - 10, width: 44, height: 20, fill: 'var(--fig-bg)', stroke: 'none' }),
    line(cx - 20, cy - 6, cx + 20, cy - 6),
    line(cx - 10, cy + 6, cx + 10, cy + 6, { 'stroke-width': 5 }),
    label(cx - 30, cy - 12, '+', { 'font-size': 16 }),
    label(cx - 30, cy + 12, '−', { 'font-size': 16 }));
}

/** Capacitor on a vertical wire (plates horizontal). */
export function capacitor(cx, cy) {
  return h('g', {},
    h('rect', { x: cx - 22, y: cy - 8, width: 44, height: 16, fill: 'var(--fig-bg)', stroke: 'none' }),
    line(cx - 20, cy - 5, cx + 20, cy - 5, { 'stroke-width': 3 }),
    line(cx - 20, cy + 5, cx + 20, cy + 5, { 'stroke-width': 3 }));
}

/** Inductor on a vertical wire: four semicircular turns. */
export function inductor(cx, cy, len = 56) {
  const n = 4;
  const r = len / (2 * n);
  let d = `M ${cx} ${cy - len / 2}`;
  for (let i = 0; i < n; i++) d += ` a ${r} ${r} 0 0 1 0 ${2 * r}`;
  return h('g', {},
    h('rect', { x: cx - 4, y: cy - len / 2, width: r + 8, height: len, fill: 'var(--fig-bg)', stroke: 'none' }),
    h('path', { d, fill: 'none', stroke: STROKE, 'stroke-width': 2 }));
}

/** Circle meter (V or A) or AC source. */
export function meter(cx, cy, letter, r = 17) {
  return h('g', {},
    h('circle', { cx, cy, r, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }),
    label(cx, cy + 1, letter, { 'font-size': 15, 'font-weight': 'bold' }));
}

export function acSource(cx, cy, r = 22) {
  const w = r * 1.1;
  const d = `M ${cx - w / 2} ${cy} q ${w / 4} ${-r * 0.7} ${w / 2} 0 t ${w / 2} 0`;
  return h('g', {},
    h('circle', { cx, cy, r, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }),
    h('path', { d, fill: 'none', stroke: STROKE, 'stroke-width': 2 }));
}

/** Filled arrowhead pointing in direction (dx, dy) with its tip at (x, y). */
export function arrowHead(x, y, dx, dy, size = 9) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const bx = x - ux * size;
  const by = y - uy * size;
  const px = -uy * size * 0.55;
  const py = ux * size * 0.55;
  return h('polygon', { points: `${x},${y} ${bx + px},${by + py} ${bx - px},${by - py}`, fill: STROKE });
}

export function dot(x, y) {
  return h('circle', { cx: x, cy: y, r: 3.5, fill: STROKE });
}

export function svgRoot(width, height, title, desc, children, extra = {}, minX = 0, minY = 0) {
  return h('svg', {
    viewBox: `${minX} ${minY} ${width} ${height}`, role: 'img', focusable: 'false', class: 'fig-svg',
    'aria-label': title, preserveAspectRatio: 'xMidYMid meet', ...extra,
  }, h('title', {}, title), h('desc', {}, desc), children);
}
