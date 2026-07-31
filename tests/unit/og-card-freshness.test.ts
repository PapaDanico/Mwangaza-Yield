import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * The OG card must be rebuilt when the mark changes.
 *
 * scripts/build-og.mjs inlines public/logo.svg so the card cannot drift from
 * the mark — that was the argument for writing it as a script instead of
 * saving a screenshot. But the script is not run by `next build`, not run by
 * CI, and not run by Netlify: it is a command somebody has to remember. So the
 * drift it was meant to prevent was still fully available, and it would land
 * on the artefact least likely to be re-checked, because nobody opens the OG
 * card — WhatsApp does, every time a link is posted to the channel.
 *
 * This is the same defect as the service worker's VERSION, found one commit
 * after fixing that one: an asset derived from another asset, with the
 * derivation left to memory. The remedy is the same, and deliberately so —
 * record the source's digest next to the derived file, and fail when they
 * disagree.
 *
 * Regenerate with:  npm run build && npm run build:og
 */
const ROOT = new URL('../../', import.meta.url).pathname;

/** Digest of the mark that public/og.png was last rendered from. */
const OG_BUILT_FROM_LOGO = '5f0d27d518293817';

const logoDigest = (): string =>
  createHash('sha256').update(readFileSync(`${ROOT}public/logo.svg`)).digest('hex').slice(0, 16);

describe('the OG card is rebuilt when the mark changes', () => {
  it('has both files present, so the check is not vacuous', () => {
    expect(existsSync(`${ROOT}public/logo.svg`)).toBe(true);
    expect(existsSync(`${ROOT}public/og.png`)).toBe(true);
    // A zero-byte card would satisfy a digest check that only looked at the
    // source, so assert the output is a real image too.
    expect(statSync(`${ROOT}public/og.png`).size).toBeGreaterThan(5_000);
  });

  it('is a 1200x630 PNG, which is what the crawlers expect', () => {
    const buf = readFileSync(`${ROOT}public/og.png`);
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    // IHDR width/height live at bytes 16..24 of a PNG.
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
  });

  it('was rendered from the mark currently in the repository', () => {
    expect(
      logoDigest(),
      [
        'public/logo.svg changed but public/og.png was not rebuilt from it.',
        'The card is what WhatsApp shows for every shared link, so a stale one',
        'is the most-seen wrong thing we can ship.',
        'Fix: npm run build && npm run build:og, then update OG_BUILT_FROM_LOGO here.',
      ].join(' ')
    ).toBe(OG_BUILT_FROM_LOGO);
  });

  it('keeps the generator wired to a named command', () => {
    /* The original failure was not a missing script, it was a script nothing
     * referenced. If the npm script disappears, the instruction in the message
     * above stops working and this decays into folklore. */
    const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8'));
    expect(pkg.scripts['build:og'], 'package.json lost the build:og script').toContain(
      'scripts/build-og.mjs'
    );
  });
});
