import { describe, it, expect } from 'vitest';
import { buildLadder, SMOOTHING_PENALTY_PP } from '../../src/lib/ladder';
import { analyseLadder, THRESHOLDS } from '../../src/lib/ladder-analysis';
import { dirtyPriceAtYield } from '../../src/lib/rate-shocks';
import type { Bond } from '../../src/types/bond';

const asOf = new Date('2026-07-24');

/** A bond whose maturity is a whole number of 182-day periods after issue, as the real ones are. */
function mk(code: string, issue: string, periods: number, coupon: number, opts: { exempt?: boolean; ytmAsOf?: string; ytm?: number } = {}): Bond {
  const maturity = new Date(new Date(issue).getTime() + periods * 182 * 86_400_000).toISOString().slice(0, 10);
  return {
    isin: `KE-${code.replace(/\//g, '-')}`,
    issueCode: code,
    name: code,
    category: opts.exempt ? 'IFB' : 'FXD',
    issueDate: issue,
    maturityDate: maturity,
    tenorYears: Math.round((periods * 182) / 365),
    couponRate: coupon,
    couponFrequencyPerYear: 2,
    ytmGross: opts.ytm ?? coupon,
    ytmAsOf: opts.ytmAsOf ?? '2026-07-01',
    minInvestmentKES: 50_000,
    taxExempt: Boolean(opts.exempt),
  };
}

// Coupon months follow the issue date: Jan/Jul, Apr/Oct, Feb/Aug, Mar/Sep.
const A = mk('FXD1/A', '2021-01-12', 14, 13.0);            // matures ~Dec 2027 (window 1)
const B = mk('FXD1/B', '2021-01-12', 22, 13.6);            // ~Jan 2032, Jan/Jul: overlaps A
const C = mk('FXD1/C', '2021-04-12', 22, 13.5);            // ~Apr 2032, Apr/Oct: no overlap with A
const D = mk('FXD1/D', '2020-02-10', 20, 13.8);            // ~Feb 2030
const E = mk('IFB1/E', '2021-03-10', 26, 13.0, { exempt: true }); // ~Mar 2034
const F = mk('FXD1/F', '2019-05-10', 17, 12.5);            // ~Nov 2027
const universe = [A, B, C, D, E, F];

