import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A page has exactly one h1.
 *
 * /yield-curve/ and /feed/ each rendered two: their second block reused the
 * Prose shell, which always draws an h1. Found by driving every route in a
 * browser and counting headings, which is the only place it shows — the markup
 * reads naturally and renders fine.
 *
 * Prose draws an h1 unless told `level={2}`, so a page that uses Prose more
 * than once must pass level={2} on all but one of them.
 */
const APP = new URL('../../src/app/', import.meta.url).pathname;

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return pages(p);
    return f === 'page.tsx' ? [p] : [];
  });
}

describe('one h1 per page', () => {
  it('no page uses the Prose shell for more than one h1', () => {
    const offenders = pages(APP).filter((p) => {
      const src = readFileSync(p, 'utf8');
      const opens = [...src.matchAll(/<Prose\b[^>]*>/g)].map((m) => m[0]);
      const h1s = opens.filter((tag) => !/level=\{2\}/.test(tag)).length;
      return h1s > 1;
    });
    expect(
      offenders.map((p) => p.slice(APP.length)),
      'these draw more than one h1 — pass level={2} on the further sections'
    ).toEqual([]);
  });
});
