// rectifier@1: half-wave (one diode), bridge (four diodes) or centre-tap (transformer
// with a centre-tapped secondary and two diodes) rectifier from an AC source, with
// optional reservoir capacitor and load. Also used for a simple diode detector
// (half-wave with C and R in parallel).

import { h } from '../render/vnode.js';
import { formatSI } from '../render/format.js';
import { acSource, component, diode, dot, inductor, label, line, rotated, svgRoot, symLabel, terminal, wire, STROKE } from './svg.js';

function rules(p) {
  const errors = [];
  const s = p.source;
  if (s.u_rms != null && s.u_peak != null) errors.push('source: give either u_rms or u_peak, not both');
  if (!p.load && !p.capacitor) errors.push('load: a rectifier needs a load or a capacitor at the output');
  return errors;
}

function quantities(p) {
  const s = p.source;
  const q = {};
  if (s.u_rms != null) {
    q.U_rms = { value: s.u_rms, unit: 'V', shown: s.show_value };
    q.U_p = { value: s.u_rms * Math.SQRT2, unit: 'V', shown: false };
  }
  if (s.u_peak != null) q.U_p = { value: s.u_peak, unit: 'V', shown: s.show_value };
  return q;
}

function sourceLabel(p, x, y) {
  const s = p.source;
  const out = [];
  if (s.name) out.push(label(x, y - 16, s.name, { 'text-anchor': 'end', 'font-size': 13 }));
  if (s.u_rms != null) out.push(symLabel(x, y + (s.name ? 4 : 0), 'U', 'eff', ` = ${s.show_value ? formatSI(s.u_rms, 'V') : '?'}`, { 'text-anchor': 'end', 'font-size': 13 }));
  if (s.u_peak != null) out.push(symLabel(x, y + (s.name ? 4 : 0), 'Û', null, ` = ${s.show_value ? formatSI(s.u_peak, 'V') : '?'}`, { 'text-anchor': 'end', 'font-size': 13 }));
  return out;
}

/** Capacitor and/or load between the + rail (top) and − rail (bottom), then terminals. */
function output(p, x0, top, bottom, els) {
  let x = x0;
  const mid = (top + bottom) / 2;
  if (p.capacitor) {
    els.push(wire([[x, top], [x, bottom]]), dot(x, top), dot(x, bottom), component('C', x, mid));
    els.push(symLabel(x + 28, mid, 'C', null, null, { 'text-anchor': 'start', 'font-size': 13 }));
    x += 80;
  }
  if (p.load) {
    els.push(wire([[x, top], [x, bottom]]), dot(x, top), dot(x, bottom), component('R', x, mid));
    els.push(symLabel(x + 16, mid, 'R', p.load_name === 'R_L' ? 'L' : null, null, { 'text-anchor': 'start', 'font-size': 13 }));
    x += 70;
  }
  els.push(wire([[x0 - 10, top], [x, top]]), wire([[x0 - 10, bottom], [x, bottom]]), terminal(x, top), terminal(x, bottom));
  els.push(label(x + 14, top, '+', { 'font-size': 16 }), label(x + 14, bottom, '−', { 'font-size': 16 }));
  if (p.output_label === 'unknown') {
    els.push(symLabel(x + 10, mid, 'U', 'ut', ' = ?', { 'text-anchor': 'start', 'font-size': 13 }));
    x += 70;
  }
  return x + 30;
}

