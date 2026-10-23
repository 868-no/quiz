// transistor-stage@1: NPN common-emitter stage. Collector resistor to the supply,
// optional emitter resistor (with optional bypass capacitor), optional base voltage
// divider and coupling capacitors. Node voltages and the collector current can be
// labelled with a value or '?'. Values are author-given labels (SI units).

import { formatSI } from '../render/format.js';
import { arrowHead, component, dot, ground, label, line, npn, svgRoot, symLabel, terminal, wire } from './svg.js';

const NODE_Q = { B: ['U_B', 'V'], E: ['U_E', 'V'], C: ['U_C', 'V'], IC: ['I_C', 'A'] };

function rules(p) {
  const errors = [];
  const nodes = p.labels.map((l) => l.node);
  if (new Set(nodes).size !== nodes.length) errors.push('labels: each node can be labelled once');
  if (p.bypass_capacitor && p.re_ohms == null) errors.push('bypass_capacitor: needs an emitter resistor (re_ohms)');
  if (p.rc_ohms == null) errors.push('rc_ohms: required (the collector resistor is always drawn)');
  return errors;
}

function quantities(p) {
  const q = { U_CC: { value: p.vcc_v, unit: 'V', shown: p.show_vcc } };
  if (p.rc_ohms != null) q.R_C = { value: p.rc_ohms, unit: 'Ω', shown: p.show_resistor_values };
  if (p.re_ohms != null) q.R_E = { value: p.re_ohms, unit: 'Ω', shown: p.show_resistor_values };
  for (const l of p.labels) {
    const [sym, unit] = NODE_Q[l.node];
    if (l.value != null) q[sym] = { value: l.value, unit, shown: true };
  }
  return q;
}

