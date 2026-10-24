// time-signal@1: signals against time, computed from their definition and drawn as
// stacked panels, one per trace:
// conduction – collector current in amplifier classes A, AB, B and C for a sine drive
// keying     – a CW carrier keyed hard (key clicks) or softly (click filter)
// envelope   – the envelope of SSB speech, speech with a speech processor, or RTTY,
//              optionally with the peak and average levels marked
// am         – an AM signal modulated correctly, or overdriven so the peaks are clipped
// fsk        – a data signal and the carrier shifting between two frequencies
// chirp      – the frequency while a CW transmitter is keyed, with or without chirp
// 'blank' draws only a note, for figures that are shown after answering.

import { h } from '../render/vnode.js';
import { arrowHead, label, line, svgRoot, STROKE } from './svg.js';

const TRACES = {
  conduction: { A: 'Klasse A', AB: 'Klasse AB', B: 'Klasse B', C: 'Klasse C' },
  keying: { hard: 'Hard nøkling', soft: 'Myk nøkling (med klikkfilter)' },
  envelope: { speech: 'SSB-tale', processed: 'SSB-tale med taleprosessor', rtty: 'RTTY (konstant amplitude)' },
  am: { normal: 'Riktig modulert', overdriven: 'Overstyrt: toppene klippes' },
  fsk: { fsk: '' },
  chirp: { chirp: 'Med kvitter', stable: 'Stabil oscillator' },
};

function rules(p) {
  const errors = [];
  const allowed = TRACES[p.kind];
  if (!p.traces.length) errors.push('traces: at least one');
  for (const t of p.traces) if (!(t in allowed)) errors.push(`traces: '${t}' is not used with kind '${p.kind}'`);
  if (new Set(p.traces).size !== p.traces.length) errors.push('traces: duplicates');
  if (p.markers.length && p.kind !== 'envelope') errors.push("markers: only for kind 'envelope'");
  if (p.kind === 'fsk' && !/^[01]{2,10}$/.test(p.bits)) errors.push('bits: 2–10 characters of 0 and 1');
  return errors;
}

// --- the signals (t runs from 0 to 1 across a panel) --------------------------------

const BIAS = { A: 1.25, AB: 0.25, B: 0, C: -0.5 }; // drive is sin, conduction where bias + sin > 0

function keyEnvelope(soft) {
  // key down from 0,1 to 0,45 and from 0,6 to 0,9
  const ramp = soft ? 0.05 : 0.002;
  const seg = (t, a, b) => {
    if (t < a || t > b) return 0;
    const up = Math.min(1, (t - a) / ramp);
    const down = Math.min(1, (b - t) / ramp);
    const r = Math.min(up, down);
    return soft ? 0.5 - 0.5 * Math.cos(Math.PI * r) : r;
  };
  return (t) => Math.max(seg(t, 0.1, 0.45), seg(t, 0.6, 0.9));
}

// a fixed, speech-like envelope: syllables of different strength with short peaks
const SYLLABLES = [[0.08, 0.05, 0.55], [0.2, 0.04, 1.0], [0.3, 0.05, 0.35], [0.46, 0.06, 0.7], [0.58, 0.03, 0.9], [0.7, 0.05, 0.3], [0.84, 0.05, 0.6]];
function speech(t) {
  let v = 0;
  for (const [c, w, a] of SYLLABLES) v = Math.max(v, a * Math.exp(-(((t - c) / w) ** 2)));
  return v * (0.75 + 0.25 * Math.sin(2 * Math.PI * 23 * t) ** 2);
}
const ENVELOPES = {
  speech,
  processed: (t) => Math.min(1, 1.6 * Math.sqrt(speech(t))) * 0.98,
  rtty: (t) => (t > 0.04 && t < 0.96 ? 0.98 : 0),
};

// the same modulation; overdriven, the stage cannot follow the peaks and flattens them
const amEnvelope = (overdriven) => (t) => {
  const e = (1 + 0.7 * Math.sin(2 * Math.PI * 2 * t)) / 1.7;
  return overdriven ? Math.min(e, 0.68) : e;
};

function chirpFreq(stable) {
  // key down 0,08–0,42 and 0,55–0,92; frequency offset settles after each key-down
  return (t) => {
    for (const [a, b] of [[0.08, 0.42], [0.55, 0.92]]) {
      if (t >= a && t <= b) return stable ? 0 : 0.8 * Math.exp(-(t - a) / 0.05);
    }
    return null;
  };
}

// --- drawing -------------------------------------------------------------------------

const X0 = 50;
const X1 = 520;
const PANEL = 96; // height of one panel
const panelHeight = (kind) => (kind === 'conduction' ? 70 : PANEL);
const xOf = (t) => X0 + t * (X1 - X0);

function polyline(points, extra = {}) {
  let d = '';
  let pen = false;
  for (const pt of points) {
    if (!pt) { pen = false; continue; }
    d += `${pen ? ' L' : ' M'} ${pt[0].toFixed(2)} ${pt[1].toFixed(2)}`;
    pen = true;
  }
  return h('path', { d: d.trim(), fill: 'none', stroke: STROKE, 'stroke-width': 2, 'stroke-linejoin': 'round', ...extra });
}

