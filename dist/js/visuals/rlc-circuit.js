// rlc-circuit@1: one to three R, C and L in series or parallel, alone between two
// terminals or with a DC/AC source (optionally an open switch). Totals, reactances,
// impedance, time constant and resonance frequency are computed, never typed in.

import { formatSI } from '../render/format.js';
import { acSource, battery, component, dot, svgRoot, switchOpen, symLabel, terminal, wire } from './svg.js';

const UNIT = { R: 'Ω', C: 'F', L: 'H' };
const LIMITS = { R: [0.1, 1e8], C: [1e-15, 1], L: [1e-12, 100] };
const KIND_NAME = { R: 'motstand', C: 'kondensator', L: 'spole' };

export function names(p) {
  const kinds = p.components.map((c) => c.kind);
  const seen = {};
  return kinds.map((k) => {
    seen[k] = (seen[k] || 0) + 1;
    return kinds.filter((x) => x === k).length === 1 ? k : `${k}${seen[k]}`;
  });
}

function rules(p) {
  const errors = [];
  const src = p.source;
  p.components.forEach((c, i) => {
    const [lo, hi] = LIMITS[c.kind];
    if (c.value < lo || c.value > hi) errors.push(`components[${i}].value: ${c.value} is implausible for ${c.kind}`);
  });
  if (src.kind === 'ac' && (src.frequency_hz === null || src.frequency_hz === undefined)) errors.push('source.frequency_hz: required for an AC source');
  if (src.kind === 'none' && src.voltage_v !== null && src.voltage_v !== undefined) errors.push('source.voltage_v: a circuit without a source has no voltage');
  if (p.switch && (p.topology !== 'series' || src.kind === 'none')) errors.push('switch: only for a series circuit with a source');
  const kinds = new Set(p.components.map((c) => c.kind));
  if (p.label_style === 'names' && p.total_label !== 'none') errors.push("total_label: not used with label_style 'names'");
  if (p.total_label !== 'none' && kinds.size > 1 && !(src.kind === 'ac' && p.topology === 'series')) {
    errors.push('total_label: a total is only defined for components of one kind, or as impedance in a series AC circuit');
  }
  return errors;
}

function quantities(p) {
  const comps = p.components;
  const ns = names(p);
  const src = p.source;
  const q = {};
  const valuesShown = p.label_style === 'values';
  comps.forEach((c, i) => { q[ns[i]] = { value: c.value, unit: UNIT[c.kind], shown: c.show_value && valuesShown }; });
  const kinds = new Set(comps.map((c) => c.kind));
  const shownTotal = p.total_label === 'value';
  if (kinds.size === 1) {
    const k = [...kinds][0];
    const add = (k === 'C') === (p.topology === 'parallel');
    const total = add ? comps.reduce((a, c) => a + c.value, 0) : 1 / comps.reduce((a, c) => a + 1 / c.value, 0);
    q[`${k}_total`] = { value: total, unit: UNIT[k], shown: shownTotal };
  }
  if (src.voltage_v !== null && src.voltage_v !== undefined) q.U = { value: src.voltage_v, unit: 'V', shown: src.show_voltage && valuesShown };
  if (src.kind === 'ac') {
    const f = src.frequency_hz;
    q.f = { value: f, unit: 'Hz', shown: src.show_frequency && valuesShown };
    const xl = comps.filter((c) => c.kind === 'L').reduce((a, c) => a + 2 * Math.PI * f * c.value, 0);
    const xc = comps.filter((c) => c.kind === 'C').reduce((a, c) => a + 1 / (2 * Math.PI * f * c.value), 0);
    if (comps.some((c) => c.kind === 'L')) q.X_L = { value: xl, unit: 'Ω', shown: false };
    if (comps.some((c) => c.kind === 'C')) q.X_C = { value: xc, unit: 'Ω', shown: false };
    if (p.topology === 'series') {
      const r = comps.filter((c) => c.kind === 'R').reduce((a, c) => a + c.value, 0);
      q.Z = { value: Math.hypot(r, xl - xc), unit: 'Ω', shown: shownTotal && kinds.size > 1 };
    }
  }
  const rs = comps.filter((c) => c.kind === 'R');
  const cs = comps.filter((c) => c.kind === 'C');
  const ls = comps.filter((c) => c.kind === 'L');
  if (p.topology === 'series' && rs.length === 1 && cs.length === 1 && !ls.length) q.tau = { value: rs[0].value * cs[0].value, unit: 's', shown: false };
  if (cs.length === 1 && ls.length === 1) q.f0 = { value: 1 / (2 * Math.PI * Math.sqrt(ls[0].value * cs[0].value)), unit: 'Hz', shown: false };
  return q;
}

