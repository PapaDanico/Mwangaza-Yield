import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
for (const r of ['/goals/','/calculator/','/prices/','/sell/']) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.addInitScript(() => { window.__s = [];
    new PerformanceObserver(l => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue;
      window.__s.push({ v: e.value, src: (e.sources||[]).map(s => ({
        n: s.node ? (s.node.tagName + '.' + String(s.node.className||'').split(' ').slice(0,2).join('.')) : '?',
        dy: s.previousRect && s.currentRect ? Math.round(s.currentRect.y - s.previousRect.y) : null,
        dh: s.previousRect && s.currentRect ? Math.round(s.currentRect.height - s.previousRect.height) : null,
        t: s.node && s.node.innerText ? s.node.innerText.slice(0,26).replace(/\n/g,' ') : '' })) }); } })
      .observe({ type: 'layout-shift', buffered: true }); });
  await p.goto('http://127.0.0.1:4902' + r, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2200);
  console.log('\n=== ' + r + ' ===');
  for (const x of await p.evaluate(()=>window.__s)) if (x.v > 0.005) console.log(' ', x.v.toFixed(4), JSON.stringify(x.src).slice(0,240));
  await p.close();
}
await b.close();
