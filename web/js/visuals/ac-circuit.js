// ac-circuit@1: sinusoidal source driving one ideal R, C or L.

import { formatSI } from '../render/format.js';
import { acSource, capacitor, inductor, resistor, svgRoot, symLabel, wire } from './svg.js';

const UNIT = { R: 'Ω', C: 'F', L: 'H' };
const NAME = { R: 'en motstand', C: 'en kondensator', L: 'en spole' };
const LIMITS = { R: [0.1, 1e8], C: [1e-15, 1], L: [1e-12, 100] };

function rules(p) {
  const errors = [];
  const { kind, value } = p.component;
  if (kind === 'R' && p.reactance_label !== 'none') errors.push("reactance_label: a resistor has no reactance; use 'none'");
  const [lo, hi] = LIMITS[kind];
  if (value < lo || value > hi) errors.push(`component.value: ${value} is implausible for ${kind} (expected ${lo}–${hi} in SI units)`);
  return errors;
}

function quantities(p) {
  const f = p.source.frequency_hz;
  const { kind, value } = p.component;
  const q = {
    f: { value: f, unit: 'Hz', shown: p.source.show_frequency },
    [kind]: { value, unit: UNIT[kind], shown: p.component.show_value },
  };
  let x = value;
  if (kind === 'C') {
    x = 1 / (2 * Math.PI * f * value);
    q.X_C = { value: x, unit: 'Ω', shown: p.reactance_label === 'value' };
  } else if (kind === 'L') {
    x = 2 * Math.PI * f * value;
    q.X_L = { value: x, unit: 'Ω', shown: p.reactance_label === 'value' };
  }
  const u = p.source.voltage_v;
  if (u !== null && u !== undefined) {
    q.U = { value: u, unit: 'V', shown: p.source.show_voltage };
    q.I = { value: u / x, unit: 'A', shown: false };
  }
  return q;
}

function render(p) {
  const q = quantities(p);
  const { kind } = p.component;
  const SX = 120;
  const CX = 320;
  const T = 55;
  const B = 205;
  const MY = 130;
  const els = [wire([[SX, MY - 22], [SX, T], [CX, T], [CX, B], [SX, B], [SX, MY + 22]])];
  els.push(acSource(SX, MY));
  if (kind === 'R') els.push(resistor(CX, MY, true));
  else if (kind === 'C') els.push(capacitor(CX, MY));
  else els.push(inductor(CX, MY));
  const fTxt = p.source.show_frequency ? formatSI(p.source.frequency_hz, 'Hz') : '?';
  els.push(symLabel(SX - 32, MY - 14, 'f', null, ` = ${fTxt}`, { 'text-anchor': 'end', 'font-size': 13 }));
  const hasU = p.source.voltage_v !== null && p.source.voltage_v !== undefined;
  if (hasU) {
    const uTxt = p.source.show_voltage ? formatSI(p.source.voltage_v, 'V') : '?';
    els.push(symLabel(SX - 32, MY + 14, 'U', 'eff', ` = ${uTxt}`, { 'text-anchor': 'end', 'font-size': 13 }));
  }
  const vTxt = p.component.show_value ? formatSI(p.component.value, UNIT[kind]) : '?';
  els.push(symLabel(CX + 26, MY - 12, kind, null, ` = ${vTxt}`, { 'text-anchor': 'start', 'font-size': 13 }));
  let reactText = '';
  if (p.reactance_label !== 'none') {
    const sym = `X_${kind}`;
    const xTxt = p.reactance_label === 'value' ? formatSI(q[sym].value, 'Ω') : '?';
    els.push(symLabel(CX + 26, MY + 14, 'X', kind, ` = ${xTxt}`, { 'text-anchor': 'start', 'font-size': 13 }));
    reactText = ` ${kind === 'C' ? 'Kapasitiv' : 'Induktiv'} reaktans: ${xTxt === '?' ? 'ukjent (?)' : xTxt}.`;
  }
  const description = `Koblingsskjema: en sinusformet vekselspenningskilde med frekvens ${fTxt === '?' ? 'ukjent' : fTxt}` +
    (hasU ? ` og effektivverdi ${p.source.show_voltage ? formatSI(p.source.voltage_v, 'V') : 'ukjent'}` : '') +
    ` er koblet til ${NAME[kind]}, ${kind} = ${vTxt === '?' ? 'ukjent' : vTxt}.${reactText}`;
  const title = `Vekselstrømskrets med ${NAME[kind]}`;
  return { svg: svgRoot(440, 260, title, description, els), description, animatable: false };
}

export default { id: 'ac-circuit', version: 1, rules, quantities, render };
