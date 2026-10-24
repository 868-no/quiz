// spectrum@1: a frequency axis with discrete spectrum lines (harmonics, mixing
// products), sidebands drawn as bands, the noise skirt around a carrier (phase noise)
// and an optional filter passband drawn over it. One or two panels share the axis.
// 'blank' draws only a note, for spectra that are shown after answering.

import { h } from '../render/vnode.js';
import { formatNumber } from '../render/format.js';
import { arrowHead, label, line, svgRoot, STROKE } from './svg.js';
import { formatFreq } from './frequency-response.js';

function rules(p) {
  const errors = [];
  if (!(p.x_max_hz > p.x_min_hz)) errors.push('x_max_hz: must be above x_min_hz');
  if (!p.blank && !p.panels.length) errors.push('panels: at least one');
  p.panels.forEach((pa, i) => {
    const inside = (f) => f >= p.x_min_hz && f <= p.x_max_hz;
    pa.lines.forEach((l, j) => { if (!inside(l.f_hz)) errors.push(`panels[${i}].lines[${j}]: outside the axis`); });
    pa.bands.forEach((b, j) => { if (!(b.to_hz > b.from_hz) || !inside(b.from_hz) || !inside(b.to_hz)) errors.push(`panels[${i}].bands[${j}]: must lie on the axis, from below to`); });
    if (pa.filter && !(pa.filter.to_hz > pa.filter.from_hz)) errors.push(`panels[${i}].filter: to_hz must be above from_hz`);
    if (pa.skirt && !inside(pa.skirt.center_hz)) errors.push(`panels[${i}].skirt: outside the axis`);
  });
  return errors;
}

const W = 560;
const X0 = 40;
const X1 = 520;
const PANEL = 150;

