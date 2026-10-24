# Visual templates

Figures are drawn from **parameters**, never stored as images or HTML. A question says

```json
"visual": {"template": "dc-circuit", "version": 1,
           "params": {...}, "params_after": {...}, "caption": "valgfri bildetekst"}
```

* Schemas: `content/visuals/templates.json` (one source of truth for the Python
  verifier and the browser).
* Renderers: `web/js/visuals/<id>.js`, registered in `web/js/visuals/registry.js`.
* Physics/rules are implemented twice on purpose (Python `tools/visuals.py`, JS
  template modules); `tests/fixtures/visual-cases.json` runs through both.
* `params_after` is deep-merged over `params` after the learner answers (arrays are
  replaced), e.g. to reveal a meter reading or highlight a block.
* Each figure gets: `role="img"` with a title, an SVG `<desc>`, a visible "Tekstbeskrivelse
  av figuren" with the same description, the template's idealisation note
  ("Forutsetning: …"), and no colour-only meaning. Animations are off until the learner
  presses "Spill av animasjon"; with `prefers-reduced-motion` the control is removed and
  the static drawing is the complete figure.
* Invalid parameters never draw a possibly-wrong figure: the page shows "Figuren kan ikke vises".
* Phones: text in figures is enlarged by 15 % (each text gets a `fs-N` class from its
  `font-size`), so leave some room around labels. A template whose text is fitted inside
  shapes exports `fixedTextSize: true`; `minScale` (default 0.6) is the smallest scale a
  figure is shown at before it scrolls sideways.

There are twelve templates, all **approved** at version 1. A new template or version
starts as `needs_review`: a person checks the drawings (`python3 -m tools preview`) and
approves it (`python3 -m tools visuals approve id@version`) before questions using it
can be published. Changing an approved template's code or schema calls for a new
approval.

## `dc-circuit@1` – likestrømskrets

