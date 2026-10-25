# Content format

All content is JSON under `content/`. Nothing is HTML; strings are always rendered as
text. The verifier (`tools/checks.py`, `tools/richtext.py`) enforces the rules below.

## Questions: `content/questions/q-NNNN.json`

One file per question **identity**, holding a list of **revisions**:

```json
{"id": "q-0001", "revisions": [{"revision": 1, "status": "approved", "...": "..."},
                               {"revision": 2, "status": "draft", "...": "..."}]}
```

* The newest `approved` revision is published. Approving a newer revision retires
  older approved ones; until then the old one stays published.
* An approved revision is frozen: its `approval.content_sha256` must match the content,
  or `publish` refuses. Change it with `review edit` (creates a new draft revision).
* `approval.machine_verified` says whether AI models (`true`) or a person (`false`)
  approved it. `approval.human_verified` is added when a person later verifies an approval
  made by AI models (`review human-verify`). See editorial-workflow.md.
* Option ids (`o1`…`o4`) are stable; the quiz shuffles their display order per session.

| Field | Notes |
|---|---|
| `status` | `draft`, `needs_review`, `approved`, `rejected`, `retired` |
| `type` | `single_choice` (only type published in the MVP) |
| `style` | `recall`, `concept`, `scenario`, `calculation` |
| `difficulty` | `easy`, `medium`, `hard` |
| `chapter`, `section_ids`, `topic_ids` | taxonomy; sections from `chapters.json`, topics from `topics.json` |
| `learning_objective` | internal (not published) |
| `priority` | `exam_important` (requires a cited `!`-marked chunk; in chapters without a scan it is a judgement and `verify` warns) or `normal` |
| `context` | rich text shown *before* answering (scenario, assumptions, units) – must not reveal the answer |
| `stem` | rich text: the question |
| `options` | exactly 4 × `{id, content (paragraph), feedback (rich text; required for wrong options)}` |
| `correct` | exactly one option id |
| `explanation` | rich text shown after answering (working, units, rounding) |
| `visual` | optional `{template, version, params, params_after?, caption?}` – see visual-templates.md |
| `glossary_after_answer` | term ids shown as plain text until answered (their definition would reveal the answer) |
| `calculation` | required for `style: calculation`, see below |
| `variants` | optional, calculation questions only: other values for the same calculation, see below |
| `study_reference` | `{chapter, section_id, printed_pages}` – printed pages must belong to the cited chunks; empty for chapters without printed pages yet |
| `sources` | private: `{import_id, chunk_uids}` |
| `provenance`, `checks`, `flags`, `review_log`, `approval` | private metadata |

## Rich text

```text
rich      := "string" | [block, …]
block     := "paragraph text" | [inline, …] | {"steps": [paragraph, …]} | {"note": paragraph}
inline    := "text"
           | {"term": "<glossary id>", "text": "<visible form>"}
           | {"q": 4.7, "u": "kΩ", "digits"?: 1, "approx"?: true}      quantity, rendered "4,7 kΩ"
           | {"math": [token, …]}
           | {"em": "…"} | {"strong": "…"}
token     := "X_C" | "U^2" | "10^−7" | "R_{R2}" | "3,162" | "=" "+" "−" "·" "/" "≈" "±" "(" ")" …
           | {"q":…} | {"frac": [[…], […]]} | {"sqrt": […]} | {"paren": […]} | {"text": "…"} | {"unit": "Hz"}
```

* Write numbers in Norwegian notation in prose (`25,5`); quantities are formatted
  automatically (decimal comma, non-breaking space, `−`). Units are allowlisted
  (`tools/richtext.py: UNITS`).
* Math is rendered with real sub/superscripts and stacked fractions, and gets a
  Norwegian spoken label (`aria-label`, e.g. "X C er lik brøk, 1 delt på 2 pi f C").
* Glossary references are explicit; the visible text must be one of the term's `nb`
  forms (inflections and multiword terms are listed per term). Link a term at most once
  per field and sparingly (the verifier warns above 5 per question).

