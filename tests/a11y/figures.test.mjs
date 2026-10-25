// Figure layout check: draws every figure in the built bank, before and after answering,
// in a real browser on a desktop and on a phone (where figure text is 15 % larger), and
// fails if a text label overlaps another label or crosses a straight line. Letters
// inside a circle (meters, atoms) are left out: their lines run under the filled circle.
// Needs the built site in dist/ and Playwright with Chromium, like the accessibility
// check; skipped without them unless RADIOQUIZ_REQUIRE_BROWSER is set (CI). With
// RADIOQUIZ_SITE=private/preview it checks the preview build, figures on unapproved
// questions included (run-tests.sh does this when the private import is present).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIST, chromium, launchOptions, serve } from './browser.mjs';

const missing = !chromium ? 'Playwright is not installed'
  : !existsSync(join(DIST, 'index.html')) ? `no built site in ${DIST} (run python3 -m tools publish, or preview)` : null;
if (missing && process.env.RADIOQUIZ_REQUIRE_BROWSER) throw new Error(`figure layout check required, but ${missing}`);

/** Runs in the page: draws every figure and returns the overlaps found. */
async function findOverlaps() {
  const { renderVisual } = await import('/js/visuals/registry.js');
  const { toDOM } = await import('/js/render/vnode.js');
  const bank = await (await fetch('/data/bank.json')).json();
  const box = document.createElement('div');
  box.className = 'wrap';
  document.body.replaceChildren(box);
  const found = [];
  for (const q of bank.questions.filter((x) => x.visual)) {
    for (const phase of ['before', 'after']) {
      const res = renderVisual(q.visual, bank.templates, { phase, idPrefix: `t-${q.id}-${phase}` });
      if (!res.ok) { found.push(`${q.id} ${phase}: the figure cannot be drawn`); continue; }
      box.replaceChildren(toDOM(res.node));
      // the still drawing (an animation's frames are drawn from the same template)
      const svg = box.querySelector('svg.fig-svg:not(.anim-play)');
      if (!svg) continue;
      const shrink = (b) => ({ x: b.x + 1.5, y: b.y + 2, w: b.width - 3, h: b.height - 4 }); // ignore touching edges
      const texts = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim()).map((t) => ({ t: t.textContent.trim(), b: shrink(t.getBBox()) }));
      const circles = [...svg.querySelectorAll('circle')].map((c) => c.getBBox());
      const inCircle = (b) => circles.some((c) => b.x >= c.x && b.y >= c.y && b.x + b.w <= c.x + c.width && b.y + b.h <= c.y + c.height);
      const segs = [];
      const plain = (el) => !el.closest('g[transform]'); // rotated symbols draw in their own coordinates
      for (const l of svg.querySelectorAll('line')) if (plain(l)) segs.push(['x1', 'y1', 'x2', 'y2'].map((k) => Number(l.getAttribute(k))));
      for (const pl of svg.querySelectorAll('polyline')) {
        if (!plain(pl)) continue;
        const p = pl.getAttribute('points').trim().split(/\s+/).map((pt) => pt.split(',').map(Number));
        for (let i = 1; i < p.length; i++) segs.push([...p[i - 1], ...p[i]]);
      }
      const crosses = (b, [x1, y1, x2, y2]) => {
        const inside = (x, y) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h;
        if (inside(x1, y1) || inside(x2, y2)) return true;
        const cut = (cx, cy, dx, dy) => {
          const d = (x2 - x1) * (dy - cy) - (y2 - y1) * (dx - cx);
          if (!d) return false;
          const u = ((cx - x1) * (dy - cy) - (cy - y1) * (dx - cx)) / d;
          const v = ((cx - x1) * (y2 - y1) - (cy - y1) * (x2 - x1)) / d;
          return u > 0 && u < 1 && v > 0 && v < 1;
        };
        const [l, r, t, bo] = [b.x, b.x + b.w, b.y, b.y + b.h];
        return cut(l, t, r, t) || cut(r, t, r, bo) || cut(r, bo, l, bo) || cut(l, bo, l, t);
      };
      texts.forEach((a, i) => {
        if (a.b.w <= 0 || a.b.h <= 0) return;
        for (const c of texts.slice(i + 1)) {
          if (a.b.x < c.b.x + c.b.w && c.b.x < a.b.x + a.b.w && a.b.y < c.b.y + c.b.h && c.b.y < a.b.y + a.b.h) found.push(`${q.id} ${phase}: "${a.t}" overlaps "${c.t}"`);
        }
        if (!inCircle(a.b) && segs.some((s) => crosses(a.b, s))) found.push(`${q.id} ${phase}: "${a.t}" crosses a line`);
      });
    }
  }
  return [...new Set(found)];
}

test('no figure has labels overlapping each other or crossing lines', { skip: missing || false, timeout: 300_000 }, async () => {
  const server = await serve();
  let browser;
  try {
    browser = await chromium.launch(launchOptions);
    const base = `http://127.0.0.1:${server.address().port}/`;
    const problems = [];
    for (const [name, viewport] of [['desktop', { width: 1100, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport });
      await page.goto(base);
      await page.waitForSelector('#setup-form'); // the stylesheet and fonts are in place
      await page.evaluate(() => document.fonts.ready);
      problems.push(...(await page.evaluate(findOverlaps)).map((p) => `${name}: ${p}`));
      await page.close();
    }
    assert.deepEqual(problems, [], `figures with overlapping labels:\n  ${problems.join('\n  ')}`);
  } finally {
    if (browser) await browser.close();
    server.close();
  }
});