function drawPanel(els, p, pa, top, desc) {
  const span = p.x_max_hz - p.x_min_hz;
  const xOf = (f) => X0 + ((f - p.x_min_hz) / span) * (X1 - X0);
  const base = top + PANEL - 26;
  const yOf = (a) => base - a * (PANEL - 56);
  // the smallest distance between two lines sets how many decimals the labels need
  const fs = pa.lines.map((l) => l.f_hz).sort((a, b) => a - b);
  const step = fs.length > 1 ? Math.min(...fs.slice(1).map((f, i) => f - fs[i])) : span / 4;
  if (pa.title) els.push(label(X0, top + 10, pa.title, { 'font-size': 13, 'font-weight': 'bold', 'text-anchor': 'start' }));
  els.push(line(X0, base, X1 + 12, base, { 'stroke-width': 1.5 }), arrowHead(X1 + 18, base, 1, 0, 8));
  els.push(label(X1 + 18, base + 14, 'f', { 'font-size': 12, 'font-style': 'italic', 'text-anchor': 'end' }));
  if (pa.filter) {
    const f = pa.filter;
    const ramp = Math.min((f.to_hz - f.from_hz) * 0.08, span * 0.02);
    // a passband reaching past the axis is cut at its edge
    const clamp = (x) => Math.min(p.x_max_hz, Math.max(p.x_min_hz, x));
    const pts = [[xOf(clamp(f.from_hz - ramp)), f.from_hz > p.x_min_hz ? base : yOf(0.95)], [xOf(clamp(f.from_hz)), yOf(0.95)], [xOf(clamp(f.to_hz)), yOf(0.95)], [xOf(clamp(f.to_hz + ramp)), f.to_hz < p.x_max_hz ? base : yOf(0.95)]];
    els.push(h('path', { d: `M ${pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L ')}`, fill: 'none', stroke: STROKE, 'stroke-width': 1.6, 'stroke-dasharray': '6 4' }));
    // a wide passband has its label at its left end, a narrow one beside it, clear of the line labels
    if (f.label) {
      const wide = xOf(clamp(f.to_hz)) - xOf(clamp(f.from_hz)) > (X1 - X0) * 0.4;
      const tallInside = pa.lines.some((l) => l.f_hz >= f.from_hz && l.f_hz <= f.to_hz && l.level > 0.8);
      const mid = (xOf(clamp(f.from_hz)) + xOf(clamp(f.to_hz))) / 2;
      els.push(wide
        ? label(xOf(clamp(f.from_hz)) + 6, yOf(0.95) - 10, f.label, { 'font-size': 12, 'text-anchor': 'start' })
        : tallInside
          ? label(xOf(clamp(f.to_hz)) + 6, yOf(0.95) + 14, f.label, { 'font-size': 12, 'text-anchor': 'start' })
          : label(mid, yOf(0.95) - 10, f.label, { 'font-size': 12 }));
    }
    desc.push(`Stiplet: ${f.label || 'et filter'}, som slipper gjennom fra ${formatFreq(f.from_hz, step)} til ${formatFreq(f.to_hz, step)}.`);
  }
  if (pa.skirt) {
    const s = pa.skirt;
    let d = '';
    for (let j = 0; j <= 200; j++) {
      const f = s.center_hz + ((j - 100) / 100) * s.width_hz * 3;
      const a = s.level * Math.exp(-Math.abs(f - s.center_hz) / s.width_hz);
      d += `${j ? ' L' : 'M'} ${xOf(f).toFixed(1)} ${yOf(a).toFixed(1)}`;
    }
    els.push(h('path', { d: `${d} L ${xOf(s.center_hz + 3 * s.width_hz).toFixed(1)} ${base} L ${xOf(s.center_hz - 3 * s.width_hz).toFixed(1)} ${base} Z`, fill: STROKE, opacity: 0.25, stroke: STROKE, 'stroke-width': 1 }));
    if (s.label) els.push(label(xOf(s.center_hz + 1.6 * s.width_hz), yOf(s.level * 0.25) - 14, s.label, { 'font-size': 12, 'text-anchor': 'start' }));
    desc.push(`Rundt ${formatFreq(s.center_hz, step)} ligger et skjørt av støy på begge sider${s.label ? ` (${s.label})` : ''}, sterkest nærmest og svakere lenger ut.`);
  }
  // a band is highest at the end nearest the strongest line (a sideband falls off away from the carrier)
  const main = pa.lines.length ? pa.lines.reduce((a, l) => (l.level > a.level ? l : a)).f_hz : null;
  for (const b of pa.bands) {
    const below = main !== null && b.to_hz <= main;
    const [ya, yb] = below ? [yOf(b.level * 0.6), yOf(b.level)] : [yOf(b.level), yOf(b.level * 0.6)];
    els.push(h('path', { d: `M ${xOf(b.from_hz)} ${base} L ${xOf(b.from_hz)} ${ya} L ${xOf(b.to_hz)} ${yb} L ${xOf(b.to_hz)} ${base} Z`, fill: STROKE, opacity: 0.35, stroke: STROKE, 'stroke-width': 1.2 }));
    if (b.label) els.push(label((xOf(b.from_hz) + xOf(b.to_hz)) / 2, yOf(b.level) - 10, b.label, { 'font-size': 12 }));
  }
  if (pa.bands.length) desc.push(`Sidebånd: ${pa.bands.map((b) => `${b.label || 'et bånd'} fra ${formatFreq(b.from_hz, step)} til ${formatFreq(b.to_hz, step)}`).join(', ')}.`);
  for (const l of pa.lines) {
    const x = xOf(l.f_hz);
    els.push(line(x, base, x, yOf(l.level), { 'stroke-width': l.mark ? 4.5 : 3, 'stroke-linecap': 'butt' }));
    if (l.label) els.push(label(x, yOf(l.level) - 10, l.label, { 'font-size': 12, 'font-weight': l.mark ? 'bold' : null }));
    if (p.freq_labels) els.push(label(x, base + 14, formatFreq(l.f_hz, step), { 'font-size': 11 }));
  }
  if (pa.lines.length) {
    desc.push(`Linjer: ${pa.lines.map((l) => `${formatFreq(l.f_hz, step)}${l.label ? ` (${l.label})` : ''}, ${l.level >= 0.7 ? 'sterk' : l.level >= 0.3 ? 'middels' : 'svak'}`).join('; ')}.`);
  }
}

function render(p) {
  const els = [];
  const desc = [];
  let height;
  if (p.blank) {
    height = 120;
    if (p.note) els.push(label((X0 + X1) / 2, 60, p.note, { 'font-size': 14, opacity: 0.75 }));
    desc.push(p.note ? `Frekvensspekter. ${p.note}.` : 'Frekvensspekter.');
  } else {
    p.panels.forEach((pa, i) => {
      if (p.panels.length > 1) desc.push(`${pa.title || `Del ${formatNumber(i + 1)}`}:`);
      drawPanel(els, p, pa, 8 + i * (PANEL + 10), desc);
    });
    height = 8 + p.panels.length * (PANEL + 10);
  }
  const description = `Frekvensspekter: amplitude mot frekvens. ${desc.join(' ')}`.trim();
  return { svg: svgRoot(W, height, 'Frekvensspekter', description, els, {}, 0, 0), description, animatable: false };
}

export default { id: 'spectrum', version: 1, rules, quantities: () => ({}), render };
