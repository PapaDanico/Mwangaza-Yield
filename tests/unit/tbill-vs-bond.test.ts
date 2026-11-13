import { describe, expect, it } from 'vitest';
import type { Bond } from '../../src/types/bond';
import { billRateSensitivity, breakEvenBillRate, compareBillWithBond } from '../../src/lib/tbill-vs-bond';
import { computeTBill } from '../../src/lib/tbills';

const SETTLE = new Date('2026-11-16T00:00:00Z');

// Issue date on the engine's 182-day grid, so coupon dates are the ones it
// really produces for a Kenyan bond.
function mk(code: string, maturity: string, over: Partial<Bond> = {}): Bond {
  const issue = new Date(new Date(maturity).getTime() - 40 * 182 * 86_400_000).toISOString().slice(0, 10);
  return {
    isin: `KE-${code}`, issueCode: code, name: code, category: 'FXD',
    issueDate: issue, maturityDate: maturity, tenorYears: 10, couponRate: 12,
    couponFrequencyPerYear: 2, ytmGross: 12, minInvestmentKES: 50000, taxExempt: false,
    source: 'https://www.centralbank.go.ke/', ...over,
  } as Bond;
}

const FIVE_YEAR = mk('FIVE', '2031-11-10');
const input = { bond: FIVE_YEAR, cleanPrice: 100, faceValueKES: 1_000_000, settlement: SETTLE };

describe('compareBillWithBond', () => {
  it('compares the same money over the same years on both sides', () => {
    const c = compareBillWithBond({ ...input, billRatePct: 8.75 })!;
    expect(c).not.toBeNull();
    expect(c.years).toBeCloseTo(4.98, 1);
    // Both end values are what the same cost has grown to by the bond's maturity.
    expect(c.bond.finalValueKES).toBeGreaterThan(c.costKES);
    expect(c.bills.finalValueKES).toBeGreaterThan(c.costKES);
    // The contract pays more than it costs and the principal is untaxed.
    expect(c.bond.contractualNetCashKES).toBeGreaterThan(input.faceValueKES);
  });

  it('at a low assumed short rate the bond wins; at a high one the bills do', () => {
    expect(compareBillWithBond({ ...input, billRatePct: 6 })!.winner).toBe('bond');
    expect(compareBillWithBond({ ...input, billRatePct: 20 })!.winner).toBe('bills');
  });

  it('the bond advantage falls monotonically as the assumed short rate rises', () => {
    const rows = billRateSensitivity(input, [4, 6, 8, 10, 12, 14, 16]);
    for (let i = 1; i < rows.length; i++) expect(rows[i].advantagePp).toBeLessThan(rows[i - 1].advantagePp);
  });

  it('returns null, not a confident number, for a matured bond, a bad price or a zero rate', () => {
    expect(compareBillWithBond({ ...input, bond: mk('OLD', '2026-06-15'), billRatePct: 8.75 })).toBeNull();
    expect(compareBillWithBond({ ...input, cleanPrice: 0, billRatePct: 8.75 })).toBeNull();
    expect(compareBillWithBond({ ...input, billRatePct: 0 })).toBeNull();
    expect(compareBillWithBond({ ...input, faceValueKES: 0, billRatePct: 8.75 })).toBeNull();
  });
});

describe('breakEvenBillRate', () => {
  it('is the rate at which the two yields are equal, and the winner flips across it', () => {
    const r = breakEvenBillRate(input)!;
    expect(r).not.toBeNull();
    const at = compareBillWithBond({ ...input, billRatePct: r })!;
    expect(Math.abs(at.advantagePp)).toBeLessThan(1e-4);
    expect(at.bond.realisedYieldPct).toBeCloseTo(at.bills.netYieldPct, 3);
    expect(compareBillWithBond({ ...input, billRatePct: r - 1 })!.winner).toBe('bond');
    expect(compareBillWithBond({ ...input, billRatePct: r + 1 })!.winner).toBe('bills');
  });

  it('reconciles independently: at break-even the bills yield equals the bond\'s own effective net yield', () => {
    // If coupons earn exactly the bond's own yield, the bond realises exactly
    // that yield, so the short rate that ties the two must itself produce it.
    // Net YTM is a semi-annual nominal rate; its effective annual form is
    // (1 + y/2)^2 - 1. A tolerance of 10bp covers the engine's 182-day period.
    const r = breakEvenBillRate(input)!;
    const c = compareBillWithBond({ ...input, billRatePct: r })!;
    const effectiveNetYTM = (Math.pow(1 + c.bond.netYTMPct / 200, 2) - 1) * 100;
    expect(c.bills.netYieldPct).toBeGreaterThan(effectiveNetYTM - 0.1);
    expect(c.bills.netYieldPct).toBeLessThan(effectiveNetYTM + 0.1);
    // And the bill rate that gives that net yield is what the function returned.
    expect(computeTBill(100, r, 91).netEAY).toBeCloseTo(c.bills.netYieldPct, 6);
  });

  it('a tax-exempt bond has a higher break-even than the same bond taxed', () => {
    const taxed = breakEvenBillRate(input)!;
    const ifb = breakEvenBillRate({ ...input, bond: mk('IFB', '2031-11-10', { taxExempt: true, category: 'IFB' }) })!;
    expect(ifb).toBeGreaterThan(taxed);
  });

  it('a bond bought at a premium needs a lower short rate to be beaten than one at par', () => {
    const par = breakEvenBillRate(input)!;
    const premium = breakEvenBillRate({ ...input, cleanPrice: 108 })!;
    expect(premium).toBeLessThan(par);
  });

  it('is null when there is no crossing in a plausible range', () => {
    // A ceiling below the break-even leaves the bond ahead everywhere searched.
    expect(breakEvenBillRate(input, 0.5, 3)).toBeNull();
  });
});
