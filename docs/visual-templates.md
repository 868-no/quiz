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
* `after_only: true` shows the whole figure only after answering (before, a short note
  says it will appear), for figures that would give the answer away.
* Each figure gets: `role="img"` with a title, an SVG `<desc>`, a visible "Tekstbeskrivelse
  av figuren" with the same description, the template's idealisation note
  ("Forutsetning: …"), and no colour-only meaning. Animations start by themselves when
  the figure is shown, with a "Stopp animasjon" button; with `prefers-reduced-motion`
  nothing moves, the button is removed and the still drawing is the complete figure.
* `animation` (optional) animates one parameter: `{param, from, to, phase?, mode?,
  params?, text}`. The figure is drawn at 24 values of `param` (a dotted path such as
  `band.center_hz` or `coupled.kq.0`), there and back (`mode: "bounce"`, default) or one
  way (`"loop"`), and CSS shows the frames in turn. `params` overrides other parameters
  in the frames only (e.g. one panel instead of a comparison), `phase` is `before`,
  `after` or `both` (default), and `text` is appended to the description to say what the
  animation shows. Every frame must be a valid figure; verify checks all 24. Use
  `phase: "after"` when the movement itself would give the answer away.
* Invalid parameters never draw a possibly-wrong figure: the page shows "Figuren kan ikke vises".
* Phones: text in figures is enlarged by 15 % (each text gets a `fs-N` class from its
  `font-size`), so leave some room around labels. A template whose text is fitted inside
  shapes exports `fixedTextSize: true`; `minScale` (default 0.6) is the smallest scale a
  figure is shown at before it scrolls sideways.

There are twenty-five templates, all at version 1. A new template or version
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
| `side` | `{kind, label?, into: chain index, hidden, highlight}` – at most one side block per chain block (two would be drawn on top of each other) |
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

## `ratio-detector@1` – forholdsdetektor

A simplified ratio detector: tuned MF transformer with a centre-tapped secondary, two
diodes the same way round the loop charging C3 and C4 (U1, U2), a large capacitor Cs,
R1/R2 with their middle to ground, and the LF output between the C3/C4 junction and
ground. The tertiary winding is left out (said in the assumption under the figure).

| Param | Type |
|---|---|
| `input_label` | text at the input (default "fra MF-forsterkeren") |
| `show_curve` | boolean – adds the S-curve (output against frequency, through zero at f0); usually only in `params_after` |
| `marker_u` | a point on the S-curve (−2,8 to 2,8), for animating the frequency swing |

## `time-signal@1` – signal over tid

Stacked panels against time, computed: `kind` `conduction` (collector current for classes
`A`, `AB`, `B`, `C`; `bias` sets the bias directly and the class label follows), `keying`
(`hard`, `soft`), `envelope` (`speech`, `processed`, `rtty`, with `markers` `peak` and
`average`), `am` (`normal`, `overdriven`), `fsk` (`bits`, e.g. "1011001") and `chirp`
(`chirp`, `stable`) and `drift` (`warmup`). `traces` lists the panels; `cursor` (0–1) draws a time cursor;
`blank` + `note` for figures shown after answering.

## `spectrum@1` – frekvensspekter

A frequency axis `x_min_hz`–`x_max_hz` with up to two `panels`, each with `lines`
(`f_hz`, `level` 0–1, `label`, `mark`), `bands` (sidebands, falling off away from the
strongest line), a `skirt` (phase noise around a carrier) and a `filter` passband drawn
dashed. `freq_labels` writes each line's frequency with the decimals needed to tell them
apart.

## `semiconductor@1` – halvleder

`kind` `lattice` (silicon, `dopant` `P` or `B`), `junction` (PN junction with
`depletion` `narrow`/`normal`/`wide` or `depletion_width` in px, `bias`, `terminals`,
`compare` for a narrow and a wide layer) and `jfet` (`gate_bias` 0–1 or `compare` for two
gate voltages).

## `stage@1` – trinn og komponenter

`kind` `class_c`, `push_pull`, `regulator_ic`, `transistor_mixer`, `dual_gate`, `triode`,
`pnp`, `crystal`, `configurations` (CE, CB, CC side by side), `currents` (IB, IC, IE) or
`tank_loss` (parallel LC with the coil's loss as a series R). `reveal` adds the part that would give the answer away (decoupling
capacitors, the tuned MF load, the gate 2 bias, the grid and anode voltages, the PNP base
bias), usually in `params_after`.

## `illustration@1` – illustrasjon