function render(p) {
  const els = [];
  const VCC = 50;
  const GND = 330;
  const t = npn(300, 200);
  const [cx, cy] = t.c;
  const [ex, ey] = t.e;
  const [bx, by] = t.b;
  const lab = (node) => p.labels.find((l) => l.node === node);
  const fmt = (l, unit) => (l.value == null ? '?' : formatSI(l.value, unit));
  const rv = (v) => (p.show_resistor_values ? ` = ${formatSI(v, 'Ω')}` : '');
  // supply rail
  const left = p.divider ? 180 : cx;
  els.push(wire([[left, VCC], [cx + 90, VCC]]));
  els.push(symLabel(cx + 96, VCC, '+U', 'CC', p.show_vcc ? ` = ${formatSI(p.vcc_v, 'V')}` : '', { 'text-anchor': 'start', 'font-size': 13 }));
  // collector resistor
  const rcY = (VCC + cy) / 2 - 6;
  els.push(wire([[cx, VCC], [cx, cy]]), dot(cx, VCC), component('R', cx, rcY));
  els.push(symLabel(cx + 16, rcY, 'R', 'C', rv(p.rc_ohms), { 'text-anchor': 'start', 'font-size': 13 }));
  // output
  const outY = cy - 14;
  if (p.coupling) {
    els.push(dot(cx, outY), wire([[cx, outY], [cx + 110, outY]]), component('C', cx + 55, outY, true), terminal(cx + 110, outY));
    els.push(label(cx + 128, outY, 'ut', { 'font-size': 13, 'text-anchor': 'start' }));
  }
  // emitter
  els.push(t.node);
  if (p.re_ohms != null) {
    const reY = (ey + GND) / 2;
    els.push(wire([[ex, ey], [ex, GND]]), component('R', ex, reY), ground(ex, GND));
    els.push(symLabel(ex - 16, reY, 'R', 'E', rv(p.re_ohms), { 'text-anchor': 'end', 'font-size': 13 }));
    if (p.bypass_capacitor) {
      const capX = ex + 60;
      els.push(dot(ex, ey + 10), wire([[ex, ey + 10], [capX, ey + 10], [capX, GND], [ex, GND]]), dot(ex, GND), component('C', capX, reY));
      els.push(symLabel(capX + 26, reY, 'C', 'E', null, { 'text-anchor': 'start', 'font-size': 13 }));
    }
  } else {
    els.push(wire([[ex, ey], [ex, GND]]), ground(ex, GND));
  }
  // base: divider or plain bias input
  const nodeX = p.divider ? left : bx;
  if (p.divider) {
    els.push(wire([[left, VCC], [left, GND]]), dot(left, VCC), dot(left, by), component('R', left, (VCC + by) / 2), component('R', left, (by + GND) / 2), ground(left, GND));
    els.push(symLabel(left - 16, (VCC + by) / 2, 'R', '1', null, { 'text-anchor': 'end', 'font-size': 13 }));
    els.push(symLabel(left - 16, (by + GND) / 2, 'R', '2', null, { 'text-anchor': 'end', 'font-size': 13 }));
    els.push(wire([[left, by], [bx, by]]));
  }
  if (!p.divider && !p.coupling) {
    els.push(terminal(bx - 40, by), wire([[bx - 40, by], [bx, by]]));
    els.push(label(bx - 52, by, 'inn', { 'font-size': 13, 'text-anchor': 'end' }));
  }
  if (p.coupling) {
    const inX = (p.divider ? left : bx) - 100;
    els.push(wire([[inX, by], [nodeX, by]]), component('C', inX + 45, by, true), terminal(inX, by));
    els.push(label(inX - 10, by, 'inn', { 'font-size': 13, 'text-anchor': 'end' }));
  }
  // node labels
  const b = lab('B');
  if (b) els.push(symLabel(bx - 4, by - 22, 'U', 'B', ` = ${fmt(b, 'V')}`, { 'text-anchor': 'end', 'font-size': 13 }));
  const e = lab('E');
  if (e) els.push(symLabel(ex - 12, ey - 2, 'U', 'E', ` = ${fmt(e, 'V')}`, { 'text-anchor': 'end', 'font-size': 13 }));
  const c = lab('C');
  if (c) els.push(symLabel(cx + 12, cy - 2, 'U', 'C', ` = ${fmt(c, 'V')}`, { 'text-anchor': 'start', 'font-size': 13 }));
  const ic = lab('IC');
  if (ic) {
    els.push(arrowHead(cx - 14, cy - 10, 0, 1, 8), line(cx - 14, cy - 34, cx - 14, cy - 18, { 'stroke-width': 1.5 }));
    els.push(symLabel(cx - 20, cy - 26, 'I', 'C', ` = ${fmt(ic, 'A')}`, { 'text-anchor': 'end', 'font-size': 13 }));
  }
  const parts = [`kollektormotstand${p.show_resistor_values ? ` = ${formatSI(p.rc_ohms, 'Ω')}` : ''} mot forsyningen`];
  if (p.re_ohms != null) parts.push(`emittermotstand${p.show_resistor_values ? ` = ${formatSI(p.re_ohms, 'Ω')}` : ''} mot jord${p.bypass_capacitor ? ', avkoblet med en kondensator' : ''}`);
  else parts.push('emitteren rett på jord');
  if (p.divider) parts.push('spenningsdeler R1–R2 på basis');
  if (p.coupling) parts.push('koblingskondensatorer på inngang og utgang');
  const NODE_NAME = { B: 'spenningen på basis', E: 'spenningen på emitteren', C: 'spenningen på kollektoren', IC: 'kollektorstrømmen' };
  const labTxt = p.labels.map((l) => `${NODE_NAME[l.node]} = ${l.value == null ? 'ukjent (?)' : formatSI(l.value, NODE_Q[l.node][1])}`);
  const description = `Koblingsskjema av et forsterkertrinn med NPN-transistor i felles emitter-kobling, forsyningsspenning ${p.show_vcc ? formatSI(p.vcc_v, 'V') : 'ukjent'}: ${parts.join('; ')}.${labTxt.length ? ` Markert: ${labTxt.join(', ')}.` : ''}`;
  const minX = p.divider ? 40 : p.coupling ? bx - 180 : bx - 110;
  return { svg: svgRoot(560 - minX, 370, 'Transistortrinn med felles emitter', description, els, {}, minX, 0), description, animatable: false };
}

export default { id: 'transistor-stage', version: 1, rules, quantities, render };
