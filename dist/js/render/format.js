// Norwegian number and unit formatting (decimal comma, true minus sign,
// space-grouped thousands, non-breaking space between number and unit).

const NBSP = ' ';
const NNBSP = ' ';

export function formatNumber(x, digits) {
  if (!Number.isFinite(x)) return '–';
  let s;
  if (Number.isInteger(digits)) s = Math.abs(x).toFixed(digits);
  else {
    s = Number(Math.abs(x).toPrecision(6)).toString();
    if (s.includes('e')) s = Math.abs(x).toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
  }
  let [int, frac] = s.split('.');
  if (int.length > 4) int = int.replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  const sign = x < 0 && Number(s) !== 0 ? '−' : '';
  return sign + int + (frac ? ',' + frac : '');
}

export function formatQuantity(q) {
  const num = formatNumber(q.q, q.digits);
  const body = q.u ? `${num}${q.u === '%' || q.u === '°' ? '' : NBSP}${q.u}` : num;
  return q.approx ? `≈${NBSP}${body}` : body;
}

const PREFIXES = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
];

/** Format an SI value with an engineering prefix, e.g. (0.0255, 'A') -> "25,5 mA". */
export function formatSI(value, unit, sig = 3) {
  if (value === 0) return `0${NBSP}${unit}`;
  const abs = Math.abs(value);
  let [factor, prefix] = PREFIXES.find(([f]) => abs >= f * 0.9995) || PREFIXES[PREFIXES.length - 1];
  let scaled = Number((value / factor).toPrecision(sig));
  if (Math.abs(scaled) >= 1000 && factor < 1e9) {
    [factor, prefix] = PREFIXES[PREFIXES.findIndex(([f]) => f === factor) - 1];
    scaled = Number((value / factor).toPrecision(sig));
  }
  return `${formatNumber(scaled)}${NBSP}${prefix}${unit}`;
}

const UNIT_SPEECH = {
  V: 'volt', mV: 'millivolt', kV: 'kilovolt', 'µV': 'mikrovolt', A: 'ampere', mA: 'milliampere',
  'µA': 'mikroampere', 'Ω': 'ohm', 'kΩ': 'kiloohm', 'MΩ': 'megaohm', W: 'watt', mW: 'milliwatt',
  kW: 'kilowatt', Hz: 'hertz', kHz: 'kilohertz', MHz: 'megahertz', GHz: 'gigahertz', F: 'farad',
  'µF': 'mikrofarad', nF: 'nanofarad', pF: 'pikofarad', H: 'henry', mH: 'millihenry', 'µH': 'mikrohenry',
  s: 'sekunder', ms: 'millisekunder', 'µs': 'mikrosekunder', m: 'meter', cm: 'centimeter', mm: 'millimeter',
  dB: 'desibel', dBm: 'desibel milliwatt', '%': 'prosent', '°': 'grader', C: 'coulomb', h: 'timer',
  mAh: 'milliamperetimer', Ah: 'amperetimer', J: 'joule', Wh: 'wattimer',
};

export function speakUnit(u) {
  return UNIT_SPEECH[u] || u;
}

export function speakQuantity(q) {
  const n = formatNumber(q.q, q.digits).replace(/ /g, '');
  return `${q.approx ? 'omtrent ' : ''}${n} ${q.u ? speakUnit(q.u) : ''}`.trim();
}
