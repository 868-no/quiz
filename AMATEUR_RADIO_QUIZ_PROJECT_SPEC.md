# Project Specification: Norwegian Amateur Radio Learning & Quiz Website

**Status:** Implementation specification for Claude Code  
**Project type:** New, independent repository  
**Primary language:** Norwegian Bokmål (`nb-NO`)  
**Audience:** Candidates preparing for the Norwegian amateur radio operator licence examination  
**Source:** Structured exports from a *separate, existing* textbook digitization project

---

## 1. Objective and guiding principles

Build a publicly accessible, Norwegian-language learning and quiz website covering the curriculum for Norway's amateur radio operator licence examination. Visitors choose which *available* chapters to practise, answer questions one at a time, receive immediate and substantive educational feedback, and get precise references to where they can study the topic further in their own copy of the textbook.

This is a **learning platform first, exam simulator second**. It should help learners understand electronics and radio technology, not simply memorize answer letters.

Non-negotiable principles:

1. **Original public content.** All published questions, answer choices, explanations, circuit diagrams, figures, and animations must be newly authored for this project. Do not publish or reuse scans, OCR text, textbook figures, cropped images, or near-verbatim textbook passages. The private source material is for grounding, topic coverage, and references—not public distribution.
2. **Technical correctness.** Treat generated questions as untrusted drafts until verified. A plausible but incorrect component value, formula, polarity, sign, unit, or distractor is a defect.
3. **Understandable questions.** Give the context, assumptions, and units needed to understand the problem without giving away its answer.
4. **Teach after every answer.** Immediately reveal correctness, identify the correct answer, provide a useful explanation, and point to the relevant textbook chapter/section/printed page.
5. **Structured, reusable content.** Store the question independently of its presentation; use shared glossary entries and configurable visual components rather than generating HTML or bespoke SVG for each question.
6. **Deliberate publication.** Separate generation, verification, approval, and publication. The public application must serve only approved content.
7. **Minimal operational burden.** No LLM calls are needed to serve an ordinary quiz. Prefer a static or otherwise lightweight public deployment unless requirements demonstrate a need for a runtime backend.

## 2. Project boundary and relationship to the digitization project

This must be a **separate repository/project** from the OCR/digitization pipeline.

The existing project has processed 85 scanned pages and reports outputs including:

- `curriculum.pdf` — private searchable PDF;
- `curriculum.md` and `pages/` — private extracted text;
- `chunks.jsonl` — structured text chunks and source references (previous run reported 251 chunks);
- `manifest.json` — scan, PDF, printed-page, and chapter mapping;
- `visuals.jsonl` and `figures/` — private image crops and formula/diagram references;
- `qa_report.md` — processing confidence, review flags, and source limitations.

These are **reported interface characteristics**, not a guaranteed schema. **Inspect actual available files and fields before writing the importer.** Do not fabricate missing fields or assume the present scan set covers the whole book. More chapters will be scanned later.

```text
PRIVATE / OFFLINE                                      PUBLIC

Existing digitization repo
  Scans -> OCR -> structured exports
                 |
                 | explicit, versioned import
                 v
New quiz repo
  private staging/source data (never deployed)
      -> topic mapping / glossary
      -> candidate question generation
      -> independent technical checks + human review
      -> approval and publishing
      -> public question bank + original visual assets
                                           |
                                           v
                                   Quiz website (nb-NO)
```

### Import contract

Implement an offline import command accepting a configurable path to the other project's export directory; do not couple the code to a hardcoded sibling directory or require the OCR pipeline at runtime.

The importer must:

- inspect and validate the actual source schema, with clear diagnostics for absent/changed fields;
- preserve chapter, section, printed textbook page, PDF page, source chunk IDs, and the source version/hash *internally* where available;
- retain the textbook's `!` / `marked_important` examination-priority markers, including the documented rule that a marker on a heading applies to its descendants; do not assume that the marker lives on every chunk;
- retain OCR warnings and flags, particularly **unverified equations**, uncertain numbers/units, diagrams requiring visual interpretation, and page mapping ambiguity;
- maintain stable internal identifiers for source, chapters, and topics across repeat imports where possible;
- detect changed, added, removed, or remapped source content and flag affected candidate/published questions for re-review, **not silently rewrite them**;
- create an import/version manifest and enable a safe, repeatable import;
- keep imported scans, text, and image crops wholly outside the site's public build/static directories and public APIs.

