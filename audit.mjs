import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('http://127.0.0.1:4800/dashboard/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const rows = await p.evaluate(() => {
  const stack = document.querySelector('main').children[0];
  let y = 0; const out = [];
  for (const c of stack.children) {
    const h = Math.round(c.getBoundingClientRect().height);
    out.push({ h, top: y, t: (c.innerText||'').slice(0,34).replace(/\n/g,' ') });
    y += h + 20; // space-y-5
  }
  return out;
});
console.log('top    height   in 1st viewport(844)   content');
for (const r of rows) console.log(String(r.top).padStart(5), String(r.h).padStart(8), (r.top < 844 ? '   YES' : '   no ').padStart(20), '  ', r.t);
console.log('\n--- individual cards inside the lg:grid group ---');
const cards = await p.evaluate(() => [...document.querySelectorAll('.card')].map(c => ({
  h: Math.round(c.getBoundingClientRect().height), t: (c.innerText||'').slice(0,30).replace(/\n/g,' ') })));
for (const c of cards) if (/last 12 months|high or low|borrower pay|interest rates/.test(c.t)) console.log(String(c.h).padStart(6), c.t);
await b.close();
