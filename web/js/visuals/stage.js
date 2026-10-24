// stage@1: small circuit diagrams of single stages, drawn with IEC-style symbols.
// class_c          – NPN stage with the base to ground through an RF choke (no bias),
//                    a tuned tank in the collector
// push_pull        – two NPN transistors between a centre-tapped input and output
//                    transformer
// regulator_ic     – a three-terminal regulator (7812) after a reservoir capacitor some
//                    way off; 'reveal' adds small decoupling capacitors at its pins
// transistor_mixer – RF to the base, the local oscillator to the emitter; the collector
//                    load is a '?' box, or with 'reveal' a circuit tuned to the MF
// dual_gate        – a dual-gate MOSFET with the signal on gate 1; gate 2 is open, or
//                    with 'reveal' held at a small positive voltage and decoupled
// triode           – a triode valve with cathode, grid and anode; 'reveal' marks the
//                    grid slightly negative and the anode at high positive voltage
// pnp              – a PNP transistor with E, B and C; 'reveal' adds the base bias
// crystal          – a quartz crystal between two electrodes

import { h } from '../render/vnode.js';
import { arrowHead, capacitor, dot, ground, inductor, label, line, npn, resistor, rotated, svgRoot, symLabel, terminal, wire, STROKE } from './svg.js';

function rules() {
  return []; // every combination of the parameters can be drawn
}

const lbl = (x, y, t, anchor = 'middle', size = 12) => label(x, y, t, { 'font-size': size, 'text-anchor': anchor });
const hcap = (x, y) => rotated(capacitor(x, y), x, y, 90);
const hcoil = (x, y, len = 56) => rotated(inductor(x, y, len), x, y, -90);
const markBox = (x, y, w, hh) => h('rect', { x, y, width: w, height: hh, rx: 8, fill: 'none', stroke: STROKE, 'stroke-width': 1.6, 'stroke-dasharray': '5 4' });

/** NPN mirrored top to bottom: collector down, emitter up. */
function npnFlipped(cx, cy) {
  const t = npn(cx, cy);
  return { node: h('g', { transform: `translate(0 ${2 * cy}) scale(1 -1)` }, t.node), b: t.b, c: [t.c[0], 2 * cy - t.c[1]], e: [t.e[0], 2 * cy - t.e[1]] };
}

/** PNP with its base on the left, emitter up (arrow pointing in), collector down. */
function pnp(cx, cy, r = 24) {
  const bx = cx - 9;
  const node = h('g', { class: 'transistor' },
    h('circle', { cx, cy, r, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }),
    line(cx - r - 14, cy, bx, cy), line(bx, cy - 14, bx, cy + 14, { 'stroke-width': 3 }),
    line(bx, cy - 6, cx + 9, cy - r + 4), line(cx + 9, cy - r + 4, cx + 9, cy - r - 12),
    line(bx, cy + 6, cx + 9, cy + r - 4), line(cx + 9, cy + r - 4, cx + 9, cy + r + 12),
    arrowHead(bx + 2, cy - 7, -16, 12.5, 9));
  return { node, b: [cx - r - 14, cy], e: [cx + 9, cy - r - 12], c: [cx + 9, cy + r + 12] };
}