If imported source references are ambiguous, do not mark a generated question as validated. Source page numbers can mean **PDF page indices** or **printed page numbers**; keep these distinct.

## 3. Intended user experience

### 3.1 Landing and setup

Without an account, a visitor can:

- view available chapters with chapter numbers/titles and, optionally, available question counts;
- select any combination of available chapters, select all, or clear the selection;
- choose the number of questions, subject to the number available for the selection;
- optionally select question difficulty and/or question styles if enough content exists;
- start a randomized quiz consisting **only** of questions mapped to their selected chapters.

Chapters not yet scanned or without approved questions must be visibly unavailable, not offered as if complete. Handle a selection with insufficient questions gracefully; do not silently include other chapters or duplicate questions to reach the requested count.

### 3.2 A question

Each screen should present:

- progress (e.g. `Spørsmål 4 av 10`), chapter/topic context, and a clear Norwegian question;
- a sufficiently developed explanation of the scenario/conditions **before answering**, when needed for clarity;
- four plausible answer alternatives for the initial single-answer multiple-choice format;
- an original, technically accurate diagram/animation where it improves comprehension;
- unobtrusive access to English equivalents of selected Norwegian technical terms;
- a clear submission control.

Avoid artificial complexity. The explanation *before* answering must **not disclose the answer**. Questions should not be ambiguously phrased or rely on unstated circuit conditions, unstated rounding, or unexplained notation.

### 3.3 Immediate feedback

Upon submission, in the same question view:

1. Lock the submitted answer so it cannot be changed or scored repeatedly.
2. State whether it was correct.
3. **Always** reveal and clearly indicate the correct answer (especially on an incorrect response).
4. Explain the principle, reasoning, or calculation behind the correct answer.
5. Explain why the selected wrong choice is wrong; where useful, provide explanations for all distractors.
6. Include a study reference to the **printed textbook page**, chapter, and section where these are known. If a finer reference is unverified, show the reliable broader location instead; do not fabricate a page reference.
7. Provide an obvious `Neste spørsmål` action.

Correct answers should also receive an instructional explanation, rather than merely a success indicator. For calculations, show the working, units, assumptions, and significant figures/rounding. It must be impossible to infer that an incorrect answer was correct from confusing visual states.

After the final question, show a score, per-chapter breakdown where useful, and a review of the questions—particularly those answered incorrectly—with explanations and study references.

### 3.4 Language and glossary

User-facing navigation, questions, choices, feedback, and study references use **Norwegian Bokmål**. Technical terms may show their conventional English equivalents on hover, click/tap, and keyboard focus, like explanatory popovers in news articles.

Requirements:

- centrally managed glossary; examples of entry fields: stable ID, Norwegian label(s), English equivalent(s), concise Norwegian definition, optional related terms;
- allow multiword terms and inflected Norwegian forms;
- explicit semantic term references in structured content instead of fragile regex replacement across arbitrary strings;
- accessible on mobile, desktop, touch, and keyboard; opening a popover must not accidentally select an answer;
- no reliance on hover alone; clear focus states, escape/close behavior, accessible labels;
- avoid excessive highlighting, and avoid glossary definitions that leak the answer while the question is unanswered.

The primary text must remain understandable without activating tooltips. English terms are optional aids, not an alternative website language or a reason to switch the UI to English.

## 4. Question bank: data model and separation from presentation

**Never store the question as a blob of hand-authored HTML or as a screenshot.** Use typed, validated content records. The UI renders structured text, math, glossary spans, answers, feedback, references, and visual component configurations.

