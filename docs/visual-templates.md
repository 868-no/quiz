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

All four templates are **`needs_review`** – a person must check the drawings
(`python3 -m tools preview`) and approve each version before questions using them can be published.

## `dc-circuit@1` – likestrømskrets

Ideal source, 1–3 resistors in series or 2–3 in parallel, optional ideal meters.
Meter readings are **computed** from the circuit (they cannot contradict Ohm's law).
IEC symbols; battery long plate = +; conventional current arrows from + through the
circuit to −; optional animated current flow.

| Param | Type |
|---|---|
| `topology` | `series` \| `parallel` |
| `source` | `{voltage_v (0,1–1000), show_value=true}` |
| `resistors` | 1–3 × `{ohms (0,1–10⁷), show_value=true}` (named R1, R2, R3) |
| `ammeter` | `null` or `{branch: main\|R1\|R2\|R3 = main, show_reading=false}` (series: main only) |
| `voltmeter` | `null` or `{across: source\|R1\|R2\|R3, show_reading=false}` |
| `show_current_direction`, `animate_current` | booleans |

Quantities for checks: `U`, `R1…`, `R_total`, `I`, `I_R1…`, `U_R1…`, `P` (each with `shown`).
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

## Adding or changing a template

* **Never change the meaning of a published version.** Add `version: 2` to
  `templates.json`, a new module (or a version branch) in `web/js/visuals/`, register it,
  add rules/quantities in `tools/visuals.py`, add cases to `tests/fixtures/visual-cases.json`,
  render it in the preview, and get it approved. Questions move to the new version
  through a normal new revision + review.
* Keep drawings original: standard IEC symbols and computed curves, never traced or
  copied textbook figures.
