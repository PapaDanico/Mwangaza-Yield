import { chromium } from 'playwright-core';
const ROUTES = ['/dashboard/','/auctions/','/tbills/','/ladder/','/portfolio/','/prices/','/macro/'];
const BEFORE = { 390: {'/dashboard/':8714,'/auctions/':7807,'/tbills/':4697,'/ladder/':5224,'/portfolio/':2462,'/prices/':13081,'/macro/':6028},
                 1440:{'/dashboard/':5393,'/auctions/':4645,'/tbills/':2932,'/ladder/':2670,'/portfolio/':1619,'/prices/':10013,'/macro/':3640} };
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const w of [390, 1440]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 } });
  console.log(`\n=== ${w}px ===   route            before    after   change   mainW  used%`);
  let tb=0, ta=0;
  for (const r of ROUTES) {
    await p.goto('http://127.0.0.1:4601' + r, { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);
    const m = await p.evaluate(() => {
      const main = document.querySelector('main') || document.body;
      const mw = Math.round(main.getBoundingClientRect().width);
      return { h: Math.round(document.documentElement.scrollHeight), mainW: mw, used: Math.round(mw/window.innerWidth*100) };
    });
    const before = BEFORE[w][r]; tb+=before; ta+=m.h;
    const d = m.h - before, pct = ((d/before)*100).toFixed(1);
    console.log('                 ', r.padEnd(14), String(before).padStart(6), String(m.h).padStart(8), (pct+'%').padStart(8), String(m.mainW).padStart(7), (m.used+'%').padStart(5));
  }
  console.log('                  TOTAL          ', String(tb).padStart(6), String(ta).padStart(8), (((ta-tb)/tb*100).toFixed(1)+'%').padStart(8));
  await p.close();
}
await b.close();