Suggested conceptual entities (adapt the exact storage representation as appropriate):

- `CurriculumVersion`: source-import ID, hashes, import date, coverage.
- `Chapter` / `Section` / `Topic`: stable identifiers, Norwegian titles, ordering, availability.
- `GlossaryTerm`: Norwegian and English labels and explanations.
- `Question`: stable question ID + revision, original text, format, difficulty, learning objective, chapter/topic mappings, options, correct key(s), feedback, source-reference metadata, visual configuration, tags, review/publication state.
- `QuestionSource`: private link to chunks and scans, public-safe printed-page/section citation, import/version association.
- `VisualAsset`: original component/template ID, configuration schema, description, revision, approval state, optional preview.
- `ReviewRecord`: reviewer, state change, date, check results, justification, generator/model provenance where available.

Separate **question identity**, **question revision**, and **source version** so updates do not silently change a historical question's correct answer. Questions must be uniquely identifiable even after shuffling answer order.

Example **illustrative shape**, not a fixed schema:

```json
{
  "id": "q-000123",
  "revision": 1,
  "status": "approved",
  "language": "nb-NO",
  "type": "single_choice",
  "chapter_ids": ["chapter-03"],
  "topic_ids": ["capacitive-reactance"],
  "difficulty": "medium",
  "learning_objective": "Understand how capacitive reactance changes with frequency",
  "priority": "exam_important",
  "stem": [
    {"type": "text", "value": "Hva skjer med "},
    {"type": "glossary_term", "term_id": "kapasitiv-reaktans", "value": "kapasitiv reaktans"},
    {"type": "text", "value": " når frekvensen øker og kapasitansen er konstant?"}
  ],
  "options": [
    {"id": "opt-a", "content": "Den øker.", "feedback": "..."},
    {"id": "opt-b", "content": "Den minker.", "feedback": "..."},
    {"id": "opt-c", "content": "Den er uendret.", "feedback": "..."},
    {"id": "opt-d", "content": "Den blir alltid null.", "feedback": "..."}
  ],
  "correct_option_ids": ["opt-b"],
  "explanation": "...",
  "visual": {"type": "circuit", "template_id": "ac-capacitor-v1", "parameters": {"capacitance_nf": 100}},
  "study_reference": {"chapter": "3", "section": "...", "printed_pages": ["3-12"]},
  "private_source_chunk_ids": ["chunk-000123"]
}
```

The illustrative text above is **not** an approved question or a claim about what appears on that textbook page. Generate and verify real content against the imported materials.

The **public export** must be an allowlisted projection of approved records: strip private chunk text, local source paths, raw OCR, prompt traces, credentials, unapproved drafts, internal notes, and unnecessary generator metadata. The public study-reference fields may contain chapter/section/printed-page labels, but must not link to private scans or reproductions.

Question and visual content may be revised independently. Model future quiz modes (e.g. exam mode with deferred feedback) as **presentation/session policies**, not as separate copies of the questions.

## 5. Original visual asset system — core architecture, not an add-on

The visual system must be present in the initial implementation. Avoid one-off hand-coded visuals embedded in individual question pages.

Create a centralized library of **original, reusable, parameterized visual templates**, rendered from structured configurations. Prioritize SVG for static technical illustrations and SVG/CSS/canvas as appropriate for controlled animations. Appropriate initial examples include:

- a configurable DC circuit (battery, resistor, voltmeter/ammeter, component values);
- an AC source with resistor/capacitor/inductor;
- labeled waveforms (frequency, amplitude, phase);
- a simple signal path or radio transmitter/receiver block diagram.

Choose a **small, fully functional set**, then extend it as questions require; do not build a general-purpose SPICE simulator in the MVP. Store asset/template IDs and parameters in question data, not rendered HTML or screenshots.

Each visual template needs:

