import { describe, it, expect } from 'vitest';
import bondsData from '../../public/data/bonds.json';
import { buildLadder } from '../../src/lib/ladder';
import type { Bond } from '../../src/types/bond';

/**
 * The reader picking their own bonds.
 *
 * The automatic ladder optimises net yield inside each maturity window, which
 * is a defensible default and often not what somebody wants — a school fee
 * falls in a particular year, an IFB is worth holding for the exemption at a
 * lower headline, and a bond already owned should be modelled rather than
 * replaced. These tests pin the promise that an explicit selection is honoured
 * exactly, and costed by the same maths as a generated one.
 */

const bonds = bondsData as unknown as Bond[];
const ASOF = new Date('2026-07-26');
const live = bonds
  .filter((b) => new Date(b.maturityDate) > ASOF)
  .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));

describe('an explicit selection is used as given', () => {
  it('builds exactly the bonds asked for, in maturity order', () => {
    const want = [live[6], live[2], live[9]];
    const plan = buildLadder(
      bonds, [], 3_000_000, 10, 4, ASOF, [],
      want.map((b) => b.isin),
    );
    expect(plan.rungs).toHaveLength(3);
    expect(plan.rungs.map((r) => r.bond.isin)).toEqual(
      [...want].sort((a, b) => a.maturityDate.localeCompare(b.maturityDate)).map((b) => b.isin),
    );
  });

  it('ignores the rung-count slider, which is an instruction to the picker', () => {
    const want = live.slice(0, 5).map((b) => b.isin);
    // maxRungs = 2, but the reader named five bonds.
    const plan = buildLadder(bonds, [], 5_000_000, 10, 2, ASOF, [], want);
    expect(plan.rungs).toHaveLength(5);
  });

  /**
   * The horizon slider narrows the SEARCH. Once a reader has named a bond they
   * have said something more specific than the slider did, and dropping it
   * would be the tool overruling the user.
   */
  it('does not apply the horizon to a bond the reader named', () => {
    const distant = [...live].reverse()[0]; // longest-dated paper we hold
    const yearsOut =
      (new Date(distant.maturityDate).getTime() - ASOF.getTime()) / (365 * 86_400_000);
    expect(yearsOut).toBeGreaterThan(3); // it really is outside a 3-year horizon

    const plan = buildLadder(bonds, [], 1_000_000, 3, 4, ASOF, [], [distant.isin]);
    expect(plan.rungs.map((r) => r.bond.isin)).toEqual([distant.isin]);
  });

  it('still refuses matured paper — that is arithmetic, not preference', () => {
    const matured: Bond = { ...live[0], isin: 'DEAD', maturityDate: '2020-01-01' };
    const plan = buildLadder(
      [...bonds, matured], [], 1_000_000, 10, 4, ASOF, [],
      [matured.isin, live[0].isin],
    );
    expect(plan.rungs.map((r) => r.bond.isin)).toEqual([live[0].isin]);
  });

  it('collapses a bond named twice into one holding', () => {
    // Two rungs of the same bond is one holding; showing two would overstate
    // the diversification the ladder exists to provide.
    const plan = buildLadder(
      bonds, [], 2_000_000, 10, 4, ASOF, [],
      [live[3].isin, live[3].isin, live[5].isin],
    );
    expect(plan.rungs).toHaveLength(2);
  });

  it('ignores an unknown ISIN rather than throwing', () => {
    const plan = buildLadder(bonds, [], 1_000_000, 10, 4, ASOF, [], ['NOT-A-BOND', live[1].isin]);
    expect(plan.rungs.map((r) => r.bond.isin)).toEqual([live[1].isin]);
  });

  it('an empty selection falls back to the automatic pick', () => {
    const auto = buildLadder(bonds, [], 3_000_000, 10, 4, ASOF, []);
    const explicitlyEmpty = buildLadder(bonds, [], 3_000_000, 10, 4, ASOF, [], []);
    expect(explicitlyEmpty.rungs.map((r) => r.bond.isin)).toEqual(
      auto.rungs.map((r) => r.bond.isin),
    );
  });
});

describe('a hand-built ladder is costed exactly like a generated one', () => {
  it('reproduces the automatic plan when handed its own picks back', () => {
    // The strongest statement of "same maths": feed the auto ladder's own
    // choices in as a selection and every figure must match.
    const auto = buildLadder(bonds, [], 3_000_000, 10, 4, ASOF, []);
    const echoed = buildLadder(
      bonds, [], 3_000_000, 10, 4, ASOF, [],
      auto.rungs.map((r) => r.bond.isin),
    );
    expect(echoed.totalCostKES).toBeCloseTo(auto.totalCostKES, 6);
    expect(echoed.blendedNetYTM).toBeCloseTo(auto.blendedNetYTM, 10);
    expect(echoed.netAnnualIncomeKES).toBeCloseTo(auto.netAnnualIncomeKES, 6);
    expect(echoed.yearlyPayouts).toEqual(auto.yearlyPayouts);
    expect(echoed.priceCoverage).toEqual(auto.priceCoverage);
  });

  it('splits capital evenly in 50k steps across the chosen rungs', () => {
    const want = live.slice(0, 3).map((b) => b.isin);
    const plan = buildLadder(bonds, [], 3_000_000, 10, 4, ASOF, [], want);
    const faces = plan.rungs.map((r) => r.faceValueKES);
    expect(new Set(faces).size).toBe(1);
    expect(faces[0] % 50_000).toBe(0);
    expect(faces[0] * plan.rungs.length + plan.unallocatedKES).toBe(3_000_000);
  });

  it('drops a rung whose minimum the split cannot meet, like the auto path', () => {
    const steep: Bond = { ...live[0], isin: 'STEEP', minInvestmentKES: 5_000_000 };
    const plan = buildLadder(
      [...bonds, steep], [], 200_000, 10, 4, ASOF, [],
      [steep.isin, live[1].isin],
    );
    expect(plan.rungs.map((r) => r.bond.isin)).toEqual([live[1].isin]);
  });

  it('reports price provenance for hand-picked bonds too', () => {
    const plan = buildLadder(bonds, [], 2_000_000, 10, 4, ASOF, [], live.slice(0, 2).map((b) => b.isin));
    expect(plan.priceCoverage.total).toBe(2);
    for (const r of plan.rungs) expect(r.priceInfo.source).toBeTruthy();
  });

  it('yields stay in a plausible band for a tax-free-only ladder', () => {
    const ifbs = live.filter((b) => b.taxExempt).slice(0, 3);
    expect(ifbs.length).toBeGreaterThanOrEqual(2);
    const plan = buildLadder(bonds, [], 3_000_000, 10, 4, ASOF, [], ifbs.map((b) => b.isin));
    expect(plan.rungs.every((r) => r.bond.taxExempt)).toBe(true);
    expect(plan.blendedNetYTM).toBeGreaterThan(5);
    expect(plan.blendedNetYTM).toBeLessThan(30);
  });
});
