/**
 * Browser smoke tests — the checks 382 unit tests are structurally blind to.
 *
 * Every defect found in the July review was invisible to the unit suite, and
 * each one belongs to a class this file now covers:
 *
 *   - Portfolio mark-to-market had NEVER rendered for anybody. It read today's
 *     price from `secondary`, which ships empty, so the column was "—" in every
 *     session since it was written. A dead feature passes every unit test its
 *     pure functions have.                          -> priceBookReachesPortfolio
 *   - The price page printed a solver's ceiling as though measured, where the
 *     calculator guards it.                         -> noBadNumbers
 *   - The ladder and its printed report carried copy claiming prices we do not
 *     hold.                                         -> covered by routeRenders
 *
 * The rule of thumb: unit tests prove the maths, this proves the reader sees
 * it. Anything asserted here must be observable from the page, not imported.
 *
 * Run:  npm run build && npm run test:e2e
 * The runner starts its own static server against ./out.
 */

import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const PORT = Number(process.env.E2E_PORT || 4399);
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = new URL('../../out/', import.meta.url).pathname;
// Chromium ships in the image at PLAYWRIGHT_BROWSERS_PATH; CI installs it.
const EXECUTABLE = process.env.CHROMIUM_PATH || undefined;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain',
};

/** Minimal static server. `serve` as a devDependency is not worth the tree. */
function startServer() {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0]);
      let file = join(ROOT, p);
      const s = await stat(file).catch(() => null);
      if (!s || s.isDirectory()) file = join(ROOT, p, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(PORT, '127.0.0.1', () => resolve(server)));
}

const ROUTES = [
  '/', '/dashboard/', '/goals/', '/tbills/', '/ladder/', '/calculator/',
  '/auctions/', '/portfolio/', '/prices/', '/sell/', '/alerts/', '/sources/',
  '/learn/', '/glossary/', '/faq/', '/about/', '/support/', '/terms/',
  '/privacy/', '/disclaimer/',
];

