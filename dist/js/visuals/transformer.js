// transformer@1: ideal transformer with an AC source on the primary and an optional
// load on the secondary. Secondary voltage and input impedance are computed.

import { formatNumber, formatSI } from '../render/format.js';
import { acSource, component, inductor, label, line, rotated, svgRoot, symLabel, terminal, wire } from './svg.js';

function rules(p) {
  const errors = [];
  if (p.secondary_label !== 'none' && p.primary_voltage_v == null) errors.push('secondary_label: needs primary_voltage_v');
  if (p.input_label !== 'none' && p.load_ohms == null) errors.push('input_label: needs load_ohms');
  return errors;
}

function quantities(p) {
  const n = p.turns_primary / p.turns_secondary;
  const q = {
    N_p: { value: p.turns_primary, unit: '', shown: p.turns_display === 'numbers' },
    N_s: { value: p.turns_secondary, unit: '', shown: p.turns_display === 'numbers' },
    ratio: { value: n, unit: '', shown: p.turns_display !== 'none' },
  };
  if (p.primary_voltage_v != null) {
    q.U_p = { value: p.primary_voltage_v, unit: 'V', shown: p.show_primary_voltage };
    q.U_s = { value: p.primary_voltage_v / n, unit: 'V', shown: p.secondary_label === 'value' };
  }
  if (p.load_ohms != null) {
    q.R_L = { value: p.load_ohms, unit: 'Ω', shown: p.show_load };
    q.Z_p = { value: p.load_ohms * n * n, unit: 'Ω', shown: false };
  }
  return q;
}

function ratioText(p) {
  const g = (a, b) => (b ? g(b, a % b) : a);
  const a = p.turns_primary;
  const b = p.turns_secondary;
  if (Number.isInteger(a) && Number.isInteger(b)) {
    const k = g(a, b);
    return `${formatNumber(a / k)} : ${formatNumber(b / k)}`;
  }
  return `${formatNumber(a)} : ${formatNumber(b)}`;
}

function render(p) {
  const q = quantities(p);
  const els = [];
  const SX = 110;
  const CY = 150;
  const PX = 230;
  const SXC = 290;
  const T = 90;
  const B = 210;
  // primary circuit
  els.push(wire([[SX, CY - 22], [SX, T], [PX, T], [PX, CY - 36]]), wire([[SX, CY + 22], [SX, B], [PX, B], [PX, CY + 36]]));
  els.push(acSource(SX, CY), inductor(PX, CY, 72));
  // secondary coil (mirrored) and core
  els.push(rotated(inductor(SXC, CY, 72), SXC, CY, 180));
  els.push(line(254, T + 10, 254, B - 10, { 'stroke-width': 2.5 }), line(266, T + 10, 266, B - 10, { 'stroke-width': 2.5 }));
  const LX = 400;
  els.push(wire([[SXC, CY - 36], [SXC, T], [LX, T]]), wire([[SXC, CY + 36], [SXC, B], [LX, B]]));
  if (p.load_ohms == null) els.push(terminal(LX, T), terminal(LX, B));
  if (p.load_ohms != null) {
    els.push(wire([[LX, T], [LX, B]]), component('R', LX, CY));
    els.push(symLabel(LX + 16, CY, 'R', 'L', ` = ${p.show_load ? formatSI(p.load_ohms, 'Ω') : '?'}`, { 'text-anchor': 'start', 'font-size': 13 }));
  }
  if (p.primary_voltage_v != null) {
    els.push(symLabel(SX - 32, CY, 'U', 'p', ` = ${p.show_primary_voltage ? formatSI(p.primary_voltage_v, 'V') : '?'}`, { 'text-anchor': 'end', 'font-size': 13 }));
  }
  if (p.secondary_label !== 'none') {
    const v = p.secondary_label === 'value' ? formatSI(q.U_s.value, 'V') : '?';
    els.push(symLabel(SXC + 30, CY + 46, 'U', 's', ` = ${v}`, { 'text-anchor': 'start', 'font-size': 13 }));
  }
  if (p.turns_display === 'numbers') {
    els.push(symLabel(PX - 18, B + 26, 'N', 'p', ` = ${formatNumber(p.turns_primary)}`, { 'text-anchor': 'end', 'font-size': 13 }));
    els.push(symLabel(SXC + 18, B + 26, 'N', 's', ` = ${formatNumber(p.turns_secondary)}`, { 'text-anchor': 'start', 'font-size': 13 }));
  } else if (p.turns_display === 'ratio') {
    els.push(label(260, T - 22, `vindingstall ${ratioText(p)}`, { 'font-size': 13 }));
  }
  if (p.input_label !== 'none') {
    els.push(symLabel(SX + 50, B + 26, 'Z', 'inn', ' = ?', { 'font-size': 13 }));
  }
  const W = p.load_ohms != null ? 520 : 440;
  let description = 'Koblingsskjema: en vekselspenningskilde';
  if (p.primary_voltage_v != null) description += ` på ${p.show_primary_voltage ? formatSI(p.primary_voltage_v, 'V') : 'ukjent spenning'}`;
  description += ' er koblet til primærsiden av en transformator';
  if (p.turns_display === 'numbers') description += ` med ${formatNumber(p.turns_primary)} vindinger på primærsiden og ${formatNumber(p.turns_secondary)} på sekundærsiden`;
  if (p.turns_display === 'ratio') description += ` med forholdet ${ratioText(p)} mellom vindingstallene`;
  description += '.';
  if (p.load_ohms != null) description += ` Sekundærsiden er belastet med ${p.show_load ? formatSI(p.load_ohms, 'Ω') : 'en motstand'}.`;
  if (p.secondary_label === 'unknown') description += ' Sekundærspenningen er markert med spørsmålstegn.';
  if (p.input_label === 'unknown') description += ' Impedansen inn på primærsiden er markert med spørsmålstegn.';
  return { svg: svgRoot(W, 210, 'Transformator', description, els, {}, 0, 50), description, animatable: false };
}

export default { id: 'transformer', version: 1, rules, quantities, render };