## Calculations

```json
"calculation": {
  "formula": "ohms_law_current",
  "inputs": {"U": [12, "V"], "R": [470, "Ω"]},
  "answer": [25.5, "mA"], "answer_symbol": "I", "sig_figs": 3,
  "visual_bindings": {"R": "R1"}
}
```

`verify` recomputes the answer with `tools/formulas.py` (independently of the text),
rounds to `sig_figs`, and checks that: the declared answer matches; the correct option
states it; no distractor has the same value; the explanation states it; every input
that also appears in the figure has the same value (`visual_bindings` maps input names
to figure quantities); and the figure does not show the asked quantity before
answering but agrees with it. Dimensionless answers use unit `""`.

Available formulas: see `FORMULAS` in `tools/formulas.py` (Ohm's law, power, series/
parallel R, C, L, voltage divider, charge, energy, reactances, resonance, time
constants, period/frequency, wavelength, RMS/peak, dB, IF/image frequency, FM
modulation index and Carson bandwidth, efficiency, harmonics). Add a formula there
(with a test in `tests/python/test_units.py`) when a question needs one.

### Variants

A calculation question can carry other sets of values, so a learner who practises a
few chapters cannot answer from memory. Each variant replaces the fields that hold the
numbers; the question itself is the first variant (v1):

```json
"variants": [
  {"id": "v2", "context": […], "options": […], "explanation": […], "visual": {…},
   "calculation": {"formula": "ohms_law_current", "inputs": {"U": [9, "V"], "R": [220, "Ω"]},
                   "answer": [40.9, "mA"], "answer_symbol": "I", "sig_figs": 3, "visual_bindings": {"R": "R1"}}}
]
```

- Only `context`, `stem`, `options`, `explanation`, `visual` and `calculation` can differ,
  and a field left out is the question's own. The options keep their ids and order, so
  the correct option is the same in every variant; their values and feedback change.
- Every variant needs its own `calculation` with the same formula and other inputs, and
  the same figure template. A different formula is a different question.
- `verify` checks each variant as a whole question (errors and warnings are prefixed
  `variant v2:`), so the answer, distractors, explanation and figure are all checked
  against the variant's own values. `review show` lists every variant.
- The variants are part of the approved content: adding or changing one needs a new
  revision and a new approval.
- The site picks one variant at random each time the question comes up in a round
  (practising missed questions included, so a retry tests the method, not the number).
  The public bank gets the variants without their `calculation`.

Use them where the numbers are incidental. Where the number is the fact to learn (band
edges, power limits, the frequency in a regulation), write a separate question instead.

## Glossary: `content/glossary/terms.json`

```json
{"id": "kapasitiv-reaktans", "nb": ["kapasitiv reaktans", "kapasitive reaktansen"],
 "en": ["capacitive reactance"], "definition": "Reaktansen til en kondensator …",
 "related": ["reaktans"], "status": "needs_review"}
```

Definitions are original, 10–400 characters, and should not contain answers to
questions that link the term before answering (the verifier warns when they do).
Only `approved` terms can be published; `python3 -m tools glossary approve ID…`.
An approval records `approved_sha256`, a hash of `nb`, `en`, `definition` and `related`.
Editing any of them afterwards sends the term back to review: it is listed as
«changed since approval», `glossary check` fails, and publish refuses it until it is
approved again. Don't edit `approved_sha256` by hand.

## Chapters, sections, topics

`content/chapters/chapters.json` (registry with stable section ids; maintained by the
importer, curated by people) and `content/chapters/topics.json` (`{id, title, chapter}`).
`book.total_chapters` makes chapters not yet imported visible as unavailable. A chapter's
`scanned` means its source is imported; `printed_pages_known: false` marks a chapter cited
from the chapter PDF, without printed pages yet. A chapter marked `"quiz": false` (with a `quiz_note`; chapter 14,
the exam syllabus) gets no questions – `verify` refuses them – and is left out of the
chapter list and the dial.
