// safety@1: drawings for electrical and practical safety (chapter 13).
// body_paths   – a plain outline of a person with three ways a current can take: hand to
//                hand across the chest, hand to foot, and within one hand; 'highlight'
//                (with 'reveal') picks one out
// shock_scale  – a logarithmic current scale from 0,1 mA to 10 A with what a 50 Hz current
//                through the chest does, and where a residual-current device and an ordinary
//                fuse act
// earth_fault  – a fuse box (with an RCD for 'fuse_rcd') feeding an appliance in a metal case
//                with a fault from phase to the case; 'reveal' draws the fault current's way
//                back through the protective earth and what trips
// mast_fall    – a mast and an overhead power line seen from the side; 'reveal' draws how
//                far the top reaches if the mast falls
// car_supply   – a mobile radio in a car, with fuses in both leads; 'reveal' breaks the
//                engine's earth cable and draws the starter current through the radio's
//                negative lead
// solder_joint – two joints in cross-section, a good one and a dry one; 'reveal' names them

import { h } from '../render/vnode.js';
import { formatNumber } from '../render/format.js';
import { arrowHead, battery, label, line, resistor, svgRoot, STROKE, wire } from './svg.js';

function rules(p) {
  const errors = [];
  if (p.highlight !== 'none' && p.kind !== 'body_paths') errors.push('highlight: only for kind body_paths');
  if (p.leak_ma != null && p.protection !== 'fuse_rcd') errors.push('leak_ma: only with protection fuse_rcd');
  if ((p.leak_ma != null || p.fuse_a != null) && p.kind !== 'earth_fault') errors.push('fuse_a/leak_ma: only for kind earth_fault');
  return errors;
}

const W = 560;
const lbl = (x, y, t, anchor = 'middle', size = 12, extra = {}) => label(x, y, t, { 'font-size': size, 'text-anchor': anchor, ...extra });
const soft = (d, extra = {}) => h('path', { d, fill: STROKE, opacity: 0.16, stroke: 'none', ...extra });
const num = (x) => formatNumber(x);

// --- body_paths ---------------------------------------------------------------------------

const BODY_PATHS = {
  hand_hand: { name: 'hånd til hånd', dash: null, pts: [[160, 200], [196, 150], [244, 100], [280, 116], [292, 128], [316, 100], [364, 150], [400, 200]] },
  hand_foot: { name: 'hånd til fot', dash: '8 5', pts: [[154, 196], [190, 146], [238, 104], [266, 150], [262, 220], [252, 300], [250, 318]] },
  one_hand: { name: 'innenfor én hånd', dash: '2 4', pts: [[164, 204], [150, 210], [156, 222]] },
};

