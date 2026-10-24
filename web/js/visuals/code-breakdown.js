// code-breakdown@1: a short code (call sign, emission designator, signal report) split
// into parts, each in its own box with a bracket and a label underneath. A part's label
// can be hidden ('?') until after answering, so the figure can ask what one part means.

import { h } from '../render/vnode.js';
import { label, line, svgRoot, STROKE } from './svg.js';

const CODE_FS = 30;
const CHAR_W = 21; // bold capitals and digits at 30 px (proportional font: allow for wide letters)
const LABEL_FS = 14;
const LABEL_CHARS = 11; // per line: narrow columns keep the text large on phones
const MIN_COL = 84;
const MIN_W = 480; // a short code is centred, not blown up
const GAP = 10;
const LINE = LABEL_FS * 1.6; // room for the 15 % larger text on phones

function rules(p) {
  const errors = [];
  if (p.parts.reduce((n, x) => n + x.text.length, 0) > 16) errors.push('parts: the whole code is at most 16 characters');
  p.parts.forEach((x, i) => {
    if (x.hidden && !x.label) errors.push(`parts[${i}].label: a hidden part needs a label to show after answering`);
  });
  if (!p.parts.some((x) => x.label)) errors.push('parts: at least one part needs a label');
  return errors;
}

/** Split a label into lines of at most LABEL_CHARS characters (longer words stay whole). */
export function wrapLines(text) {
  const lines = [];
  let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && (`${cur} ${w}`).length > LABEL_CHARS) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

function render(p) {
  const cols = p.parts.map((x) => {
    const lines = x.hidden ? ['?'] : wrapLines(x.label);
    const labelW = Math.max(0, ...lines.map((l) => l.length)) * 8.6 + 12;
    const boxW = x.text.length * CHAR_W + 22;
    return { x, lines, boxW, w: Math.max(MIN_COL, boxW, labelW) };
  });
  const inner = cols.reduce((s, c) => s + c.w, 0) + GAP * (cols.length - 1);
  const W = Math.max(MIN_W, inner + 40);
  const maxLines = Math.max(1, ...cols.map((c) => c.lines.length));
  const top = 16;
  const boxH = 50;
  const bracketY = top + boxH + 12;
  const labelY = bracketY + 26;
  const H = labelY + (maxLines - 1) * LINE + 24;
  const els = [];
  let x0 = (W - inner) / 2;
  for (const c of cols) {
    const cx = x0 + c.w / 2;
    const bx = cx - c.boxW / 2;
    const strong = c.x.highlight;
    els.push(h('rect', {
      x: bx, y: top, width: c.boxW, height: boxH, rx: 6, fill: 'var(--fig-bg)', stroke: STROKE,
      'stroke-width': strong ? 4 : 2,
    }));
    els.push(label(cx, top + boxH / 2 + 1, c.x.text, {
      'font-size': CODE_FS, 'font-weight': 'bold',
    }));
    // bracket under the box: down from both ends, joined, with a tick in the middle
    const b0 = bx + 4;
    const b1 = bx + c.boxW - 4;
    const dash = c.x.hidden ? { 'stroke-dasharray': '5 4' } : {};
    els.push(h('polyline', {
      points: `${b0},${bracketY - 6} ${b0},${bracketY} ${b1},${bracketY} ${b1},${bracketY - 6}`,
      fill: 'none', stroke: STROKE, 'stroke-width': 1.6, ...dash,
    }));
    els.push(line(cx, bracketY, cx, bracketY + 7, { 'stroke-width': 1.6 }));
    c.lines.forEach((ln, i) => {
      els.push(label(cx, labelY + i * LINE, ln, {
        'font-size': c.x.hidden ? 18 : LABEL_FS, 'font-weight': c.x.hidden || strong ? 'bold' : null,
      }));
    });
    x0 += c.w + GAP;
  }
  const code = p.parts.map((x) => x.text).join('');
  const say = (x) => `«${x.text}»${x.highlight ? ' (fremhevet)' : ''}: ${x.hidden ? 'betydningen vises etter at du har svart (?)' : x.label || 'uten forklaring'}`;
  const description = `Koden «${code}» delt opp i ${p.parts.length === 1 ? 'én del' : `${p.parts.length} deler`}, med en forklaring under hver del. ${p.parts.map(say).join('; ')}.`;
  return { svg: svgRoot(W, H, 'Kode delt opp i deler', description, els), description, animatable: false };
}

export default { id: 'code-breakdown', version: 1, rules, quantities: () => ({}), render };