function classC(els) {
  const t = npn(300, 180);
  els.push(t.node);
  els.push(terminal(50, 180), lbl(50, 160, 'fra forrige trinn', 'start'), wire([[50, 180], [140, 180]]), hcap(150, 180), wire([[160, 180], [t.b[0], 180]]));
  els.push(dot(210, 180), wire([[210, 180], [210, 290]]), inductor(210, 235, 50), ground(210, 290), lbl(222, 235, 'RF-drossel', 'start'));
  els.push(wire([t.e, [t.e[0], 290]]), ground(t.e[0], 290));
  // tuned tank from the collector to +U_CC, output through a capacitor
  const cx = t.c[0];
  els.push(wire([t.c, [cx, 120]]), dot(cx, 120), dot(cx + 60, 120), wire([[cx, 120], [cx + 60, 120]]));
  els.push(wire([[cx, 120], [cx, 50]]), inductor(cx, 85, 50), wire([[cx + 60, 120], [cx + 60, 50]]), capacitor(cx + 60, 85));
  els.push(wire([[cx, 50], [cx + 60, 50]]), dot(cx + 30, 50), wire([[cx + 30, 50], [cx + 30, 30]]), symLabel(cx + 38, 26, '+U', 'CC', null, { 'font-size': 12, 'text-anchor': 'start' }));
  els.push(wire([[cx + 60, 120], [440, 120]]), hcap(450, 120), wire([[460, 120], [520, 120]]), terminal(520, 120), lbl(520, 104, 'ut'));
  return { height: 310, desc: 'Koblingsskjema av et lite forsterkertrinn med en NPN-transistor. Signalet fra forrige trinn kommer inn på basis gjennom en kondensator. Basis er koblet til jord gjennom en RF-drossel, og emitteren ligger på jord, så det er ingen forspenning. I kollektoren sitter en avstemt krets (spole og kondensator i parallell) mot plusspenningen, og signalet tas ut gjennom en kondensator.' };
}

function pushPull(els) {
  const t1 = npn(330, 100);
  const t2 = npnFlipped(330, 240);
  els.push(t1.node, t2.node, symLabel(362, 92, 'T', '1', null, { 'font-size': 13, 'text-anchor': 'start' }), symLabel(362, 250, 'T', '2', null, { 'font-size': 13, 'text-anchor': 'start' }));
  // input transformer, centre tap to the bias
  els.push(terminal(140, 110), terminal(140, 230), wire([[140, 110], [200, 110], [200, 230], [140, 230]]), inductor(200, 170, 110), lbl(130, 170, 'inn', 'end'));
  els.push(line(226, 106, 226, 234, { 'stroke-width': 1.5 }), line(232, 106, 232, 234, { 'stroke-width': 1.5 }));
  els.push(wire([[262, 100], [262, 240]]), rotated(inductor(262, 170, 120), 262, 170, 180));
  els.push(wire([[262, 100], t1.b]), wire([[262, 240], t2.b]), dot(262, 170), wire([[262, 170], [286, 170]]), terminal(290, 170), lbl(290, 190, 'forspenning'));
  // emitters together to ground
  els.push(wire([t1.e, t2.e]), dot(t1.e[0], 170), wire([[t1.e[0], 170], [372, 170]]), ground(372, 170));
  // output transformer, centre tap to +U_CC
  const ox = 450;
  els.push(wire([t1.c, [t1.c[0], 36], [ox, 36], [ox, 90]]), wire([t2.c, [t2.c[0], 304], [ox, 304], [ox, 250]]));
  els.push(wire([[ox, 90], [ox, 250]]), inductor(ox, 170, 160), dot(ox, 170), wire([[ox, 170], [418, 170]]), terminal(414, 170), symLabel(414, 190, '+U', 'CC', null, { 'font-size': 12 }));
  els.push(line(476, 96, 476, 244, { 'stroke-width': 1.5 }), line(482, 96, 482, 244, { 'stroke-width': 1.5 }));
  els.push(wire([[508, 110], [508, 230]]), rotated(inductor(508, 170, 110), 508, 170, 180), wire([[508, 110], [550, 110]]), wire([[508, 230], [550, 230]]), terminal(550, 110), terminal(550, 230), lbl(560, 170, 'ut', 'start'));
  return { height: 320, desc: 'Koblingsskjema av en push-pull-forsterker med to NPN-transistorer, T1 og T2. En inngangstransformator med midtuttak gir basisene motsatte halvdeler av signalet; midtuttaket går til forspenningen. Emitterne ligger sammen på jord. Kollektorene går til hver sin ende av en utgangstransformator med midtuttak til plusspenningen, og signalet tas ut på sekundærsiden.' };
}

