import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findAll, h, textContent, toString } from '../../web/js/render/vnode.js';
import { plainText, renderInline, renderMath, renderRich } from '../../web/js/render/richtext.js';
import { formatNumber, formatQuantity, formatSI } from '../../web/js/render/format.js';
import { IMPLEMENTATIONS, renderVisual, resolveParams } from '../../web/js/visuals/registry.js';
import { ROOT, TEMPLATES } from './fixtures.mjs';

const CASES = JSON.parse(readFileSync(join(ROOT, 'tests', 'fixtures', 'visual-cases.json'), 'utf8')).cases;

test('Norwegian number formatting', () => {
  assert.equal(formatNumber(25.5), '25,5');
  assert.equal(formatNumber(-3), '−3');
  assert.equal(formatNumber(21600), '21 600');
  assert.equal(formatNumber(7.1, 3), '7,100');
  assert.equal(formatQuantity({ q: 4.7, u: 'kΩ' }), '4,7 kΩ');
  assert.equal(formatQuantity({ q: 9.4, u: 'V', approx: true }), '≈ 9,4 V');
  assert.equal(formatSI(0.025532, 'A'), '25,5 mA');
  assert.equal(formatSI(1e-7, 'F'), '100 nF');
  assert.equal(formatSI(999.9, 'Ω'), '1 kΩ');
  assert.equal(formatSI(0.0005, 's'), '500 µs');
});

test('text content is escaped, never interpreted as markup', () => {
  const out = toString(h('p', {}, renderRich(['<img src=x onerror=alert(1)>'])));
  assert.ok(!out.includes('<img'));
  assert.ok(out.includes('&lt;img'));
  assert.throws(() => toString(h('script', {})), /not allowed/);
  assert.throws(() => toString(h('p', { onclick: 'x' })), /not allowed/);
  assert.throws(() => toString(h('a', { href: 'javascript:alert(1)' }, 'x')), /link not allowed/);
  assert.throws(() => toString(h('a', { href: 'https://evil.example/' }, 'x')), /link not allowed/);
  assert.ok(toString(h('a', { href: 'https://github.com/868-no/quiz/issues' }, 'x')).includes('href'));
  assert.ok(toString(h('a', { href: '#q-0045' }, 'x')).includes('href'));
  assert.ok(toString(h('a', { href: 'https://868.no' }, 'x')).includes('href'));
  assert.throws(() => toString(h('a', { href: 'https://868.no.evil.example/' }, 'x')), /link not allowed/);
  assert.throws(() => toString(h('a', { href: '#top' }, 'x')), /link not allowed/);
});

test('glossary terms render as buttons, and can be held back until answered', () => {
  const glossary = { strom: { nb: ['strøm'], en: ['current'], definition: 'x' } };
  const btn = renderInline({ term: 'strom', text: 'strømmen' }, { glossary });
  assert.equal(btn.t, 'button');
  assert.equal(btn.a.type, 'button');
  assert.equal(btn.a['data-term'], 'strom');
  assert.equal(textContent(btn), 'strømmen');
  assert.equal(renderInline({ term: 'strom', text: 'strømmen' }, { glossary, plainTerms: new Set(['strom']) }), 'strømmen');
  assert.equal(renderInline({ term: 'ukjent', text: 'x' }, { glossary }), 'x');
});

test('math renders sub/superscripts, fractions and a spoken alternative', () => {
  const { nodes, speech } = renderMath(['X_C', '=', { frac: [['1'], ['2', 'π', 'f', 'C']] }]);
  const html = nodes.map(toString).join('');
  assert.ok(html.includes('<sub>C</sub>'));
  assert.ok(html.includes('m-frac-num'));
  assert.equal(speech, 'X C er lik brøk, 1 delt på 2 pi f C, slutt brøk');
  assert.ok(renderMath(['15000']).nodes.map(toString).join('').includes('15\u202f000'));
  const node = renderInline({ math: ['U^2'] });
  assert.equal(node.a.role, 'img');
  assert.equal(node.a['aria-label'], 'U i andre');
  assert.equal(plainText([['I = ', { q: 2, u: 'mA' }]]), 'I = 2 mA');
});

test('a glossary term and the punctuation after it stay together', () => {
  const glossary = { b: { nb: ['blanderen'], en: ['mixer'], definition: 'x' } };
  const p = renderRich([['Det er ', { term: 'b', text: 'blanderen' }, '. Den lager …']], { glossary })[0];
  const span = findAll(p, (n) => n.a.class === 'nowrap')[0];
  assert.equal(textContent(span), 'blanderen.');
  assert.equal(textContent(p), 'Det er blanderen. Den lager …');
});

