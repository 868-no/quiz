// instrument@1: measuring instruments. An oscilloscope screen with a 10 × 8 division
// graticule and up to two traces computed from their definition (scope); a moving-coil
// meter with a series resistor as a voltmeter (meter_series) or with a shunt as an
// ammeter (meter_shunt); a voltage divider measured by a voltmeter with a finite
// internal resistance (voltmeter_loading); and a frequency counter's gate window over a
// pulse train (gate). Resistor values and readings are computed, never typed in.

import { h } from '../render/vnode.js';
import { formatNumber, formatSI } from '../render/format.js';
import { arrowHead, battery, dot, label, line, meter, resistor, svgRoot, symLabel, terminal, wire, STROKE } from './svg.js';

const KIND_NEEDS = {
  meter_series: ['range_v'],
  meter_shunt: ['range_a'],
};

function rules(p) {
  const errors = [];
  if (p.kind === 'scope') {
    if (!p.traces.length) errors.push('traces: kind scope needs 1–2 traces');
    p.traces.forEach((t, i) => {
      if (t.shape === 'am' && t.carrier_hz == null) errors.push(`traces[${i}].carrier_hz: required for an AM trace`);
      if (t.shape === 'am' && t.carrier_hz != null && !(t.carrier_hz >= 4 * t.frequency_hz)) errors.push(`traces[${i}].carrier_hz: must be at least 4 times the modulating frequency`);
      if (t.shape !== 'am' && t.carrier_hz != null) errors.push(`traces[${i}].carrier_hz: only for an AM trace`);
      const periods = 10 * p.time_per_div_s * t.frequency_hz;
      if (periods < 0.25 || periods > 40) errors.push(`traces[${i}].frequency_hz: shows ${formatNumber(Number(periods.toPrecision(3)))} periods on the screen; use 0,25–40`);
      const top = (Math.abs(t.offset_v) + t.amplitude_v * (t.shape === 'am' ? 1 + t.depth : 1)) / p.volt_per_div_v;
      if (top > 4) errors.push(`traces[${i}].amplitude_v: the trace goes off the screen (more than 4 divisions from the middle)`);
    });
  } else if (p.traces.length) errors.push('traces: only for kind scope');
  for (const [kind, keys] of Object.entries(KIND_NEEDS)) {
    for (const k of keys) if (p.kind === kind && p[k] == null) errors.push(`${k}: required for kind ${kind}`);
  }
  if (p.kind === 'meter_series' && p.range_v != null) {
    const um = p.meter.full_scale_a * (p.meter.coil_ohms || 0);
    if (!(p.range_v > um)) errors.push('range_v: must be above the voltage over the meter at full scale');
  }
  if (p.kind === 'meter_shunt') {
    if (p.meter.coil_ohms == null) errors.push('meter.coil_ohms: a shunt needs the meter resistance');
    if (p.range_a != null && !(p.range_a > p.meter.full_scale_a)) errors.push('range_a: must be above the meter full-scale current');
  }
  if (p.kind === 'voltmeter_loading' && p.supply_v == null) errors.push('supply_v: required for kind voltmeter_loading');
  return errors;
}