function regulator(els, reveal) {
  const T = 90;
  const B = 230;
  els.push(terminal(40, T), terminal(40, B), lbl(30, T, '+', 'end', 15), lbl(30, B, '−', 'end', 15), wire([[40, T], [250, T]]), wire([[40, B], [540, B]]));
  els.push(dot(90, T), dot(90, B), wire([[90, T], [90, B]]), capacitor(90, (T + B) / 2), lbl(90, B + 18, 'glattekondensator'));
  els.push(line(150, T - 12, 230, T - 12, { 'stroke-width': 1, 'stroke-dasharray': '4 3' }), lbl(190, T - 22, 'lang ledning'));
  els.push(h('rect', { x: 250, y: T - 24, width: 100, height: 60, rx: 4, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }), lbl(300, T + 6, '7812', 'middle', 14));
  els.push(lbl(258, T - 12, 'inn', 'start', 10), lbl(342, T - 12, 'ut', 'end', 10), lbl(300, T + 30, 'jord', 'middle', 10));
  els.push(wire([[300, T + 36], [300, B]]), dot(300, B), wire([[350, T], [540, T]]), terminal(540, T), terminal(540, B), lbl(548, T, '12 V', 'start'));
  els.push(dot(470, T), dot(470, B), wire([[470, T], [470, B]]), capacitor(470, (T + B) / 2), lbl(498, (T + B) / 2, 'C', 'start'));
  let desc = 'Koblingsskjema av en strømforsyning med en integrert spenningsregulator av typen 7812, med inngang, jord og utgang. Glattekondensatoren sitter et godt stykke unna regulatoren, med en lang ledning imellom. Det sitter en kondensator over utgangen.';
  if (reveal) {
    els.push(dot(230, T), dot(230, B), wire([[230, T], [230, B]]), capacitor(230, (T + B) / 2), dot(370, T), dot(370, B), wire([[370, T], [370, B]]), capacitor(370, (T + B) / 2));
    els.push(markBox(206, T + 30, 48, 80), markBox(346, T + 30, 48, 80), lbl(300, B + 26, 'små avkoblingskondensatorer tett inntil regulatoren'));
    desc += ' Markert med stiplede rammer: små avkoblingskondensatorer tett inntil inngangen og utgangen på regulatoren.';
  }
  return { height: 270, desc };
}

function transistorMixer(els, reveal) {
  const t = npn(300, 180);
  els.push(t.node);
  els.push(terminal(50, 180), lbl(50, 160, 'RF inn', 'start'), wire([[50, 180], [140, 180]]), hcap(150, 180), wire([[160, 180], t.b]));
  // the local oscillator into the emitter, emitter resistor to ground
  const ex = t.e[0];
  els.push(wire([t.e, [ex, 290]]), dot(ex, 240), resistor(ex, 265, true, 36, 14), ground(ex, 290), wire([[ex, 240], [400, 240]]), hcap(410, 240), wire([[420, 240], [500, 240]]), terminal(500, 240), lbl(500, 214, 'fra lokaloscillatoren', 'end'));
  const cx = t.c[0];
  if (reveal) {
    els.push(wire([t.c, [cx, 120]]), dot(cx, 120), dot(cx + 60, 120), wire([[cx, 120], [cx + 60, 120]]));
    els.push(wire([[cx, 120], [cx, 50]]), inductor(cx, 85, 50), wire([[cx + 60, 120], [cx + 60, 50]]), capacitor(cx + 60, 85), wire([[cx, 50], [cx + 60, 50]]));
    els.push(markBox(cx - 14, 42, 88, 86), lbl(cx + 92, 72, 'avstemt til', 'start'), lbl(cx + 92, 88, 'mellomfrekvensen', 'start'));
  } else {
    els.push(wire([t.c, [cx, 120]]), dot(cx, 120), h('rect', { x: cx - 26, y: 56, width: 52, height: 44, rx: 6, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2, 'stroke-dasharray': '6 4' }), lbl(cx, 79, '?', 'middle', 18), wire([[cx, 100], [cx, 120]]), wire([[cx, 56], [cx, 36]]));
  }
  els.push(wire([[cx, reveal ? 50 : 36], [cx, 30]]), lbl(cx + 8, 26, '+U', 'start'));
  els.push(wire([[cx, 120], [440, 120]]), hcap(450, 120), wire([[460, 120], [520, 120]]), terminal(520, 120), lbl(520, 104, 'MF ut'));
  let desc = 'Koblingsskjema av en blander med én NPN-transistor. RF-signalet kommer inn på basis gjennom en kondensator, og signalet fra lokaloscillatoren føres til emitteren, som har en motstand mot jord. Utgangen tas fra kollektoren gjennom en kondensator.';
  desc += reveal ? ' Kollektorlasten er en avstemt krets (spole og kondensator i parallell) som er avstemt til mellomfrekvensen, markert med en stiplet ramme.' : ' Kollektorlasten er vist som en boks med spørsmålstegn.';
  return { height: 310, desc };
}

