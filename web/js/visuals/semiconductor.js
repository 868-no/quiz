// semiconductor@1: simplified drawings of what happens inside a semiconductor.
// lattice  – a silicon crystal (atoms with electron-pair bonds), optionally with a
//            phosphorus atom (one free electron) or a boron atom (one hole)
// junction – a PN junction as a bar: holes on the P side, free electrons on the N
//            side and the depletion layer between them with its fixed charges.
//            'compare' draws a narrow and a wide depletion layer (varicap).
// jfet     – an N-channel JFET: the channel between source and drain with the gate
//            regions on both sides; 'compare' shows the channel at two gate voltages.
// 'blank' draws only a note, for drawings that are shown after answering.

import { h } from '../render/vnode.js';
import { arrowHead, label, line, svgRoot, STROKE } from './svg.js';

function rules(p) {
  const errors = [];
  if (p.dopant !== 'none' && p.kind !== 'lattice') errors.push("dopant: only for kind 'lattice'");
  if (p.bias !== 'none' && p.kind !== 'junction') errors.push("bias: only for kind 'junction'");
  if (p.compare && p.kind === 'lattice') errors.push("compare: not for kind 'lattice'");
  if (p.kind === 'junction' && p.bias === 'forward' && p.depletion === 'wide') errors.push('depletion: forward bias narrows the layer, it cannot be wide');
  return errors;
}

const W = 560;
const hole = (x, y) => h('circle', { cx: x, cy: y, r: 4.5, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 1.6 });
const electron = (x, y) => h('circle', { cx: x, cy: y, r: 3.5, fill: STROKE });
const sign = (x, y, s) => label(x, y, s, { 'font-size': 14, 'font-weight': 'bold' });

