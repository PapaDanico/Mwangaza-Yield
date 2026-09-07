import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage({ viewport: { width: 1280, height: 1000 } });
await p.goto('http://127.0.0.1:4499/auctions/', { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
await p.locator('body').screenshot({ path: 'auctions2.png' });
console.log((await p.evaluate(() => document.body.innerText)).slice(0, 900));
await b.close();
