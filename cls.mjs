import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.addInitScript(() => {
  window.__s = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue;
    window.__s.push({ v: e.value, src: (e.sources||[]).map(s => ({
      n: s.node ? (s.node.tagName + (s.node.className ? '.' + String(s.node.className).split(' ').slice(0,3).join('.') : '')) : '?',
      dy: s.previousRect && s.currentRect ? Math.round(s.currentRect.y - s.previousRect.y) : null,
      dh: s.previousRect && s.currentRect ? Math.round(s.currentRect.height - s.previousRect.height) : null,
    })) });
  }}).observe({ type: 'layout-shift', buffered: true });
});
await p.goto('http://127.0.0.1:4603/dashboard/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const s = await p.evaluate(() => window.__s);
for (const x of s) if (x.v > 0.001) console.log(x.v.toFixed(4), JSON.stringify(x.src).slice(0,300));
console.log('TOTAL', s.reduce((a,x)=>a+x.v,0).toFixed(4));
await b.close();