`kind` `prefixes` (`from`, `to`), `tolerance` (`nominal`, `unit`, `percent`), `s_meter`
(`from_s`, `to_s`, `db_per_s`, `reveal` writes the dB per S-unit), `plates` (`reveal`:
half the distance), `variable_capacitor` (`angle` −90–90°), `coils` (`reveal`: axes at
right angles), `supply` (`reveal`: a separate regulator for the oscillator),
`fet_transfer` (MOSFET curves), `phasing` (SSB by the phasing method), `transfer` (an
amplifier compressing), `air_coil` and `range` (a receiver's dynamic range).

Also: `rlc-circuit@1` takes `current_arrow` (0–1, the current drawn as an arrow whose
length follows it; series circuit with a source), for animations.

## `sampling@1` – digital signalbehandling

Four small drawings for chapter 7, all **computed** from their definition. `kind` picks one;
the other kinds' parameters are ignored (the quantize-only options are refused elsewhere).

| Param | Type |
|---|---|
| `kind` | `samples` \| `quantize` \| `moving_average` \| `fir_iir` |
| `f_hz`, `fs_hz`, `phase_deg=30`, `samples_shown=16` (6–40) | `samples`: a sine at `f_hz` sampled at `fs_hz` (`f_hz` at most 2 · `fs_hz`), the samples as dots on stems |
| `show_analog=true`, `show_reconstruction=false` | `samples`: the analogue sine (thin), and the lowest-frequency sine through the samples (dashed): the signal itself up to `fs_hz / 2`, above it the alias at \|f − round(f/f_s)·f_s\| |
| `show_values=true` | `f` and `f_s` in the drawing (`samples`), the range limits in volts (`quantize`; otherwise "maks"/"min") |
| `bits=3` (1–6, rounded), `range_min_v=−1`, `range_max_v=1`, `amplitude=0.9` (0,1–1,4 of half the range; above 1 the peaks are clipped), `samples_per_period=20` (8–64) | `quantize`: one period of a sine, read `samples_per_period` times, rounded to 2^bits levels in the middle of equal steps of (range)/2^bits, and held until the next reading (a staircase) |
| `step_label=none` \| `symbol` (ΔU) \| `value` (ΔU = 125 mV), `levels_label` ("4 bit: 16 nivåer"), `show_error` | `quantize` only: the step between the two highest levels, the number of levels, and a panel with the rounding error at each reading between ±½ step |
| `taps=4` (1–32, rounded), `noise=0.25` (0–0,5) | `moving_average`: a square pulse of 64 samples with a fixed pseudo-random noise, and the mean of the last `taps` samples |
| `structure=both` \| `fir` \| `iir` | `fir_iir`: a 3-tap FIR filter (delays T, multipliers a0–a2, sum) and a first-order IIR filter with feedback through T and b |

`bits` and `taps` are numbers so they can be animated (`animation.param: "bits"`); each frame
rounds them. The description states the sample count per period, whether the samples show the
signal or an alias (and at what frequency, with `show_values`), how many of the levels the
staircase uses, clipping, and that the error stays within half a step. The assumption shown
under the figure depends on `kind`.

## `antenna@1` – antenne

Simplified antenna drawings (not to scale) and computed radiation patterns, chosen with
`kind`. The current and voltage on the dipole are the standing-wave shapes (current
cos, voltage sin along the half-wave), the dipole pattern is cos(90°·cos φ)/sin φ, and
the −3 dB beamwidth (field 1/√2 of the maximum) is found numerically. The assumption
note mentions the computed parts only when the figure shows them.

| Param | Type |
|---|---|
| `kind` | `dipole` \| `folded_dipole` \| `ground_plane` \| `yagi` \| `quad` \| `trap_dipole` \| `loaded_vertical` \| `pattern` |
| `feed` | `coax` (default) \| `balun` \| `ferrite` (ferrite beads on the coax) \| `ladder` \| `none` – dipole and folded dipole |
| `length_label` | ≤24 chars: a dimension line over the (folded) dipole, the height of a ground plane or loaded vertical, the circumference of a quad (`"l = ?"` before, the value after) |
| `show_current`, `show_voltage` | graphs above a dipole (voltage dashed); `show_current` also on `loaded_vertical` |
| `phase_deg` | `null` (default: envelopes, how large current and voltage get) or 0–360: the values at that instant of the period, inside dashed envelopes – animate it 0 → 360 with `mode: "loop"` |
| `radial_angle` | 0–60° below horizontal (ground plane; default 45), drawn in oblique projection with the true angle marked |
| `compare` | ground plane: horizontal radials beside the angled ones (`radial_angle` ≥ 20) |
| `show_impedance` | ground plane: feed impedance ≈ 36 Ω (horizontal) / near 50 Ω (35–55°); other angles are refused |
| `directors` | Yagi: 0–6 directors, each a little shorter; reflector longest, driven dipole fed |
| `show_labels`, `show_direction`, `highlight` | Yagi: element names, main-direction arrow, `none` \| `reflector` \| `driven` \| `directors` drawn thick |
| `trap_label`, `inner_label`, `outer_label` | trap dipole: the traps' frequency, spans between the traps and over the whole antenna |
| `active` | `all` \| `inner` – trap dipole only: the parts outside the traps dashed and pale |
| `coil_position` | loaded vertical: coil height as a share of the antenna (0,03–0,85); animate it to move the coil |
| `shape` | pattern: `dipole` \| `vertical` \| `directional` |
| `antenna_axis` | pattern dipole: `ew` \| `ns` |
| `show_pattern` | pattern: false draws only the antenna (and compass) – reveal it with `params_after` |
| `compass` | N/S/Ø/V around the pattern (not for `directional`, which is labelled forover/bakover) |
| `beamwidth` | the computed −3 dB beamwidth as two dashed lines and a value (not for `vertical`) |
| `beamwidth_deg`, `front_back_db` | directional pattern: main-lobe width at −3 dB (30–120°) and front/back ratio (3–40 dB) |

Rules (both verifiers): current/voltage only on a dipole (current also on a loaded
vertical); `phase_deg` only with a graph; the impedance labels only for horizontal or
about 45° radials; `compare` needs `radial_angle` ≥ 20; no beamwidth for a vertical; no
compass on the directional pattern; `active` only on the trap dipole.
No quantities for checks.

## `feedline@1` – fødekabel

Feed lines, drawn from the physics of a lossless line with a resistive, open or shorted load.
One `kind` per figure:

* `standing_wave` – transmitter (optionally with an antenna tuner, `ATU`) and a line to a
  load. Above the line, the voltage along it (and below it, the current) is **computed** from
  the reflection coefficient Γ = (R − Z₀)/(R + Z₀): the thin solid and dashed curves are
  ±|U| (how large the voltage gets at each place), and the thick curve is the voltage at
  one moment (`phase_deg`). Animating `phase_deg` (0–345, `mode: "loop"`) shows a
  travelling wave on a matched line and a wave that stands still on a mismatched one;
  animating `load_ratio` shows the standing waves growing with the mismatch.
* `cable` – a coax cross-section (inner conductor, insulation, braided shield, jacket;
  optionally the diameters d and D) and/or a ladder line (optionally the equal and
  opposite currents).
* `quarter_wave` – a λ/4 section of impedance Z₀ before a load Z_L; the input impedance
  Z₀²/Z_L is computed.
* `directional` – transmitter, SWR meter (two dials: forward full scale, reflected in
  proportion) and antenna, with arrows for the forward and reflected waves in W or V.
  SWR and return loss are computed from the two readings (Γ = U_r/U_f or √(P_r/P_f)).

| Param | Type |
|---|---|
| `kind` | `standing_wave` \| `cable` \| `quarter_wave` \| `directional` |
| `load` | `matched` \| `open` \| `short` \| `resistive` (standing_wave) |
| `load_ratio` | R/Z₀ for a resistive load, 0,05–20 (default 3) |
| `z0_ohms`, `show_z0` | the line's impedance (default 50 Ω) and whether it is written |
| `show_load` | write the load resistance (standing_wave) or Z_L (quarter_wave) |
| `wavelengths` | line length, 0,25–2 wavelengths |
| `envelope` | `none` \| `voltage` \| `voltage_current` |
| `show_wave`, `phase_deg` | the instantaneous wave and its time phase 0–360° |
| `show_minmax` | mark U_maks and U_min (needs an envelope and a mismatch) |
| `swr_label` | `none` \| `unknown` (`SWR = ?`) \| `value` (computed; not for open or short) |
| `tuner`, `quarter_mark` | an ATU at the transmitter; a λ/4 dimension from the load |
| `cable`, `labels`, `dimensions`, `currents` | `coax` \| `ladder` \| `both`; part names; d and D (coax only); currents (ladder only) |
| `z_load_ohms`, `input_label` | quarter_wave: Z_L and `none` \| `unknown` \| `value` for Z_inn |
| `forward`, `reflected`, `unit`, `show_readings` | directional: the two waves (reflected below forward) in `W` or `V` |
| `return_loss_label` | `none` \| `unknown` \| `value` (needs a reflected wave) |

Quantities: standing_wave `Z0`, `SWR` (finite loads), `R_L`; quarter_wave `Z0`, `Z_L`,
`Z_inn`; directional `P_fwd`/`P_ref` or `U_fwd`/`U_ref`, `SWR`, `RL`.

## `propagation@1` – bølgeutbredelse

How radio waves travel, drawn from the side and **not to scale** (the note under the
figure says so, trimmed per kind). One `kind` per drawing:

| `kind` | Draws |
|---|---|
| `layers` | The D, E, F1 and F2 layers with typical heights (`show_heights`), by day or by night (`time`; at night D is gone and E weak, both dashed, and F1 and F2 are one F layer). `compare` draws day and night side by side. |
| `sky_wave` | A transmitter, its ground wave (`ground_wave_km`, drawn at least 26 px long) and rays at `angles` (elevation, 2–90°) up to one layer at `layer_km`. Whether each ray comes back is **computed**: back if `f_mhz ≤ fc_mhz / sin e` (secant law, flat earth), landing at 2h / tan e; the others go through (dashed, arrow out). `show_skip` shades the skip zone from the end of the ground wave to 2h·√((f/f₀)² − 1) and names it. `show_freq` prints f and the critical frequency. `range_km` is the width of the drawing. Animate `f_mhz` to show the rays starting to escape and the skip zone growing. |
| `hops` | One ray making `hops` (1–3) hops between the ground and the layer at `elevation_deg`; `show_distance` labels each hop (2h / tan e, rounded). |
| `horizon` | Two antennas `h1_m`, `h2_m` on a curved earth (curvature exaggerated, geometry consistent) whose tangent lines meet at one horizon point; `show_distance` labels each station's horizon with the book's rule d ≈ 4·√h km. |
| `duct` | A flat ray trapped in a low layer of warm or moist air over the sea, and a steeper ray that escapes. |
| `aurora` | Two stations to the south aiming north at the aurora, which scatters the signal back. |
| `knife_edge` | Two stations either side of a sharp ridge, the direct path blocked; `show_diffraction` adds the waves bending over the edge into the shadow. |

Common: `layer` (`D`, `E`, `Es`, `F1`, `F2` = default, `F`) names the layer in
`sky_wave` and `hops`; `blank` + `note` shows only a note. Labels in the sky are placed
where no ray crosses them. Rules (Python and JS): `compare` only for `layers`; in
`sky_wave` each angle once and `ground_wave_km` < `range_km`; `hops` may not add up to
more than 40 000 km. No quantities.

The description lists the angles, which rays return and where they land, which go
through, and the skip zone, so a question that asks about any of these should show the
figure only after answering (`after_only`, `params_after`, or an animation with
`phase: "after"`).

## `instrument@1` – måleinstrument

Measuring instruments, one drawing per `kind`. Every value the figure shows is computed
from the parameters (series resistor, shunt, voltmeter reading, divisions per period),
so it cannot contradict the question; hidden values are drawn as `?`.

| `kind` | Draws |
|---|---|
| `scope` | Oscilloscope screen, 10 × 8 divisions with fine ticks on the centre lines, 1–2 traces computed from their definition (trace 2 dashed and numbered), `Tid/rute` and `Volt/rute` under the screen. The trace starts at the left edge rising through zero (phase 0), so periods can be counted in divisions. |
| `meter_series` | Voltmeter: moving-coil meter (face with scale and needle at full scale) in series with a series resistor R_S between + and − terminals, with the range drawn across the terminals. R_S = range / full-scale current − coil resistance. |
| `meter_shunt` | Ammeter: the same meter with a shunt R_sh in parallel; the input current I is marked. R_sh = I_m·R_m / (I − I_m). |
| `voltmeter_loading` | A battery feeding R1 over R2, with a voltmeter (internal resistance R_i) across R2. The reading is computed with R_i in parallel with R2; the description after answering also gives the unloaded voltage. |
| `gate` | A frequency counter's gate: two equal gate windows over the same pulse train, opened at slightly different times, counting one pulse more or less (not to scale). |

| Param | Type |
|---|---|
| `traces` | scope only, 1–2 × `{shape: sine\|square\|am, frequency_hz, amplitude_v, offset_v=0, phase_deg=0, carrier_hz? (am only, ≥ 4 × frequency_hz), depth=0,5 (am)}` – for `am`, `frequency_hz` is the modulating frequency and `amplitude_v` the unmodulated carrier peak |
| `time_per_div_s`, `volt_per_div_v`, `show_settings=true` | scope settings (shown like the knobs: 0,2 ms, not 200 µs). The screen must show 0,25–40 periods, and no trace may go more than 4 divisions from the middle |
| `meter` | `{full_scale_a, coil_ohms=null, show_full_scale=true, show_coil=true}` – `null` coil resistance means "neglected" (not drawn); a shunt needs it |
| `range_v` / `range_a`, `show_range=true`, `show_resistor=false` | voltmeter / ammeter range (required for its kind); whether R_S / R_sh is printed |
| `supply_v` (required), `r1_ohms`, `r2_ohms`, `meter_ohms`, `show_reading=false`, `show_meter_ohms=true` | voltmeter_loading |
| `gate_s`, `show_resolution=false` | gate time; `show_resolution` adds "Én puls mer eller mindre: ±1/T" |

Quantities (named after the calculation inputs they illustrate, so `verify` checks a
question's inputs and answer against the figure without `visual_bindings`):
scope `f`, `T`, `U_p`, `U_pp`, `time_per_div`, `volt_per_div`, `div_per_period`;
meter_series `U` (range), `I` (full scale), `R_m`, `R` (series resistor);
meter_shunt `I_m`, `R_m`, `U` (= I_m·R_m), `I` (range), `I_sh`, `R` (shunt);
voltmeter_loading `U_s`, `R_upper`, `R_lower`, `R_i`, `R_p` (R2 ∥ R_i), `U_m` (reading), `U_0` (without the meter);
gate `T` (gate time), `f` (resolution 1/T).

Use `params_after` to reveal the asked value (`show_resistor`, `show_reading`,
`show_resolution`). `meter_ohms` animates well after answering (the reading approaches
the unloaded voltage as R_i grows).

## `code-breakdown@1` – kode delt opp i deler

A short code – a call sign, an emission designator, a signal report – drawn as 1–6
parts, each in its own box with a bracket and a label underneath. Labels wrap in
narrow columns so they stay readable on phones; a short code is centred in a figure at
least 480 units wide instead of being blown up.

| Param | Type |
|---|---|
| `parts` | 1–6 × `{text, label="", hidden=false, highlight=false}` – `text` is 1–8 of `A–Z a–z 0–9 / . + -` (the whole code at most 16 characters); `label` ≤ 40 characters; `hidden` draws `?` under a dashed bracket instead of the label; `highlight` gives the box a thick border and the label bold text |

Rules: at least one part has a label, and a hidden part must have a label (to show
after answering). To reveal hidden labels, `params_after` repeats `parts` without
`hidden` (arrays are replaced). When the split itself answers the question (which part
is the prefix?), use `after_only: true`. The description names every part and its
label, and says "betydningen vises etter at du har svart" for hidden ones.
No quantities.

## `safety@1` – sikkerhet

Schematic drawings for chapter 13; `kind` picks one, `reveal` adds what is shown after
answering.

| Kind | Draws | `reveal` adds |
|---|---|---|
| `body_paths` | a calm outline of a person touching live parts, with three current paths (hand to hand, hand to foot, within one hand) and the heart | `highlight` (`hand_hand`, `hand_foot`, `one_hand`) picks one out; hand to hand is marked as the most dangerous |
| `shock_scale` | a logarithmic scale 0,1 mA–10 A with rounded effects of 50 Hz current through the chest, and where an RCD (30 mA) and an ordinary fuse (10 A) act | – |
| `earth_fault` | a fuse box (`protection`: `fuse` or `fuse_rcd`; `fuse_a` labels the fuse) feeding a load in an earthed metal case, with a fault from phase to the case | the fault current back through PE and what trips; `leak_ma` labels a small leak (needs `fuse_rcd`) |
| `mast_fall` | a mast (`height_m`) with guys and an overhead power line `line_distance_m` away, seen from the side | the arc a falling mast sweeps, and whether it reaches the line |
| `car_supply` | a car radio fed from the battery with fuses in both leads, the engine's earth cable, the engine bonded to the body and the radio bonded through the antenna mount | the earth cable broken and the starter current through the radio's negative lead |
| `solder_joint` | a good joint and a dry joint in cross-section (`good_first` sets the order) | which is which |

Rules: `highlight` only for `body_paths`; `fuse_a` and `leak_ma` only for `earth_fault`,
and `leak_ma` only with `fuse_rcd`. The note under each figure is worded per kind.

## Adding or changing a template

* **Never change the meaning of a published version.** Add `version: 2` to
  `templates.json`, a new module (or a version branch) in `web/js/visuals/`, register it,
  add rules/quantities in `tools/visuals.py`, add cases to `tests/fixtures/visual-cases.json`,
  render it in the preview, and get it approved. Questions move to the new version
  through a normal new revision + review.
* Keep drawings original: standard IEC symbols and computed curves, never traced or
  copied textbook figures.
