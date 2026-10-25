// Contact sheets for reviewing figures by eye: draws the figures of the chosen questions,
// before and after answering, in a real browser at desktop and phone width, saves one
// PNG per figure and phase, and prints each figure's text description and any labels
// that overlap (the same rule as figures.test.mjs, simplified to text against text).
//
//   node tests/a11y/sheet.mjs [--out DIR (default private/figure-sheets)] [q-0001 … | template-id …]
//
// With no ids every figure is drawn. A template id (e.g. antenna) picks the questions that
// use it. The site comes from dist/, or from RADIOQUIZ_SITE (private/preview shows figures
// on questions that are not approved yet). Needs Playwright with Chromium, like the checks.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, launchOptions, serve } from './browser.mjs';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : 'private/figure-sheets'; // private/ is not committed
if (!chromium) throw new Error('Playwright is not installed');
mkdirSync(out, { recursive: true });

/** Runs in the page: draws the chosen figures as cards; returns what to report. */
async function draw(wanted) {
  const { renderVisual } = await import('/js/visuals/registry.js');
  const { toDOM } = await import('/js/render/vnode.js');
  const bank = await (await fetch('/data/bank.json')).json();
  const pick = (q) => !wanted.length || wanted.includes(q.id) || wanted.includes(q.visual.template);
  const wrap = document.createElement('main');
  wrap.className = 'wrap';
  document.body.replaceChildren(wrap);
  const report = [];
  for (const q of bank.questions.filter((x) => x.visual && pick(x))) {
    for (const phase of ['before', 'after']) {
      const res = renderVisual(q.visual, bank.templates, { phase, idPrefix: `s-${q.id}-${phase}` });
      const card = document.createElement('section');
      card.dataset.name = `${q.id}-${phase}`;
      card.style.margin = '10px 0';
      const title = document.createElement('h3');
      title.textContent = `${q.id} – ${phase === 'before' ? 'før svar' : 'etter svar'}`;
      card.append(title, toDOM(res.node));
      wrap.append(card);
      if (!res.ok) { report.push(`${q.id} ${phase}: cannot be drawn: ${res.errors.join('; ')}`); continue; }
      report.push(`${q.id} ${phase}: ${res.description || '(vises etter svar)'}`);
      const svg = card.querySelector('svg.fig-svg:not(.anim-play)');
      if (!svg) continue;
      const boxes = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim()).map((t) => {
        const b = t.getBBox();
        return { t: t.textContent.trim(), x: b.x + 1.5, y: b.y + 2, w: b.width - 3, h: b.height - 4 };
      });
      boxes.forEach((a, i) => {
        for (const b of boxes.slice(i + 1)) {
          if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) report.push(`  OVERLAP ${q.id} ${phase}: "${a.t}" / "${b.t}"`);
        }
      });
    }
  }
  return report;
}

const server = await serve();
const browser = await chromium.launch(launchOptions);
try {
  for (const [tag, viewport] of [['desktop', { width: 1000, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    // the site's CSP would refuse the style that freezes animations for the screenshots
    const context = await browser.newContext({ viewport, bypassCSP: true, serviceWorkers: 'block' });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForSelector('#setup-form');
    await page.evaluate(() => document.fonts.ready);
    const report = await page.evaluate(draw, args);
    // freeze animations on the still drawing, which is what the sheet shows
    await page.addStyleTag({ content: '.anim-play { display: none !important } .anim-static { display: block !important }' });
    for (const card of await page.$$('main > section')) {
      await card.screenshot({ path: join(out, `${await card.getAttribute('data-name')}-${tag}.png`) });
    }
    console.log(tag === 'desktop' ? report.join('\n') : report.filter((r) => r.includes('OVERLAP')).map((r) => `phone:${r}`).join('\n'));
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.error(`sheets saved in ${out}/`);
