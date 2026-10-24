// feedline@1: feed lines. 'standing_wave' draws the voltage (and current) along a line
// to a load, computed from the reflection coefficient, with the instantaneous wave at a
// time phase (for animations); 'cable' a coax cross-section and/or a ladder line;
// 'quarter_wave' a λ/4 transformer whose input impedance is computed (Z₀² / Z_L);
// 'directional' the forward and reflected waves through an SWR meter, SWR and return
// loss computed from the two readings.

import { h } from '../render/vnode.js';
import { formatNumber } from '../render/format.js';
import { arrowHead, label, line, resistor, svgRoot, symLabel, terminal, STROKE } from './svg.js';

const W = 560;

function rules(p) {
  const errors = [];
  if (p.kind === 'standing_wave') {
    if (p.show_minmax && p.envelope === 'none') errors.push('show_minmax: needs an envelope');
    if (p.show_minmax && reflection(p) === 0) errors.push('show_minmax: a matched line has no maxima or minima');
    if (p.swr_label === 'value' && ['open', 'short'].includes(p.load)) errors.push('swr_label: an open or short line has infinite SWR');
  }
  if (p.kind === 'cable') {
    if (p.dimensions && p.cable === 'ladder') errors.push('dimensions: only for a coax cable');
    if (p.currents && p.cable === 'coax') errors.push('currents: only for a ladder line');
  }
  if (p.kind === 'directional') {
    if (!(p.reflected < p.forward)) errors.push('reflected: must be below forward');
    if (p.return_loss_label !== 'none' && p.reflected === 0) errors.push('return_loss_label: needs a reflected wave');
  }
  return errors;
}

/** Reflection coefficient at the load (real: the loads are resistive, open or short). */
function reflection(p) {
  if (p.load === 'open') return 1;
  if (p.load === 'short') return -1;
  if (p.load === 'resistive') return (p.load_ratio - 1) / (p.load_ratio + 1);
  return 0;
}

/** Reflection coefficient magnitude from the directional readings. */
function dirGamma(p) {
  return p.unit === 'W' ? Math.sqrt(p.reflected / p.forward) : p.reflected / p.forward;
}

const swrOf = (g) => (1 + Math.abs(g)) / (1 - Math.abs(g));

function quantities(p) {
  if (p.kind === 'standing_wave') {
    const q = { Z0: { value: p.z0_ohms, unit: 'Ω', shown: p.show_z0 } };
    if (Math.abs(reflection(p)) < 1) q.SWR = { value: swrOf(reflection(p)), unit: '', shown: p.swr_label === 'value' };
    if (p.load === 'resistive') q.R_L = { value: p.load_ratio * p.z0_ohms, unit: 'Ω', shown: p.show_load };
    return q;
  }
  if (p.kind === 'quarter_wave') {
    return {
      Z0: { value: p.z0_ohms, unit: 'Ω', shown: p.show_z0 },
      Z_L: { value: p.z_load_ohms, unit: 'Ω', shown: p.show_load },
      Z_inn: { value: (p.z0_ohms * p.z0_ohms) / p.z_load_ohms, unit: 'Ω', shown: p.input_label === 'value' },
    };
  }
  if (p.kind === 'directional') {
    const [f, r, u] = p.unit === 'W' ? ['P_fwd', 'P_ref', 'W'] : ['U_fwd', 'U_ref', 'V'];
    const g = dirGamma(p);
    const q = {
      [f]: { value: p.forward, unit: u, shown: p.show_readings },
      [r]: { value: p.reflected, unit: u, shown: p.show_readings },
      SWR: { value: swrOf(g), unit: '', shown: p.swr_label === 'value' },
    };
    if (p.reflected > 0) q.RL = { value: -20 * Math.log10(g), unit: 'dB', shown: p.return_loss_label === 'value' };
    return q;
  }
  return {};
}

