import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__shifts.push({
        value: e.value,
        sources: (e.sources || []).map((s) => ({
          node: s.node ? (s.node.tagName + (s.node.className ? '.' + String(s.node.className).slice(0, 70) : '')) : 'none',
          from: s.previousRect ? `${Math.round(s.previousRect.y)}` : '',
          to: s.currentRect ? `${Math.round(s.currentRect.y)}` : '',
        })),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });
});
await p.goto('http://127.0.0.1:4501/dashboard/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const s = await p.evaluate(() => window.__shifts);
for (const x of s) if (x.value > 0.002) console.log(x.value.toFixed(4), JSON.stringify(x.sources));
console.log('total', s.reduce((a, x) => a + x.value, 0).toFixed(4));
await b.close();