Ideal source, 1–3 resistors in series or 2–3 in parallel, optional ideal meters.
Meter readings are **computed** from the circuit (they cannot contradict Ohm's law).
IEC symbols; battery long plate = +; conventional current arrows from + through the
circuit to −; optional animated current flow.

| Param | Type |
|---|---|
| `topology` | `series` \| `parallel` |
| `source` | `{voltage_v (0,1–1000), show_value=true, internal_ohms?, show_internal=true}` – `internal_ohms` (series only) draws the source's internal resistance r inside a dashed box; the source voltage is then labelled U₀ and a voltmeter across the source reads the terminal voltage |
| `resistors` | 1–3 × `{ohms (0,1–10⁷), show_value=true, name_only=false}` (named R1, R2, R3; `name_only` shows just the name, for a value neither given nor asked) |
| `ammeter` | `null` or `{branch: main\|R1\|R2\|R3 = main, show_reading=false}` (series: main only) |
| `voltmeter` | `null` or `{across: source\|R1\|R2\|R3, show_reading=false}` |
| `show_current_direction`, `animate_current` | booleans |

Quantities for checks: `U`, `R1…`, `R_total`, `I`, `I_R1…`, `U_R1…`, `P_R1…`, `P`, `U_terminal`, and with an internal resistance `r` and `U_r` (each with `shown`).
Hidden values are drawn as `?`.

## `ac-circuit@1` – vekselstrømskrets

Sinusoidal source with one ideal R, C or L.

| Param | Type |
|---|---|
| `source` | `{frequency_hz, voltage_v? (RMS), show_frequency=true, show_voltage=true}` |
| `component` | `{kind: R\|C\|L, value (SI: Ω, F, H), show_value=true}` |
| `reactance_label` | `none` \| `unknown` (`X_C = ?`) \| `value` (computed) |

Quantities: `f`, `R`/`C`/`L`, `X_C` or `X_L`, `U`, `I`.

## `waveform@1` – kurveform

One or two periodic waveforms computed from `offset + A·shape(2πft + φ)`.

| Param | Type |
|---|---|
| `traces` | 1–2 × `{label, shape: sine\|square\|triangle, amplitude, unit: V\|mV\|A\|mA, frequency_hz, phase_deg, offset}` |
| `cycles` | 0,5–6 periods of trace 1 |
| `markers` | subset of `peak`, `peak_to_peak`, `period`, `rms` (RMS only for sine) on trace 1 |
| `show_values` | numbers on axes/markers (false = shape only) |
| `animate` | optional drawing animation |

Two traces with different units (e.g. voltage and current) are each scaled to their own
peak, require `show_values: false` and allow no markers. Trace 2 is dashed. The text
description states the phase relation ("ligger 90° etter kurve 1").
Quantities: `U_p`/`I_p`, `U_pp`, `U_rms`, `T`, `f`, `phase_difference_deg`.

## `block-diagram@1` – blokkskjema

Left-to-right chain of 2–9 blocks (balanced rows of at most 5), up to 3 side blocks
feeding into a chain block, and short edge labels.

| Param | Type |
|---|---|
| `chain` | `{kind, label?, hidden=false, highlight=false}` – `kind` from `kind_labels` (Norwegian labels), or `custom` with a `label` |
| `side` | `{kind, label?, into: chain index, hidden, highlight}` |
| `edge_labels` | `{after: index, text (≤10 chars)}` on the arrow after block `index` |

Hidden blocks show `?` with a dashed border; highlighted blocks have a thick border
and bold text and are named "(fremhevet)" in the description.

## `rlc-circuit@1` – krets med R, C og L

1–3 ideal components (R, C, L; named R1, C1 … per kind) in series or parallel,
between two terminals or with a source. Totals, reactances, impedance, time constant
and resonance frequency are **computed**.

| Param | Type |
|---|---|
| `source` | `{kind: none\|dc\|ac = none, voltage_v?, frequency_hz? (required for ac), show_voltage=true, show_frequency=true}` – a hidden frequency is left out of the drawing |
| `topology` | `series` \| `parallel` |
| `components` | 1–3 × `{kind: R\|C\|L, value? (SI), show_value=true, reactance_ohms?}` – each needs a value or (for C/L) a reactance, drawn as `X_C = 40 Ω` |
| `switch` | open switch in the loop (series circuit with a source only) |
| `total_label` | `none` \| `unknown` (drawn as `?`) \| `value` – the total R/C/L, or for mixed series components with known reactances the impedance `Z` |
| `label_style` | `values` (default) \| `names` (names only, also the source) \| `source` (component names, source value shown) |

Quantities: component names (`R1`, `C1` …), `R_total`/`C_total`/`L_total`, `U`, `f`,
`X_C`/`X_L`, `Z`, `tau`, `f0` (computed ones are never shown before answering).

## `rectifier@1` – likeretter

Half-wave (one diode), bridge (four diodes) or centre-tap (transformer with a
centre-tapped secondary and two diodes) rectifier from an AC source, with an optional
reservoir capacitor and load; also used for a simple diode detector. The
output's plus side is always at the top.

| Param | Type |
|---|---|
| `kind` | `half` \| `bridge` \| `center_tap` |
| `source` | `{u_rms? \| u_peak? (not both), name?, show_value=true}` |
| `capacitor`, `load` | booleans (at least one) |
| `load_name` | `R_L` \| `R` |
| `output_label` | `none` \| `unknown` (`U_ut = ?`) |

Quantities: `U_rms`, `U_p` (peak computed from RMS).

## `transformer@1` – transformator

Ideal transformer with an AC source on the primary and an optional load. Secondary
voltage and input impedance are **computed** from the turns.

| Param | Type |
|---|---|
| `turns_primary`, `turns_secondary` | numbers |
| `turns_display` | `numbers` \| `ratio` (reduced, e.g. `10 : 1`) \| `none` |
| `primary_voltage_v`, `show_primary_voltage` | optional voltage |
| `load_ohms`, `show_load` | optional load |
| `secondary_label` | `none` \| `unknown` \| `value` (computed) – needs a primary voltage |
| `input_label` | `none` \| `unknown` (`Z_inn = ?`) – needs a load |

Quantities: `N_p`, `N_s`, `ratio`, `U_p`, `U_s`, `R_L`, `Z_p`.

## `transistor-stage@1` – transistortrinn

NPN common-emitter stage: collector resistor to the supply, optional emitter resistor
(with bypass capacitor), base voltage divider and coupling capacitors. Node voltages
and the collector current are author-given labels.

| Param | Type |
|---|---|
| `vcc_v`, `show_vcc` | supply voltage |
| `rc_ohms` (required), `re_ohms?`, `show_resistor_values` | resistors |
| `bypass_capacitor` | needs `re_ohms` |
| `divider`, `coupling` | booleans |
| `base_resistor` | `null` or `{ohms?, show_value=true}`: a single resistor R_B from the supply to the base (not with `divider`); no value or a hidden one draws `?` |
| `labels` | up to 4 × `{node: B\|E\|C\|IC, value?}` – no value draws `?` |

Quantities: `U_CC`, `R_C`, `R_E`, `R_B`, `U_B`, `U_E`, `U_C`, `I_C` (labelled ones).

## `series-regulator@1` – spenningsregulator med serietransistor

Linear series regulator: NPN pass transistor between input and output, base fed
through a resistor and held by a zener diode, load at the output, optional input
capacitor. The voltage across and the power in the pass transistor are **computed**,
never typed in.

| Param | Type |
|---|---|
| `u_in_v`, `u_out_v` | input and output voltage (output lower than input) |
| `i_load_a` | load current |
| `unknown` | subset of `U_in`, `U_out`, `I_L`, `U_pass`, `P_pass`, drawn as `?` |
| `input_capacitor` | boolean |

Quantities: `U_in`, `U_out`, `I_L`, `U_pass`, `P_pass` (the last two are never shown).

## `zener-regulator@1` – zenerdiode med seriemotstand

A DC input feeds a zener diode to ground through a series resistor R; the zener voltage
is taken out at the output terminals. The voltage across R and the value of R are
**computed**.

| Param | Type |
|---|---|
| `u_in_v`, `u_z_v` | input and zener voltage (zener lower than input) |
| `i_a` | current through R and the zener (optional; needed for `R`) |
| `unknown` | subset of `U_in`, `U_Z`, `I`, `U_R`, `R`, drawn as `?` |
| `output_label` | short text at the output, e.g. "til basis" |

Quantities: `U_in`, `U_Z`, `I`, `U_R` (never shown), `R` (shown with its value unless unknown).

## `frequency-response@1` – frekvensrespons og spektrum

Curves against frequency, **computed** from their definition. `kind` picks one of four
drawings:

| `kind` | Draws | Params |
|---|---|---|
| `filter` | attenuation in dB (0 at the top, −80 at the bottom) of one or two band-pass filters | `filters`: 1–2 × `{name?, bw6_hz, bw60_hz, bw6_label?, bw60_label?}`; the shape between the two widths follows from the shape factor. Labels: `value`, `name` (B6/B60), `unknown` (?), `none`. Two filters need different names. |
| `resonance` | resonance curve through its half-power points | `center_hz`, `resonance: {f_low_hz, f_high_hz, points_label?, q_label?}`; optional `band: {center_hz, half_width_hz, label?, project?}` shades a frequency range on the curve, and `project` adds the resulting amplitude change |
| `spectrum` | spectrum lines of an AM or FM signal modulated with one tone | `center_hz` (carrier), `spectrum: {mode: am\|fm, mod_hz, index, freq_labels?: all\|carrier\|none, spacing_label?}`; FM line heights are Bessel functions of the modulation index, and `all` is only for AM |
| `coupled` | two identical coupled tuned circuits | `coupled: {kq: [1–3 values of k·Q]}`, labelled under-critical / critical / over-critical in a legend |

Common: `center_label` (`name` = f0, `value`, `none`) and `blank` + `note`, which draw only
the axes with a short note. Use `blank` in `params` and `blank: false` in `params_after`
when the curve itself would give the answer away.

Quantities: `B6`, `B60`, `SF` (suffixed `_A`, `_B` with two filters); `f0`, `f1`, `f2`,
`B`, `Q`; `f_c`, `f_m`, `f_lsb`, `f_usb`, `deviation`. None are shown while `blank`.

## `pi-network@1` – pi-filter

π-filter (low-pass) at a transmitter output: variable capacitor C1 across the input,
coil L in series and variable capacitor C2 across the output.

| Param | Type |
|---|---|
| `feed` | `terminals` (default) or `anode`: fed from a valve anode through a blocking capacitor, with the anode voltage through an RF choke |
| `input_label`, `output_label` | short texts at the input and output (default output: "til antennen") |
| `coil_tap` | boolean – a tap on the coil for the bands |
| `knob_names` | boolean – adds TUNE (C1) and LOAD (C2); usually only in `params_after` |
| `mark` | `none`, `c1`, `l` or `c2` – a dashed frame around one part |

No quantities: the drawing has no component values.

## Adding or changing a template

* **Never change the meaning of a published version.** Add `version: 2` to
  `templates.json`, a new module (or a version branch) in `web/js/visuals/`, register it,
  add rules/quantities in `tools/visuals.py`, add cases to `tests/fixtures/visual-cases.json`,
  render it in the preview, and get it approved. Questions move to the new version
  through a normal new revision + review.
* Keep drawings original: standard IEC symbols and computed curves, never traced or
  copied textbook figures.
