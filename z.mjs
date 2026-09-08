import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const r of ['/prices/','/sell/','/calculator/']) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto('http://127.0.0.1:4905' + r, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(80);
  const pre = await p.evaluate(() => [...document.querySelector('main').children[0].children].map(c => Math.round(c.getBoundingClientRect().height)));
  await p.waitForTimeout(3000);
  const post = await p.evaluate(() => [...document.querySelector('main').children[0].children].map(c => Math.round(c.getBoundingClientRect().height)));
  console.log(r.padEnd(14), 'pre', JSON.stringify(pre), ' post', JSON.stringify(post));
  await p.close();
}
await b.close();