/** The series resistor (voltmeter) or shunt (ammeter) that gives the range. */
function quantities(p) {
  const q = {};
  if (p.kind === 'scope') {
    const t = p.traces[0];
    q.f = { value: t.frequency_hz, unit: 'Hz', shown: false };
    q.T = { value: 1 / t.frequency_hz, unit: 's', shown: false };
    q.U_p = { value: t.amplitude_v, unit: 'V', shown: false };
    q.U_pp = { value: 2 * t.amplitude_v, unit: 'V', shown: false };
    q.time_per_div = { value: p.time_per_div_s, unit: 's', shown: p.show_settings };
    q.volt_per_div = { value: p.volt_per_div_v, unit: 'V', shown: p.show_settings };
    q.div_per_period = { value: 1 / (t.frequency_hz * p.time_per_div_s), unit: '', shown: false };
  } else if (p.kind === 'meter_series') {
    const m = p.meter;
    const rm = m.coil_ohms || 0;
    q.I = { value: m.full_scale_a, unit: 'A', shown: m.show_full_scale };
    q.R_m = { value: rm, unit: 'Ω', shown: m.coil_ohms != null && m.show_coil };
    q.U = { value: p.range_v, unit: 'V', shown: p.show_range };
    q.R = { value: p.range_v / m.full_scale_a - rm, unit: 'Ω', shown: p.show_resistor };
  } else if (p.kind === 'meter_shunt') {
    const m = p.meter;
    const um = m.full_scale_a * m.coil_ohms;
    q.I_m = { value: m.full_scale_a, unit: 'A', shown: m.show_full_scale };
    q.R_m = { value: m.coil_ohms, unit: 'Ω', shown: m.show_coil };
    q.U = { value: um, unit: 'V', shown: false };
    q.I = { value: p.range_a, unit: 'A', shown: p.show_range };
    q.I_sh = { value: p.range_a - m.full_scale_a, unit: 'A', shown: false };
    q.R = { value: um / (p.range_a - m.full_scale_a), unit: 'Ω', shown: p.show_resistor };
  } else if (p.kind === 'voltmeter_loading') {
    const rp = 1 / (1 / p.r2_ohms + 1 / p.meter_ohms);
    q.U_s = { value: p.supply_v, unit: 'V', shown: true };
    q.R_upper = { value: p.r1_ohms, unit: 'Ω', shown: true };
    q.R_lower = { value: p.r2_ohms, unit: 'Ω', shown: true };
    q.R_i = { value: p.meter_ohms, unit: 'Ω', shown: p.show_meter_ohms };
    q.R_p = { value: rp, unit: 'Ω', shown: false };
    q.U_m = { value: (p.supply_v * rp) / (p.r1_ohms + rp), unit: 'V', shown: p.show_reading };
    q.U_0 = { value: (p.supply_v * p.r2_ohms) / (p.r1_ohms + p.r2_ohms), unit: 'V', shown: false };
  } else if (p.kind === 'gate') {
    q.T = { value: p.gate_s, unit: 's', shown: true };
    q.f = { value: 1 / p.gate_s, unit: 'Hz', shown: p.show_resolution };
  }
  return q;
}

