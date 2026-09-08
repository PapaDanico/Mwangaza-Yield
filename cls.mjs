import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.addInitScript(() => { window.__c = 0;
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__c += e.value; })
    .observe({ type: 'layout-shift', buffered: true }); });
const BEFORE = {'/prices/':0.2519,'/goals/':0.2752,'/calculator/':0.2502,'/sell/':0.2225};
console.log('route          before    after');
for (const r of Object.keys(BEFORE)) {
  await p.goto('http://127.0.0.1:4906' + r, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  const c = await p.evaluate(() => window.__c);
  console.log(r.padEnd(14), BEFORE[r].toFixed(4), c.toFixed(4).padStart(8), c > 0.1 ? ' OVER' : ' ok');
  await p.evaluate(() => { window.__c = 0; });
}
await b.close();
