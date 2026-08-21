import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

/**
 * A precached asset must not change without the cache version changing.
 *
 * The service worker precaches APP_SHELL under VERSION and only evicts the old
 * cache when VERSION moves. So replacing a precached file while leaving VERSION
 * alone ships the new file to first-time visitors and NEVER to anyone who
 * already has the app — their service worker keeps answering from the stale
 * cache, indefinitely, with nothing anywhere reporting a problem.
 *
 * That is not hypothetical. The brand mark was replaced in #127, sw.js was not
 * touched, VERSION stayed at v11, and the deploy was clean and green on every
 * check we had. Returning visitors kept seeing the old logo. It was caught by a
 * person looking at the live site and saying it looked unchanged — the slowest
 * and least reliable detector available, and the only one we had.
 *
 * The version and a digest of the precached bytes are recorded together below.
 * Change an asset and the digest moves; this then fails until VERSION is bumped
 * and the digest re-recorded — the deliberate two-step the situation deserves.
 */
const SW = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');

/* Recorded pair. Update BOTH, in the same commit, or not at all. */
const SHIPPED_VERSION = 'mwangaza-v16';
const SHIPPED_DIGEST = 'd08ade434d03a804';

/** The version string the service worker opens its cache under. */
function swVersion(): string {
  const m = SW.match(/const VERSION = '([^']+)'/);
  if (!m) throw new Error('VERSION not found in sw.js — has the declaration been renamed?');
  return m[1];
}

/** APP_SHELL entries that are files on disk. Routes end in '/', assets have an extension. */
function precachedFiles(): string[] {
  const m = SW.match(/const APP_SHELL = \[([^\]]*)\]/);
  if (!m) throw new Error('APP_SHELL not found in sw.js — has the declaration been renamed?');
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter((p) => /\.[a-z0-9]+$/i.test(p));
}

function shellDigest(): string {
  const h = createHash('sha256');
  for (const p of precachedFiles()) {
    h.update(p);
    h.update(readFileSync(new URL(`../../public${p}`, import.meta.url)));
  }
  return h.digest('hex').slice(0, 16);
}

describe('service worker cache version tracks its precached assets', () => {
  it('finds real files to hash, so the digest is not taken over an empty set', () => {
    /* A digest of nothing is perfectly stable and would pass every future
     * change — the failure mode that makes a guard worse than no guard. */
    const files = precachedFiles();
    expect(files.length, 'no precached asset paths parsed out of APP_SHELL').toBeGreaterThan(1);
    for (const p of files) {
      expect(
        existsSync(new URL(`../../public${p}`, import.meta.url)),
        `${p} is precached by the service worker but does not exist in public/`
      ).toBe(true);
    }
  });

  it('records the same version the worker will actually use', () => {
    expect(
      swVersion(),
      'sw.js VERSION moved without this file being updated — set SHIPPED_VERSION and SHIPPED_DIGEST together'
    ).toBe(SHIPPED_VERSION);
  });

  it('has not changed a precached asset while leaving the version alone', () => {
    expect(
      shellDigest(),
      [
        'A file precached by the service worker changed, but VERSION did not.',
        'Returning visitors would keep the OLD file indefinitely — the new one',
        'reaches first-time visitors only, and no check reports the difference.',
        'Fix: bump VERSION in public/sw.js, then update SHIPPED_VERSION and',
        'SHIPPED_DIGEST here to match.',
      ].join(' ')
    ).toBe(SHIPPED_DIGEST);
  });
});
