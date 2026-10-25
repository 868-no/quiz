// Registry of visual template implementations, keyed by "id@version".
// A published question references a template version; an improved drawing that
// changes meaning must be added as a new version, never patched into an old one.

import { h } from '../render/vnode.js';
import { deepMerge, validateSchema } from './schema.js';
import dcCircuit from './dc-circuit.js';
import acCircuit from './ac-circuit.js';
import waveform from './waveform.js';
import blockDiagram from './block-diagram.js';
import rlcCircuit from './rlc-circuit.js';
import rectifier from './rectifier.js';
import transformer from './transformer.js';
import transistorStage from './transistor-stage.js';
import seriesRegulator from './series-regulator.js';
import zenerRegulator from './zener-regulator.js';
import frequencyResponse from './frequency-response.js';
import piNetwork from './pi-network.js';
import ratioDetector from './ratio-detector.js';
import timeSignal from './time-signal.js';
import spectrum from './spectrum.js';
import semiconductor from './semiconductor.js';
import stage from './stage.js';
import illustration from './illustration.js';
import safety from './safety.js';
import feedline from './feedline.js';
import sampling from './sampling.js';
import propagation from './propagation.js';
import antenna from './antenna.js';
import instrument from './instrument.js';
import codeBreakdown from './code-breakdown.js';

export const IMPLEMENTATIONS = new Map(
  [dcCircuit, acCircuit, waveform, blockDiagram, rlcCircuit, rectifier, transformer, transistorStage, seriesRegulator, zenerRegulator, frequencyResponse, piNetwork, ratioDetector, timeSignal, spectrum, semiconductor, stage, illustration, codeBreakdown, instrument, antenna, propagation, sampling, feedline, safety]
    .map((m) => [`${m.id}@${m.version}`, m]),
);

/** Validate parameters for a phase ('before' or 'after'); returns {errors, params}. */
export function resolveParams(visual, templateDef, phase = 'before') {
  const errors = [];
  const key = `${visual.template}@${visual.version}`;
  const impl = IMPLEMENTATIONS.get(key);
  if (!impl) return { errors: [`no implementation for ${key}`], params: null, impl: null };
  if (!templateDef) return { errors: [`no schema for ${key}`], params: null, impl };
  const raw = phase === 'after' && visual.params_after ? deepMerge(visual.params, visual.params_after) : visual.params;
  const params = validateSchema(templateDef.params, raw, 'params', errors, templateDef);
  if (!errors.length) errors.push(...impl.rules(params));
  if (!errors.length && visual.animation) errors.push(...validateAnimation(visual, templateDef));
  if ('after_only' in visual && typeof visual.after_only !== 'boolean') errors.push('after_only: true or false');
  return { errors, params: errors.length ? null : params, impl };
}

/** The same checks as tools/visuals.py: a described animation whose every frame is a valid figure. */
function validateAnimation(visual, templateDef) {
  const a = visual.animation;
  const w = 'animation';
  if (!a || typeof a !== 'object') return [`${w}: expected an object`];
  const errors = [];
  const extra = Object.keys(a).filter((k) => !['param', 'from', 'to', 'phase', 'mode', 'params', 'text'].includes(k));
  if (extra.length) errors.push(`${w}: unknown keys ${extra}`);
  if (typeof a.param !== 'string' || !/^[a-z_0-9]+(\.[a-z_0-9]+)*$/.test(a.param)) errors.push(`${w}.param: a dotted parameter path`);
  for (const k of ['from', 'to']) if (typeof a[k] !== 'number') errors.push(`${w}.${k}: a number`);
  if (!['before', 'after', 'both', undefined].includes(a.phase)) errors.push(`${w}.phase: before, after or both`);
  if (!['bounce', 'loop', undefined].includes(a.mode)) errors.push(`${w}.mode: bounce or loop`);
  if (typeof a.text !== 'string' || a.text.length < 10 || a.text.length > 240) errors.push(`${w}.text: say in a sentence what the animation shows`);
  if (errors.length) return errors;
  const phases = (a.phase || 'both') === 'both' ? ['before', 'after'] : [a.phase];
  for (const ph of phases) if (!animationFrames(visual, templateDef, ph)) return [`${w}: a frame (${ph}) is not a valid figure`];
  return [];
}

let figureCounter = 0;

/**
 * Render a question's visual as a <figure> vnode. Never throws: on invalid input it
 * renders an explicit "cannot be shown" message instead of a possibly wrong diagram.
 */
// Mark each text element with its size (fs-13 …), so the stylesheet can enlarge
// figure text on narrow screens without changing the drawing. Templates whose text
// is fitted inside shapes (block diagrams) set fixedTextSize and are left alone.
function tagFontSizes(node) {
  if (!node || typeof node !== 'object') return;
  const fs = Number(node.a['font-size']);
  if (Number.isFinite(fs) && fs > 0) node.a.class = `${node.a.class ? `${node.a.class} ` : ''}fs-${Math.round(fs)}`;
  node.c.forEach(tagFontSizes);
}

export const ANIMATION_FRAMES = 24;

/** Set a value at a dotted path such as "band.center_hz" or "coupled.kq.0". */
function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[/^\d+$/.test(k) ? Number(k) : k];
  o[keys[keys.length - 1]] = value;
}

