import { describe, expect, it } from 'vitest';
import { bidPayoff, describePayoff } from '../../src/lib/bid-payoff';

const base = { lowPct: 13.1, medianPct: 13.8, highPct: 14.6, whtRate: 0.1, bestBillNetPct: 7.67 };

describe('bidPayoff', () => {
  it('takes withholding tax off each end of the range and compares with the best bill', () => {
    const p = bidPayoff(base)!;
    expect(p.netLow).toBeCloseTo(11.79, 2);
    expect(p.netMedian).toBeCloseTo(12.42, 2);
    expect(p.netHigh).toBeCloseTo(13.14, 2);
    expect(p.edgeLow).toBeCloseTo(11.79 - 7.67, 2);
    expect(p.verdict).toBe('leads');
  });

  it('an infrastructure bond keeps its whole yield', () => {
    expect(bidPayoff({ ...base, whtRate: 0 })!.netMedian).toBeCloseTo(13.8, 6);
  });

  it('is "mixed" when only the top of the range beats the bill, and "trails" when none does', () => {
    expect(bidPayoff({ ...base, lowPct: 7, medianPct: 8, highPct: 9.5, whtRate: 0.15, bestBillNetPct: 7.5 })!.verdict).toBe('mixed');
    expect(bidPayoff({ ...base, lowPct: 7, medianPct: 7.5, highPct: 8, whtRate: 0.15, bestBillNetPct: 8 })!.verdict).toBe('trails');
  });

  it('refuses nonsense instead of inventing a comparison', () => {
    expect(bidPayoff({ ...base, bestBillNetPct: NaN })).toBeNull();
    expect(bidPayoff({ ...base, lowPct: 15, highPct: 12 })).toBeNull();
    expect(bidPayoff({ ...base, whtRate: 1 })).toBeNull();
  });
});

describe('describePayoff', () => {
  it('says what each verdict means, in points not percent', () => {
    const lead = describePayoff(bidPayoff(base)!, 0.1, 7.67);
    expect(lead).toMatch(/even at the bottom it beats/);
    expect(lead).toMatch(/after 10% tax/);
    expect(lead).not.toMatch(/\d%\s+(more|less)/);
    const trail = describePayoff(
      bidPayoff({ ...base, lowPct: 7, medianPct: 7.5, highPct: 8, whtRate: 0.15, bestBillNetPct: 8 })!, 0.15, 8);
    expect(trail).toMatch(/T-bill pays more here, with no price risk/);
    const ifb = describePayoff(bidPayoff({ ...base, whtRate: 0 })!, 0, 7.67);
    expect(ifb).toMatch(/with no withholding tax/);
  });
});