- a typed parameter schema with validation (units, plausible ranges, component types, allowed connections);
- an original rendering/animation implementation, not copied from the textbook;
- accessible labels, accompanying text, keyboard/touch interaction when interactive;
- a static fallback for animations or disabled scripting;
- reduced-motion handling (`prefers-reduced-motion`), and no gratuitous movement;
- clear indication of idealized vs real-world behavior where that affects correctness;
- technical review and tests for values, circuit topology, polarity, units, symbols, and visual/answer consistency;
- stable versioning so improvements do not silently change the meaning of published questions.

Use mathematically calculated data for waveforms/graphs rather than AI-generated raster images. A later authoring tool may create new original figures, but no published illustration may be derived by tracing or substantially reproducing a textbook figure. Diagrams are educational content requiring the same review as the questions.

Support reusable `visual_id`/template references from many questions, with different parameters. A question can optionally use the same diagram in multiple states before and after feedback.

## 6. Question generation, verification, review, and publication

Implement **four separate offline stages**. None of these should occur on the public user's request path.

### Stage A — Candidate generation

- Use private imported curriculum data to identify learning objectives and generate **original Norwegian** question candidates.
- Prefer exam-relevant topics from the `!` markers, while retaining broad coverage and avoiding overconcentration.
- Generate varied question types by learning objective: recall, conceptual reasoning, practical scenarios, and calculations. For MVP, publish only single-answer, four-choice questions; define extensible types for later.
- Write plausible, distinct distractors with only one defensible answer.
- Provide both a contextual question and a complete feedback explanation, plus wrong-answer feedback and source mappings.
- Keep generation prompts, selected source chunks, output, generator/model/version, and parameters in private, auditable records.
- Allow a configurable LLM provider, local inference, and manual candidate entry. Never require an online LLM to run the public website. Do not make surprise external API calls or upload copyrighted source data without explicit configuration/authorization.

### Stage B — Automated verification

Check candidate questions for:

- schema validity, Norwegian text, completeness, answer uniqueness, and appropriate option counts;
- technical notation and unit correctness; calculation agreement, rounding, and significant figures;
- agreement between the correct key, explanation, distractor feedback, and visual parameters;
- ambiguity, answer leakage in question text or glossary popovers, repeated/rephrased duplicates;
- source/reference validity and consistency with source import;
- OCR-related hazards (especially unverified equations and suspect numerical expressions);
- possible verbatim/near-verbatim copying of source passages, and unauthorized source images.

Automated verification can use a separate LLM pass, deterministic checks, and/or independently computed results, but **an LLM approving its own output does not equal human verification**. Label verification status accurately. Reject or flag uncertain content; do not guess missing mathematical content based solely on OCR.

### Stage C — Human editorial and technical review

Provide an offline/local review workflow (CLI or internal-only UI; no public admin interface is necessary for MVP) to:

- inspect question, options, explanation, associated private source context, figure/formula crops, and proposed original visuals;
- edit, approve, reject, regenerate, and record review notes;
- check that exactly one choice is defensibly correct for single-choice items;
- independently validate calculations, source references, and the originality/correctness of illustrations;
- require review of any candidate derived from an OCR-uncertain formula or visual region;
- keep an audit trail of editorial changes.

States should distinguish at least `draft`, `needs_review`, `approved`, `rejected`, and `retired`. Automatic QA success must not automatically publish a question. If automated visual/content review is provided, it should assist rather than silently replace editorial approval.

### Stage D — Publication

An explicit command/build step exports only approved, current, publishable question revisions, approved glossary entries, and original approved visual resources. Validate public artifacts before deployment. Fail closed if they reference missing glossary terms, unknown visual templates, unavailable chapters, or invalid correct keys.

Allow regenerating affected questions after new scans or corrected OCR without losing the identities or approvals of unrelated questions. Re-review affected content before republishing.

## 7. Quiz engine and modes

### MVP session behavior

