import { chromium } from 'playwright-core';
const MATCH = [['TopYields',/net o|BEST TAX-FREE/],['MacroPanel',/^CBR/],['RateCycle',/Which way interest rates/],['MarketPulse',/last 12 months of auc/],['YieldInHistory',/high or low/],['SovereignContext',/borrower pay/]];
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const w of [390, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto('http://127.0.0.1:4801/dashboard/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  const stack = await p.evaluate(() => [...document.querySelector('main').children[0].children].map(c => ({
    h: Math.round(c.getBoundingClientRect().height), t: (c.innerText||'').slice(0,40).replace(/\n/g,' ') })));
  const cards = await p.evaluate(() => [...document.querySelectorAll('.card')].map(c => ({
    h: Math.round(c.getBoundingClientRect().height), t: (c.innerText||'').slice(0,40).replace(/\n/g,' ') })));
  console.log(`\n=== ${w}px ===`);
  for (const [name, re] of MATCH) {
    const pool = (name==='TopYields'||name==='MacroPanel') ? stack : cards;
    const hit = pool.find(x => re.test(x.t));
    console.log('  ' + name.padEnd(18), hit ? String(hit.h).padStart(5) : '  ?');
  }
  await p.close();
}
await b.close();
