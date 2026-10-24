// frequency-response@1: curves against frequency, computed from their definition.
// filter     – attenuation in dB of one or two band-pass filters, given by their −6 dB
//              and −60 dB widths (the shape between follows from the shape factor)
// resonance  – a resonance curve through its half-power points, optionally with a
//              frequency band marked on it (e.g. a signal sitting on the flank)
// spectrum   – the lines of an AM or FM signal modulated with one tone (FM line
//              heights are Bessel functions of the modulation index)
// coupled    – two identical coupled tuned circuits at up to three couplings
// 'blank' draws only the axes and a note, for curves that are shown after answering.

import { h } from '../render/vnode.js';
import { formatNumber, formatSI } from '../render/format.js';
import { arrowHead, label, line, svgRoot, symLabel, STROKE } from './svg.js';

/**
 * A frequency in Hz, kHz or MHz with the decimals it needs, and enough that two
 * frequencies `step` apart get different labels (7,098 / 7,100 / 7,102 MHz, not 7,1 MHz three times).
 */
export function formatFreq(f, step) {
  const [scale, unit] = f >= 1e6 ? [1e6, 'MHz'] : f >= 1e3 ? [1e3, 'kHz'] : [1, 'Hz'];
  const v = f / scale;
  // at least as many decimals as the value itself needs (12,5 kHz, not 13 kHz) …
  let own = 0;
  while (own < 3 && Math.abs(Math.round(v * 10 ** own) - v * 10 ** own) > 1e-6) own += 1;
  // … and enough that a step to the next frequency shows
  const dec = Math.max(own, Math.min(6, Math.ceil(-Math.log10(step / scale) - 1e-9)));
  return `${formatNumber(v, dec)} ${unit}`;
}

const NEEDS = { filter: 'filters', resonance: 'resonance', spectrum: 'spectrum', coupled: 'coupled' };
const PARTS = ['filters', 'resonance', 'band', 'spectrum', 'coupled'];
const DASH = [null, '7 5', '2 4'];

const present = (v) => (Array.isArray(v) ? v.length > 0 : v != null);

function rules(p) {
  const errors = [];
  const allowed = new Set([NEEDS[p.kind], ...(p.kind === 'resonance' ? ['band'] : [])]);
  for (const part of PARTS) if (!allowed.has(part) && present(p[part])) errors.push(`${part}: not used with kind '${p.kind}'`);
  if (!present(p[NEEDS[p.kind]])) {
    errors.push(`${NEEDS[p.kind]}: required for kind '${p.kind}'`);
    return errors;
  }
  if ((p.kind === 'resonance' || p.kind === 'spectrum') && p.center_hz == null) {
    errors.push(`center_hz: required for kind '${p.kind}'`);
    return errors;
  }
  if (p.center_label === 'value' && p.center_hz == null) errors.push("center_label: 'value' needs center_hz");
  if (p.kind === 'filter') {
    const fs = p.filters;
    fs.forEach((f, i) => { if (f.bw60_hz <= f.bw6_hz) errors.push(`filters[${i}]: the −60 dB width must be larger than the −6 dB width`); });
    if (fs.length === 2 && (!fs[0].name || !fs[1].name || fs[0].name === fs[1].name)) errors.push('filters: two filters need different names');
  } else if (p.kind === 'resonance') {
    const r = p.resonance;
    if (!(r.f_low_hz < p.center_hz && p.center_hz < r.f_high_hz)) errors.push('resonance: the half-power points must lie on each side of center_hz');
  } else if (p.kind === 'spectrum') {
    const s = p.spectrum;
    if (s.mode === 'am' && s.index > 1) errors.push('spectrum.index: an AM modulation index above 1 is overmodulation');
    if (p.center_hz <= 15 * s.mod_hz) errors.push('spectrum: the carrier must be far above the tone frequency');
    if (s.mode === 'fm' && s.freq_labels === 'all') errors.push("spectrum.freq_labels: 'all' is only for AM (FM has too many lines)");
  }
  return errors;
}

