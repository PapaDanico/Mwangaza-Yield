import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { formatKES } from '../../src/lib/financial-engine';
import { formatCompactKES } from '../../src/lib/utils';

/**
 * One currency label in front of the reader: Ksh.
 *
 * The goals result card used to read "KES 9.2M" as its headline and, in the
 * sentence directly beneath it, "to draw Ksh 1,200,000 a year". Both were
 * correct and they disagreed, because computed figures go through formatKES —
 * which renders Ksh — while prose had "KES" typed into it by hand, in 21 files.
 *
 * Nobody chose that. It is the same drift this codebase keeps finding: a
 * convention established in one place and restated by hand in another, where
 * nothing keeps the two in step. So the rule is enforced against the formatter
 * rather than against a string I picked, and the prose is checked to match it.
 */

const SRC = new URL('../../src', import.meta.url).pathname;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(full) ? [full] : [];
  });
}

describe('currency labels', () => {
  /**
   * The one that actually mattered, and that the file scan below could not see.
   *
   * The headline "KES 9.2M" was not prose — formatCompactKES hard-coded its own
   * prefix and disagreed with formatKES on the same card. A grep for `KES \d`
   * never matched it, because what follows the space in the source is a
   * template expression. Comparing the formatters' OUTPUT catches what reading
   * their source does not.
   */
  it('both formatters use the same currency label', () => {
    for (const v of [0, 1_234, 999_999, 1_200_000, 9_200_000, 2_500_000_000]) {
      const prefix = (s: string) => s.replace(/[\d.,\s]+.*$/, '');
      expect(prefix(formatCompactKES(v)), `formatCompactKES(${v}) disagrees with formatKES`)
        .toBe(prefix(formatKES(v)));
    }
    expect(formatCompactKES(9_200_000)).toContain('Ksh');
  });

  it('formatKES renders Ksh, which is what prose must match', () => {
    // Not hard-coded to "Ksh": whatever Intl gives for en-KE/KES is the house
    // style, and if a future runtime changes it this test says so rather than
    // letting the two drift apart again.
    expect(formatKES(1_200_000)).toContain('Ksh');
    expect(formatKES(1_200_000)).not.toContain('KES');
  });

  it('no user-facing prose writes an amount as "KES 1,234"', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        // The ISO code is a legitimate API argument, and USD/KES is the market
        // convention for the currency PAIR — neither is a money amount.
        // A comment is not prose the reader sees — and this file's own note
        // about the bug quotes "KES 9.2M", which the first version of this
        // test dutifully reported as a defect.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        if (/currency:\s*'KES'|FX_USD_KES|USD\/KES|'en-KE'/.test(line)) return;
        // `KES ${x}` and `KES {x}` as well as `KES 1,234`. The first pass of
        // this test only looked for a literal digit and therefore missed every
        // interesting case: formatCompactKES, EvidenceStrip's own `kes()`
        // helper, and four interpolated strings. A currency label followed by
        // a computed amount is exactly where the drift lives.
        if (/\bKES (\d|\$?\{)/.test(line) || /\(KES\)/.test(line)) {
          offenders.push(`${file.replace(SRC, 'src')}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
    }
    expect(offenders, `write these as "Ksh", the same as formatKES:\n${offenders.join('\n')}`)
      .toEqual([]);
  });
});
