// waveform@1: one or two periodic waveforms computed from their definition.

import { h } from '../render/vnode.js';
import { formatNumber, formatSI } from '../render/format.js';
import { arrowHead, label, line, svgRoot, symLabel, STROKE } from './svg.js';

const SHAPES = {
  sine: (x) => Math.sin(x),
  square: (x) => (Math.sin(x) >= 0 ? 1 : -1),
  triangle: (x) => (2 / Math.PI) * Math.asin(Math.sin(x)),
};
const SHAPE_NAME = { sine: 'sinusformet', square: 'firkantformet', triangle: 'trekantformet' };

function rules(p) {
  const errors = [];
  if (new Set(p.markers).size !== p.markers.length) errors.push('markers: duplicates');
  if (p.markers.includes('rms') && p.traces[0].shape !== 'sine') errors.push('markers: the RMS marker is only defined here for sine waves');
  if (p.traces.length === 2 && p.traces[0].unit !== p.traces[1].unit && p.show_values) errors.push('traces: two traces with different units need show_values=false (no shared scale)');
  if (p.traces.length === 2 && p.traces[0].unit !== p.traces[1].unit && p.markers.length) errors.push('markers: not available when the traces use different units');
  return errors;
}

function siScale(unit) {
  return unit.startsWith('m') ? 1e-3 : 1;
}

function quantities(p) {
  const t = p.traces[0];
  const sym = t.unit.endsWith('A') ? 'I' : 'U';
  const unit = sym === 'I' ? 'A' : 'V';
  const a = t.amplitude * siScale(t.unit);
  const show = p.show_values;
  const q = {
    [`${sym}_p`]: { value: a, unit, shown: show && p.markers.includes('peak') },
    [`${sym}_pp`]: { value: 2 * a, unit, shown: show && p.markers.includes('peak_to_peak') },
    T: { value: 1 / t.frequency_hz, unit: 's', shown: show && p.markers.includes('period') },
    f: { value: t.frequency_hz, unit: 'Hz', shown: false },
  };
  if (t.shape === 'sine') q[`${sym}_rms`] = { value: a / Math.SQRT2, unit, shown: show && p.markers.includes('rms') };
  if (p.traces.length === 2) q.phase_difference_deg = { value: p.traces[1].phase_deg - t.phase_deg, unit: '°', shown: false };
  return q;
}

const TIME_UNITS = [[1, 's'], [1e-3, 'ms'], [1e-6, 'µs'], [1e-9, 'ns']];

function timeUnit(duration) {
  return TIME_UNITS.find(([f]) => duration / f >= 0.5) || TIME_UNITS[TIME_UNITS.length - 1];
}

export function niceStep(span, target = 6) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
}

export function sample(trace, t) {
  const w = 2 * Math.PI * trace.frequency_hz * t + (trace.phase_deg * Math.PI) / 180;
  return trace.offset + trace.amplitude * SHAPES[trace.shape](w);
}

