// The computed parts of frequency-response@1 against known values, so a wrong curve
// is caught by a test and not only by looking at the drawing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { besselJ, coupledResponse, formatFreq, spectrumLines } from '../../web/js/visuals/frequency-response.js';

const close = (a, b, tol = 1e-9, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} != ${b}`);

test('Bessel functions match tabulated values', () => {
  close(besselJ(0, 0), 1);
  close(besselJ(3, 0), 0);
  close(besselJ(0, 2.404825557695773), 0, 1e-12, 'first zero of J0');
  close(besselJ(0, 5), -0.1775967713143383, 1e-12);
  close(besselJ(1, 5), -0.3275791375914652, 1e-12);
  close(besselJ(2, 1), 0.1149034849319005, 1e-12);
  close(besselJ(7, 5), 0.053376410155890716, 1e-12);
});

test('an AM spectrum has the carrier and one sideband on each side at half the index', () => {
  assert.deepEqual(spectrumLines({ mode: 'am', index: 0.8 }), [[-1, 0.4], [0, 1], [1, 0.4]]);
});

test('an FM spectrum is symmetric, its lines are |J_n(β)|, and they hold almost all the power', () => {
  const lines = spectrumLines({ mode: 'fm', index: 5 });
  assert.equal(lines.length, 15, 'carrier and 7 lines on each side');
  for (const [k, a] of lines) {
    close(a, Math.abs(besselJ(Math.abs(k), 5)), 1e-12, `line ${k}`);
    const mirror = lines.find(([m]) => m === -k);
    close(mirror[1], a, 1e-12, `line ${-k} mirrors ${k}`);
  }
  const power = lines.reduce((t, [, a]) => t + a * a, 0);
  assert.ok(power > 0.99 && power <= 1 + 1e-9, `power ${power}`);
});

test('coupled tuned circuits: critical coupling peaks at 1 in the middle, over-critical gets two peaks', () => {
  close(coupledResponse(1, 0), 1);
  close(coupledResponse(0.5, 0), 0.8, 1e-12, 'under-critical peak 2k/(1+k²)');
  close(coupledResponse(2, 0), 0.8, 1e-12, 'over-critical dip in the middle');
  close(coupledResponse(2, Math.sqrt(3)), 1, 1e-12, 'over-critical peaks at u = ±√(k²−1)');
  close(coupledResponse(2, -Math.sqrt(3)), 1, 1e-12);
  assert.ok(coupledResponse(1, 0.5) < 1 && coupledResponse(1, 0.5) > 0.9, 'critical curve is flat-topped');
});

test('frequencies get enough decimals to tell neighbouring lines apart', () => {
  assert.equal(formatFreq(7.098e6, 2000), '7,098 MHz');
  assert.equal(formatFreq(7.1e6, 2000), '7,100 MHz');
  assert.equal(formatFreq(3.57e6, 30000), '3,57 MHz');
  assert.equal(formatFreq(3.6e6, 30000), '3,60 MHz');
  assert.equal(formatFreq(145e3, 500), '145,0 kHz');
  assert.equal(formatFreq(12.5e3, 12.5e3), '12,5 kHz');
  assert.equal(formatFreq(800, 100), '800 Hz');
});
