import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { computeBondInvestment } from '../../src/lib/financial-engine';
import type { Bond } from '../../src/types/bond';

/**
 * Coupon dates run in 182-day steps from issue and the last one is the maturity
 * date, so a bond whose maturity is not a whole number of 182-day periods after
 * issue ends in a stub that the engine pays as a FULL coupon. Reproduced on
 * 15 Nov 2026 with a synthetic bond (12.5% coupon, 4.5 months left, at par):
 * the engine returned a 25.2% gross yield. Every real bond is aligned today
 * (59 of 59 within 3 days), so this is a guard on future hand entry, where one
 * mistyped date would otherwise produce an absurd yield with no error.
 */
const ALIGNMENT_TOLERANCE_DAYS = 3;
const DAY = 86_400_000;

function misalignment(issue: string, maturity: string): number {
  const days = Math.round((new Date(maturity).getTime() - new Date(issue).getTime()) / DAY);
  return days - Math.round(days / 182) * 182;
}

describe('coupon schedule alignment', () => {
  const raw = JSON.parse(readFileSync('public/data/bonds.json', 'utf8'));
  const bonds: Bond[] = Array.isArray(raw) ? raw : raw.bonds;

  it('every bond in the data matures a whole number of 182-day periods after issue', () => {
    const off = bonds
      .map((b) => ({ code: b.issueCode, off: misalignment(b.issueDate, b.maturityDate) }))
      .filter((x) => Math.abs(x.off) > ALIGNMENT_TOLERANCE_DAYS);
    expect(off, `check the issue and maturity dates of: ${off.map((x) => `${x.code} (${x.off} days)`).join(', ')}`).toEqual([]);
  });

  it('documents the hazard: a misaligned bond produces an implausible yield', () => {
    const bad: Bond = {
      isin: 'KE-BAD', issueCode: 'FXD1/BAD', name: 'bad', category: 'FXD',
      issueDate: '2018-05-10', maturityDate: '2026-12-10', tenorYears: 8, couponRate: 12.5,
      couponFrequencyPerYear: 2, ytmGross: 12.5, minInvestmentKES: 50_000, taxExempt: false,
    };
    expect(Math.abs(misalignment(bad.issueDate, bad.maturityDate))).toBeGreaterThan(ALIGNMENT_TOLERANCE_DAYS);
    const r = computeBondInvestment(bad, 50_000, 100, new Date('2026-07-24'));
    // A 12.5% bond at par cannot honestly yield more than a few points above its coupon.
    expect(r.grossYTM).toBeGreaterThan(20);
  });
});
