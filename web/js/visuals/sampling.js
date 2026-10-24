// sampling@1: digital signal processing, computed from the definitions:
// samples        – a sine sampled at f_s: the samples as dots on stems, optionally the
//                  analogue signal and the lowest-frequency sine through the samples
//                  (the alias, when the signal lies above f_s / 2)
// quantize       – one period of a sine rounded to the levels of an n-bit converter and
//                  held until the next sample, optionally with the step and the error
// moving_average – a noisy pulse and the output of an N-point moving average (FIR)
// fir_iir        – the structure of a FIR filter (no feedback) and an IIR filter (feedback)
// bits and taps may be fractional (animations); they are rounded to whole numbers.

import { h } from '../render/vnode.js';
import { formatNumber, formatSI } from '../render/format.js';
import { arrowHead, label, line, svgRoot, symLabel, STROKE } from './svg.js';
import { formatFreq } from './frequency-response.js';

const W = 560;
const TITLE = { samples: 'Sampling', quantize: 'Kvantisering', moving_average: 'Glidende middel', fir_iir: 'FIR- og IIR-filter' };
const IDEAL = {
  samples: 'Ideelle sampler, tatt i et øyeblikk med nøyaktig like mellomrom.',
  quantize: 'Ideell A/D-omformer med like store trinn; hver avlesning holdes til neste.',
  moving_average: 'Støyen er et fast, tilfeldig mønster; utgangen er regnet ut nøyaktig.',
  fir_iir: 'Forenklet prinsippskisse med få ledd.',
};

function rules(p) {
  const errors = [];
  if (p.kind === 'samples' && p.f_hz > 2 * p.fs_hz) errors.push('f_hz: at most twice fs_hz');
  if (p.kind === 'quantize' && !(p.range_max_v > p.range_min_v)) errors.push('range_max_v: must be above range_min_v');
  if (p.show_reconstruction && p.kind !== 'samples') errors.push("show_reconstruction: only for kind 'samples'");
  if (p.kind !== 'quantize' && (p.show_error || p.levels_label || p.step_label !== 'none')) errors.push("show_error, levels_label, step_label: only for kind 'quantize'");
  return errors;
}

const fmtF = (f) => formatFreq(f, f);
const fmtV = (v) => (v < 0 ? `−${formatSI(-v, 'V')}` : formatSI(v, 'V'));
const txt = (x, y, s, size = 12, anchor = 'middle', extra = {}) => label(x, y, s, { 'font-size': size, 'text-anchor': anchor, ...extra });
const path = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');

/** A legend row: [kind, text] with kind 'solid', 'thin', 'dashed', 'dot' or 'stair'. */
function legend(els, x, y, items) {
  for (const [kind, t] of items) {
    if (kind === 'dot') els.push(line(x + 10, y + 6, x + 10, y - 2, { 'stroke-width': 1.5 }), h('circle', { cx: x + 10, cy: y - 3, r: 3.5, fill: STROKE }));
    else if (kind === 'stair') els.push(h('path', { d: `M ${x} ${y + 4} H ${x + 10} V ${y - 4} H ${x + 22}`, fill: 'none', stroke: STROKE, 'stroke-width': 2.5 }));
    else els.push(line(x, y, x + 22, y, { 'stroke-width': kind === 'thin' ? 1.5 : 2.5, 'stroke-dasharray': kind === 'dashed' ? '6 4' : null }));
    els.push(txt(x + 28, y, t, 12, 'start'));
    x += 40 + t.length * 6.6;
  }
}

// --- samples --------------------------------------------------------------------

/** The lowest-frequency sine through the samples: f folded into [−f_s/2, f_s/2]. */
export function aliasFrequency(f, fs) {
  return f / fs <= 0.5 + 1e-9 ? f : f - Math.round(f / fs) * fs;
}

