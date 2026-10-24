// antenna@1: simplified drawings of antennas and their radiation patterns.
// dipole          – a half-wave dipole fed in the middle (coax, balun, ferrites on the
//                   coax, or ladder line), optionally with graphs of the current and
//                   the voltage along it: as envelopes (how large they get), or at an
//                   instant of the RF period (phase_deg, for animations)
// folded_dipole   – two parallel conductors joined at the ends, fed in the middle
// ground_plane    – a vertical λ/4 radiator with four radials at an angle below the
//                   horizontal; 'compare' draws horizontal radials beside it
// yagi            – a Yagi-Uda seen from above: reflector, driven dipole, 0–6 directors
// quad            – one square quad loop fed at the bottom
// trap_dipole     – a dipole with a trap (parallel LC) in each half; 'active' greys
//                   out the parts the traps cut off
// loaded_vertical – a short vertical with a loading coil at a chosen height, optionally
//                   with the current along it
// pattern         – a radiation pattern seen from above (relative field strength),
//                   computed: half-wave dipole, vertical, or a directional antenna
// The physics is computed here: the standing-wave shapes on the dipole (current
// cos, voltage sin along it), the dipole pattern cos(90°·cos φ)/sin φ, and the
// beamwidth at half power (field 1/√2), found numerically.

import { h } from '../render/vnode.js';
import { formatNumber } from '../render/format.js';
import { arrowHead, inductor, label, line, rotated, svgRoot, STROKE } from './svg.js';

const W = 560;
const lbl = (x, y, t, anchor = 'middle', size = 12, extra = {}) => label(x, y, t, { 'font-size': size, 'text-anchor': anchor, ...extra });
const fmt = (x, d = 0) => formatNumber(Number(x.toFixed(d)));

function rules(p) {
  const errors = [];
  if ((p.show_current || p.show_voltage) && !['dipole', 'loaded_vertical'].includes(p.kind)) errors.push('show_current/show_voltage: only for dipole and loaded_vertical');
  if (p.show_voltage && p.kind === 'loaded_vertical') errors.push('show_voltage: only for dipole');
  if (p.phase_deg !== null && !(p.kind === 'dipole' && (p.show_current || p.show_voltage))) errors.push('phase_deg: only for a dipole with current or voltage shown');
  if (p.kind === 'ground_plane' && p.show_impedance && !(p.radial_angle === 0 || (p.radial_angle >= 35 && p.radial_angle <= 55))) errors.push('show_impedance: radials horizontal (0°) or about 45° (35–55°)');
  if (p.kind === 'ground_plane' && p.compare && p.radial_angle < 20) errors.push('compare: radial_angle must be at least 20° to differ from the horizontal radials');
  if (p.kind === 'pattern' && p.beamwidth && p.shape === 'vertical') errors.push('beamwidth: a vertical seen from above radiates equally all round');
  if (p.kind === 'pattern' && p.compass && p.shape === 'directional') errors.push('compass: not for the directional pattern (it is drawn with front and back)');
  if (p.kind !== 'trap_dipole' && p.active !== 'all') errors.push('active: only for trap_dipole');
  return errors;
}

// ---- dipole ------------------------------------------------------------------------

const X0 = 70;
const X1 = 490;
const CX = (X0 + X1) / 2;