const val = (c) => (c.show_value ? formatSI(c.value, UNIT[c.kind]) : '?');

let namesOnly = false;

function compLabel(name, c, x, y, extra) {
  return symLabel(x, y, name[0], name.slice(1) || null, namesOnly ? null : ` = ${val(c)}`, { 'font-size': 13, ...extra });
}

function totalLabel(p, q, x, y, extra = {}) {
  if (p.total_label === 'none') return null;
  const kinds = [...new Set(p.components.map((c) => c.kind))];
  if (kinds.length === 1) {
    const k = kinds[0];
    const v = p.total_label === 'value' ? formatSI(q[`${k}_total`].value, UNIT[k]) : '?';
    return symLabel(x, y, k, 'tot', ` = ${v}`, { 'font-size': 13, ...extra });
  }
  const v = p.total_label === 'value' ? formatSI(q.Z.value, 'Ω') : '?';
  return symLabel(x, y, 'Z', null, ` = ${v}`, { 'font-size': 13, ...extra });
}

function sourceLabels(p, x, y, anchor = 'start') {
  const src = p.source;
  const out = [];
  if (namesOnly) return out;
  if (src.kind === 'ac') out.push(symLabel(x, y - 12, 'f', null, ` = ${src.show_frequency ? formatSI(src.frequency_hz, 'Hz') : '?'}`, { 'text-anchor': anchor, 'font-size': 13 }));
  if (src.voltage_v !== null && src.voltage_v !== undefined) {
    const sub = src.kind === 'ac' ? 'eff' : null;
    out.push(symLabel(x, y + (src.kind === 'ac' ? 12 : 0), 'U', sub, ` = ${src.show_voltage ? formatSI(src.voltage_v, 'V') : '?'}`, { 'text-anchor': anchor, 'font-size': 13 }));
  }
  return out;
}

