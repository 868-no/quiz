#!/bin/sh
# Runs all tests. Python (stdlib only) is required; Node.js >= 18 is optional and
# enables the JS tests (jsdom, for the UI tests, via `npm install` or $RADIOQUIZ_JSDOM)
# and the accessibility check (Playwright + Chromium + axe-core, on the built site in
# dist/; skipped without them).
set -e
cd "$(dirname "$0")"
echo "== Python tests"
python3 -m unittest discover -s tests/python -t . "$@"
if command -v node >/dev/null 2>&1; then
  echo "== JavaScript tests"
  node --test tests/js/*.test.mjs
  echo "== Accessibility check and figure layout check"
  node --test tests/a11y/*.test.mjs
  # with the private import present: the same figure check on the preview build, so
  # figures on questions that are not approved yet are checked too
  if [ -f private/imported/current.json ]; then
    echo "== Figure layout check on the preview (unapproved questions too)"
    python3 -m tools preview >/dev/null
    RADIOQUIZ_SITE=private/preview node --test tests/a11y/figures.test.mjs
  fi
else
  echo "== JavaScript tests SKIPPED (node not found)"
fi