// --- lattice ---------------------------------------------------------------------------
function lattice(els, p) {
  const cols = 5;
  const rows = 3;
  const dx = 110;
  const dy = 80;
  const x0 = (W - (cols - 1) * dx) / 2;
  const y0 = 50;
  const at = (c, r) => [x0 + c * dx, y0 + r * dy];
  const centre = [2, 1];
  const isC = (c, r) => c === centre[0] && r === centre[1];
  // bonds: a line with an electron pair between neighbours
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [x, y] = at(c, r);
      for (const [nc, nr] of [[c + 1, r], [c, r + 1]]) {
        if (nc >= cols || nr >= rows) continue;
        const [x2, y2] = at(nc, nr);
        els.push(line(x, y, x2, y2, { 'stroke-width': 1.2, opacity: 0.5 }));
        const mx = (x + x2) / 2;
        const my = (y + y2) / 2;
        const horiz = nr === r;
        // boron has one electron too few: the bond to its right gets a hole instead of a pair
        const holeBond = p.dopant === 'B' && isC(c, r) && horiz;
        const o = 5;
        if (holeBond) {
          els.push(electron(horiz ? mx : mx - o, horiz ? my - o : my), hole(horiz ? mx : mx + o, horiz ? my + o : my));
        } else {
          els.push(electron(horiz ? mx : mx - o, horiz ? my - o : my), electron(horiz ? mx : mx + o, horiz ? my + o : my));
        }
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [x, y] = at(c, r);
      const sym = isC(c, r) && p.dopant !== 'none' ? p.dopant : 'Si';
      els.push(h('circle', { cx: x, cy: y, r: 19, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': sym === 'Si' ? 1.6 : 3 }));
      els.push(label(x, y + 1, sym, { 'font-size': 13, 'font-weight': sym === 'Si' ? null : 'bold' }));
    }
  }
  const [cx, cy] = at(...centre);
  // the free electron sits in the open space up and to the right of the phosphorus atom
  if (p.dopant === 'P') {
    els.push(electron(cx + dx / 2, cy - 24), label(cx + dx / 2, cy - 58, 'fritt', { 'font-size': 12 }), label(cx + dx / 2, cy - 44, 'elektron', { 'font-size': 12 }));
  }
  if (p.dopant === 'B') els.push(label(cx + dx / 2 + 10, cy + 22, 'hull', { 'font-size': 12, 'text-anchor': 'start' }));
  const desc = ['Forenklet tegning av et silisiumkrystall: atomene ligger i et gitter, og hvert atom deler et elektronpar med hver av de fire naboene.'];
  if (p.dopant === 'none') desc.push('Alle ytterelektronene sitter i bindingene; ingen er frie.');
  if (p.dopant === 'P') desc.push('Atomet i midten er fosfor (P). Fire av elektronene inngår i bindingene, det femte er et fritt elektron.');
  if (p.dopant === 'B') desc.push('Atomet i midten er bor (B). Det har bare tre ytterelektroner, så én binding mangler et elektron: et hull.');
  return { height: y0 + (rows - 1) * dy + 50, desc };
}

// --- junction ---------------------------------------------------------------------------
const WIDTH = { none: 0, narrow: 34, normal: 70, wide: 130 };

function junctionBar(els, p, top, depletion, title) {
  const X0 = 90;
  const X1 = 470;
  const H = 96;
  const mid = (X0 + X1) / 2;
  // depletion_width (px) overrides the named widths; the animation sweeps it
  const w = p.depletion_width != null && depletion === p.depletion ? p.depletion_width : WIDTH[depletion];
  if (title) els.push(label(X0, top - 12, title, { 'font-size': 13, 'font-weight': 'bold', 'text-anchor': 'start' }));
  els.push(h('rect', { x: X0, y: top, width: X1 - X0, height: H, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  if (w) els.push(h('rect', { x: mid - w / 2, y: top, width: w, height: H, fill: STROKE, opacity: 0.15 }));
  els.push(line(mid, top, mid, top + H, { 'stroke-width': 1, 'stroke-dasharray': '4 3' }));
  els.push(label(X0 + 16, top + 16, 'P', { 'font-size': 15, 'font-weight': 'bold' }), label(X1 - 16, top + 16, 'N', { 'font-size': 15, 'font-weight': 'bold' }));
  // mobile carriers outside the layer, fixed charges inside it
  const rowsY = [top + 34, top + 56, top + 78];
  // staggered rows; every carrier stays clear of the layer and of the edge of the bar
  const fill = (from, to, draw) => rowsY.forEach((y, i) => {
    for (let x = from + (i % 2) * 12; x <= to; x += 24) els.push(draw(x, y));
  });
  fill(X0 + 36, mid - w / 2 - 10, hole);
  fill(mid + w / 2 + 12, X1 - 12, electron);
  if (w) {
    for (const y of rowsY) {
      for (let x = mid - w / 2 + 10; x < mid - 4; x += 16) els.push(sign(x, y, '−'));
      for (let x = mid + 10; x < mid + w / 2 - 2; x += 16) els.push(sign(x, y, '+'));
    }
    els.push(label(mid, top + H + 14, 'sperresjikt', { 'font-size': 12 }));
  }
  return { X0, X1, H };
}

function junction(els, p) {
  const desc = ['Forenklet tegning av en PN-overgang: P-området til venstre har hull (åpne ringer), N-området til høyre har frie elektroner (fylte prikker).'];
  const layerText = { narrow: 'smalt', normal: 'tydelig', wide: 'bredt' };
  if (p.compare) {
    junctionBar(els, p, 40, 'narrow', 'Lav sperrespenning');
    junctionBar(els, p, 200, 'wide', 'Høy sperrespenning');
    desc.push('Øverst med lav sperrespenning: smalt sperresjikt. Nederst med høy sperrespenning: bredt sperresjikt. Sjiktet virker som avstanden mellom platene i en kondensator.');
    return { height: 330, desc };
  }
  const { X0, X1, H } = junctionBar(els, p, 40, p.depletion, '');
  const y = 40 + H / 2;
  if (p.terminals) {
    els.push(line(X0 - 40, y, X0, y), line(X1, y, X1 + 40, y));
    els.push(label(X0 - 44, y - 16, 'anode', { 'font-size': 12, 'text-anchor': 'start' }), label(X1 + 44, y - 16, 'katode', { 'font-size': 12, 'text-anchor': 'end' }));
  }
  if (p.bias !== 'none') {
    const fwd = p.bias === 'forward';
    els.push(sign(X0 - 30, y + 18, fwd ? '+' : '−'), sign(X1 + 30, y + 18, fwd ? '−' : '+'));
    if (fwd) els.push(label((X0 + X1) / 2, 40 + H + 30, 'spenningsfall ca. 0,6–0,7 V når dioden leder', { 'font-size': 12 }));
    desc.push(fwd ? 'Anoden er koblet til pluss og katoden til minus (lederetningen). Sperresjiktet er nesten borte, og over overgangen ligger det ca. 0,6–0,7 V.'
      : 'Anoden er koblet til minus og katoden til pluss (sperreretningen).');
  }
  if (p.depletion !== 'none') desc.push(`Midt i ligger et ${layerText[p.depletion]} sperresjikt nesten uten frie ladningsbærere, med faste negative ladninger på P-siden og positive på N-siden.`);
  else desc.push('Det er ikke tegnet noe sperresjikt.');
  if (p.terminals) desc.push('P-siden er anoden, N-siden er katoden.');
  return { height: 40 + H + (p.bias === 'forward' ? 44 : 30), desc };
}

// --- JFET ------------------------------------------------------------------------------
function jfetBar(els, top, depletion, title, gateBias = null) {
  const X0 = 110;
  const X1 = 450;
  const H = 120;
  const g = 26; // gate region height
  // gate_bias 0 … 1: from slightly negative to nearly pinched off (overrides the named widths)
  const w = gateBias != null ? 10 + 34 * gateBias : { normal: 16, wide: 38 }[depletion] || 16;
  if (title) els.push(label(X0, top - 12, title, { 'font-size': 13, 'font-weight': 'bold', 'text-anchor': 'start' }));
  els.push(h('rect', { x: X0, y: top, width: X1 - X0, height: H, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  const gx0 = X0 + 90;
  const gx1 = X1 - 90;
  for (const [gy, dir] of [[top, 1], [top + H - g, -1]]) {
    els.push(h('rect', { x: gx0, y: gy, width: gx1 - gx0, height: g, fill: STROKE, opacity: 0.35, stroke: STROKE, 'stroke-width': 1.5 }));
    els.push(label((gx0 + gx1) / 2, gy + g / 2 + 1, 'P', { 'font-size': 13, 'font-weight': 'bold' }));
    // depletion layer growing into the channel
    const ly = dir > 0 ? gy + g : gy - w;
    els.push(h('rect', { x: gx0 - 6, y: ly, width: gx1 - gx0 + 12, height: w, rx: 6, fill: STROKE, opacity: 0.13 }));
  }
  const chTop = top + g + w;
  const chBot = top + H - g - w;
  els.push(label(X0 + 34, top + H / 2, 'N-kanal', { 'font-size': 12 }));
  // drain current through what is left of the channel
  const cy = (chTop + chBot) / 2;
  els.push(line(gx0 - 30, cy, gx1 + 20, cy, { 'stroke-width': Math.max(1.5, (chBot - chTop) / 6) }), arrowHead(gx1 + 30, cy, 1, 0, 9));
  // terminals
  els.push(line(X0 - 40, top + H / 2, X0, top + H / 2), label(X0 - 44, top + H / 2 - 14, 'source', { 'font-size': 12, 'text-anchor': 'start' }));
  els.push(line(X1, top + H / 2, X1 + 40, top + H / 2), label(X1 + 44, top + H / 2 - 14, 'drain', { 'font-size': 12, 'text-anchor': 'end' }));
  els.push(line((gx0 + gx1) / 2, top, (gx0 + gx1) / 2, top - 22), label((gx0 + gx1) / 2 + 8, top - 16, 'gate', { 'font-size': 12, 'text-anchor': 'start' }));
  return chBot - chTop;
}

function jfet(els, p) {
  const desc = ['Forenklet tegning av en N-kanal JFET: en kanal av N-materiale mellom source og drain, med gateområder av P-materiale på begge sider. Rundt gateområdene ligger et sperresjikt (skyggelagt), og strømmen går gjennom den delen av kanalen som er igjen (pil).'];
  if (p.compare) {
    jfetBar(els, 50, 'normal', 'Gate litt negativ');
    jfetBar(els, 240, 'wide', 'Gate mer negativ');
    desc.push('Øverst er gate litt negativ: smalt sperresjikt og bred kanal. Nederst er gate mer negativ: sperresjiktene er bredere, kanalen smalere og strømmen mindre (tynnere pil).');
    return { height: 380, desc };
  }
  jfetBar(els, 50, p.depletion === 'wide' ? 'wide' : 'normal', '', p.gate_bias);
  return { height: 190, desc };
}

const TITLE = { lattice: 'Silisiumkrystall', junction: 'PN-overgang', jfet: 'Felteffekttransistor (JFET)' };

function render(p) {
  const els = [];
  if (p.blank) {
    if (p.note) els.push(label(W / 2, 60, p.note, { 'font-size': 14, opacity: 0.75 }));
    const description = `${TITLE[p.kind]}. ${p.note || ''}`.trim();
    return { svg: svgRoot(W, 120, TITLE[p.kind], description, els, {}, 0, 0), description, animatable: false };
  }
  const { height, desc } = { lattice, junction, jfet }[p.kind](els, p);
  const description = desc.join(' ');
  return { svg: svgRoot(W, height, TITLE[p.kind], description, els, {}, 0, 0), description, animatable: false };
}

export default { id: 'semiconductor', version: 1, rules, quantities: () => ({}), render };
