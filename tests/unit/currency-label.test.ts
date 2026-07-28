import { describe, it, expect } from 'vitest';
import { formatKES } from '../../src/lib/financial-engine';
import { formatCompactKES } from '../../src/lib/utils';

/**
 * One currency, one spelling, across both products.
 *
 * `style: 'currency'` with `currency: 'KES'` renders the ISO 4217 code, so
 * every report, stat card and exported PDF said "KES 3,136,262" while the
 * sister product said "Ksh". A reader holding a JiPange fee plan beside a
 * Mwangaza ladder plan was shown two names for one currency.
 *
 * This is the shape of an incomplete rename: the literal strings a search
 * finds get changed, and the function that generates everything else quietly
 * keeps its own answer.
 */
describe('money is written Ksh', () => {
  it('never emits the ISO code', () => {
    for (const v of [0, 1, 999, 1_000, 3_136_262, -500, 1e9]) {
      expect(formatKES(v), `formatKES(${v})`).not.toContain('KES');
      expect(formatKES(v), `formatKES(${v})`).toContain('Ksh');
    }
    for (const v of [0, 999, 1_500_000, 2.5e9]) {
      expect(formatCompactKES(v), `formatCompactKES(${v})`).not.toContain('KES');
      expect(formatCompactKES(v), `formatCompactKES(${v})`).toContain('Ksh');
    }
  });

  it('groups thousands and honours the decimal argument', () => {
    expect(formatKES(3_136_262)).toBe('Ksh 3,136,262');
    expect(formatKES(1234.567, 2)).toBe('Ksh 1,234.57');
    expect(formatKES(0)).toBe('Ksh 0');
  });

  /**
   * The sign goes outside the unit.
   *
   * "Ksh -500" reads as a quantity of some negative currency. Intl's currency
   * mode placed the minus correctly and hand-rolling the prefix is exactly
   * where that gets lost, so it is asserted rather than assumed.
   */
  it('puts the minus before the unit, not after it', () => {
    expect(formatKES(-500)).toBe('-Ksh 500');
    expect(formatKES(-1_234_567)).toBe('-Ksh 1,234,567');
  });

  it('does not print NaN or Infinity at a reader', () => {
    expect(formatKES(NaN)).toBe('Ksh 0');
    expect(formatKES(Infinity)).toBe('Ksh 0');
    expect(formatCompactKES(NaN)).toBe('—');
    expect(formatCompactKES(null)).toBe('—');
  });

  it('keeps the compact suffixes', () => {
    expect(formatCompactKES(2.5e9)).toBe('Ksh 2.5B');
    expect(formatCompactKES(1.2e6)).toBe('Ksh 1.2M');
  });
});