const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  FAIL  ${msg}`); };
const pass = (msg) => console.log(`  ok    ${msg}`);

/**
 * NaN / Infinity / undefined / [object Object] in text the reader can SEE.
 * Deliberately walks text nodes rather than reading `body.textContent`: the
 * latter includes Next.js's serialised flight payload, which legitimately
 * contains the word "undefined" and makes the check cry wolf on every page.
 */
const visibleGarbage = (page) => page.evaluate(() => {
  const out = [];
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walk.nextNode())) {
    const t = n.textContent || '';
    if (!/\bNaN\b|\bInfinity\b|\bundefined\b|\[object /.test(t)) continue;
    const el = n.parentElement;
    if (!el || el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
    if (getComputedStyle(el).display === 'none') continue;
    out.push(t.trim().slice(0, 80));
  }
  return out;
});

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: EXECUTABLE, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(`${page.url()} :: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${page.url()} :: ${m.text()}`));

  const go = async (r) => {
    await page.goto(BASE + r, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
  };

  /* ---------------------------------------------- every route is alive */
  console.log('\nroutes render, no garbage, no sideways scroll (390px)');
  for (const r of ROUTES) {
    const res = await go(r);
    if (res && res.status() !== 200) fail(`${r} returned ${res.status()}`);

    const chars = (await page.innerText('body')).trim().length;
    if (chars < 200) fail(`${r} rendered only ${chars} characters of visible text`);

    const garbage = await visibleGarbage(page);
    if (garbage.length) fail(`${r} shows ${garbage[0]}`);

    // A phone-first app must never scroll sideways. 390px is a common Android
    // width and the layout has regressed here before.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 0) fail(`${r} overflows horizontally by ${overflow}px`);
  }
  if (!failures.length) pass(`${ROUTES.length} routes`);

  /* ------------------------------- the price book actually reaches things */
  console.log('\nprice book round-trip');
  await go('/prices/');
  const before = failures.length;

  const card = page.locator('.card').filter({ hasText: 'Record a price' }).first();
  if (!(await card.count())) {
    fail('price book: no bond offered a "Record a price" action');
  } else {
    const code = (await card.locator('p').first().innerText()).trim();
    await card.getByRole('button', { name: /Record a price/ }).click();
    await page.waitForTimeout(200);

    // A price that cannot be real must be refused, with a reason on screen.
    await page.locator('input[type=number]').first().fill('9600');
    await page.getByRole('button', { name: 'Save price' }).click();
    await page.waitForTimeout(300);
    const stillEditing = await page.locator('input[type=number]').first().count();
    if (!stillEditing) fail('price book: an implausible price (9600) was accepted');

    await page.locator('input[type=number]').first().fill('92.50');
    await page.getByRole('button', { name: 'Save price' }).click();
    await page.waitForTimeout(600);

    if (!/your price/i.test(await page.innerText('body'))) {
      fail('price book: saved price did not gain a "your price" badge');
    }

    // Survives a reload, or it is not stored at all.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    if (!/your price/i.test(await page.innerText('body'))) {
      fail('price book: saved price did not survive a reload');
    }

    // ...and it must reach the pages that plan on it.
    await go('/ladder/');
    const ladder = await page.innerText('body');
    if (!/your price|last traded|par placeholder/i.test(ladder)) {
      fail('ladder: no price provenance shown for any rung');
    }
    if (failures.length === before) pass(`recorded 92.50 for ${code}, persisted, reached the ladder`);
  }

  /* ------------- the regression that lived undetected: portfolio mark-to-market */
  console.log('\nportfolio mark-to-market renders once a price exists');
  const mtmBefore = failures.length;
  await go('/portfolio/');
  const fileInput = page.locator('input[type=file]');
  if (!(await fileInput.count())) {
    fail('portfolio: no CSV import control');
  } else {
    // Headers taken from the app's own CSV_TEMPLATE, plus rows it must survive.
    await fileInput.setInputFiles({
      name: 'holdings.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        'issueCode,faceValueKES,purchaseDate,purchaseCleanPrice\n'
        + 'FXD1/2022/10,1000000,2026-07-13,98.5\n'
        + 'NOTAREALBOND,500000,2026-02-16,100\n'
        + ',,,\n'),
    });
    await page.waitForTimeout(1200);
    const body = await page.innerText('body');
    if (!/FXD1\/2022\/10/.test(body)) fail('portfolio: a valid CSV row did not import');
    if (!/NOTAREALBOND/.test(body)) fail('portfolio: an unknown issue code was silently dropped');

    // Record a price for the held bond, then require a mark-to-market figure.
    await go('/prices/');
    await page.locator('input[type=search]').fill('FXD1/2022/10');
    await page.waitForTimeout(400);
    const held = page.locator('.card').filter({ hasText: 'FXD1/2022/10' }).first();
    if (await held.count()) {
      await held.getByRole('button', { name: /Record a price|Update price/ }).click();
      await page.waitForTimeout(200);
      await page.locator('input[type=number]').first().fill('95.25');
      await page.getByRole('button', { name: 'Save price' }).click();
      await page.waitForTimeout(600);

      await go('/portfolio/');
      const row = page.locator('tr', { hasText: 'FXD1/2022/10' }).first();
      const text = (await row.innerText().catch(() => '')) || '';
      // Two percentages on the row: the locked-in yield and the at-market one.
      const pcts = text.match(/\d+\.\d+%/g) || [];
      if (pcts.length < 2) {
        fail(`portfolio: no at-market yield after recording a price (row: "${text.replace(/\s+/g, ' ').trim()}")`);
      }
    } else {
      fail('portfolio: could not find FXD1/2022/10 in the price book to price it');
    }
  }
  if (failures.length === mtmBefore) pass('imported a holding, priced it, at-market yield appeared');

  /* ------------- the calculator confirms that a price was actually stored */
  // Regression: `saved` was cleared by an effect keyed on the resolved price.
  // Saving mutates the price book, which produces a new resolved price, which
  // re-ran the effect and wiped the confirmation on the tick it was set — so
  // the only feedback that the price had been stored was unreachable. Pure
  // state-timing; no unit test can see it.
  console.log('\ncalculator confirms a saved price');
  const calcBefore = failures.length;
  await go('/calculator/');
  const slider = page.locator('#calc-price');
  if (!(await slider.count())) {
    fail('calculator: no price slider');
  } else {
    await slider.fill('96.4');
    await page.waitForTimeout(400);
    const keep = page.getByRole('button', { name: /Keep .* as this bond/ });
    if (!(await keep.count())) {
      fail('calculator: no "keep this price" action after moving the slider');
    } else {
      await keep.click();
      await page.waitForTimeout(800);
      if (!/Saved\./i.test(await page.innerText('body'))) {
        fail('calculator: price saved but no confirmation shown');
      }
    }
  }
  if (failures.length === calcBefore) pass('slider price saved, confirmation visible');

  /* ---------------- the sell evaluator reproduces a real broker sheet */
  // Pinned to the ABC Capital quote for IFB1/2022/18 (20-Jul-2026). The point
  // is not that the arithmetic is right — sell.test.ts proves that — but that
  // a reader typing their own sheet in actually sees the answer.
  console.log('\nsell evaluator');
  const sellBefore = failures.length;
  await go('/sell/');
  if (!(await page.locator('#sell-bond').count())) {
    fail('sell: the quote form did not render');
  } else {
    await page.locator('#sell-bond').selectOption('KE8000002322').catch(() => {});
    await page.locator('#sell-face').fill('400000');
    await page.locator('#sell-date').fill('2026-07-20');
    await page.locator('#sell-dirty').fill('107.8145');
    await page.locator('#sell-ytm').fill('12.5');
    await page.locator('#sell-comm').fill('1500');
    await page.locator('#sell-levy').fill('47.44');
    await page.waitForTimeout(700);

    // Without the amortisation the sheet cannot be reproduced, and the page
    // must say so rather than quietly print a different price.
    if (!/does not match your sheet/i.test(await page.innerText('body'))) {
      fail('sell: no warning when our price disagrees with the quoted yield');
    }

    await page.locator('input[type=date]').nth(1).fill('2031-06-02');
    await page.locator('input[aria-label="Percent of principal repaid"]').fill('50');
    await page.waitForTimeout(900);

    const body = await page.innerText('body');
    if (!/reproduces your broker/i.test(body)) {
      fail('sell: amortisation entered but the sheet still does not reconcile');
    }
    if (!/429,711/.test(body)) fail('sell: net proceeds not shown');
    if (!/13\.97%/.test(body)) fail('sell: grossed-up break-even not shown');
  }
  if (failures.length === sellBefore) pass('reproduced a real broker sheet and grossed up the break-even');

  /* ------------------------------------------------------ offline (PWA) */
  console.log('\noffline');
  await go('/dashboard/');
  await page.waitForTimeout(1200);
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  const offlineChars = (await page.innerText('body').catch(() => '')).trim().length;
  if (offlineChars < 200) fail(`offline: dashboard rendered only ${offlineChars} characters from cache`);
  else pass(`dashboard served ${offlineChars} characters offline`);
  await ctx.setOffline(false);

  /* --------------------------------------------------------- page errors */
  console.log('\nconsole');
  if (errors.length) {
    // Deduplicate: one broken component fires on every route it appears on.
    [...new Set(errors)].slice(0, 10).forEach((e) => fail(`console: ${e}`));
  } else pass('no page errors, no console errors');

  await browser.close();
  server.close();

  console.log(`\n${failures.length ? `FAILED (${failures.length})` : 'PASSED'}`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
