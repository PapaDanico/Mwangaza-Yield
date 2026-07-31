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
import zlibSync from 'node:zlib';
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
    // Typed unpadded on purpose, and asserted padded. "FXD1/2022/10" is what
    // a person writes; the app must accept it and then store the one canonical
    // form, because a holding saved as typed does not join the bond catalogue
    // and its coupon reminders never fire.
    if (!/FXD1\/2022\/010/.test(body)) {
      fail('portfolio: an unpadded issue code was not canonicalised on import');
    }
    if (!/NOTAREALBOND/.test(body)) fail('portfolio: an unknown issue code was silently dropped');

    // Record a price for the held bond, then require a mark-to-market figure.
    await go('/prices/');
    await page.locator('input[type=search]').fill('FXD1/2022/010');
    await page.waitForTimeout(400);
    const held = page.locator('.card').filter({ hasText: 'FXD1/2022/010' }).first();
    if (await held.count()) {
      await held.getByRole('button', { name: /Record a price|Update price/ }).click();
      await page.waitForTimeout(200);
      await page.locator('input[type=number]').first().fill('95.25');
      await page.getByRole('button', { name: 'Save price' }).click();
      await page.waitForTimeout(600);

      await go('/portfolio/');
      const row = page.locator('tr', { hasText: 'FXD1/2022/010' }).first();
      const text = (await row.innerText().catch(() => '')) || '';
      // Two percentages on the row: the locked-in yield and the at-market one.
      const pcts = text.match(/\d+\.\d+%/g) || [];
      if (pcts.length < 2) {
        fail(`portfolio: no at-market yield after recording a price (row: "${text.replace(/\s+/g, ' ').trim()}")`);
      }
    } else {
      fail('portfolio: could not find FXD1/2022/010 in the price book to price it');
    }
  }
  if (failures.length === mtmBefore) pass('imported a holding, priced it, at-market yield appeared');

  /* ------------- a DhowCSD custody export imports, and admits what it cannot say */
  //
  // The file a Kenyan bondholder actually has. Structurally identical to a real
  // export, invented personal details: a real one carries the holder's name,
  // email, address, phone, KRA PIN and account numbers.
  //
  // Two things must hold and neither is visible to a unit test. The issue code
  // is padded (IFB1/2022/018) where bonds.json is not (IFB1/2022/18), so an
  // exact match reports a bond we hold data for as unknown. And a custody
  // statement carries no purchase price, so the yield column must stay blank
  // rather than quietly showing one computed from a placeholder par.
  console.log('\nDhowCSD portfolio export');
  const dhowBefore = failures.length;
  await go('/portfolio/');
  const dhowInput = page.locator('input[type=file]');
  if (!(await dhowInput.count())) {
    fail('dhowcsd: no CSV import control');
  } else {
    await dhowInput.setInputFiles({
      name: 'Portfolio2026727T15_12_16.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        '\ufeffIssuer,Issue number,ISIN,Maturity date,Issue type,Account,'
        + 'Individual Nominal Value,Avaliable Quantity,Pledge Quantity,Banned Quantity,'
        + 'Disputed Quantity,Total Quantity,Currency,Exchange Rate,Available Value,'
        + 'Pledge Value,Banned Value,Face Value,Disputed Value,Total Value\n'
        + 'GOVERNMENT OF KENYA,IFB1/2022/018,KE8000002322,21 May 2040,Treasury Bonds,,'
        + '"50,000",11,0,0,0,11,KES,,"550,000",0,0,"550,000",0,"550,000"\n'
        + '"Export date: 27 Jul 2026, 15:12:13",,,,,,,,,,,,,,,,,,,\n'
        + 'Full Name: A SAMPLE NAME,,,,,,,,,,,,,,,,,,,\n'
        + 'Email: sample@example.com,,,,,,,,,,,,,,,,,,,\n'
        + 'KRA PIN: A000000000X,,,,,,,,,,,,,,,,,,,\n'),
    });
    await page.waitForTimeout(1200);
    const body = await page.innerText('body');

    if (!/IFB1\/2022\/018/.test(body)) fail('dhowcsd: the holding did not import');
    // The face value must survive its thousands separators intact.
    if (!/550,000/.test(body)) fail('dhowcsd: face value did not import as 550,000');
    // Nothing from the trailer may reach the screen.
    for (const secret of ['A SAMPLE NAME', 'sample@example.com', 'A000000000X']) {
      if (body.includes(secret)) fail(`dhowcsd: personal data from the trailer rendered: ${secret}`);
    }
    // And the price column must say so rather than showing a placeholder.
    const dhowRow = page.locator('tr', { hasText: 'IFB1/2022/018' }).first();
    const rowText = ((await dhowRow.innerText().catch(() => '')) || '').replace(/\s+/g, ' ');
    // Scoped to THIS row on purpose. The mark-to-market test above imports
    // NOTAREALBOND and it is still in IndexedDB, so "unknown bond" is legitimately
    // on the page — a body-wide match here failed against a row it was not about.
    if (/unknown bond/i.test(rowText)) {
      fail(`dhowcsd: the padded issue code was not matched to bonds.json (row: "${rowText}")`);
    }
    if (!/not stated/i.test(rowText)) {
      fail(`dhowcsd: no "not stated" price on a custody import (row: "${rowText}")`);
    }
    if (/100\.00/.test(rowText)) {
      fail(`dhowcsd: the placeholder par price was shown as if read (row: "${rowText}")`);
    }
  }
  if (failures.length === dhowBefore) {
    pass('custody export imported, matched a padded code, and left the price blank');
  }

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

      /* Landscape, and actually filling the page.
       *
       * The report sheet is wider than it is tall, and was being placed on A4
       * PORTRAIT: it fitted to the page width and finished at 210x150mm on a
       * 297mm page — 49% used, half of it blank, every figure shrunk to make
       * room for nothing. Orientation is now chosen from the measured content,
       * so this reads the page box out of the file rather than trusting that.
       *
       * Bytes and magic numbers cannot see this. A perfectly blank half-page
       * satisfies both. */
      const front = path ? (await readFile(path)).subarray(0, 4000).toString('latin1') : '';
      const box = front.match(/\/MediaBox\s*\[([^\]]+)\]/);
      if (!box) {
        fail('ladder: exported PDF declares no MediaBox');
      } else {
        const [, , w, h] = box[1].trim().split(/\s+/).map(Number);
        if (!(w > h)) {
          fail(`ladder: exported PDF is ${w}x${h}pt — portrait, so the wide sheet is being squeezed`);
        }
      }

      /* The report must contain TEXT, not only a photograph of text.
       *
       * html2canvas paints a picture, which is why the PDF looks exactly like
       * the app — and why, for a long time, nothing in it could be selected,
       * searched, copied into a spreadsheet or read aloud. A reader handed
       * this at a board meeting tries to select a figure and fails.
       *
       * An invisible text layer now sits over the image. Nothing visible
       * changed, so no screenshot or byte count can tell whether it is there:
       * this decompresses the content streams and counts real text-draw
       * operators, then checks a figure and a bond code survived. */
      const full = path ? await readFile(path) : Buffer.alloc(0);
      const drawn = [];
      for (const m of full.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
        let body = Buffer.from(m[1], 'latin1');
        try { body = zlibSync.inflateSync(body); } catch { /* already plain */ }
        for (const t of body.toString('latin1').matchAll(/\((?:\\.|[^\\()])*\)\s*Tj/g)) {
          const lit = t[0].slice(1, t[0].lastIndexOf(')'));
          if (lit.trim()) drawn.push(lit);
        }
      }
      if (drawn.length < 20) {
        fail(`ladder: exported PDF draws only ${drawn.length} text run(s) — the layer is missing, so nothing can be selected or searched`);
      } else if (!drawn.some((t) => /FXD1\/|IFB1\//.test(t))) {
        fail('ladder: the PDF text layer contains no bond code — it is not the report');
      }
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

  /* The footer of the sheet that actually prints.
   *
   * The PDF is the artifact that leaves the building. A figure on screen carries
   * the page around it; a printed sheet carries only its own footer, and it is
   * the sheet somebody relies on six months later.
   *
   * Both footers used to credit "Central Bank of Kenya, National Treasury, KNBS"
   * while the reports read none of the last two — they compute from bond cash
   * flows and a price and consult nothing else. A unit test pins the source
   * file; this reads the rendered sheet, because a footer assembled from
   * constants can typecheck perfectly and still render an empty string. */
  const footer = await page.evaluate(() => {
    const sheet = document.getElementById('ladder-report-sheet');
    if (!sheet) return { error: 'no ladder report sheet' };
    const prev = sheet.style.cssText;
    sheet.style.cssText = 'display:block;position:fixed;left:-10000px;top:0;width:794px';
    const f = sheet.querySelector('footer');
    const text = f ? f.textContent.replace(/\s+/g, ' ').trim() : '';
    sheet.style.cssText = prev;
    return { text };
  });
  if (footer.error) fail(`ladder: ${footer.error}`);
  else if (!footer.text) fail('ladder: the printed report has no footer at all');
  else {
    if (/KNBS|National Treasury/.test(footer.text)) {
      fail(`ladder: the printed footer credits a source the report never reads: "${footer.text}"`);
    }
    if (!/Central Bank of Kenya/.test(footer.text)) {
      fail(`ladder: the printed footer names no source (got "${footer.text}")`);
    }
    if (!/\d{4}-\d{2}-\d{2}/.test(footer.text)) {
      fail(`ladder: the printed footer does not date its data (got "${footer.text}")`);
    }
    if (!/not investment advice/i.test(footer.text)) {
      fail(`ladder: the printed footer drops the not-advice line (got "${footer.text}")`);
    }
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

  /* ------------------------------------------- the goal sheet fits its page */
  /*
   * The ladder export is checked above; the goal planner's was not checked at
   * all, and it is four different sheets rather than one.
   *
   * What can go wrong here is invisible to a byte count and to a page count
   * alike. The sheet is forced to 1123px for capture — A4 landscape at 96dpi —
   * but forcing a width does not stop content inside it being wider. When that
   * happened on the ladder, html2canvas painted exactly 1123px and everything
   * past the edge was cut: a table lost its right-hand column and the file was
   * still a perfectly valid one-page PDF. So overflow is measured directly.
   *
   * The ink clearance is the other half. The placed image runs to the paper
   * edge by design, and what keeps text off a printer's unprintable margin is
   * the sheet's own 40px padding — about 10mm once placed. If a future layout
   * drops that padding nothing looks wrong on screen, and the outermost column
   * comes back from the printer shaved.
   */
  /* ------------------------------- the spread options work from the keyboard */
  /*
   * These carry role="radiogroup" and role="radio", which tells a screen
   * reader "radio button, one of five" — and for a while every arrow key did
   * nothing and Tab stopped on all five in turn. An ARIA role is a promise
   * about behaviour, and one that is not kept is worse than plain buttons: it
   * tells somebody the arrows will work and then strands them.
   *
   * Nothing automated could see it. The roles were present, the labels were
   * right, Lighthouse was happy at 97 — the markup was correct and the
   * behaviour was missing, and only pressing the keys tells you that.
   */
  console.log('\nthe spread options answer the keyboard');
  const kbdBefore = failures.length;
  await go('/goals/');
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('Passive income'));
    if (b) b.click();
  });
  await page.waitForTimeout(900);

  const readState = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')].map((r) => r.getAttribute('aria-checked'))
    );
  const initial = await readState();
  if (initial.length < 3) {
    fail(`goals: found ${initial.length} spread options — the keyboard check would be vacuous`);
  } else {
    await page.evaluate(() => {
      const sel = document.querySelector('[role="radiogroup"] [role="radio"][aria-checked="true"]');
      if (sel) sel.focus();
    });
    // Every key the role promises, checked individually: a handler wired to
    // ArrowDown alone would pass a test that only pressed ArrowDown.
    for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      const before = (await readState()).join(',');
      await page.keyboard.press(key);
      await page.waitForTimeout(300);
      const after = (await readState()).join(',');
      if (before === after) fail(`goals: the spread options ignore ${key}`);
    }
    // Home and End must land somewhere definite, not merely move.
    await page.keyboard.press('Home');
    await page.waitForTimeout(300);
    if ((await readState())[0] !== 'true') fail('goals: Home does not select the first spread');
    await page.keyboard.press('End');
    await page.waitForTimeout(300);
    const end = await readState();
    if (end[end.length - 1] !== 'true') fail('goals: End does not select the last spread');

    /* One tab stop, entered the way a reader actually arrives.
     *
     * Measured from outside the group. Focusing a member directly overstates
     * it by one, because the unselected options carry tabindex -1 and are
     * reachable programmatically but not by Tab — which is the whole point of
     * a roving tabindex. */
    await page.evaluate(() => {
      const el = document.querySelector('input[type=number]');
      if (el) el.focus();
    });
    let stops = 0;
    let entered = false;
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(90);
      const inGroup = await page.evaluate(() => {
        const a = document.activeElement;
        return !!(a && a.closest && a.closest('[role="radiogroup"]'));
      });
      if (inGroup) { stops++; entered = true; } else if (entered) break;
    }
    if (!entered) fail('goals: Tab never reaches the spread options at all');
    else if (stops !== 1) fail(`goals: the spread options take ${stops} tab stops; a radiogroup takes one`);
  }
  if (failures.length === kbdBefore) pass('arrows, Home and End all move the spread; the group is a single tab stop');

  console.log('\nevery goal sheet fits an A4 page');
  const fitBefore = failures.length;
  for (const objective of ['Financial independence', 'School fees', 'Passive income', 'Capital preservation']) {
    await go('/goals/');
    await page.waitForTimeout(1200);
    const chosen = await page.evaluate((name) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(name));
      if (!b) return false;
      b.click();
      return true;
    }, objective);
    if (!chosen) { fail(`goals: no control for the ${objective} objective`); continue; }
    await page.waitForTimeout(900);

    // Measured under the exact geometry the exporter imposes, then restored.
    const m = await page.evaluate(() => {
      const el = document.getElementById('goal-report-sheet');
      if (!el) return null;
      const prev = el.getAttribute('style') || '';
      el.style.display = 'block';
      el.style.width = '1123px';
      el.style.boxSizing = 'border-box';
      el.style.padding = '34px 40px';
      const r = el.getBoundingClientRect();
      const H = Math.ceil(Math.max(r.height, el.scrollHeight)) + 8;
      let left = Infinity, right = -Infinity;
      for (const n of el.querySelectorAll('*')) {
        const s = getComputedStyle(n);
        if (s.visibility === 'hidden' || s.display === 'none') continue;
        const q = n.getBoundingClientRect();
        if (q.width <= 0 || q.height <= 0) continue;
        left = Math.min(left, q.left - r.left);
        right = Math.max(right, q.right - r.left);
      }
      el.setAttribute('style', prev);
      return { overflow: Math.ceil(el.scrollWidth) - 1123, H, left, right };
    });
    if (!m) { fail(`goals: ${objective} renders no printable sheet`); continue; }

    if (m.overflow > 1) {
      fail(`goals: the ${objective} sheet is ${m.overflow}px wider than the capture — that much is cut off the right edge`);
    }
    // The sheet is placed at exactly the page width, so px map to mm directly.
    const mm = (px) => (px / 1123) * 297;
    const SAFE_MM = 6; // typical consumer-printer unprintable margin is ~5mm
    if (mm(m.left) < SAFE_MM || mm(1123 - m.right) < SAFE_MM) {
      fail(
        `goals: ${objective} puts ink ${Math.min(mm(m.left), mm(1123 - m.right)).toFixed(1)}mm from the paper edge — inside what most printers cannot print`
      );
    }
    // Landscape is what keeps these to one page; a sheet taller than it is
    // wide takes the portrait branch and starts spilling.
    if (m.H >= 1123) {
      fail(`goals: the ${objective} sheet is ${m.H}px tall against 1123px wide — it will not fit one landscape page`);
    }
  }
  if (failures.length === fitBefore) pass('all four goal sheets fit A4 landscape with no overflow and >6mm ink clearance');

  /* ------------------------- the printout agrees with the screen it came from */
  /*
   * THE DEFECT THIS EXISTS TO CATCH, WHICH HAS NOW HAPPENED FOUR TIMES.
   *
   * A figure is corrected on the page and the copy of it in the report is left
   * behind. The passive-income sheet printed "Average / month" — the annual
   * figure over twelve — for some time after the screen had stopped, so the
   * page said Ksh 87,051 and the PDF said Ksh 43,525 for the same plan. The
   * same shape produced the currency labels, the MMF rate and the retired
   * statistics: a convention established in one place and retyped in another,
   * with nothing holding the two in step.
   *
   * Nothing already here could see it. Unit tests check each surface against
   * its own expectations. The fit checks measure geometry. Provenance greps
   * the source. Every one of them passes while the two renderings disagree,
   * because none of them ever puts the two side by side.
   *
   * So: every money figure the SHEET prints must also appear on the SCREEN.
   * That direction is the meaningful one — the sheet is the derived artefact
   * and must not invent a number. The reverse would fail honestly, since the
   * screen shows working the sheet condenses away.
   *
   * This is a CLASS guard, not a test of any one figure. It does not care what
   * the numbers mean. Anything the printout states that the page does not is a
   * failure, whatever caused it.
   */
  console.log('\nthe printout says what the screen says');
  const agreeBefore = failures.length;

  /* Columns the sheet carries and the screen does not — now none.
   *
   * This held "Covered", the sheet's per-year total of principal plus coupons.
   * The exception was honest but it was pointing at a gap: the screen showed
   * the two parts and left the reader summing them to answer the only question
   * the row exists for, while the printout answered it outright. Putting the
   * column on the page fixed the product AND removed the exception, which is
   * the better outcome — every exception here is a place the guard cannot see.
   *
   * Anything added back should have to justify itself in this comment, and
   * should first be checked for being a missing feature rather than a
   * legitimate difference. */
  const SHEET_ONLY_COLUMNS = [];

  for (const objective of ['Financial independence', 'School fees', 'Passive income', 'Capital preservation']) {
    await go('/goals/');
    await page.waitForTimeout(1200);
    const ok = await page.evaluate((name) => {
      const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(name));
      if (!b) return false;
      b.click();
      return true;
    }, objective);
    if (!ok) { fail(`agreement: no control for the ${objective} objective`); continue; }
    await page.waitForTimeout(1000);

    /* Move OFF the default before comparing, or the guard is blind.
     *
     * Found by mutation: reintroducing the exact "Average / month" defect this
     * check exists to catch did not fail it. The default income plan spreads
     * across six bonds and therefore pays in all twelve months — and at twelve
     * of twelve, annual/12 and annual/monthsPaid are the same number. The two
     * formulas agree precisely where the test was looking, and disagree
     * everywhere else.
     *
     * A defect that only exists away from the defaults is the normal case, not
     * an exotic one: defaults are what everybody looks at, so they are what
     * gets fixed first. Selecting a narrower spread puts the sheet in the state
     * the original bug actually shipped in — six paying months, where the flat
     * average is wrong by a factor of two. */
    if (objective === 'Passive income') {
      const moved = await page.evaluate(() => {
        const radios = [...document.querySelectorAll('[role="radiogroup"] [role="radio"]')];
        const narrower = radios.find((r) => /^\s*6 of 12/.test(r.textContent));
        if (!narrower) return false;
        narrower.click();
        return true;
      });
      if (!moved) fail('agreement: could not select a narrower spread — the check would only ever see 12 of 12');
      await page.waitForTimeout(900);
    }

    const result = await page.evaluate((skipCols) => {
      const sheet = document.getElementById('goal-report-sheet');
      if (!sheet) return { error: 'no printable sheet' };
      const RE = /-?Ksh\s?([\d.,]+)([KkMm])?/g;

      /* Tolerance comes from the string's own precision, not a percentage.
       * "Ksh 2.9M" states its value only to the nearest 100,000, so it can
       * legitimately stand for 2,860,254 — a 1.4% difference that no sane
       * fixed percentage would admit without also admitting real errors. */
      const tolOf = (digits, suffix) => {
        const dp = (digits.split('.')[1] || '').length;
        const unit = suffix ? (/[Mm]/.test(suffix) ? 1e6 : 1e3) : 1;
        return unit / Math.pow(10, dp) / 2;
      };
      const parse = (digits, suffix) => {
        const n = parseFloat(digits.replace(/,/g, ''));
        if (!isFinite(n)) return null;
        return suffix ? n * (/[Mm]/.test(suffix) ? 1e6 : 1e3) : n;
      };

      // Which table column a cell sits in, so sheet-only columns can be skipped.
      const columnOf = (node) => {
        const td = node.closest?.('td');
        if (!td) return null;
        const table = td.closest('table');
        const head = table?.querySelectorAll('thead th');
        if (!head || !head.length) return null;
        return head[td.cellIndex]?.textContent.trim() ?? null;
      };

      const grab = (root, exclude) => {
        const out = [];
        const walk = (node) => {
          if (exclude && node === exclude) return;
          if (node.nodeType === 3) {
            const col = columnOf(node.parentElement);
            if (col && skipCols.includes(col)) return;
            for (const m of (node.textContent || '').matchAll(RE)) {
              const v = parse(m[1], m[2]);
              if (v !== null) out.push({ v, tol: tolOf(m[1], m[2]), text: m[0], col });
            }
            return;
          }
          if (node.nodeType !== 1) return;
          // Inputs count as on-screen: a figure the reader typed is a figure
          // the page is showing them, even though it is not text.
          if (node.tagName === 'INPUT' && node.value) {
            const n = parseFloat(String(node.value).replace(/,/g, ''));
            if (isFinite(n)) out.push({ v: n, tol: 0.5, text: `input ${node.value}`, col: null });
          }
          for (const c of node.childNodes) walk(c);
        };
        walk(root);
        return out;
      };

      const screen = grab(document.body, sheet);
      const printed = grab(sheet, null);
      const explained = (f) => screen.some((s) => Math.abs(s.v - f.v) <= Math.max(s.tol, f.tol));
      const orphans = [...new Map(printed.filter((f) => !explained(f)).map((f) => [f.v, f])).values()];
      return { screenCount: screen.length, printedCount: printed.length, orphans };
    }, SHEET_ONLY_COLUMNS);

    if (result.error) { fail(`agreement: ${objective} — ${result.error}`); continue; }
    // A vacuous pass is the failure mode here: if nothing was collected from
    // either surface, every figure is trivially "explained".
    if (result.printedCount < 3 || result.screenCount < 3) {
      fail(`agreement: ${objective} collected only ${result.printedCount} printed / ${result.screenCount} screen figures — the scan is not seeing the page`);
      continue;
    }
    if (result.orphans.length) {
      fail(
        `agreement: the ${objective} printout states ${result.orphans.length} figure(s) that appear nowhere on screen — ` +
          result.orphans.map((o) => `${o.text}${o.col ? ` (${o.col})` : ''}`).join(', ')
      );
    }
  }
  if (failures.length === agreeBefore) pass('every printed figure on all four sheets also appears on the page');

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
