import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('http://127.0.0.1:4900/prices/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
await p.screenshot({ path: 'prices.png' });
const m = await p.evaluate(() => {
  const cards = [...document.querySelectorAll('.card')];
  return { total: Math.round(document.documentElement.scrollHeight), n: cards.length,
    heights: cards.slice(0,8).map(c=>Math.round(c.getBoundingClientRect().height)),
    sample: cards.slice(0,3).map(c=>(c.innerText||'').slice(0,110).replace(/\n/g,' | ')) };
});
console.log(JSON.stringify(m, null, 1));
console.log('\n--- page text head ---');
console.log((await p.evaluate(()=>document.body.innerText)).slice(300, 1400));
await b.close();