function render(p) {
  namesOnly = p.label_style === 'names';
  const q = quantities(p);
  const ns = names(p);
  const comps = p.components;
  const n = comps.length;
  const els = [];
  let W = 520;
  let H = 260;
  const src = p.source.kind;
  if (src === 'none' && p.topology === 'series') {
    const Y = 90;
    const xs = { 1: [260], 2: [200, 320], 3: [160, 260, 360] }[n];
    els.push(wire([[60, Y], [460, Y]]), terminal(60, Y), terminal(460, Y));
    comps.forEach((c, i) => {
      els.push(component(c.kind, xs[i], Y, true));
      els.push(compLabel(ns[i], c, xs[i], Y - 34));
    });
    els.push(totalLabel(p, q, 260, Y + 50));
    H = 160;
  } else if (src === 'none') {
    const T = 50;
    const B = 190;
    const xs = { 1: [220], 2: [200, 330], 3: [170, 280, 390] }[n];
    const right = xs[n - 1];
    els.push(wire([[60, T], [right, T]]), wire([[60, B], [right, B]]), terminal(60, T), terminal(60, B));
    comps.forEach((c, i) => {
      els.push(wire([[xs[i], T], [xs[i], B]]));
      if (i < n - 1) els.push(dot(xs[i], T), dot(xs[i], B));
      els.push(component(c.kind, xs[i], (T + B) / 2));
      els.push(compLabel(ns[i], c, xs[i] + (c.kind === 'R' ? 18 : 28), (T + B) / 2, { 'text-anchor': 'start' }));
    });
    els.push(totalLabel(p, q, 40, (T + B) / 2, { 'text-anchor': 'start' }));
    H = 230;
  } else if (p.topology === 'series') {
    const L = 120;
    const R = 440;
    const T = 70;
    const B = 210;
    const SY = 140;
    const startX = p.switch ? 210 : 150;
    const span = R - 30 - startX;
    const xs = comps.map((_, i) => startX + (span * (i + 0.5)) / n);
    els.push(wire([[L, SY - (src === 'dc' ? 6 : 22)], [L, T], [R, T], [R, B], [L, B], [L, SY + (src === 'dc' ? 6 : 22)]]));
    if (p.switch) els.push(switchOpen(L + 20, L + 60, T));
    comps.forEach((c, i) => {
      els.push(component(c.kind, xs[i], T, true));
      els.push(compLabel(ns[i], c, xs[i], T + 34));
    });
    els.push(src === 'dc' ? battery(L, SY) : acSource(L, SY));
    els.push(...sourceLabels(p, L - 40, SY, 'end'));
    els.push(totalLabel(p, q, (L + R) / 2, B + 28));
    W = 500;
    H = 270;
  } else {
    const L = 120;
    const T = 50;
    const B = 230;
    const SY = 140;
    const xs = { 1: [260], 2: [240, 350], 3: [220, 320, 420] }[n];
    const right = xs[n - 1];
    els.push(wire([[L, SY - (src === 'dc' ? 6 : 22)], [L, T], [right, T]]), wire([[right, B], [L, B], [L, SY + (src === 'dc' ? 6 : 22)]]));
    comps.forEach((c, i) => {
      els.push(wire([[xs[i], T], [xs[i], B]]));
      if (i < n - 1) els.push(dot(xs[i], T), dot(xs[i], B));
      els.push(component(c.kind, xs[i], SY));
      els.push(compLabel(ns[i], c, xs[i] + (c.kind === 'R' ? 18 : 28), SY, { 'text-anchor': 'start' }));
    });
    els.push(src === 'dc' ? battery(L, SY) : acSource(L, SY));
    els.push(...sourceLabels(p, L - 40, SY, 'end'));
    els.push(totalLabel(p, q, (L + right) / 2, B + 26));
    W = 520;
    H = 280;
  }
  const kindsTxt = comps.map((c, i) => `${KIND_NAME[c.kind]} ${ns[i]}${namesOnly ? '' : ` = ${c.show_value ? formatSI(c.value, UNIT[c.kind]) : 'ukjent'}`}`).join(', ');
  const topoTxt = n === 1 ? '' : p.topology === 'series' ? ' i serie' : ' i parallell';
  let srcTxt = 'mellom to tilkoblingspunkter';
  if (src === 'dc') srcTxt = `koblet til en likespenningskilde${p.source.voltage_v != null && !namesOnly ? ` på ${p.source.show_voltage ? formatSI(p.source.voltage_v, 'V') : 'ukjent spenning'}` : ''}`;
  if (src === 'ac') srcTxt = namesOnly ? 'koblet til en vekselspenningskilde' : `koblet til en vekselspenningskilde med frekvens ${p.source.show_frequency ? formatSI(p.source.frequency_hz, 'Hz') : 'ukjent'}`;
  let description = `Koblingsskjema: ${kindsTxt}${topoTxt}, ${srcTxt}.`;
  if (p.switch) description += ' En åpen bryter sitter i kretsen.';
  if (p.total_label !== 'none') description += ' Den samlede verdien er markert med spørsmålstegn eller oppgitt.';
  const title = `Krets med ${comps.length === 1 ? KIND_NAME[comps[0].kind] : `${comps.length} komponenter${topoTxt}`}`;
  return { svg: svgRoot(W, H, title, description, els.filter(Boolean)), description, animatable: false };
}

export default { id: 'rlc-circuit', version: 1, rules, quantities, render };