/** The value of the animated parameter in frame k (24 frames, there and back or one way). */
export function animationValue(anim, k) {
  const n = ANIMATION_FRAMES;
  const share = anim.mode === 'loop' ? k / (n - 1) : (k <= n / 2 ? k : n - k) / (n / 2);
  return anim.from + (anim.to - anim.from) * share;
}

/**
 * The parameters of every animation frame for a phase, or null when the visual is not
 * animated in that phase. Each frame is the phase's parameters with the animation's own
 * overrides and the animated value, validated like any other figure.
 */
export function animationFrames(visual, templateDef, phase) {
  const anim = visual.animation && { phase: 'both', mode: 'bounce', ...visual.animation };
  if (!anim || (anim.phase !== 'both' && anim.phase !== phase)) return null;
  const impl = IMPLEMENTATIONS.get(`${visual.template}@${visual.version}`);
  const base = phase === 'after' && visual.params_after ? deepMerge(visual.params, visual.params_after) : visual.params;
  const frames = [];
  for (let k = 0; k < ANIMATION_FRAMES; k++) {
    const raw = JSON.parse(JSON.stringify(deepMerge(base, anim.params || {}))); // never touch the figure's own params
    try { setPath(raw, anim.param, animationValue(anim, k)); } catch { return null; } // a bad path: no animation
    const errors = [];
    const params = validateSchema(templateDef.params, raw, 'params', errors, templateDef);
    if (!errors.length) errors.push(...impl.rules(params));
    if (errors.length) return null;
    frames.push(params);
  }
  return frames;
}

export function renderVisual(visual, templates, { phase = 'before', idPrefix = 'fig' } = {}) {
  // a figure that would give the answer away is shown only after answering
  if (visual.after_only && phase === 'before') {
    return { ok: true, errors: [], description: '', animatable: false, node: h('figure', { class: 'fig fig-later' }, h('p', {}, 'Figuren vises når du har svart.')) };
  }
  const key = `${visual.template}@${visual.version}`;
  const tpl = templates && templates[key];
  const { errors, params, impl } = resolveParams(visual, tpl, phase);
  const id = `${idPrefix}-${++figureCounter}`;
  if (errors.length) {
    return {
      ok: false, errors,
      node: h('figure', { class: 'fig fig-error' }, h('p', {}, 'Figuren kan ikke vises. Spørsmålet kan besvares uten den.')),
    };
  }
  const rendered = impl.render(params, tpl);
  let { svg, description, animatable } = rendered;
  // A parameter animation: the still figure, plus a second drawing with 24 frames that
  // CSS shows one at a time while the figure plays (see .anim-frame in styles.css). The
  // animation has its own size, since its frames may be laid out differently. Paused or
  // with reduced motion, only the still figure is shown.
  const frames = animationFrames(visual, tpl, phase);
  let animSvg = null;
  if (frames) {
    const drawn = frames.map((fp) => impl.render(fp, tpl).svg);
    const boxes = drawn.map((d) => String(d.a.viewBox).split(' ').map(Number));
    const box = [boxes[0][0], boxes[0][1], Math.max(...boxes.map((b) => b[2])), Math.max(...boxes.map((b) => b[3]))];
    animSvg = h('svg', { ...drawn[0].a, viewBox: box.join(' '), class: 'fig-svg anim-play', 'aria-hidden': 'true' },
      drawn.map((d, k) => h('g', { class: `anim-frame f${k}` }, d.c.slice(2))));
    svg = { ...svg, a: { ...svg.a, class: `${svg.a.class} anim-static` } };
    description = `${description} ${visual.animation.text}`;
    svg.c = [svg.c[0], h('desc', {}, description), ...svg.c.slice(2)];
    animatable = true;
  }
  if (!impl.fixedTextSize) { tagFontSizes(svg); if (animSvg) tagFontSizes(animSvg); }
  const captionBits = [];
  if (visual.caption) captionBits.push(h('span', { class: 'fig-caption-text' }, visual.caption));
  // a template can trim its assumption to what the drawing contains (see rlc-circuit)
  const ideal = impl.idealised ? impl.idealised(params, tpl.idealised) : tpl.idealised;
  if (ideal) captionBits.push(h('span', { class: 'fig-ideal' }, `Forutsetning: ${ideal}`));
  return {
    ok: true,
    errors: [],
    description,
    animatable,
    node: h('figure', { class: 'fig', id, 'data-template': key, 'data-min-scale': String(impl.minScale || 0.6), 'aria-describedby': `${id}-desc` },
      h('div', { class: 'fig-canvas' }, svg, animSvg),
      h('p', { class: 'fig-pan-hint', hidden: true }, 'Figuren er bred: sveip sideveis for å se hele.'),
      captionBits.length ? h('figcaption', {}, captionBits) : null,
      animatable ? h('button', { type: 'button', class: 'fig-anim-toggle btn-small', 'aria-pressed': 'false', 'data-fig': id }, 'Spill av animasjon') : null,
      h('details', { class: 'fig-desc' },
        h('summary', {}, 'Tekstbeskrivelse av figuren'),
        h('p', { id: `${id}-desc` }, description))),
  };
}
