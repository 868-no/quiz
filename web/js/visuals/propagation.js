// propagation@1: how radio waves travel, drawn from the side and not to scale.
// layers     – the ionosphere's D, E, F1 and F2 layers with typical heights, by day or by
//              night (D gone, E weak, F1 and F2 merged); 'compare' draws day and night
// sky_wave   – a transmitter, its ground wave and rays at several elevation angles up to
//              one layer. Whether a ray comes back is computed from the frequency and the
//              layer's critical frequency (secant law, flat earth: back if f ≤ f₀ / sin e);
//              returning rays land at 2h / tan e. The skip zone between the end of the
//              ground wave and the nearest landing (2h·√((f/f₀)² − 1)) can be shaded.
// hops       – one ray making 1–3 hops between the ground and a layer
// horizon    – two antennas on a curved earth and the radio horizon of each, d ≈ 4·√h
//              km (h in metres), the book's rule of thumb; the curvature is exaggerated
//              but the drawing is geometrically consistent (mast ∝ distance²)
// duct       – a ray trapped in a low layer of warm or moist air over the sea, and a
//              steeper ray that escapes
// aurora     – two stations aiming north at the aurora, which scatters the signal back
// knife_edge – two stations either side of a sharp ridge; 'show_diffraction' adds the
//              waves bending over the edge
// 'blank' draws only a note, for drawings that are shown after answering.

import { h } from '../render/vnode.js';
import { formatNumber } from '../render/format.js';
import { arrowHead, label, line, svgRoot, wire, STROKE } from './svg.js';

const rad = (d) => (d * Math.PI) / 180;

function rules(p) {
  const errors = [];
  if (p.compare && p.kind !== 'layers') errors.push('compare: only for kind layers');
  if (p.kind === 'sky_wave') {
    if (!p.angles.length) errors.push('angles: at least one');
    if (new Set(p.angles).size !== p.angles.length) errors.push('angles: each angle once');
    if (!(p.ground_wave_km < p.range_km)) errors.push('ground_wave_km: must be below range_km');
  }
  if (p.kind === 'hops' && (p.hops * 2 * p.layer_km) / Math.tan(rad(p.elevation_deg)) > 40000) {
    errors.push('elevation_deg: the hops would go more than once round the earth');
  }
  return errors;
}

