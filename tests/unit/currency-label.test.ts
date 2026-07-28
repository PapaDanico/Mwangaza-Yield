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

  /**
   * This assertion was already here, already passing — and the reader was
   * still being shown "KES".
   *
   * formatKES used `style: 'currency'` with `currency: 'KES'` and trusted Intl
   * to render the label. Under Node's ICU, en-KE/KES gives "Ksh", so this test
   * went green on every CI run this repository has ever done. On the Android
   * browser the exported PDFs were generated in, the SAME code rendered "KES
   * 3,136,262".
   *
   * The output was locale-DATA dependent, which is the one thing a test
   * running on one runtime cannot see. The comment that used to sit here said
   * "whatever Intl gives for en-KE/KES is the house style" and treated that as
   * a safety feature — it was the defect. A house style delegated to ICU is a
   * house style that changes per device.
   *
   * formatKES now writes the prefix itself, so there is exactly one answer on
   * every platform, and this assertion means what it always claimed to.
   */
  it('formatKES renders Ksh on every runtime, not whatever ICU decides', () => {
    expect(formatKES(1_200_000)).toContain('Ksh');
    expect(formatKES(1_200_000)).not.toContain('KES');
    // Exact, not a substring: a prefix assembled by hand has to be pinned.
    expect(formatKES(3_136_262)).toBe('Ksh 3,136,262');
    expect(formatKES(1234.567, 2)).toBe('Ksh 1,234.57');
    expect(formatKES(0)).toBe('Ksh 0');
    expect(formatCompactKES(2.5e9)).toBe('Ksh 2.5B');
    expect(formatCompactKES(1.2e6)).toBe('Ksh 1.2M');
  });

  /**
   * The sign goes outside the unit.
   *
   * "Ksh -500" reads as a quantity of some negative currency. Intl's currency
   * mode placed the minus correctly for free; hand-rolling the prefix is
   * exactly where that gets dropped, so it is pinned rather than assumed.
   */
  it('puts the minus before the unit', () => {
    expect(formatKES(-500)).toBe('-Ksh 500');
    expect(formatKES(-1_234_567)).toBe('-Ksh 1,234,567');
  });

  it('does not print NaN or Infinity at a reader', () => {
    expect(formatKES(NaN)).toBe('Ksh 0');
    expect(formatKES(Infinity)).toBe('Ksh 0');
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
        // Legitimate uses are REMOVED, not used to excuse the whole line.
        //
        // Skipping the line was the original form, and in the sister product
        // it kept five labels invisible for weeks: every offender there read
        // `KES {x.toLocaleString("en-KE")}`, so the locale on the right pardoned
        // the label on the left. An exemption that clears a line cannot see a
        // violation standing beside a legal use — which is where violations
        // live, because nobody writes a currency label on an empty line.
        const stripped = line
          .replace(/\/\/.*$/, '')
          .replace(/\b\w*currency:\s*'KES'/gi, '')
          .replace(/FX_USD_KES|USD\/KES|'en-KE'/g, '');
        // `KES ${x}` and `KES {x}` as well as `KES 1,234`. The first pass of
        // this test only looked for a literal digit and therefore missed every
        // interesting case: formatCompactKES, EvidenceStrip's own `kes()`
        // helper, and four interpolated strings. A currency label followed by
        // a computed amount is exactly where the drift lives.
        if (/\bKES (\d|\$?\{)/.test(stripped) || /\(KES\)/.test(stripped)) {
          offenders.push(`${file.replace(SRC, 'src')}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
    }
    expect(offenders, `write these as "Ksh", the same as formatKES:\n${offenders.join('\n')}`)
      .toEqual([]);
  });

  /**
   * An unknown amount must not print as a confident zero.
   *
   * Math.round(null) is 0, so an absent figure rendered as "Ksh 0" — a claim
   * that nothing was on offer, in the same style as a real number, and
   * invisible to the browser suite's NaN sweep because zero is not NaN.
   *
   * It stops being hypothetical the moment the auction calendar is read from
   * prospectuses: CBK's current documents state no amount at all, so every
   * auction on the page would have advertised Ksh 0.
   */
  it('shows an absent amount as absent, not as zero', () => {
    for (const v of [null, undefined, NaN, Infinity]) {
      expect(
        formatCompactKES(v as number),
        `formatCompactKES(${String(v)}) printed a figure for a value there isn't one for`
      ).toBe('—');
    }
    // A real zero is still a real zero — someone offering nothing is a fact,
    // and this must not swallow it.
    expect(formatCompactKES(0)).toMatch(/0$/);
  });
});