- Visitor selects chapters and number of questions.
- Sample approved questions from those chapters only, without duplicates in a session.
- Use unbiased question selection; vary topics/sections sensibly when the pool permits.
- Shuffle question order and answer options while retaining stable option IDs and correct-key mapping.
- Display one question at a time, require explicit answer submission, and lock the result.
- Show immediate feedback as defined in Section 3.3; do not allow advancing before feedback is available.
- Show final score and a review including the visitor's submitted choice, correct choice, explanation, and study reference.
- Support restarting and starting a new quiz with revised chapter choices.
- Avoid collecting personal data unnecessarily; no accounts or public leaderboard for the MVP.
- Optionally keep an in-progress quiz in browser-local state, with an intentional reset mechanism; do not store private source material in that state.

### Extensibility

Design the session policy so later additions do not require duplicating question records:

- `learning` mode (MVP): immediate feedback;
- `exam` mode (future): feedback only after the final submission;
- future multiple-answer questions, visual identification, and calculations;
- future spaced repetition and progress history.

**Do not implement exam mode or user accounts in the initial release unless necessary to meet MVP needs.** Design for them, don't let them expand the first delivery.

## 8. Website and accessibility

Use a modern, lightweight, responsive interface suitable for desktop and mobile. Prefer maintainable, widely used technologies; inspect the environment and document the frontend/build/deployment choices rather than requiring a particular framework without evidence.

Specific requirements:

- Norwegian Bokmål labels, instructions, feedback, and errors;
- visible focus rings, keyboard-only navigation, accessible popovers and inputs;
- semantic markup and screen-reader announcements for submitted-answer feedback;
- do not communicate correctness by color alone; use text/icons as well;
- good contrast, readable math and symbols, zoom/responsive support;
- diagrams with informative alternative text or nearby accessible description;
- respect reduced motion; avoid animations that interfere with concentration;
- support equations and subscripts/superscripts accurately, with appropriate accessible alternatives;
- guard against unsafe rendering of imported/generated text: allowlisted structured rendering or sanitized Markdown rather than unrestricted HTML;
- clear empty/error states when chapters or questions are not available.

The user should not have to understand the textbook's internal chunk IDs or metadata. Refer to chapters and page numbers using ordinary educational language.

## 9. Security, privacy, and copyright boundaries

Assume the underlying book is copyrighted unless permission indicates otherwise.

**Never publicly expose** source images, scanned PDF, OCR text, source crops, private chunks, or long passages in build artifacts, client bundles, downloadable files, URLs, HTML, API responses, logs available to users, or hosted repositories. Include a release check that scans deployable assets for forbidden paths/types and unexpected large text/images originating from the source.

All questions and diagrams must be **independently written/drawn**. Do not copy textbook-specific prose, captions, layouts, artwork, or examples closely enough to substitute for the source. Standard scientific facts, terms, equations, and conventional circuit symbols can be used, with original explanations and diagrams. Source references are bibliographic pointers for readers with lawful access to the textbook, not permission to distribute the underlying pages. Review copyright compliance before a public launch; automated similarity checks are aids, not legal determinations.

- Keep private import/generation directories explicitly excluded from static hosting, the frontend build, and deployment packaging.
- Never commit API keys, credentials, or raw private data to a public repository.
- Keep LLM processing local by default if available; any external provider must be a conscious configuration choice.
- Do not expose review/publish operations as unauthenticated public endpoints.
- No analytics, cookies, accounts, or personal data collection are required for MVP.

## 10. Recommended project structure

Adapt paths to the selected stack, while preserving private/public isolation and clear responsibilities.

```text
amateur-radio-quiz/
├── README.md
├── PROJECT_SPEC.md
├── config/
├── private/                  # ignored, never part of deployment
│   ├── imported/             # output imported from digitization project
│   ├── generation/           # prompts, draft candidates, evidence
│   └── reviews/              # editorial and QA records
├── content/                  # authored, approved, version-controlled records
│   ├── chapters/
│   ├── glossary/
│   ├── questions/
│   └── visuals/
├── tools/                    # import, generate, verify, review, publish
├── src/
│   ├── components/           # question UI, glossary popovers, feedback
│   ├── visuals/              # reusable diagram/animation templates
│   ├── quiz/                 # selection, scoring, session policies
│   └── content/              # schemas, public content loading
├── tests/
├── dist/                     # deployable, approved public artifacts only
└── .gitignore
```

