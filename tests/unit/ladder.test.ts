import { describe, it, expect } from 'vitest';
import { buildLadder, ladderEmptyReason, LADDER_STEP_KES } from '../../src/lib/ladder';
import { buildICS } from '../../src/lib/ics';
import type { Bond } from '../../src/types/bond';

const asOf = new Date('2026-07-24');

function mkBond(code: string, maturity: string, coupon: number, taxExempt = false, min = 50_000): Bond {
  return {
    isin: `KE-${code.replace(/\//g, '-')}`,
    issueCode: code,
    name: code,
    category: taxExempt ? 'IFB' : 'FXD',
    issueDate: '2022-01-10',
    maturityDate: maturity,
    tenorYears: 10,
    couponRate: coupon,
    couponFrequencyPerYear: 2,
    ytmGross: coupon,
    minInvestmentKES: min,
    taxExempt,
  };
}

const universe = [
  mkBond('FXD1/2022/A', '2028-06-10', 13.0),
  mkBond('FXD1/2022/B', '2030-06-10', 13.5),
  mkBond('IFB1/2022/C', '2032-06-10', 12.9, true, 100_000),
  mkBond('FXD1/2022/D', '2032-11-10', 12.0), // same year as IFB, lower net → IFB should win 2032
  mkBond('FXD1/2022/E', '2045-06-10', 14.0), // beyond horizon
];

describe('buildLadder', () => {
  const plan = buildLadder(universe, [], 3_000_000, 7, 5, asOf);

  it('spreads across distinct maturity years within horizon', () => {
    expect(plan.rungs.length).toBe(3);
    const years = plan.rungs.map((r) => r.bond.maturityDate.slice(0, 4));
    expect(new Set(years).size).toBe(3);
    expect(years).not.toContain('2045');
  });

  it('picks the higher-net-yield bond in a contested year', () => {
    const y2032 = plan.rungs.find((r) => r.bond.maturityDate.startsWith('2032'));
    expect(y2032?.bond.issueCode).toBe('IFB1/2022/C'); // tax-free beats 12% taxable
  });

  it('allocates in 50k steps and computes blended stats', () => {
    for (const r of plan.rungs) expect(r.faceValueKES % 50_000).toBe(0);
    expect(plan.totalCostKES).toBeGreaterThan(0);
    expect(plan.blendedNetYTM).toBeGreaterThan(10);
    expect(plan.netAnnualIncomeKES).toBeGreaterThan(0);
  });

  it('yearly payouts include principal in maturity years', () => {
    const y2028 = plan.yearlyPayouts.find((p) => p.year === 2028);
    expect(y2028?.principalKES).toBe(plan.rungs[0].faceValueKES);
  });

  it('drops rungs that cannot meet bond minimums', () => {
    // 150k over candidates incl. a 100k-minimum IFB: per-rung 50k < 100k → IFB dropped.
    const small = buildLadder(universe, [], 150_000, 7, 5, asOf);
    expect(small.rungs.every((r) => r.faceValueKES >= r.bond.minInvestmentKES)).toBe(true);
  });

  it('spreads rungs across the horizon rather than clumping at the short end', () => {
    // Five bonds bunched in 2027-2029 plus one long 2044; over a 20y horizon with
    // 2 rungs the far bucket must be represented.
    const spread = [
      mkBond('FXD1/A', '2027-01-10', 13),
      mkBond('FXD1/B', '2028-01-10', 13.2),
      mkBond('FXD1/C', '2029-01-10', 13.4),
      mkBond('FXD1/D', '2044-01-10', 12.0),
    ];
    const plan2 = buildLadder(spread, [], 2_000_000, 20, 2, asOf);
    expect(plan2.rungs.map((r) => r.bond.issueCode)).toContain('FXD1/D');
  });

  it('empty when nothing matures within horizon', () => {
    const none = buildLadder([mkBond('FXD1/2022/Z', '2050-01-01', 14)], [], 1_000_000, 5, 5, asOf);
    expect(none.rungs.length).toBe(0);
    expect(none.unallocatedKES).toBe(1_000_000);
  });
});

