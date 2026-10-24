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
// configurations   – common emitter, common base and common collector side by side
// currents         – an NPN transistor with IB, IC and IE
// tank_loss        – a parallel tuned circuit with the coil's loss as a series R

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
  els.push(wire([[262, 100], t1.b]), wire([[262, 240], t2.b]), dot(262, 170), wire([[262, 170], [286, 170]]), terminal(290, 170), lbl(296, 152, 'forspenning'));
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
  // the transistor sits well to the right, so the gate 2 network has room on the left
  const x = 410;
  const yT = 110;
  const yB = 210;
  const g2y = yT + 23;
  const g1y = yB - 23;
  // channel, drain up, source down, two insulated gates on the left
  els.push(line(x, yT, x, yB, { 'stroke-width': 3 }), wire([[x, yT], [x, 50]]), wire([[x, yB], [x, yB + 46]]), ground(x, yB + 46));
  els.push(line(x - 12, yT + 6, x - 12, yT + 40, { 'stroke-width': 2.5 }), line(x - 12, yB - 40, x - 12, yB - 6, { 'stroke-width': 2.5 }));
  els.push(lbl(x + 10, 46, 'til avstemt last', 'start'), lbl(x + 10, yT - 4, 'drain', 'start'), lbl(x + 10, yB + 24, 'source', 'start'));
  // gate 1: from the signal input through a capacitor, coming up from below
  els.push(wire([[x - 12, g1y], [340, g1y], [340, 270], [250, 270]]), hcap(240, 270), wire([[230, 270], [90, 270]]), terminal(90, 270), lbl(90, 254, 'signal inn', 'start'));
  els.push(lbl(x - 18, g1y + 16, 'gate 1', 'end', 11));
  // gate 2
  const n = 300;
  els.push(wire([[x - 12, g2y], [n, g2y]]), lbl(x - 18, g2y - 12, 'gate 2', 'end', 11));
  if (reveal) {
    els.push(dot(n, g2y), wire([[n, g2y], [n, 38]]), resistor(n, 80, true, 36, 14), lbl(n - 8, 42, '+U', 'end'));
    els.push(lbl(n - 16, 72, 'liten positiv', 'end'), lbl(n - 16, 88, 'likespenning', 'end'));
    els.push(wire([[n, g2y], [240, g2y]]), dot(240, g2y), wire([[240, g2y], [240, g2y + 60]]), capacitor(240, g2y + 30), ground(240, g2y + 60), lbl(212, g2y + 30, 'avkobling', 'end'));
    els.push(markBox(140, 24, 178, g2y + 78 - 24));
  } else {
    els.push(terminal(n, g2y), lbl(n - 10, g2y, '?', 'end', 18));
  }
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


// three small NPN stages side by side: which terminal is common to input and output
function configurations(els) {
  const panel = (x0, title, common) => {
    els.push(lbl(x0 + 80, 26, title, 'middle', 13), h('rect', { x: x0, y: 40, width: 160, height: 200, rx: 6, fill: 'none', stroke: STROKE, 'stroke-width': 1, opacity: 0.4 }));
    const t = npn(x0 + 90, 140);
    els.push(t.node);
    const g = 222; // the common rail
    els.push(line(x0 + 10, g, x0 + 150, g, { 'stroke-width': 2 }), lbl(x0 + 80, g + 12, 'felles', 'middle', 10));
    const inn = (pt) => [wire([[x0 + 14, pt[1]], pt]), terminal(x0 + 14, pt[1]), lbl(x0 + 14, pt[1] - 12, 'inn', 'start', 10)];
    const ut = (pt) => [wire([pt, [x0 + 146, pt[1]]]), terminal(x0 + 146, pt[1]), lbl(x0 + 146, pt[1] - 12, 'ut', 'end', 10)];
    if (common === 'E') els.push(...inn(t.b), wire([t.e, [t.e[0], g]]), wire([t.c, [t.c[0], 80]]), ...ut([t.c[0], 80]));
    // common base: the input comes in on the right, so the base can go straight down to the rail
    if (common === 'B') {
      els.push(wire([t.b, [t.b[0], g]]), wire([t.e, [t.e[0], 196], [x0 + 146, 196]]), terminal(x0 + 146, 196), lbl(x0 + 146, 182, 'inn', 'end', 10));
      els.push(wire([t.c, [t.c[0], 80]]), ...ut([t.c[0], 80]));
    }
    // common collector: the collector goes to the rail along the right edge, outside the output
    if (common === 'C') {
      els.push(...inn(t.b), wire([t.c, [t.c[0], 64], [x0 + 156, 64], [x0 + 156, g]]), wire([t.e, [t.e[0], 190], [x0 + 136, 190]]), terminal(x0 + 136, 190), lbl(x0 + 136, 176, 'ut', 'end', 10));
    }
  };
  panel(20, 'felles emitter', 'E');
  panel(200, 'felles basis', 'B');
  panel(380, 'felles kollektor', 'C');
  return { height: 250, desc: 'Tre forenklede trinn med en NPN-transistor. Felles emitter: signalet inn på basis og ut fra kollektoren, emitteren felles. Felles basis: signalet inn på emitteren og ut fra kollektoren, basis felles. Felles kollektor (emitterfølger): signalet inn på basis og ut fra emitteren, kollektoren felles.' };
}

