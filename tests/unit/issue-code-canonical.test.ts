import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliseCode } from '../../src/lib/auction-history';

/**
 * Two data files, two issue-code formats, zero rows in common.
 *
 * bonds.json wrote `FXD1/2008/20`. auction-results.json wrote `FXD1/2008/020`.
 * Both files were internally consistent, both looked right in isolation, and
 * the intersection of their issue codes was EMPTY — 58 bonds, 387 auction
 * records, not one shared key. Every join between them was silently returning
 * nothing.
 *
 * `normaliseCode` already existed and already padded to three digits, and
 * twenty-five call sites used it. The ones that did not — `alerts.ts` builds a
 * Map straight off `b.issueCode` to match a holding against a bond — were the
 * ones that broke, and they broke quietly, because a lookup that finds nothing
 * looks exactly like a user who holds nothing.
 *
 * Fixing the call sites would have been the smaller diff and the wrong one:
 * it leaves two formats in the data and relies on everyone remembering
 * forever. The data is canonical now, and this asserts it stays that way.
 *
 * Found only because CBK's own CSV exports use a third format, which forced a
 * comparison nobody had made. Neither file could have revealed it alone.
 */
const read = (p: string) =>
  JSON.parse(readFileSync(new URL(`../../public/data/${p}`, import.meta.url), 'utf8'));

describe('issue codes are canonical everywhere they are stored', () => {
  const bonds = read('bonds.json') as { issueCode: string }[];
  const prints = read('auction-results.json') as { issueCode?: string }[];

  it('has data to check, in both files', () => {
    // A format check over an empty list passes forever.
    expect(bonds.length).toBeGreaterThan(40);
    expect(prints.length).toBeGreaterThan(300);
  });

  it('stores every bond code in the form normaliseCode produces', () => {
    const wrong = bonds.filter((b) => b.issueCode !== normaliseCode(b.issueCode));
    expect(
      wrong.map((b) => b.issueCode),
      'bonds.json holds non-canonical issue codes; they will not join against the auction archive'
    ).toEqual([]);
  });

  it('stores every auction-result code in the same form', () => {
    const wrong = prints
      .filter((p) => p.issueCode)
      .filter((p) => p.issueCode !== normaliseCode(p.issueCode!));
    expect(wrong.map((p) => p.issueCode)).toEqual([]);
  });

  it('the two files actually share keys, which is the point', () => {
    /* The regression this exists to prevent, stated as the outcome rather than
     * the format. A future change could keep both files self-consistent, pass
     * the two checks above by normalising to something new, and still leave
     * them unable to join — so the join itself is asserted. */
    const a = new Set(bonds.map((b) => b.issueCode));
    const c = new Set(prints.map((p) => p.issueCode).filter(Boolean) as string[]);
    const shared = [...a].filter((x) => c.has(x));
    expect(
      shared.length,
      `only ${shared.length} of ${a.size} bonds appear in the auction archive by key`
    ).toBeGreaterThan(a.size * 0.8);
  });

  it('pads the whole-year part and leaves fractional tenors alone', () => {
    // Rounding a 6.5-year bond into a 6-year one would merge two instruments.
    expect(normaliseCode('FXD1/2016/10')).toBe('FXD1/2016/010');
    expect(normaliseCode('IFB1/2024/8.5')).toBe('IFB1/2024/008.5');
    expect(normaliseCode('FXD 1/2016/10')).toBe('FXD1/2016/010');
    expect(normaliseCode('fxd1/2016/010')).toBe('FXD1/2016/010');
  });
});
