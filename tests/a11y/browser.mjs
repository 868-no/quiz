// Shared by the browser tests: finds Playwright, and serves the built site in dist/ (or the
// folder in RADIOQUIZ_SITE, e.g. private/preview, which also has unapproved questions).
// RADIOQUIZ_PLAYWRIGHT / RADIOQUIZ_JSDOM may name extra directories with node_modules,
// and RADIOQUIZ_CHROMIUM a Chromium to use instead of Playwright's own.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
export const DIST = process.env.RADIOQUIZ_SITE ? resolve(ROOT, process.env.RADIOQUIZ_SITE) : join(ROOT, 'dist');
const bases = [process.env.RADIOQUIZ_PLAYWRIGHT, process.env.RADIOQUIZ_JSDOM].filter(Boolean).map((d) => join(d, 'x.js'));
bases.push(import.meta.url);

/** Calls fn with a require() for each place node_modules may be, until one works. */
export function find(fn) {
  for (const b of bases) {
    try { return fn(createRequire(b)); } catch { /* try the next place */ }
  }
  return null;
}
// the first place that has Playwright (or playwright-core) wins
export const chromium = find((r) => { try { return r('playwright').chromium; } catch { return r('playwright-core').chromium; } });
export const launchOptions = process.env.RADIOQUIZ_CHROMIUM ? { executablePath: process.env.RADIOQUIZ_CHROMIUM } : {};

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain',
};

/** Serves dist/ on a free local port. */
export function serve() {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(DIST, path));
    if (!file.startsWith(DIST + sep) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok(server)));
}
