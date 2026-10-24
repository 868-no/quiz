// ratio-detector@1: simplified ratio detector (FM demodulator). A tuned MF transformer
// (L1 C1 primary, centre-tapped L2 C2 secondary) feeds two diodes connected the same way
// round the loop, so they charge C3 and C4 to the voltages U1 and U2. A large capacitor
// Cs lies across both, R1 and R2 have their middle to ground, and the centre tap goes to
// the point between C3 and C4, where the LF output is taken. Optionally (after
// answering) the detector's S-curve: output voltage against frequency, through zero at f0,
// with marker_u marking an operating point on it (used by the animation).

import { h } from '../render/vnode.js';
import { arrowHead, capacitor, diode, dot, ground, inductor, label, line, resistor, rotated, svgRoot, symLabel, terminal, wire, STROKE } from './svg.js';

function rules() {
  return []; // every combination of the parameters can be drawn
}

function schematic(els, p) {
  const T = 100;
  const B = 240;
  const M = 170; // the middle: centre tap, between C3 and C4, between R1 and R2
  const IN = 34;
  const C1X = 72;
  const L1X = 112;
  const L2X = 170;
  const C2X = 222;
  const DX = 305;
  const CX = 395;
  const RX = 475;
  const SX = 555;
  // primary: input, C1 and L1 in parallel
  els.push(wire([[IN, T], [L1X, T], [L1X, B], [IN, B]]), terminal(IN, T), terminal(IN, B));
  els.push(dot(C1X, T), dot(C1X, B), wire([[C1X, T], [C1X, B]]), capacitor(C1X, M));
  els.push(inductor(L1X, M, 100));
  if (p.input_label) els.push(label(IN - 4, T - 18, p.input_label, { 'text-anchor': 'start', 'font-size': 12 }));
  // coupling between the two windings
  els.push(line(141, T + 4, 141, B - 4, { 'stroke-width': 1.5 }), line(147, T + 4, 147, B - 4, { 'stroke-width': 1.5 }));
  // secondary: L2 (turns to the left) with a centre tap, C2 across it
  els.push(wire([[L2X, T], [L2X, B]]), rotated(inductor(L2X, M, 100), L2X, M, 180));
  // C2 sits above the middle, so the centre tap can hop over its wire
  els.push(dot(C2X, T), dot(C2X, B), wire([[C2X, T], [C2X, B]]), capacitor(C2X, T + 32));
  els.push(wire([[L2X, T], [SX, T]]), wire([[L2X, B], [SX, B]]));
  // centre tap to the point between C3 and C4 (passes under C2 with a bridge)
  els.push(dot(L2X, M), wire([[L2X, M], [C2X - 8, M]]), h('path', { d: `M ${C2X - 8} ${M} a 8 8 0 0 1 16 0`, fill: 'none', stroke: STROKE, 'stroke-width': 2 }), wire([[C2X + 8, M], [CX, M]]));
  // diodes in the same direction round the loop: D1 into A (top), D2 out of B (bottom)
  els.push(diode(DX, T, 0), diode(DX, B, 180));
  els.push(symLabel(C2X + 26, T + 32, 'C', '2', null, { 'text-anchor': 'start', 'font-size': 13 }), symLabel(L2X - 14, B + 18, 'L', '2', null, { 'font-size': 13 }));
  els.push(symLabel(C1X - 24, M, 'C', '1', null, { 'text-anchor': 'end', 'font-size': 13 }), symLabel(L1X + 14, B + 18, 'L', '1', null, { 'font-size': 13 }));
  els.push(symLabel(DX, T - 24, 'D', '1', null, { 'font-size': 13 }), symLabel(DX, B + 26, 'D', '2', null, { 'font-size': 13 }));
  // C3 and C4 with U1 and U2
  els.push(dot(CX, T), dot(CX, B), dot(CX, M), wire([[CX, T], [CX, B]]), capacitor(CX, (T + M) / 2), capacitor(CX, (M + B) / 2));
  els.push(symLabel(CX - 26, (T + M) / 2, 'C', '3', null, { 'text-anchor': 'end', 'font-size': 13 }), symLabel(CX - 26, (M + B) / 2, 'C', '4', null, { 'text-anchor': 'end', 'font-size': 13 }));
  els.push(symLabel(CX + 26, (T + M) / 2, 'U', '1', null, { 'text-anchor': 'start', 'font-size': 13 }), symLabel(CX + 26, (M + B) / 2, 'U', '2', null, { 'text-anchor': 'start', 'font-size': 13 }));
  // R1 and R2 with their middle to ground
  els.push(dot(RX, T), dot(RX, B), dot(RX, M), wire([[RX, T], [RX, B]]), resistor(RX, (T + M) / 2, true, 40, 16), resistor(RX, (M + B) / 2, true, 40, 16));
  els.push(symLabel(RX + 16, (T + M) / 2, 'R', '1', null, { 'text-anchor': 'start', 'font-size': 13 }), symLabel(RX + 16, (M + B) / 2, 'R', '2', null, { 'text-anchor': 'start', 'font-size': 13 }));
  els.push(wire([[RX, M], [RX + 30, M]]), ground(RX + 30, M));
  // the large capacitor across both halves
  els.push(wire([[SX, T], [SX, B]]), capacitor(SX, M), symLabel(SX + 26, M, 'C', 's', null, { 'text-anchor': 'start', 'font-size': 13 }));
  // LF output between the point between C3/C4 and ground
  els.push(line(CX + 12, M, RX - 12, M, { 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }), arrowHead(CX + 6, M, -1, 0, 7), arrowHead(RX - 6, M, 1, 0, 7));
  els.push(label((CX + RX) / 2 + 4, M - 12, 'LF ut', { 'font-size': 12 }));
  return B + 40;
}