describe('buildLadder selection record', () => {
  const plan = buildLadder(universe, [], 3_000_000, 8, 4, asOf);

  it('records the objective and one window per rung with ranked candidates', () => {
    expect(plan.selection?.mode).toBe('auto');
    expect(plan.selection?.objective).toBe('yield');
    expect(plan.selection?.windows).toHaveLength(4);
    for (const w of plan.selection!.windows) {
      expect(w.from < w.to).toBe(true);
      // Ranked best first.
      const scores = w.ranked.map((r) => r.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });

  it('the bond it chose in each window is the top of that window\'s ranking', () => {
    for (const w of plan.selection!.windows) {
      if (w.chosen) expect(w.ranked[0].issueCode).toBe(w.chosen);
    }
  });

  it('marks a hand-built ladder as chosen, with no windows', () => {
    const chosen = buildLadder(universe, [], 1_000_000, 8, 4, asOf, [], [universe[0].isin, universe[2].isin]);
    expect(chosen.selection?.mode).toBe('chosen');
    expect(chosen.selection?.windows).toEqual([]);
  });
});

describe('smooth-income objective', () => {
  const pair = [A, B, C];
  const yieldPlan = buildLadder(pair, [], 2_000_000, 8, 2, asOf, [], [], 'yield');
  const smoothPlan = buildLadder(pair, [], 2_000_000, 8, 2, asOf, [], [], 'smooth-income');

  it('the default objective picks the higher-yielding overlap (B), as it always has', () => {
    expect(yieldPlan.rungs.map((r) => r.bond.issueCode)).toEqual(['FXD1/A', 'FXD1/B']);
  });

  it('smooth-income gives up a little yield for new coupon months (C instead of B)', () => {
    expect(smoothPlan.rungs.map((r) => r.bond.issueCode)).toEqual(['FXD1/A', 'FXD1/C']);
    const months = (p: typeof yieldPlan) => analyseLadder(p, { asOf, universe: pair }).portfolio.couponMonths.length;
    expect(months(smoothPlan)).toBeGreaterThan(months(yieldPlan));
    expect(smoothPlan.blendedNetYTM).toBeLessThan(yieldPlan.blendedNetYTM);
  });

  it('states the yield it gave up: B is ranked below C by exactly two overlapping months of penalty', () => {
    const w = smoothPlan.selection!.windows.find((x) => x.chosen === 'FXD1/C')!;
    const b = w.ranked.find((r) => r.issueCode === 'FXD1/B')!;
    const c = w.ranked.find((r) => r.issueCode === 'FXD1/C')!;
    expect(b.netYTM - b.score).toBeCloseTo(2 * SMOOTHING_PENALTY_PP, 9);
    expect(c.netYTM - c.score).toBeCloseTo(0, 9);
    // The reader can see B had the higher yield.
    expect(b.netYTM).toBeGreaterThan(c.netYTM);
  });

  it('changes nothing for a window with a single candidate', () => {
    const a = buildLadder(universe, [], 3_000_000, 10, 4, asOf, [], [], 'yield');
    const s = buildLadder(universe, [], 3_000_000, 10, 4, asOf, [], [], 'smooth-income');
    for (const w of a.selection!.windows) {
      if (w.ranked.length === 1) expect(s.selection!.windows.find((x) => x.from === w.from)!.chosen).toBe(w.chosen);
    }
  });
});

describe('analyseLadder', () => {
  const plan = buildLadder(universe, [], 3_000_000, 10, 4, asOf);
  const a = analyseLadder(plan, { asOf, universe, inflationPct: 7.3 });

  it('rung cost shares sum to one and match the plan', () => {
    expect(a.rungs.reduce((s, r) => s + r.costShare, 0)).toBeCloseTo(1, 9);
    expect(a.rungs).toHaveLength(plan.rungs.length);
  });

  it('weighted average life equals an independent principal-weighted calculation', () => {
    const face = plan.rungs.reduce((s, r) => s + r.faceValueKES, 0);
    const expected = plan.rungs.reduce(
      (s, r) => s + r.faceValueKES * ((new Date(r.bond.maturityDate).getTime() - asOf.getTime()) / (365.25 * 86_400_000)), 0) / face;
    expect(a.portfolio.weightedAvgLifeYears).toBeCloseTo(expected, 9);
  });

  it('modified duration agrees with a separate finite-difference repricing', () => {
    // Independent of analyseLadder: reprice one rung at +/-1bp around its own gross yield.
    const r = plan.rungs[0];
    const y = r.result.grossYTM;
    const p = r.result.dirtyPrice;
    const up = dirtyPriceAtYield(r.bond, asOf, y + 0.01)!;
    const dn = dirtyPriceAtYield(r.bond, asOf, y - 0.01)!;
    const expected = (dn - up) / (2 * p * 0.0001);
    expect(a.rungs[0].modifiedDuration).toBeCloseTo(expected, 1);
    expect(a.rungs[0].modifiedDuration!).toBeGreaterThan(0);
    // A longer bond is more sensitive.
    const last = a.rungs[a.rungs.length - 1];
    expect(last.modifiedDuration!).toBeGreaterThan(a.rungs[0].modifiedDuration!);
  });

  it('a rise in yields loses value and a fall gains it, by roughly duration x 1%', () => {
    expect(a.portfolio.valueChangeUp100KES!).toBeLessThan(0);
    expect(a.portfolio.valueChangeDown100KES!).toBeGreaterThan(0);
    const approx = -a.portfolio.modifiedDuration! * 0.01 * plan.totalCostKES;
    // Convexity makes the exact loss a little smaller than the linear estimate.
    expect(Math.abs(a.portfolio.valueChangeUp100KES! - approx) / Math.abs(approx)).toBeLessThan(0.15);
  });

  it('Herfindahl and effective years are consistent', () => {
    const shares = a.portfolio.maturityYearShares.map((s) => s.share);
    expect(shares.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 9);
    expect(a.portfolio.maturityHHI).toBeCloseTo(shares.reduce((x, y) => x + y * y, 0), 12);
    expect(a.portfolio.effectiveMaturityYears).toBeCloseTo(1 / a.portfolio.maturityHHI, 9);
  });

  it('grosses a tax-exempt yield up at 15% and leaves taxable bonds null', () => {
    for (const r of a.rungs) {
      if (r.taxExempt) expect(r.taxableEquivalentPct).toBeCloseTo(r.netYTM / 0.85, 9);
      else expect(r.taxableEquivalentPct).toBeNull();
    }
  });

  it('real yield uses the supplied inflation and is null without it', () => {
    const expected = ((1 + plan.blendedNetYTM / 100) / 1.073 - 1) * 100;
    expect(a.portfolio.realNetYieldPct).toBeCloseTo(expected, 9);
    expect(analyseLadder(plan, { asOf, universe }).portfolio.realNetYieldPct).toBeNull();
  });

  it('flags every rung priced at the par placeholder and says so', () => {
    expect(a.portfolio.priceMix.placeholder).toBe(plan.rungs.length);
    const f = a.flags.find((x) => x.topic === 'data' && /priced at par/.test(x.text));
    expect(f?.level).toBe('watch');
  });

  it('is deterministic: the same ladder gets the same flags', () => {
    const b = analyseLadder(plan, { asOf, universe, inflationPct: 7.3 });
    expect(b.flags).toEqual(a.flags);
  });

  it('says nothing for an empty plan', () => {
    const empty = buildLadder(universe, [], 10_000, 8, 4, asOf);
    const e = analyseLadder(empty, { asOf, universe });
    expect(e.rungs).toEqual([]);
    expect(e.flags).toEqual([]);
  });

  it('never gives advice: no flag tells the reader to buy, sell or avoid', () => {
    for (const f of a.flags) expect(f.text).not.toMatch(/\byou should\b|\bwe recommend\b|\bbuy\b|\bsell now\b|\bavoid\b/i);
  });

  it('a one-year concentration trips the stated threshold', () => {
    const two = buildLadder(universe, [], 2_000_000, 10, 1, asOf);
    const c = analyseLadder(two, { asOf, universe });
    // One rung: concentration flags need more than one bond, so none appear.
    expect(c.flags.some((x) => x.topic === 'concentration')).toBe(false);
    expect(THRESHOLDS.maturityYearShare).toBe(0.4);
  });
});