const NBSP = ' ';
const PRE = [[1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']];

/** A knob setting the way an instrument shows it: 0,2 ms rather than 200 µs. */
function knob(value, unit) {
  const [f, pre] = PRE.find(([fac]) => value / fac >= 0.1 - 1e-12) || PRE[PRE.length - 1];
  return `${formatNumber(Number((value / f).toPrecision(4)))}${NBSP}${pre}${unit}`;
}

/** The unit printed on the meter face, from its full-scale current. */
const faceUnit = (a) => (a < 1e-3 ? 'µA' : a < 1 ? 'mA' : 'A');

const val = (shown, v, unit) => (shown ? formatSI(v, unit) : '?');
const divs = (x) => {
  const r = Math.round(x * 10) / 10;
  return Math.abs(r - Math.round(r)) < 1e-9 ? formatNumber(Math.round(r)) : `omtrent ${formatNumber(r)}`;
};
const SHAPE_NAME = { sine: 'sinusformet', square: 'firkantformet', am: 'amplitudemodulert' };

function traceValue(t, s) {
  const w = 2 * Math.PI * t.frequency_hz * s + (t.phase_deg * Math.PI) / 180;
  if (t.shape === 'sine') return t.offset_v + t.amplitude_v * Math.sin(w);
  if (t.shape === 'square') return t.offset_v + t.amplitude_v * (Math.sin(w) >= 0 ? 1 : -1);
  const env = t.amplitude_v * (1 + t.depth * Math.sin(w));
  return t.offset_v + env * Math.sin(2 * Math.PI * t.carrier_hz * s);
}

function renderScope(p) {
  const X0 = 70;
  const Y0 = 20;
  const D = 42;
  const X1 = X0 + 10 * D;
  const Y1 = Y0 + 8 * D;
  const YM = Y0 + 4 * D;
  const els = [];
  els.push(h('rect', { x: X0 - 8, y: Y0 - 8, width: 10 * D + 16, height: 8 * D + 16, rx: 10, fill: 'none', stroke: STROKE, 'stroke-width': 2.5 }));
  for (let i = 0; i <= 10; i++) els.push(line(X0 + i * D, Y0, X0 + i * D, Y1, { 'stroke-width': i % 10 ? 0.8 : 1.5, opacity: i % 10 ? 0.4 : 0.8 }));
  for (let j = 0; j <= 8; j++) els.push(line(X0, Y0 + j * D, X1, Y0 + j * D, { 'stroke-width': j % 8 ? 0.8 : 1.5, opacity: j % 8 ? 0.4 : 0.8 }));
  // small ticks on the centre lines, five per division
  for (let i = 0; i < 50; i++) if (i % 5) els.push(line(X0 + (i * D) / 5, YM - 3, X0 + (i * D) / 5, YM + 3, { 'stroke-width': 1, opacity: 0.6 }));
  for (let j = 0; j < 40; j++) if (j % 5) els.push(line(X0 + 5 * D - 3, Y0 + (j * D) / 5, X0 + 5 * D + 3, Y0 + (j * D) / 5, { 'stroke-width': 1, opacity: 0.6 }));
  const span = 10 * p.time_per_div_s;
  const xOf = (s) => X0 + (s / span) * 10 * D;
  const yOf = (v) => YM - (v / p.volt_per_div_v) * D;
  const desc = [];
  p.traces.forEach((t, i) => {
    const n = t.shape === 'am' ? 2400 : 1200;
    let d = '';
    let prev = null;
    for (let k = 0; k <= n; k++) {
      const s = (span * k) / n;
      const v = traceValue(t, s);
      const x = xOf(s).toFixed(2);
      // a square wave jumps straight up and down
      if (t.shape === 'square' && prev !== null && Math.sign(v - t.offset_v) !== Math.sign(prev - t.offset_v)) d += ` L ${x} ${yOf(prev).toFixed(2)}`;
      d += `${k ? ' L' : 'M'} ${x} ${yOf(v).toFixed(2)}`;
      prev = v;
    }
    els.push(h('path', { d, fill: 'none', stroke: STROKE, 'stroke-width': t.shape === 'am' ? 1.2 : 2.5, 'stroke-dasharray': i ? '7 5' : null, 'stroke-linejoin': 'round' }));
    if (p.traces.length > 1) els.push(label(X0 + 6, yOf(traceValue(t, 0)) - 12, String(i + 1), { 'font-size': 12, 'font-weight': 'bold', 'text-anchor': 'start' }));
    const perDiv = 1 / (t.frequency_hz * p.time_per_div_s);
    const top = (t.amplitude_v * (t.shape === 'am' ? 1 + t.depth : 1)) / p.volt_per_div_v;
    const name = `${p.traces.length > 1 ? `Kurve ${i + 1}${i ? ' (stiplet)' : ' (heltrukket)'}: ` : 'Kurven: '}`;
    if (t.shape === 'am') {
      desc.push(`${name}en bærebølge med mange svingninger der amplituden går opp og ned i takt med moduleringen; én periode av omhyllingskurven dekker ${divs(perDiv)} ruter, og toppene varierer mellom ${divs((t.amplitude_v * (1 - t.depth)) / p.volt_per_div_v)} og ${divs(top)} ruter fra midtlinjen.`);
    } else {
      desc.push(`${name}${SHAPE_NAME[t.shape]}, én periode dekker ${divs(perDiv)} ruter vannrett, og toppen når ${divs(top)} ruter over midtlinjen${t.offset_v ? `, med midten ${divs(t.offset_v / p.volt_per_div_v)} ruter forskjøvet` : ''}.`);
    }
  });
  if (p.show_settings) {
    els.push(label(X0 - 8, Y1 + 34, `Tid/rute: ${knob(p.time_per_div_s, 's')}`, { 'text-anchor': 'start', 'font-size': 16 }));
    els.push(label(X1 + 8, Y1 + 34, `Volt/rute: ${knob(p.volt_per_div_v, 'V')}`, { 'text-anchor': 'end', 'font-size': 16 }));
  }
  const settings = p.show_settings ? ` Tidsbasen er ${knob(p.time_per_div_s, 's')} per rute og den loddrette følsomheten ${knob(p.volt_per_div_v, 'V')} per rute.` : '';
  const description = `Oscilloskopskjerm med et rutenett på 10 ruter vannrett og 8 ruter loddrett.${settings} ${desc.join(' ')}`;
  return { els, width: 10 * D + 140, height: 8 * D + (p.show_settings ? 76 : 40), title: 'Oscilloskopskjerm', description };
}

/** A moving-coil meter face: scale arc with ticks and the needle at `frac` of full scale. */
function meterFace(cx, cy, frac, unitTxt) {
  const R = 34;
  const a0 = (150 * Math.PI) / 180;
  const a1 = (30 * Math.PI) / 180;
  const at = (f, r) => {
    const a = a0 + (a1 - a0) * f;
    return [cx + r * Math.cos(a), cy + 10 - r * Math.sin(a)];
  };
  const els = [h('rect', { x: cx - 48, y: cy - 34, width: 96, height: 62, rx: 6, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 })];
  const [sx, sy] = at(0, R);
  const [ex, ey] = at(1, R);
  els.push(h('path', { d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} A ${R} ${R} 0 0 1 ${ex.toFixed(1)} ${ey.toFixed(1)}`, fill: 'none', stroke: STROKE, 'stroke-width': 1.5 }));
  for (let k = 0; k <= 10; k++) {
    const [x1, y1] = at(k / 10, R);
    const [x2, y2] = at(k / 10, k % 5 ? R - 4 : R - 7);
    els.push(line(x1, y1, x2, y2, { 'stroke-width': 1.2 }));
  }
  const [nx, ny] = at(frac, R - 2);
  els.push(line(cx, cy + 10, nx, ny, { 'stroke-width': 2 }), h('circle', { cx, cy: cy + 10, r: 3, fill: STROKE }));
  if (unitTxt) els.push(label(cx, cy + 20, unitTxt, { 'font-size': 11 }));
  return els;
}

function renderSeries(p, q) {
  const Y = 130;
  const els = [];
  const xa = 30;
  const xb = 430;
  els.push(wire([[xa, Y], [95, Y]]), resistor(130, Y, false, 70, 20), wire([[165, Y], [242, Y]]), wire([[338, Y], [xb, Y]]));
  els.push(...meterFace(290, Y - 4, 1, faceUnit(p.meter.full_scale_a)));
  els.push(terminal(xa, Y), terminal(xb, Y));
  els.push(label(xa, Y + 22, '+', { 'font-size': 16 }), label(xb, Y + 22, '−', { 'font-size': 16 }));
  els.push(symLabel(130, Y + 34, 'R', 'S', ` = ${val(p.show_resistor, q.R.value, 'Ω')}`, { 'font-size': 13 }));
  const m = p.meter;
  els.push(symLabel(290, Y + 48, 'I', 'm', ` = ${val(m.show_full_scale, m.full_scale_a, 'A')} (fullt utslag)`, { 'font-size': 13 }));
  if (m.coil_ohms != null) els.push(symLabel(290, Y + 68, 'R', 'm', ` = ${val(m.show_coil, m.coil_ohms, 'Ω')}`, { 'font-size': 13 }));
  // the range spans the two terminals
  const yb = Y - 70;
  els.push(line(xa, Y - 14, xa, yb - 6, { 'stroke-width': 1 }), line(xb, Y - 14, xb, yb - 6, { 'stroke-width': 1 }));
  els.push(line(xa + 9, yb, xb - 9, yb, { 'stroke-width': 1.5 }), arrowHead(xa, yb, -1, 0, 8), arrowHead(xb, yb, 1, 0, 8));
  els.push(label((xa + xb) / 2, yb - 14, `Måleområde: 0–${val(p.show_range, p.range_v, 'V')}`, { 'font-size': 13 }));
  const description = `Koblingsskjema for et voltmeter: et dreiespoleinstrument i serie med en formotstand mellom to tilkoblingsklemmer (+ til venstre, − til høyre). ` +
    `Instrumentet gir fullt utslag ved ${val(m.show_full_scale, m.full_scale_a, 'A').replace('?', 'en ukjent strøm (?)')}` +
    `${m.coil_ohms != null ? ` og har en indre motstand på ${val(m.show_coil, m.coil_ohms, 'Ω').replace('?', 'ukjent (?)')}` : ''}. ` +
    `Måleområdet mellom klemmene er 0–${val(p.show_range, p.range_v, 'V').replace('?', 'ukjent (?)')}. Formotstanden: ${val(p.show_resistor, q.R.value, 'Ω').replace('?', 'ukjent (?)')}.`;
  return { els, width: 460, height: m.coil_ohms != null ? 182 : 162, minY: 38, title: 'Dreiespoleinstrument med formotstand', description };
}

function renderShunt(p, q) {
  const els = [];
  const YT = 90;
  const YB = 200;
  const YM = (YT + YB) / 2;
  const xa = 30;
  const xb = 430;
  const n1 = 120;
  const n2 = 330;
  els.push(wire([[xa, YM], [n1, YM]]), wire([[n2, YM], [xb, YM]]));
  els.push(wire([[n1, YM], [n1, YT], [177, YT]]), wire([[273, YT], [n2, YT], [n2, YM]]));
  els.push(wire([[n1, YM], [n1, YB], [190, YB]]), wire([[260, YB], [n2, YB], [n2, YM]]));
  els.push(...meterFace(225, YT - 4, 1, faceUnit(p.meter.full_scale_a)));
  els.push(resistor(225, YB, false, 70, 20));
  els.push(dot(n1, YM), dot(n2, YM), terminal(xa, YM), terminal(xb, YM));
  els.push(label(xa, YM + 22, '+', { 'font-size': 16 }), label(xb, YM + 22, '−', { 'font-size': 16 }));
  els.push(symLabel(225, YB + 32, 'R', 'sh', ` = ${val(p.show_resistor, q.R.value, 'Ω')}`, { 'font-size': 13 }));
  const m = p.meter;
  els.push(symLabel(n2 + 14, YT - 22, 'I', 'm', ` = ${val(m.show_full_scale, m.full_scale_a, 'A')}`, { 'font-size': 13, 'text-anchor': 'start' }));
  els.push(symLabel(n2 + 14, YT - 2, 'R', 'm', ` = ${val(m.show_coil, m.coil_ohms, 'Ω')}`, { 'font-size': 13, 'text-anchor': 'start' }));
  els.push(arrowHead(78, YM, 1, 0), symLabel(75, YM - 18, 'I', null, ` = ${val(p.show_range, p.range_a, 'A')}`, { 'font-size': 13 }));
  els.push(label(225, YT - 58, `Måleområde: 0–${val(p.show_range, p.range_a, 'A')}`, { 'font-size': 13 }));
  const description = `Koblingsskjema for et amperemeter: et dreiespoleinstrument med en shunt (en liten motstand) koblet i parallell, mellom to tilkoblingsklemmer. ` +
    `Strømmen I deler seg mellom instrumentet og shunten. Instrumentet gir fullt utslag ved ${val(m.show_full_scale, m.full_scale_a, 'A').replace('?', 'en ukjent strøm (?)')} og har en indre motstand på ${val(m.show_coil, m.coil_ohms, 'Ω').replace('?', 'ukjent (?)')}. ` +
    `Måleområdet er 0–${val(p.show_range, p.range_a, 'A').replace('?', 'ukjent (?)')}. Shunten: ${val(p.show_resistor, q.R.value, 'Ω').replace('?', 'ukjent (?)')}.`;
  return { els, width: 460, height: 228, minY: 20, title: 'Dreiespoleinstrument med shunt', description };
}

function renderLoading(p, q) {
  const els = [];
  const L = 90;
  const RX = 280;
  const VX = 420;
  const T = 50;
  const B = 290;
  const N = 170;
  els.push(wire([[L, 164], [L, T], [RX, T], [RX, 70]]), wire([[RX, 130], [RX, 210]]), wire([[RX, 270], [RX, B], [L, B], [L, 176]]));
  els.push(resistor(RX, 100, true, 52, 18), resistor(RX, 240, true, 52, 18));
  els.push(battery(L, 170));
  els.push(symLabel(L - 14, 220, 'U', null, ` = ${formatSI(p.supply_v, 'V')}`, { 'font-size': 13, 'text-anchor': 'end' }));
  els.push(symLabel(RX + 16, 100, 'R', '1', ` = ${formatSI(p.r1_ohms, 'Ω')}`, { 'font-size': 13, 'text-anchor': 'start' }));
  els.push(symLabel(RX + 16, 240, 'R', '2', ` = ${formatSI(p.r2_ohms, 'Ω')}`, { 'font-size': 13, 'text-anchor': 'start' }));
  els.push(dot(RX, N), dot(RX, B));
  els.push(wire([[RX, N], [VX, N], [VX, 223]]), wire([[VX, 257], [VX, B], [RX, B]]));
  els.push(meter(VX, 240, 'V'));
  els.push(symLabel(VX + 24, 230, 'R', 'i', ` = ${val(p.show_meter_ohms, p.meter_ohms, 'Ω')}`, { 'font-size': 13, 'text-anchor': 'start' }));
  els.push(symLabel(VX + 24, 252, 'U', null, ` = ${val(p.show_reading, q.U_m.value, 'V')}`, { 'font-size': 13, 'text-anchor': 'start' }));
  const description = `Koblingsskjema: et batteri på ${formatSI(p.supply_v, 'V')} med to motstander i serie, R1 = ${formatSI(p.r1_ohms, 'Ω')} øverst og R2 = ${formatSI(p.r2_ohms, 'Ω')} nederst. ` +
    `Et voltmeter med indre motstand ${val(p.show_meter_ohms, p.meter_ohms, 'Ω').replace('?', 'ukjent (?)')} er koblet over R2. ` +
    `Voltmeteret viser ${p.show_reading ? formatSI(q.U_m.value, 'V') : 'en ukjent spenning (?)'}${p.show_reading ? `; uten voltmeteret ville spenningen over R2 vært ${formatSI(q.U_0.value, 'V')}` : ''}.`;
  return { els, width: 560, height: 280, minY: 30, title: 'Spenningsdeler målt med et voltmeter', description };
}

function renderGate(p) {
  const els = [];
  const X0 = 40;
  const X1 = 520;
  const per = 44;
  const pulse = 18;
  const rows = [{ y: 70, start: X0 + 12 + 30 }, { y: 180, start: X0 + 12 + 30 - 26 }];
  const width = per * 7 + 20; // the gate holds 7 periods and a bit
  const counts = [];
  rows.forEach((r, i) => {
    let d = `M ${X0} ${r.y}`;
    let n = 0;
    for (let x = X0 + 12; x + pulse < X1; x += per) {
      d += ` L ${x} ${r.y} L ${x} ${r.y - 30} L ${x + pulse} ${r.y - 30} L ${x + pulse} ${r.y}`;
      if (x >= r.start && x < r.start + width) n += 1;
    }
    d += ` L ${X1} ${r.y}`;
    counts.push(n);
    els.push(h('path', { d, fill: 'none', stroke: STROKE, 'stroke-width': 2 }));
    els.push(h('rect', { x: r.start, y: r.y - 44, width, height: 56, fill: STROKE, opacity: 0.12, stroke: STROKE, 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
    els.push(label(r.start + width / 2, r.y + 26, `Telletid ${knob(p.gate_s, 's')}: ${n} pulser telles`, { 'font-size': 13 }));
    els.push(label(X0, r.y - 54, i ? 'Vinduet åpner litt tidligere:' : 'Vinduet åpner her:', { 'font-size': 12, 'text-anchor': 'start' }));
  });
  if (p.show_resolution) els.push(label((X0 + X1) / 2, 248, `Én puls mer eller mindre: ±${formatSI(1 / p.gate_s, 'Hz')}`, { 'font-size': 13, 'font-weight': 'bold' }));
  const description = `To like lange tellevinduer (telletid ${knob(p.gate_s, 's')}) lagt over det samme pulstoget, men åpnet på litt ulike tidspunkter. ` +
    `Det øverste vinduet teller ${counts[0]} pulser, det nederste ${counts[1]}. Tegningen er ikke i skala.` +
    (p.show_resolution ? ` Én puls mer eller mindre i løpet av telletiden betyr ±${formatSI(1 / p.gate_s, 'Hz')}.` : '');
  return { els, width: 560, height: p.show_resolution ? 250 : 220, minY: 10, title: 'Tellevindu i en frekvensteller', description };
}

function render(p) {
  const q = quantities(p);
  const r = p.kind === 'scope' ? renderScope(p)
    : p.kind === 'meter_series' ? renderSeries(p, q)
      : p.kind === 'meter_shunt' ? renderShunt(p, q)
        : p.kind === 'voltmeter_loading' ? renderLoading(p, q)
          : renderGate(p);
  const minY = r.minY || 0;
  return { svg: svgRoot(r.width, r.height, r.title, r.description, r.els, {}, 0, minY), description: r.description, animatable: false };
}

export default { id: 'instrument', version: 1, rules, quantities, render };