function sCurve(els, top, marker) {
  const X0 = 120;
  const X1 = 500;
  const Y0 = top + 90; // zero line
  const A = 70;
  const xOf = (u) => (X0 + X1) / 2 + (u / 3) * ((X1 - X0) / 2);
  const yOf = (v) => Y0 - v * A;
  // S-shaped discriminator curve: v = u·e^(−u²/2)·1,65, extremes ±1 at u = ±1
  const fn = (u) => 1.6487 * u * Math.exp(-(u * u) / 2);
  let d = '';
  for (let j = 0; j <= 240; j++) {
    const u = -3 + (6 * j) / 240;
    d += `${j ? ' L' : 'M'} ${xOf(u).toFixed(2)} ${yOf(fn(u)).toFixed(2)}`;
  }
  els.push(line(X0, Y0, X1 + 16, Y0), arrowHead(X1 + 22, Y0, 1, 0), line((X0 + X1) / 2, Y0 + A + 10, (X0 + X1) / 2, Y0 - A - 16, { 'stroke-width': 1 }));
  els.push(line(X0, Y0 + A + 10, X0, Y0 - A - 16), arrowHead(X0, Y0 - A - 22, 0, -1));
  els.push(symLabel(X0 - 8, Y0 - A - 26, 'U', 'ut', null, { 'text-anchor': 'end', 'font-size': 13 }), label(X1 + 22, Y0 - 14, 'f', { 'text-anchor': 'end', 'font-size': 13, 'font-style': 'italic' }));
  els.push(label(X0 - 8, Y0, '0', { 'text-anchor': 'end', 'font-size': 11 }));
  els.push(h('path', { d, fill: 'none', stroke: STROKE, 'stroke-width': 2.5, class: 'trace trace-1' }));
  els.push(h('circle', { cx: xOf(0), cy: Y0, r: 4, fill: STROKE }), symLabel(xOf(0) + 8, Y0 + 18, 'f', '0', null, { 'text-anchor': 'start', 'font-size': 12 }));
  // the operating point: where the signal's frequency is just now, and the output it gives
  if (marker != null) {
    const mx = xOf(marker);
    const my = yOf(fn(marker));
    els.push(line(mx, Y0, mx, my, { 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }), line(X0, my, mx, my, { 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }));
    els.push(h('circle', { cx: mx, cy: my, r: 7, fill: STROKE }));
  }
  return Y0 + A + 24;
}

function render(p) {
  const els = [];
  let height = schematic(els, p);
  let description = 'Forenklet koblingsskjema av en forholdsdetektor. MF-transformatoren har en avstemt primærkrets (L1 og C1) og en avstemt sekundærkrets (L2 og C2) med midtuttak. ' +
    'Fra hver ende av sekundærviklingen går en diode, D1 og D2, koblet i samme retning rundt sløyfen. De lader kondensatorene C3 og C4 til spenningene U1 og U2. ' +
    'En stor kondensator Cs ligger over begge, og to like motstander R1 og R2 har midtpunktet til jord. Midtuttaket på L2 er koblet til punktet mellom C3 og C4, og LF-utgangen tas mellom dette punktet og jord.';
  if (p.show_curve) {
    height = sCurve(els, height, p.marker_u);
    description += ' Under skjemaet: utgangsspenningen mot frekvensen, en S-formet kurve. Den går gjennom null ved senterfrekvensen f0, blir positiv på den ene siden og negativ på den andre, og flater ut og går tilbake mot null langt fra senterfrekvensen.';
  }
  return { svg: svgRoot(620, height - 50, 'Forholdsdetektor', description, els, {}, 0, 50), description, animatable: false };
}

export default { id: 'ratio-detector', version: 1, rules, quantities: () => ({}), render };
