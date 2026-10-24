// series-regulator@1: linear series regulator. NPN pass transistor between input
// and output, base fed through a resistor from the input and held by a zener diode
// to ground, load at the output, optional input capacitor. The voltage across and
// the power in the pass transistor are computed, never typed in.

import { formatSI } from '../render/format.js';
import { arrowHead, component, diode, dot, label, line, npn, rotated, svgRoot, symLabel, terminal, wire } from './svg.js';

function rules(p) {
  const errors = [];
  if (p.u_in_v != null && p.u_out_v != null && p.u_out_v >= p.u_in_v) errors.push("u_out_v: a series regulator's output must be lower than its input");
  if (new Set(p.unknown).size !== p.unknown.length) errors.push('unknown: duplicates');
  const given = { U_in: p.u_in_v, U_out: p.u_out_v, I_L: p.i_load_a };
  for (const k of p.unknown) if (k in given && given[k] == null) errors.push(`unknown: ${k} is marked '?' but has no value to check against`);
  return errors;
}

function quantities(p) {
  const q = {};
  const unk = new Set(p.unknown);
  for (const [key, name, unit] of [['u_in_v', 'U_in', 'V'], ['u_out_v', 'U_out', 'V'], ['i_load_a', 'I_L', 'A']]) {
    if (p[key] != null) q[name] = { value: p[key], unit, shown: !unk.has(name) };
  }
  if (p.u_in_v != null && p.u_out_v != null) {
    q.U_pass = { value: p.u_in_v - p.u_out_v, unit: 'V', shown: false };
    if (p.i_load_a != null) q.P_pass = { value: (p.u_in_v - p.u_out_v) * p.i_load_a, unit: 'W', shown: false };
  }
  return q;
}

function render(p) {
  const els = [];
  const unk = new Set(p.unknown);
  const TOP = 100;
  const GND = 300;
  const IN_X = 60;
  const OUT_X = 520;
  const tx = 300;
  const ty = TOP + 9; // so that collector and emitter land on the top rail after rotation
  // pass transistor turned 90°: collector to the left, emitter to the right, base down
  const t = npn(tx, ty);
  els.push(rotated(t.node, tx, ty, -90));
  const cL = tx - 36;
  const eR = tx + 36;
  const baseY = ty + 38;
  els.push(wire([[IN_X, TOP], [cL, TOP]]), wire([[eR, TOP], [OUT_X, TOP]]), wire([[IN_X, GND], [OUT_X, GND]]));
  els.push(terminal(IN_X, TOP), terminal(IN_X, GND), terminal(OUT_X, TOP), terminal(OUT_X, GND));
  // base resistor from the input rail, zener from the base node to ground
  const rX = 180;
  const nodeY = 190;
  els.push(dot(rX, TOP), wire([[rX, TOP], [rX, nodeY], [tx, nodeY], [tx, baseY]]), component('R', rX, (TOP + nodeY) / 2), dot(tx, nodeY));
  els.push(symLabel(rX - 16, (TOP + nodeY) / 2, 'R', null, null, { 'text-anchor': 'end', 'font-size': 13 }));
  els.push(wire([[tx, nodeY], [tx, GND]]), diode(tx, (nodeY + GND) / 2, -90, 12, true), dot(tx, GND));
  els.push(symLabel(tx + 22, (nodeY + GND) / 2, 'D', 'Z', null, { 'text-anchor': 'start', 'font-size': 13 }));
  // optional input capacitor, load
  if (p.input_capacitor) {
    const cx = 120;
    els.push(dot(cx, TOP), dot(cx, GND), wire([[cx, TOP], [cx, GND]]), component('C', cx, (TOP + GND) / 2));
  }
  const lx = 450;
  els.push(dot(lx, TOP), dot(lx, GND), wire([[lx, TOP], [lx, GND]]), component('R', lx, (TOP + GND) / 2));
  els.push(symLabel(lx + 16, (TOP + GND) / 2, 'R', 'L', null, { 'text-anchor': 'start', 'font-size': 13 }));
  // labels
  const v = (name, val, unit) => (val == null ? null : unk.has(name) ? '?' : formatSI(val, unit));
  const uin = v('U_in', p.u_in_v, 'V');
  // voltage labels under the terminal pairs, so the figure stays narrow enough for phones
  if (uin) els.push(symLabel(IN_X - 6, GND + 30, 'U', 'inn', ` = ${uin}`, { 'text-anchor': 'start', 'font-size': 13 }));
  const uout = v('U_out', p.u_out_v, 'V');
  if (uout) els.push(symLabel(OUT_X + 6, GND + 30, 'U', 'ut', ` = ${uout}`, { 'text-anchor': 'end', 'font-size': 13 }));
  const il = v('I_L', p.i_load_a, 'A');
  if (il) {
    els.push(line(lx - 52, TOP - 14, lx - 26, TOP - 14, { 'stroke-width': 1.5 }), arrowHead(lx - 18, TOP - 14, 1, 0, 8));
    els.push(symLabel(lx - 36, TOP - 32, 'I', 'L', ` = ${il}`, { 'font-size': 13 }));
  }
  if (unk.has('P_pass')) els.push(symLabel(tx, TOP - 50, 'P', null, ' = ?', { 'font-size': 13 }), label(tx, TOP - 32, 'i serietransistoren', { 'font-size': 11 }));
  if (unk.has('U_pass')) els.push(symLabel(tx, TOP - 50, 'U', 'CE', ' = ?', { 'font-size': 13 }));
  const parts = [];
  if (uin) parts.push(`inngangsspenning ${uin === '?' ? 'ukjent (?)' : uin}`);
  if (uout) parts.push(`utgangsspenning ${uout === '?' ? 'ukjent (?)' : uout}`);
  if (il) parts.push(`laststrøm ${il === '?' ? 'ukjent (?)' : il}`);
  let description = 'Koblingsskjema av en lineær spenningsregulator: en NPN-transistor sitter i serie mellom inngang og utgang. Basis får strøm gjennom en motstand fra inngangen og holdes fast av en zenerdiode mot jord. En lastmotstand sitter på utgangen.';
  if (p.input_capacitor) description += ' En kondensator sitter over inngangen.';
  if (parts.length) description += ` Oppgitt: ${parts.join(', ')}.`;
  if (unk.has('P_pass')) description += ' Effekten i serietransistoren er markert med spørsmålstegn.';
  return { svg: svgRoot(510, 330, 'Spenningsregulator med serietransistor', description, els, {}, 30, 20), description, animatable: false };
}

export default { id: 'series-regulator', version: 1, rules, quantities, render };
