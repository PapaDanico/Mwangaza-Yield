import { describe, it, expect } from 'vitest';
import { plural } from '../../src/lib/utils';

/**
 * A near-matured bond has one coupon left, and the sell evaluator told its
 * reader the proceeds were "spread over 1 payments". Small, but this page asks
 * somebody to trust it with a six-figure decision, and the credibility of a
 * number is not separable from the care around it.
 */
describe('plural', () => {
  it('singular only at exactly one', () => {
    expect(plural(1, 'payment')).toBe('payment');
    expect(plural(0, 'payment')).toBe('payments');
    expect(plural(2, 'payment')).toBe('payments');
  });

  it('takes an explicit form for irregular words', () => {
    expect(plural(1, 'this', 'these')).toBe('this');
    expect(plural(3, 'this', 'these')).toBe('these');
  });
});