function dualGate(els, reveal) {
  const x = 320;
  const yT = 120;
  const yB = 220;
  // channel, drain up, source down, two insulated gates on the left
  els.push(line(x, yT, x, yB, { 'stroke-width': 3 }), wire([[x, yT], [x, yT - 30]]), wire([[x, yB], [x, yB + 50]]), ground(x, yB + 50));
  els.push(line(x - 12, yT + 6, x - 12, yT + 40, { 'stroke-width': 2.5 }), line(x - 12, yB - 40, x - 12, yB - 6, { 'stroke-width': 2.5 }));
  els.push(lbl(x + 10, yT - 20, 'drain', 'start'), lbl(x + 10, yB + 30, 'source', 'start'));
  const g1y = yB - 23;
  const g2y = yT + 23;
  els.push(wire([[x - 12, g1y], [280, g1y], [280, 265], [200, 265]]), lbl(x - 18, g1y + 16, 'gate 1', 'end', 11), hcap(190, 265), wire([[180, 265], [80, 265]]), terminal(80, 265), lbl(80, 249, 'signal inn', 'start'));
  els.push(wire([[x - 12, g2y], [250, g2y]]), lbl(x - 18, g2y - 12, 'gate 2', 'end', 11));
  if (reveal) {
    els.push(dot(250, g2y), wire([[250, g2y], [250, 40]]), resistor(250, 80, true, 36, 14), lbl(250, 32, '+U'));
    els.push(lbl(236, 74, 'liten positiv', 'end'), lbl(236, 90, 'likespenning', 'end'));
    els.push(wire([[250, g2y], [215, g2y]]), dot(215, g2y), wire([[215, g2y], [215, g2y + 56]]), capacitor(215, g2y + 28), ground(215, g2y + 56), lbl(200, g2y + 28, 'avkobling', 'end'));
    els.push(markBox(130, 44, 130, g2y + 36));
  } else {
    els.push(terminal(250, g2y), lbl(240, g2y, '?', 'end', 18));
  }
  els.push(wire([[x, yT - 30], [x, 60]]), lbl(x + 8, 56, 'til avstemt last', 'start'));
  const desc = 'Koblingsskjema av en MOSFET med to isolerte gater (dual-gate). Signalet kommer inn på gate 1, nærmest source, gjennom en kondensator. Source ligger på jord, og drain går til en avstemt last.' +
    (reveal ? ' Gate 2 får en liten positiv likespenning fra en motstand og er avkoblet til jord med en kondensator, markert med en stiplet ramme.' : ' Tilkoblingen av gate 2 er vist med et spørsmålstegn.');
  return { height: 290, desc };
}

