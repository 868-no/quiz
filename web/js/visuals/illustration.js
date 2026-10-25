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
// fet_transfer       – drain current against UGS for depletion and enhancement MOSFETs
// phasing            – block diagram of the phasing method for SSB
// transfer           – output against drive for a linear amplifier, compressing at the top
// air_coil           – an air-wound coil with its turns, diameter and length
// range              – a receiver's dynamic range on a signal-strength scale
// band_edge          – a band-plan boundary (edge_khz) between a CW segment below and an
//                      all-modes segment above, and an SSB signal tuned to dial_khz (and,
//                      for comparison, compare_khz), the sideband drawn where it lands
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
  if (p.kind === 'band_edge' && (p.edge_khz == null || p.dial_khz == null)) errors.push('edge_khz/dial_khz: required for kind band_edge');
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

function variableCapacitor(els, p) {
  const cx = 280;
  const cy = 130;
  const r = 95;
  const pt = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];
  // a sector from angle a to b (degrees, counter-clockwise on screen: sweep flag 0)
  const sector = (a, b, extra) => {
    const [x0, y0] = pt(a);
    const [x1, y1] = pt(b);
    return h('path', { d: `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${b - a > 180 ? 1 : 0} 0 ${x1} ${y1} Z`, ...extra });
  };
  // stator: the left half (90°–270°); rotor: the half from 'angle' to 'angle' + 180°
  const rot = p.angle;
  els.push(sector(90, 270, { fill: 'none', stroke: STROKE, 'stroke-width': 2 }), sector(rot, rot + 180, { fill: 'none', stroke: STROKE, 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
  const from = Math.max(90, rot);
  const to = Math.min(270, rot + 180);
  if (to - from > 0.5) els.push(sector(from, to, { fill: STROKE, opacity: 0.25 }));
  els.push(h('circle', { cx, cy, r: 6, fill: STROKE }), lbl(cx + 12, cy + 16, 'aksel', 'start', 11));
  els.push(lbl(cx - r - 10, cy + 50, 'faste plater', 'end'), lbl(cx + r + 10, cy - r * 0.6, 'dreibare plater (stiplet)', 'start'));
  if (to - from > 30) {
    const [lx, ly] = [cx + 0.55 * r * Math.cos((((from + to) / 2) * Math.PI) / 180), cy - 0.55 * r * Math.sin((((from + to) / 2) * Math.PI) / 180)];
    els.push(lbl(lx, ly, 'overlapp', 'middle', 12, { 'font-weight': 'bold' }));
  }
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


// a plot frame with axes and labels; returns coordinate helpers
function axesBox(els, x0, y0, w, hh, xName, yName) {
  els.push(line(x0, y0 + hh, x0 + w + 12, y0 + hh, { 'stroke-width': 1.5 }), arrowHead(x0 + w + 18, y0 + hh, 1, 0, 8));
  els.push(line(x0, y0 + hh + 4, x0, y0 - 10, { 'stroke-width': 1.5 }), arrowHead(x0, y0 - 16, 0, -1, 8));
  const name = (x, y, n) => {
    const [sym, sub] = n.split('_');
    return h('text', { x, y, 'font-size': 12, fill: STROKE, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, h('tspan', { 'font-style': 'italic' }, sym), sub ? h('tspan', { dy: 4, 'font-size': 9 }, sub) : null);
  };
  els.push(name(x0 + w + 18, y0 + hh + 16, xName), name(x0 - 6, y0 - 22, yName));
}
const curve = (pts, extra = {}) => h('path', { d: pts.map((q, i) => `${i ? 'L' : 'M'} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' '), fill: 'none', stroke: STROKE, 'stroke-width': 2.5, ...extra });

// drain current against gate voltage for a depletion and an enhancement MOSFET
function fetTransfer(els) {
  const x0 = 80;
  const y0 = 40;
  const w = 420;
  const hh = 190;
  const xOf = (u) => x0 + ((u + 4) / 8) * w; // −4 … +4 V
  const yOf = (i) => y0 + hh - (i / 15) * hh;
  axesBox(els, x0, y0, w, hh, 'U_GS', 'I_D');
  const zero = xOf(0);
  els.push(line(zero, y0 - 4, zero, y0 + hh, { 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }), lbl(zero + 4, y0 + hh + 16, '0 V', 'middle', 11));
  const dep = [];
  const enh = [];
  for (let j = 0; j <= 160; j++) {
    const u = -4 + (8 * j) / 160;
    dep.push([xOf(u), yOf(u > -3 ? 2.6 * (1 + u / 3) ** 2 : 0)]);
    enh.push([xOf(u), yOf(u > 1.5 ? 1.6 * (u - 1.5) ** 2 : 0)]);
  }
  els.push(curve(dep), curve(enh, { 'stroke-dasharray': '8 5' }));
  // a legend in the top left corner, clear of both curves
  els.push(line(x0 + 20, y0 + 6, x0 + 52, y0 + 6, { 'stroke-width': 2.5 }), lbl(x0 + 60, y0 + 6, 'tømmingsmodus', 'start', 12));
  els.push(line(x0 + 20, y0 + 26, x0 + 52, y0 + 26, { 'stroke-width': 2.5, 'stroke-dasharray': '8 5' }), lbl(x0 + 60, y0 + 26, 'forsterkningsmodus', 'start', 12));
  els.push(h('circle', { cx: zero, cy: yOf(2.6), r: 5, fill: STROKE }), h('circle', { cx: zero, cy: yOf(0), r: 5, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  return { height: 270, desc: 'Drainstrømmen ID mot spenningen mellom gate og source, UGS, for to N-kanal-MOSFET-er. Tømmingsmodus (heltrukket): leder allerede ved 0 V og strupes når UGS gjøres negativ. Forsterkningsmodus (stiplet): leder ikke før UGS er blitt tydelig positiv. Ved UGS = 0 V (stiplet loddrett linje) leder bare den i tømmingsmodus.' };
}

// the phasing method for SSB: audio and carrier each split with 90° between the halves
function phasing(els) {
  const bx = (x, y, w, t, dashed = false) => [h('rect', { x, y, width: w, height: 36, rx: 6, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2, 'stroke-dasharray': dashed ? '6 4' : null }), lbl(x + w / 2, y + 19, t, 'middle', 11)];
  const arr = (x1, y1, x2, y2) => [line(x1, y1, x2 - (x2 > x1 ? 8 : 0), y2 - (y2 > y1 ? 8 : y2 < y1 ? -8 : 0), { 'stroke-width': 1.6 }), arrowHead(x2, y2, x2 - x1, y2 - y1, 8)];
  els.push(...bx(10, 30, 70, 'Mikrofon'), ...arr(80, 48, 95, 48), ...bx(95, 30, 115, 'Mikrofonforsterker'), ...arr(210, 48, 225, 48), ...bx(225, 30, 80, 'Lydfilter', true));
  els.push(line(305, 48, 320, 48, { 'stroke-width': 1.6 }), line(320, 48, 320, 210, { 'stroke-width': 1.6 }));
  els.push(...arr(320, 110, 380, 110), ...bx(380, 92, 110, 'Bal. modulator'));
  els.push(...arr(320, 210, 330, 210), ...bx(330, 192, 40, '90°'), ...arr(370, 210, 380, 210), ...bx(380, 192, 110, 'Bal. modulator'));
  els.push(...bx(400, 142, 70, 'Bærebølge'), ...arr(435, 142, 435, 128), ...arr(435, 178, 435, 192), lbl(444, 135, '0°', 'start', 10), lbl(444, 186, '90°', 'start', 10));
  els.push(line(490, 110, 510, 110, { 'stroke-width': 1.6 }), ...arr(510, 110, 510, 146), line(490, 210, 510, 210, { 'stroke-width': 1.6 }), ...arr(510, 210, 510, 174));
  els.push(h('circle', { cx: 510, cy: 160, r: 14, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }), lbl(510, 161, 'Σ', 'middle', 15), ...arr(524, 160, 552, 160), lbl(538, 146, 'SSB', 'middle', 11));
  return { height: 245, desc: 'Blokkskjema for fasemetoden: mikrofon, mikrofonforsterker og lydfilter (stiplet). Lydsignalet deles i to: den ene delen går rett til en balansert modulator, den andre gjennom et 90°-ledd til en annen balansert modulator. Bærebølgen går til den første modulatoren direkte og til den andre forskjøvet 90°. Utgangene legges sammen (Σ) til SSB-signalet. Det finnes ikke noe sidebåndsfilter.' };
}

// output against drive for a linear amplifier: straight at first, then compressing
function transfer(els) {
  const x0 = 80;
  const y0 = 40;
  const w = 400;
  const hh = 180;
  axesBox(els, x0, y0, w, hh, 'inn', 'ut');
  const out = (v) => Math.tanh(1.25 * v) / Math.tanh(1.25); // 0 … 1
  const pts = [];
  for (let j = 0; j <= 100; j++) { const v = j / 100; pts.push([x0 + v * w, y0 + hh - out(v) * hh]); }
  // the straight line the output would follow without compression (the curve's slope at zero)
  const slope = 1.25 / Math.tanh(1.25);
  els.push(line(x0, y0 + hh, x0 + 0.65 * w, y0 + hh - 0.65 * slope * hh, { 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }));
  els.push(curve(pts));
  const mark = (v, t, anchor) => { const x = x0 + v * w; const y = y0 + hh - out(v) * hh; els.push(h('circle', { cx: x, cy: y, r: 5.5, fill: STROKE }), lbl(x + (anchor === 'start' ? 10 : -10), y + 18, t, anchor, 11)); };
  mark(1, 'full styring', 'end');
  mark(0.62, 'litt mindre styring', 'start');
  els.push(lbl(x0 + 0.25 * w, y0 + hh - 0.5 * hh, 'lineært', 'middle', 11), lbl(x0 + 0.8 * w, y0 - 8, 'metning', 'end', 11));
  return { height: 260, desc: 'Utgangseffekt mot styring for en lineær forsterker: kurven følger først en rett linje (stiplet), men flater ut mot metning ved full styring. Markert: full styring, der forsterkeren er ulineær, og litt mindre styring, der kurven fortsatt er nesten rett.' };
}

// an air-wound coil on a tube, with its turns, diameter and length
function airCoil(els) {
  const x0 = 140;
  const x1 = 420;
  const top = 80;
  const bot = 160;
  els.push(h('rect', { x: x0 - 20, y: top, width: x1 - x0 + 40, height: bot - top, rx: 10, fill: 'none', stroke: STROKE, 'stroke-width': 1.4, opacity: 0.55 }));
  const n = 20;
  for (let i = 0; i < n; i++) { const x = x0 + ((x1 - x0) * (i + 0.5)) / n; els.push(line(x - 5, top - 4, x + 5, bot + 4, { 'stroke-width': 2.4 })); }
  els.push(line(x0 - 60, top + 6, x0 - 2, top - 4, { 'stroke-width': 2 }), line(x1 + 2, bot + 4, x1 + 60, bot - 6, { 'stroke-width': 2 }));
  els.push(line(x1 + 70, top, x1 + 70, bot, { 'stroke-width': 1.2 }), arrowHead(x1 + 70, top, 0, -1, 7), arrowHead(x1 + 70, bot, 0, 1, 7), lbl(x1 + 70, bot + 20, 'diameter', 'middle', 12), lbl(x1 + 70, bot + 36, '2 cm', 'middle', 12));
  els.push(line(x0, bot + 34, x1, bot + 34, { 'stroke-width': 1.2 }), arrowHead(x0, bot + 34, -1, 0, 7), arrowHead(x1, bot + 34, 1, 0, 7), lbl((x0 + x1) / 2, bot + 50, 'lengde', 'middle', 12));
  els.push(lbl((x0 + x1) / 2, top - 22, '20 vindinger tett inntil hverandre', 'middle', 12));
  return { height: 230, desc: 'En luftspole: 20 vindinger tråd viklet tett inntil hverandre på et plastrør med diameter 2 cm. Spolens lengde er markert langs røret.' };
}

// a receiver's dynamic range as a span on a signal-strength scale
function range(els) {
  const x = 230;
  const top = 40;
  const bot = 250;
  els.push(line(x, bot + 6, x, top - 10, { 'stroke-width': 2 }), arrowHead(x, top - 16, 0, -1, 9), lbl(x - 10, top - 22, 'signalstyrke', 'end', 12));
  const hi = top + 40;
  const lo = bot - 40;
  els.push(h('rect', { x: x - 14, y: hi, width: 28, height: lo - hi, fill: STROKE, opacity: 0.2 }));
  for (const [y, t] of [[hi, 'sterkeste signal uten overstyring'], [lo, 'svakeste brukbare signal']]) els.push(line(x - 20, y, x + 20, y, { 'stroke-width': 2.5 }), lbl(x + 28, y, t, 'start', 12));
  els.push(lbl(x + 28, bot - 6, 'støy fra mottakeren selv', 'start', 11), lbl(x + 28, top + 6, 'overstyring', 'start', 11));
  els.push(line(x - 60, hi + 8, x - 60, lo - 8, { 'stroke-width': 1.5 }), arrowHead(x - 60, hi, 0, -1, 8), arrowHead(x - 60, lo, 0, 1, 8), lbl(x - 68, (hi + lo) / 2, 'dynamisk område', 'end', 12, { 'font-weight': 'bold' }));
  return { height: 270, desc: 'Skala for signalstyrke. Nederst mottakerens egen støy, øverst overstyring. Det dynamiske området er spennet fra det svakeste brukbare signalet opp til det sterkeste signalet mottakeren tåler uten overstyring.' };
}

// A band-plan edge and where an SSB signal lands: one panel per tuning.
function bandEdge(els, p) {
  const dials = [p.dial_khz, p.compare_khz].filter((d) => d != null);
  const w = p.width_khz;
  const lsb = p.sideband === 'lsb';
  const span = (d) => (lsb ? [d - w, d] : [d, d + w]);
  const ends = dials.flatMap(span).concat([p.edge_khz]);
  const lo = Math.min(...ends) - 2;
  const hi = Math.max(...ends) + 2;
  const x = (f) => 40 + ((f - lo) / (hi - lo)) * 470;
  const khz = (f) => `${formatNumber(Math.round(f * 10) / 10)} kHz`;
  const PANEL = 124;
  const desc = [`Frekvensakse rundt grensen ved ${khz(p.edge_khz)} i båndplanen. Under grensen er båndet satt av til CW og smalbåndsmoduser, over den til alle moduser.`];
  dials.forEach((d, i) => {
    const y0 = 8 + i * (PANEL + 8);
    const base = y0 + 84;
    const xe = x(p.edge_khz);
    els.push(lbl((40 + xe) / 2, y0 + 12, 'CW og smalbånd', 'middle', 12), lbl((xe + 510) / 2, y0 + 12, 'alle moduser', 'middle', 12));
    els.push(line(xe, y0 + 4, xe, base + 4, { 'stroke-width': 1.6, 'stroke-dasharray': '5 4' }), lbl(xe, base + 16, khz(p.edge_khz), 'middle', 11));
    els.push(line(34, base, 516, base, { 'stroke-width': 1.5 }), arrowHead(522, base, 1, 0, 8), lbl(526, base + 14, 'f', 'end', 12, { 'font-style': 'italic' }));
    const [a, b] = span(d);
    // the sideband: highest near the suppressed carrier, as on a spectrum
    const [ya, yb] = lsb ? [base - 22, base - 34] : [base - 34, base - 22];
    els.push(h('path', { d: `M ${x(a)} ${base} L ${x(a)} ${ya} L ${x(b)} ${yb} L ${x(b)} ${base} Z`, fill: STROKE, opacity: 0.4, stroke: STROKE, 'stroke-width': 1.2 }));
    els.push(lbl((x(a) + x(b)) / 2, base - 44, lsb ? 'LSB' : 'USB', 'middle', 11, { 'font-weight': 'bold' }));
    els.push(arrowHead(x(d), base - 2, 0, 1, 8), lbl(x(d) + (lsb ? 6 : -6), y0 + 30, `innstilt: ${khz(d)}`, lsb ? 'start' : 'end', 12));
    const inside = lsb ? a >= p.edge_khz : b >= p.edge_khz && a >= p.edge_khz;
    els.push(lbl(275, base + 34, inside ? 'hele talen ligger over grensen' : 'talen havner under grensen, i CW-delen', 'middle', 12, { 'font-weight': 'bold' }));
    desc.push(`Radioen stilt på ${khz(d)} med ${lsb ? 'nedre' : 'øvre'} sidebånd: talen dekker ${khz(a)} til ${khz(b)}${inside ? ', over grensen, i delen for alle moduser.' : ', og havner under grensen, i delen for CW og smalbåndsmoduser.'}`);
  });
  return { height: 8 + dials.length * (PANEL + 8), desc: desc.join(' ') };
}

const DRAW = { band_edge: bandEdge, prefixes, tolerance, s_meter: sMeter, plates, variable_capacitor: variableCapacitor, coils, supply, fet_transfer: fetTransfer, phasing, transfer, air_coil: airCoil, range };
const TITLE = { band_edge: 'Sidebånd og båndplan', fet_transfer: 'MOSFET i to moduser', phasing: 'Fasemetoden for SSB', transfer: 'Forsterkerkurve', air_coil: 'Luftspole', range: 'Dynamisk område', prefixes: 'SI-prefikser', tolerance: 'Toleranse', s_meter: 'S-meter', plates: 'Platekondensator', variable_capacitor: 'Variabel kondensator', coils: 'To spoler', supply: 'Felles forsyning' };

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
