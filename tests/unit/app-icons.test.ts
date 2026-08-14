import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import sharp from 'sharp';

/**
 * THE APP ICONS ARE NOT CLIPPED.
 *
 * This exists because two of them shipped broken and stayed broken until a
 * human looked at a browser tab. `icon-192.png` had its bottom 87 pixels blank
 * — 45% of the icon gone, the curve and the dot with it — and `icon-512.png`
 * had the same 87 pixels missing, 17% of that canvas.
 *
 * The identical 87px at two different sizes is what named the cause. A bad
 * resize scales its error with the output; a fixed 87px does not, so those
 * files were never produced by resizing logo.svg at all. The generator could
 * not have produced them here either: it used sharp, sharp only rasterizes SVG
 * when its build links librsvg, and this one does not — it throws "Input file
 * contains unsupported image format". So the icons could only be regenerated
 * on someone's particular machine, and nothing checked the result.
 *
 * Nothing else would have caught it. The files existed, they were valid PNGs
 * of the right dimensions, the HTML referenced them correctly, and the build
 * copied them. Every check short of looking at the pixels passed.
 */
const ICONS = [
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'apple-touch-icon.png',
];

const PUBLIC = join(process.cwd(), 'public');

describe('app icons', () => {
  it.each(ICONS)('%s is square, and its artwork reaches every edge', async (rel) => {
    const { data, info } = await sharp(join(PUBLIC, rel))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    expect(info.width, `${rel} is not square`).toBe(info.height);

    /* Scan for the last row carrying any opaque pixel. A clipped icon leaves a
     * transparent band at the bottom, which is exactly how both broken files
     * presented — full width, correct dimensions, and empty below the cut. */
    const { width, height, channels } = info;
    let lastOpaqueRow = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * channels + 3] > 8) {
          lastOpaqueRow = y;
          break;
        }
      }
    }

    expect(lastOpaqueRow, `${rel} is entirely transparent`).toBeGreaterThan(-1);

    const emptyBottom = height - 1 - lastOpaqueRow;
    expect(
      emptyBottom,
      `${rel} has ${emptyBottom}px of empty space below its artwork ` +
        `(${Math.round((emptyBottom / height) * 100)}% of the icon). It is clipped. ` +
        `Regenerate with: CHROMIUM_PATH=/opt/pw-browsers/chromium node scripts/generate-icons.js`
    ).toBeLessThanOrEqual(2);
  });

  it('regenerates from logo.svg rather than from a machine-specific tool', () => {
    // The generator is the other half of this. If it goes back to a rasteriser
    // that only works on some machines, the icons drift again and this suite
    // only catches it after someone has committed the drift.
    const src = require('node:fs').readFileSync(
      join(process.cwd(), 'scripts/generate-icons.js'),
      'utf8'
    );
    expect(src, 'the icon generator must read logo.svg').toContain('logo.svg');
    expect(
      src.includes('playwright') || src.includes('chromium'),
      'the generator should rasterize with Chromium, which is already a dependency ' +
        'and works in CI — sharp cannot rasterize SVG in this environment'
    ).toBe(true);
  });
});
