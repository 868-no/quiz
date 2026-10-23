// block-diagram@1: a left-to-right signal chain of labelled blocks (wrapping after
// five blocks) with optional side blocks feeding into chain blocks.

import { h } from '../render/vnode.js';
import { arrowHead, label, svgRoot, wire, STROKE } from './svg.js';

const PER_ROW = 5;
const BW = 112;
const MAX_CHARS = 14;

function rules(p) {
  const errors = [];
  const n = p.chain.length;
  [...p.chain, ...p.side].forEach((b, i) => {
    if (b.kind === 'custom' && !b.label) errors.push(`block ${i}: kind 'custom' needs a label`);
  });
  p.side.forEach((s, i) => { if (s.into >= n) errors.push(`side[${i}].into: no chain block ${s.into}`); });
  p.edge_labels.forEach((e, i) => { if (e.after >= n - 1) errors.push(`edge_labels[${i}].after: no connection after block ${e.after}`); });
  return errors;
}

function blockText(b, tpl) {
  if (b.hidden) return '?';
  return b.label || (tpl && tpl.kind_labels && tpl.kind_labels[b.kind]) || b.kind;
}

export function wrapLabel(text) {
  const words = text.replace(/-/g, '-\u0000').split(/[\s\u0000]+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const sep = cur && !cur.endsWith('-') ? ' ' : '';
    if (cur && (cur + sep + w).length > MAX_CHARS) {
      lines.push(cur);
      cur = w;
    } else cur += sep + w;
  }
  if (cur) lines.push(cur);
  const longest = Math.max(...lines.map((l) => l.length));
  const fontSize = longest > MAX_CHARS ? Math.max(9, (12.5 * MAX_CHARS) / longest) : 12.5;
  return { lines, fontSize };
}

function blockNode(x, y, b, text, height, wrap) {
  const strokeW = b.highlight ? 4 : 2;
  const els = [h('rect', {
    x, y, width: BW, height, rx: 6, fill: 'var(--fig-bg)', stroke: STROKE, 'stroke-width': strokeW,
    'stroke-dasharray': b.hidden ? '6 4' : null, class: b.highlight ? 'blk blk-hl' : 'blk',
  })];
  const top = y + height / 2 - ((wrap.lines.length - 1) * wrap.fontSize * 1.15) / 2;
  wrap.lines.forEach((ln, i) => {
    els.push(label(x + BW / 2, top + i * wrap.fontSize * 1.15, ln, {
      'font-size': b.hidden ? 20 : wrap.fontSize, 'font-weight': b.highlight || b.hidden ? 'bold' : null,
    }));
  });
  return h('g', {}, els);
}

function heightFor(wrap) {
  return Math.max(46, wrap.lines.length * wrap.fontSize * 1.15 + 20);
}

function render(p, tpl) {
  const n = p.chain.length;
  // gap wide enough for the longest edge label (about 6,5 px per character at 11 px)
  const G = p.edge_labels.length ? Math.max(58, Math.ceil(Math.max(...p.edge_labels.map((e) => e.text.length)) * 6.5) + 16) : 38;
  const rows = Math.ceil(n / PER_ROW);
  const perRow = Math.ceil(n / rows); // balance the rows (6 -> 3 + 3, not 5 + 1)
  const cols = Math.min(n, perRow);
  const W = 24 + cols * BW + (cols - 1) * G + 24;
  const texts = p.chain.map((b) => blockText(b, tpl));
  const wraps = texts.map(wrapLabel);
  const sideWraps = p.side.map((s) => wrapLabel(blockText(s, tpl)));
  const els = [];
  const pos = [];
  let y = 22;
  for (let r = 0; r < rows; r++) {
    const idx = [...Array(Math.min(perRow, n - r * perRow)).keys()].map((k) => r * perRow + k);
    const rowH = Math.max(...idx.map((i) => heightFor(wraps[i])));
    idx.forEach((i, k) => { pos[i] = { x: 24 + k * (BW + G), y: y + (rowH - heightFor(wraps[i])) / 2, hgt: heightFor(wraps[i]), mid: y + rowH / 2, row: r }; });
    const sides = p.side.map((s, j) => [s, j]).filter(([s]) => idx.includes(s.into));
    const sideH = sides.length ? Math.max(...sides.map(([, j]) => heightFor(sideWraps[j]))) + 46 : 0;
    sides.forEach(([s, j]) => {
      const t = pos[s.into];
      const sy = y + rowH + 46;
      const sh = heightFor(sideWraps[j]);
      els.push(blockNode(t.x, sy, s, blockText(s, tpl), sh, sideWraps[j]));
      els.push(wire([[t.x + BW / 2, sy], [t.x + BW / 2, t.y + t.hgt + 9]]), arrowHead(t.x + BW / 2, t.y + t.hgt, 0, -1));
    });
    idx.forEach((i) => { pos[i].rowBottom = y + rowH + sideH; });
    y += rowH + sideH + 52;
  }
  const H = y - 52 + 30;
  p.chain.forEach((b, i) => els.push(blockNode(pos[i].x, pos[i].y, b, texts[i], pos[i].hgt, wraps[i])));
  for (let i = 0; i < n - 1; i++) {
    const a = pos[i];
    const b = pos[i + 1];
    let lx;
    let ly;
    if (a.row === b.row) {
      els.push(wire([[a.x + BW, a.mid], [b.x - 9, b.mid]]), arrowHead(b.x, b.mid, 1, 0));
      lx = (a.x + BW + b.x) / 2;
      ly = a.mid - 12;
    } else {
      const chY = a.rowBottom + 26;
      els.push(wire([[a.x + BW, a.mid], [a.x + BW + 14, a.mid], [a.x + BW + 14, chY], [b.x - 14, chY], [b.x - 14, b.mid], [b.x - 9, b.mid]]),
        arrowHead(b.x, b.mid, 1, 0));
      lx = a.x + BW - 24;
      ly = chY - 10;
    }
    const el = p.edge_labels.find((e) => e.after === i);
    if (el) els.push(label(lx, ly, el.text, { 'font-size': 11 }));
  }
  const say = (b, t) => (b.hidden ? 'ukjent blokk (?)' : t) + (b.highlight ? ' (fremhevet)' : '');
  let description = `Blokkskjema der signalet går fra venstre mot høyre: ${p.chain.map((b, i) => say(b, texts[i])).join(' → ')}.`;
  p.side.forEach((s) => {
    description += ` ${say(s, blockText(s, tpl))} er koblet inn i ${say(p.chain[s.into], texts[s.into])}.`;
  });
  p.edge_labels.forEach((e) => {
    description += ` Mellom ${say(p.chain[e.after], texts[e.after])} og ${say(p.chain[e.after + 1], texts[e.after + 1])}: ${e.text}.`;
  });
  return { svg: svgRoot(W, H, 'Blokkskjema', description, els), description, animatable: false };
}

export default { id: 'block-diagram', version: 1, rules, quantities: () => ({}), render };