function triode(els, reveal) {
  const cx = 280;
  const cy = 160;
  els.push(h('circle', { cx, cy, r: 70, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  els.push(line(cx - 32, cy - 36, cx + 32, cy - 36, { 'stroke-width': 4 }), wire([[cx, cy - 36], [cx, 40]]), lbl(cx + 10, 50, 'anode', 'start'));
  // grid: dashed line
  els.push(line(cx - 40, cy, cx + 40, cy, { 'stroke-width': 2, 'stroke-dasharray': '6 5' }), wire([[cx - 40, cy], [140, cy]]), lbl(136, cy - 14, 'gitter', 'start'));
  // cathode with its heater below
  els.push(wire([[cx - 28, cy + 30], [cx - 28, cy + 36], [cx + 28, cy + 36], [cx + 28, cy + 30]]), wire([[cx + 28, cy + 36], [cx + 28, 290]]), lbl(cx + 36, 280, 'katode', 'start'));
  els.push(wire([[cx - 18, cy + 60], [cx, cy + 46], [cx + 18, cy + 60]]), lbl(cx - 76, cy + 56, 'glødetråd', 'end', 11));
  let desc = 'Symbol for en triode: i et glassrør sitter en oppvarmet katode nederst, et gitter (stiplet) i midten nær katoden og en anode øverst.';
  if (reveal) {
    els.push(lbl(200, cy + 18, 'litt negativ', 'end'), lbl(cx + 10, 66, 'høy positiv spenning', 'start'));
    els.push(line(cx - 6, cy + 26, cx - 6, cy - 22, { 'stroke-width': 1.2 }), arrowHead(cx - 6, cy - 28, 0, -1, 7), lbl(cx + 80, cy - 16, 'elektroner', 'start', 11), line(cx + 76, cy - 16, cx, cy - 16, { 'stroke-width': 0.8, opacity: 0.6 }));
    desc += ' Gitteret er litt negativt i forhold til katoden og anoden har høy positiv spenning. En pil viser elektronene som går fra katoden gjennom gitteret til anoden.';
  }
  return { height: 300, desc };
}

function pnpStage(els, reveal) {
  const t = pnp(280, 160);
  els.push(t.node, wire([t.e, [t.e[0], 70]]), wire([t.c, [t.c[0], 250]]), wire([t.b, [160, 160]]), terminal(160, 160), terminal(t.e[0], 70), terminal(t.c[0], 250));
  els.push(lbl(t.e[0] + 12, 76, 'E (emitter)', 'start'), lbl(150, 160, 'B (basis)', 'end'), lbl(t.c[0] + 12, 246, 'C (kollektor)', 'start'));
  let desc = 'Symbol for en PNP-transistor: emitteren øverst med pilen inn mot basis, basis til venstre og kollektoren nederst.';
  if (reveal) {
    const it = (t2) => h('tspan', { 'font-style': 'italic' }, t2);
    const sub = (t2) => h('tspan', { dy: 4, 'font-size': 9 }, t2);
    const up = (t2) => h('tspan', { dy: -4 }, t2.replace(/ /g, '\u00a0'));
    els.push(h('text', { x: 150, y: 184, 'font-size': 12, fill: STROKE, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, it('U'), sub('B'), up(' ≈ '), it('U'), sub('E'), up(' − 0,6 V')));
    desc += ' Basis ligger omtrent 0,6 V lavere (mer negativ) enn emitteren.';
  }
  return { height: 270, desc };
}

function crystal(els) {
  const cx = 280;
  const cy = 140;
  els.push(wire([[120, cy], [cx - 22, cy]]), wire([[cx + 22, cy], [440, cy]]), terminal(120, cy), terminal(440, cy));
  els.push(line(cx - 22, cy - 34, cx - 22, cy + 34, { 'stroke-width': 3 }), line(cx + 22, cy - 34, cx + 22, cy + 34, { 'stroke-width': 3 }));
  els.push(h('rect', { x: cx - 12, y: cy - 28, width: 24, height: 56, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  els.push(lbl(cx, cy - 50, 'kvartskrystall'), lbl(cx - 30, cy + 52, 'elektrode', 'end', 11), lbl(cx + 30, cy + 52, 'elektrode', 'start', 11));
  return { height: 220, desc: 'Symbol for et kvartskrystall: en tynn skive av kvarts mellom to elektroder (de tykke strekene), med en tilkobling på hver side.' };
}

const DRAW = { class_c: classC, push_pull: pushPull, regulator_ic: regulator, transistor_mixer: transistorMixer, dual_gate: dualGate, triode, pnp: pnpStage, crystal };
const TITLE = { class_c: 'Forsterkertrinn', push_pull: 'Push-pull-forsterker', regulator_ic: 'Spenningsregulator', transistor_mixer: 'Blander med transistor', dual_gate: 'Dual-gate MOSFET', triode: 'Triode', pnp: 'PNP-transistor', crystal: 'Kvartskrystall' };

function render(p) {
  const els = [];
  const { height, desc } = DRAW[p.kind](els, p.reveal);
  return { svg: svgRoot(580, height, TITLE[p.kind], desc, els, {}, 0, 0), description: desc, animatable: false };
}

export default { id: 'stage', version: 1, rules, quantities: () => ({}), render };
