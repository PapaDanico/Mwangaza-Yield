import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.addInitScript(() => {
  window.__s = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue;
    window.__s.push({ v: e.value, src: (e.sources||[]).map(s => ({
      n: s.node ? (s.node.tagName + '.' + String(s.node.className||'').split(' ')[0]) : '?',
      y0: s.previousRect?Math.round(s.previousRect.y):null, y1: s.currentRect?Math.round(s.currentRect.y):null,
      h0: s.previousRect?Math.round(s.previousRect.height):null, h1: s.currentRect?Math.round(s.currentRect.height):null,
      txt: s.node && s.node.innerText ? s.node.innerText.slice(0,30).replace(/\n/g,' ') : '' })) });
  }}).observe({ type: 'layout-shift', buffered: true });
});
await p.goto('http://127.0.0.1:4700/dashboard/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(120);
const pre = await p.evaluate(() => {
  const main = document.querySelector('main');
  return [...main.children[0].children].map(c => ({ h: Math.round(c.getBoundingClientRect().height),
    reserve: !!c.querySelector('.animate-pulse') || c.classList.contains('animate-pulse'),
    t: (c.innerText||'').slice(0,24).replace(/\n/g,' ') }));
});
await p.waitForTimeout(3000);
const post = await p.evaluate(() => {
  const main = document.querySelector('main');
  return [...main.children[0].children].map(c => ({ h: Math.round(c.getBoundingClientRect().height),
    t: (c.innerText||'').slice(0,24).replace(/\n/g,' ') }));
});
console.log('idx  reserved  actual   delta   content');
for (let i=0;i<Math.max(pre.length,post.length);i++){
  const a=pre[i]||{h:0,t:''}, z=post[i]||{h:0,t:''};
  const d = z.h - a.h;
  console.log(String(i).padStart(3), String(a.h).padStart(9), String(z.h).padStart(7), String(d>0?'+'+d:d).padStart(7), '  ', (z.t||a.t));
}
console.log('\nSHIFTS:');
for (const x of await p.evaluate(()=>window.__s)) if (x.v>0.0005) console.log(' ', x.v.toFixed(4), JSON.stringify(x.src).slice(0,220));
await b.close();