function quantities(p) {
  const q = {};
  const vis = !p.blank;
  if (p.kind === 'filter') {
    p.filters.forEach((f) => {
      const suf = p.filters.length === 1 ? '' : `_${f.name}`;
      q[`B6${suf}`] = { value: f.bw6_hz, unit: 'Hz', shown: vis && f.bw6_label === 'value' };
      q[`B60${suf}`] = { value: f.bw60_hz, unit: 'Hz', shown: vis && f.bw60_label === 'value' };
      q[`SF${suf}`] = { value: f.bw60_hz / f.bw6_hz, unit: '', shown: false };
    });
  } else if (p.kind === 'resonance') {
    const r = p.resonance;
    const b = r.f_high_hz - r.f_low_hz;
    q.f0 = { value: p.center_hz, unit: 'Hz', shown: vis && p.center_label === 'value' };
    q.f1 = { value: r.f_low_hz, unit: 'Hz', shown: vis && r.points_label === 'value' };
    q.f2 = { value: r.f_high_hz, unit: 'Hz', shown: vis && r.points_label === 'value' };
    q.B = { value: b, unit: 'Hz', shown: false };
    q.Q = { value: p.center_hz / b, unit: '', shown: vis && r.q_label === 'value' };
  } else if (p.kind === 'spectrum') {
    const s = p.spectrum;
    q.f_c = { value: p.center_hz, unit: 'Hz', shown: vis && s.freq_labels !== 'none' };
    q.f_m = { value: s.mod_hz, unit: 'Hz', shown: vis && s.spacing_label };
    if (s.mode === 'am') {
      q.f_lsb = { value: p.center_hz - s.mod_hz, unit: 'Hz', shown: vis && s.freq_labels === 'all' };
      q.f_usb = { value: p.center_hz + s.mod_hz, unit: 'Hz', shown: vis && s.freq_labels === 'all' };
    } else {
      q.deviation = { value: s.index * s.mod_hz, unit: 'Hz', shown: false };
    }
  }
  return q;
}

/** Bessel function of the first kind, J_n(x), by its power series (fine for x ≤ 12). */
export function besselJ(n, x) {
  let term = (x / 2) ** n;
  for (let i = 2; i <= n; i++) term /= i;
  let sum = term;
  for (let k = 1; k < 80; k++) {
    term *= -((x / 2) ** 2) / (k * (k + n));
    sum += term;
    if (Math.abs(term) < 1e-14) break;
  }
  return sum;
}

/** Spectrum lines as [offset in multiples of the tone frequency, relative amplitude]. */
export function spectrumLines(s) {
  if (s.mode === 'am') return [[-1, s.index / 2], [0, 1], [1, s.index / 2]];
  const n = Math.min(14, Math.ceil(s.index + 2));
  const out = [];
  for (let k = -n; k <= n; k++) {
    const a = Math.abs(besselJ(Math.abs(k), s.index));
    if (a >= 0.005) out.push([k, a]);
  }
  return out;
}

/** Response of two identical coupled tuned circuits; 1 at the peak of critical coupling. */
export function coupledResponse(kq, u) {
  return (2 * kq) / Math.hypot(1 + kq * kq - u * u, 2 * u);
}

const W = 560;
const X0 = 70;
const X1 = 510;
const YT = 44;
const YB = 236;

function axes(els, yName) {
  els.push(line(X0, YB + 6, X0, YT - 16), arrowHead(X0, YT - 22, 0, -1));
  els.push(line(X0 - 6, YB, X1 + 18, YB), arrowHead(X1 + 26, YB, 1, 0));
  els.push(label(X0 - 6, YT - 30, yName, { 'text-anchor': 'end', 'font-size': 13 }));
  els.push(label(X1 + 26, YB - 14, 'f', { 'text-anchor': 'end', 'font-size': 13, 'font-style': 'italic' }));
}

function path(fn, x0, x1, xOf, yOf, extra = {}) {
  const N = 400;
  let d = '';
  for (let j = 0; j <= N; j++) {
    const f = x0 + ((x1 - x0) * j) / N;
    d += `${j ? ' L' : 'M'} ${xOf(f).toFixed(2)} ${yOf(fn(f)).toFixed(2)}`;
  }
  return h('path', { d, fill: 'none', stroke: STROKE, 'stroke-width': 2.5, 'stroke-linejoin': 'round', ...extra });
}

function hDim(els, xa, xb, y) {
  els.push(line(xa + 7, y, xb - 7, y, { 'stroke-width': 1.5 }), arrowHead(xa, y, -1, 0, 7), arrowHead(xb, y, 1, 0, 7));
}