test('rich text blocks: paragraphs, steps and notes', () => {
  const out = renderRich(['a', { steps: ['b', 'c'] }, { note: ['d'] }]);
  assert.deepEqual(out.map((n) => n.t), ['p', 'ol', 'p']);
  assert.equal(out[1].c.length, 2);
});

test('shared visual cases: same validity and physics as the Python verifier', () => {
  for (const c of CASES) {
    const tpl = TEMPLATES[`${c.visual.template}@${c.visual.version}`];
    const { errors, params, impl } = resolveParams(c.visual, tpl);
    if (c.valid) {
      assert.deepEqual(errors, [], c.name);
      const q = impl.quantities(params);
      for (const [k, v] of Object.entries(c.quantities || {})) { // none: nothing more to check
        assert.ok(Math.abs(q[k].value - v) <= 1e-9 * Math.max(1, Math.abs(v)), `${c.name}: ${k} ${q[k].value} != ${v}`);
      }
      for (const [k, v] of Object.entries(c.shown || {})) assert.equal(q[k].shown, v, `${c.name}: shown ${k}`);
    } else {
      assert.ok(errors.length, c.name);
      assert.ok(errors.some((e) => e.includes(c.error)), `${c.name}: ${errors}`);
    }
  }
});

test('every valid case renders a labelled SVG without NaN and with a text description', () => {
  for (const c of CASES.filter((x) => x.valid)) {
    const res = renderVisual(c.visual, TEMPLATES, { phase: c.visual.after_only ? 'after' : 'before' });
    assert.ok(res.ok, c.name);
    const svgStr = toString(res.node);
    assert.ok(!/NaN|undefined|Infinity/.test(svgStr), `${c.name}: bad number in SVG`);
    const svg = findAll(res.node, (n) => n.t === 'svg')[0];
    assert.ok(svg.a['aria-label'], c.name);
    assert.ok(findAll(svg, (n) => n.t === 'desc').length === 1);
    assert.ok(res.description.length > 20, c.name);
  }
});

test('hidden quantities are shown as "?" and revealed only in the after-answer state', () => {
  const visual = {
    template: 'dc-circuit', version: 1,
    params: { topology: 'series', source: { voltage_v: 12 }, resistors: [{ ohms: 470 }], ammeter: { branch: 'main', show_reading: false } },
    params_after: { ammeter: { show_reading: true } },
  };
  const before = textContent(renderVisual(visual, TEMPLATES).node);
  const after = textContent(renderVisual(visual, TEMPLATES, { phase: 'after' }).node);
  assert.ok(before.includes('?'));
  assert.ok(!before.includes('25,5'), 'answer must not be visible before answering');
  assert.ok(after.includes('25,5 mA'));
});

test('dc circuit draws the battery with + on the long plate and conventional current arrows', () => {
  const res = renderVisual({ template: 'dc-circuit', version: 1, params: { topology: 'series', source: { voltage_v: 9 }, resistors: [{ ohms: 100 }], show_current_direction: true } }, TEMPLATES);
  const battery = findAll(res.node, (n) => n.a.class === 'battery')[0];
  const lines = findAll(battery, (n) => n.t === 'line');
  const [longPlate, shortPlate] = lines;
  assert.ok(Number(longPlate.a.x2) - Number(longPlate.a.x1) > Number(shortPlate.a.x2) - Number(shortPlate.a.x1));
  assert.ok(Number(longPlate.a.y1) < Number(shortPlate.a.y1), 'long (+) plate is on top, where current leaves');
  const plus = findAll(battery, (n) => n.t === 'text' && textContent(n) === '+')[0];
  assert.ok(Number(plus.a.y) < Number(shortPlate.a.y1));
  assert.ok(res.description.includes('fra plusspolen'));
});

test('waveform samples are mathematically correct', async () => {
  const { sample } = await import('../../web/js/visuals/waveform.js');
  const tr = { amplitude: 10, frequency_hz: 50, phase_deg: 0, offset: 0, shape: 'sine' };
  assert.ok(Math.abs(sample(tr, 0.005) - 10) < 1e-9); // quarter period = peak
  assert.ok(Math.abs(sample(tr, 0.01)) < 1e-9);
  assert.ok(Math.abs(sample({ ...tr, phase_deg: -90 }, 0.005)) < 1e-9); // lagging by 90°
  assert.equal(sample({ ...tr, shape: 'square' }, 0.012), -10);
});

