# Lisensøving – radioamatør

A Norwegian (bokmål) learning and quiz site for the amateur radio licence exam.
Visitors pick chapters, answer one question at a time and get immediate feedback:
whether they were right, the correct answer, an explanation, why their choice was
wrong, and where to read more in the textbook (chapter, section, printed page).
Questions answered wrong can be practised again, each question has its own link
(`#q-0045`), and after the first visit the site works offline.

The repository also contains the **offline editorial pipeline** that turns the
private textbook digitization exports into reviewed, original, publishable questions.

> **Status:** live at https://quiz.868.no/ with **121 approved questions** for chapters 2–6
> (chapters 7–16 are not scanned yet). Study page references have not yet been checked
> against the printed book; corrections are welcome as [GitHub issues](https://github.com/868-no/quiz/issues).

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

# 5. Build the public site from approved content only (full checks against the
#    private import), and serve it locally
python3 -m tools publish
python3 -m tools serve                    # serves dist/

# 6. Deploy: push; GitHub Actions builds the site from approved content and
#    publishes it to https://quiz.868.no/
git add content && git commit -m "Approve …" && git push

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
                                   dist/  index.html, styles.css, sw.js, js/, fonts/, data/bank.json
                                          (built and deployed by GitHub Actions on push)
```

| Stage | Command | What it does |
|---|---|---|
| Import | `import --source DIR` | Validates the actual export schema, snapshots it under `private/imported/<id>/`, diffs against the previous import and flags questions citing changed chunks. |
| A. Generate | `new --chunk UID` / `generate --chunk UID` | Manual draft skeleton mapped to source chunks, or LLM candidates (provider off by default; local first; remote only with explicit opt-in). |
| B. Verify | `verify` | Deterministic checks: schema, Norwegian, 4 options/1 key, units and notation, **independent recomputation** of calculations, figure/answer consistency, answer leakage, source/page validity, OCR hazards, near-verbatim copying, duplicates. |
| C. Review | `review show/approve/reject/request-changes/edit/retire/resolve-flag`, `glossary approve`, `visuals approve`, `chapters verify-section` | Local CLI with audit trail. Approval needs a named reviewer, a checklist, and explicit acknowledgement of OCR/page/figure hazards. |
| D. Publish | `publish`, `release-check` | Builds `dist/` from approved revisions only; refuses (writes nothing) on any problem; scans the build for private material. Run locally as the full check; GitHub Actions runs it again (without the private import) to build the deployed site. |

## Stack and why

* **Site:** static HTML + vanilla ES modules + CSS, no framework, no bundler, no runtime
  dependencies, hosted on GitHub Pages (https://quiz.868.no/). The site is small, and a
  static site is the lowest-maintenance safe deployment. Any static host works.
* **Tooling:** Python standard library only (no pip installs).
* **Content:** JSON files validated by the tools. No HTML is ever stored: text, math,
  glossary references, quantities and figures are typed structures rendered by an
  allowlisted renderer (`web/js/render/`).
* **No backend, accounts, cookies, analytics or LLM calls** on the public site. An
  in-progress quiz and the list of questions answered wrong are stored only in the
  visitor's browser (`localStorage`). After the first visit the site also works
  offline (service worker, `web/sw.js`).

More: [docs/architecture.md](docs/architecture.md).

## Documentation

* [docs/source-import.md](docs/source-import.md) – the observed export schema, import contract, re-import and change detection, page numbering.
* [docs/content-format.md](docs/content-format.md) – question, rich text, math, glossary and calculation formats.
* [docs/editorial-workflow.md](docs/editorial-workflow.md) – generate → verify → review → publish, adding chapters, re-review after new scans, glossary and headings, deployment.
* [docs/visual-templates.md](docs/visual-templates.md) – the nine original figure templates and how to configure or add them.
* [docs/architecture.md](docs/architecture.md) – stack, quiz engine, session policies, accessibility, security and privacy.

## Public vs private

The repository itself is public, so everything committed can be read by anyone.

| Path | On the site? | Committed (public repo)? | Contents |
|---|---|---|---|
| `private/` | **never** | **no** (`.gitignore`) | imported exports and figure crops, LLM prompts/outputs, check reports, audit log, preview build |
| `dist/` | **yes – this is the deployed site** | no (`.gitignore`; built and deployed by `.github/workflows/pages.yml`) | only `index.html`, `styles.css`, `sw.js`, `js/`, `fonts/`, `data/bank.json`, `CNAME`, `.nojekyll` |
| `web/` | yes (copied into `dist/`) | yes | site source code |
| `content/` | only the allowlisted projection in `data/bank.json` | yes | original questions (incl. review history), glossary, chapter registry, template schemas |
| `tools/`, `tests/`, `config/`, `docs/` | no | yes | pipeline, tests, configuration, documentation |

`content/` contains chunk *identifiers* and review history but no textbook text. The
public bank never contains chunk ids, source mappings, provenance, review data,
learning objectives or unapproved items; `release-check` enforces this.

## Open items

1. **Page references.** Approved questions cite chapter and printed page, but these have
   not yet been checked against the printed book.
2. **Copyright review** of the approach and the approved texts (the site is already
   public). Automated similarity checks are aids, not legal determinations.
3. **Section headings:** verify headings (`chapters verify-section`) so references can
   name the section; until then references show chapter and printed page only.
4. **Testing on real devices and screen readers** (VoiceOver, NVDA, TalkBack). UI
   behaviour is tested in a simulated DOM (jsdom), and the screens, figures and
   offline mode were checked in headless Chromium, but not on phones or with
   assistive technology.

Errors can be reported as [GitHub issues](https://github.com/868-no/quiz/issues); each question
shows its id after answering, with a link to a pre-filled issue that includes a link to the question.
