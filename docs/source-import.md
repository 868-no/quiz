# Source import

```sh
python3 -m tools import --source "/path/to/digitization/output" [--dry-run] [--force] [--no-figures] [-v]
```

The importer never needs the OCR pipeline; it only reads its exported files from a
directory you name. Nothing is hard-coded.

## What was actually found (2026-10-23)

The export at `Veien til internasjonal radioamatørlisens/output` contained 85 pages,
chapters 1–6 (of 16 according to the digitization project's README), 251 chunks and
320 visual elements. Files used:

| File | Required | Used for |
|---|---|---|
| `chunks.jsonl` | yes | text (private), chapter, section, printed/PDF pages, `marked_important`, `review_reasons`, `uid` |
| `manifest.json` | yes | chapters, per-page `printed_page` + `printed_page_status`, `page_number_issues`, scan hashes |
| `visuals.jsonl` | no | figure/equation/table list for the reviewer |
| `review/flags.jsonl` | no | OCR notation flags per element (attached to chunks) |
| `review/qa.json`, `qa_report.md` | no | QA status (copied into the snapshot) |
| `figures/*.png` | no | private crops for reviewers (copied unless `--no-figures`) |

`curriculum.pdf` and `pages/` are not copied. The expected fields and types are in
`tools/source_schema.py`. Missing required fields stop the import with a per-field
summary (nothing is written); missing optional fields are warnings; unknown fields
are reported as information so schema drift is visible.

Observations that shaped the importer:

* **Chunk `uid`** is stable across reruns; it is the identity used everywhere. The
  `chunk-NNNNNN` id is kept for convenience only.
* **Exam markers.** 115 chunks are `marked_important`; 105 contain a `[!]` paragraph
  marker, 10 do not (inherited from a heading or an illustration marker, per the rule
  on printed page 1-2). The export does not say which, so `marked_via` is
  `paragraph_marker` or `inherited_or_illustration`. A question's priority is
  `exam_important` only if a cited chunk is marked (checked by `verify`).
* **Printed vs PDF pages** are kept separate. 4 pages have `printed_page_status:
  inferred` (2-4, 2-5, 3-4, 5-4), and PDF page 8 has a page-number conflict. Chunks on
  such pages get `page_uncertainty`; citing those pages requires reviewer confirmation.
* **OCR hazards.** `review_reasons` such as `equation`, `numeric_low_conf`,
  `subscript_garbled`, `sign_ambiguous`, `possible_ohm`, `table` and any `[EQUATION …]`
  block mark a chunk as OCR-uncertain; questions citing it cannot be approved without
  `--ack ocr`.
* **Headings are sometimes garbled** (stray punctuation, `@` for `Ø`, nonsense words) or
  split over two lines. Sections are derived from chunk metadata and assessed
  (`ocr_quality`, `ocr_issues`).
* **No book text in the repository.** `content/chapters/chapters.json` stores neutral
  section ids (`s2-07`), a hash of each OCR'd heading (`heading_key`, used to recognise
  the section on re-import), pages and chunk uids – never the heading text. Proposed
  titles are computed from the private import when you run `chapters list`, and a
  section gets a `title` only when a person enters it. Public references only name a section after a person verifies the
  heading (`python3 -m tools chapters verify-section ID --title "…"`).

## Snapshots and identity

* `import_id = imp-<hash>` is derived from the SHA-256 of every source file used plus
  the importer version. Re-importing unchanged files is a no-op (`unchanged`).
* Each import is written atomically to `private/imported/<import_id>/`:
  `normalized.json` (pages, chapters, chunks with section ids and hazards),
  `diff.json`, `import.json` (source path, file hashes, coverage), `import_report.md`,
  `source/` (copied export files) and `figures/`.
* `private/imported/current.json` selects the import used by `verify`/`publish`;
  `index.json` is the history.
* Section ids live in `content/chapters/chapters.json` and are stable: on re-import a
  section is matched by chapter + OCR heading, then by shared chunk uids (so a heading
  that is re-OCR'd differently keeps its id). Imports add chapters/sections and update
  OCR metadata but never overwrite a curated title. Sections that disappear are kept
  and marked `missing_from_import`.

## Changed sources and re-review

Every import is diffed against the previous one: added, removed, text-changed
(`text_sha256`) and remapped chunks (chapter, section, printed/PDF pages, marker,
page reliability), plus pages whose printed number changed for the same scan.

Question revisions that cite a removed/changed/remapped chunk get a `source_changed`
flag listing the affected chunks. **The question's content and status are not
changed.** Publication refuses flagged revisions until a reviewer has checked them:

```sh
python3 -m tools review show q-0007                       # shows the flag and the new source text
python3 -m tools review resolve-flag q-0007 --reviewer N --note "kontrollert mot ny skanning"
#   or, if the question must be revised: review edit q-0007  (creates a new draft revision)
python3 -m tools publish --skip-flagged                    # publish everything else meanwhile
```

## Not verified / limits

* The schema is what was observed; the digitization project does not promise it.
* Figure crops are copied for reviewers but never analysed automatically.
* Formula text in the source is OCR and explicitly unverified; the pipeline never uses
  it to compute anything.