test('waveform description states the phase relation for screen-reader users', () => {
  const res = renderVisual({ template: 'waveform', version: 1, params: { traces: [{ amplitude: 1, frequency_hz: 50 }, { amplitude: 1, unit: 'A', frequency_hz: 50, phase_deg: -90 }], show_values: false } }, TEMPLATES);
  assert.ok(res.description.includes('90° etter kurve 1'));
});

test('a waveform without peak markers does not print the amplitude on the axis', () => {
  const res = renderVisual({ template: 'waveform', version: 1, params: { traces: [{ amplitude: 325.27, frequency_hz: 50 }], markers: ['rms'] } }, TEMPLATES);
  const text = textContent(res.node);
  assert.ok(!text.includes('325'), 'peak value must not be visible');
  assert.ok(text.includes('230'), 'the RMS marker is labelled');
});

test('invalid visuals render an explicit message instead of a wrong drawing', () => {
  const res = renderVisual({ template: 'dc-circuit', version: 1, params: { topology: 'parallel', source: { voltage_v: 1 }, resistors: [{ ohms: 1 }] } }, TEMPLATES);
  assert.equal(res.ok, false);
  assert.ok(textContent(res.node).includes('kan ikke vises'));
});

test('every registered template version has an implementation and vice versa', () => {
  assert.deepEqual([...IMPLEMENTATIONS.keys()].sort(), Object.keys(TEMPLATES).sort());
});

test('block labels wrap and long words shrink', async () => {
  const { wrapLabel } = await import('../../web/js/visuals/block-diagram.js');
  assert.deepEqual(wrapLabel('Balansert modulator').lines, ['Balansert', 'modulator']);
  assert.deepEqual(wrapLabel('RF-forsterker').lines, ['RF-forsterker']);
  assert.ok(wrapLabel('Bærebølgeoscillator').fontSize < 12.5);
});

test('the rlc assumption only mentions coupling between coils when there are two coils', () => {
  const fig = (components) => toString(renderVisual({ template: 'rlc-circuit', version: 1, params: { topology: 'series', components } }, TEMPLATES).node);
  assert.ok(!fig([{ kind: 'L', value: 0.01 }, { kind: 'R', value: 100 }]).includes('kobling mellom spolene'));
  assert.ok(fig([{ kind: 'L', value: 0.01 }, { kind: 'L', value: 0.02 }]).includes('kobling mellom spolene'));
});

test('an animated figure has a still image and 24 frames, and never changes its own parameters', () => {
  const visual = {
    template: 'frequency-response', version: 1,
    params: { kind: 'spectrum', center_hz: 145.5e6, spectrum: { mode: 'fm', mod_hz: 1500, index: 5, freq_labels: 'none' } },
    animation: { param: 'spectrum.index', from: 0.3, to: 5, text: 'Sidebåndene endrer seg når indeksen øker.' },
  };
  const before = JSON.stringify(visual);
  const res = renderVisual(visual, TEMPLATES);
  assert.ok(res.ok && res.animatable);
  assert.equal(findAll(res.node, (n) => /anim-frame/.test(n.a.class || '')).length, 24);
  assert.equal(findAll(res.node, (n) => /anim-static/.test(n.a.class || '')).length, 1);
  assert.equal(findAll(res.node, (n) => /anim-play/.test(n.a.class || '')).length, 1);
  assert.ok(res.description.endsWith('Sidebåndene endrer seg når indeksen øker.'));
  assert.equal(JSON.stringify(visual), before, 'the figure parameters were changed while rendering the frames');
  // an animation shown only after answering is left out before
  const afterOnly = { ...visual, animation: { ...visual.animation, phase: 'after' } };
  assert.equal(findAll(renderVisual(afterOnly, TEMPLATES, { phase: 'before' }).node, (n) => /anim-frame/.test(n.a.class || '')).length, 0);
  // frames that would not be valid figures make the figure invalid, as in the Python verifier
  const bad = { ...visual, animation: { ...visual.animation, to: 20 } };
  assert.ok(!renderVisual(bad, TEMPLATES).ok);
});

test('a figure shown only after answering leaves a note before', () => {
  const visual = { template: 'zener-regulator', version: 1, after_only: true, params: { u_in_v: 15, u_z_v: 6.8 } };
  const before = renderVisual(visual, TEMPLATES, { phase: 'before' });
  assert.ok(before.ok);
  assert.equal(findAll(before.node, (n) => n.t === 'svg').length, 0);
  assert.ok(toString(before.node).includes('Figuren vises når du har svart'));
  assert.equal(findAll(renderVisual(visual, TEMPLATES, { phase: 'after' }).node, (n) => n.t === 'svg').length, 1);
});
