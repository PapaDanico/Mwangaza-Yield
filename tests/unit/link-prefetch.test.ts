import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pages must link through src/components/shared/Link.tsx, which prefetches on
 * intent rather than on sight. A direct next/link import quietly brings back
 * viewport prefetch: on the landing page that was ~11 routes and ~340 KB of
 * compressed code downloaded for pages the reader never opened (27 Nov 2026).
 */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
  });

describe('links prefetch on intent', () => {
  it('nothing but the wrapper imports next/link', () => {
    const offenders = files('src').filter(
      (f) => !f.endsWith(join('shared', 'Link.tsx')) && /from ['"]next\/link['"]/.test(readFileSync(f, 'utf8'))
    );
    expect(offenders).toEqual([]);
  });

  it('the wrapper turns viewport prefetch off by default and warms on intent', () => {
    const src = readFileSync('src/components/shared/Link.tsx', 'utf8');
    expect(src).toMatch(/prefetch=\{prefetch \?\? false\}/);
    for (const ev of ['onMouseEnter', 'onTouchStart', 'onFocus']) expect(src).toContain(ev);
    expect(src).toContain('router.prefetch(');
  });
});
