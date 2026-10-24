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

/** Rotate a drawn element about (cx, cy). */
export function rotated(node, cx, cy, deg) {
  return deg ? h('g', { transform: `rotate(${deg} ${cx} ${cy})` }, node) : node;
}

/** R, C or L centred at (cx, cy), along a vertical (default) or horizontal wire. */
export function component(kind, cx, cy, horizontal = false) {
  if (kind === 'R') return resistor(cx, cy, !horizontal);
  const sym = kind === 'C' ? capacitor(cx, cy) : inductor(cx, cy);
  return rotated(sym, cx, cy, horizontal ? 90 : 0);
}

/**
 * Diode centred at (cx, cy); conducts (anode → cathode) in direction `deg`
 * (0 = towards +x, 90 = towards +y). IEC: triangle pointing at the cathode bar.
 */
export function diode(cx, cy, deg = 0, size = 12, zener = false) {
  const s = size;
  const bx = cx + s * 0.7;
  return rotated(h('g', { class: zener ? 'diode zener' : 'diode' },
    h('rect', { x: cx - s - 2, y: cy - s - 2, width: 2 * s + 4, height: 2 * s + 4, fill: 'var(--fig-bg)', stroke: 'none' }),
    h('polygon', { points: `${cx - s},${cy - s} ${cx - s},${cy + s} ${bx},${cy}`, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    line(bx, cy - s, bx, cy + s, { 'stroke-width': 2.5 }),
    // zener: the cathode bar has bent ends
    zener ? line(bx, cy - s, bx - 5, cy - s - 3, { 'stroke-width': 2.5 }) : null,
    zener ? line(bx, cy + s, bx + 5, cy + s + 3, { 'stroke-width': 2.5 }) : null), cx, cy, deg);
}

/** Open switch on a horizontal wire from (x1, y) to (x2, y). */
export function switchOpen(x1, x2, y) {
  return h('g', { class: 'switch' },
    h('rect', { x: x1, y: y - 3, width: x2 - x1, height: 6, fill: 'var(--fig-bg)', stroke: 'none' }),
    h('circle', { cx: x1 + 3, cy: y, r: 3, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }),
    h('circle', { cx: x2 - 3, cy: y, r: 3, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }),
    line(x1 + 5, y - 2, x2 - 6, y - 16));
}

/** Connection terminal (small open circle). */
export function terminal(x, y) {
  return h('circle', { cx: x, cy: y, r: 4.5, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 });
}

/** Ground symbol hanging below (x, y). */
export function ground(x, y) {
  return h('g', {}, line(x, y, x, y + 8), line(x - 12, y + 8, x + 12, y + 8),
    line(x - 7, y + 13, x + 7, y + 13), line(x - 3, y + 18, x + 3, y + 18));
}

/**
 * NPN transistor with its base on the left. Returns {node, b, c, e} with the
 * connection points of base, collector (up) and emitter (down).
 */
export function npn(cx, cy, r = 24) {
  const bx = cx - 9;
  const node = h('g', { class: 'transistor' },
    h('circle', { cx, cy, r, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }),
    line(cx - r - 14, cy, bx, cy),
    line(bx, cy - 14, bx, cy + 14, { 'stroke-width': 3 }),
    line(bx, cy - 6, cx + 9, cy - r + 4), line(cx + 9, cy - r + 4, cx + 9, cy - r - 12),
    line(bx, cy + 6, cx + 9, cy + r - 4), line(cx + 9, cy + r - 4, cx + 9, cy + r + 12),
    arrowHead(cx + 7, cy + r - 6, 16, 12.5, 9));
  return { node, b: [cx - r - 14, cy], c: [cx + 9, cy - r - 12], e: [cx + 9, cy + r + 12] };
}