function centerTick(els, x, p, y = YB, fmt = (v) => formatSI(v, 'Hz')) {
  if (p.center_label === 'none') return;
  els.push(line(x, y - 4, x, y + 4, { 'stroke-width': 1.5 }));
  if (p.center_label === 'value') els.push(label(x, y + 16, fmt(p.center_hz), { 'font-size': 11 }));
  else els.push(symLabel(x, y + 16, 'f', '0', null, { 'font-size': 12 }));
}

function note(els, p) {
  if (p.note) els.push(label((X0 + X1) / 2, (YT + YB) / 2, p.note, { 'font-size': 14, opacity: 0.75 }));
}

const bwText = (mode, v) => (mode === 'value' ? ` = ${formatSI(v, 'Hz')}` : mode === 'unknown' ? ' = ?' : null);
const bwDesc = (mode, v) => (mode === 'value' ? formatSI(v, 'Hz') : mode === 'unknown' ? 'ukjent (?)' : mode === 'name' ? 'markert' : null);

function bwLabel(x, y, pre, sub, mode, v) {
  const rest = bwText(mode, v);
  return h('text', { x, y, 'font-size': 12, fill: STROKE, 'text-anchor': 'middle', 'dominant-baseline': 'middle' },
    pre ? h('tspan', {}, pre.replace(/ /g, '\u00a0')) : null,
    h('tspan', { 'font-style': 'italic' }, 'B'), h('tspan', { dy: 4, 'font-size': 9 }, sub),
    rest ? h('tspan', { dy: -4, dx: 4 }, rest.trimStart().replace(/ /g, '\u00a0')) : null);
}

// --- filter ---------------------------------------------------------------------
function renderFilter(p, els) {
  const fs = p.filters;
  const half = 0.6 * Math.max(...fs.map((f) => f.bw60_hz));
  const xOf = (f) => X0 + ((f + half) / (2 * half)) * (X1 - X0);
  const yOf = (db) => YT + (Math.min(80, -db) / 80) * (YB - YT);
  axes(els, 'dB');
  for (const db of [0, -6, -20, -40, -60, -80]) {
    const y = yOf(db);
    els.push(line(X0 - 4, y, X0 + 4, y, { 'stroke-width': 1.5 }), label(X0 - 8, y, formatNumber(db), { 'text-anchor': 'end', 'font-size': 11 }));
  }
  centerTick(els, xOf(0), p);
  const desc = ['Filterkurve: demping i dB mot frekvens, med 0 dB øverst og kurvens midte ved senterfrekvensen.'];
  if (p.blank) { note(els, p); return desc; }
  const att = (f) => (x) => -6 * (Math.abs(x) / (f.bw6_hz / 2)) ** (1 / Math.log10(f.bw60_hz / f.bw6_hz));
  const guides = new Set();
  fs.forEach((f, i) => {
    // the curve ends where it reaches the bottom of the scale (−80 dB)
    const edge = Math.min(half, (f.bw6_hz / 2) * (80 / 6) ** Math.log10(f.bw60_hz / f.bw6_hz));
    els.push(path(att(f), -edge, edge, xOf, yOf, { 'stroke-dasharray': DASH[i], class: `trace trace-${i + 1}` }));
    if (f.name) {
      const x40 = (f.bw6_hz / 2) * (40 / 6) ** Math.log10(f.bw60_hz / f.bw6_hz);
      els.push(label(xOf(x40) + 8, yOf(-40), f.name, { 'text-anchor': 'start', 'font-size': 13, 'font-weight': 'bold' }));
    }
    if (f.bw6_label !== 'none') guides.add(-6);
    if (f.bw60_label !== 'none') guides.add(-60);
  });
  for (const db of guides) els.push(line(X0, yOf(db), X1, yOf(db), { 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0.6 }));
  // width markers: −6 dB labels below the arrow (inside the curve), −60 dB labels
  // above it for the first filter and below it for the second
  const six = [];
  for (const f of fs) {
    if (f.bw6_label === 'none') continue;
    const same = six.find((g) => g.f.bw6_hz === f.bw6_hz && g.f.bw6_label === f.bw6_label);
    if (same) same.names.push(f.name);
    else six.push({ f, names: [f.name] });
  }
  six.forEach(({ f, names }, j) => {
    const y = yOf(-6);
    hDim(els, xOf(-f.bw6_hz / 2), xOf(f.bw6_hz / 2), y);
    els.push(bwLabel(xOf(0), y + 16 + 16 * j, six.length > 1 ? `${names.join(', ')}: ` : '', '6', f.bw6_label, f.bw6_hz));
  });
  fs.forEach((f, i) => {
    if (f.bw60_label === 'none') return;
    const y = yOf(-60);
    hDim(els, xOf(-f.bw60_hz / 2), xOf(f.bw60_hz / 2), y);
    els.push(bwLabel(xOf(0), i === 0 ? y - 12 : y + 16, fs.length > 1 ? `${f.name}: ` : '', '60', f.bw60_label, f.bw60_hz));
  });
  fs.forEach((f, i) => {
    const who = fs.length > 1 ? `Filter ${f.name} (${i === 0 ? 'heltrukket' : 'stiplet'})` : 'Filteret';
    const parts = [];
    const b6 = bwDesc(f.bw6_label, f.bw6_hz);
    const b60 = bwDesc(f.bw60_label, f.bw60_hz);
    if (b6) parts.push(`båndbredden ved −6 dB er ${b6}`);
    if (b60) parts.push(`båndbredden ved −60 dB er ${b60}`);
    desc.push(`${who}${parts.length ? `: ${parts.join(', og ')}` : ' er tegnet uten mål'}.`);
  });
  if (fs.length === 2) {
    const steep = fs[0].bw60_hz / fs[0].bw6_hz < fs[1].bw60_hz / fs[1].bw6_hz ? fs[0] : fs[1];
    desc.push(`Flankene til filter ${steep.name} er brattere.`);
  }
  return desc;
}