/** The feed line hanging below the middle of a horizontal antenna at height y. */
function feed(els, p, y, desc) {
  const top = y + 6;
  if (p.feed === 'none') return y;
  if (p.feed === 'ladder') {
    els.push(line(CX - 5, top, CX - 5, top + 64), line(CX + 5, top, CX + 5, top + 64));
    for (let yy = top + 8; yy < top + 64; yy += 10) els.push(line(CX - 5, yy, CX + 5, yy, { 'stroke-width': 1.2 }));
    els.push(lbl(CX + 16, top + 40, 'stigekabel', 'start'));
    desc.push('Antennen mates på midten med stigekabel.');
    return top + 64;
  }
  let y2 = top;
  if (p.feed === 'balun') {
    els.push(h('rect', { x: CX - 22, y: top + 2, width: 44, height: 26, rx: 4, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
    els.push(lbl(CX, top + 16, 'balun', 'middle', 11));
    y2 = top + 28;
  }
  els.push(line(CX, y2, CX, top + 70, { 'stroke-width': 4 }));
  if (p.feed === 'ferrite') {
    for (let i = 0; i < 4; i++) els.push(h('rect', { x: CX - 8, y: top + 6 + i * 11, width: 16, height: 8, rx: 2, fill: STROKE }));
    els.push(lbl(CX + 16, top + 22, 'ferritt', 'start'));
  }
  els.push(lbl(CX + 16, top + 62, 'koaksialkabel', 'start'));
  desc.push(p.feed === 'balun' ? 'Antennen mates på midten fra en koaksialkabel gjennom en balun.'
    : p.feed === 'ferrite' ? 'Antennen mates på midten med koaksialkabel; nærmest fødepunktet er det tredd ferrittkjerner utenpå kabelen.'
      : 'Antennen mates på midten med koaksialkabel.');
  return top + 70;
}

/** A dimension line from xa to xb at height y, with the text below it. */
function dimension(els, xa, xb, y, text) {
  els.push(line(xa, y, xb, y, { 'stroke-width': 1.2 }), arrowHead(xa, y, -1, 0, 7), arrowHead(xb, y, 1, 0, 7));
  els.push(line(xa, y - 6, xa, y + 6, { 'stroke-width': 1.2 }), line(xb, y - 6, xb, y + 6, { 'stroke-width': 1.2 }));
  els.push(lbl((xa + xb) / 2, y - 10, text, 'middle', 12));
}

/** Graph of a quantity along the dipole: f(s) for s from −1 (left end) to 1 (right end). */
function graph(els, y, name, f, env, signed, dashed) {
  const pts = [];
  for (let i = 0; i <= 80; i++) {
    const s = -1 + i / 40;
    pts.push([X0 + ((s + 1) / 2) * (X1 - X0), y - 30 * f(s)]);
  }
  const d = (q) => `M ${q.map(([x, yy]) => `${x.toFixed(1)} ${yy.toFixed(1)}`).join(' L ')}`;
  els.push(line(X0 - 6, y, X1 + 6, y, { 'stroke-width': 1, opacity: 0.6 }));
  if (signed) {
    // the envelope the instantaneous value moves within
    for (const sgn of [1, -1]) {
      const e = [];
      for (let i = 0; i <= 80; i++) { const s = -1 + i / 40; e.push([X0 + ((s + 1) / 2) * (X1 - X0), y - 30 * sgn * env(s)]); }
      els.push(h('path', { d: d(e), fill: 'none', stroke: STROKE, 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.7 }));
    }
  }
  els.push(h('path', { d: `${d(pts)} L ${X1} ${y} L ${X0} ${y} Z`, fill: STROKE, opacity: 0.18, stroke: 'none' }));
  els.push(h('path', { d: d(pts), fill: 'none', stroke: STROKE, 'stroke-width': 2.5, 'stroke-dasharray': dashed ? '7 4' : null }));
  els.push(lbl(X0 - 14, y - 2, name, 'end', 13, { 'font-weight': 'bold', 'font-style': 'italic' }));
}

function dipole(els, p) {
  const desc = [];
  const graphs = [p.show_current && 'I', p.show_voltage && 'U'].filter(Boolean);
  const dimH = p.length_label ? 40 : 0;
  let y = 22 + dimH + graphs.length * 78;
  const t = p.phase_deg === null ? null : (p.phase_deg * Math.PI) / 180;
  graphs.forEach((g, i) => {
    const gy = 58 + dimH + i * 78;
    if (g === 'I') {
      const env = (s) => Math.cos((Math.PI * s) / 2);
      graph(els, gy, 'I', t === null ? env : (s) => env(s) * Math.cos(t), env, t !== null, false);
    } else {
      const env = (s) => Math.abs(Math.sin((Math.PI * s) / 2));
      graph(els, gy, 'U', t === null ? env : (s) => Math.sin((Math.PI * s) / 2) * Math.sin(t), env, t !== null, true);
    }
  });
  if (graphs.length) {
    if (t === null) {
      desc.push(...graphs.map((g) => (g === 'I'
        ? 'Over antennen er strømmen langs den tegnet som en kurve: størst på midten ved fødepunktet og null i begge ender.'
        : 'Spenningen langs antennen er tegnet som en stiplet kurve: null på midten og størst i begge ender.')));
    } else {
      desc.push(`Kurvene viser strøm${graphs.includes('U') ? ' og spenning' : ''} langs antennen i ett øyeblikk av svingningen (${fmt(p.phase_deg)}° ut i perioden); stiplede linjer viser hvor store de blir.`);
    }
  }
  // the antenna: two halves with a gap for the feed point, insulators at the ends
  els.push(line(X0, y, CX - 6, y, { 'stroke-width': 3.5 }), line(CX + 6, y, X1, y, { 'stroke-width': 3.5 }));
  for (const x of [X0, X1]) els.push(h('circle', { cx: x, cy: y, r: 4, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  els.push(h('circle', { cx: CX - 6, cy: y, r: 2.5, fill: STROKE }), h('circle', { cx: CX + 6, cy: y, r: 2.5, fill: STROKE }));
  desc.unshift(`En halvbølgedipol: en rett leder delt på midten, der den mates.${p.length_label ? ` Lengden fra ende til ende er merket «${p.length_label}».` : ''}`);
  if (p.length_label) dimension(els, X0, X1, 36, p.length_label);
  const bottom = feed(els, p, y, desc);
  return { height: Math.max(bottom, y + 30) + 14, desc: desc.join(' ') };
}

function foldedDipole(els, p) {
  const desc = ['En foldet dipol: to parallelle ledere like lange, koblet sammen i begge ender. Den nederste lederen er delt på midten, der antennen mates.'];
  const y = p.length_label ? 86 : 46;
  els.push(line(X0, y - 12, X1, y - 12, { 'stroke-width': 3 }));
  els.push(h('path', { d: `M ${CX - 6} ${y} L ${X0} ${y} A 6 6 0 0 1 ${X0} ${y - 12}`, fill: 'none', stroke: STROKE, 'stroke-width': 3 }));
  els.push(h('path', { d: `M ${CX + 6} ${y} L ${X1} ${y} A 6 6 0 0 0 ${X1} ${y - 12}`, fill: 'none', stroke: STROKE, 'stroke-width': 3 }));
  els.push(h('circle', { cx: CX - 6, cy: y, r: 2.5, fill: STROKE }), h('circle', { cx: CX + 6, cy: y, r: 2.5, fill: STROKE }));
  if (p.length_label) desc.push(`Lengden er merket «${p.length_label}».`);
  if (p.length_label) dimension(els, X0, X1, 36, p.length_label);
  const bottom = feed(els, p, y, desc);
  return { height: bottom + 14, desc: desc.join(' ') };
}

// ---- verticals -----------------------------------------------------------------------

/**
 * A vertical radiator with four radials at angle a (degrees below horizontal), base at
 * (cx, yb), in oblique projection: the radials to the left and right lie in the drawing
 * plane and show their true angle; the ones towards and away from the viewer are drawn
 * shortened along a 45° depth axis.
 */
function groundPlaneAt(els, cx, yb, a, len, R) {
  const rad = (a * Math.PI) / 180;
  const c = R * Math.cos(rad);
  const s = R * Math.sin(rad);
  const k = 0.35;
  const back = [cx + k * c, yb + s - k * c];
  const front = [cx - k * c, yb + s + k * c];
  const right = [cx + c, yb + s];
  const left = [cx - c, yb + s];
  els.push(line(cx, yb, back[0], back[1], { 'stroke-width': 2.5 }));
  els.push(line(cx, yb, cx, yb - len, { 'stroke-width': 3.5 }));
  for (const [x, y] of [left, right, front]) els.push(line(cx, yb, x, y, { 'stroke-width': 2.5 }));
  els.push(h('rect', { x: cx - 5, y: yb - 4, width: 10, height: 8, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 1.5 }));
  return { right, low: yb + s + k * c };
}

function groundPlane(els, p) {
  const desc = [];
  const len = 150;
  const yb = 176;
  const R = 110;
  const imp = (a) => (a === 0 ? 'om lag 36 Ω' : 'nær 50 Ω');
  const feedText = 'Antennen mates ved foten, der radialene møtes.';
  if (p.compare) {
    let low = 0;
    for (const [cx, a] of [[140, 0], [420, p.radial_angle]]) low = Math.max(low, groundPlaneAt(els, cx, yb, a, len, R).low);
    for (const [cx, a, t] of [[140, 0, 'vannrette radialer'], [420, p.radial_angle, `radialer ${fmt(p.radial_angle)}° ned`]]) {
      els.push(lbl(cx, low + 22, t, 'middle', 12));
      if (p.show_impedance) els.push(lbl(cx, low + 42, `fødeimpedans ${imp(a)}`, 'middle', 12, { 'font-weight': 'bold' }));
    }
    desc.push(`To jordplanantenner side om side, begge med en loddrett kvartbølge og fire radialer ved foten. Til venstre ligger radialene vannrett, til høyre peker de ${fmt(p.radial_angle)}° nedover. ${feedText}`);
    if (p.show_impedance) desc.push('Fødeimpedansen er om lag 36 Ω med vannrette radialer og nær 50 Ω med radialene vinklet nedover.');
    return { height: low + (p.show_impedance ? 56 : 36), desc: desc.join(' ') };
  }
  const cx = 250;
  const { right, low } = groundPlaneAt(els, cx, yb, p.radial_angle, len, R);
  if (p.radial_angle > 0) {
    // the true angle between the right-hand radial and the horizontal
    els.push(line(cx, yb, cx + R + 14, yb, { 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
    const ang = Math.atan2(right[1] - yb, right[0] - cx);
    const r = 70;
    els.push(h('path', { d: `M ${cx + r} ${yb} A ${r} ${r} 0 0 1 ${(cx + r * Math.cos(ang)).toFixed(1)} ${(yb + r * Math.sin(ang)).toFixed(1)}`, fill: 'none', stroke: STROKE, 'stroke-width': 1.2 }));
    const mid = ang / 2;
    els.push(lbl(cx + (r + 8) * Math.cos(mid), yb + (r + 8) * Math.sin(mid) + 2, `${fmt(p.radial_angle)}°`, 'start', 12));
  }
  if (p.length_label) els.push(lbl(cx + 12, yb - len / 2, p.length_label, 'start', 13));
  els.push(lbl(cx - 12, yb - len + 10, 'strålende element', 'end', 12));
  els.push(lbl(cx - R - 14, yb + R * Math.sin((p.radial_angle * Math.PI) / 180) - 2, 'radialer', 'end', 12));
  if (p.show_impedance) els.push(lbl(cx, low + 24, `fødeimpedans ${imp(p.radial_angle)}`, 'middle', 12, { 'font-weight': 'bold' }));
  desc.push(`En jordplanantenne: et loddrett strålende element${p.length_label ? ` merket «${p.length_label}»` : ''} med fire radialer ved foten, ${p.radial_angle === 0 ? 'vannrett ut til alle kanter' : `vinklet ${fmt(p.radial_angle)}° under vannrett`}. ${feedText}`);
  if (p.show_impedance) desc.push(`Fødeimpedansen er ${imp(p.radial_angle)}.`);
  return { height: low + (p.show_impedance ? 38 : 16), desc: desc.join(' ') };
}

function loadedVertical(els, p) {
  const desc = [];
  const cx = 200;
  const yb = 250;
  const H = 200;
  const coilLen = 40;
  const yc = Math.min(yb - p.coil_position * H, yb - coilLen / 2 - 8);
  els.push(line(cx, yb, cx, yc + coilLen / 2, { 'stroke-width': 3.5 }), line(cx, yc - coilLen / 2, cx, yb - H, { 'stroke-width': 3.5 }));
  els.push(inductor(cx, yc, coilLen));
  els.push(lbl(cx + 16, yc - 13, 'spole', 'start', 12));
  els.push(line(cx - 70, yb + 8, cx + 70, yb + 8, { 'stroke-width': 2 }));
  for (let x = cx - 66; x <= cx + 66; x += 12) els.push(line(x, yb + 8, x - 8, yb + 16, { 'stroke-width': 1.2 }));
  els.push(h('rect', { x: cx - 5, y: yb - 2, width: 10, height: 10, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 1.5 }));
  els.push(lbl(cx - 76, yb + 8, 'jord', 'end', 12));
  const where = p.coil_position < 0.15 ? 'helt nede ved foten' : p.coil_position < 0.4 ? 'et stykke opp på antennen' : 'høyt oppe på antennen';
  desc.push(`En loddrett antenne med en spole ${where}${p.length_label ? `. Antennens høyde er merket «${p.length_label}»` : ''}.`);
  if (p.length_label) {
    const x = cx - 46;
    els.push(line(x, yb - 4, x, yb - H, { 'stroke-width': 1.2 }), arrowHead(x, yb - H, 0, -1, 7), arrowHead(x, yb - 4, 0, 1, 7));
    els.push(lbl(x - 8, yb - H + 20, p.length_label, 'end', 13));
  }
  if (p.show_current) {
    // electrically short: above the coil the current falls linearly to zero at the top;
    // below it, it stays nearly as large as at the feed point
    const I = (z) => (z <= p.coil_position ? 1 - 0.1 * (z / Math.max(p.coil_position, 1e-6)) : 0.9 * (1 - (z - p.coil_position) / (1 - p.coil_position)));
    const gx = cx + 90;
    const A = 120;
    const pts = [];
    for (let i = 0; i <= 60; i++) { const z = i / 60; pts.push([gx + A * I(z), yb - z * H]); }
    els.push(line(gx, yb, gx, yb - H, { 'stroke-width': 1, opacity: 0.6 }));
    els.push(h('path', { d: `M ${gx} ${yb} ${pts.map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} L ${gx} ${yb - H} Z`, fill: STROKE, opacity: 0.18, stroke: 'none' }));
    els.push(h('path', { d: `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')}`, fill: 'none', stroke: STROKE, 'stroke-width': 2.5 }));
    els.push(lbl(gx + 10, yb - H - 10, 'strøm langs antennen', 'start', 12));
    // a guide from the coil to the graph, so the bend can be read against the coil's height
    els.push(line(cx + 8, yc, gx + A * I(Math.min(p.coil_position, (yb - yc) / H)) + 6, yc, { 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: 0.7 }));
    const below = p.coil_position;
    desc.push(`Til høyre er strømmen langs antennen tegnet: nesten like stor hele veien fra foten opp til spolen, og så avtagende til null i toppen. Den delen av antennen som fører full strøm, er ${below < 0.15 ? 'svært kort' : below < 0.4 ? 'om lag en tredel av høyden' : `${fmt(below * 100)} % av høyden`}.`);
  }
  return { height: yb + 30, desc: desc.join(' ') };
}

// ---- Yagi and quad ---------------------------------------------------------------------

function yagi(els, p) {
  const n = p.directors;
  const yBoom = 120;
  const x0 = 80;
  const step = Math.min(70, (440 - 80) / (n + 1));
  const els2 = [{ x: x0, half: 96, name: 'reflektor', key: 'reflector' }, { x: x0 + step, half: 87, name: 'dipol (matet)', key: 'driven' }];
  for (let i = 0; i < n; i++) els2.push({ x: x0 + step * (i + 2), half: 78 - i * 3, name: null, key: 'directors' });
  const xEnd = els2[els2.length - 1].x;
  els.push(line(x0 - 20, yBoom, xEnd + 20, yBoom, { 'stroke-width': 5, opacity: 0.55 }));
  for (const e of els2) {
    const hl = p.highlight === e.key;
    const sw = hl ? 5 : 3;
    if (e.key === 'driven') {
      els.push(line(e.x, yBoom - e.half, e.x, yBoom - 5, { 'stroke-width': sw }), line(e.x, yBoom + 5, e.x, yBoom + e.half, { 'stroke-width': sw }));
      els.push(h('circle', { cx: e.x, cy: yBoom, r: 4, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
    } else {
      els.push(line(e.x, yBoom - e.half, e.x, yBoom + e.half, { 'stroke-width': sw }));
    }
  }
  if (p.show_labels) {
    els.push(lbl(els2[0].x, yBoom + 112, 'reflektor', 'middle', 12, { 'font-weight': p.highlight === 'reflector' ? 'bold' : null }));
    els.push(lbl(els2[1].x, yBoom - 104, 'dipol (matet)', 'middle', 12, { 'font-weight': p.highlight === 'driven' ? 'bold' : null }));
    if (n) {
      const xa = els2[2].x;
      const xb = xEnd;
      els.push(line(xa, yBoom + 102, xb, yBoom + 102, { 'stroke-width': 1.2 }), line(xa, yBoom + 96, xa, yBoom + 102, { 'stroke-width': 1.2 }), line(xb, yBoom + 96, xb, yBoom + 102, { 'stroke-width': 1.2 }));
      els.push(lbl((xa + xb) / 2, yBoom + 116, n === 1 ? 'direktor' : 'direktorer', 'middle', 12, { 'font-weight': p.highlight === 'directors' ? 'bold' : null }));
    }
  }
  if (p.show_direction) {
    const xa = xEnd + 34;
    els.push(line(xa, yBoom, xa + 50, yBoom, { 'stroke-width': 2.5 }), arrowHead(xa + 58, yBoom, 1, 0, 11));
    els.push(lbl(xa + 30, yBoom - 16, 'hovedretning', 'middle', 12));
  }
  const desc = [`En Yagi-Uda-antenne sett ovenfra: elementene står på tvers av en bom. Bakerst står reflektoren, som er det lengste elementet. Så kommer dipolen, som er det eneste elementet som mates fra kabelen${n ? `, og foran den ${n === 1 ? 'én direktor, som er kortere enn dipolen' : `${n} direktorer, som er kortere enn dipolen og blir litt kortere jo lenger fram de står`}` : ''}.`];
  if (p.show_direction) desc.push('En pil viser hovedretningen: fra reflektoren mot direktorene.');
  if (p.highlight !== 'none') desc.push(`${{ reflector: 'Reflektoren', driven: 'Dipolen', directors: 'Direktorene' }[p.highlight]} er fremhevet med tykk strek.`);
  return { height: yBoom + 132, desc: desc.join(' ') };
}

function quad(els, p) {
  const cx = 230;
  const s = 170;
  const top = 24;
  const bot = top + s;
  els.push(h('path', { d: `M ${cx - 6} ${bot} L ${cx - s / 2} ${bot} L ${cx - s / 2} ${top} L ${cx + s / 2} ${top} L ${cx + s / 2} ${bot} L ${cx + 6} ${bot}`, fill: 'none', stroke: STROKE, 'stroke-width': 3, 'stroke-linejoin': 'round' }));
  els.push(h('circle', { cx: cx - 6, cy: bot, r: 2.5, fill: STROKE }), h('circle', { cx: cx + 6, cy: bot, r: 2.5, fill: STROKE }));
  els.push(line(cx, bot + 6, cx, bot + 60, { 'stroke-width': 4 }), lbl(cx + 14, bot + 50, 'koaksialkabel', 'start'));
  els.push(lbl(cx, (top + bot) / 2, 'sløyfe', 'middle', 13));
  if (p.length_label) els.push(lbl(cx + s / 2 + 16, (top + bot) / 2, `omkrets: ${p.length_label}`, 'start', 13, { 'font-weight': 'bold' }));
  const desc = `Et element i en quad-antenne: en kvadratisk trådsløyfe som mates på midten av den nederste siden.${p.length_label ? ` Omkretsen er merket «${p.length_label}».` : ''}`;
  return { height: bot + 70, desc };
}

// ---- trap dipole -------------------------------------------------------------------------

function trap(els, cx, y) {
  // parallel LC: the capacitor above, the coil below, joined at both sides
  const w = 18;
  els.push(h('rect', { x: cx - w - 4, y: y - 22, width: 2 * w + 8, height: 40, fill: 'var(--fig-bg)', stroke: 'none' }));
  els.push(line(cx - w - 4, y, cx - w, y), line(cx + w, y, cx + w + 4, y));
  els.push(line(cx - w, y - 14, cx - w, y + 10), line(cx + w, y - 14, cx + w, y + 10));
  els.push(line(cx - w, y - 14, cx - 4, y - 14), line(cx + 4, y - 14, cx + w, y - 14));
  els.push(line(cx - 4, y - 20, cx - 4, y - 8, { 'stroke-width': 2.5 }), line(cx + 4, y - 20, cx + 4, y - 8, { 'stroke-width': 2.5 }));
  els.push(rotated(inductor(cx, y + 10, 2 * w), cx, y + 10, -90));
}

function trapDipole(els, p) {
  const y = 96;
  const tl = CX - 110;
  const tr = CX + 110;
  const faded = p.active === 'inner';
  const outer = { 'stroke-width': 3.5, opacity: faded ? 0.35 : null, 'stroke-dasharray': faded ? '8 5' : null };
  els.push(line(X0, y, tl - 22, y, outer), line(tr + 22, y, X1, y, outer));
  els.push(line(tl + 22, y, CX - 6, y, { 'stroke-width': 3.5 }), line(CX + 6, y, tr - 22, y, { 'stroke-width': 3.5 }));
  trap(els, tl, y);
  trap(els, tr, y);
  for (const x of [X0, X1]) els.push(h('circle', { cx: x, cy: y, r: 4, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  els.push(h('circle', { cx: CX - 6, cy: y, r: 2.5, fill: STROKE }), h('circle', { cx: CX + 6, cy: y, r: 2.5, fill: STROKE }));
  const tlab = p.trap_label ? `felle ${p.trap_label}` : 'felle';
  els.push(lbl(tl, y + 36, tlab, 'middle', 12), lbl(tr, y + 36, tlab, 'middle', 12));
  // spans above: the part inside the traps, and the whole antenna
  if (p.inner_label) dimension(els, tl, tr, y - 32, p.inner_label);
  if (p.outer_label) dimension(els, X0, X1, y - 70, p.outer_label);
  els.push(line(CX, y + 6, CX, y + 70, { 'stroke-width': 4 }), lbl(CX + 14, y + 62, 'koaksialkabel', 'start'));
  const desc = [`En dipol med en bølgefelle i hver halvdel${p.trap_label ? `, avstemt til ${p.trap_label}` : ''}. Hver felle er en spole og en kondensator i parallell. Antennen mates på midten med koaksialkabel.`];
  if (p.inner_label) desc.push(`Delen mellom fellene er merket «${p.inner_label}».`);
  if (p.outer_label) desc.push(`Hele antennen er merket «${p.outer_label}».`);
  if (faded) desc.push('Delene utenfor fellene er stiplet og bleke: på fellenes frekvens er de skilt fra resten, og bare delen mellom fellene er i bruk.');
  return { height: y + 80, desc: desc.join(' ') };
}

// ---- radiation pattern --------------------------------------------------------------------

/** Relative field strength in direction theta (radians, 0 = right/east, counter-clockwise). */
function fieldFn(p) {
  if (p.shape === 'vertical') return () => 1;
  if (p.shape === 'dipole') {
    const axis = p.antenna_axis === 'ew' ? 0 : Math.PI / 2;
    return (th) => {
      const phi = th - axis; // angle from the wire
      const s = Math.abs(Math.sin(phi));
      return s < 1e-6 ? 0 : Math.abs(Math.cos((Math.PI / 2) * Math.cos(phi)) / s);
    };
  }
  // directional: main lobe to the right with the chosen beamwidth, a back lobe front_back_db below
  const half = ((p.beamwidth_deg / 2) * Math.PI) / 180;
  const n = Math.log(Math.SQRT1_2) / Math.log((1 + Math.cos(half)) / 2);
  const back = 10 ** (-p.front_back_db / 20);
  return (th) => Math.max(((1 + Math.cos(th)) / 2) ** n, back * ((1 - Math.cos(th)) / 2) ** n);
}

/** The half-power beamwidth of the main lobe (degrees), found numerically. */
function beamwidth(f, center) {
  const step = Math.PI / 3600;
  let a = 0;
  while (a < Math.PI && f(center + a) >= Math.SQRT1_2 * f(center)) a += step;
  return (2 * a * 180) / Math.PI;
}

function pattern(els, p) {
  const cx = 280;
  const cy = 176;
  const R = 120;
  const f = fieldFn(p);
  const desc = [];
  // grid: the full circle (strongest direction) and half of it
  els.push(h('circle', { cx, cy, r: R, fill: 'none', stroke: STROKE, 'stroke-width': 1, opacity: 0.45 }));
  els.push(h('circle', { cx, cy, r: R / 2, fill: 'none', stroke: STROKE, 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.45 }));
  // the antenna in the middle
  if (p.shape === 'dipole') {
    const [dx, dy] = p.antenna_axis === 'ew' ? [34, 0] : [0, 34];
    els.push(line(cx - dx, cy - dy, cx + dx, cy + dy, { 'stroke-width': 4 }));
  } else if (p.shape === 'vertical') {
    els.push(h('circle', { cx, cy, r: 6, fill: STROKE }));
  } else {
    els.push(line(cx - 26, cy, cx + 26, cy, { 'stroke-width': 3 }));
    for (const [x, hh] of [[-22, 16], [-8, 14], [6, 12], [18, 11]]) els.push(line(cx + x, cy - hh, cx + x, cy + hh, { 'stroke-width': 2.5 }));
  }
  if (p.show_pattern) {
    const pts = [];
    for (let i = 0; i <= 360; i++) {
      const th = (i * Math.PI) / 180;
      const r = R * f(th);
      pts.push([cx + r * Math.cos(th), cy - r * Math.sin(th)]);
    }
    const d = `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`;
    els.push(h('path', { d, fill: STROKE, opacity: 0.16, stroke: 'none' }), h('path', { d, fill: 'none', stroke: STROKE, 'stroke-width': 2.5 }));
  }
  const center = p.shape === 'dipole' ? (p.antenna_axis === 'ew' ? Math.PI / 2 : 0) : 0;
  if (p.show_pattern && p.beamwidth && p.shape !== 'vertical') {
    const bw = beamwidth(f, center);
    const half = ((bw / 2) * Math.PI) / 180;
    for (const s of [1, -1]) {
      const a = center + s * half;
      els.push(line(cx, cy, cx + (R + 18) * Math.cos(a), cy - (R + 18) * Math.sin(a), { 'stroke-width': 1.2, 'stroke-dasharray': '6 4' }));
    }
    const a = center + half;
    const lx = cx + (R + 22) * Math.cos(a);
    const ly = cy - (R + 22) * Math.sin(a);
    const c = Math.cos(a);
    els.push(lbl(lx + (c > 0.2 ? 4 : c < -0.2 ? -4 : 0), ly - 8, `${fmt(bw)}°`, c > 0.2 ? 'start' : c < -0.2 ? 'end' : 'middle', 12, { 'font-weight': 'bold' }));
    desc.push(`To stiplede linjer viser åpningsvinkelen der feltstyrken har falt til halv effekt (−3 dB): om lag ${fmt(bw)}°.`);
  }
  if (p.compass) {
    for (const [t, x, y] of [['N', cx, cy - R - 22], ['S', cx, cy + R + 22], ['Ø', cx + R + 22, cy], ['V', cx - R - 22, cy]]) els.push(lbl(x, y + 1, t, 'middle', 14, { 'font-weight': 'bold' }));
  }
  if (p.shape === 'directional') els.push(lbl(cx + R + 12, cy - 18, 'forover', 'start', 12), lbl(cx - R - 12, cy - 18, 'bakover', 'end', 12));
  const dirs = p.antenna_axis === 'ew' ? ['øst–vest', 'nord og sør', 'øst og vest'] : ['nord–sør', 'øst og vest', 'nord og sør'];
  const what = p.shape === 'dipole'
    ? `en vannrett halvbølgedipol${p.compass ? ` som går ${dirs[0]}` : ''}`
    : p.shape === 'vertical' ? 'en loddrett antenne' : 'en retningsantenne som peker mot høyre';
  const whatCap = what.charAt(0).toUpperCase() + what.slice(1);
  desc.unshift(p.show_pattern
    ? `Strålingsdiagram sett ovenfra for ${what}, tegnet i midten. Kurven viser relativ feltstyrke i hver retning; den ytre sirkelen er den sterkeste retningen og den stiplede sirkelen halvparten.`
    : `${whatCap}, sett ovenfra${p.compass ? ' med kompassretninger rundt' : ''}. Strålingsdiagrammet er ikke tegnet inn.`);
  if (p.show_pattern) {
    if (p.shape === 'dipole') desc.push(p.compass ? `Den stråler sterkest mot ${dirs[1]}, på tvers av antennen, og nesten ingenting mot ${dirs[2]}, langs den.` : 'Den stråler sterkest på tvers av antennen og nesten ingenting langs den.');
    else if (p.shape === 'vertical') desc.push('Kurven er en sirkel: antennen stråler like godt i alle retninger langs bakken.');
    else desc.push(`Den stråler sterkest forover; bakover er feltstyrken ${fmt(p.front_back_db)} dB lavere.`);
  }
  return { height: cy + R + (p.compass ? 44 : 22), desc: desc.join(' ') };
}

const DRAW = { dipole, folded_dipole: foldedDipole, ground_plane: groundPlane, yagi, quad, trap_dipole: trapDipole, loaded_vertical: loadedVertical, pattern };
const TITLE = { dipole: 'Halvbølgedipol', folded_dipole: 'Foldet dipol', ground_plane: 'Jordplanantenne', yagi: 'Yagi-Uda-antenne', quad: 'Quad-element', trap_dipole: 'Dipol med bølgefeller', loaded_vertical: 'Vertikal med spole', pattern: 'Strålingsdiagram' };

function render(p) {
  const els = [];
  const { height, desc } = DRAW[p.kind](els, p);
  return { svg: svgRoot(W, height, TITLE[p.kind], desc, els, {}, 0, 0), description: desc, animatable: false };
}

// the assumption names the computed parts only when the figure has them
function idealised(p, text) {
  const computed = p.kind === 'pattern' ? p.show_pattern : p.show_current || p.show_voltage;
  return computed ? text : text.split('. ')[0] + '.';
}

export default { id: 'antenna', version: 1, rules, quantities: () => ({}), render, idealised };
