// dc-circuit@1: DC source with resistors in series or parallel and optional ideal
// meters. In a series circuit the source can have an internal resistance r, drawn
// inside a dashed box with the battery. Meter readings are computed from the circuit,
// never typed in.

import { h } from '../render/vnode.js';
import { formatSI } from '../render/format.js';
import { arrowHead, battery, dot, label, meter, resistor, svgRoot, symLabel, wire, STROKE } from './svg.js';

function rules(p) {
  const errors = [];
  const n = p.resistors.length;
  if (p.topology === 'parallel' && n < 2) errors.push('resistors: a parallel circuit needs at least 2 resistors');
  const names = new Set(p.resistors.map((_, i) => `R${i + 1}`));
  const am = p.ammeter;
  if (am) {
    if (p.topology === 'series' && am.branch !== 'main') errors.push("ammeter.branch: in a series circuit the ammeter is in the main loop ('main')");
    if (am.branch !== 'main' && !names.has(am.branch)) errors.push(`ammeter.branch: ${am.branch} does not exist`);
  }
  const vm = p.voltmeter;
  if (vm && vm.across !== 'source' && !names.has(vm.across)) errors.push(`voltmeter.across: ${vm.across} does not exist`);
  if (p.source.internal_ohms != null && p.topology !== 'series') errors.push('source.internal_ohms: only drawn for a series circuit');
  return errors;
}

function quantities(p) {
  const u = p.source.voltage_v;
  const rs = p.resistors.map((r) => r.ohms);
  const am = p.ammeter;
  const vm = p.voltmeter;
  const q = { U: { value: u, unit: 'V', shown: p.source.show_value } };
  p.resistors.forEach((r, i) => { q[`R${i + 1}`] = { value: r.ohms, unit: 'Ω', shown: r.show_value && !r.name_only }; });
  let rt;
  let iMain;
  let branchI;
  let branchU;
  const rInt = p.source.internal_ohms;
  if (p.topology === 'series') {
    rt = rs.reduce((a, b) => a + b, 0) + (rInt || 0); // the source's internal resistance is in the loop
    iMain = u / rt;
    branchI = rs.map(() => iMain);
    branchU = rs.map((r) => iMain * r);
  } else {
    rt = 1 / rs.reduce((a, r) => a + 1 / r, 0);
    branchI = rs.map((r) => u / r);
    branchU = rs.map(() => u);
    iMain = branchI.reduce((a, b) => a + b, 0);
  }
  q.R_total = { value: rt, unit: 'Ω', shown: false };
  q.I = { value: iMain, unit: 'A', shown: Boolean(am && am.branch === 'main' && am.show_reading) };
  rs.forEach((_, i) => {
    const name = `R${i + 1}`;
    q[`I_${name}`] = {
      value: branchI[i], unit: 'A',
      shown: Boolean(am && am.show_reading && (am.branch === name || (p.topology === 'series' && am.branch === 'main'))),
    };
    q[`U_${name}`] = { value: branchU[i], unit: 'V', shown: Boolean(vm && vm.show_reading && vm.across === name) };
    q[`P_${name}`] = { value: branchI[i] * branchU[i], unit: 'W', shown: false };
  });
  if (rInt != null) {
    q.r = { value: rInt, unit: 'Ω', shown: p.source.show_internal };
    q.U_r = { value: iMain * rInt, unit: 'V', shown: false };
  }
  // what a voltmeter across the source's terminals reads (EMF minus the internal drop)
  q.U_terminal = { value: u - iMain * (rInt || 0), unit: 'V', shown: Boolean(vm && vm.show_reading && vm.across === 'source') };
  q.P = { value: u * iMain, unit: 'W', shown: false };
  return q;
}

const val = (shown, value, unit) => (shown ? formatSI(value, unit) : '?');