// --- resonance ------------------------------------------------------------------
function renderResonance(p, els) {
  const r = p.resonance;
  const f0 = p.center_hz;
  const bl = f0 - r.f_low_hz;
  const bh = r.f_high_hz - f0;
  let lo = f0 - 2.8 * bl;
  let hi = f0 + 2.8 * bh;
  if (p.band) {
    lo = Math.min(lo, p.band.center_hz - p.band.half_width_hz - bl);
    hi = Math.max(hi, p.band.center_hz + p.band.half_width_hz + bh);
  }
  lo = Math.max(lo, 0);
  const xOf = (f) => X0 + ((f - lo) / (hi - lo)) * (X1 - X0);
  const yOf = (a) => YB - (a / 1.15) * (YB - YT);
  const amp = (f) => 1 / Math.hypot(1, (f - f0) / (f < f0 ? bl : bh));
  const fq = (f) => formatFreq(f, Math.min(bl, bh));
  axes(els, 'Amplitude');
  const desc = [];
  if (p.blank) {
    centerTick(els, xOf(f0), p, YB, fq);
    note(els, p);
    return ['Tomt diagram: amplitude mot frekvens.'];
  }
  if (p.band) {
    const b = p.band;
    const xa = xOf(b.center_hz - b.half_width_hz);
    const xb = xOf(b.center_hz + b.half_width_hz);
    els.push(h('rect', { x: xa, y: YT - 8, width: xb - xa, height: YB - YT + 8, fill: STROKE, opacity: 0.12 }));
    if (b.label) els.push(label((xa + xb) / 2, YT - 18, b.label, { 'font-size': 12 }));
    const side = b.center_hz < f0 - bl / 2 ? 'den venstre flanken' : b.center_hz > f0 + bh / 2 ? 'den høyre flanken' : 'toppen';
    desc.push(`Et frekvensområde${b.label ? ` (${b.label})` : ''} er skyggelagt på ${side} av kurven.`);
    if (b.project) {
      const ys = [b.center_hz - b.half_width_hz, b.center_hz + b.half_width_hz].map((f) => [xOf(f), yOf(amp(f))]);
      for (const [x, y] of ys) {
        els.push(line(X0, y, x, y, { 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }), h('circle', { cx: x, cy: y, r: 3.5, fill: STROKE }));
      }
      const [ya, yb] = [ys[0][1], ys[1][1]].sort((m, n) => m - n);
      if (yb - ya > 14) els.push(line(X0 + 14, ya + 7, X0 + 14, yb - 7, { 'stroke-width': 1.5 }), arrowHead(X0 + 14, ya, 0, -1, 7), arrowHead(X0 + 14, yb, 0, 1, 7));
      els.push(label(X0 + 22, (ya + yb) / 2, 'amplitudeendring', { 'font-size': 11, 'text-anchor': 'start' }));
      desc.push('Stiplede linjer fra kurven til amplitudeaksen viser at amplituden endrer seg når frekvensen varierer innenfor området.');
    }
  }
  els.push(path(amp, lo, hi, xOf, yOf, { class: 'trace trace-1' }));
  // levels 1 and 0,707
  for (const [a, t] of r.points_label === 'none' ? [[1, '1']] : [[1, '1'], [Math.SQRT1_2, '0,707']]) {
    els.push(line(X0 - 4, yOf(a), X0 + 4, yOf(a), { 'stroke-width': 1.5 }), label(X0 - 8, yOf(a), t, { 'text-anchor': 'end', 'font-size': 11 }));
  }
  const ptsDesc = [];
  if (r.points_label !== 'none') {
    const y7 = yOf(Math.SQRT1_2);
    els.push(line(X0, y7, xOf(r.f_high_hz), y7, { 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    [[r.f_low_hz, '1'], [r.f_high_hz, '2']].forEach(([f, sub]) => {
      const x = xOf(f);
      els.push(line(x, y7, x, YB, { 'stroke-width': 1, 'stroke-dasharray': '3 3' }), h('circle', { cx: x, cy: y7, r: 3.5, fill: STROKE }));
      if (r.points_label === 'value') els.push(label(x, YB + 16, fq(f), { 'font-size': 11 }));
      else els.push(symLabel(x, YB + 16, 'f', sub, null, { 'font-size': 12 }));
    });
    ptsDesc.push(r.points_label === 'value'
      ? `Halveffektspunktene, der amplituden er 0,707 av toppen, er markert ved ${fq(r.f_low_hz)} og ${fq(r.f_high_hz)}.`
      : 'Halveffektspunktene, der amplituden er 0,707 av toppen, er markert som f1 og f2.');
  }
  // the centre label sits one line lower when the half-power points are labelled
  centerTick(els, xOf(f0), p, r.points_label === 'none' ? YB : YB + 16, fq);
  if (r.points_label !== 'none' && p.center_label !== 'none') els.push(line(xOf(f0), YB, xOf(f0), YB + 20, { 'stroke-width': 1, opacity: 0.6 }));
  const f0Text = p.center_label === 'value' ? ` (${fq(f0)})` : '';
  desc.unshift(`Resonanskurve: amplitude mot frekvens, med toppen ved resonansfrekvensen f0${f0Text}.`, ...ptsDesc);
  if (r.q_label !== 'none') {
    const qText = r.q_label === 'value' ? ` = ${formatNumber(Number((f0 / (r.f_high_hz - r.f_low_hz)).toPrecision(3)))}` : ' = ?';
    els.push(symLabel(X1, YT - 4, 'Q', null, qText, { 'font-size': 14, 'text-anchor': 'end' }));
    desc.push(r.q_label === 'value' ? `Q-faktoren er ${qText.slice(3)}.` : 'Q-faktoren er markert med spørsmålstegn.');
  }
  return desc;
}

// --- spectrum -------------------------------------------------------------------
function renderSpectrum(p, els) {
  const s = p.spectrum;
  const fc = p.center_hz;
  const lines = spectrumLines(s);
  const n = Math.max(...lines.map(([k]) => Math.abs(k)));
  const span = (n + (s.mode === 'am' ? 1.5 : 1.2)) * s.mod_hz;
  const xOf = (f) => X0 + ((f - fc + span) / (2 * span)) * (X1 - X0);
  const yOf = (a) => YB - (a / 1.15) * (YB - YT);
  axes(els, 'Amplitude');
  const label0 = s.freq_labels !== 'none';
  if (p.blank) {
    if (label0) els.push(line(xOf(fc), YB - 4, xOf(fc), YB + 4, { 'stroke-width': 1.5 }), label(xOf(fc), YB + 16, formatFreq(fc, s.mod_hz), { 'font-size': 11 }));
    note(els, p);
    return ['Tomt diagram: amplitude mot frekvens.'];
  }
  for (const [k, a] of lines) {
    const x = xOf(fc + k * s.mod_hz);
    els.push(line(x, YB, x, yOf(a), { 'stroke-width': 3.5, 'stroke-linecap': 'butt' }));
    if (s.freq_labels === 'all' || (k === 0 && s.freq_labels === 'carrier')) {
      els.push(label(x, YB + 16, formatFreq(fc + k * s.mod_hz, s.mod_hz), { 'font-size': 11 }));
    }
  }
  if (s.spacing_label) {
    const a0 = lines.find(([k]) => k === 0);
    const a1 = lines.find(([k]) => k === 1);
    const y = Math.min(yOf(a0 ? a0[1] : 0), yOf(a1 ? a1[1] : 0)) - 14;
    const xa = xOf(fc);
    const xb = xOf(fc + s.mod_hz);
    els.push(line(xa, y - 6, xa, y + 6, { 'stroke-width': 1 }), line(xb, y - 6, xb, y + 6, { 'stroke-width': 1 }));
    hDim(els, xa, xb, y);
    els.push(label(xb + 6, y - 12, formatSI(s.mod_hz, 'Hz'), { 'font-size': 12, 'text-anchor': 'start' }));
  }
  const desc = [];
  if (s.mode === 'am') {
    const f = (v) => formatFreq(v, s.mod_hz);
    desc.push(s.freq_labels === 'all'
      ? `Spekteret til et AM-signal: bærebølgen i midten (${f(fc)}) og ett sidebånd på hver side (${f(fc - s.mod_hz)} og ${f(fc + s.mod_hz)}), begge lavere enn bærebølgen.`
      : 'Spekteret til et AM-signal: bærebølgen i midten og ett lavere sidebånd på hver side.');
  } else {
    desc.push(`Spekteret til et FM-signal modulert med én tone: bærebølgen og ${lines.length - 1} sidebåndslinjer med lik avstand fordelt på begge sider. Høyden varierer fra linje til linje.`);
    if (s.freq_labels === 'carrier') desc.push(`Bærebølgen ligger på ${formatFreq(fc, s.mod_hz)}.`);
  }
  if (s.spacing_label) desc.push(`Avstanden mellom to nabolinjer er markert: ${formatSI(s.mod_hz, 'Hz')}.`);
  return desc;
}

// --- coupled --------------------------------------------------------------------
const COUPLING = (k) => (k < 0.995 ? 'under kritisk' : k > 1.005 ? 'over kritisk' : 'kritisk');

function renderCoupled(p, els) {
  const ks = p.coupled.kq;
  const peak = Math.sqrt(Math.max(0, Math.max(...ks) ** 2 - 1));
  const half = Math.max(3, peak + 2);
  const xOf = (u) => X0 + ((u + half) / (2 * half)) * (X1 - X0);
  const yOf = (a) => YB - (a / 1.2) * (YB - YT);
  axes(els, 'Amplitude');
  centerTick(els, xOf(0), p);
  if (p.blank) { note(els, p); return ['Tomt diagram: amplitude mot frekvens.']; }
  const order = ks.map((k, i) => [k, i]).sort((a, b) => a[0] - b[0]);
  const desc = ['Frekvensrespons for to like, koblede avstemte kretser ved ulik kobling.'];
  order.forEach(([k], j) => {
    els.push(path((u) => coupledResponse(k, u), -half, half, xOf, yOf, { 'stroke-dasharray': DASH[j], class: `trace trace-${j + 1}` }));
    const name = COUPLING(k);
    const style = ['heltrukket', 'stiplet', 'prikket'][j];
    // legend in the top right corner, above the curves
    const ly = 12 + 16 * j;
    els.push(line(X1 - 150, ly, X1 - 118, ly, { 'stroke-width': 2.5, 'stroke-dasharray': DASH[j] }));
    els.push(label(X1 - 110, ly, `${name} kobling`, { 'font-size': 12, 'text-anchor': 'start' }));
    if (k > 1.005) desc.push(`${name[0].toUpperCase()}${name.slice(1)} kobling (${style}): to topper med et søkk i midten, og en bredere kurve.`);
    else if (k < 0.995) desc.push(`Under kritisk kobling (${style}): én lav, avrundet topp.`);
    else desc.push(`Kritisk kobling (${style}): én topp med flat, bred overside.`);
  });
  return desc;
}

const TITLES = { filter: 'Filterkurve', resonance: 'Resonanskurve', spectrum: 'Frekvensspekter', coupled: 'Koblede avstemte kretser' };

function render(p) {
  const els = [];
  const desc = { filter: renderFilter, resonance: renderResonance, spectrum: renderSpectrum, coupled: renderCoupled }[p.kind](p, els);
  if (p.blank && p.note) desc.push(p.note.endsWith('.') ? p.note : `${p.note}.`);
  const description = desc.join(' ');
  return { svg: svgRoot(W, 290, TITLES[p.kind], description, els, {}, 0, 0), description, animatable: false };
}

export default { id: 'frequency-response', version: 1, rules, quantities, render };