const W = 560;
const lbl = (x, y, t, anchor = 'middle', size = 12, extra = {}) => label(x, y, t, { 'font-size': size, 'text-anchor': anchor, ...extra });
const km = (v) => `${formatNumber(v)} km`;
const round = (v, step) => Math.round(v / step) * step;
const roundKm = (v) => (v >= 1000 ? round(v, 100) : v >= 100 ? round(v, 10) : Math.round(v));
const mhz = (v) => `${formatNumber(Math.round(v * 10) / 10)} MHz`;
const listNo = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} og ${xs[xs.length - 1]}`);
const LAYER_NAME = { D: 'D-laget', E: 'E-laget', Es: 'sporadisk E', F1: 'F1-laget', F2: 'F2-laget', F: 'F-laget' };

// rough text box (12 px text ≈ 6.4 px per character), to keep labels off the rays
const textBox = (x, y, t, anchor, size = 12) => {
  const w = t.length * size * 0.56;
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return { x: x0 - 3, y: y - size * 0.7, w: w + 6, h: size * 1.4 };
};
function crosses(b, [x1, y1, x2, y2]) {
  const inside = (x, y) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
  if (inside(x1, y1) || inside(x2, y2)) return true;
  const cut = (cx, cy, dx, dy) => {
    const d = (x2 - x1) * (dy - cy) - (y2 - y1) * (dx - cx);
    if (!d) return false;
    const u = ((cx - x1) * (dy - cy) - (cy - y1) * (dx - cx)) / d;
    const v = ((cx - x1) * (y2 - y1) - (cy - y1) * (x2 - x1)) / d;
    return u > 0 && u < 1 && v > 0 && v < 1;
  };
  const [l, r, t, bo] = [b.x, b.x + b.w, b.y, b.y + b.h];
  return cut(l, t, r, t) || cut(r, t, r, bo) || cut(r, bo, l, bo) || cut(l, bo, l, t);
}
/** The first candidate position [x, y, anchor] whose text box crosses no segment; null if none. */
function place(els, segs, text, candidates, size = 12, extra = {}) {
  for (const [x, y, anchor] of candidates) {
    const b = textBox(x, y, text, anchor, size);
    if (b.x < 2 || b.x + b.w > W - 2) continue;
    if (!segs.some((s) => crosses(b, s))) {
      els.push(lbl(x, y, text, anchor, size, extra));
      return true;
    }
  }
  return false;
}
/** A polyline that also records its segments for label placement. */
function ray(els, segs, pts, extra = {}) {
  els.push(wire(pts, { 'stroke-width': 2, ...extra }));
  for (let i = 1; i < pts.length; i++) segs.push([...pts[i - 1], ...pts[i]]);
}
// a shaded area with an outline (opacity applies to the fill rectangle only)
const shade = (x, y, w, hh, fillOp, strokeOp, extra = {}) => h('g', {},
  h('rect', { x, y, width: w, height: hh, rx: extra.rx || 0, fill: STROKE, opacity: fillOp, stroke: 'none' }),
  strokeOp ? h('rect', { x, y, width: w, height: hh, rx: extra.rx || 0, fill: 'none', stroke: STROKE, opacity: strokeOp, 'stroke-width': extra.sw || 1.2, 'stroke-dasharray': extra.dash || null }) : null);
const band = (x, y, w, hh, dashed = false) => shade(x, y, w, hh, dashed ? 0.05 : 0.14, dashed ? 0.7 : 0.35, { rx: 4, dash: dashed ? '5 4' : null });
const ground = (els, y, x0 = 0, x1 = W, hh = 52) => {
  els.push(shade(x0, y, x1 - x0, hh, 0.08, 0));
  els.push(line(x0, y, x1, y, { 'stroke-width': 2 }));
};
/** An antenna mast standing on (x, y). */
const mast = (els, x, y, hh = 24) => {
  els.push(line(x, y, x, y - hh, { 'stroke-width': 2.5 }));
  els.push(line(x - 7, y - hh + 2, x, y - hh - 6, { 'stroke-width': 2 }), line(x + 7, y - hh + 2, x, y - hh - 6, { 'stroke-width': 2 }));
};

// --- layers --------------------------------------------------------------------------

const DAY = [['D', 60, 90, 'D', '70–80 km'], ['E', 105, 135, 'E', 'ca. 120 km'], ['F1', 175, 225, 'F1', 'ca. 200 km'], ['F2', 280, 400, 'F2', '300–400 km']];

function layerPanel(els, x0, w, time, showHeights, base) {
  const y = (alt) => base - alt * 0.6;
  const night = time === 'night';
  els.push(lbl(x0 + 4, 14, night ? 'Natt' : 'Dag', 'start', 13, { 'font-weight': 'bold' }));
  ground(els, base, x0, x0 + w, 30);
  const bx = x0 + 6;
  const bw = w - 12;
  if (!night) {
    for (const [, lo, hi, name, ht] of DAY) {
      els.push(band(bx, y(hi), bw, y(lo) - y(hi)));
      els.push(lbl(bx + 8, (y(lo) + y(hi)) / 2 + 1, name, 'start', 13, { 'font-weight': 'bold' }));
      if (showHeights) els.push(lbl(bx + bw - 8, (y(lo) + y(hi)) / 2 + 1, ht, 'end', 12));
    }
    return 'Dag: fire lag. D-laget nederst' + (showHeights ? ' (70–80 km)' : '') + ', så E-laget' + (showHeights ? ' (ca. 120 km)' : '')
      + ', F1-laget' + (showHeights ? ' (ca. 200 km)' : '') + ' og F2-laget øverst' + (showHeights ? ' (300–400 km)' : '') + '.';
  }
  // night: D gone, E weak, F1 and F2 one layer
  els.push(band(bx, y(90), bw, y(60) - y(90), true));
  els.push(lbl(bx + 8, y(75) + 1, 'D: borte', 'start', 12));
  els.push(band(bx, y(130), bw, y(110) - y(130), true));
  els.push(lbl(bx + 8, y(120) + 1, 'E: svakt', 'start', 12));
  els.push(band(bx, y(380), bw, y(230) - y(380)));
  els.push(lbl(bx + 8, y(305) + 1, 'F', 'start', 13, { 'font-weight': 'bold' }));
  if (showHeights) els.push(lbl(bx + bw - 8, y(305) + 1, 'F1 og F2 i ett', 'end', 12));
  return 'Natt: D-laget er borte (stiplet omriss), E-laget er svakt (stiplet), og F1 og F2 har slått seg sammen til ett F-lag.';
}

function layers(els, p) {
  const base = 290;
  const parts = [];
  if (p.compare) {
    parts.push(layerPanel(els, 0, W / 2 - 6, 'day', p.show_heights, base));
    parts.push(layerPanel(els, W / 2 + 6, W / 2 - 6, 'night', p.show_heights, base));
  } else {
    parts.push(layerPanel(els, 0, W, p.time, p.show_heights, base));
  }
  els.push(lbl(W / 2, base + 18, 'jordoverflaten', 'middle', 12));
  return { height: base + 30, desc: `Ionosfæren sett fra siden, med bakken nederst. ${parts.join(' ')}` };
}

// --- sky wave ----------------------------------------------------------------------

function skyWave(els, p) {
  const X0 = 40;
  const X1 = W - 14;
  const top = 18;
  const yL = 74; // the layer's reflecting height
  const base = 236;
  const kx = (X1 - X0) / p.range_km;
  const segs = [];
  // the layer
  els.push(band(0, yL - 18, W, 36));
  ground(els, base);
  mast(els, X0, base);
  segs.push([X0, base, X0, base - 30]);

  const returns = (e) => p.f_mhz <= p.fc_mhz / Math.sin(rad(e));
  const angles = [...p.angles].sort((a, b) => b - a);
  const landed = [];
  const escaped = [];
  for (const e of angles) {
    const half = p.layer_km / Math.tan(rad(e)); // ground distance to the reflection point
    const ax = X0 + half * kx;
    const clipUp = (x) => [x, base - ((x - X0) / (ax - X0)) * (base - yL)];
    if (returns(e)) {
      const d = 2 * half;
      landed.push([e, d]);
      if (ax >= X1) { ray(els, segs, [[X0, base], clipUp(X1)]); continue; }
      const lx = X0 + d * kx;
      if (lx <= X1) {
        ray(els, segs, [[X0, base], [ax, yL], [lx, base]]);
        els.push(arrowHead(lx, base, lx - ax, base - yL, 9));
      } else {
        const cy = yL + ((X1 - ax) / (lx - ax)) * (base - yL);
        ray(els, segs, [[X0, base], [ax, yL], [X1, cy]]);
      }
    } else {
      escaped.push(e);
      // through the layer and on out
      const t = (base - top) / (base - yL);
      let ex = X0 + (ax - X0) * t;
      let ey = top;
      if (ex > X1) { [ex, ey] = clipUp(X1); }
      ray(els, segs, [[X0, base], [ex, ey]], { 'stroke-dasharray': '7 4' });
      els.push(arrowHead(ex, ey, ex - X0, ey - base, 9));
    }
  }
  // ground wave along the surface
  // the ground wave is drawn at least 26 px long so it can be seen (not to scale)
  const gx = p.ground_wave_km > 0 ? Math.max(X0 + p.ground_wave_km * kx, X0 + 26) : X0;
  if (p.ground_wave_km > 0) {
    let d = `M ${X0} ${base - 5}`;
    for (let x = X0; x < gx; x += 8) d += ` Q ${Math.min(x + 4, gx)} ${base - 9} ${Math.min(x + 8, gx)} ${base - 5}`;
    els.push(h('path', { d, fill: 'none', stroke: STROKE, 'stroke-width': 2 }));
  }
  // the skip zone: from the end of the ground wave to the nearest landing
  const dSkip = p.f_mhz <= p.fc_mhz ? 0 : 2 * p.layer_km * Math.sqrt((p.f_mhz / p.fc_mhz) ** 2 - 1);
  const skipEnd = Math.min(dSkip, p.range_km);
  const hasSkip = p.show_skip && skipEnd > p.ground_wave_km;
  if (hasSkip) {
    const sx = Math.max(X0 + skipEnd * kx, gx + 20);
    els.push(shade(gx, base - 14, sx - gx, 14, 0.3, 1, { sw: 1, dash: '3 3' }));
    const txt = 'skip-sone (dødsone)';
    const cx = Math.max((gx + sx) / 2, X0 + 8 + textBox(0, 0, txt, 'middle').w / 2 + 70);
    els.push(lbl(Math.min(cx, W - textBox(0, 0, txt, 'middle').w / 2 - 4), base + 18, txt, 'middle', 12));
  }
  if (p.ground_wave_km > 0) els.push(lbl(X0 - 8, base + 18, 'jordbølge', 'start', 12));
  if (p.show_freq) els.push(lbl(X0 - 8, base + 38, `f = ${mhz(p.f_mhz)}, kritisk frekvens ${mhz(p.fc_mhz)}`, 'start', 12));
  // layer label where no ray is in the way
  const lname = `${LAYER_NAME[p.layer]} (${km(p.layer_km)})`;
  place(els, segs, lname, [[W - 10, yL + 1, 'end'], [W - 10, yL - 9, 'end'], [W - 10, yL + 11, 'end'], [W / 2, yL + 1, 'middle'], [X0 + 60, yL + 1, 'start']], 12, { 'font-weight': 'bold' });
  if (escaped.length) place(els, segs, 'går gjennom laget', [[W - 10, top + 6, 'end'], [W / 2 + 60, top + 6, 'middle'], [W / 2, top + 6, 'middle']]);
  if (landed.length) place(els, segs, 'bøyes tilbake', [[W - 10, base - 26, 'end'], [W - 10, yL + 46, 'end'], [W / 2, yL + 46, 'middle'], [X0 + 90, base - 40, 'start']]);

  const desc = [`Sideriss, ikke i skala. En sender står til venstre på bakken, og ${LAYER_NAME[p.layer]} ligger ${km(p.layer_km)} over bakken.`];
  if (p.show_freq) desc.push(`Frekvensen er ${mhz(p.f_mhz)}, og lagets kritiske frekvens er ${mhz(p.fc_mhz)}.`);
  if (p.ground_wave_km > 0) desc.push(`Jordbølgen følger bakken de første ${km(p.ground_wave_km)}.`);
  desc.push(`Stråler går opp mot laget med vinklene ${listNo(angles.map((e) => `${formatNumber(e)}°`))} over horisonten.`);
  if (landed.length) {
    desc.push(`${landed.length === 1 ? 'Strålen' : 'Strålene'} med ${listNo(landed.map(([e]) => `${formatNumber(e)}°`))} bøyes tilbake og kommer ned ${listNo(landed.map(([, d]) => (d > p.range_km ? `over ${km(p.range_km)}` : `ca. ${km(roundKm(d))}`)))} unna${landed.length > 1 ? ', de flateste lengst unna' : ''}.`);
  }
  if (escaped.length) desc.push(`${escaped.length === 1 ? 'Strålen' : 'Strålene'} med ${listNo(escaped.map((e) => `${formatNumber(e)}°`))} går gjennom laget og forsvinner ut i rommet (stiplet).`);
  if (!landed.length) desc.push('Ingen stråler kommer tilbake til bakken.');
  if (hasSkip) desc.push(`Fra der jordbølgen tar slutt og ut til ${dSkip > p.range_km ? `over ${km(p.range_km)}` : `ca. ${km(roundKm(dSkip))}`} kommer ingen signaler ned: dette skyggelagte området er skip-sonen (dødsonen).`);
  return { height: base + (p.show_freq ? 50 : 30), desc: desc.join(' ') };
}

// --- hops ----------------------------------------------------------------------------

function hops(els, p) {
  const X0 = 30;
  const X1 = W - 30;
  const yL = 70;
  const base = 210;
  const hop = (2 * p.layer_km) / Math.tan(rad(p.elevation_deg));
  const step = (X1 - X0) / p.hops;
  const segs = [];
  els.push(band(0, yL - 16, W, 32));
  ground(els, base);
  mast(els, X0, base);
  mast(els, X1, base);
  segs.push([X0, base, X0, base - 30], [X1, base, X1, base - 30]);
  const pts = [[X0, base]];
  for (let i = 0; i < p.hops; i++) pts.push([X0 + step * (i + 0.5), yL], [X0 + step * (i + 1), base]);
  ray(els, segs, pts);
  els.push(arrowHead(X1, base, step / 2, base - yL, 9));
  for (let i = 1; i < p.hops; i++) els.push(h('circle', { cx: X0 + step * i, cy: base, r: 4, fill: STROKE }));
  place(els, segs, `${LAYER_NAME[p.layer]} (${km(p.layer_km)})`, [[X0 + step / 2 - 14, yL + 1, 'end'], [X0 + 4, yL + 1, 'start'], [W - 4, yL + 1, 'end'], [W / 2, yL + 26, 'middle']], 12, { 'font-weight': 'bold' });
  els.push(lbl(X0, base + 18, 'sender', 'start', 12), lbl(X1, base + 18, 'mottaker', 'end', 12));
  const dist = roundKm(hop);
  if (p.show_distance) {
    for (let i = 0; i < p.hops; i++) els.push(lbl(X0 + step * (i + 0.5), base + 38, `ca. ${km(dist)}`, 'middle', 12));
  }
  const desc = [`Sideriss, ikke i skala. En stråle går fra en sender til venstre opp til ${LAYER_NAME[p.layer]}, ${km(p.layer_km)} over bakken, og bøyes ned igjen.`];
  if (p.hops > 1) desc.push(`Den reflekteres fra bakken og gjør til sammen ${formatNumber(p.hops)} hopp før den når mottakeren til høyre.`);
  else desc.push('Den kommer ned hos mottakeren til høyre etter ett hopp.');
  if (p.show_distance) desc.push(`Hvert hopp er ca. ${km(dist)} langt${p.hops > 1 ? `, til sammen ca. ${km(roundKm(hop * p.hops))}` : ''}.`);
  return { height: base + (p.show_distance ? 50 : 30), desc: desc.join(' ') };
}

// --- horizon -------------------------------------------------------------------------

function horizon(els, p) {
  const d1 = 4 * Math.sqrt(p.h1_m);
  const d2 = 4 * Math.sqrt(p.h2_m);
  const R = 480;
  const k = 200 / Math.max(d1, d2); // px per km along the arc
  const cx = W / 2 - ((d2 - d1) * k) / 2 * 0.9;
  const yTop = 70;
  const cy = yTop + R;
  const at = (s, extra = 0) => {
    const th = s / R;
    return [cx + Math.sin(th) * (R + extra), cy - Math.cos(th) * (R + extra)];
  };
  // the earth's surface
  const th0 = Math.asin(Math.min(1, (cx + 10) / R));
  const th1 = Math.asin(Math.min(1, (W - cx + 10) / R));
  const [sx, sy] = [cx - Math.sin(th0) * R, cy - Math.cos(th0) * R];
  const [ex, ey] = [cx + Math.sin(th1) * R, cy - Math.cos(th1) * R];
  const earth = `M ${sx} ${sy} A ${R} ${R} 0 0 1 ${ex} ${ey} L ${ex} 250 L ${sx} 250 Z`;
  els.push(h('path', { d: earth, fill: STROKE, opacity: 0.08, stroke: 'none' }), h('path', { d: `M ${sx} ${sy} A ${R} ${R} 0 0 1 ${ex} ${ey}`, fill: 'none', stroke: STROKE, 'stroke-width': 2 }));
  const s1 = -d1 * k;
  const s2 = d2 * k;
  // each mast just reaches the common horizon point: its top lies on the tangent there
  const top = (s) => R / Math.cos(s / R) - R;
  const [a0, a1] = [at(s1), at(s1, top(s1))];
  const [b0, b1] = [at(s2), at(s2, top(s2))];
  els.push(line(...a0, ...a1, { 'stroke-width': 3 }), line(...b0, ...b1, { 'stroke-width': 3 }));
  els.push(line(...a1, cx, yTop, { 'stroke-dasharray': '6 4', 'stroke-width': 1.6 }), line(cx, yTop, ...b1, { 'stroke-dasharray': '6 4', 'stroke-width': 1.6 }));
  els.push(h('circle', { cx, cy: yTop, r: 4, fill: STROKE }));
  els.push(lbl(cx, yTop - 16, 'radiohorisont', 'middle', 12));
  els.push(lbl(a1[0] - 8, a1[1] - 4, `${formatNumber(p.h1_m)} m`, 'end', 12), lbl(b1[0] + 8, b1[1] - 4, `${formatNumber(p.h2_m)} m`, 'start', 12));
  els.push(lbl(a0[0], a0[1] + 44, 'stasjon 1', 'middle', 12), lbl(b0[0], b0[1] + 44, 'stasjon 2', 'middle', 12));
  if (p.show_distance) {
    const m1 = at(s1 / 2);
    const m2 = at(s2 / 2);
    els.push(lbl(m1[0], m1[1] + 18, `ca. ${km(Math.round(d1 * 10) / 10)}`, 'middle', 12), lbl(m2[0], m2[1] + 18, `ca. ${km(Math.round(d2 * 10) / 10)}`, 'middle', 12));
  }
  const desc = [`Jorda tegnet som en bue med sterkt overdrevet krumning. Stasjon 1 til venstre har antennen ${formatNumber(p.h1_m)} m over bakken, stasjon 2 til høyre ${formatNumber(p.h2_m)} m.`,
    'Fra hver antennetopp går en stiplet linje som så vidt berører jordoverflaten i ett felles punkt, radiohorisonten mellom dem. Lenger fra hverandre skjuler jordkrumningen stasjonene for hverandre.'];
  if (p.show_distance) desc.push(`Med d ≈ 4 · √h er horisonten ca. ${km(Math.round(d1 * 10) / 10)} unna for stasjon 1 og ca. ${km(Math.round(d2 * 10) / 10)} for stasjon 2, til sammen ca. ${km(Math.round((d1 + d2) * 10) / 10)}.`);
  return { height: 250, desc: desc.join(' ') };
}

// --- duct, aurora, knife edge ------------------------------------------------------

function duct(els) {
  const X0 = 40;
  const X1 = W - 40;
  const base = 220;
  const yD = 170; // top of the duct
  const segs = [];
  els.push(shade(0, yD, W, base - yD, 0.12, 0.5, { dash: '5 4' }));
  // the sea: wavy surface
  let d = `M 0 ${base}`;
  for (let x = 0; x < W; x += 20) d += ` q 5 -4 10 0 t 10 0`;
  els.push(h('path', { d: `${d} L ${W} ${base + 46} L 0 ${base + 46} Z`, fill: STROKE, opacity: 0.08, stroke: 'none' }), h('path', { d, fill: 'none', stroke: STROKE, 'stroke-width': 2 }));
  mast(els, X0, base);
  mast(els, X1, base);
  segs.push([X0, base, X0, base - 30], [X1, base, X1, base - 30]);
  const n = 5;
  const trapped = [[X0, base - 24]];
  // bend smoothly: up to the top of the duct and back down to the surface, n times
  for (let i = 0; i < n; i++) {
    const xa = X0 + ((X1 - X0) * i) / n;
    const xb = X0 + ((X1 - X0) * (i + 1)) / n;
    trapped.push([(xa + xb) / 2, yD + 4], [xb, base - 4]);
  }
  trapped[trapped.length - 1] = [X1, base - 24];
  ray(els, segs, trapped);
  els.push(arrowHead(X1, base - 24, 1, 0.6, 9));
  // a steeper ray leaves the duct
  ray(els, segs, [[X0, base - 24], [X0 + 150, 30]], { 'stroke-dasharray': '7 4' });
  els.push(arrowHead(X0 + 150, 30, 150, -(base - 54), 9));
  place(els, segs, 'varmt eller fuktig luftlag (dukt)', [[W / 2, yD - 12, 'middle'], [W - 10, yD - 12, 'end']]);
  place(els, segs, 'brattere stråle slipper ut', [[X0 + 160, 40, 'start'], [X0 + 170, 70, 'start']]);
  els.push(lbl(W / 2, base + 26, 'havet', 'middle', 12));
  return { height: base + 46, desc: 'Sideriss, ikke i skala. Over havet ligger et lavt lag av varm eller fuktig luft (stiplet). En sender til venstre sender en flat stråle som bøyes ned igjen hver gang den når toppen av laget, og som slik følges laget helt fram til en mottaker langt unna til høyre. En brattere stråle går gjennom laget og forsvinner opp (stiplet).' };
}

function aurora(els) {
  const base = 230;
  const segs = [];
  ground(els, base);
  // the aurora: vertical wavy curtains high up to the north (right)
  for (let i = 0; i < 6; i++) {
    const x = 400 + i * 22;
    els.push(h('path', { d: `M ${x} 30 q 8 25 0 50 t 0 50`, fill: 'none', stroke: STROKE, 'stroke-width': 2, opacity: 0.75 }));
  }
  const s1 = 50;
  const s2 = 200;
  mast(els, s1, base);
  mast(els, s2, base);
  segs.push([s1, base, s1, base - 30], [s2, base, s2, base - 30]);
  ray(els, segs, [[s1, base - 26], [410, 95], [s2, base - 26]]);
  els.push(arrowHead(s2, base - 26, s2 - 410, base - 26 - 95, 9));
  ray(els, segs, [[s2, base - 26], [440, 110]], { 'stroke-dasharray': '7 4' });
  els.push(arrowHead(440, 110, 440 - s2, 110 - base + 26, 9));
  place(els, segs, 'nordlys (ionisert område)', [[W - 10, 18, 'end'], [470, 150, 'middle']]);
  els.push(lbl(s1, base + 18, 'stasjon 1', 'middle', 12), lbl(s2, base + 18, 'stasjon 2', 'middle', 12));
  els.push(line(400, base + 20, 520, base + 20, { 'stroke-width': 1.6 }), arrowHead(528, base + 20, 1, 0, 8), lbl(400, base + 38, 'nord', 'start', 12));
  return { height: base + 50, desc: 'Sideriss, ikke i skala. Nordlyset henger som gardiner høyt oppe mot nord (til høyre). To stasjoner lenger sør (til venstre) retter begge antennene nordover mot nordlyset. Signalet fra stasjon 1 går opp til det ioniserte området og spres tilbake ned til stasjon 2, og stasjon 2 sender likeledes mot nord (stiplet).' };
}

function knifeEdge(els, p) {
  const base = 220;
  const segs = [];
  ground(els, base);
  const [px, py] = [W / 2, 60];
  const ridge = `${px - 150},${base} ${px},${py} ${px + 150},${base}`;
  els.push(h('polygon', { points: ridge, fill: STROKE, opacity: 0.18, stroke: 'none' }), h('polygon', { points: ridge, fill: 'none', stroke: STROKE, 'stroke-width': 2, 'stroke-linejoin': 'miter' }));
  const [tx, rx] = [40, W - 40];
  mast(els, tx, base);
  mast(els, rx, base);
  segs.push([tx, base, tx, base - 30], [rx, base, rx, base - 30], [px - 150, base, px, py], [px, py, px + 150, base]);
  // the direct path is blocked by the ridge
  ray(els, segs, [[tx, base - 26], [px - 75, (base + py) / 2 + 4]], { 'stroke-dasharray': '4 4', 'stroke-width': 1.6 });
  els.push(lbl(tx, base + 18, 'stasjon 1', 'middle', 12), lbl(rx, base + 18, 'stasjon 2', 'middle', 12));
  const desc = ['Sideriss, ikke i skala. To stasjoner står på hver sin side av en fjellrygg med skarp topp, og ryggen stenger for den rette linjen mellom dem (stiplet linje som stopper i fjellsiden).'];
  if (p.show_diffraction) {
    ray(els, segs, [[tx, base - 26], [px, py - 2]]);
    for (const [ex, ey] of [[rx, base - 26], [px + 120, base - 50], [px + 200, base - 90], [px + 230, py + 40]]) {
      ray(els, segs, [[px, py - 2], [ex, ey]], ex === rx ? {} : { 'stroke-dasharray': '7 4' });
      els.push(arrowHead(ex, ey, ex - px, ey - py, 9));
    }
    place(els, segs, 'bølgene bøyes over kanten', [[px, py - 22, 'middle'], [px + 10, 30, 'start']]);
    desc.push('Bølgen som treffer den skarpe toppen, spres i flere retninger på baksiden av kanten, også ned i skyggen bak fjellet, og når fram til stasjon 2.');
  } else {
    place(els, segs, 'fjellrygg med skarp topp', [[px, py - 22, 'middle']]);
  }
  return { height: base + 30, desc: desc.join(' ') };
}

const DRAW = { layers, sky_wave: skyWave, hops, horizon, duct, aurora, knife_edge: knifeEdge };
const TITLE = { layers: 'Ionosfærens lag', sky_wave: 'Ionosfærebølge og jordbølge', hops: 'Hopp via ionosfæren', horizon: 'Radiohorisont', duct: 'Dukting', aurora: 'Aurora', knife_edge: 'Diffraksjon over en fjellkant' };

function render(p) {
  const els = [];
  if (p.blank) {
    if (p.note) els.push(lbl(W / 2, 60, p.note, 'middle', 14, { opacity: 0.75 }));
    const description = `${TITLE[p.kind]}. ${p.note || ''}`.trim();
    return { svg: svgRoot(W, 120, TITLE[p.kind], description, els, {}, 0, 0), description, animatable: false };
  }
  const { height, desc } = DRAW[p.kind](els, p);
  return { svg: svgRoot(W, height, TITLE[p.kind], desc, els, {}, 0, 0), description: desc, animatable: false };
}

// the assumption under the figure, trimmed to what each kind draws
function idealised(p, text) {
  if (p.kind === 'sky_wave' || p.kind === 'hops') return text;
  if (p.kind === 'horizon') return 'Forenklet tegning med sterkt overdrevet jordkrumning; d ≈ 4 · √h km er en tommelfingerregel.';
  return 'Forenklet sideriss, ikke i skala.';
}

export default { id: 'propagation', version: 1, rules, quantities: () => ({}), render, idealised };
