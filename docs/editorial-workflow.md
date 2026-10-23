# Editorial workflow

Four separate offline stages. None of them runs on the public site.

```text
import ──▶ A: new / generate ──▶ B: verify ──▶ C: human review ──▶ D: publish ──▶ deploy dist/
             (draft)              (needs_review)  (approved)        (fail closed)
```

Set your name once per shell: `export RADIOQUIZ_REVIEWER="Fornavn Etternavn"`.

## Stage A – candidates

**Find source material** (private, terminal only):

```sh
python3 -m tools sources list --chapter 2 --important
#  uid               id            flags    pages   section                    q=questions citing it
#  0123456789abcdef  chunk-000123  [!EO  ]  p.2-2   s2-07   q=1
#  flags: ! exam-important  E unverified equation  O OCR hazard  P uncertain printed page  F depends on a figure
python3 -m tools sources show 0123456789abcdef
```

Prefer `!`-marked chunks but keep coverage broad (`q=` shows how many questions already
cite a chunk).

**Manual authoring** (recommended): `python3 -m tools new --chunk UID [--chunk UID2] --style calculation`
creates `content/questions/q-NNNN.json` with the chapter, sections, priority, reliable
printed pages and source mapping filled in from the import. Replace the `TODO`s.
Write everything in your own words; use the source only to know *what* to ask.

**LLM generation** (optional): configure a provider in `config/generation.local.json`
(git-ignored), for example a local Ollama:

```json
{"provider": "ollama", "providers": {"ollama": {"url": "http://127.0.0.1:11434", "model": "llama3.1:8b"}}}
```

`python3 -m tools generate --chunk UID --count 2` writes the prompt, the exact chunks,
the raw output and provider/model/parameters to `private/generation/runs/<run_id>/` and
the parsed candidates as `draft` questions (`provenance.method = "llm"`). Taxonomy,
priority and source mapping always come from the import, never from the model.
`--question q-0007` regenerates: it adds a new draft revision to an existing question.
Providers: `none` (default), `ollama` (must be local unless explicitly allowed),
`command` (any local program reading the prompt on stdin), `openai_compatible`
(remote; refuses unless `allow_external_upload: true` – sending copyrighted text to a
third party is a deliberate decision).

## Stage B – automated checks

```sh
python3 -m tools verify            # all questions; or: verify q-0003 q-0007
```

Passing drafts move to `needs_review`; failing `needs_review` items move back to
`draft`. Results are stored in the revision (`checks`) and in
`private/reviews/checks/`. **Passing does not mean correct** – it means nothing
detectable is wrong. Hazards (⚠) are listed for the reviewer:

* `ocr` – a cited chunk contains OCR-uncertain equations/numbers/tables;
* `pages` – a cited printed page number was inferred or conflicting in the source;
* `figures` – the source text depends on a figure (check the private crops and make
  sure the question's figure is not derived from the book's).

## Stage C – human review

```sh
python3 -m tools preview && python3 -m tools serve --preview   # see it exactly as learners will
python3 -m tools review show q-0003                            # content, checks, hazards, private source text, crop paths
```

Then one of:

```sh
python3 -m tools review approve q-0003 --ack ocr,figures [--note "…"]   # interactive checklist
python3 -m tools review request-changes q-0003 --note "Distraktor C er også riktig når …"
python3 -m tools review reject q-0003 --note "…"
python3 -m tools review edit q-0003          # opens $EDITOR; approved items get a new draft revision
python3 -m tools review retire q-0003 --note "…"
```

Approval requires: status `needs_review`, checks passing *now*, no unresolved flags,
`--ack` for every hazard, a reviewer name, and confirming the checklist (interactively,
or `--checklist all` after checking every item):

1. Exactly one option is defensibly correct; the distractors are unambiguously wrong.
2. Facts, numbers, units, rounding and working are checked independently.
3. Question, figure and glossary popovers do not reveal the answer.
4. Text and figure are original, not copied or closely paraphrased from the book.
5. Chapter, section and printed page are checked against the book.
6. Clear, correct bokmål without artificial difficulty.

The approval stores reviewer, time, checklist, acknowledged hazards and a hash of the
content. Every action is appended to the revision's `review_log` and to
`private/reviews/audit.jsonl`.

Approve the dependencies too (publish refuses otherwise):

```sh
python3 -m tools glossary list
python3 -m tools glossary approve strom resistans …
python3 -m tools visuals list
python3 -m tools visuals approve dc-circuit@1 --checklist all     # after checking the drawings in the preview
python3 -m tools chapters list                                     # proposed titles from the private import, suspect OCR flagged
python3 -m tools chapters verify-section s2-11 --title "Heading exactly as printed"
python3 -m tools chapters verify-chapter 2
```

## Stage D – publish

```sh
python3 -m tools publish          # → dist/
python3 -m tools release-check    # also run automatically by publish
```

`publish` takes the newest approved revision of each question, re-runs all checks
against the current import, and refuses – writing nothing – if anything is wrong:
content changed after approval, unresolved source flags (`--skip-flagged` leaves those
questions out instead), failing checks, unapproved glossary terms or templates, unknown
templates, chapters that are not scanned, invalid keys. The release check then scans
the staged build for disallowed file types, oversized files, symlinks, private markers
(chunk ids, private field names and paths, OCR annotations, credentials), non-public
bank fields and any 8-word passage shared with the imported textbook text.

`--without-source` publishes without the private import (e.g. on a CI machine);
source, page and copy checks are then skipped, so prefer publishing where the import is.

## Adding new chapters (new scans)

1. Run the digitization pipeline for the new scans.
2. `python3 -m tools import --source …/output` – new chapters/sections are added to the
   registry; questions citing changed chunks are flagged.
3. `python3 -m tools chapters list` – check proposed headings and `ocr_issues`.
4. Author/generate, verify, review and approve questions for the new chapter.
5. `python3 -m tools publish`. The chapter becomes selectable once it has approved questions.

## Deployment

The site is published to GitHub Pages at https://quiz.868.no/ from a separate public
repository that holds only the build (see [architecture.md](architecture.md#deployment)):

```sh
python3 -m tools publish
python3 -m tools deploy --remote git@github.com:OWNER/quiz-site.git     # asks before pushing
```

Never push `private/`, `content/` or this repository to the public site repository. The
preview (`private/preview/`) must never be deployed; it fails the production release
check by design, and `deploy` only ever pushes `dist/`.