function timeAxis(els, y) {
  els.push(line(X0, y, X1 + 12, y, { 'stroke-width': 1.5 }), arrowHead(X1 + 18, y, 1, 0, 8));
  els.push(label(X1 + 18, y + 14, 't', { 'font-size': 12, 'font-style': 'italic', 'text-anchor': 'end' }));
}

const N = 600;
const sample = (fn) => Array.from({ length: N + 1 }, (_, j) => fn(j / N));

// the class that a bias gives (used when the bias is set directly, as in an animation)
const classOf = (b) => (b >= 1 ? 'A' : b > 0.04 ? 'AB' : b > -0.04 ? 'B' : 'C');

function drawPanel(els, p, trace, top) {
  const bias = p.kind === 'conduction' && p.bias != null ? p.bias : BIAS[trace];
  const name = p.kind === 'conduction' && p.bias != null ? TRACES.conduction[classOf(p.bias)] : TRACES[p.kind][trace];
  if (name) els.push(label(X0, top + 10, name, { 'font-size': 13, 'font-weight': 'bold', 'text-anchor': 'start' }));
  const mid = top + PANEL / 2 + 8;
  const amp = PANEL / 2 - 16;
  if (p.kind === 'conduction') {
    // zero line, the drive (dashed: bias + sine) and the current (solid: the part above zero)
    const zero = top + 50;
    const scale = 14;
    timeAxis(els, zero);
    const drive = (t) => bias + Math.sin(2 * Math.PI * 2 * t);
    els.push(polyline(sample((t) => [xOf(t), zero - scale * drive(t)]), { 'stroke-width': 1.2, 'stroke-dasharray': '4 4', opacity: 0.75 }));
    els.push(polyline(sample((t) => [xOf(t), zero - scale * Math.max(0, drive(t))]), { 'stroke-width': 2.5 }));
    return;
  }
  if (p.kind === 'keying' || p.kind === 'am') {
    const env = p.kind === 'keying' ? keyEnvelope(trace === 'soft') : amEnvelope(trace === 'overdriven');
    const cycles = p.kind === 'keying' ? 60 : 40;
    timeAxis(els, mid);
    els.push(polyline(sample((t) => [xOf(t), mid - amp * env(t) * Math.sin(2 * Math.PI * cycles * t)]), { 'stroke-width': 1.2 }));
    els.push(polyline(sample((t) => [xOf(t), mid - amp * env(t)]), { 'stroke-width': 1.5, 'stroke-dasharray': '5 3' }));
    return;
  }
  if (p.kind === 'envelope') {
    const env = ENVELOPES[trace];
    const vals = sample(env);
    timeAxis(els, mid);
    const pts = vals.map((v, j) => [xOf(j / N), mid - amp * v]);
    const back = vals.map((v, j) => [xOf(j / N), mid + amp * v]).reverse();
    els.push(h('path', { d: `M ${pts.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L ')} L ${back.map((q) => `${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' L ')} Z`, fill: STROKE, opacity: 0.35, stroke: STROKE, 'stroke-width': 1 }));
    const peak = Math.max(...vals);
    const avg = vals.reduce((a, v) => a + v, 0) / vals.length;
    if (p.markers.includes('peak')) {
      els.push(line(X0, mid - amp * peak, X1, mid - amp * peak, { 'stroke-width': 1.5, 'stroke-dasharray': '6 4' }));
      els.push(label(X1 + 4, mid - amp * peak, 'topp', { 'font-size': 11, 'text-anchor': 'start' }));
    }
    if (p.markers.includes('average')) {
      els.push(line(X0, mid - amp * avg, X1, mid - amp * avg, { 'stroke-width': 2 }));
      // when the two levels are close, the average label goes below its line
      const close = p.markers.includes('peak') && amp * (peak - avg) < 12;
      els.push(label(X1 + 4, mid - amp * avg + (close ? 11 : 0), 'snitt', { 'font-size': 11, 'text-anchor': 'start' }));
    }
    return;
  }
  if (p.kind === 'fsk') {
    const bits = p.bits.split('').map(Number);
    const bit = (t) => bits[Math.min(bits.length - 1, Math.floor(t * bits.length))];
    const dataBase = top + 34;
    els.push(label(X0 - 6, dataBase - 10, 'data', { 'font-size': 11, 'text-anchor': 'end' }));
    els.push(polyline(sample((t) => [xOf(t), dataBase - 18 * bit(t)])));
    bits.forEach((b, i) => els.push(label(xOf((i + 0.5) / bits.length), dataBase - 28, String(b), { 'font-size': 11 })));
    const cy = top + PANEL + 34;
    els.push(label(X0 - 6, cy, 'sender', { 'font-size': 11, 'text-anchor': 'end' }));
    timeAxis(els, cy);
    // phase-continuous: integrate the frequency
    let ph = 0;
    const pts = [];
    for (let j = 0; j <= N * 2; j++) {
      const t = j / (N * 2);
      ph += (2 * Math.PI * (bit(t) ? 34 : 20)) / (N * 2);
      pts.push([xOf(t), cy - 26 * Math.sin(ph)]);
    }
    els.push(polyline(pts, { 'stroke-width': 1.4 }));
    return;
  }
  if (p.kind === 'chirp') {
    const fn = chirpFreq(trace === 'stable');
    const keyY = top + 30;
    els.push(label(X0 - 6, keyY - 6, 'nøkkel', { 'font-size': 11, 'text-anchor': 'end' }));
    els.push(polyline(sample((t) => [xOf(t), keyY - (fn(t) === null ? 0 : 12)])));
    const fy = top + PANEL - 10;
    els.push(label(X0 - 6, fy, 'f', { 'font-size': 12, 'font-style': 'italic', 'text-anchor': 'end' }));
    els.push(line(X0, fy, X1, fy, { 'stroke-width': 1, 'stroke-dasharray': '3 4', opacity: 0.6 }));
    els.push(polyline(sample((t) => (fn(t) === null ? null : [xOf(t), fy - 36 * fn(t)])), { 'stroke-width': 2.5 }));
    timeAxis(els, fy + 14);
  }
}

const DESC = {
  A: 'Klasse A: strømmen går hele perioden og følger inngangssignalet.',
  AB: 'Klasse AB: strømmen går litt mer enn en halv periode og er null resten av tiden.',
  B: 'Klasse B: strømmen går i nøyaktig en halv periode.',
  C: 'Klasse C: strømmen går bare i korte pulser på toppene, mindre enn en halv periode.',
  hard: 'Hard nøkling: bærebølgen slås av og på brått, med loddrette flanker.',
  soft: 'Myk nøkling: bærebølgen bygges opp og dør ut gradvis ved hvert tegn.',
  speech: 'SSB-tale: amplituden varierer mye, med korte topper og lav gjennomsnittsverdi.',
  processed: 'Tale med taleprosessor: de svake delene er løftet, så gjennomsnittsverdien ligger nærmere toppene.',
  rtty: 'RTTY: amplituden er konstant så lenge det sendes, så gjennomsnittet er lik toppen.',
  normal: 'Riktig modulert AM: omhyllingskurven følger tonen og når aldri helt ned til null.',
  overdriven: 'Overstyrt: den samme modulasjonen, men toppene av omhyllingskurven er flatklippet fordi trinnet ikke klarer mer.',
  chirp: 'Med kvitter: frekvensen starter litt ved siden av og glir inn på riktig verdi hver gang nøkkelen trykkes ned.',
  stable: 'Stabil oscillator: frekvensen ligger fast fra første øyeblikk.',
};
const TITLE = { conduction: 'Kollektorstrøm i ulike klasser', keying: 'Nøkling av bærebølgen', envelope: 'Omhyllingskurve over tid', am: 'AM-signal over tid', fsk: 'Frekvensskiftnøkling', chirp: 'Frekvens under nøkling' };

function render(p) {
  const els = [];
  let height;
  const parts = [];
  if (p.blank) {
    height = 120;
    if (p.note) els.push(label((X0 + X1) / 2, 60, p.note, { 'font-size': 14, opacity: 0.75 }));
    parts.push(`${TITLE[p.kind]}. ${p.note || ''}`.trim());
  } else if (p.kind === 'fsk') {
    drawPanel(els, p, 'fsk', 10);
    height = PANEL + 76;
    parts.push(`Øverst et datasignal (${p.bits.split('').join(' ')}). Under det senderens signal med konstant amplitude, som svinger raskere når databiten er 1 og langsommere når den er 0.`);
  } else {
    const ph = panelHeight(p.kind) + 24;
    p.traces.forEach((tr, i) => drawPanel(els, p, tr, 10 + i * ph));
    height = 10 + p.traces.length * ph;
    // a cursor running along the time axis (used by animations to show time passing)
    if (p.cursor != null) els.push(line(xOf(p.cursor), 14, xOf(p.cursor), height - 8, { 'stroke-width': 2, opacity: 0.6 }));
    if (p.kind === 'conduction') parts.push('Kollektorstrømmen (heltrukket) for en sinusformet styrespenning (stiplet). Den delen av den stiplede kurven som ligger under null, gir ingen strøm.');
    if (p.kind === 'keying') parts.push('Bærebølgen to ganger slått på og av, med omhyllingskurven stiplet.');
    if (p.kind === 'am') parts.push('Bærebølgen med omhyllingskurven stiplet.');
    if (p.kind === 'chirp') parts.push('Øverst når nøkkelen er nede, under det senderens frekvens.');
    for (const tr of p.traces) parts.push(DESC[tr]);
    if (p.markers.length) parts.push(`Markert: ${p.markers.map((m) => (m === 'peak' ? 'toppnivået (stiplet)' : 'gjennomsnittsnivået (heltrukket)')).join(' og ')}.`);
  }
  const description = parts.join(' ');
  return { svg: svgRoot(560, height, TITLE[p.kind], description, els, {}, 0, 0), description, animatable: false };
}

export default { id: 'time-signal', version: 1, rules, quantities: () => ({}), render };