function describe(p, q) {
  const parts = [];
  const rs = p.resistors.map((r, i) => (r.name_only ? `R${i + 1}` : `R${i + 1} = ${r.show_value ? formatSI(r.ohms, 'Ω') : 'ukjent'}`));
  const kind = p.topology === 'series' ? 'i serie' : 'i parallell';
  parts.push(`Koblingsskjema: et batteri med spenning ${p.source.show_value ? formatSI(p.source.voltage_v, 'V') : 'ukjent'} ` +
    `er koblet til ${rs.length === 1 ? 'én motstand' : `${rs.length} motstander ${kind}`}: ${rs.join(', ')}.`);
  if (p.source.internal_ohms != null) {
    parts.push(`Batteriet har en indre resistans r = ${p.source.show_internal ? formatSI(p.source.internal_ohms, 'Ω') : 'ukjent (?)'}, tegnet i serie med batteriet inne i en stiplet ramme.`);
  }
  if (p.ammeter) {
    const where = p.ammeter.branch === 'main' ? 'i hovedledningen' : `i grenen med ${p.ammeter.branch}`;
    const sym = p.ammeter.branch === 'main' ? 'I' : `I_${p.ammeter.branch}`;
    parts.push(`Et amperemeter ${where} viser ${p.ammeter.show_reading ? formatSI(q[sym].value, 'A') : 'en ukjent strøm (?)'}.`);
  }
  if (p.voltmeter) {
    const across = p.voltmeter.across === 'source' ? 'batteriet' : p.voltmeter.across;
    const reading = p.voltmeter.across === 'source' ? q.U_terminal.value : q[`U_${p.voltmeter.across}`].value;
    parts.push(`Et voltmeter over ${across === 'batteriet' && p.source.internal_ohms != null ? 'batteriets klemmer' : across} viser ${p.voltmeter.show_reading ? formatSI(reading, 'V') : 'en ukjent spenning (?)'}.`);
  }
  if (p.show_current_direction) parts.push('Piler viser strømretningen (konvensjonell strøm, fra plusspolen gjennom kretsen til minuspolen).');
  return parts.join(' ');
}

function renderSeries(p, q) {
  const L = 130;
  const R = 430;
  const T = 100;
  const B = 230;
  const BY = 165;
  const n = p.resistors.length;
  const xs = { 1: [280], 2: [225, 335], 3: [190, 280, 370] }[n];
  const els = [wire([[L, BY - 6], [L, T], [R, T], [R, B], [L, B], [L, BY + 6]])];
  const flow = [`M ${L} ${BY - 6} L ${L} ${T} L ${R} ${T} L ${R} ${B} L ${L} ${B} L ${L} ${BY + 6}`];
  const rInt = p.source.internal_ohms;
  // with an internal resistance the battery moves up and r sits below it, both in a dashed box
  // (the box stays clear of the rails, so a voltmeter across the source taps outside it)
  const bY = rInt != null ? BY - 15 : BY;
  if (rInt != null) {
    const rY = BY + 20;
    els.push(h('rect', { x: L - 40, y: bY - 18, width: 64, height: rY - bY + 38, fill: 'none', stroke: STROKE, 'stroke-width': 1.2, 'stroke-dasharray': '5 4' }));
    els.push(wire([[L, bY + 6], [L, BY + 6]]), resistor(L, rY, true, 34, 14));
    els.push(symLabel(L + 34, rY, 'r', null, ` = ${val(p.source.show_internal, rInt, 'Ω')}`, { 'text-anchor': 'start', 'font-size': 13 }));
  }
  p.resistors.forEach((r, i) => {
    els.push(resistor(xs[i], T));
    // name_only: just "R1", for a resistor whose value is neither given nor asked
    els.push(symLabel(xs[i], T + 30, 'R', String(i + 1), r.name_only ? null : ` = ${val(r.show_value, r.ohms, 'Ω')}`, { 'font-size': 13 }));
  });
  els.push(battery(L, bY));
  els.push(symLabel(L + (rInt != null ? 34 : 22), bY, 'U', rInt != null ? '0' : null, ` = ${val(p.source.show_value, p.source.voltage_v, 'V')}`, { 'text-anchor': 'start', 'font-size': 13 }));
  if (p.ammeter) {
    const cx = 280;
    els.push(meter(cx, B, 'A'));
    els.push(symLabel(cx, B + 34, 'I', null, ` = ${val(p.ammeter.show_reading, q.I.value, 'A')}`, { 'font-size': 13 }));
  }
  if (p.voltmeter) {
    if (p.voltmeter.across === 'source') {
      const mx = L - 85;
      const t1 = rInt != null ? T + 10 : T + 25; // the terminals: outside the dashed box
      const t2 = rInt != null ? B - 10 : B - 25;
      els.push(dot(L, t1), dot(L, t2));
      els.push(wire([[L, t1], [mx, t1], [mx, BY - 17]]), wire([[mx, BY + 17], [mx, t2], [L, t2]]));
      els.push(meter(mx, BY, 'V'));
      els.push(symLabel(mx, rInt != null ? t2 + 22 : B - 8, 'U', rInt != null ? 'kl' : null, ` = ${val(p.voltmeter.show_reading, q.U_terminal.value, 'V')}`, { 'font-size': 12 }));
    } else {
      const k = Number(p.voltmeter.across.slice(1)) - 1;
      const cx = xs[k];
      const my = T - 55;
      els.push(dot(cx - 30, T), dot(cx + 30, T));
      els.push(wire([[cx - 30, T], [cx - 30, my], [cx - 17, my]]), wire([[cx + 17, my], [cx + 30, my], [cx + 30, T]]));
      els.push(meter(cx, my, 'V'));
      els.push(symLabel(cx + 36, my, 'U', `R${k + 1}`, ` = ${val(p.voltmeter.show_reading, q[`U_R${k + 1}`].value, 'V')}`, { 'text-anchor': 'start', 'font-size': 12 }));
    }
  }
  if (p.show_current_direction) {
    els.push(arrowHead(L, T + 22, 0, -1), arrowHead(R, (T + B) / 2 + 6, 0, 1), arrowHead(R - 60, B, -1, 0));
    els.push(symLabel(R + 16, (T + B) / 2, 'I', null, null, { 'font-size': 14 }));
  }
  const minX = p.voltmeter && p.voltmeter.across === 'source' ? 0 : 60;
  const minY = p.voltmeter && p.voltmeter.across !== 'source' ? 10 : 70;
  return { els, flow, width: 480 - minX, height: 300 - minY, minX, minY };
}