function render(p) {
  const W = 540;
  const H = 290;
  const X0 = 72;
  const X1 = 500;
  const YT = 34;
  const YB = p.markers.includes('period') ? 214 : 244;
  const t0 = p.traces[0];
  const duration = p.cycles / t0.frequency_hz;
  // Traces in different units share no scale; each is then drawn relative to its own peak.
  const mixed = p.traces.length === 2 && p.traces[0].unit !== p.traces[1].unit;
  const k = (tr) => (mixed ? 1 / tr.amplitude : 1);
  let lo = 0;
  let hi = 0;
  for (const tr of p.traces) {
    lo = Math.min(lo, (tr.offset - tr.amplitude) * k(tr));
    hi = Math.max(hi, (tr.offset + tr.amplitude) * k(tr));
  }
  const pad = (hi - lo) * 0.15 || 1;
  lo -= pad;
  hi += pad;
  const xOf = (t) => X0 + ((X1 - X0) * t) / duration;
  const yOf = (v) => YB - ((YB - YT) * (v - lo)) / (hi - lo);
  const y0 = yOf(0);
  const [tf, tu] = timeUnit(duration);
  const els = [];
  const sym = t0.unit.endsWith('A') ? 'i' : 'u';
  const Sym = sym.toUpperCase();

  // axes
  els.push(line(X0, YT - 14, X0, YB + 6), arrowHead(X0, YT - 18, 0, -1));
  els.push(line(X0, y0, X1 + 18, y0), arrowHead(X1 + 24, y0, 1, 0));
  const yName = mixed ? p.traces.map((tr) => (tr.unit.endsWith('A') ? 'i' : 'u')).join(', ') : `${sym} (${t0.unit})`;
  els.push(label(X0 - 4, YT - 26, yName, { 'text-anchor': 'end', 'font-size': 13, 'font-style': 'italic' }));
  els.push(label(X1 + 26, y0 - 14, `t${p.show_values ? ` (${tu})` : ''}`, { 'text-anchor': 'end', 'font-size': 13, 'font-style': 'italic' }));
  if (p.show_values) {
    const step = niceStep(duration / tf);
    for (let j = 1; j * step <= duration / tf + 1e-9; j++) {
      const x = xOf(j * step * tf);
      if (x > X1 + 1) break;
      els.push(line(x, y0 - 4, x, y0 + 4, { 'stroke-width': 1.5 }));
      els.push(label(x, y0 + 16, formatNumber(Number((j * step).toPrecision(6))), { 'font-size': 11 }));
    }
    const levels = new Set([t0.offset + t0.amplitude, t0.offset - t0.amplitude]);
    for (const v of levels) {
      if (v === 0) continue;
      const y = yOf(v);
      els.push(line(X0 - 4, y, X0 + 4, y, { 'stroke-width': 1.5 }));
      els.push(label(X0 - 8, y, formatNumber(Number(v.toPrecision(6))), { 'text-anchor': 'end', 'font-size': 11 }));
    }
  }
  els.push(label(X0 - 8, y0, '0', { 'text-anchor': 'end', 'font-size': 11 }));

  // traces
  const N = 480;
  p.traces.forEach((tr, i) => {
    let d = '';
    for (let j = 0; j <= N; j++) {
      const t = (duration * j) / N;
      d += `${j ? ' L' : 'M'} ${xOf(t).toFixed(2)} ${yOf(sample(tr, t) * k(tr)).toFixed(2)}`;
    }
    els.push(h('path', {
      d, fill: 'none', stroke: STROKE, 'stroke-width': i === 0 ? 2.5 : 2,
      'stroke-dasharray': i === 0 ? null : '7 5', class: `trace trace-${i + 1} draw`, pathLength: 1,
    }));
    if (tr.label || p.traces.length > 1) {
      const yEnd = yOf(sample(tr, duration) * k(tr));
      const dy = p.traces.length > 1 && i === 1 && Math.abs(yEnd - yOf(sample(p.traces[0], duration) * k(p.traces[0]))) < 14 ? 14 : 0;
      els.push(label(X1 + 6, yEnd + dy - 10, tr.label || `${sym}${i + 1}`, { 'text-anchor': 'start', 'font-size': 12, 'font-style': 'italic' }));
    }
  });

  // markers on the first trace
  const sc = siScale(t0.unit);
  const unitSI = Sym === 'I' ? 'A' : 'V';
  const valTxt = (v) => (p.show_values ? ` = ${formatSI(v * sc, unitSI)}` : '');
  const tPeak = ((((90 - t0.phase_deg) / 360) % 1) + 1) % 1 / t0.frequency_hz;
  const yTop = yOf(t0.offset + t0.amplitude);
  const yBot = yOf(t0.offset - t0.amplitude);
  if (p.markers.includes('peak')) {
    els.push(line(X0, yTop, xOf(tPeak), yTop, { 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    els.push(label(xOf(tPeak) + 8, yTop - 12, `${Sym === 'I' ? 'Î' : 'Û'}${valTxt(t0.amplitude)}`, { 'text-anchor': 'start', 'font-size': 12 }));
  }
  if (p.markers.includes('peak_to_peak')) {
    const x = Math.min(xOf(tPeak), X1 - 70);
    els.push(line(X0, yBot, X1, yBot, { 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    els.push(line(x, yTop + 9, x, yBot - 9, { 'stroke-width': 1.5 }), arrowHead(x, yTop, 0, -1, 8), arrowHead(x, yBot, 0, 1, 8));
    els.push(symLabel(x + 8, (yTop + yBot) / 2, Sym, 'pp', valTxt(2 * t0.amplitude), { 'text-anchor': 'start', 'font-size': 12, 'font-style': null }));
  }
  if (p.markers.includes('rms')) {
    const y = yOf(t0.offset + t0.amplitude / Math.SQRT2);
    els.push(line(X0, y, X1, y, { 'stroke-width': 1, 'stroke-dasharray': '1 4' }));
    els.push(symLabel(X1, y - 10, Sym, 'eff', p.show_values ? ` ≈ ${formatSI((t0.amplitude * sc) / Math.SQRT2, unitSI)}` : '', { 'text-anchor': 'end', 'font-size': 12 }));
  }
  if (p.markers.includes('period')) {
    const per = 1 / t0.frequency_hz;
    // first upward crossing of the offset level
    const tStart = ((((-t0.phase_deg / 360) % 1) + 1) % 1) * per;
    const a = xOf(tStart);
    const b = xOf(Math.min(tStart + per, duration));
    const y = YB + 22;
    els.push(line(a, YB + 8, a, y + 6, { 'stroke-width': 1 }), line(b, YB + 8, b, y + 6, { 'stroke-width': 1 }));
    els.push(line(a + 8, y, b - 8, y, { 'stroke-width': 1.5 }), arrowHead(a, y, -1, 0, 8), arrowHead(b, y, 1, 0, 8));
    els.push(label((a + b) / 2, y + 16, `T${p.show_values ? ` = ${formatSI(per, 's')}` : ''}`, { 'font-size': 12 }));
  }

  const descParts = p.traces.map((tr, i) => {
    const amp = p.show_values ? `toppverdi ${formatSI(tr.amplitude * siScale(tr.unit), unitSI)}` : 'toppverdi ikke oppgitt';
    const freq = p.show_values ? `, periode ${formatSI(1 / tr.frequency_hz, 's')}` : '';
    const off = tr.offset && p.show_values ? `, forskjøvet ${formatSI(tr.offset * siScale(tr.unit), unitSI)} fra null` : '';
    const dphi = tr.phase_deg - t0.phase_deg;
    const phase = i === 0 ? '' : dphi === 0 ? ', i fase med kurve 1'
      : `, ligger ${formatNumber(Math.abs(dphi))}° ${dphi < 0 ? 'etter' : 'foran'} kurve 1 (når toppen ${dphi < 0 ? 'senere' : 'tidligere'})`;
    return `${p.traces.length > 1 ? `Kurve ${i + 1}${i === 0 ? ' (heltrukket)' : ' (stiplet)'}: ` : ''}${SHAPE_NAME[tr.shape]} kurve med ${amp}${freq}${off}${phase}.`;
  });
  const markerNames = { peak: 'toppverdi', peak_to_peak: 'topp-til-topp-verdi', period: 'periodetid', rms: 'effektivverdi' };
  const description = `Graf over tid som viser ${formatNumber(p.cycles)} perioder. ${descParts.join(' ')}` +
    (p.markers.length ? ` Markert: ${p.markers.map((m) => markerNames[m]).join(', ')}.` : '');
  const title = p.traces.length > 1 ? 'To kurveformer over tid' : `${SHAPE_NAME[t0.shape][0].toUpperCase()}${SHAPE_NAME[t0.shape].slice(1)} kurve over tid`;
  return { svg: svgRoot(W, H, title, description, els), description, animatable: Boolean(p.animate) };
}

export default { id: 'waveform', version: 1, rules, quantities, render };
