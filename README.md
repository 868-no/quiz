# Lisensøving – radioamatør

A Norwegian (bokmål) learning and quiz site for the amateur radio licence exam.
Visitors pick chapters, answer one question at a time and get immediate feedback:
whether they were right, the correct answer, an explanation, why their choice was
wrong, and where to read more in the textbook (chapter, section, printed page).

The repository also contains the **offline editorial pipeline** that turns the
private textbook digitization exports into reviewed, original, publishable questions.

> **Status:** working end to end. The production build currently publishes
> **0 questions**: nothing has been approved by a human reviewer yet. 33 original
> draft questions (chapters 2–6) are ready for review (status `needs_review`).
> See [What remains before public deployment](#what-remains-before-public-deployment).

## Quick start

Requirements: Python ≥ 3.10 (standard library only). Node.js ≥ 18 is optional and
only needed for the JavaScript tests.

```sh
# 1. Import the digitization exports (private; nothing leaves private/)
python3 -m tools import --source "/path/to/Veien til internasjonal radioamatørlisens/output"

# 2. Run the automated checks on all questions
python3 -m tools verify

# 3. Look at everything, including unapproved drafts, in a PRIVATE preview
python3 -m tools preview
python3 -m tools serve --preview          # http://127.0.0.1:8000/

# 4. Review and approve (see docs/editorial-workflow.md)
python3 -m tools review show q-0001
python3 -m tools review approve q-0001 --reviewer "Navn" --ack ocr,figures --checklist all

# 5. Build the public site from approved content only, and serve it
python3 -m tools publish
python3 -m tools serve                    # serves dist/

# 6. Deploy dist/ to GitHub Pages (https://quiz.868.no/); see docs/architecture.md#deployment
python3 -m tools deploy --remote git@github.com:OWNER/quiz-site.git

# Tests
./run-tests.sh
```

`python3 -m tools --help` lists every command; `python3 -m tools status -v` gives an overview.

## How it fits together

```text
PRIVATE (git-ignored, never deployed)                 PUBLIC
digitization exports ──import──▶ private/imported/<import_id>/
                                     │ source chunks, pages, OCR flags, markers
                                     ▼
content/ (original, version-controlled)
  questions/q-NNNN.json   draft → verify → needs_review → human approve
  glossary/terms.json     approved terms only are published
  chapters/chapters.json  stable section ids; headings shown only once verified
  visuals/templates.json  parameter schemas of original visual templates
                                     │ python3 -m tools publish (fail closed)
                                     ▼
                                   dist/  index.html, styles.css, js/, data/bank.json
```

| Stage | Command | What it does |
|---|---|---|
| Import | `import --source DIR` | Validates the actual export schema, snapshots it under `private/imported/<id>/`, diffs against the previous import and flags questions citing changed chunks. |
| A. Generate | `new --chunk UID` / `generate --chunk UID` | Manual draft skeleton mapped to source chunks, or LLM candidates (provider off by default; local first; remote only with explicit opt-in). |
| B. Verify | `verify` | Deterministic checks: schema, Norwegian, 4 options/1 key, units and notation, **independent recomputation** of calculations, figure/answer consistency, answer leakage, source/page validity, OCR hazards, near-verbatim copying, duplicates. |
| C. Review | `review show/approve/reject/request-changes/edit/retire/resolve-flag`, `glossary approve`, `visuals approve`, `chapters verify-section` | Local CLI with audit trail. Approval needs a named reviewer, a checklist, and explicit acknowledgement of OCR/page/figure hazards. |
| D. Publish | `publish`, `release-check` | Builds `dist/` from approved revisions only; refuses (writes nothing) on any problem; scans the build for private material. |

## Stack and why

* **Site:** static HTML + vanilla ES modules + CSS, no framework, no bundler, no runtime
  dependencies, hosted on GitHub Pages (https://quiz.868.no/). The machine this was built on had no Node/npm, the site is small, and
  a static site is the lowest-maintenance safe deployment. Any static host works.
* **Tooling:** Python standard library only (no pip installs).
* **Content:** JSON files validated by the tools. No HTML is ever stored: text, math,
  glossary references, quantities and figures are typed structures rendered by an
  allowlisted renderer (`web/js/render/`).
* **No backend, accounts, cookies, analytics or LLM calls** on the public site. An
  in-progress quiz is stored only in the visitor's browser (`localStorage`).

More: [docs/architecture.md](docs/architecture.md).

## Documentation

* [docs/source-import.md](docs/source-import.md) – the observed export schema, import contract, re-import and change detection, page numbering.
* [docs/content-format.md](docs/content-format.md) – question, rich text, math, glossary and calculation formats.
* [docs/editorial-workflow.md](docs/editorial-workflow.md) – generate → verify → review → publish, adding chapters, re-review after new scans, glossary and headings, deployment.
* [docs/visual-templates.md](docs/visual-templates.md) – the four original templates and how to configure or add them.
* [docs/architecture.md](docs/architecture.md) – stack, quiz engine, session policies, accessibility, security and privacy.

## Public vs private

| Path | Public? | Committed? | Contents |
|---|---|---|---|
| `private/` | **never** | **no** (`.gitignore`) | imported exports and figure crops, LLM prompts/outputs, check reports, audit log, preview build |
| `dist/` | **yes – this is the deployable site** | no (build output; pushed only to the site repo's `gh-pages`) | only `index.html`, `styles.css`, `js/`, `data/bank.json`, `CNAME`, `.nojekyll` |
| `web/` | yes (copied into `dist/`) | yes | site source code |
| `content/` | only the allowlisted projection in `data/bank.json` | yes | original questions (incl. drafts), glossary, chapter registry, template schemas |
| `tools/`, `tests/`, `config/`, `docs/` | no | yes | pipeline, tests, configuration, documentation |

`content/` contains chunk *identifiers* and review history but no textbook text. The
public bank never contains chunk ids, source mappings, provenance, review data,
learning objectives or unapproved items; `release-check` enforces this.

## What remains before public deployment

1. **Human review.** No question, glossary term, visual template version or section
   heading has been approved. Every item was drafted by an AI assistant from the
   imported source text and must be checked by a competent person against the printed
   book (technical correctness, single defensible answer, originality, study reference).
2. **Copyright review** of the approach and the approved texts before launch.
   Automated similarity checks are aids, not legal determinations.
3. **Section headings:** verify headings (`chapters verify-section`) so references can
   name the section; until then references show chapter and printed page only.
4. **Manual browser testing** on real devices and screen readers (VoiceOver, NVDA,
   TalkBack). UI behaviour is tested in a simulated DOM (jsdom), and the figures were
   rendered and inspected, but no real browser was available in the build environment.
5. GitHub Pages setup for quiz.868.no: a separate public site repository, DNS `CNAME`,
   verified domain and *Enforce HTTPS* – see [docs/architecture.md](docs/architecture.md#deployment).
   Keep this source repository **private**.
