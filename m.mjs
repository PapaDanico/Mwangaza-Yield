import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const w of [390, 640, 1280]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  await p.goto('http://127.0.0.1:4602/dashboard/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const h = await p.evaluate(() => {
    const el = document.querySelector('a[href="/auctions/"].card');
    return el ? el.getBoundingClientRect().height : null;
  });
  console.log(`${w}px -> banner ${h}px`);
  await p.close();
}
await b.close();