function renderParallel(p, q) {
  const L = 90;
  const T = 70;
  const B = 240;
  const BY = 155;
  const n = p.resistors.length;
  const xs = { 2: [230, 350], 3: [200, 320, 440] }[n]; // room for a label beside each branch
  const vmX = xs[n - 1] + 75;
  const right = p.voltmeter ? vmX : xs[n - 1];
  const els = [wire([[L, BY - 6], [L, T], [right, T]]), wire([[right, B], [L, B], [L, BY + 6]])];
  const flow = [];
  const am = p.ammeter;
  xs.forEach((x, i) => {
    const name = `R${i + 1}`;
    els.push(wire([[x, T], [x, B]]));
    if (x !== right) els.push(dot(x, T), dot(x, B));
    const inBranch = am && am.branch === name;
    const ry = inBranch ? 190 : BY;
    els.push(resistor(x, ry, true));
    els.push(symLabel(x + 15, ry, 'R', String(i + 1), ` = ${val(p.resistors[i].show_value, p.resistors[i].ohms, 'Ω')}`, { 'text-anchor': 'start', 'font-size': 12 }));
    if (inBranch) {
      els.push(meter(x, 115, 'A'));
      els.push(symLabel(x + 21, 115, 'I', name, ` = ${val(am.show_reading, q[`I_${name}`].value, 'A')}`, { 'text-anchor': 'start', 'font-size': 12 }));
    }
    flow.push(`M ${L} ${BY - 6} L ${L} ${T} L ${x} ${T} L ${x} ${B} L ${L} ${B} L ${L} ${BY + 6}`);
  });
  els.push(battery(L, BY));
  els.push(symLabel(L - 12, BY + 46, 'U', null, ` = ${val(p.source.show_value, p.source.voltage_v, 'V')}`, { 'font-size': 12, 'text-anchor': 'end' }));
  if (am && am.branch === 'main') {
    els.push(meter(150, T, 'A'));
    els.push(symLabel(150, T - 30, 'I', null, ` = ${val(am.show_reading, q.I.value, 'A')}`, { 'font-size': 13 }));
  }
  if (p.voltmeter) {
    els.push(dot(xs[n - 1], T), dot(xs[n - 1], B));
    els.push(wire([[vmX, T], [vmX, B]]));
    els.push(meter(vmX, BY, 'V'));
    const target = p.voltmeter.across;
    const reading = target === 'source' ? q.U.value : q[`U_${target}`].value;
    els.push(symLabel(vmX, BY + 40, 'U', target === 'source' ? null : target, '', { 'font-size': 12 }));
    els.push(label(vmX, BY + 58, `= ${val(p.voltmeter.show_reading, reading, 'V')}`, { 'font-size': 12 }));
  }
  if (p.show_current_direction) {
    els.push(arrowHead(L, T + 30, 0, -1), arrowHead(L + 40, T, 1, 0));
    xs.forEach((x) => els.push(arrowHead(x, B - 22, 0, 1)));
    els.push(symLabel(L + 40, T - 14, 'I', null, null));
  }
  return { els, flow, width: right + 130, height: 300 - 20, minX: 0, minY: 20 };
}

function render(p) {
  const q = quantities(p);
  const { els, flow, width, height, minX, minY } = p.topology === 'series' ? renderSeries(p, q) : renderParallel(p, q);
  const animatable = Boolean(p.animate_current);
  if (animatable) {
    els.push(h('g', { class: 'anim-flow', 'aria-hidden': 'true' },
      flow.map((d) => h('path', { d, class: 'flow-path', fill: 'none', 'stroke-width': 3, 'stroke-dasharray': '4 16', 'stroke-linecap': 'round' }))));
  }
  const description = describe(p, q);
  const title = p.topology === 'series' ? 'Likestrømskrets med motstander i serie' : 'Likestrømskrets med motstander i parallell';
  return { svg: svgRoot(width, height, title, description, els, {}, minX, minY), description, animatable };
}

export default { id: 'dc-circuit', version: 1, rules, quantities, render };
