// The sampling@1 template's maths: aliasing, quantization and the moving average.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aliasFrequency, quantizer, movingAverage } from '../../web/js/visuals/sampling.js';

test('a signal above half the sampling rate shows up folded to a lower frequency', () => {
  assert.equal(aliasFrequency(6000, 48000), 6000);
  assert.equal(aliasFrequency(24000, 48000), 24000);
  assert.equal(Math.abs(aliasFrequency(40000, 48000)), 8000);
  assert.equal(Math.abs(aliasFrequency(42000, 48000)), 6000);
  assert.equal(Math.abs(aliasFrequency(50000, 48000)), 2000);
  // the folded sine passes through the same samples
  const fs = 48000;
  for (const f of [30000, 40000, 47000, 70000]) {
    const fa = aliasFrequency(f, fs);
    for (let n = 0; n < 20; n++) assert.ok(Math.abs(Math.sin(2 * Math.PI * f * n / fs + 0.5) - Math.sin(2 * Math.PI * fa * n / fs + 0.5)) < 1e-9);
  }
});

test('n bits give 2^n levels and a step of range / 2^n, with errors within half a step', () => {
  const { L, step, q } = quantizer({ bits: 4, range_min_v: -1, range_max_v: 1 });
  assert.equal(L, 16);
  assert.equal(step, 0.125);
  for (let v = -0.999; v < 1; v += 0.01) assert.ok(Math.abs(q(v).v - v) <= step / 2 + 1e-12);
  assert.equal(q(5).v, 1 - step / 2); // clipped to the top level
  assert.equal(quantizer({ bits: 2.6, range_min_v: 0, range_max_v: 1 }).L, 8); // animations round
});

test('the moving average is the mean of the last N samples', () => {
  const { taps, x, y } = movingAverage({ taps: 4, noise: 0.25 });
  assert.equal(taps, 4);
  assert.ok(Math.abs(y[30] - (x[27] + x[28] + x[29] + x[30]) / 4) < 1e-12);
  const quiet = movingAverage({ taps: 1, noise: 0 });
  assert.deepEqual(quiet.y, quiet.x);
});
