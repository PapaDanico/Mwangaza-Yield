import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
// Freeze before hydration to capture reserved heights, then compare after.
await p.goto('http://127.0.0.1:4604/dashboard/', { waitUntil: 'domcontentloaded' });
const before = await p.evaluate(() => [...document.querySelectorAll('.card')].map(c => ({
  h: Math.round(c.getBoundingClientRect().height), r: c.classList.contains('reserve'),
  t: (c.innerText||'').slice(0,28).replace(/\n/g,' ') })));
await p.waitForTimeout(3000);
const after = await p.evaluate(() => [...document.querySelectorAll('.card')].map(c => ({
  h: Math.round(c.getBoundingClientRect().height),
  t: (c.innerText||'').slice(0,28).replace(/\n/g,' ') })));
console.log('RESERVED (pre-hydration):');
before.forEach((c,i)=> c.r && console.log(`  #${i} reserve h=${c.h}`));
console.log('AFTER:');
after.forEach((c,i)=> console.log(`  #${i} h=${String(c.h).padStart(4)}  ${c.t}`));
await b.close();
