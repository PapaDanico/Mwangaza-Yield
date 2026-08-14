// Rasterize public/logo.svg into PNG app icons (iOS ignores SVG manifest icons).
// Run after any logo change:  node scripts/generate-icons.js
//
// WHY CHROMIUM AND NOT SHARP
//
// This used sharp. sharp only rasterizes SVG when its build links librsvg, and
// the build installed here does not — `sharp(logo).resize(...)` fails outright
// with "Input file contains unsupported image format". So the icons could only
// be regenerated on a machine that happened to have the right sharp, and the
// ones committed to the repository were wrong:
//
//   icon-192.png   bottom 87px transparent — 45% of the icon missing
//   icon-512.png   bottom 87px transparent — 17% missing
//
// The same 87px at two different canvas sizes is the tell. A bad resize scales
// its error with the output; a fixed 87px does not. These were not produced by
// resizing this SVG at all.
//
// Chromium is already a dependency here — it drives the smoke tests — and it
// renders logo.svg correctly at every size, so the generator now uses it. That
// also means this script runs in CI and in a clean container, which the sharp
// version could not.
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const svg = fs.readFileSync(path.join(pub, 'logo.svg'), 'utf8');

const targets = [
  { file: 'icons/icon-192.png', size: 192 },
  { file: 'icons/icon-512.png', size: 512 },
  { file: 'icons/maskable-512.png', size: 512, pad: true },
  { file: 'apple-touch-icon.png', size: 180 },
];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  try {
    for (const t of targets) {
      const page = await browser.newPage({
        viewport: { width: t.size, height: t.size },
        deviceScaleFactor: 1,
      });

      // Maskable icons must keep the mark inside the 80% safe zone, because the
      // launcher crops to a shape it chooses — a circle on some Android
      // launchers. Everything outside that zone is expendable, so the mark is
      // inset and the gap filled with the brand navy rather than left clear.
      const inner = t.pad ? Math.round(t.size * 0.8) : t.size;
      const bg = t.pad ? '#05172C' : 'transparent';

      await page.setContent(
        `<body style="margin:0;width:${t.size}px;height:${t.size}px;background:${bg};` +
          `display:flex;align-items:center;justify-content:center;overflow:hidden">` +
          `<div style="width:${inner}px;height:${inner}px;line-height:0">${svg}</div></body>`
      );
      await page.evaluate(() => {
        const s = document.querySelector('svg');
        if (s) {
          s.setAttribute('width', '100%');
          s.setAttribute('height', '100%');
        }
      });

      const out = path.join(pub, t.file);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      await page.screenshot({ path: out, omitBackground: !t.pad });
      await page.close();
      console.log('wrote', t.file, `${t.size}x${t.size}`);
    }
  } finally {
    await browser.close();
  }
})();
