// illustration@1: small explanatory drawings that are not circuits or curves.
// prefixes           – the SI prefix ladder piko … giga, a factor 1000 per step, with
//                      the step from one prefix to another marked
// tolerance          – a number line with a nominal value and its ± tolerance range
// s_meter            – an S-meter scale S1–S9 with two readings marked; 'reveal' adds
//                      the dB value of each S-step
// plates             – a plate capacitor with area A and distance d; 'reveal' compares
//                      it with the plates at half the distance
// variable_capacitor – rotor and stator plates seen from the end, the overlap shaded
// coils              – two coils with parallel axes, and ('reveal') with axes at right
//                      angles
// supply             – an oscillator and a final stage on one supply line; 'reveal' adds
//                      a separate regulator for the oscillator
// 'blank' draws only a note, for drawings that are shown after answering.

import { h } from '../render/vnode.js';
import { formatNumber, formatSI } from '../render/format.js';
import { arrowHead, inductor, label, line, rotated, svgRoot, STROKE } from './svg.js';

const PREFIX = [['p', 'piko', -12], ['n', 'nano', -9], ['µ', 'mikro', -6], ['m', 'milli', -3], ['', '–', 0], ['k', 'kilo', 3], ['M', 'mega', 6], ['G', 'giga', 9]];

function rules(p) {
  const errors = [];
  if (p.kind === 'prefixes' && p.from === p.to) errors.push('to: must differ from from');
  if (p.kind === 's_meter' && !(p.from_s >= 1 && p.to_s <= 9 && p.from_s < p.to_s)) errors.push('from_s/to_s: two S-units 1–9, from below to');
  if (p.kind === 'tolerance' && p.nominal == null) errors.push('nominal: required for kind tolerance');
  return errors;
}

