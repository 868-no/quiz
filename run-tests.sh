#!/bin/sh
# Runs all tests. Python (stdlib only) is required; Node.js >= 18 is optional and
# enables the JS tests (jsdom, for the UI tests, via `npm install` or $RADIOQUIZ_JSDOM).
set -e
cd "$(dirname "$0")"
echo "== Python tests"
python3 -m unittest discover -s tests/python -t . "$@"
if command -v node >/dev/null 2>&1; then
  echo "== JavaScript tests"
  node --test tests/js/*.test.mjs
else
  echo "== JavaScript tests SKIPPED (node not found)"
fi
