import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { inputCls, labelCls } from '../../src/lib/field-styles';

/** Every .tsx under src/, so a new page cannot opt out by being new. */
function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...tsxFiles(path));
    else if (entry.endsWith('.tsx')) out.push(path);
  }
  return out;
}

const SRC = join(process.cwd(), 'src');

describe('form control styling', () => {
  it('sets a 44px floor on the shared control class', () => {
    // 2.75rem. Below this a thumb misses, and the miss is silent: nothing
    // happens, so the reader taps again rather than reporting anything.
    expect(inputCls, 'inputCls must keep its 44px minimum height').toContain('min-h-11');
    expect(labelCls).toContain('block');
  });

  it('is declared once, not per page', () => {
    // This test exists because it was declared six times, and five of those
    // copies were 40-42px tall. The one correct copy — /prices, with
    // min-h-11 — could not spread, because a local const has nowhere to
    // spread to. A seventh fork would silently reintroduce the same bug,
    // so re-declaring the name anywhere under src/ fails here instead.
    const offenders = tsxFiles(SRC).filter((f) =>
      /\b(const|let)\s+inputCls\s*=/.test(readFileSync(f, 'utf8'))
    );
    expect(
      offenders,
      `these files re-declare inputCls locally instead of importing it from ` +
        `@/lib/field-styles — that is exactly how five pages ended up below 44px`
    ).toEqual([]);
  });

  it('allows 24px or 44px floors and nothing in between', () => {
    // Written after a narrower version of this test passed while /ladder
    // still served 36px selects: guarding the one file I had just fixed
    // caught nothing, because the bug was a class of bug, not a place.
    //
    // Two floors are legitimate. `min-h-6` is 24px — WCAG 2.5.8 AA, and the
    // two places using it are standalone links that say so in a comment.
    // `min-h-11` is 44px, the target size, and 37 call sites already use it.
    // Between them is the band nobody chooses on purpose: big enough to look
    // like a button, small enough to miss.
    const offenders: string[] = [];
    for (const file of tsxFiles(SRC)) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bmin-[hw]-(\d+)\b/g)) {
        const step = Number(m[1]);
        if (step > 6 && step < 11) offenders.push(`${file.slice(SRC.length + 1)}: ${m[0]}`);
      }
    }
    expect(
      offenders,
      'these sit between the 24px inline-link floor and the 44px target floor — ' +
        'raise them to min-h-11, or drop to min-h-6 and say in a comment why the ' +
        'control is an inline link rather than a target'
    ).toEqual([]);
  });

  it('leaves no interactive control in the shared chrome under 44px', () => {
    // The footer nav links were 16px tall on a 32px pitch. They are laid out
    // by class string, so the only thing available to assert against here is
    // the class string — a real geometric check needs the browser suite, and
    // that is where it lives. This guards the specific regression: someone
    // trimming the padding back to make the footer shorter.
    const footer = readFileSync(join(SRC, 'components/shared/Footer.tsx'), 'utf8');
    const navLink = footer.match(/className="block py-(\d+(?:\.\d+)?) text-sm text-sand/);
    expect(navLink, 'footer nav links must stay block-level with vertical padding').not.toBeNull();
    // py-3 is 12px top and bottom on a 20px line box: 44px exactly.
    expect(Number(navLink![1])).toBeGreaterThanOrEqual(3);
  });
});