const fmtSwr = (s) => formatNumber(s, 1);
const fmtDb = (x) => formatNumber(x, x >= 10 ? 0 : 1);
const ohms = (x) => `${formatNumber(Number(x.toPrecision(3)))} Ω`;
/** "tre ganger så stor som", "en tredel av" … (the load relative to Z₀). */
function relative(ratio) {
  const n = Number(ratio.toPrecision(3));
  const inv = Number((1 / ratio).toPrecision(3));
  if (n > 1) return `${times(n)} ganger så stor som`;
  return { 2: 'halvparten av', 3: 'en tredel av', 4: 'en firedel av', 5: 'en femdel av', 10: 'en tidel av' }[inv] || `${formatNumber(n)} ganger`;
}

const times = (x) => (Number.isInteger(x) ? ['', 'én', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti'][x] || formatNumber(x) : formatNumber(x));

// --- standing_wave ---------------------------------------------------------------

/** Voltage and current phasors at distance d (in wavelengths) from the load, incident wave = 1. */
function phasors(g, d) {
  const a = 2 * Math.PI * d;
  const vr = Math.cos(a) + g * Math.cos(a);
  const vi = Math.sin(a) - g * Math.sin(a);
  const ir = Math.cos(a) - g * Math.cos(a);
  const ii = Math.sin(a) + g * Math.sin(a);
  return { vr, vi, ir, ii };
}

function standingWave(els, p, desc) {
  const g = reflection(p);
  const xa = p.tuner ? 196 : 106;
  const xb = 466;
  const H = 46; // a full incident + reflected wave (amplitude 2) fills ±H
  const panels = p.envelope === 'none' ? [] : p.envelope === 'voltage' ? ['U'] : ['U', 'I'];
  const top = 16;
  const panelH = 2 * H + 26;
  const yl = top + panels.length * panelH + (panels.length ? 34 : 34);
  const yt = yl - 18;
  const yb = yl + 18;
  const dOf = (x) => ((xb - x) / (xb - xa)) * p.wavelengths;
  const wt = (p.phase_deg * Math.PI) / 180;
  panels.forEach((which, i) => {
    const yc = top + i * panelH + H + 8;
    const pts = { up: [], low: [], wave: [] };
    for (let k = 0; k <= 240; k++) {
      const x = xa + ((xb - xa) * k) / 240;
      const f = phasors(g, dOf(x));
      const [re, im] = which === 'U' ? [f.vr, f.vi] : [f.ir, f.ii];
      const mag = Math.hypot(re, im);
      pts.up.push([x, yc - (mag * H) / 2]);
      pts.low.push([x, yc + (mag * H) / 2]);
      pts.wave.push([x, yc - ((re * Math.cos(wt) - im * Math.sin(wt)) * H) / 2]);
    }
    const path = (ps) => ps.map((q, k) => `${k ? 'L' : 'M'} ${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
    els.push(line(xa, yc, xb, yc, { 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.6 }));
    els.push(h('path', { d: path(pts.up), fill: 'none', stroke: STROKE, 'stroke-width': 1.5 }));
    els.push(h('path', { d: path(pts.low), fill: 'none', stroke: STROKE, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
    if (p.show_wave) els.push(h('path', { d: path(pts.wave), fill: 'none', stroke: STROKE, 'stroke-width': 3 }));
    els.push(label(xa - 36, yc - 6, which, { 'font-style': 'italic', 'font-size': 15 }));
    els.push(label(xa - 36, yc + 12, which === 'U' ? 'spenning' : 'strøm', { 'font-size': 11 }));
    if (p.show_minmax && which === 'U') {
      // the maximum and minimum nearest the middle of the line
      const mags = pts.up.map((q) => yc - q[1]);
      const nearMid = (target) => mags.reduce((best, m, k) => (Math.abs(m - target) < 0.02 * H && Math.abs(k - 120) < Math.abs(best - 120) ? k : best), -1);
      const iMax = nearMid(Math.max(...mags));
      const iMin = nearMid(Math.min(...mags));
      for (const [k, sub] of [[iMax, 'maks'], [iMin, 'min']]) {
        const [x, y] = pts.up[k];
        els.push(h('circle', { cx: x, cy: y, r: 4, fill: STROKE }));
        els.push(symLabel(Math.min(Math.max(x, xa + 24), xb - 24), y - 16, 'U', sub, '', { 'font-size': 13 }));
      }
    }
  });
  // sender, optional tuner, the line and the load
  els.push(h('rect', { x: 12, y: yl - 28, width: 70, height: 56, rx: 4, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  els.push(label(47, yl, 'Sender', { 'font-size': 13 }));
  let x = 82;
  if (p.tuner) {
    els.push(line(x, yt, 112, yt), line(x, yb, 112, yb));
    els.push(h('rect', { x: 112, y: yl - 28, width: 62, height: 56, rx: 4, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
    els.push(label(143, yl, 'ATU', { 'font-size': 13 }));
    x = 174;
  }
  // the cable: a shaded band between its two conductors
  els.push(h('rect', { x, y: yt, width: xb - x, height: yb - yt, fill: STROKE, opacity: 0.1, stroke: 'none' }));
  els.push(line(x, yt, xb, yt, { 'stroke-width': 2.5 }), line(x, yb, xb, yb, { 'stroke-width': 2.5 }));
  const lx = xb + 40;
  if (p.load === 'short') {
    els.push(line(xb, yt, xb, yb, { 'stroke-width': 3 }));
    els.push(label(xb + 10, yl, 'kortslutning', { 'font-size': 12, 'text-anchor': 'start' }));
  } else if (p.load === 'open') {
    els.push(terminal(xb + 4, yt), terminal(xb + 4, yb));
    els.push(label(xb + 16, yl, 'åpen ende', { 'font-size': 12, 'text-anchor': 'start' }));
  } else {
    els.push(line(xb, yt, lx, yt, { 'stroke-width': 1.5 }), line(xb, yb, lx, yb, { 'stroke-width': 1.5 }),
      line(lx, yt, lx, yl - 13, { 'stroke-width': 1.5 }), line(lx, yl + 13, lx, yb, { 'stroke-width': 1.5 }));
    els.push(resistor(lx, yl, true, 26, 14));
    const r = p.load === 'matched' ? p.z0_ohms : p.load_ratio * p.z0_ohms;
    if (p.show_load) els.push(symLabel(lx - 2, yb + 22, 'R', '', ` = ${ohms(r)}`, { 'font-size': 13 }));
  }
  let ly = yb + 22;
  if (p.show_z0) els.push(symLabel((xa + xb) / 2 - 20, ly, 'Z', '0', ` = ${ohms(p.z0_ohms)}`, { 'font-size': 13 }));
  if (p.swr_label !== 'none') {
    ly += p.show_z0 ? 22 : 0;
    els.push(label((xa + xb) / 2 - 20, ly, `SWR = ${p.swr_label === 'value' ? fmtSwr(swrOf(g)) : '?'}`, { 'font-size': 13 }));
  }
  if (p.quarter_mark) {
    const xq = xb - (xb - xa) * (0.25 / p.wavelengths);
    const yq = ly + 30;
    els.push(line(xq, yb + 6, xq, yq + 6, { 'stroke-width': 1, opacity: 0.7 }), line(xb, yb + 6, xb, yq + 6, { 'stroke-width': 1, opacity: 0.7 }));
    els.push(line(xq + 2, yq, xb - 2, yq, { 'stroke-width': 1.5 }), arrowHead(xq, yq, -1, 0, 8), arrowHead(xb, yq, 1, 0, 8));
    els.push(label((xq + xb) / 2, yq + 14, 'λ/4', { 'font-size': 13 }));
    ly = yq + 14;
  }

  // description
  desc.push(`En fødekabel${p.show_z0 ? ` med karakteristisk impedans ${ohms(p.z0_ohms)}` : ''} går fra senderen til venstre til en last til høyre. Kabelen er ${{ 0.25: 'en kvart bølgelengde', 0.5: 'en halv bølgelengde', 1: 'én bølgelengde' }[p.wavelengths] || `${formatNumber(p.wavelengths)} bølgelengder`} lang.`);
  if (p.tuner) desc.push('Mellom senderen og kabelen står en antennetuner (ATU).');
  const r = p.load === 'matched' ? p.z0_ohms : p.load_ratio * p.z0_ohms;
  if (p.load === 'open') desc.push('Kabelen er åpen i enden.');
  else if (p.load === 'short') desc.push('Kabelen er kortsluttet i enden.');
  else if (g === 0) desc.push(`Lasten er en motstand${p.show_load ? ` på ${ohms(r)}` : ''}, like stor som kabelens impedans: tilpasset.`);
  else desc.push(`Lasten er en motstand${p.show_load ? ` på ${ohms(r)}` : ''}, ${relative(p.load_ratio)} kabelens impedans.`);
  if (panels.length) {
    if (g === 0) {
      desc.push('Over kabelen er spenningen tegnet: den er like stor overalt langs kabelen, så det er ingen stående bølger. Bølgen går bare fra senderen mot lasten.');
    } else {
      desc.push(`Over kabelen er spenningen tegnet: den går opp og ned langs kabelen – stående bølger – med et maksimum og et minimum en kvart bølgelengde fra hverandre. Ved lasten er spenningen ${g > 0 ? 'størst' : 'minst'}.`);
      if (Math.abs(g) === 1) desc.push('I minimumene faller spenningen helt til null.');
      else if (p.swr_label === 'value') desc.push(`Den største spenningen er ${fmtSwr(swrOf(g))} ganger den minste.`);
    }
    if (panels.length === 2) desc.push(g === 0 ? 'Under er strømmen tegnet: den er også like stor overalt.' : `Under er strømmen tegnet: den er størst der spenningen er minst, og omvendt${Math.abs(g) === 1 ? `, så ved ${p.load === 'open' ? 'den åpne enden er strømmen null' : 'kortslutningen er strømmen størst'}` : ''}.`);
    desc.push(p.show_wave ? 'Heltrukken og stiplet tynn kurve viser hvor stor spenningen kan bli på hvert sted; den tykke kurven er spenningen i ett øyeblikk.' : 'Heltrukken og stiplet kurve viser hvor stor spenningen kan bli på hvert sted.');
    if (p.show_minmax) desc.push('Et spenningsmaksimum og et spenningsminimum er merket.');
  }
  if (p.swr_label === 'value') desc.push(`SWR = ${fmtSwr(swrOf(g))}.`);
  else if (p.swr_label === 'unknown') desc.push('SWR er merket med spørsmålstegn.');
  if (p.quarter_mark) desc.push('En kvart bølgelengde fra enden av kabelen er avmerket.');
  return ly + 16;
}

// --- cable --------------------------------------------------------------------------

function cable(els, p, desc) {
  const both = p.cable === 'both';
  if (p.cable !== 'ladder') {
    const cx = both ? 120 : 190;
    const cy = 112;
    els.push(h('circle', { cx, cy, r: 72, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
    els.push(h('circle', { cx, cy, r: 60, fill: 'none', stroke: STROKE, 'stroke-width': 5, 'stroke-dasharray': '3 2' }));
    els.push(h('circle', { cx, cy, r: 57, fill: STROKE, opacity: 0.12, stroke: 'none' }));
    els.push(h('circle', { cx, cy, r: 14, fill: STROKE }));
    if (p.labels) {
      const lx = cx + 96;
      const parts = [['Kappe', 70, -66], ['Skjerm', 60, -30], ['Isolasjon', 38, 6], ['Innerleder', 10, 42]];
      for (const [t, r, dy] of parts) {
        const a = Math.asin(Math.max(-1, Math.min(1, dy / Math.max(r, 30))));
        const px = cx + Math.cos(a) * r * (r > 20 ? 1 : 0.6);
        const py = cy + Math.sin(a) * r;
        els.push(line(px, py, lx - 6, cy + dy, { 'stroke-width': 1 }), h('circle', { cx: px, cy: py, r: 2.5, fill: STROKE }));
        els.push(label(lx, cy + dy, t, { 'font-size': 13, 'text-anchor': 'start' }));
      }
    }
    if (p.dimensions) {
      const y1 = cy + 92;
      const y2 = cy + 120;
      for (const [r, y, t] of [[14, y1, 'd'], [57, y2, 'D']]) {
        const ext = { 'stroke-width': 1, opacity: 0.6, 'stroke-dasharray': '3 3' };
        els.push(line(cx - r, cy, cx - r, y + 4, ext), line(cx + r, cy, cx + r, y + 4, ext));
        els.push(line(cx - r + 2, y, cx + r - 2, y, { 'stroke-width': 1.5 }), arrowHead(cx - r, y, -1, 0, 7), arrowHead(cx + r, y, 1, 0, 7));
        els.push(label(cx + r + 12, y, t, { 'font-size': 14, 'font-style': 'italic', 'text-anchor': 'start' }));
      }
    }
    desc.push(`Tverrsnitt av en koaksialkabel: innerst en massiv innerleder, rundt den isolasjon (dielektrikum), så en flettet skjerm og ytterst en kappe.${p.labels ? ' Delene er navngitt.' : ''}${p.dimensions ? ' Diameteren d på innerlederen og den indre diameteren D på skjermen er målsatt.' : ''}`);
  }
  if (p.cable !== 'coax') {
    const x0 = both ? 330 : 150;
    const x1 = both ? 540 : 410;
    const y1 = 84;
    const y2 = 140;
    for (let x = x0 + 14; x < x1 - 6; x += 38) els.push(h('rect', { x: x - 5, y: y1, width: 10, height: y2 - y1, fill: STROKE, opacity: 0.25, stroke: STROKE, 'stroke-width': 1 }));
    els.push(line(x0, y1, x1, y1, { 'stroke-width': 3 }), line(x0, y2, x1, y2, { 'stroke-width': 3 }));
    if (p.labels) els.push(label((x0 + x1) / 2, 40, 'Stigekabel', { 'font-size': 13 }));
    if (p.currents) {
      const xm = (x0 + x1) / 2;
      els.push(line(xm - 40, y1 - 16, xm + 34, y1 - 16, { 'stroke-width': 2 }), arrowHead(xm + 42, y1 - 16, 1, 0, 9));
      els.push(line(xm + 40, y2 + 16, xm - 34, y2 + 16, { 'stroke-width': 2 }), arrowHead(xm - 42, y2 + 16, -1, 0, 9));
      els.push(label(xm + 60, y1 - 16, 'I', { 'font-style': 'italic', 'font-size': 14 }), label(xm - 60, y2 + 16, 'I', { 'font-style': 'italic', 'font-size': 14 }));
    }
    desc.push(`${both ? 'Til høyre: s' : 'S'}tigekabel sett fra siden: to parallelle ledere holdt i fast avstand av isolerende avstandsstykker.${p.currents ? ' Piler viser strømmene: like store, men motsatt rettet i de to lederne.' : ''}`);
  }
  return p.dimensions && p.cable !== 'ladder' ? 250 : 200;
}

// --- quarter_wave ----------------------------------------------------------------------

function quarterWave(els, p, desc) {
  const yl = 96;
  const yt = yl - 18;
  const yb = yl + 18;
  const xa = 150;
  const xb = 400;
  const lx = 460;
  els.push(terminal(70, yt), terminal(70, yb), line(75, yt, xa, yt), line(75, yb, xa, yb));
  els.push(h('rect', { x: xa, y: yt - 6, width: xb - xa, height: yb - yt + 12, rx: 6, fill: STROKE, opacity: 0.12, stroke: STROKE, 'stroke-width': 1.5 }));
  els.push(line(xa, yt, xb, yt, { 'stroke-width': 3 }), line(xa, yb, xb, yb, { 'stroke-width': 3 }));
  els.push(line(xb, yt, lx, yt), line(xb, yb, lx, yb), line(lx, yt, lx, yl - 15), line(lx, yl + 15, lx, yb), resistor(lx, yl, true, 30, 14));
  if (p.show_z0) els.push(symLabel((xa + xb) / 2, yl, 'Z', '0', ` = ${ohms(p.z0_ohms)}`, { 'font-size': 13 }));
  els.push(symLabel(lx + 2, yb + 26, 'Z', 'L', p.show_load ? ` = ${ohms(p.z_load_ohms)}` : '', { 'font-size': 13 }));
  const yq = yt - 30;
  els.push(line(xa, yt - 8, xa, yq - 6, { 'stroke-width': 1, opacity: 0.7 }), line(xb, yt - 8, xb, yq - 6, { 'stroke-width': 1, opacity: 0.7 }));
  els.push(line(xa + 2, yq, xb - 2, yq, { 'stroke-width': 1.5 }), arrowHead(xa, yq, -1, 0, 8), arrowHead(xb, yq, 1, 0, 8));
  els.push(label((xa + xb) / 2, yq - 14, 'λ/4', { 'font-size': 13 }));
  const zin = (p.z0_ohms * p.z0_ohms) / p.z_load_ohms;
  if (p.input_label !== 'none') {
    els.push(line(54, yl, 20, yl, { 'stroke-width': 1.5 }), arrowHead(60, yl, 1, 0, 8));
    els.push(symLabel(60, yb + 26, 'Z', 'inn', p.input_label === 'value' ? ` = ${ohms(zin)}` : ' = ?', { 'font-size': 13 }));
  }
  desc.push(`En kabelbit som er en kvart bølgelengde lang${p.show_z0 ? `, med karakteristisk impedans ${ohms(p.z0_ohms)}` : ''}, er koblet til en last${p.show_load ? ` på ${ohms(p.z_load_ohms)}` : ''} i høyre ende.`);
  if (p.input_label === 'value') desc.push(`Impedansen inn i den venstre enden er Z₀² / Z_L = ${ohms(zin)}.`);
  else if (p.input_label === 'unknown') desc.push('Impedansen inn i den venstre enden er merket med spørsmålstegn.');
  return 160;
}

// --- directional ------------------------------------------------------------------------

function dial(els, cx, y, frac, text) {
  const r = 26;
  const cy = y + 34;
  const e = (a) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy - Math.sin(a) * r).toFixed(1)}`;
  els.push(h('path', { d: `M ${e((Math.PI * 11) / 12)} A ${r} ${r} 0 0 1 ${e(Math.PI / 12)}`, fill: 'none', stroke: STROKE, 'stroke-width': 1.5 }));
  for (let k = 0; k <= 4; k++) {
    const a = (Math.PI * 11) / 12 - ((Math.PI * 10) / 12) * (k / 4);
    els.push(line(cx + Math.cos(a) * (r - 5), cy - Math.sin(a) * (r - 5), cx + Math.cos(a) * r, cy - Math.sin(a) * r, { 'stroke-width': 1 }));
  }
  const a = (Math.PI * 11) / 12 - ((Math.PI * 10) / 12) * Math.min(1, frac); // a 150° scale
  els.push(line(cx, cy, cx + Math.cos(a) * (r - 3), cy - Math.sin(a) * (r - 3), { 'stroke-width': 2.5 }), h('circle', { cx, cy, r: 3, fill: STROKE }));
  els.push(label(cx, cy + 16, text, { 'font-size': 11 }));
}

function directional(els, p, desc) {
  const yl = 104;
  const mx0 = 196;
  const mx1 = 356;
  els.push(h('rect', { x: 12, y: yl - 26, width: 76, height: 52, rx: 4, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  els.push(label(50, yl, 'Sender', { 'font-size': 13 }));
  els.push(line(88, yl, mx0, yl, { 'stroke-width': 3 }), line(mx1, yl, 472, yl, { 'stroke-width': 3 }));
  // the meter
  els.push(h('rect', { x: mx0, y: yl - 44, width: mx1 - mx0, height: 88, rx: 6, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  els.push(label((mx0 + mx1) / 2, yl - 32, 'SWR-meter', { 'font-size': 12 }));
  const fr = p.reflected / p.forward;
  dial(els, mx0 + 42, yl - 22, 1, 'tilført');
  dial(els, mx1 - 42, yl - 22, fr, 'reflektert');
  // antenna
  const ax = 500;
  // IEC-style antenna symbol: a mast with a funnel on top
  els.push(line(472, yl, ax, yl, { 'stroke-width': 3 }), line(ax, yl, ax, yl - 66),
    line(ax, yl - 46, ax - 16, yl - 68), line(ax, yl - 46, ax + 16, yl - 68));
  els.push(label(ax, yl + 18, 'Antenne', { 'font-size': 12 }));
  const val = (v) => `${formatNumber(v)} ${p.unit}`;
  // the waves
  els.push(line(370, yl - 20, 446, yl - 20, { 'stroke-width': 2.5 }), arrowHead(456, yl - 20, 1, 0, 10));
  const fwd = p.unit === 'W' ? 'tilført' : 'fremadgående';
  els.push(label(412, yl - 36, p.show_readings ? `${fwd} ${val(p.forward)}` : fwd, { 'font-size': 12 }));
  if (p.reflected > 0) {
    els.push(line(452, yl + 20, 376, yl + 20, { 'stroke-width': 1 + 1.5 * Math.min(1, fr * 3) }), arrowHead(366, yl + 20, -1, 0, 9));
    els.push(label(412, yl + 38, p.show_readings ? `reflektert ${val(p.reflected)}` : 'reflektert', { 'font-size': 12 }));
  }
  const g = dirGamma(p);
  let ly = yl + 64;
  if (p.swr_label !== 'none') { els.push(label((mx0 + mx1) / 2, ly, `SWR = ${p.swr_label === 'value' ? fmtSwr(swrOf(g)) : '?'}`, { 'font-size': 13 })); ly += 22; }
  if (p.return_loss_label !== 'none') { els.push(label((mx0 + mx1) / 2, ly, `Returtap = ${p.return_loss_label === 'value' ? `${fmtDb(-20 * Math.log10(g))} dB` : '?'}`, { 'font-size': 13 })); ly += 22; }
  const what = p.unit === 'W' ? ['tilført effekt', 'reflektert effekt'] : ['den fremadgående bølgen', 'den reflekterte bølgen'];
  desc.push(`En sender til venstre er koblet gjennom et SWR-meter til en antenne til høyre. En pil mot antennen viser ${what[0]}${p.show_readings ? `: ${val(p.forward)}` : ''}.`);
  if (p.reflected > 0) desc.push(`En pil tilbake mot senderen viser ${what[1]}${p.show_readings ? `: ${val(p.reflected)}` : ''}.`);
  else desc.push('Det kommer ingenting tilbake fra antennen.');
  const [nf, nr] = p.unit === 'W' ? ['tilført effekt', 'reflektert effekt'] : ['den fremadgående bølgen', 'den reflekterte bølgen'];
  desc.push(`Meteret har to visere: den for ${nf} står på fullt utslag, og den for ${nr} ${p.reflected > 0 ? `står på omtrent ${formatNumber(Math.round(fr * 100))} % av skalaen` : 'står på null'}.`);
  if (p.swr_label === 'value') desc.push(`SWR = ${fmtSwr(swrOf(g))}.`);
  else if (p.swr_label === 'unknown') desc.push('SWR er merket med spørsmålstegn.');
  if (p.return_loss_label === 'value') desc.push(`Returtapet er ${fmtDb(-20 * Math.log10(g))} dB.`);
  else if (p.return_loss_label === 'unknown') desc.push('Returtapet er merket med spørsmålstegn.');
  return Math.max(ly, yl + 56);
}

const TITLE = { standing_wave: 'Stående bølger på en fødekabel', cable: 'Fødekabler', quarter_wave: 'Kvartbølgetransformator', directional: 'SWR-meter i fødekabelen' };

function render(p) {
  const els = [];
  const desc = [];
  const height = { standing_wave: standingWave, cable, quarter_wave: quarterWave, directional }[p.kind](els, p, desc);
  const description = desc.join(' ');
  return { svg: svgRoot(W, height, TITLE[p.kind], description, els), description, animatable: false };
}

// the assumption under the figure: a cross-section has no load to speak of
function idealised(p, text) {
  return p.kind === 'cable' ? 'Forenklet tegning, ikke i målestokk.' : text;
}

export default { id: 'feedline', version: 1, rules, quantities, render, idealised };