function drawSamples(els, p) {
  const X0 = 40;
  const X1 = 510;
  const YT = 60;
  const YB = 220;
  const y0 = (YT + YB) / 2;
  const dur = p.samples_shown / p.fs_hz;
  const xOf = (t) => X0 + ((X1 - X0) * t) / dur;
  const yOf = (v) => y0 - (v * (YB - YT)) / 2.4;
  const ph = (p.phase_deg * Math.PI) / 180;
  const sig = (f) => (t) => Math.sin(2 * Math.PI * f * t + ph);
  const fa = aliasFrequency(p.f_hz, p.fs_hz);
  const curve = (fn) => path(Array.from({ length: 901 }, (_, j) => [xOf((dur * j) / 900), yOf(fn((dur * j) / 900))]));
  if (p.show_values) {
    els.push(h('text', { x: X0, y: 18, 'font-size': 13, fill: STROKE, 'dominant-baseline': 'middle' },
      h('tspan', { 'font-style': 'italic' }, 'f'), ` = ${fmtF(p.f_hz).replace(' ', ' ')}     `,
      h('tspan', { 'font-style': 'italic' }, 'f'), h('tspan', { dy: 4, 'font-size': 10 }, 's'),
      h('tspan', { dy: -4 }, ` = ${fmtF(p.fs_hz).replace(' ', ' ')}`)));
  }
  const items = [];
  if (p.show_analog) items.push(['thin', 'signalet']);
  items.push(['dot', 'sampler']);
  if (p.show_reconstruction) items.push(['dashed', 'det samplene viser']);
  legend(els, X0, 42, items);
  els.push(line(X0, YT - 4, X0, YB + 4, { 'stroke-width': 1.5 }), line(X0, y0, X1 + 14, y0, { 'stroke-width': 1.5 }), arrowHead(X1 + 20, y0, 1, 0, 8));
  els.push(txt(X1 + 20, y0 + 14, 't', 13, 'end', { 'font-style': 'italic' }));
  if (p.show_analog) els.push(h('path', { d: curve(sig(p.f_hz)), fill: 'none', stroke: STROKE, 'stroke-width': 1.5 }));
  if (p.show_reconstruction) els.push(h('path', { d: curve(sig(fa)), fill: 'none', stroke: STROKE, 'stroke-width': 2.5, 'stroke-dasharray': '7 5' }));
  for (let n = 0; n < p.samples_shown; n++) {
    const t = n / p.fs_hz;
    const v = sig(p.f_hz)(t);
    els.push(line(xOf(t), y0, xOf(t), yOf(v), { 'stroke-width': 1.5 }), h('circle', { cx: xOf(t), cy: yOf(v), r: 4, fill: STROKE }));
  }
  const per = p.fs_hz / p.f_hz;
  const d = [];
  d.push(`Et sinussignal${p.show_values ? ` på ${fmtF(p.f_hz)}` : ''} blir samplet${p.show_values ? ` med en samplingsfrekvens på ${fmtF(p.fs_hz)}` : ''}: ${formatNumber(Number(per.toPrecision(2)))} sampler per periode av signalet.`);
  d.push(`Prikkene på loddrette streker er samplene, ${p.samples_shown} i alt.`);
  if (p.show_analog) d.push('Den tynne, heltrukne kurven er signalet.');
  if (p.show_reconstruction) {
    if (Math.abs(Math.abs(fa) - p.f_hz) < 1e-9 * p.f_hz) d.push('Den stiplede kurven er den laveste frekvensen som går gjennom alle samplene, og den faller sammen med signalet: samplene gjengir signalet riktig.');
    else d.push(`Signalet ligger over halve samplingsfrekvensen${p.show_values ? ` (${fmtF(p.fs_hz / 2)})` : ''}. Den stiplede kurven er den laveste frekvensen som går gjennom alle samplene${p.show_values ? `, ${fmtF(Math.abs(fa))}` : ''}: samplene ser ut som et signal på en lavere, feil frekvens.`);
  }
  return { height: 238, desc: `${d.join(' ')}` };
}

// --- quantize -------------------------------------------------------------------

export function quantizer(p) {
  const bits = Math.round(p.bits);
  const L = 2 ** bits;
  const step = (p.range_max_v - p.range_min_v) / L;
  const q = (v) => {
    const k = Math.min(L - 1, Math.max(0, Math.floor((v - p.range_min_v) / step)));
    return { k, v: p.range_min_v + (k + 0.5) * step };
  };
  return { bits, L, step, q };
}

