/**
 * Serve the built site under the REAL Content-Security-Policy and fail on any
 * violation.
 *
 * WHY THIS EXISTS RATHER THAN A REVIEWED HEADER STRING
 *
 * SECURITY.md said, correctly, that "a wrong CSP breaks the site in production
 * only, so this is deliberate work rather than a config line". That is exactly
 * the property that makes a CSP unreviewable by eye: the directive that breaks
 * a page looks identical to the one that does not, and nothing local tells you
 * which you wrote. It is why the policy was skipped entirely for so long.
 *
 * So the policy is not reviewed, it is EXERCISED. Every route is loaded in
 * Chromium with the header applied and every "Refused to..." console message
 * is a failure. A directive that would break production breaks CI instead.
 *
 * THE POLICY IS READ FROM netlify.toml, NOT COPIED
 *
 * A copy would drift, and the copy that drifts is never the one that gets
 * corrected — the same argument this repository makes about T-bill conventions
 * and freshness budgets. What ships is what is tested, or this proves nothing.
 */
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

// Mirrors tests/e2e/smoke.mjs: CI installs the browser matching playwright-core
// and leaves this unset; a local run points it at whatever is on the machine.
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;
const ROOT = 'out';
const PORT = 4599;

/** The shipped policy, parsed out of netlify.toml. */
function shippedCsp() {
  const toml = readFileSync('netlify.toml', 'utf8');
  // Content-Security-Policy = """ ... """  or a single-quoted one-liner.
  const block = toml.match(/Content-Security-Policy\s*=\s*"""([\s\S]*?)"""/);
  const line = toml.match(/Content-Security-Policy\s*=\s*"([^"]+)"/);
  const raw = block ? block[1] : line ? line[1] : null;
  if (!raw) {
    console.error('No Content-Security-Policy found in netlify.toml.');
    process.exit(1);
  }
  // TOML multiline strings use a trailing backslash to fold lines; the
  // backslash is not part of the header value.
  return raw.replace(/\\\s*\n/g, '').replace(/\s+/g, ' ').trim();
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.csv': 'text/csv',
  '.txt': 'text/plain', '.xml': 'application/xml',
};

async function main() {
  const CSP = shippedCsp();
  console.log(`Policy under test:\n  ${CSP}\n`);

  if (!existsSync(ROOT)) {
    console.error(`No ${ROOT}/ — run the build first.`);
    process.exit(1);
  }

  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    let file = path.join(ROOT, url);
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
    if (!existsSync(file)) {
      res.writeHead(404, { 'Content-Security-Policy': CSP });
      return res.end('not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'Content-Security-Policy': CSP,
    });
    res.end(await readFile(file));
  });
  await new Promise((r) => server.listen(PORT, r));

  // Every directory in out/ is a route, plus the root. Derived rather than
  // listed: a hand-kept list silently stops covering new pages, and the page
  // nobody remembered to add is the one that breaks.
  const dirs = (await readdir(ROOT, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && !['_next', 'data', 'icons'].includes(d.name))
    .map((d) => `/${d.name}/`);
  const routes = ['/', ...dirs];

  const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
  const violations = [];

  for (const route of routes) {
    const page = await browser.newPage();
    page.on('console', (m) => {
      const text = m.text();
      if (/Content Security Policy|Refused to/i.test(text)) {
        violations.push(`${route}\n      ${text.slice(0, 200)}`);
      }
    });
    await page
      .goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle', timeout: 30_000 })
      .catch((e) => violations.push(`${route}\n      NAVIGATION FAILED: ${e.message.slice(0, 120)}`));
    await page.waitForTimeout(800);
    await page.close();
  }

  await browser.close();
  server.close();

  if (violations.length) {
    console.error(`\nCSP VIOLATIONS on ${new Set(violations.map((v) => v.split('\n')[0])).size} route(s):`);
    for (const v of [...new Set(violations)]) console.error(`  - ${v}`);
    console.error(
      '\nThe policy in netlify.toml would break these pages in production.\n' +
        'Loosen the offending directive, or change the code so it does not need it.'
    );
    process.exit(1);
  }

  console.log(`CLEAN — no CSP violations across ${routes.length} routes.`);
}

main();
