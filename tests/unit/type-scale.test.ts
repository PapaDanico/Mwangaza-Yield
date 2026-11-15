import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Type sizes come from the named scale (text-xs ... text-6xl), not from pixel
 * values typed into a class. On 15 Nov 2026, 37 of the 39 arbitrary sizes in
 * `src` were `text-[12px]`, which is exactly `text-xs`: the same size written
 * a second way, so a later change to the scale would have missed them. This
 * keeps a new one from appearing. Sizes in rem for a deliberate display size
 * (a hero figure) are still allowed; a pixel size is not.
 */
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('type scale', () => {
  it('has no pixel font sizes typed into a class', () => {
    const offenders = files('src').flatMap((f) =>
      readFileSync(f, 'utf8').split('\n').flatMap((line, i) => (/\btext-\[[0-9.]+px\]/.test(line) ? [`${f}:${i + 1}`] : [])),
    );
    expect(offenders, `use text-xs / text-sm / text-base or another named size: ${offenders.join(', ')}`).toEqual([]);
  });
});