Private source files should be excluded from source control by default, even in a private repository, unless an explicit, legally appropriate data-handling policy is chosen. Approved original question content and original visual code may be version controlled. A separate deployable/public export should strip *all* internal-only properties.

## 11. Suggested implementation sequence

**Phase 1 — Discovery and contracts**

1. Inspect the environment and the actual digitization export schema, if accessible.
2. Establish import validation, source/version identity, and private/public data boundaries.
3. Define typed question, answer, glossary, citation, and visual configuration schemas.
4. Document the selected stack and deployment assumptions; avoid unnecessary dependencies.

**Phase 2 — Working website and quiz engine**

1. Build chapter selection and question-count setup.
2. Implement one-at-a-time questions, stable scoring, option shuffling, answer locking, immediate feedback, final results, and incorrect-answer review.
3. Implement accessible glossary popovers and source references.
4. Use a **small, explicitly labeled development fixture bank** of independently written questions to exercise the UI. Do not silently pass fixtures off as approved production material.

**Phase 3 — Core original visuals**

1. Build the typed, reusable visual registry and renderer.
2. Implement at least two original, parameterized illustration types appropriate to real questions (for example a simple circuit and waveform).
3. Add static fallbacks, accessible descriptions, reduced-motion behavior, and visual correctness tests.

**Phase 4 — Offline editorial pipeline**

1. Implement import from the existing scan-processing exports.
2. Implement provider-configurable candidate generation and/or manual question authoring.
3. Add automated checks, source/OCR risk handling, and local editorial review.
4. Publish an approved-only question bank through an explicit build step.
5. Demonstrate a small sample of genuinely reviewed, original questions across available chapters, **only where source review supports them**.

**Phase 5 — Hardening and documentation**

1. Integration and accessibility tests, including touch/keyboard behavior.
2. Verify no protected source material leaks into deployable output.
3. Validate chapter filtering, answer uniqueness, technical correctness, citation reliability, and visuals.
4. Document adding new chapters, regenerating/re-reviewing questions, editing glossary terms, publishing, and deployment.

Prefer a genuinely working vertical slice over a large unverified bank or a beautiful frontend with hard-coded questions. If a needed source export is not available to the Claude Code workspace, implement a documented importer and tests/fixtures, report what could not be exercised, and do not pretend source-grounded questions were verified.

## 12. Automated tests and acceptance criteria

### Content and architecture

- [ ] Actual import files are inspected/validated; repeat imports are safe and versioned.
- [ ] Private scan/OCR/crop content never enters the public build; release validation confirms this.
- [ ] Question content is structured separately from UI rendering.
- [ ] Only approved questions and approved original visuals can be published.
- [ ] A change in imported source can trigger re-review of affected questions.
- [ ] Exam-importance metadata is carried through accurately where source evidence exists.
- [ ] Public references cite printed pages distinctly from PDF pages.

### Quiz behavior

- [ ] A visitor can select any combination of *available* chapters and a question count.
- [ ] Questions outside selected chapters never appear; insufficient stock is handled explicitly.
- [ ] Each question can be submitted only once; shuffle never changes which answer is correct.
- [ ] Feedback appears immediately with the correct choice, reasoning, and an honest study reference.
- [ ] Final summary and incorrect-answer review work without accounts.
- [ ] Test cases include all-correct, all-wrong, partial, no-data, invalid-data, and shuffled scenarios.

### Explanations and presentation

- [ ] The question is understandable without giving away its answer.
- [ ] Glossary offers English equivalents on hover, click, keyboard, and touch.
- [ ] Question text is not hand-authored HTML; math, glossary terms, and visuals use structured renderers.
- [ ] At least two reusable, parameterized original visual templates function in the initial implementation.
- [ ] Feedback and diagrams are accessible without color alone or forced animation.
- [ ] Calculated examples and diagrams are checked for mathematical and electrical consistency.

