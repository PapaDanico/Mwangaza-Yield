import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const w of [390, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto('http://127.0.0.1:4502/dashboard/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const h = await p.evaluate(() => {
    const el = document.querySelector('a[href="/auctions/"].card');
    return el ? Math.round(el.getBoundingClientRect().height) : null;
  });
  console.log(`viewport ${w}px -> banner height ${h}px (Reserve is 92px)`);
  await p.close();
}
await b.close();