describe('buildICS', () => {
  it('produces a valid all-day VEVENT with alarm', () => {
    const ics = buildICS([{ date: '2026-11-16', title: 'FXD1/2022/10 coupon', description: 'Net KES 60,705' }]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261116');
    expect(ics).toContain('SUMMARY:FXD1/2022/10 coupon');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('END:VCALENDAR');
  });
});

/**
 * An empty ladder has to say why.
 *
 * A ladder floors each rung to a Ksh 50,000 face value, so anything below
 * `rungs x 50,000` buys nothing — at the default four rungs that is Ksh
 * 200,000, while /ladder's amount field offers a minimum of Ksh 100,000.
 *
 * The Ladder Builder always explained this. The school-fees planner did not,
 * and its silence was the more damaging kind: it reported "Covered by plan:
 * Ksh 0", a status of "Gap", and every fee year carrying a full shortfall.
 * Every figure was correct and the conclusion they invited — that bonds cannot
 * fund school fees — was false. Nothing had been bought.
 */
describe('why a ladder came back empty', () => {
  it('says nothing when a ladder was actually built', () => {
    expect(ladderEmptyReason({ amountKES: 3_000_000, rungs: 4, horizonYears: 10, built: 4 })).toBeNull();
  });

  /* Reversing an earlier call of mine, on the evidence of what it rendered.
   *
   * This used to assert null, reasoning that zero capital is the reader not
   * having started rather than a failure to explain. That reasoning produced
   * "Nothing to allocate." on /ladder followed by nothing at all — a sentence
   * with its explanation missing, on the one screen where the reader has done
   * nothing wrong.
   *
   * The answer is not to stay silent but to stop treating it as an error:
   * zero gets guidance ("enter an amount, here is the minimum"), and the
   * shortfall wording stays for amounts that were actually attempted. */
  it('tells a reader who has typed nothing what to type', () => {
    const msg = ladderEmptyReason({ amountKES: 0, rungs: 4, horizonYears: 10, built: 0 });
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/enter the amount/i);
    // The buildable minimum, so the guidance is actionable rather than vague.
    expect(msg).toContain('200,000');
    // Not phrased as a mistake — nothing has been attempted yet.
    expect(msg).not.toMatch(/below the|too little|cannot/i);
  });

  it('names the shortfall, the per-rung figure and the amount that would work', () => {
    const why = ladderEmptyReason({ amountKES: 100_000, rungs: 4, horizonYears: 10, built: 0 })!;
    expect(why).toContain('100,000');
    expect(why).toContain('25,000');   // what each rung would get
    expect(why).toContain('50,000');   // the step it falls below
    expect(why).toContain('200,000');  // what would actually build
    expect(why).toMatch(/fewer rungs/);
  });

  it('scales the advice with the rung count', () => {
    /* Two rungs need 100,000; six need 300,000. The advice must track that
     * rather than quoting one fixed minimum.
     *
     * The first line of this originally read `.toBeNull ;` — a property
     * reference with no call, so it asserted nothing at all. It would also
     * have been wrong if called: at 150,000 across two rungs the money IS
     * sufficient, so the helper falls through to the horizon explanation
     * rather than returning null. A check that cannot fail, guarding a claim
     * that was false. */
    const two = ladderEmptyReason({ amountKES: 150_000, rungs: 2, horizonYears: 10, built: 0 })!;
    expect(two, 'two rungs at 150,000 is affordable — the money is not the problem').toMatch(
      /Extend the horizon/
    );

    const six = ladderEmptyReason({ amountKES: 150_000, rungs: 6, horizonYears: 10, built: 0 })!;
    expect(six).toContain('300,000');
    expect(six).toMatch(/fewer rungs/);
  });

  it('blames the horizon when the money is sufficient but no paper matures', () => {
    const why = ladderEmptyReason({ amountKES: 5_000_000, rungs: 4, horizonYears: 1, built: 0 })!;
    expect(why).toMatch(/matures inside the next 1 year\b/);
    expect(why).toMatch(/Extend the horizon/);
    expect(why).not.toMatch(/fewer rungs/);
  });

  it('agrees with the step the engine actually uses', () => {
    // If STEP ever changes, the sentence must change with it rather than
    // quoting a number the splitter no longer honours.
    expect(LADDER_STEP_KES).toBe(50_000);
    const why = ladderEmptyReason({ amountKES: 10_000, rungs: 1, horizonYears: 10, built: 0 })!;
    expect(why).toContain(LADDER_STEP_KES.toLocaleString('en-KE'));
  });
});

/**
 * "I found nothing" and "I looked at nothing" are different sentences.
 *
 * Every branch of ladderEmptyReason explained why no rung could be built from
 * the bonds we hold. None was true when we held none — a state this app
 * reaches routinely, because the store fetches on mount and AppInit swallows
 * the failure with .catch(() => {}). On a flaky connection the reader was told
 * "No listed bond matures inside the next 10 years, so there is nothing to
 * build a rung from. Extend the horizon."
 *
 * Thirty-eight listed bonds mature inside ten years. It is a confident,
 * specific, false claim about Kenyan government debt, delivered as a finding,
 * with the one instruction attached that could not possibly help — because the
 * horizon was never the problem.
 *
 * Found by loading the page rather than by reading the code: the ladder engine
 * builds four correct rungs from the same data, so nothing in the tests or the
 * types was ever going to surface it.
 */
describe('an empty catalogue is not a fact about the market', () => {
  const base = { amountKES: 3_000_000, rungs: 4, horizonYears: 10, built: 0 };

  it('does not blame the horizon when no bonds were loaded', () => {
    const msg = ladderEmptyReason({ ...base, catalogueSize: 0, dataLoaded: true })!;
    expect(msg).toBeTruthy();
    expect(msg, 'claims something about maturities when nothing was searched').not.toMatch(
      /matures|horizon/i
    );
    expect(msg, 'does not tell the reader the failure is ours').toMatch(/could not be loaded/i);
  });

  it('says it is still loading rather than reporting a result', () => {
    const msg = ladderEmptyReason({ ...base, catalogueSize: 0, dataLoaded: false })!;
    expect(msg).toMatch(/loading/i);
    expect(msg).not.toMatch(/matures|horizon/i);
  });

  it('still explains a genuinely empty result when the catalogue is populated', () => {
    // The fix must not swallow the real reasons. With bonds present and a
    // horizon nothing falls inside, the horizon explanation is correct.
    const msg = ladderEmptyReason({ ...base, catalogueSize: 58, dataLoaded: true })!;
    expect(msg).toMatch(/matures/i);
  });

  it('still puts the amount first, which is the commonest real cause', () => {
    const msg = ladderEmptyReason({ ...base, amountKES: 0, catalogueSize: 58, dataLoaded: true })!;
    expect(msg).toMatch(/Enter the amount/i);
  });

  it('returns null when a ladder actually built, whatever the catalogue says', () => {
    expect(ladderEmptyReason({ ...base, built: 4, catalogueSize: 0, dataLoaded: true })).toBeNull();
  });
});
