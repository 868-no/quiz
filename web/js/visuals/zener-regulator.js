// zener-regulator@1: simple zener voltage reference. A DC input feeds a zener diode to
// ground through a series resistor R; the zener voltage is taken out at the output
// terminals. The voltage across R and the value of R are computed, never typed in.

import { formatSI } from '../render/format.js';
import { arrowHead, component, diode, dot, label, line, svgRoot, symLabel, terminal, wire } from './svg.js';

function rules(p) {
  const errors = [];
  if (p.u_z_v >= p.u_in_v) errors.push('u_z_v: the zener voltage must be lower than the input voltage');
  if (new Set(p.unknown).size !== p.unknown.length) errors.push('unknown: duplicates');
  if (p.i_a == null && (p.unknown.includes('I') || p.unknown.includes('R'))) errors.push('unknown: I and R need i_a');
  return errors;
}

function quantities(p) {
  const unk = new Set(p.unknown);
  const uR = p.u_in_v - p.u_z_v;
  const q = {
    U_in: { value: p.u_in_v, unit: 'V', shown: !unk.has('U_in') },
    U_Z: { value: p.u_z_v, unit: 'V', shown: !unk.has('U_Z') },
    U_R: { value: uR, unit: 'V', shown: false },
  };
  if (p.i_a != null) {
    q.I = { value: p.i_a, unit: 'A', shown: !unk.has('I') };
    q.R = { value: uR / p.i_a, unit: 'Ω', shown: !unk.has('R') };
  }
  return q;
}

function render(p) {
  const unk = new Set(p.unknown);
  const els = [];
  const T = 100;
  const B = 240;
  const IN_X = 60;
  const OUT_X = 380;
  const RX = 150;
  const ZX = 260;
  const v = (name, value, unit) => (unk.has(name) ? '?' : formatSI(value, unit));
  els.push(wire([[IN_X, T], [OUT_X, T]]), wire([[IN_X, B], [OUT_X, B]]));
  els.push(terminal(IN_X, T), terminal(IN_X, B), terminal(OUT_X, T), terminal(OUT_X, B));
  els.push(label(IN_X - 14, T, '+', { 'font-size': 16 }), label(IN_X - 14, B, '−', { 'font-size': 16 }));
  // series resistor on the top rail
  els.push(component('R', RX, T, true));
  const rText = unk.has('R') ? ' = ?' : p.i_a != null ? ` = ${formatSI((p.u_in_v - p.u_z_v) / p.i_a, 'Ω')}` : null;
  els.push(symLabel(RX, T - 28, 'R', null, rText, { 'font-size': 13 }));
  if (unk.has('U_R')) els.push(symLabel(RX, T + 30, 'U', 'R', ' = ?', { 'font-size': 13 }));
  // zener from the node to ground, cathode up
  els.push(dot(ZX, T), dot(ZX, B), wire([[ZX, T], [ZX, B]]), diode(ZX, (T + B) / 2, -90, 12, true));
  els.push(symLabel(ZX + 22, (T + B) / 2 - 10, 'D', 'Z', null, { 'text-anchor': 'start', 'font-size': 13 }));
  els.push(symLabel(ZX + 22, (T + B) / 2 + 12, 'U', 'Z', ` = ${v('U_Z', p.u_z_v, 'V')}`, { 'text-anchor': 'start', 'font-size': 13 }));
  // current through R and the zener
  if (p.i_a != null) {
    const ax = (RX + ZX) / 2 + 12;
    els.push(line(ax - 22, T - 14, ax + 4, T - 14, { 'stroke-width': 1.5 }), arrowHead(ax + 12, T - 14, 1, 0, 8));
    els.push(symLabel(ax - 4, T - 32, 'I', null, ` = ${v('I', p.i_a, 'A')}`, { 'font-size': 13 }));
  }
  // voltage labels under the terminal pairs
  els.push(symLabel(IN_X - 6, B + 30, 'U', 'inn', ` = ${v('U_in', p.u_in_v, 'V')}`, { 'text-anchor': 'start', 'font-size': 13 }));
  if (p.output_label) els.push(label(OUT_X + 6, B + 30, p.output_label, { 'text-anchor': 'end', 'font-size': 13 }));
  const parts = [`inngangsspenning ${unk.has('U_in') ? 'ukjent (?)' : formatSI(p.u_in_v, 'V')}`,
    `zenerspenning ${unk.has('U_Z') ? 'ukjent (?)' : formatSI(p.u_z_v, 'V')}`];
  if (p.i_a != null) parts.push(`strøm gjennom R og zenerdioden ${unk.has('I') ? 'ukjent (?)' : formatSI(p.i_a, 'A')}`);
  let description = 'Koblingsskjema: en likespenning på inngangen går gjennom en seriemotstand R til en zenerdiode koblet mot minus (katoden opp). Zenerspenningen tas ut på utgangsklemmene';
  description += p.output_label ? ` (${p.output_label}).` : '.';
  description += ` Oppgitt: ${parts.join(', ')}.`;
  if (unk.has('R')) description += ' Motstanden R er markert med spørsmålstegn.';
  if (unk.has('U_R')) description += ' Spenningen over R er markert med spørsmålstegn.';
  return { svg: svgRoot(380, 250, 'Zenerdiode med seriemotstand', description, els, {}, 30, 50), description, animatable: false };
}

export default { id: 'zener-regulator', version: 1, rules, quantities, render };
