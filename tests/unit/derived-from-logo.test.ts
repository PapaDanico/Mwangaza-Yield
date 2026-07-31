import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * Everything rendered FROM public/logo.svg must be re-rendered when it changes.
 *
 * Five files are derived from the mark — the OG card and four app icons — and
 * every one of them was, until now, kept in step by somebody remembering to
 * run a script. That is the third instance of one defect in a single day:
 *
 *   1. sw.js precached logo.svg under a VERSION nobody bumped, so returning
 *      visitors kept the old mark indefinitely. Found by a human looking at
 *      the site, because nothing automated could see it.
 *   2. build-og.mjs inlined logo.svg specifically to prevent drift, and was
 *      referenced by no npm script, no CI step and no test.
 *   3. generate-icons.js — same shape, same gap. The icons here.
 *
 * The pattern is an asset derived from another asset with the derivation left
 * to memory, and it fails the same way every time: nothing errors, nothing
 * goes red, the wrong image is simply served. So the source digest is recorded
 * once and every derivative is checked against it.
 *
 * Regenerate with:  npm run build && npm run build:og && npm run build:icons
 */
const ROOT = new URL('../../', import.meta.url).pathname;

/** Digest of the mark every derived asset below was last rendered from. */
const RENDERED_FROM_LOGO = '5f0d27d518293817';

/** Rendered from logo.svg, with the minimum plausible size for each. */
const DERIVED: { path: string; minBytes: number }[] = [
  { path: 'public/og.png', minBytes: 5_000 },
  { path: 'public/icons/icon-192.png', minBytes: 800 },
  { path: 'public/icons/icon-512.png', minBytes: 2_000 },
  { path: 'public/icons/maskable-512.png', minBytes: 2_000 },
  { path: 'public/apple-touch-icon.png', minBytes: 800 },
];

const logoDigest = (): string =>
  createHash('sha256').update(readFileSync(`${ROOT}public/logo.svg`)).digest('hex').slice(0, 16);

describe('assets derived from the mark stay in step with it', () => {
  it('every derived file exists and is a real image', () => {
    /* A digest check on the SOURCE alone would pass with a zero-byte or
     * truncated output, so each output is checked for itself too. */
    for (const { path, minBytes } of DERIVED) {
      expect(existsSync(`${ROOT}${path}`), `${path} is missing`).toBe(true);
      expect(statSync(`${ROOT}${path}`).size, `${path} is implausibly small`).toBeGreaterThan(
        minBytes
      );
      expect(readFileSync(`${ROOT}${path}`).subarray(1, 4).toString(), `${path} is not a PNG`).toBe(
        'PNG'
      );
    }
  });

  it('serves the OG card at the size crawlers expect', () => {
    const buf = readFileSync(`${ROOT}public/og.png`);
    expect(buf.readUInt32BE(16)).toBe(1200);
    expect(buf.readUInt32BE(20)).toBe(630);
  });

  it('renders each icon at the size its filename claims', () => {
    // A 192 named icon-512 would be silently upscaled by the browser.
    for (const [file, size] of [
      ['public/icons/icon-192.png', 192],
      ['public/icons/icon-512.png', 512],
      ['public/icons/maskable-512.png', 512],
      ['public/apple-touch-icon.png', 180],
    ] as const) {
      const buf = readFileSync(`${ROOT}${file}`);
      expect(buf.readUInt32BE(16), `${file} width`).toBe(size);
      expect(buf.readUInt32BE(20), `${file} height`).toBe(size);
    }
  });

  it('was rendered from the mark currently in the repository', () => {
    expect(
      logoDigest(),
      [
        'public/logo.svg changed but its derived assets were not re-rendered.',
        'This fails silently — the wrong image is simply served, on the OG card',
        'WhatsApp shows for every shared link and on every installed icon.',
        'Fix: npm run build && npm run build:og && npm run build:icons,',
        'then update RENDERED_FROM_LOGO here.',
      ].join(' ')
    ).toBe(RENDERED_FROM_LOGO);
  });

  it('keeps both generators wired to named commands', () => {
    /* The original failure was never a missing script — it was a script
     * nothing referenced. If these entries go, the instruction in the message
     * above stops being runnable and this decays into folklore. */
    const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8'));
    expect(pkg.scripts['build:og']).toContain('scripts/build-og.mjs');
    expect(pkg.scripts['build:icons']).toContain('scripts/generate-icons.js');
  });

  it('keeps exactly one OG generator', () => {
    /* scripts/generate-og.js sat beside build-og.mjs carrying its own
     * hand-drawn copy of the mark, still in the pre-#127 gradient palette.
     * Running it would have overwritten the current card with superseded
     * branding. Two generators are worse than either alone, because the wrong
     * one looks exactly as authoritative as the right one. */
    const generators = readdirSync(`${ROOT}scripts`).filter((f) => /og/i.test(f));
    expect(generators, 'more than one OG generator in scripts/').toEqual(['build-og.mjs']);
  });
});
