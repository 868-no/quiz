# Editorial workflow

Four separate offline stages. None of them runs on the public site; GitHub Actions only
rebuilds and deploys what has already been approved.

```text
import ──▶ A: new / generate ──▶ B: verify ──▶ C: human review ──▶ D: publish ──▶ push (CI deploys)
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

Warnings (!) do not stop a question, but should be read. Among them are the
preferred terms in `config/terminology.json`: verify warns when the text uses a form
to avoid, for example «sluttrinn» or «PA» (use sluttforsterker), «porten» (use gate)
or «harmoniske» on its own (say frekvenser or signaler). Prefer the book's own word
unless decided otherwise, and add a rule when the bank starts mixing two words for
the same thing; a test holds the glossary, topic titles and
figure labels to the same rules. Verify only rewrites a question when its result or
status changed.

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

**Approved by AI models or by a person.** An approval records `machine_verified`: `true`
when AI models did the review, `false` when a person did. AI reviewers set both
variables, so their approvals are marked:

```sh
export RADIOQUIZ_REVIEWER="Claude + ChatGPT" RADIOQUIZ_MACHINE_REVIEW=1   # or --machine
```

A person can then verify a question that AI models approved, without a new revision:

```sh
python3 -m tools review show q-0003            # "approved by AI models; not verified by a person"
python3 -m tools review human-verify q-0003    # interactive checklist, or --checklist all
```

This adds `approval.human_verified` (`by`, `at`, `checklist`, the content hash). It refuses
when RADIOQUIZ_MACHINE_REVIEW is set. `python3 -m tools status` counts the published
questions a person has verified, and `status -v` marks the rest «AI-approved». A new
revision needs a new approval, and a person must verify that one again.

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

**Glossary links.** `python3 -m tools glossary suggest` lists words in the questions
that match a glossary term but are not linked; `glossary autolink [ids] --apply` links
them as new draft revisions (once before answering – never in the answer options – and
once after; never inside math). Forms that are also ordinary words (e.g. the verb
"sender") are listed in the term's `no_autolink` and are never linked automatically.
The new revisions go through `verify` and approval like any other change.

## Printable flashcards

### Requirements

- Python 3.12 is used in CI. Use a virtual environment so the optional PDF packages
   do not affect the rest of the project.
- `requirements-flashcard.txt` pins Pillow 13.0.0 and ReportLab 5.1.0. Pillow is
   needed by both commands; ReportLab is needed by `flashcard`.
- To render or refresh figure snapshots, install Node.js 18 or newer and Inkscape
   1.2.2 or newer. CI uses Node.js 22. Both `node` and `inkscape` must be available
   on `PATH`. Node runs the
   repository's existing JavaScript visual renderers; Inkscape converts their SVG
   output to PNG. No `npm install` is needed for these commands.

On Debian or Ubuntu, install Inkscape with `sudo apt install inkscape`; install
Node.js 18 or newer using the official Node.js installer or a version manager. On
macOS, `brew install inkscape` installs Inkscape; install Node.js 18 or newer using
the official installer or a version manager. On Windows, install Node.js and Inkscape
using their official installers and ensure both commands are on `PATH`.

Create and activate the Python environment, then install the pinned packages:

```sh
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-flashcard.txt
node --version
inkscape --version
```

On Windows PowerShell, create the environment with `py -3.12 -m venv .venv` and
activate it with `.\.venv\Scripts\Activate.ps1` instead of the two Unix commands.

### Generate the PDF

Render the image cache first. This command needs Pillow, Node.js, and Inkscape:

```sh
python -m tools flashcard-images                 # includes all variants by default
python -m tools flashcard-images --chapter 4
python -m tools flashcard-images --no-variants   # only the base form of each question
```

Then generate the PDF. This command needs the Python packages and a valid cache,
but does not invoke Node.js or Inkscape:

```sh
python -m tools flashcard
python -m tools flashcard --chapter 4
python -m tools flashcard --no-variants
```

Variants are included by default (`--variants` makes this explicit).
`--no-variants` exports only each question's base form. The large card heading is a
running number. The small upper-right q-code is `q-NNNN` for a single form or
`q-NNNN-Y` for a variant (for example, `q-0349-1`). Keep `--chapter`,
`--approved-only`, and `--no-variants` consistent between both commands so the image
cache covers the PDF selection. The cache is stored
under `private/flashcard-images/`; the PDF defaults to `private/flashcard.pdf`. The PDF
command refuses to use missing or outdated snapshots, so rerun `flashcard-images` after
changing a question's visual. These files are private and must never be added to the
public site build. `flashcard` embeds the cached PNGs directly with ReportLab, avoiding
the slower pure-Python image conversion used by the retired PDF backend.

## Stage D – publish

```sh
python3 -m tools publish          # → dist/
python3 -m tools release-check    # also run automatically by publish
```

`publish` takes the newest approved revision of each question, re-runs all checks
against the current import, and refuses – writing nothing – if anything is wrong:
content changed after approval, unresolved source flags (`--skip-flagged` leaves those
questions out instead), failing checks, unapproved glossary terms or templates, unknown
templates, chapters that are not imported, invalid keys. The release check then scans
the staged build for disallowed file types, oversized files, symlinks, private markers
(chunk ids, private field names and paths, OCR annotations, credentials), non-public
bank fields and any 8-word passage shared with the imported textbook text.

`--without-source` publishes without the private import; source, page and copy checks
are then skipped. GitHub Actions builds the deployed site this way, which is why you run
a full `publish` locally before pushing.

## Adding new chapters (new scans)

1. Run the digitization pipeline for the new scans.
2. `python3 -m tools import --source …/output` – new chapters/sections are added to the
   registry; questions citing changed chunks are flagged.
3. `python3 -m tools chapters list` – check proposed headings and `ocr_issues`.
4. Author/generate, verify, review and approve questions for the new chapter.
5. `python3 -m tools publish` locally, then commit and push; GitHub Actions deploys it. The
   chapter becomes selectable once it has approved questions.

Chapters that exist only as chapter PDFs (`book/` in the export, see
[source-import.md](source-import.md#three-collections-2026-10-24)) follow the same steps,
with a chapter and section reference and no printed pages until the chapter is scanned.

## Deployment

The site at https://quiz.868.no/ is built and deployed by GitHub Actions on every push to
`main` that changes content or site code (see [architecture.md](architecture.md#deployment)):

```sh
python3 -m tools publish     # full local check against the private import; output is not committed
git add content && git commit -m "Approve …" && git push
```

The repository is public, so never commit anything from `private/` (it is git-ignored)
and never paste textbook text into questions, docs or commit messages. The preview
(`private/preview/`) must never be deployed; it fails the production release check by
design.

## Error reports from learners

Learners report problems as GitHub issues through the "Feil i et spørsmål" issue form
(`.github/ISSUE_TEMPLATE/sporsmal.yml`). The link under each question pre-fills the id
and version (also in the title, e.g. `[q-0012 v1]`), chapter, link and question text,
and `.github/workflows/issue-labels.yml` labels the report `kapittel N`. To act on one: `python3 -m tools review show q-0012`, then
`review edit q-0012` (creates a new draft revision), `verify`, `review approve`,
`publish` (local check), commit and push. The old revision stays published until the new one is approved.
