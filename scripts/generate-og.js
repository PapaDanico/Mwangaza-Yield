// Generate the 1200x630 social/OG card from the brand system.
// Run after any brand change: node scripts/generate-og.js
const sharp = require('sharp');
const path = require('path');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs>
    <radialGradient id="bg" cx="30%" cy="20%" r="110%">
      <stop offset="0%" stop-color="#122A4C"/>
      <stop offset="55%" stop-color="#0A192F"/>
      <stop offset="100%" stop-color="#050F1F"/>
    </radialGradient>
    <linearGradient id="sail" x1="0" y1="1" x2="0.6" y2="0">
      <stop offset="0%" stop-color="#D97706"/>
      <stop offset="100%" stop-color="#FCD34D"/>
    </linearGradient>
    <linearGradient id="glowline" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#B45309"/>
      <stop offset="100%" stop-color="#FCD34D"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- rising yield sweep across the card -->
  <path d="M 60 600 C 360 588, 680 545, 900 480 S 1130 380, 1170 340"
        fill="none" stroke="url(#glowline)" stroke-width="7" stroke-linecap="round" opacity="0.5"/>

  <!-- dhow mark -->
  <g transform="translate(795, 60) scale(0.62)">
    <path d="M 176 342 C 164 236, 208 128, 322 78 C 278 160, 264 252, 272 342 Z" fill="url(#sail)"/>
    <path d="M 288 254 L 330 216 L 358 230 L 400 174" fill="none" stroke="#F59E0B" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="330" cy="216" r="11" fill="#F59E0B"/>
    <circle cx="358" cy="230" r="11" fill="#F59E0B"/>
    <path d="M 418 138 L 416 184 L 378 160 Z" fill="#F59E0B"/>
    <path d="M 118 362 Q 256 406 394 362 L 366 402 Q 256 430 146 402 Z" fill="#F59E0B"/>
    <path d="M 150 444 Q 202 430 256 444 T 362 444" fill="none" stroke="#10B981" stroke-width="12" stroke-linecap="round"/>
  </g>

  <text x="80" y="240" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="76" fill="#FDFBF5">Sovereign yields,</text>
  <text x="80" y="330" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="76" fill="#F59E0B">crystal clear.</text>
  <text x="80" y="410" font-family="DejaVu Sans, sans-serif" font-size="30" fill="#94A3B8">Tax-adjusted analytics for Kenya's bond market</text>

  <text x="80" y="545" font-family="DejaVu Sans, sans-serif" font-weight="bold" font-size="34" fill="#FDFBF5">MWANGAZA <tspan fill="#F59E0B">YIELD</tspan></text>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile(path.join(__dirname, '..', 'public', 'og.png'))
  .then(() => console.log('wrote public/og.png'));
