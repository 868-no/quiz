// pi-network@1: π-filter (low-pass) at the output of a transmitter: a variable
// capacitor C1 across the input, a coil L in series (optionally with a tap for the
// bands) and a variable capacitor C2 across the output. Optionally fed from a valve
// anode through a blocking capacitor, with the anode voltage brought in through an
// RF choke. One part can be marked, and the knob names TUNE/LOAD can be added.

import { h } from '../render/vnode.js';
import { arrowHead, component, dot, ground, inductor, label, line, svgRoot, symLabel, terminal, wire, STROKE } from './svg.js';

const PARTS = { c1: 'kondensatoren C1 på inngangssiden', l: 'spolen L', c2: 'kondensatoren C2 på utgangssiden' };

function rules() {
  return []; // every combination of the parameters can be drawn
}

/** Arrow drawn through a capacitor at (cx, cy) to show that it is variable. */
function variable(cx, cy) {
  return h('g', {}, line(cx - 17, cy + 15, cx + 12, cy - 11, { 'stroke-width': 1.6 }), arrowHead(cx + 17, cy - 16, 1, -1, 8));
}

function markBox(x, y, w, hh) {
  return h('rect', { x, y, width: w, height: hh, rx: 8, fill: 'none', stroke: STROKE, 'stroke-width': 1.6, 'stroke-dasharray': '5 4', class: 'fig-mark' });
}

function render(p) {
  const els = [];
  const T = 110;
  const B = 250;
  const anode = p.feed === 'anode';
  const IN_X = 40;
  const C1X = anode ? 210 : 140;
  const LX = C1X + 100;
  const C2X = LX + 100;
  const OUT_X = C2X + 80;
  const mid = (T + B) / 2;
  els.push(wire([[IN_X, T], [OUT_X, T]]), wire([[anode ? C1X - 40 : IN_X, B], [OUT_X, B]]));
  els.push(terminal(OUT_X, T), terminal(OUT_X, B), ground(C2X, B));
  els.push(label(OUT_X + 8, T - 18, p.output_label, { 'text-anchor': 'end', 'font-size': 12 }));
  if (anode) {
    // anode on the left, anode voltage through an RF choke, blocking capacitor in series
    els.push(terminal(IN_X, T), label(IN_X - 4, T + 20, 'fra anoden', { 'text-anchor': 'start', 'font-size': 12 }));
    const DX = 85;
    els.push(dot(DX, T), wire([[DX, T], [DX, T - 76]]), inductor(DX, T - 40, 44));
    els.push(label(DX, T - 88, '+ anodespenning', { 'font-size': 12 }), label(DX + 16, T - 40, 'drossel', { 'text-anchor': 'start', 'font-size': 12 }));
    els.push(component('C', 140, T, true), label(140, T + 26, 'blokkering', { 'font-size': 11 }));
  } else {
    els.push(terminal(IN_X, T), terminal(IN_X, B));
    if (p.input_label) els.push(label(IN_X - 4, T - 18, p.input_label, { 'text-anchor': 'start', 'font-size': 12 }));
  }
  // C1, L, C2
  els.push(dot(C1X, T), dot(C1X, B), wire([[C1X, T], [C1X, B]]), component('C', C1X, mid), variable(C1X, mid));
  els.push(dot(C2X, T), dot(C2X, B), wire([[C2X, T], [C2X, B]]), component('C', C2X, mid), variable(C2X, mid));
  els.push(component('L', LX, T, true));
  if (p.coil_tap) {
    // a tap partway along the coil, taken to a band switch
    els.push(line(LX + 6, T - 12, LX + 6, T - 36, { 'stroke-width': 1.6 }), dot(LX + 6, T - 12), label(LX + 12, T - 40, 'uttak (bånd)', { 'text-anchor': 'start', 'font-size': 11 }));
  }
  const role = p.knob_names;
  els.push(symLabel(C1X - 34, mid - (role ? 9 : 0), 'C', '1', null, { 'text-anchor': 'end', 'font-size': 13 }));
  els.push(symLabel(C2X + 34, mid - (role ? 9 : 0), 'C', '2', null, { 'text-anchor': 'start', 'font-size': 13 }));
  els.push(symLabel(LX, T + 26, 'L', null, null, { 'font-size': 13 }));
  if (role) {
    els.push(label(C1X - 34, mid + 10, 'TUNE', { 'text-anchor': 'end', 'font-size': 12, 'font-weight': 'bold' }));
    els.push(label(C2X + 34, mid + 10, 'LOAD', { 'text-anchor': 'start', 'font-size': 12, 'font-weight': 'bold' }));
  }
  const boxes = { c1: [C1X - 26, mid - 30, 52, 60], c2: [C2X - 26, mid - 30, 52, 60], l: [LX - 34, T - 22, 68, 38] };
  if (p.mark !== 'none') els.push(markBox(...boxes[p.mark]));

  let description = 'Koblingsskjema av et pi-filter (lavpass): en variabel kondensator C1 fra inngangen til jord, en spole L i serie og en variabel kondensator C2 fra utgangen til jord.';
  if (anode) description += ' Filteret får signalet fra anoden på et rør gjennom en blokkeringskondensator, og anodespenningen kommer inn gjennom en drossel.';
  if (p.coil_tap) description += ' Spolen har et uttak som velges for de ulike båndene.';
  description += ` Utgangen er merket «${p.output_label}».`;
  if (role) description += ' C1 er merket TUNE og C2 LOAD.';
  if (p.mark !== 'none') description += ` ${PARTS[p.mark][0].toUpperCase()}${PARTS[p.mark].slice(1)} er markert med en stiplet ramme.`;
  return { svg: svgRoot(OUT_X + 50, 300, 'Pi-filter', description, els, {}, 0, 0), description, animatable: false };
}

export default { id: 'pi-network', version: 1, rules, quantities: () => ({}), render };