const W = 560;
const lbl = (x, y, t, anchor = 'middle', size = 12, extra = {}) => label(x, y, t, { 'font-size': size, 'text-anchor': anchor, ...extra });
const box = (x, y, w, hh, text) => [h('rect', { x, y, width: w, height: hh, rx: 6, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }), lbl(x + w / 2, y + hh / 2 + 1, text, 'middle', 13)];
const sup = (base, exp) => h('text', { 'font-size': 12, fill: STROKE, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, base, h('tspan', { dy: -6, 'font-size': 9 }, exp));

function prefixes(els, p) {
  const n = PREFIX.length;
  const dx = (W - 80) / (n - 1);
  const x = (i) => 40 + i * dx;
  const y = 90;
  const iFrom = PREFIX.findIndex((q) => q[0] === p.from);
  const iTo = PREFIX.findIndex((q) => q[0] === p.to);
  PREFIX.forEach(([sym, name, e], i) => {
    const on = i === iFrom || i === iTo;
    els.push(h('circle', { cx: x(i), cy: y, r: 22, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': on ? 3.5 : 1.6 }));
    els.push(lbl(x(i), y + 1, sym || '1', 'middle', 15, { 'font-weight': on ? 'bold' : null }));
    els.push(lbl(x(i), y + 38, name, 'middle', 11));
    const t = sup('10', formatNumber(e));
    t.a.x = x(i); t.a.y = y + 56;
    els.push(t);
    if (i < n - 1) els.push(lbl((x(i) + x(i + 1)) / 2, y - 30, '× 1000', 'middle', 10));
  });
  // the step that is asked about
  const [a, b] = iFrom < iTo ? [iFrom, iTo] : [iTo, iFrom];
  const yy = y + 80;
  els.push(line(x(a), yy, x(b), yy, { 'stroke-width': 1.8 }), arrowHead(iFrom < iTo ? x(b) : x(a), yy, iFrom < iTo ? 1 : -1, 0, 9));
  const steps = b - a;
  els.push(lbl((x(a) + x(b)) / 2, yy + 18, `${steps} trinn: faktor ${formatNumber(10 ** (3 * steps))}`, 'middle', 12));
  const name = (i) => PREFIX[i][1] === '–' ? 'grunnenheten' : PREFIX[i][1];
  return { height: 210, desc: `Stige med SI-prefiksene piko, nano, mikro, milli, grunnenheten, kilo, mega og giga, med en faktor 1000 mellom hvert trinn (10 opphøyd i −12 til 9). Markert: fra ${name(iFrom)} til ${name(iTo)}, ${steps} trinn.` };
}

function tolerance(els, p) {
  const lo = p.nominal * (1 - p.percent / 100);
  const hi = p.nominal * (1 + p.percent / 100);
  const span = (hi - lo) * 1.6;
  const x = (v) => 60 + ((v - (p.nominal - span / 2)) / span) * (W - 120);
  const y = 90;
  els.push(line(40, y, W - 30, y, { 'stroke-width': 1.5 }), arrowHead(W - 24, y, 1, 0, 8));
  els.push(h('rect', { x: x(lo), y: y - 14, width: x(hi) - x(lo), height: 28, fill: STROKE, opacity: 0.15 }));
  for (const [v, t, bold] of [[lo, `−${formatNumber(p.percent)} %`, false], [p.nominal, 'påstemplet', true], [hi, `+${formatNumber(p.percent)} %`, false]]) {
    els.push(line(x(v), y - 18, x(v), y + 18, { 'stroke-width': bold ? 3 : 2 }));
    els.push(lbl(x(v), y - 30, t, 'middle', 12), lbl(x(v), y + 34, formatSI(v, p.unit), 'middle', 12, { 'font-weight': bold ? 'bold' : null }));
  }
  els.push(lbl((x(lo) + x(hi)) / 2, y + 62, 'den virkelige verdien ligger et sted i det skyggelagte området'));
  return { height: 170, desc: `Tallinje: påstemplet verdi ${formatSI(p.nominal, p.unit)} i midten, og et skyggelagt område fra ${formatSI(lo, p.unit)} (−${formatNumber(p.percent)} %) til ${formatSI(hi, p.unit)} (+${formatNumber(p.percent)} %), der den virkelige verdien ligger.` };
}

function sMeter(els, p) {
  const cx = W / 2;
  const cy = 200;
  const r = 150;
  const ang = (s) => Math.PI * (0.85 - ((s - 1) / 8) * 0.7); // S1 left … S9 right
  const pt = (s, rr) => [cx + rr * Math.cos(ang(s)), cy - rr * Math.sin(ang(s))];
  let d = '';
  for (let j = 0; j <= 80; j++) {
    const s = 1 + (8 * j) / 80;
    const [x, y] = pt(s, r);
    d += `${j ? ' L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  els.push(h('path', { d, fill: 'none', stroke: STROKE, 'stroke-width': 2 }));
  for (let s = 1; s <= 9; s++) {
    const [x1, y1] = pt(s, r);
    const [x2, y2] = pt(s, r + 12);
    const [xl, yl] = pt(s, r + 26);
    els.push(line(x1, y1, x2, y2, { 'stroke-width': 2 }), lbl(xl, yl, `S${s}`, 'middle', 12, { 'font-weight': s === p.from_s || s === p.to_s ? 'bold' : null }));
    if (p.reveal && s < 9) {
      const [xm, ym] = pt(s + 0.5, r - 18);
      els.push(lbl(xm, ym, `${formatNumber(p.db_per_s)} dB`, 'middle', 10));
    }
  }
  for (const [s, dash] of [[p.from_s, '6 4'], [p.to_s, null]]) {
    const [x, y] = pt(s, r - 4);
    els.push(line(cx, cy, x, y, { 'stroke-width': 2.5, 'stroke-dasharray': dash }));
  }
  els.push(h('circle', { cx, cy, r: 6, fill: STROKE }));
  let desc = `S-meterskala fra S1 til S9. To viserstillinger er markert: S${p.from_s} (stiplet) og S${p.to_s}.`;
  if (p.reveal) desc += ` Mellom hver S-enhet står det ${formatNumber(p.db_per_s)} dB.`;
  return { height: 220, desc };
}

function plates(els, p) {
  const draw = (x0, gap, title, dLabel) => {
    els.push(lbl(x0 + 70, 24, title, 'middle', 13, { 'font-weight': 'bold' }));
    const top = 60;
    els.push(h('rect', { x: x0, y: top, width: 140, height: 10, fill: STROKE, opacity: 0.8 }), h('rect', { x: x0, y: top + 10 + gap, width: 140, height: 10, fill: STROKE, opacity: 0.8 }));
    els.push(line(x0 + 160, top + 10, x0 + 160, top + 10 + gap, { 'stroke-width': 1.4 }), arrowHead(x0 + 160, top + 10, 0, -1, 7), arrowHead(x0 + 160, top + 10 + gap, 0, 1, 7));
    els.push(lbl(x0 + 168, top + 10 + gap / 2, dLabel, 'start', 13, { 'font-style': 'italic' }));
    els.push(lbl(x0 + 70, top - 10, 'areal A', 'middle', 11));
  };
  draw(60, 80, p.reveal ? 'Før' : 'Platekondensator', 'd');
  let desc = 'Platekondensator: to like metallplater med arealet A, parallelle med avstanden d mellom seg, og luft imellom.';
  if (p.reveal) {
    draw(320, 40, 'Halv avstand', 'd/2');
    desc += ' Til høyre de samme platene med halv avstand, d/2.';
  }
  return { height: 190, desc };
}

function variableCapacitor(els) {
  const cx = 280;
  const cy = 130;
  const r = 95;
  // stator: a fixed half-disc to the left; rotor: a half-disc turned 60° on the shaft
  const half = (deg, extra) => {
    const a0 = (deg * Math.PI) / 180;
    const a1 = a0 + Math.PI;
    const p0 = [cx + r * Math.cos(a0), cy - r * Math.sin(a0)];
    const p1 = [cx + r * Math.cos(a1), cy - r * Math.sin(a1)];
    // sweep 0: counter-clockwise on screen, so 90° → 270° is the left half
    return h('path', { d: `M ${cx} ${cy} L ${p0[0]} ${p0[1]} A ${r} ${r} 0 0 0 ${p1[0]} ${p1[1]} Z`, ...extra });
  };
  els.push(half(90, { fill: 'none', stroke: STROKE, 'stroke-width': 2 }), half(30, { fill: 'none', stroke: STROKE, 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
  // the overlap is the sector the two halves share: 90° to 210°
  const a0 = (90 * Math.PI) / 180;
  const a1 = (210 * Math.PI) / 180;
  els.push(h('path', { d: `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy - r * Math.sin(a0)} A ${r} ${r} 0 0 0 ${cx + r * Math.cos(a1)} ${cy - r * Math.sin(a1)} Z`, fill: STROKE, opacity: 0.25 }));
  els.push(h('circle', { cx, cy, r: 6, fill: STROKE }), lbl(cx + 12, cy + 16, 'aksel', 'start', 11));
  els.push(lbl(cx - r - 10, cy + 50, 'faste plater', 'end'), lbl(cx + r * 0.75, cy - r * 0.85, 'dreibare plater (stiplet)', 'start'));
  els.push(lbl(cx - 38, cy - 36, 'overlapp', 'middle', 12, { 'font-weight': 'bold' }));
  return { height: 250, desc: 'Variabel kondensator sett fra enden: de faste platene er en halvsirkel, og de dreibare platene (stiplet) er en halvsirkel på akselen. Når akselen dreies, endres hvor stor del av platene som ligger overfor hverandre (skyggelagt).' };
}

function coils(els, p) {
  const pair = (x0, crossed, title) => {
    els.push(lbl(x0 + 80, 24, title, 'middle', 13, { 'font-weight': 'bold' }));
    els.push(rotated(inductor(x0 + 40, 100, 70), x0 + 40, 100, 0), line(x0 + 40, 50, x0 + 40, 150, { 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    if (crossed) {
      els.push(rotated(inductor(x0 + 130, 100, 70), x0 + 130, 100, -90), line(x0 + 85, 100, x0 + 175, 100, { 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    } else {
      els.push(inductor(x0 + 120, 100, 70), line(x0 + 120, 50, x0 + 120, 150, { 'stroke-width': 1, 'stroke-dasharray': '3 3' }));
    }
  };
  pair(60, false, 'Parallelle akser');
  let desc = 'To spoler ved siden av hverandre med parallelle akser (stiplet).';
  if (p.reveal) {
    pair(320, true, 'Akser vinkelrett på hverandre');
    desc += ' Til høyre er den ene spolen dreid slik at aksene står vinkelrett på hverandre.';
  }
  return { height: 180, desc };
}

function supply(els, p) {
  els.push(...box(40, 60, 110, 46, '12 V i bilen'), line(150, 83, 470, 83, { 'stroke-width': 3 }), lbl(310, 70, 'felles forsyningsledning'));
  els.push(...box(400, 140, 120, 46, 'Sluttforsterker'), line(460, 83, 460, 140));
  const oscX = p.reveal ? 220 : 250;
  if (p.reveal) {
    els.push(...box(200, 120, 100, 40, 'Regulator'), line(250, 83, 250, 120), line(250, 160, 250, 190), ...box(200, 190, 100, 46, 'Oscillator'));
    els.push(h('rect', { x: 190, y: 112, width: 120, height: 56, rx: 8, fill: 'none', stroke: STROKE, 'stroke-width': 1.6, 'stroke-dasharray': '5 4' }));
  } else {
    els.push(...box(oscX - 50, 140, 100, 46, 'Oscillator'), line(oscX, 83, oscX, 140));
  }
  els.push(line(p.reveal ? 300 : 300, p.reveal ? 213 : 163, 400, p.reveal ? 175 : 163, { 'stroke-width': 2 }), arrowHead(400, p.reveal ? 175 : 163, 1, p.reveal ? -0.38 : 0, 9));
  let desc = 'Blokkskjema: en strømforsyning på 12 V i bilen forsyner både oscillatoren og sluttforsterkeren gjennom én felles ledning. Signalet går fra oscillatoren til sluttforsterkeren.';
  if (p.reveal) desc += ' Markert: oscillatoren får nå strøm gjennom en egen regulator, som gir den en stabil spenning selv når sluttforsterkeren trekker mye strøm.';
  return { height: p.reveal ? 250 : 210, desc };
}

const DRAW = { prefixes, tolerance, s_meter: sMeter, plates, variable_capacitor: variableCapacitor, coils, supply };
const TITLE = { prefixes: 'SI-prefikser', tolerance: 'Toleranse', s_meter: 'S-meter', plates: 'Platekondensator', variable_capacitor: 'Variabel kondensator', coils: 'To spoler', supply: 'Felles forsyning' };

function render(p) {
  const els = [];
  if (p.blank) {
    if (p.note) els.push(label(W / 2, 60, p.note, { 'font-size': 14, opacity: 0.75 }));
    const description = `${TITLE[p.kind]}. ${p.note || ''}`.trim();
    return { svg: svgRoot(W, 120, TITLE[p.kind], description, els, {}, 0, 0), description, animatable: false };
  }
  const { height, desc } = DRAW[p.kind](els, p);
  return { svg: svgRoot(W, height, TITLE[p.kind], desc, els, {}, 0, 0), description: desc, animatable: false };
}

export default { id: 'illustration', version: 1, rules, quantities: () => ({}), render };
