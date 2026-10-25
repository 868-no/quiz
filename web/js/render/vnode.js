// Minimal virtual-node layer. Renderers build plain data ({t, a, c}); only this
// module creates DOM, and it does so from an allowlist of tags and attributes
// using text nodes, never innerHTML. The same trees can be serialised to an
// escaped string (used by tests and for static fallbacks).

const SVG_NS = 'http://www.w3.org/2000/svg';

const HTML_TAGS = new Set([
  'div', 'span', 'p', 'ol', 'ul', 'li', 'em', 'strong', 'sub', 'sup', 'var', 'button', 'figure',
  'figcaption', 'details', 'summary', 'section', 'h1', 'h2', 'h3', 'h4', 'small', 'abbr', 'br', 'input',
  'label', 'select', 'option', 'fieldset', 'legend', 'progress', 'table', 'caption', 'thead', 'tbody', 'tr',
  'th', 'td', 'form', 'i', 'b', 'a', 'dialog',
]);
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse', 'text', 'tspan',
  'title', 'desc', 'defs', 'marker', 'pattern',
]);
const ATTR_OK = /^(class|id|role|tabindex|type|lang|title|hidden|href|rel|target|name|value|checked|disabled|for|selected|max|min|scope|open|autocomplete|novalidate|viewBox|width|height|x|y|dx|dy|x1|y1|x2|y2|cx|cy|r|rx|ry|d|points|fill|stroke|stroke-width|stroke-dasharray|stroke-linecap|stroke-linejoin|font-size|font-weight|font-style|text-anchor|dominant-baseline|transform|marker-end|marker-start|markerWidth|markerHeight|refX|refY|orient|preserveAspectRatio|pathLength|focusable|patternUnits|opacity|baseline-shift|aria-[a-z]+|data-[a-z-]+)$/;

/** Create a vnode. Children may be strings, numbers, vnodes, arrays, null/false (skipped). */
export function h(t, a = {}, ...children) {
  return { t, a: a || {}, c: flatten(children) };
}

function flatten(children) {
  const out = [];
  for (const ch of children) {
    if (ch === null || ch === undefined || ch === false) continue;
    if (Array.isArray(ch)) out.push(...flatten(ch));
    else if (typeof ch === 'number') out.push(String(ch));
    else out.push(ch);
  }
  return out;
}

// Links may only point to the project's GitHub pages (issue reporting), the
// community's home page (https://868.no) or a question on this page (#q-0045).
const HREF_OK = /^(https:\/\/github\.com\/[^\s"<>]*|https:\/\/868\.no\/?|#q-\d+)$/;

function checkNode(node) {
  if (!HTML_TAGS.has(node.t) && !SVG_TAGS.has(node.t)) throw new Error(`tag not allowed: ${node.t}`);
  if ('href' in node.a && !HREF_OK.test(String(node.a.href))) throw new Error(`link not allowed: ${node.a.href}`);
  for (const k of Object.keys(node.a)) {
    if (!ATTR_OK.test(k)) throw new Error(`attribute not allowed: ${k}`);
  }
}

/** Build real DOM nodes (browser only). */
export function toDOM(node, doc = globalThis.document, inSvg = false) {
  if (typeof node === 'string') return doc.createTextNode(node);
  checkNode(node);
  const svg = inSvg || node.t === 'svg';
  const el = svg ? doc.createElementNS(SVG_NS, node.t) : doc.createElement(node.t);
  for (const [k, v] of Object.entries(node.a)) {
    if (v === false || v === null || v === undefined) continue;
    el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const ch of node.c) el.appendChild(toDOM(ch, doc, svg));
  return el;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeText = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);

/** Serialise to an escaped markup string. */
export function toString(node) {
  if (typeof node === 'string') return escapeText(node);
  checkNode(node);
  const attrs = Object.entries(node.a)
    .filter(([, v]) => v !== false && v !== null && v !== undefined)
    .map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${escapeText(v)}"`))
    .join('');
  const ns = node.t === 'svg' ? ` xmlns="${SVG_NS}"` : '';
  if (node.t === 'br') return '<br>';
  return `<${node.t}${ns}${attrs}>${node.c.map(toString).join('')}</${node.t}>`;
}

/** Concatenated text content (for tests and accessible names). */
export function textContent(node) {
  if (typeof node === 'string') return node;
  return node.c.map(textContent).join('');
}

/** Depth-first search helper for tests. */
export function findAll(node, pred, out = []) {
  if (typeof node === 'string') return out;
  if (pred(node)) out.push(node);
  for (const ch of node.c) findAll(ch, pred, out);
  return out;
}
