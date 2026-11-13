import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import sharp from 'sharp';

/**
 * A PWA manifest must not advertise artwork as actual application screenshots.
 * The old manifest linked /og.png (1200 x 630) for all three entries, falsely
 * claiming the same file was 390 x 844 and 1366 x 768, and labelled it
 * "Mobile experience" / "Desktop experience". Browser install UIs can reject
 * invalid screenshot dimensions and users should see real app captures.
 */
describe('PWA manifest screenshots', () => {
  it('does not contain nonexistent or inaccurate screenshots', async () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), 'public/manifest.json'), 'utf8')) as {
      screenshots?: { src: string; sizes: string; type: string; form_factor?: string }[];
    };
    for (const shot of manifest.screenshots ?? []) {
      const path = join(process.cwd(), 'public', shot.src.replace(/^\//, ''));
      const meta = await sharp(path).metadata();
      expect(shot.sizes, `wrong declared dimensions: ${shot.src}`).toBe(`${meta.width}x${meta.height}`);
      const expectedMime: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };
      expect(shot.type, `wrong declared MIME type: ${shot.src}`).toBe(expectedMime[extname(shot.src).toLowerCase()]);
      if (shot.form_factor === 'narrow') {
        expect(meta.height, 'narrow install screenshot must be portrait').toBeGreaterThan(meta.width!);
      }
      if (shot.form_factor === 'wide') {
        expect(meta.width, 'wide install screenshot must be landscape').toBeGreaterThan(meta.height!);
      }
      expect(shot.src, 'the sharing banner is not a product screenshot').not.toBe('/og.png');
    }
  });
});
