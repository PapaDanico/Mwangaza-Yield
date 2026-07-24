// Rasterize public/logo.svg into PNG app icons (iOS ignores SVG manifest icons).
// Run after any logo change: node scripts/generate-icons.js
const sharp = require('sharp');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const logo = path.join(pub, 'logo.svg');

const targets = [
  { file: 'icons/icon-192.png', size: 192 },
  { file: 'icons/icon-512.png', size: 512 },
  { file: 'icons/maskable-512.png', size: 512, pad: true },
  { file: 'apple-touch-icon.png', size: 180 },
];

(async () => {
  for (const t of targets) {
    const out = path.join(pub, t.file);
    if (t.pad) {
      // Maskable icons need the mark inside the 80% safe zone.
      const inner = Math.round(t.size * 0.8);
      const margin = Math.round((t.size - inner) / 2);
      const img = await sharp(logo).resize(inner, inner).png().toBuffer();
      await sharp({
        create: { width: t.size, height: t.size, channels: 4, background: '#0A192F' },
      })
        .composite([{ input: img, top: margin, left: margin }])
        .png()
        .toFile(out);
    } else {
      await sharp(logo).resize(t.size, t.size).png().toFile(out);
    }
    console.log('wrote', t.file);
  }
})();