function bodyPaths(els, p) {
  // a calm silhouette, drawn as paths so labels are only checked against the current paths
  const limb = (pts) => h('path', { d: `M ${pts.map((q) => q.join(' ')).join(' L ')}`, fill: 'none', stroke: STROKE, opacity: 0.16, 'stroke-width': 20, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  els.push(h('circle', { cx: 280, cy: 52, r: 22, fill: STROKE, opacity: 0.16 }));
  els.push(soft('M 252 86 L 308 86 Q 324 86 324 102 L 320 222 L 240 222 L 236 102 Q 236 86 252 86 Z'));
  els.push(limb([[244, 98], [196, 150], [160, 200]]), limb([[316, 98], [364, 150], [400, 200]]));
  els.push(limb([[262, 222], [254, 300], [250, 318]]), limb([[298, 222], [306, 300], [310, 318]]));
  // the heart, slightly left of the middle of the chest (the figure faces us)
  els.push(h('path', { d: 'M 292 136 C 280 126 282 116 288 118 C 291 119 292 122 292 124 C 292 122 293 119 296 118 C 302 116 304 126 292 136 Z', fill: STROKE, opacity: 0.55 }));
  els.push(lbl(294, 152, 'hjertet', 'middle', 10));
  // what is touched: a live part at each hand, and the floor
  els.push(line(110, 322, 450, 322, { 'stroke-width': 2 }), lbl(440, 312, 'gulv', 'end', 10));
  for (const [x, y] of [[160, 200], [400, 200]]) els.push(h('circle', { cx: x, cy: y, r: 4.5, fill: STROKE }));
  const shown = p.reveal && p.highlight !== 'none' ? p.highlight : null;
  Object.entries(BODY_PATHS).forEach(([k, path], i) => {
    const on = shown === k;
    els.push(wire(path.pts, { 'stroke-width': on ? 4.5 : 2.2, 'stroke-dasharray': path.dash, opacity: shown && !on ? 0.4 : 1 }));
    els.push(arrowHead(...path.pts[path.pts.length - 1], path.pts[path.pts.length - 1][0] - path.pts[path.pts.length - 2][0], path.pts[path.pts.length - 1][1] - path.pts[path.pts.length - 2][1], on ? 11 : 8));
    // legend, top right
    const y = 40 + i * 24;
    els.push(line(410, y, 444, y, { 'stroke-width': on ? 4.5 : 2.2, 'stroke-dasharray': path.dash, opacity: shown && !on ? 0.4 : 1 }));
    els.push(lbl(450, y, path.name, 'start', 12, { 'font-weight': on ? 'bold' : null }));
  });
  const desc = ['Forenklet figur av et menneske som berører spenningsførende deler. Tre mulige strømveier er tegnet: fra hånd til hånd tvers over brystet, fra hånd til fot, og innenfor én hånd. Hjertet ligger i brystet.'];
  if (shown === 'hand_hand') {
    els.push(lbl(410, 124, 'farligst: tvers', 'start', 12, { 'font-weight': 'bold' }), lbl(410, 140, 'gjennom brystet', 'start', 12, { 'font-weight': 'bold' }));
    desc.push('Veien fra hånd til hånd er framhevet: den går tvers gjennom brystet og hjertet og er den farligste.');
  } else if (shown) desc.push(`Veien ${BODY_PATHS[shown].name} er framhevet.`);
  return { height: 334, desc: desc.join(' ') };
}

// --- shock_scale --------------------------------------------------------------------------

function shockScale(els) {
  const x = (amp) => 50 + ((Math.log10(amp) + 4) / 5) * 470;
  const y = 120;
  els.push(line(40, y, 530, y, { 'stroke-width': 2 }), arrowHead(538, y, 1, 0, 9));
  for (const [a, t] of [[1e-4, '0,1 mA'], [1e-3, '1 mA'], [1e-2, '10 mA'], [1e-1, '100 mA'], [1, '1 A'], [10, '10 A']]) {
    els.push(line(x(a), y - 5, x(a), y + 5, { 'stroke-width': 1.5 }), lbl(x(a), y + 18, t, 'middle', 11));
  }
  // what the current does (rounded; it also depends on the path and how long it lasts)
  els.push(line(x(1e-3), y - 6, x(1e-3), y - 26, { 'stroke-width': 1.5 }), lbl(x(1e-3), y - 36, 'kjennes så vidt', 'middle', 12));
  els.push(h('rect', { x: x(0.01), y: y - 22, width: x(0.03) - x(0.01), height: 22, fill: STROKE, opacity: 0.22 }));
  els.push(lbl((x(0.01) + x(0.03)) / 2, y - 36, 'klarer ikke å slippe', 'middle', 12));
  els.push(h('rect', { x: x(0.03), y: y - 22, width: x(1) - x(0.03), height: 22, fill: STROKE, opacity: 0.5 }));
  els.push(lbl((x(0.03) + x(1)) / 2, y - 60, 'fare for hjerteflimmer', 'middle', 12, { 'font-weight': 'bold' }));
  // where protection acts
  for (const [a, t, anchor] of [[0.03, 'jordfeilbryter (30 mA)', 'middle'], [10, 'vanlig sikring (10 A)', 'end']]) {
    els.push(line(x(a), y + 28, x(a), y + 46, { 'stroke-width': 2 }), arrowHead(x(a), y + 28, 0, -1, 7), lbl(x(a) + (anchor === 'end' ? 4 : 0), y + 58, t, anchor, 12));
  }
  return {
    height: 196,
    desc: 'Logaritmisk skala for vekselstrøm gjennom kroppen, fra 0,1 mA til 10 A. Rundt 1 mA kjennes så vidt. Fra omtrent 10 til 30 mA klarer man ikke å slippe taket. Fra noen titalls milliampere og oppover er det fare for hjerteflimmer. En jordfeilbryter løser ut ved om lag 30 mA, mens en vanlig sikring først løser ut ved om lag 10 A – mer enn hundre ganger så mye.',
  };
}

// --- earth_fault --------------------------------------------------------------------------

function earthFault(els, p) {
  const [yL, yN, yPE] = [84, 130, 180];
  const rcd = p.protection === 'fuse_rcd';
  // fuse box
  els.push(h('rect', { x: 16, y: 34, width: 134, height: 184, rx: 6, fill: 'none', stroke: STROKE, 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }));
  els.push(lbl(83, 232, 'sikringsskap', 'middle', 12));
  for (const [y, t] of [[yL, 'L'], [yN, 'N'], [yPE, 'PE']]) els.push(lbl(36, y, t, 'end', 12, { 'font-weight': 'bold' }));
  // conductors to the appliance
  els.push(line(42, yL, 470, yL), line(42, yN, 470, yN), line(42, yPE, 400, yPE));
  els.push(line(42, yPE, 42, yPE + 16), line(32, yPE + 16, 52, yPE + 16), line(36, yPE + 21, 48, yPE + 21), line(40, yPE + 26, 44, yPE + 26));
  // the fuse on the phase conductor
  const tripped = p.reveal;
  const fuseTrips = tripped && !rcd;
  els.push(h('rect', { x: 104, y: yL - 7, width: 30, height: 14, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
  if (fuseTrips) els.push(line(110, yL + 6, 128, yL - 6, { 'stroke-width': 2 }));
  els.push(lbl(119, yL - 18, p.fuse_a != null ? `sikring ${num(p.fuse_a)} A` : 'sikring', 'middle', 11));
  // residual-current device: senses phase and neutral together
  if (rcd) {
    els.push(h('rect', { x: 56, y: yL - 12, width: 34, height: yN - yL + 24, rx: 4, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }));
    els.push(line(42, yL, 56, yL), line(90, yL, 104, yL), line(42, yN, 56, yN), line(90, yN, 150, yN));
    els.push(h('ellipse', { cx: 73, cy: (yL + yN) / 2, rx: 9, ry: (yN - yL) / 2 + 4, fill: 'none', stroke: STROKE, 'stroke-width': 1.5 }));
    els.push(lbl(73, yN + 28, 'jordfeil-', 'middle', 11), lbl(73, yN + 45, 'bryter', 'middle', 11));
  }
  // the appliance: a load between L and N in an earthed metal case
  els.push(h('rect', { x: 400, y: 50, width: 140, height: 160, rx: 4, fill: 'none', stroke: STROKE, 'stroke-width': 4 }));
  els.push(lbl(470, 232, 'metallkabinett', 'middle', 12));
  els.push(line(470, yL, 470, 95), resistor(470, 107, true, 24, 14), line(470, 119, 470, yN));
  els.push(lbl(486, 107, 'last', 'start', 11));
  els.push(h('circle', { cx: 400, cy: yPE, r: 4, fill: STROKE }));
  // the fault: the phase conductor touches the case
  els.push(wire([[430, yL], [424, 74], [436, 66], [430, 52]], { 'stroke-width': 2.5 }));
  els.push(lbl(446, 64, 'feil', 'start', 11, { 'font-weight': 'bold' }));
  const desc = [`Et sikringsskap med ${rcd ? 'jordfeilbryter og ' : ''}sikring${p.fuse_a != null ? ` på ${num(p.fuse_a)} A` : ''} forsyner et apparat i et metallkabinett med fase (L), nøytral (N) og jord (PE). Kabinettet er koblet til jordlederen. En feil gjør at fasen får kontakt med kabinettet.`];
  if (p.reveal) {
    // the fault current: out on L, through the fault into the case, back on PE
    const dash = { 'stroke-width': 2.5, 'stroke-dasharray': '7 4' };
    els.push(wire([[160, yL + 8], [418, yL + 8], [418, 60]], dash), arrowHead(300, yL + 8, 1, 0, 9));
    els.push(wire([[412, yPE - 8], [160, yPE - 8]], dash), arrowHead(260, yPE - 8, -1, 0, 9));
    const leak = p.leak_ma != null ? `${num(p.leak_ma)} mA lekker til jord` : 'stor feilstrøm';
    els.push(lbl(280, yPE - 22, leak, 'middle', 12, { 'font-weight': 'bold' }));
    if (rcd) {
      els.push(line(60, yL - 22, 86, yL - 30, { 'stroke-width': 2 })); // the switch has opened
      els.push(lbl(280, 252, 'Strømmen ut på L og tilbake på N er ikke lik: jordfeilbryteren løser ut.', 'middle', 12, { 'font-weight': 'bold' }));
      desc.push(`Feilstrømmen${p.leak_ma != null ? ` på ${num(p.leak_ma)} mA` : ''} går fra fasen gjennom kabinettet og tilbake i jordlederen, ikke i nøytrallederen. Da er strømmen ut og tilbake ikke lik, og jordfeilbryteren løser ut. Sikringen merker en så liten strøm ikke.`);
    } else {
      els.push(lbl(280, 252, 'Stor strøm gjennom jordlederen: sikringen løser ut.', 'middle', 12, { 'font-weight': 'bold' }));
      desc.push('Feilstrømmen går fra fasen gjennom kabinettet og tilbake i jordlederen. Jordlederen har lav motstand, så strømmen blir stor og sikringen løser ut. Kabinettet blir ikke stående strømførende.');
    }
  }
  return { height: p.reveal ? 266 : 244, desc: desc.join(' ') };
}

// --- mast_fall ----------------------------------------------------------------------------

function mastFall(els, p) {
  const g = 200;
  // the scale fits both the width (mast, line and the fall) and the height above the ground
  const s = Math.min(380 / Math.max(p.height_m * 1.25, p.line_distance_m + 6), 160 / p.height_m);
  const x0 = 90;
  const top = g - p.height_m * s;
  const xL = x0 + p.line_distance_m * s;
  const yW = g - Math.min(p.height_m * 0.75, 9) * s;
  els.push(line(20, g, 540, g, { 'stroke-width': 2 }));
  // the mast with two guy lines
  els.push(line(x0, g, x0, top, { 'stroke-width': 4 }));
  els.push(line(x0, top + (g - top) * 0.35, x0 - 46, g, { 'stroke-width': 1 }), line(x0, top + (g - top) * 0.35, x0 + 46, g, { 'stroke-width': 1 }));
  els.push(lbl(x0 - 10, (top + g) / 2 - 20, `${num(p.height_m)} m`, 'end', 13, { 'font-weight': 'bold' }), lbl(x0, top - 12, 'mast', 'middle', 12));
  // the power line: a pole and the wire across the field
  els.push(line(xL, g, xL, yW - 6, { 'stroke-width': 3 }), line(xL - 10, yW, 540, yW + 8, { 'stroke-width': 1.8 }));
  els.push(lbl(536, yW - 10, 'strømledning', 'end', 12));
  const desc = [`Sett fra siden: en ${num(p.height_m)} m høy mast med barduner og en luftstrekt strømledning i nærheten.`];
  if (p.reveal) {
    const r = p.height_m * s;
    els.push(h('path', { d: `M ${x0} ${top} A ${r} ${r} 0 0 1 ${x0 + r} ${g}`, fill: 'none', stroke: STROKE, 'stroke-width': 2, 'stroke-dasharray': '7 5' }));
    els.push(arrowHead(x0 + r, g - 2, 0, 1, 9));
    const hits = p.line_distance_m < p.height_m;
    els.push(lbl(x0 + 8, g + 18, `en mast som velter, når ${num(p.height_m)} m ut${hits ? ' – og treffer ledningen' : ''}`, 'start', 12, { 'font-weight': 'bold' }));
    desc.push(`Den stiplede buen viser hvor toppen havner om masten velter: ${num(p.height_m)} m ut fra foten.${hits ? ' Ledningen står nærmere enn det, så masten kan treffe den.' : ''} Masten må stå så langt unna at den ikke kan nå ledningen.`);
  }
  return { height: p.reveal ? 226 : 214, desc: desc.join(' ') };
}

// --- car_supply ---------------------------------------------------------------------------

function carSupply(els, p) {
  const fuse = (x, y) => h('rect', { x: x - 12, y: y - 6, width: 24, height: 12, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 });
  const body = 220;
  // engine with starter motor, battery, radio, and the car body
  els.push(h('rect', { x: 30, y: 40, width: 120, height: 60, rx: 6, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }), lbl(90, 64, 'motor med', 'middle', 12), lbl(90, 80, 'startmotor', 'middle', 12));
  els.push(line(220, 24, 220, 64), battery(220, 70), lbl(250, 70, 'batteri', 'start', 12));
  els.push(h('rect', { x: 400, y: 60, width: 120, height: 50, rx: 6, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 2 }), lbl(460, 86, 'radio', 'middle', 13, { 'font-weight': 'bold' }));
  els.push(line(30, body, 540, body, { 'stroke-width': 5 }), lbl(300, body + 18, 'karosseri', 'middle', 12));
  // starter cable from +
  els.push(wire([[220, 24], [90, 24], [90, 40]], { 'stroke-width': 4 }), lbl(155, 14, 'startkabel', 'middle', 11));
  // the radio's plus lead (fused) from +
  els.push(h('circle', { cx: 220, cy: 40, r: 3.5, fill: STROKE }), wire([[220, 40], [350, 40], [350, 75], [400, 75]]), fuse(290, 40));
  // battery minus: the engine's earth cable, and the radio's minus lead (fused)
  const broken = p.reveal;
  els.push(line(220, 76, 220, 130), h('circle', { cx: 220, cy: 130, r: 3.5, fill: STROKE }));
  if (broken) {
    els.push(wire([[220, 130], [168, 130]], { 'stroke-width': 3 }), wire([[140, 130], [90, 130], [90, 100]], { 'stroke-width': 3 }));
    els.push(line(150, 122, 158, 138, { 'stroke-width': 2 }), line(158, 122, 150, 138, { 'stroke-width': 2 }));
  } else els.push(wire([[220, 130], [90, 130], [90, 100]], { 'stroke-width': 3 }));
  els.push(lbl(155, 116, broken ? 'jordkabel (røket)' : 'jordkabel', 'middle', 11, { 'font-weight': broken ? 'bold' : null }));
  els.push(wire([[220, 130], [350, 130], [350, 95], [400, 95]]), fuse(290, 130));
  // engine bonded to the body, and the radio to the body through the antenna mount
  els.push(line(50, 100, 50, body, { 'stroke-width': 2.5 }), lbl(58, 170, 'fletning', 'start', 11));
  els.push(line(470, 110, 470, body, { 'stroke-width': 1.8 }), lbl(478, 170, 'antennefeste', 'start', 11));
  els.push(lbl(290, 152, 'sikringer i + og −', 'middle', 11));
  const desc = ['En radio i bil får strøm direkte fra batteriet, med sikring både i plussleder og minusleder. Startmotoren får strøm fra batteriets pluss gjennom startkabelen, og strømmen går tilbake gjennom motorens jordkabel til minus. Motoren er også koblet til karosseriet, og radioen er koblet til karosseriet gjennom antennefestet.'];
  if (broken) {
    const dash = { 'stroke-width': 2.5, 'stroke-dasharray': '7 4' };
    els.push(wire([[58, 206], [462, 206], [462, 118]], dash), arrowHead(260, 206, 1, 0, 9));
    els.push(wire([[392, 102], [358, 102], [358, 138], [228, 138]], dash), arrowHead(300, 138, -1, 0, 9));
    els.push(lbl(260, 192, 'startstrøm: flere hundre ampere', 'middle', 12, { 'font-weight': 'bold' }));
    desc.push('Motorens jordkabel er røket. Startstrømmen finner da veien fra motoren gjennom karosseriet, antennefestet og radioen og tilbake i radioens minusleder. Sikringen i minuslederen bryter før ledningen brenner opp.');
  }
  return { height: 248, desc: desc.join(' ') };
}

// --- solder_joint -------------------------------------------------------------------------

function solderJoint(els, p) {
  const joint = (c, good) => {
    els.push(h('rect', { x: c - 90, y: 150, width: 180, height: 18, fill: STROKE, opacity: 0.14, stroke: STROKE, 'stroke-width': 1.2 }));
    els.push(h('rect', { x: c - 42, y: 146, width: 84, height: 4, fill: STROKE }));
    els.push(h('rect', { x: c - 5, y: 46, width: 10, height: 134, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': 1.5 }));
    if (good) els.push(h('path', { d: `M ${c - 42} 146 Q ${c - 10} 142 ${c - 5} 98 L ${c + 5} 98 Q ${c + 10} 142 ${c + 42} 146 Z`, fill: STROKE, opacity: 0.5 }));
    else els.push(h('ellipse', { cx: c, cy: 112, rx: 26, ry: 22, fill: STROKE, opacity: 0.5 }));
  };
  const [a, b] = [150, 410];
  joint(a, p.good_first);
  joint(b, !p.good_first);
  els.push(lbl(a, 198, 'skjøt 1', 'middle', 12, { 'font-weight': 'bold' }), lbl(b, 198, 'skjøt 2', 'middle', 12, { 'font-weight': 'bold' }));
  els.push(lbl(280, 30, 'kretskort sett fra siden, i snitt', 'middle', 11));
  const desc = ['To loddeskjøter sett fra siden, i snitt: en komponenttråd gjennom et kretskort med en loddeøy. I den ene skjøten ligger tinnet som en jevn, svakt innsvingt kjegle fra øya opp langs tråden. I den andre sitter tinnet som en rund klump på tråden og berører ikke øya.'];
  if (p.reveal) {
    const [g, d] = p.good_first ? [a, b] : [b, a];
    els.push(lbl(g, 216, 'god: tinnet har flytt ut', 'middle', 12), lbl(d, 216, 'tørrlodding: klump uten binding', 'middle', 12));
    desc.push(`Skjøt ${p.good_first ? 1 : 2} er god: tinnet har flytt ut og fuktet både øya og tråden. Skjøt ${p.good_first ? 2 : 1} er en tørrlodding: tinnet har stivnet som en klump uten å binde seg.`);
  }
  return { height: p.reveal ? 230 : 212, desc: desc.join(' ') };
}

const DRAW = { body_paths: bodyPaths, shock_scale: shockScale, earth_fault: earthFault, mast_fall: mastFall, car_supply: carSupply, solder_joint: solderJoint };
const TITLE = { body_paths: 'Strømveier gjennom kroppen', shock_scale: 'Strøm gjennom kroppen', earth_fault: 'Jordfeil i et apparat', mast_fall: 'Mast og strømledning', car_supply: 'Radio i bil', solder_joint: 'Loddeskjøter' };
const IDEAL = {
  body_paths: 'Forenklet figur, ikke anatomisk riktig.',
  shock_scale: 'Omtrentlige verdier for vekselstrøm (50 Hz) gjennom brystet; virkningen avhenger også av strømvei og varighet.',
  earth_fault: 'Forenklet prinsippskisse av én kurs; ikke et installasjonsskjema.',
  mast_fall: 'Forenklet sideriss, ikke i skala.',
  car_supply: 'Forenklet prinsippskisse; bilens øvrige ledningsnett er ikke tegnet.',
  solder_joint: 'Forenklet snitt, ikke i skala.',
};

function render(p) {
  const els = [];
  const { height, desc } = DRAW[p.kind](els, p);
  return { svg: svgRoot(W, height, TITLE[p.kind], desc, els, {}, 0, 0), description: desc, animatable: false };
}

const idealised = (p) => IDEAL[p.kind];

export default { id: 'safety', version: 1, rules, quantities: () => ({}), render, idealised };
