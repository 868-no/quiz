# Architecture

## Layout

```text
web/                      site source (copied verbatim into dist/)
  index.html styles.css
  js/main.js              boot: load + validate data/bank.json, start the app
  js/content/bank.js      defensive bank validation (invalid questions are dropped)
  js/quiz/                engine.js (pure), policies.js, rng.js, storage.js
  js/render/              vnode.js (allowlisted DOM builder), richtext.js, format.js
  js/visuals/             registry.js, schema.js, svg.js + one module per template
  js/ui/                  app.js (screens), glossary.js (popovers)
tools/                    offline pipeline (python3 -m tools …)
content/                  original content (questions, glossary, chapters, template schemas)
config/generation.json    LLM provider configuration (off by default)
tests/python, tests/js    test suites; tests/fixtures shared cases
private/                  git-ignored; imports, generation runs, reviews, preview
dist/                     build output = the deployable site
```

## Quiz engine and session policies

`web/js/quiz/engine.js` is pure and fully unit-tested:

* `pool` – questions in the selected, *available* chapters matching optional
  difficulty/style filters. Unavailable chapters can never contribute.
* `selectQuestions` – shuffle within each section, visit sections round-robin in random
  order, shuffle the result: no duplicates, topics spread out, every question in a
  section equally likely. Insufficient stock returns an error; nothing is padded.
* `createSession` – stores `{qid, rev, order, answer}` per item plus the seed, so a
  session can be persisted and restored exactly. Option order is shuffled; option ids
  and the correct key never change.
* `submitAnswer` – only once per item (throws otherwise); correctness is computed from
  the bank, never trusted from storage. `restoreSession` discards a stored session if
  any question or revision is no longer published.
* **Policies** (`policies.js`): `learning` (immediate feedback, cannot advance before
  feedback) is the MVP. `exam` (deferred feedback) is defined but disabled; adding it is
  a UI change, not a content change. Future multiple-answer/numeric types are reserved
  in `TYPES` (`tools/questions.py`); spaced repetition would build on the stable
  `qid`/`rev` identifiers.

## Rendering and safety

* Content is never HTML. `vnode.js` builds DOM only from an allowlist of tags and
  attributes, using text nodes; no `innerHTML` anywhere.
* `index.html` sets a strict Content-Security-Policy (`default-src 'self'`, no inline
  scripts/styles, `form-action 'none'`, `base-uri 'none'`).
* `localStorage` stores only question ids, revisions, option order and chosen ids,
  plus the ids of questions answered wrong (with a timestamp); every access is wrapped so the quiz works when storage is blocked.
* `sw.js` (service worker) keeps an offline copy of the whole build. `publish` fills in
  its file list and a version hash of every file; the release check fails if the list
  or version does not match the build. A new publish installs the new copy, drops the
  old one, and offers open pages a reload. Unpublished copies (`web/`, previews) cache
  nothing.

## Accessibility

* Semantic structure (headings, fieldset/legend-equivalent `aria-labelledby`, native
  radio buttons, `<details>` for optional detail), skip link, visible focus rings,
  44 px touch targets, zoom-friendly layout down to 320 px, light/dark themes.
* After submitting, focus moves to the feedback heading inside a polite live region.
  Correctness is shown with text and icons (✓/✗, "Ditt svar – feil", "Riktig svar")
  plus border style, never colour alone.
* Glossary terms are `<button>`s: preview on hover and keyboard focus, pinned on
  click/tap/Enter, closed with Escape (focus returns), the × button or a tap elsewhere.
  Clicks on a term or its popover cannot activate the answer label. Terms whose
  definition would reveal the answer are plain text until the question is answered.
* Math uses real sub/superscripts and fractions with a spoken Norwegian `aria-label`.
* Figures: `role="img"` + title + description, visible text description, idealisation
  note, no forced animation, `prefers-reduced-motion` respected.

## Privacy and copyright boundary

* The site has no backend, accounts, cookies, analytics or third-party requests.
* Private data lives only in `private/` (git-ignored). The public bank is an allowlisted
  projection (`tools/publish.py: project_question`), and `tools/release_check.py` scans
  every build. Tests cover leaks of chunk ids, private paths, OCR text and image files.
* LLM use is offline, off by default, local-first; remote providers require an explicit
  `allow_external_upload` decision.

## Deployment

The site is deployed to **GitHub Pages at https://quiz.868.no/**. `config/site.json`
sets the custom domain; `publish` writes `dist/CNAME` and an empty `dist/.nojekyll`
(both allowlisted by the release check).

### How it is deployed

The repository `868-no/quiz` is public and holds the source; the built site is not
committed. On every push to `main` that touches `content/`, `web/`, `config/` or
`tools/`, `.github/workflows/pages.yml` runs the tool tests, builds the site with
`python3 -m tools publish --without-source` and the release check, and deploys **only
`dist/`** to GitHub Pages. Any failure stops the deploy.

CI has no private import, so it cannot run the source, page and textbook-overlap
checks. Those run locally: when a revision is verified and approved, and when you run
`python3 -m tools publish` before pushing. CI only builds revisions whose approval pins
their exact content, so nothing reaches the site that was not checked and approved
locally. CI never approves content.

Pushing approved content to `main` therefore deploys it; approval is the gate.

What the public repository shows besides the site: all question files including review
history and reviewer names, internal source references (chunk ids, page numbers, exam
markers), learning objectives and the tooling. It never contains textbook text: imports,
OCR text and figure crops stay in the git-ignored `private/` directory, and the chapter
registry stores neutral section ids and heading hashes only. Check this before every
commit (see editorial-workflow.md).

Learners report errors as GitHub issues (`config/site.json: issues_url`). Each question
shows its id and version after answering, with a link to a pre-filled issue.

### One-time setup

1. Make the repository public (*Settings → General → Danger zone*).
2. *Settings → Pages → Build and deployment → Source: GitHub Actions*.
3. *Settings → Pages → Custom domain*: `quiz.868.no`. DNS for 868.no: `quiz  CNAME  868-no.github.io.`
4. Verify `868.no` for the organisation (*Organization settings → Pages → Verified domains*)
   to prevent subdomain takeover, then tick *Enforce HTTPS* once the certificate is issued.

### Every release

```sh
python3 -m tools publish            # full checks with the private import (output stays local)
git add content && git commit -m "Approve …" && git push
```

The workflow builds and deploys within a minute or two. `python3 -m tools deploy` (push `dist/` to a
separate site repository) remains available if the source repository should ever be
made private again.

### HTTP headers on GitHub Pages

GitHub Pages does not allow custom response headers. The page therefore sets its
Content-Security-Policy and referrer policy with `<meta>` tags in `index.html`, which
covers scripts, styles, connections, objects, forms and base URLs. Not available via
`<meta>`: `frame-ancestors` (the site could be framed by another site; low risk here,
as there is nothing to submit or steal) and response headers like `X-Content-Type-Options`.
Pages caches files for about 10 minutes; `data/bank.json` is fetched with
`cache: no-cache`, so a new deploy is picked up as soon as the CDN cache expires.
Should stricter headers be needed later, put a CDN (e.g. Cloudflare) in front, or move
to a host with header configuration, and use:

```text
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```
