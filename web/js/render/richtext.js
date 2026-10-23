// Renders structured rich text (see tools/richtext.py for the format) to vnodes.
// No markup in content is ever interpreted: strings become text nodes.

import { h } from './vnode.js';
import { formatNumber, formatQuantity, speakQuantity, speakUnit } from './format.js';

const OPERATORS = new Set(['=', '≈', '+', '−', '-', '·', '×', '/', '(', ')', '≠', '<', '>', '≤', '≥', '→', ',', '…', '%', '²', '³', '±']);
const MATH_ATOM = /^([A-Za-zÀ-ÖØ-öø-ÿΑ-Ωα-ωµ]+|\d+(?:[.,]\d+)?)(?:_([A-Za-z0-9α-ωæøå]+|\{[^{}]{1,16}\}))?(?:\^([−-]?[0-9A-Za-z]+|\{[^{}]{1,8}\}))?$/;
const OP_SPEECH = {
  '=': 'er lik', '≈': 'er omtrent lik', '+': 'pluss', '−': 'minus', '-': 'minus', '·': 'ganger', '×': 'ganger',
  '/': 'delt på', '(': 'parentes', ')': 'slutt parentes', '≠': 'er ikke lik', '<': 'er mindre enn',
  '>': 'er større enn', '≤': 'er mindre enn eller lik', '≥': 'er større enn eller lik', '→': 'gir', ',': ',',
  '…': 'og så videre', '%': 'prosent', '±': 'pluss minus', '²': 'i andre', '³': 'i tredje',
};
const GREEK_SPEECH = { 'Û': 'U topp', 'Î': 'I topp', 'π': 'pi', 'λ': 'lambda', 'Ω': 'ohm', 'µ': 'my', 'φ': 'fi', 'τ': 'tau', 'Δ': 'delta', 'η': 'eta', 'ω': 'omega' };

