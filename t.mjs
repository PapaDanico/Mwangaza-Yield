import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const w of [390, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  console.log(`\n=== ${w}px ===`);
  for (const r of ['/goals/','/calculator/','/prices/','/sell/']) {
    await p.goto('http://127.0.0.1:4904' + r, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2000);
    const h = await p.evaluate(() => Math.round(document.querySelector('main').children[0].children[1].getBoundingClientRect().height));
    console.log('  ' + r.padEnd(14), String(h).padStart(6));
    await p.evaluate(()=>{});
  }
  await p.close();
}
await b.close();