### Generation and publishing

- [ ] Candidate generation, automated checks, human review, and publication are distinct processes.
- [ ] OCR-uncertain material cannot be automatically treated as verified.
- [ ] Rejected/unapproved/demo questions never appear in the production bank.
- [ ] Public build contains no scans, original book figures, OCR passages, or private chunk data.
- [ ] The documentation makes the question-approval workflow and publication boundary clear.

## 13. Explicitly out of scope for MVP

- User accounts, cloud-stored learning history, leaderboards, payments, or advertising.
- Live LLM responses or AI-generated questions during a visitor's quiz session.
- Hosting or redistributing any scanned textbook material.
- A complete animated electronics simulator or arbitrary user-editable circuit simulator.
- Building the entire future exam mode, adaptive learning, or spaced-repetition system now.
- Automatically publishing thousands of unreviewed questions.

## 14. Instructions to Claude Code

**Implement this as a new project, not as an extension of the digitization codebase.** Begin by inspecting the files and execution environment available to you; inspect the actual source exports if provided. Do not assume that the reported file counts or JSON structure are guaranteed.

Make pragmatic stack decisions and implement an end-to-end MVP with tests, documentation, and a production-safe publish boundary. Use existing libraries where they improve reliability, but avoid unnecessarily complex infrastructure.

Do **not** treat automated test success as evidence that generated technical questions are correct or copyright-safe. Keep editorial approval explicit and auditable.

Do not generate or publish fictitious textbook citations. If the imports are unavailable, build and test the application and importer with clearly labeled synthetic fixtures, and report the missing integration honestly.

At completion, report:

1. What was actually implemented and demonstrated.
2. How to run/develop/test the site and import data.
3. How to generate, verify, review, approve, and publish questions.
4. Which original visual templates exist and how to reuse/configure them.
5. What tests passed and what remains unverified/manual.
6. Exactly which files/directories are public versus private.
7. What remains before it is safe to deploy publicly.

## 15. Implementation update — 2026-10-25

The offline tooling generates a printable A4 flashcard PDF from the selected question revisions. Each sheet holds up to eight landscape cards in a 2-column by 4-row grid. Each card has the question in its upper half and the FASIT answer and explanation in its lower half. Print at 100% scale, cut along the heavier dotted card borders, and fold along the thinner horizontal center line. The introductory page explains the workflow, shows the NRRL, quiz, and GitHub links, and includes an icon legend. On the cards, the book icon marks the study reference; the robot and person marks show machine and human verification status, respectively, using review metadata. Study references show chapter and printed page numbers, or the section title when page numbers are unavailable.

Calculation variants are included as separate cards by default; `--no-variants` on both `flashcard-images` and `flashcard` limits the output to each question's base form. The large card heading is a running number, while the small upper-right q-code is `q-NNNN` for a single form or `q-NNNN-Y` for a variant (for example, `q-0349-1`). Keep the variant option consistent between cache generation and PDF export.

The `flashcard-images` command uses Node.js and Inkscape to render the quiz's SVG visuals as cached PNGs under `private/flashcard-images/`. The `flashcard` command uses the cached images and Python packages pinned in `requirements-flashcard.txt` (Pillow 13.0.0 and ReportLab 5.1.0); it does not need Node.js or Inkscape when the cache is current. A virtual environment is recommended. The cache and generated PDF are private and must not be included in the public website build.

The current variant-enabled export contains 433 cards across 56 A4 pages: one introductory page and 55 card sheets. The generator emitted no fit warnings, and the output contains no overflow-text appendix. The current test run passed all 120 Python tests and 60 JavaScript tests. Thirty-one jsdom-dependent JavaScript tests and two Playwright accessibility/layout checks were skipped because those packages were unavailable in the environment.

AI assistance for this implementation: GitHub Copilot. The exact underlying model name/version was not exposed in the session and is therefore unrecorded; do not infer or fabricate it. Record the model/version in future implementation notes when the tooling makes it available.
