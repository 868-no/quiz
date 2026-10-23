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

export const IMPLEMENTATIONS = new Map(
  [dcCircuit, acCircuit, waveform, blockDiagram, rlcCircuit, rectifier, transformer, transistorStage].map((m) => [`${m.id}@${m.version}`, m]),
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
  return { errors, params: errors.length ? null : params, impl };
}

let figureCounter = 0;

/**
 * Render a question's visual as a <figure> vnode. Never throws: on invalid input it
 * renders an explicit "cannot be shown" message instead of a possibly wrong diagram.
 */
export function renderVisual(visual, templates, { phase = 'before', idPrefix = 'fig' } = {}) {
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
  const { svg, description, animatable } = impl.render(params, tpl);
  const captionBits = [];
  if (visual.caption) captionBits.push(h('span', { class: 'fig-caption-text' }, visual.caption));
  if (tpl.idealised) captionBits.push(h('span', { class: 'fig-ideal' }, `Forutsetning: ${tpl.idealised}`));
  return {
    ok: true,
    errors: [],
    description,
    animatable,
    node: h('figure', { class: 'fig', id, 'data-template': key, 'aria-describedby': `${id}-desc` },
      h('div', { class: 'fig-canvas' }, svg),
      captionBits.length ? h('figcaption', {}, captionBits) : null,
      animatable ? h('button', { type: 'button', class: 'fig-anim-toggle btn-small', 'aria-pressed': 'false', 'data-fig': id }, 'Spill av animasjon') : null,
      h('details', { class: 'fig-desc' },
        h('summary', {}, 'Tekstbeskrivelse av figuren'),
        h('p', { id: `${id}-desc` }, description))),
  };
}