// an NPN transistor with its three currents
function currents(els) {
  const t = npn(280, 150);
  els.push(t.node, wire([t.b, [150, 150]]), wire([t.c, [t.c[0], 50]]), wire([t.e, [t.e[0], 250]]));
  const arrow = (x1, y1, x2, y2) => [line(x1, y1, x2 - Math.sign(x2 - x1) * 8, y2 - Math.sign(y2 - y1) * 8, { 'stroke-width': 2 }), arrowHead(x2, y2, x2 - x1, y2 - y1, 9)];
  els.push(...arrow(170, 136, 230, 136), symLabel(200, 120, 'I', 'B', null, { 'font-size': 13 }));
  els.push(...arrow(t.c[0] + 16, 60, t.c[0] + 16, 108), symLabel(t.c[0] + 26, 84, 'I', 'C', null, { 'font-size': 13, 'text-anchor': 'start' }));
  els.push(...arrow(t.e[0] + 16, 192, t.e[0] + 16, 240), symLabel(t.e[0] + 26, 216, 'I', 'E', null, { 'font-size': 13, 'text-anchor': 'start' }));
  els.push(lbl(150, 170, 'basis', 'start', 11), lbl(t.c[0] + 10, 46, 'kollektor', 'start', 11), lbl(t.e[0] + 10, 262, 'emitter', 'start', 11));
  return { height: 275, desc: 'En NPN-transistor med de tre strømmene: basisstrømmen IB inn i basis, kollektorstrømmen IC inn i kollektoren og emitterstrømmen IE ut av emitteren.' };
}

// a parallel tuned circuit whose losses sit in a small resistance in series with the coil
function tankLoss(els) {
  const T = 60;
  const B = 240;
  const xL = 240;
  const xC = 360;
  els.push(terminal(100, T), terminal(100, B), wire([[100, T], [xC, T]]), wire([[100, B], [xC, B]]), dot(xL, T), dot(xL, B));
  els.push(wire([[xL, T], [xL, B]]), inductor(xL, 115, 60), resistor(xL, 190, true, 40, 16));
  els.push(wire([[xC, T], [xC, B]]), capacitor(xC, (T + B) / 2));
  els.push(symLabel(xL + 22, 115, 'L', null, null, { 'font-size': 14, 'text-anchor': 'start' }), symLabel(xL + 16, 190, 'R', null, null, { 'font-size': 14, 'text-anchor': 'start' }), lbl(xL + 30, 206, 'tap i spoletråden', 'start', 11));
  els.push(symLabel(xC + 26, (T + B) / 2, 'C', null, null, { 'font-size': 14, 'text-anchor': 'start' }));
  return { height: 270, desc: 'Parallellavstemt krets: en spole L med en liten serieresistans R (tapet i spoletråden) i parallell med en kondensator C.' };
}

const DRAW = { class_c: classC, push_pull: pushPull, regulator_ic: regulator, transistor_mixer: transistorMixer, dual_gate: dualGate, triode, pnp: pnpStage, crystal, configurations, currents, tank_loss: tankLoss };
const TITLE = { configurations: 'Tre transistorkoblinger', currents: 'Strømmene i en transistor', tank_loss: 'Parallellavstemt krets med tap', class_c: 'Forsterkertrinn', push_pull: 'Push-pull-forsterker', regulator_ic: 'Spenningsregulator', transistor_mixer: 'Blander med transistor', dual_gate: 'Dual-gate MOSFET', triode: 'Triode', pnp: 'PNP-transistor', crystal: 'Kvartskrystall' };

function render(p) {
  const els = [];
  const { height, desc } = DRAW[p.kind](els, p.reveal);
  return { svg: svgRoot(580, height, TITLE[p.kind], desc, els, {}, 0, 0), description: desc, animatable: false };
}

export default { id: 'stage', version: 1, rules, quantities: () => ({}), render };
