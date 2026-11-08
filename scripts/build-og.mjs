#!/usr/bin/env node
/**
 * Regenerate public/og.png — the horizontal lockup, and the only place the
 * wordmark exists.
 *
 * WHY THIS IS A SCRIPT AND NOT A SAVED SCREENSHOT
 *
 * The icons are rendered from logo.svg precisely so they cannot drift from the
 * mark. An OG card drawn once by hand reintroduces exactly that problem at the
 * size that matters most: the card is what WhatsApp shows when anyone posts a
 * link, which since the Pesa Smart channel launched is the brand's highest-
 * volume impression by a wide margin. Change the mark and forget the card, and
 * the most-seen artefact is the stale one.
 *
 * So the mark is INLINED FROM public/logo.svg at build time. There is no
 * second copy of the geometry here.
 *
 * WHY THE FONT COMES OUT OF .next
 *
 * The wordmark is set in Plus Jakarta Sans — the app's own font-display, so
 * the lockup matches the product by construction rather than by eye. next/font
 * already downloads and subsets it during `next build`, so this reads the
 * cached woff2 rather than fetching from Google: one fewer network dependency,
 * and it guarantees the card uses the exact file the site serves.
 *
 * Requires `next build` to have run. Usage: node scripts/build-og.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const ROOT = new URL('..', import.meta.url).pathname;
const CHROME = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/** The Jakarta subset next/font cached during the last build. */
function jakartaBase64() {
  const cssDir = `${ROOT}.next/static/css`;
  if (!existsSync(cssDir)) throw new Error('run `npm run build` first — .next/static/css is missing');
  for (const f of readdirSync(cssDir)) {
    const css = readFileSync(`${cssDir}/${f}`, 'utf8');
    for (const m of css.matchAll(/@font-face\{([^}]*)\}/g)) {
      if (!/Jakarta/.test(m[1])) continue;
      const url = m[1].match(/url\(([^)]+)\)/)?.[1];
      // The .p. subset is the preloaded latin one — the glyphs we need.
      if (url?.includes('.p.woff2')) {
        return readFileSync(`${ROOT}.next${url.replace('/_next', '')}`).toString('base64');
      }
    }
  }
  throw new Error('Plus Jakarta Sans not found in the built CSS');
}

/* Strip the leading XML comment so the SVG can be inlined into HTML. */
const mark = (() => {
  const svg = readFileSync(`${ROOT}public/logo.svg`, 'utf8');
  return svg.slice(svg.indexOf('<svg'));
})();

const html = `<style>
@font-face{font-family:Jakarta;src:url(data:font/woff2;base64,${jakartaBase64()}) format('woff2');font-weight:200 800}
*{margin:0;padding:0;box-sizing:border-box}
/* A low sun-glow in the top corner (the site's own page glow, at card scale),
   a large faint mark bleeding off the bottom-right, and the site's headline
   as the card's subject. NO figure appears here on purpose: this is a static
   file served for months, and a yield printed on it would be a claim with an
   expiry date that nothing re-checks. */
body{width:1200px;height:630px;position:relative;overflow:hidden;font-family:Jakarta,sans-serif;color:#F4EFE6;
 background:radial-gradient(ellipse 38% 55% at 100% 0%,rgba(248,170,28,.07),transparent),#05172C;
 display:flex;flex-direction:column;justify-content:space-between;padding:60px 88px}
/* The inline SVG carries width="512" of its own, which wins over the parent
   unless the element itself is sized. Left unset, the mark rendered at full
   512 and pushed the wordmark off the card — the same intrinsic-size trap
   logo.svg's own header warns about for html2canvas. */
.mark{width:76px;height:76px;flex:none}
.mark svg,.wm svg{width:100%;height:100%;display:block}
.wm{position:absolute;z-index:-1;right:-70px;bottom:-110px;width:520px;height:520px;opacity:.07}
.row{display:flex;align-items:center;gap:20px}
.word{font-weight:800;font-size:38px;letter-spacing:-1px;line-height:1}
.word .y{color:#F8AA1C}
h1{font-weight:700;font-size:78px;line-height:1.05;letter-spacing:-2px}
h1 .g{color:#F8AA1C}
.sub{margin-top:26px;font-weight:500;font-size:29px;opacity:.8;line-height:1.35;max-width:820px}
.foot{display:flex;align-items:center;gap:26px;font-weight:600;font-size:26px;color:#F8AA1C}
.rule{width:104px;height:6px;background:#F8AA1C;border-radius:3px}
</style>
<div class="wm">${mark}</div>
<div class="row"><div class="mark">${mark}</div>
<div class="word">Mwangaza <span class="y">Yield</span></div></div>
<div><h1>When you lend to Kenya<span style="margin-left:-11px">,</span><br><span class="g">know what you earn.</span></h1>
<div class="sub">What a government bond really pays after tax, in plain language, before you commit a shilling.</div></div>
<div class="foot"><div class="rule"></div>mwangazayield.org</div>`;

const tmp = `${ROOT}.next/og-source.html`;
writeFileSync(tmp, html);

const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${tmp}`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: `${ROOT}public/og.png` });
await browser.close();

// Losslessly shrink it if optipng is around; the card is served on every share.
try {
  execFileSync('optipng', ['-quiet', '-o2', `${ROOT}public/og.png`]);
} catch {
  /* optional */
}
console.log('public/og.png rebuilt from logo.svg + Plus Jakarta Sans');
