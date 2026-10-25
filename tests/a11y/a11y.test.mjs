// Automated accessibility check: axe-core (WCAG 2.2 A/AA and axe best practices) on
// every screen of the built site in a real browser, on a phone in dark mode and on
// a desktop in light mode. Needs the built site in dist/ (python3 -m tools publish),
// Playwright with Chromium and axe-core (npm ci; npx playwright install chromium).
// Without them the test is skipped, unless RADIOQUIZ_REQUIRE_BROWSER is set (CI).
// RADIOQUIZ_PLAYWRIGHT / RADIOQUIZ_JSDOM may name extra directories with node_modules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIST, chromium, find, launchOptions, serve } from './browser.mjs';

const axePath = find((r) => r.resolve('axe-core/axe.min.js'));
const missing = !chromium ? 'Playwright is not installed' : !axePath ? 'axe-core is not installed'
  : !existsSync(join(DIST, 'index.html')) ? 'no built site in dist/ (run python3 -m tools publish)' : null;
if (missing && process.env.RADIOQUIZ_REQUIRE_BROWSER) throw new Error(`accessibility check required, but ${missing}`);

async function axe(page) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const r = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      resultTypes: ['violations'],
    });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.slice(0, 4)
      .map((n) => `      ${n.target.join(' ')} – ${(n.failureSummary || '').split('\n').slice(1, 3).join(' ').trim()}`).join('\n')}`);
  });
}

// Walks through the site's screens; calls check(label) on each.
async function screens(page, url, check) {
  await page.goto(url);
  await page.waitForSelector('#setup-form');
  await check('setup');
  // a short round: question with a glossary popup open, feedback, results
  await page.selectOption('#count', '5');
  await page.click('#setup-form button[type=submit]');
  await page.waitForSelector('#answer-form');
  const term = await page.$('.q-stem .term, .q-context .term');
  if (term) { await term.click(); await check('question with a glossary popup'); await page.keyboard.press('Escape'); }
  await check('question');
  for (let i = 0; i < 5; i++) {
    const labels = await page.$$('.opt label');
    await labels[labels.length - 1].click();
    await page.click('#answer-form button[type=submit]');
    if (i === 0) await check('feedback');
    await page.click('[data-action=next]');
  }
  await page.waitForSelector('.results');
  await check('results');
  // the start screen with a round in progress, the list of mistakes and progress
  await page.click('[data-action=new]');
  await page.click('#setup-form button[type=submit]');
  await (await page.$$('.opt label'))[0].click();
  await page.click('#answer-form button[type=submit]');
  await page.reload();
  await page.waitForSelector('.notice-continue');
  await check('setup with "Fortsett der du slapp"');
  // a question with a figure, opened from a link; and a link to a missing question
  await page.goto(`${url}#q-0001`);
  await page.waitForSelector('figure.fig');
  await check('linked question with a figure');
  await page.goto(`${url}#q-9999`);
  await page.waitForSelector('.link-notice');
  await check('link to a missing question');
  // the practice exam: a question, then skip to the result
  await page.goto(url);
  await page.waitForSelector('.mode-switch');
  await page.click('label[for=mode-exam]');
  await check('practice exam setup');
  // a round is still paused from above, so starting asks first, in the app's own dialog
  await page.click('[data-action=start-exam]');
  await page.waitForSelector('dialog.confirm-dialog[open]');
  await check('confirmation dialog');
  await page.click('dialog.confirm-dialog [data-dialog=confirm]');
  await page.waitForSelector('#answer-form');
  await check('practice exam question');
  while (await page.$('[data-action=skip]')) await page.click('[data-action=skip]');
  await page.waitForSelector('.exam-verdict');
  await check('practice exam result');
}

test('every screen passes the automated accessibility check', { skip: missing || false, timeout: 300_000 }, async () => {
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const problems = [];
  let browser = null;
  try {
    browser = await chromium.launch(launchOptions);
    for (const [name, viewport, colorScheme] of [['phone, dark', { width: 390, height: 844 }, 'dark'], ['desktop, light', { width: 1280, height: 900 }, 'light']]) {
      // the page's CSP would block the injected axe script
      const context = await browser.newContext({ viewport, colorScheme, bypassCSP: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      page.on('dialog', () => { throw new Error('a native browser dialog was opened'); });
      page.setDefaultTimeout(15_000);
      await screens(page, url, async (label) => {
        const t0 = Date.now();
        for (const v of await axe(page)) problems.push(`[${name}] ${label}: ${v}`);
        if (process.env.RADIOQUIZ_A11Y_VERBOSE) console.error(`checked [${name}] ${label} in ${Date.now() - t0} ms`);
      });
      await context.close();
    }
  } finally {
    if (browser) await browser.close();
    server.close();
  }
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
});
