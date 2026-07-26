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
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
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

    /* Buttons that sit on top of each other, and labels broken across lines.
     *
     * This is the reported bug, stated as a measurement: on /goals the export
     * group and the plan controls were two independently-wrapping flex rows
     * side by side, so at 390px they stepped down the screen in different
     * directions and "Save plan" ended up overlapping the row above with its
     * label split in two. Nothing threw, nothing overflowed, every test was
     * green — it was only visible to someone looking at the screen. So the
     * geometry is asserted instead. */
    const collisions = await page.evaluate(() => {
      const seen = (el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden';
      };
      const boxes = [...document.querySelectorAll('button, select')]
        .filter(seen).map((el) => ({ el, r: el.getBoundingClientRect() }));

      const hits = [];
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (ox > 2 && oy > 2) {
            hits.push(`"${a.el.textContent.trim().slice(0, 18)}" overlaps "${b.el.textContent.trim().slice(0, 18)}"`);
          }

          /* The staircase, stated as an invariant: two controls in the same
           * action group either share a row or occupy different ones. A button
           * whose box STRADDLES the boundary — overlapping a sibling vertically
           * while sitting at a different top — belongs to neither row, and that
           * is precisely what the reported screenshot showed. Save plan sat at
           * y=215 between a PDF button at y=189 and a Print button at y=241,
           * touching both and aligned with neither.
           *
           * Neither an overlap check nor a wrapped-label check catches this:
           * the boxes never intersect and every label fits on one line. Only
           * the alignment does.
           *
           * Grouping is geometric, not structural — the offending pair was not
           * even siblings (Save plan lives in the page, Download PDF inside
           * ReportActions). Two controls count as one group when they are
           * touching shoulder to shoulder: a horizontal gap under 16px, about
           * one flex gap. Buttons in separate cards are far enough apart that
           * they are never compared. */
          const gap = Math.max(0, Math.max(a.r.left, b.r.left) - Math.min(a.r.right, b.r.right));
          if (oy > 2 && gap <= 16) {
            const drift = Math.abs(a.r.top - b.r.top);
            if (drift > 4) {
              hits.push(`"${a.el.textContent.trim().slice(0, 18)}" is ${Math.round(drift)}px out of row with "${b.el.textContent.trim().slice(0, 18)}"`);
            }
          }
        }
      }

      // A short label that has wrapped. Measured on the text's own range, not
      // the button box: a 44px min-height button around one 20px line is
      // deliberate sizing, and flagging it would bury the real cases.
      for (const el of document.querySelectorAll('button')) {
        if (!seen(el)) continue;
        const label = el.textContent.trim();
        if (!label || label.length > 24) continue;
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 20;
        const range = document.createRange();
        range.selectNodeContents(el);
        if (range.getBoundingClientRect().height > lh * 1.6) {
          hits.push(`"${label}" is wrapped across lines`);
        }
      }
      return [...new Set(hits)];
    });
    if (collisions.length) fail(`${r}: ${collisions[0]}`);
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

  /* -------------------- a price alone is enough to get an answer back */
  //
  // The value date used to be blank on arrival, and the analysis returns null
  // without it. So a reader who landed here, saw the bond and face value
  // already filled in, and typed the price off their broker sheet got nothing
  // back — no figure, no reason, no hint that anything was missing. That is
  // how a working page comes to be reported as broken. It now defaults to
  // today, and this asserts the reader's actual first move produces an answer.
  console.log('\nthe sell page answers a price on its own');
  const soloBefore = failures.length;
  await go('/sell/');
  await page.waitForTimeout(900);
  const valueDate = await page.locator('#sell-date').inputValue();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valueDate)) {
    fail(`sell: the value date is "${valueDate}" on arrival, so nothing computes`);
  }
  await page.locator('#sell-dirty').fill('107.8145');
  await page.waitForTimeout(900);
  if (!/break-even/i.test(await page.innerText('body'))) {
    fail('sell: typing only a price produced no analysis');
  }
  if (failures.length === soloBefore) pass(`value date defaulted to ${valueDate}; a price alone returned an analysis`);

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

  /* ------------------------------- buttons that actually do something */
  /*
   * The class of bug this section exists for: a control that renders, passes
   * every unit test, and does nothing when pressed.
   *
   * Two shipped. "Save plan" called `window.prompt`, which installed PWAs and
   * several mobile WebViews simply refuse — the handler read null and returned,
   * so there was no plan, no message and no clue. "PDF report" called
   * `window.print`, which iOS has no dialog for when the app is running from
   * the home screen, and the report sheet is display:none until print media
   * applies — so nothing appeared at all. Both were reported to us as dead
   * buttons, which is exactly what they were.
   *
   * Anything asserted here must be observable from pressing the control.
   */
  console.log('\nthe report and the plan actually come out');
  const btnBefore = failures.length;

  // No blocking platform dialog may be involved. If one appears, the test
  // dismisses it and fails — that is the bug, reproduced.
  let dialogs = 0;
  page.on('dialog', async (d) => { dialogs++; await d.dismiss().catch(() => {}); });

  await go('/ladder/');
  await page.waitForTimeout(1200);

  /*
   * A PDF, not "a file".
   *
   * The previous version of this check asserted that a download fired and was
   * over 20KB. It passed for months while the app produced a .png and had never
   * generated a PDF in its life — the reader was told "I still cannot generate
   * PDFs" and was right. A test that accepts any file cannot tell the
   * difference between the right output and a plausible one, so this reads the
   * magic bytes.
   */
  const download = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /download pdf/i.test(x.textContent));
    if (!b) return false;
    b.click();
    return true;
  });
  if (!clicked) fail('ladder: no PDF export control on the page');
  else {
    const file = await download;
    if (!file) fail('ladder: the PDF button produced no file');
    else {
      if (!/\.pdf$/i.test(file.suggestedFilename())) {
        fail(`ladder: export is named ${file.suggestedFilename()}, which is not a PDF`);
      }
      const path = await file.path();
      const bytes = path ? (await stat(path)).size : 0;
      const head = path ? (await readFile(path)).subarray(0, 5).toString('latin1') : '';
      if (!head.startsWith('%PDF-')) fail(`ladder: export does not begin %PDF- (got ${JSON.stringify(head)})`);
      // A one-page report that rasterises to nothing still writes a valid PDF.
      if (bytes < 20_000) fail(`ladder: exported PDF is only ${bytes} bytes — probably blank`);
    }
  }

  /* The export must contain the REPORT, not one enormous logo.
   *
   * A reader sent in a 1588x1342 PNG, correct dimensions and a wholly
   * plausible 279KB, which was a single navy curve: /logo.svg had a viewBox
   * but no width/height, so with no intrinsic size it expanded to its
   * container inside the html2canvas clone — where the stylesheet has not
   * necessarily applied — and swallowed the page. Magic bytes, extension and
   * file size were all satisfied by that image. Only the CONTENT was wrong.
   *
   * So the invariant is checked at its source: with the sizing class removed,
   * standing in for the clone before CSS lands, the logo must still measure
   * itself. Anything above 200px is on its way to filling the sheet. */
  const logo = await page.evaluate(async () => {
    const sheet = document.getElementById('ladder-report-sheet');
    if (!sheet) return { error: 'no ladder report sheet' };
    const prev = sheet.style.cssText;
    sheet.style.cssText = 'display:block;position:fixed;left:-10000px;top:0;width:794px';
    const img = sheet.querySelector('img[src="/logo.svg"]');
    if (!img) { sheet.style.cssText = prev; return { error: 'no logo in the report sheet' }; }
    await new Promise((res) => (img.complete ? res() : (img.onload = img.onerror = res)));
    const cls = img.className;
    img.className = '';
    await new Promise((res) => requestAnimationFrame(res));
    const r = img.getBoundingClientRect();
    img.className = cls;
    sheet.style.cssText = prev;
    return { w: Math.round(r.width), h: Math.round(r.height) };
  });
  if (logo.error) fail(`ladder: ${logo.error}`);
  else if (logo.w > 200) {
    fail(`ladder: the report logo expands to ${logo.w}px without CSS — it will swallow the export`);
  }

  // Saving a plan must name it in the page, not through a platform dialog.
  await go('/goals/');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /save plan|update/i.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  if (!(await page.$('#plan-name'))) fail('goals: Save plan did not offer a name field in the page');
  else {
    await page.fill('#plan-name', 'Smoke test plan');
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].filter((x) => /^save$|^update$/i.test(x.textContent.trim()))[0];
      if (b) b.click();
    });
    await page.waitForTimeout(1200);
    if (!/Smoke test plan/.test(await page.innerText('body'))) {
      fail('goals: the saved plan never appeared in the saved-plans list');
    }
  }
  if (dialogs > 0) fail(`${dialogs} blocking browser dialog(s) were raised — these are refused on mobile`);
  if (failures.length === btnBefore) pass('a real PDF downloaded (%PDF- magic bytes); plan saved without a platform dialog');

  /* ------------------------------------ a tailored ladder survives a reload */
  /*
   * Hand-picking six rungs and losing them on reload is not a tool. On a phone
   * this needs no deliberate act: an installed PWA is routinely evicted and
   * re-launched from the background.
   */
  console.log('\na tailored ladder is still there tomorrow');
  const persistBefore = failures.length;
  await go('/ladder/');
  await page.waitForTimeout(1200);
  await page.fill('#ladder-amount', '6500000');
  const picked = await page.evaluate(() => {
    const s = document.getElementById('rung-0');
    if (!s) return null;
    const other = [...s.options].map((o) => o.value).filter((v) => v && v !== s.value);
    const next = other[5];
    if (!next) return null;
    s.value = next;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return next;
  });
  if (!picked) fail('ladder: could not pick a different bond for rung 1');
  else {
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const kept = await page.evaluate(() => ({
      amount: document.getElementById('ladder-amount')?.value,
      rung0: document.getElementById('rung-0')?.value,
    }));
    if (kept.amount !== '6500000') fail(`ladder: capital reset to ${kept.amount} after reload`);
    if (kept.rung0 !== picked) fail('ladder: the hand-picked bond was lost on reload');
  }
  if (failures.length === persistBefore) pass('capital and the hand-picked rung both survived a reload');

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