function render(p) {
  const els = [];
  let W;
  let H;
  if (p.kind === 'half') {
    const SX = 110;
    const SY = 150;
    const T = 70;
    const B = 230;
    els.push(wire([[SX, SY - 22], [SX, T], [300, T]]), wire([[SX, SY + 22], [SX, B], [300, B]]));
    els.push(acSource(SX, SY), diode(200, T, 0));
    W = output(p, 300, T, B, els);
    H = 270;
    els.push(...sourceLabel(p, SX - 32, SY));
  } else if (p.kind === 'center_tap') {
    const SX = 110;
    const CY = 170;
    const PX = 190; // primary coil
    const SXC = 250; // secondary coil, centre tap at CY
    const T = 70;
    const B = 270;
    const NEG = 320;
    const JX = 360; // the diodes' cathodes meet here
    // primary circuit and core
    els.push(wire([[SX, CY - 22], [SX, CY - 70], [PX, CY - 70], [PX, CY - 36]]), wire([[SX, CY + 22], [SX, CY + 70], [PX, CY + 70], [PX, CY + 36]]));
    els.push(acSource(SX, CY), inductor(PX, CY, 72));
    els.push(line(214, CY - 80, 214, CY + 80, { 'stroke-width': 2.5 }), line(226, CY - 80, 226, CY + 80, { 'stroke-width': 2.5 }));
    // secondary: one long winding (turns facing the core) with a tap in the middle
    els.push(rotated(inductor(SXC, CY, 144), SXC, CY, 180));
    // diode from each end to the + node
    els.push(wire([[SXC, CY - 72], [SXC, T], [JX, T]]), diode(310, T, 0));
    els.push(wire([[SXC, CY + 72], [SXC, B], [JX, B], [JX, T]]), diode(310, B, 0), dot(JX, T));
    // centre tap to −, hopping over the lower diode's wire
    const hx = 275;
    els.push(dot(SXC, CY), wire([[SXC, CY], [hx, CY], [hx, B - 8]]),
      h('path', { d: `M ${hx} ${B - 8} a 8 8 0 0 0 0 16`, fill: 'none', stroke: STROKE, 'stroke-width': 2 }),
      wire([[hx, B + 8], [hx, NEG], [JX + 30, NEG]]));
    els.push(wire([[JX, T], [JX + 30, T]]));
    W = output(p, JX + 40, T, NEG, els);
    H = NEG + 40;
    els.push(...sourceLabel(p, SX - 32, CY));
  } else {
    const SX = 140;
    const SY = 160;
    const cx = 300;
    const cy = 160;
    const d = 62;
    const top = [cx, cy - d];
    const right = [cx + d, cy];
    const bot = [cx, cy + d];
    const left = [cx - d, cy];
    // AC to the top and bottom corners
    els.push(wire([[SX, SY - 22], [SX, 60], [cx, 60], top]), wire([[SX, SY + 22], [SX, 260], [cx, 260], bot]));
    els.push(acSource(SX, SY));
    // the bridge
    els.push(wire([left, top, right, bot, left]));
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    for (const [a, b] of [[left, top], [left, bot], [top, right], [bot, right]]) {
      const m = mid(a, b);
      els.push(diode(m[0], m[1], (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI, 10));
    }
    els.push(dot(...top), dot(...bot), dot(...left), dot(...right));
    // + from the right corner, − from the left corner (crossing the AC wire with a hop)
    const negX = cx - d - 30;
    const negY = 300;
    els.push(wire([right, [cx + d + 60, cy]]));
    els.push(wire([left, [negX, cy], [negX, 252]]),
      h('path', { d: `M ${negX} 252 a 8 8 0 0 0 0 16`, fill: 'none', stroke: STROKE, 'stroke-width': 2 }),
      wire([[negX, 268], [negX, negY], [cx + d + 60, negY]]));
    els.push(line(cx + d + 60, cy, cx + d + 60, cy, {}));
    W = output(p, cx + d + 70, cy, negY, els);
    H = 330;
    els.push(...sourceLabel(p, SX - 32, SY));
  }
  const s = p.source;
  const uTxt = s.u_rms != null ? `effektivverdi ${s.show_value ? formatSI(s.u_rms, 'V') : 'ukjent'}`
    : s.u_peak != null ? `toppverdi ${s.show_value ? formatSI(s.u_peak, 'V') : 'ukjent'}` : '';
  const kindTxt = { half: 'én diode (halvbølgelikeretter)', bridge: 'fire dioder i bro (brolikeretter)',
    center_tap: 'primærsiden av en transformator med midtuttak på sekundærsiden; hver ende av sekundærviklingen går gjennom hver sin diode til plussiden av utgangen, og midtuttaket går til minussiden (helbølgelikeretter med midtuttak)' }[p.kind];
  const parts = [p.capacitor ? 'en kondensator' : null, p.load ? (p.load_name === 'R_L' ? 'en lastmotstand' : 'en motstand') : null].filter(Boolean);
  let description = `Koblingsskjema: en vekselspenningskilde${s.name ? ` (${s.name})` : ''}${uTxt ? ` med ${uTxt}` : ''} er koblet til ${kindTxt}. Over utgangen sitter ${parts.join(' i parallell med ')}. Plussiden av utgangen er øverst.`;
  if (p.output_label === 'unknown') description += ' Utgangsspenningen er markert med spørsmålstegn.';
  const title = { half: 'Halvbølgelikeretter', bridge: 'Brolikeretter', center_tap: 'Helbølgelikeretter med midtuttak' }[p.kind];
  return { svg: svgRoot(W, H, title, description, els), description, animatable: false };
}

export default { id: 'rectifier', version: 1, rules, quantities, render };