function drawQuantize(els, p) {
  const { bits, L, step, q } = quantizer(p);
  const X0 = 64;
  const X1 = 410;
  const YT = 52;
  const YB = 252;
  const mid = (p.range_max_v + p.range_min_v) / 2;
  const half = (p.range_max_v - p.range_min_v) / 2;
  const xOf = (t) => X0 + (X1 - X0) * t; // one period, t from 0 to 1
  const yOf = (v) => (YT + YB) / 2 - ((v - mid) / (1.5 * half)) * ((YB - YT) / 2);
  const sig = (t) => mid + p.amplitude * half * Math.sin(2 * Math.PI * t);
  const S = p.samples_per_period;
  const held = Array.from({ length: S }, (_, n) => ({ t: n / S, s: sig(n / S), ...q(sig(n / S)) }));

  const items = [['thin', 'signalet'], ['stair', 'avrundet verdi']];
  legend(els, X0, 18, items);
  if (p.levels_label) els.push(txt(X1, 18, `${bits} bit: ${L} nivåer`, 13, 'end', { 'font-weight': 'bold' }));
  // the converter's range and, when there are few, its levels
  for (const [v, name] of [[p.range_max_v, 'maks'], [p.range_min_v, 'min']]) {
    els.push(line(X0, yOf(v), X1, yOf(v), { 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }));
    els.push(txt(X0 - 6, yOf(v), p.show_values ? fmtV(v) : name, 11, 'end'));
  }
  if (L <= 16) for (let k = 0; k < L; k++) els.push(line(X0, yOf(p.range_min_v + (k + 0.5) * step), X1, yOf(p.range_min_v + (k + 0.5) * step), { 'stroke-width': 0.8, opacity: 0.35 }));
  els.push(line(X0, YT - 6, X0, YB + 6, { 'stroke-width': 1.5 }));
  els.push(line(X0, yOf(mid), X1 + 10, yOf(mid), { 'stroke-width': 1.5 }), arrowHead(X1 + 16, yOf(mid), 1, 0, 8), txt(X1 + 16, yOf(mid) + 14, 't', 13, 'end', { 'font-style': 'italic' }));
  els.push(h('path', { d: path(Array.from({ length: 401 }, (_, j) => [xOf(j / 400), yOf(sig(j / 400))])), fill: 'none', stroke: STROKE, 'stroke-width': 1.5 }));
  let d = '';
  held.forEach((s, n) => { d += `${n ? ' V' : 'M'} ${n ? yOf(s.v).toFixed(2) : `${xOf(0).toFixed(2)} ${yOf(s.v).toFixed(2)}`} H ${xOf((n + 1) / S).toFixed(2)}`; });
  els.push(h('path', { d, fill: 'none', stroke: STROKE, 'stroke-width': 2.8, 'stroke-linejoin': 'round' }));
  for (const s of held) els.push(h('circle', { cx: xOf(s.t), cy: yOf(s.v), r: 2.6, fill: STROKE }));
  // the step between the two highest levels, clear of the time axis
  if (p.step_label !== 'none') {
    const ka = L - 2;
    const ya = yOf(p.range_min_v + (ka + 0.5) * step);
    const yb = yOf(p.range_min_v + (ka + 1.5) * step);
    const xm = X1 + 26;
    els.push(line(X1 + 2, ya, xm + 6, ya, { 'stroke-width': 1.2 }), line(X1 + 2, yb, xm + 6, yb, { 'stroke-width': 1.2 }), line(xm, ya, xm, yb, { 'stroke-width': 1.5 }));
    if (ya - yb >= 14) els.push(arrowHead(xm, yb, 0, -1, 6), arrowHead(xm, ya, 0, 1, 6));
    els.push(h('text', { x: xm + 10, y: (ya + yb) / 2, 'font-size': 13, fill: STROKE, 'dominant-baseline': 'middle' },
      'Δ', h('tspan', { 'font-style': 'italic' }, 'U'), p.step_label === 'value' ? ` = ${fmtV(step).replace(' ', ' ')}` : ''));
  }
  const used = new Set(held.map((s) => s.k)).size;
  const clipped = p.amplitude > 1;
  const desc = [];
  desc.push(`Én periode av et sinussignal og verdien en A/D-omformer på ${bits} bit gir for det. Måleområdet${p.show_values ? ` fra ${fmtV(p.range_min_v)} til ${fmtV(p.range_max_v)}` : ''} er delt i ${L} like store trinn${p.step_label === 'value' ? ` på ${fmtV(step)}` : ''}, med et nivå midt i hvert trinn.`);
  desc.push(`Signalet leses av ${S} ganger i perioden. Hver avlesning rundes av til nærmeste nivå og holdes til neste avlesning, så det avrundede signalet blir en trapp som bruker ${used} av de ${L} nivåene.`);
  if (clipped) desc.push('Signalet går utenfor måleområdet, og toppene blir kuttet av ved det øverste og nederste nivået.');
  else if (p.amplitude <= 0.6) desc.push(`Signalet bruker bare omtrent ${Math.round(p.amplitude * 100)} % av måleområdet.`);
  let height = 270;
  if (p.show_error) {
    const top = 292;
    const bot = 372;
    const yc = (top + bot) / 2;
    const errs = held.map((s) => s.v - s.s);
    const big = Math.max(step * 0.75, ...errs.map(Math.abs));
    const yE = (e) => yc - (e / big) * ((bot - top) / 2);
    els.push(txt(X0, top - 12, 'Avrundingsfeil i hver avlesning', 12, 'start', { 'font-weight': 'bold' }));
    els.push(line(X0, yc, X1 + 10, yc, { 'stroke-width': 1.5 }), arrowHead(X1 + 16, yc, 1, 0, 8));
    for (const s of [1, -1]) {
      els.push(line(X0, yE((s * step) / 2), X1, yE((s * step) / 2), { 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
      els.push(txt(X0 - 6, yE((s * step) / 2), s > 0 ? '+½ trinn' : '−½ trinn', 11, 'end'));
    }
    held.forEach((s, n) => els.push(line(xOf(s.t), yc, xOf(s.t), yE(errs[n]), { 'stroke-width': 1.5 }), h('circle', { cx: xOf(s.t), cy: yE(errs[n]), r: 3, fill: STROKE })));
    desc.push(`Under: avrundingsfeilen i hver avlesning, forskjellen mellom trappen og signalet. ${clipped ? 'Den holder seg innenfor et halvt trinn, unntatt der toppene er kuttet; der blir den mye større.' : 'Den holder seg alltid innenfor et halvt trinn, og den gjentar seg likt i hver periode.'}`);
    height = bot + 14;
  }
  return { height, desc: desc.join(' ') };
}

// --- moving average ----------------------------------------------------------------

const N_IN = 64;
// a fixed pseudo-random sequence in [−1, 1] (linear congruential generator), the same every time
const NOISE = (() => {
  let s = 12345;
  return Array.from({ length: N_IN }, () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s / 2147483648) * 2 - 1;
  });
})();

export function movingAverage(p) {
  const taps = Math.round(p.taps);
  const x = Array.from({ length: N_IN }, (_, n) => (n >= 14 && n < 42 ? 1 : 0) + p.noise * NOISE[n]);
  const y = x.map((_, n) => {
    let sum = 0;
    for (let m = n - taps + 1; m <= n; m++) sum += m >= 0 ? x[m] : 0;
    return sum / taps;
  });
  return { taps, x, y };
}

function drawMovingAverage(els, p) {
  const { taps, x, y } = movingAverage(p);
  const X0 = 40;
  const X1 = 510;
  const xOf = (n) => X0 + ((X1 - X0) * n) / (N_IN - 1);
  const panel = (vals, top, title) => {
    const yOf = (v) => top + 96 - ((v + 0.6) / 2.2) * 96;
    els.push(txt(X0, top - 10, title, 12, 'start', { 'font-weight': 'bold' }));
    els.push(line(X0, yOf(0), X1 + 10, yOf(0), { 'stroke-width': 1.2 }), arrowHead(X1 + 16, yOf(0), 1, 0, 8));
    els.push(h('path', { d: path(vals.map((v, n) => [xOf(n), yOf(v)])), fill: 'none', stroke: STROKE, 'stroke-width': 1.8 }));
    vals.forEach((v, n) => els.push(h('circle', { cx: xOf(n), cy: yOf(v), r: 2.2, fill: STROKE })));
  };
  panel(x, 32, 'Inn: puls med støy');
  panel(y, 172, `Ut: gjennomsnittet av de siste ${taps} samplene`);
  const desc = [`Øverst: en firkantpuls med støy, ${N_IN} sampler. Nederst: utgangen fra et filter som for hvert sampel tar gjennomsnittet av de siste ${taps} samplene på inngangen (glidende middel, et enkelt FIR-filter).`];
  if (taps === 1) desc.push('Med bare ett sampel er utgangen lik inngangen.');
  else desc.push(`Støyen er ${taps >= 10 ? 'kraftig ' : ''}dempet, og hvert sprang i pulsen er blitt en skråning over ${taps} sampler. Pulsen kommer også litt senere ut.`);
  return { height: 280, desc: desc.join(' ') };
}

// --- FIR and IIR structures ---------------------------------------------------------

function box(els, cx, cy, t) {
  els.push(h('rect', { x: cx - 18, y: cy - 13, width: 36, height: 26, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  els.push(txt(cx, cy + 1, t, 14, 'middle', { 'font-style': 'italic' }));
}
function circleOp(els, cx, cy, sym, r = 11) {
  els.push(h('circle', { cx, cy, r, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }), txt(cx, cy + 1, sym, sym === 'Σ' ? 15 : 14));
}
const arrow = (els, x1, y1, x2, y2) => {
  const len = Math.hypot(x2 - x1, y2 - y1);
  els.push(line(x1, y1, x2 - ((x2 - x1) / len) * 8, y2 - ((y2 - y1) / len) * 8), arrowHead(x2, y2, x2 - x1, y2 - y1, 9));
};
const coef = (els, x, y, sub) => els.push(symLabel(x, y, 'a', sub, '', { 'font-size': 14, 'text-anchor': 'start' }));

function drawFir(els, top) {
  const yIn = top + 28;
  const yMul = top + 74;
  const yBus = top + 116;
  const taps = [100, 220, 340];
  els.push(txt(30, top, 'FIR-filter', 13, 'start', { 'font-weight': 'bold' }));
  els.push(txt(52, yIn, 'x', 14, 'end', { 'font-style': 'italic' }));
  els.push(line(60, yIn, 142, yIn), line(178, yIn, 262, yIn), line(298, yIn, 340, yIn));
  box(els, 160, yIn, 'T');
  box(els, 280, yIn, 'T');
  for (const [i, x] of taps.entries()) {
    els.push(h('circle', { cx: x, cy: yIn, r: 3.5, fill: STROKE }));
    arrow(els, x, yIn, x, yMul - 11);
    circleOp(els, x, yMul, '×');
    coef(els, x + 16, yMul - 2, String(i));
    els.push(line(x, yMul + 11, x, yBus));
  }
  els.push(line(100, yBus, 404, yBus));
  arrow(els, 404, yBus, 410, yBus);
  circleOp(els, 424, yBus, 'Σ', 14);
  arrow(els, 438, yBus, 496, yBus);
  els.push(txt(504, yBus, 'y', 14, 'start', { 'font-style': 'italic' }));
  return yBus + 24;
}

function drawIir(els, top) {
  const y = top + 34;
  const yFb = top + 108;
  els.push(txt(30, top, 'IIR-filter', 13, 'start', { 'font-weight': 'bold' }));
  els.push(txt(52, y, 'x', 14, 'end', { 'font-style': 'italic' }));
  arrow(els, 60, y, 129, y);
  circleOp(els, 140, y, '×');
  coef(els, 128, y - 24, '0');
  arrow(els, 151, y, 229, y);
  circleOp(els, 240, y, '+');
  arrow(els, 251, y, 496, y);
  els.push(txt(504, y, 'y', 14, 'start', { 'font-style': 'italic' }));
  els.push(h('circle', { cx: 380, cy: y, r: 3.5, fill: STROKE }));
  arrow(els, 380, y, 380, yFb - 46);
  box(els, 380, yFb - 33, 'T');
  els.push(line(380, yFb - 20, 380, yFb), line(380, yFb, 321, yFb));
  circleOp(els, 310, yFb, '×');
  els.push(symLabel(304, yFb + 24, 'b', '', '', { 'font-size': 14 }));
  els.push(line(299, yFb, 240, yFb));
  arrow(els, 240, yFb, 240, y + 11);
  els.push(txt(220, yFb - 12, 'tilbakekobling', 12, 'end'));
  return yFb + 30;
}

function drawFirIir(els, p) {
  let y = 20;
  const desc = [];
  if (p.structure !== 'iir') {
    y = drawFir(els, y) + 12;
    desc.push('FIR-filter: inngangssignalet x går gjennom to forsinkelser (T, ett sampel hver). Det nåværende og de to forrige samplene ganges med hver sin faktor (a0, a1 og a2) og legges sammen (Σ) til utgangen y. Ingenting av utgangen føres tilbake.');
  }
  if (p.structure !== 'fir') {
    y = drawIir(els, y + 6) + 6;
    desc.push('IIR-filter: inngangen ganges med a0 og legges sammen med forrige utgangssampel ganget med b. Utgangen føres altså tilbake til inngangen (tilbakekobling), og hvert sampel påvirker utgangen også lenge etterpå.');
  }
  els.push(txt(30, y, 'T: forsinkelse på ett sampel', 12, 'start'));
  return { height: y + 16, desc: `${desc.join(' ')} T står for forsinkelse på ett sampel.` };
}

const DRAW = { samples: drawSamples, quantize: drawQuantize, moving_average: drawMovingAverage, fir_iir: drawFirIir };

function render(p) {
  const els = [];
  const { height, desc } = DRAW[p.kind](els, p);
  return { svg: svgRoot(W, height, TITLE[p.kind], desc, els, {}, 0, 0), description: desc, animatable: false };
}

export default { id: 'sampling', version: 1, rules, quantities: () => ({}), render, idealised: (p) => IDEAL[p.kind] };