// 15000 -> 15 000 (narrow no-break space), as in Norwegian typesetting
const groupDigits = (n) => n.replace(/^(\d{5,})/, (m) => m.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'));
const strip = (s) => (s && s.startsWith('{') ? s.slice(1, -1) : s);

function speakAtom(base, sub, sup) {
  let s = /^\d/.test(base) ? base.replace('.', ',') : [...base].map((ch) => GREEK_SPEECH[ch] || ch).join(' ');
  if (sub) s += ' ' + strip(sub);
  if (sup) {
    const p = strip(sup).replace('−', '-');
    s += p === '2' ? ' i andre' : p === '3' ? ' i tredje' : ` opphøyd i ${p.replace('-', 'minus ')}`;
  }
  return s;
}

/** Returns {nodes, speech} for a math token list. */
export function renderMath(tokens) {
  const nodes = [];
  const speech = [];
  for (const tok of tokens) {
    if (typeof tok === 'string') {
      const m = OPERATORS.has(tok) ? null : MATH_ATOM.exec(tok);
      if (!m) {
        nodes.push(h('span', { class: 'm-op' }, tok === '-' ? '−' : tok));
        speech.push(OP_SPEECH[tok] || tok);
        continue;
      }
      const [, base, sub, sup] = m;
      const numeric = /^\d/.test(base);
      nodes.push(h(numeric ? 'span' : 'var', { class: numeric ? 'm-num' : 'm-var' },
        numeric ? groupDigits(base.replace('.', ',')) : base,
        sub ? h('sub', {}, strip(sub)) : null,
        sup ? h('sup', {}, strip(sup).replace('-', '−')) : null));
      speech.push(speakAtom(base, sub, sup));
    } else if ('q' in tok) {
      nodes.push(h('span', { class: 'm-num' }, formatQuantity(tok)));
      speech.push(speakQuantity(tok));
    } else if ('frac' in tok) {
      const num = renderMath(tok.frac[0]);
      const den = renderMath(tok.frac[1]);
      nodes.push(h('span', { class: 'm-frac' },
        h('span', { class: 'm-frac-num' }, num.nodes), h('span', { class: 'm-frac-den' }, den.nodes)));
      speech.push(`brøk, ${num.speech} delt på ${den.speech}, slutt brøk`);
    } else if ('sqrt' in tok) {
      const inner = renderMath(tok.sqrt);
      nodes.push(h('span', { class: 'm-sqrt' }, h('span', { class: 'm-sqrt-sign' }, '√'),
        h('span', { class: 'm-sqrt-body' }, inner.nodes)));
      speech.push(`kvadratroten av ${inner.speech}`);
    } else if ('paren' in tok) {
      const inner = renderMath(tok.paren);
      nodes.push(h('span', { class: 'm-op' }, '('), inner.nodes, h('span', { class: 'm-op' }, ')'));
      speech.push(`parentes ${inner.speech} slutt parentes`);
    } else if ('text' in tok) {
      nodes.push(h('span', { class: 'm-text' }, tok.text));
      speech.push(tok.text);
    } else if ('unit' in tok) {
      nodes.push(h('span', { class: 'm-unit' }, tok.unit));
      speech.push(speakUnit(tok.unit));
    }
  }
  return { nodes, speech: speech.join(' ') };
}

/**
 * Render one inline node.
 * opts.glossary: {id: term}; opts.plainTerms: Set of term ids rendered as plain text;
 * opts.terms === false disables all glossary buttons.
 */
export function renderInline(node, opts = {}) {
  if (typeof node === 'string') return node;
  if ('term' in node) {
    const term = opts.glossary && opts.glossary[node.term];
    if (!term || opts.terms === false || (opts.plainTerms && opts.plainTerms.has(node.term))) return node.text;
    return h('button', {
      type: 'button', class: 'term', 'data-term': node.term, 'aria-expanded': 'false',
      'aria-haspopup': 'dialog', 'aria-label': `${node.text} (vis ordforklaring)`,
    }, node.text);
  }
  if ('math' in node) {
    const { nodes, speech } = renderMath(node.math);
    return h('span', { class: 'math', role: 'img', 'aria-label': speech },
      h('span', { 'aria-hidden': 'true', class: 'math-visual' }, nodes));
  }
  if ('q' in node) {
    return h('span', { class: 'qty', 'aria-label': speakQuantity(node) }, formatQuantity(node));
  }
  if ('em' in node) return h('em', {}, node.em);
  if ('strong' in node) return h('strong', {}, node.strong);
  return '';
}

// A term button followed by punctuation ("blanderen.") must not wrap between the two.
function glue(rendered) {
  const out = [];
  for (let i = 0; i < rendered.length; i++) {
    const cur = rendered[i];
    const next = rendered[i + 1];
    if (cur && typeof cur === 'object' && cur.t === 'button' && typeof next === 'string') {
      const m = /^[.,;:!?)»]+/.exec(next);
      if (m) {
        out.push(h('span', { class: 'nowrap' }, cur, m[0]));
        rendered[i + 1] = next.slice(m[0].length);
        continue;
      }
    }
    out.push(cur);
  }
  return out;
}

export function renderParagraph(par, opts, tag = 'p') {
  const inl = typeof par === 'string' ? [par] : par;
  return h(tag, { class: opts.pClass || null }, glue(inl.map((n) => renderInline(n, opts))));
}

/** Render a paragraph's inlines without a wrapping block element. */
export function renderInlines(par, opts = {}) {
  const inl = typeof par === 'string' ? [par] : par || [];
  return glue(inl.map((n) => renderInline(n, opts)));
}

export function renderRich(value, opts = {}) {
  if (value === null || value === undefined || value === '') return [];
  const blocks = typeof value === 'string' ? [value] : value;
  return blocks.map((block) => {
    if (block && typeof block === 'object' && !Array.isArray(block)) {
      if ('steps' in block) {
        return h('ol', { class: 'steps' }, block.steps.map((p) => renderParagraph(p, opts, 'li')));
      }
      if ('note' in block) return h('p', { class: 'note' }, renderInlines(block.note, opts));
    }
    return renderParagraph(block, opts);
  });
}

/** Plain text of rich content (for review lists and accessible names). */
export function plainText(value) {
  const blocks = value === null || value === undefined ? [] : typeof value === 'string' ? [value] : value;
  const inl = (n) => {
    if (typeof n === 'string') return n;
    if ('term' in n) return n.text;
    if ('q' in n) return formatQuantity(n);
    if ('math' in n) return renderMath(n.math).speech;
    return n.em || n.strong || '';
  };
  const par = (p) => (typeof p === 'string' ? p : p.map(inl).join(''));
  return blocks.map((b) => {
    if (b && !Array.isArray(b) && typeof b === 'object') {
      if ('steps' in b) return b.steps.map(par).join(' ');
      if ('note' in b) return par(b.note);
    }
    return par(b);
  }).join('\n');
}

export { formatNumber };
