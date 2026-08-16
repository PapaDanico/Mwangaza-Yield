/**
 * The record of what lending to the Kenyan government has actually paid.
 *
 * THREE GUARDS HERE MATTER MORE THAN THE REST
 * -------------------------------------------
 * 1. **Infrastructure bonds are not taxed.** IFBs are the one instrument this
 *    app argues is the best deal available to a Kenyan retail investor. Taxing
 *    them at 15% would understate their real return by roughly a fifth, on the
 *    exact surface meant to make the case for them.
 * 2. **The approximation only runs one way.** Net is `gross x (1 - w)`, which
 *    is exact at par and conservative below it. If a change ever made `netPct`
 *    exceed `grossPct`, every claim built on this would tilt flattering.
 * 3. **A misparsed rate must not reach a chart.** The archive is written by
 *    successive parser versions, and one of them attributed a coupon to the
 *    wrong leg of an auction. A seventeen-year chart with a 0% or a 100% spike
 *    in it is worse than no chart.
 */
import { describe, it, expect } from 'vitest';
import archive from '../../public/data/auction-results.json';
import cpiHistory from '../../public/data/cpi-history.json';
import {
  sovereignReadings,
  summariseSovereign,
  whtForCode,
  MIN_READINGS,
  RATE_MAX,
  type CpiPoint,
  type SovereignPrint,
} from '../../src/lib/sovereign-record';

/** Real prints from public/data/cpi-history.json. */
const CPI: CpiPoint[] = [
  { date: '2026-07-01', value: 6.49 },
  { date: '2022-06-01', value: 7.91 },
  { date: '2011-09-01', value: 17.32 },
];

function print(over: Partial<SovereignPrint> = {}): SovereignPrint {
  return {
    issueCode: 'FXD1/2022/005',
    auctionDate: '2022-06-15',
    weightedAverageRate: 12.0,
    ...over,
  };
}

describe('whtForCode', () => {
  it('exempts infrastructure bonds, including the fractional tenors', () => {
    expect(whtForCode('IFB1/2023/6.5')).toBe(0);
    expect(whtForCode('IFB1/2024/8.5')).toBe(0);
    expect(whtForCode('IFB1/2018/015')).toBe(0);
  });

  it('charges 10% from ten years and 15% below, on either spelling', () => {
    // CBK writes the tenor unpadded for humans and padded in its result files.
    expect(whtForCode('FXD1/2022/10')).toBe(0.1);
    expect(whtForCode('FXD1/2022/010')).toBe(0.1);
    expect(whtForCode('FXD1/2022/25')).toBe(0.1);
    expect(whtForCode('FXD1/2022/002')).toBe(0.15);
    expect(whtForCode('FXD1/2023/8.5')).toBe(0.15);
  });

  it('taxes at the higher rate when the code cannot be read', () => {
    // An unreadable code must not become a free pass to the exempt rate — that
    // would overstate the return on whatever the parser failed to identify.
    expect(whtForCode('NOT A CODE')).toBe(0.15);
  });
});

describe('sovereignReadings', () => {
  it('pairs an auction with the print in force THEN, not the newest one', () => {
    const [r] = sovereignReadings([print({ auctionDate: '2011-09-20', weightedAverageRate: 12 })], CPI);
    expect(r.inflationAsOf).toBe('2011-09-01');
    expect(r.inflationPct).toBe(17.32);
    // 12% taxed, against 17.32% inflation, is a real loss — and 2011 is the
    // year the headline rate looked generous and inflation took all of it.
    expect(r.realPct).toBeLessThan(0);
  });

  it('uses Fisher rather than subtraction', () => {
    const [r] = sovereignReadings([print()], CPI);
    // gross 12, WHT 15% -> net 10.2; against 7.91 CPI subtraction says 2.29.
    expect(r.netPct).toBeCloseTo(10.2, 2);
    expect(r.realPct).toBeLessThan(10.2 - 7.91);
    expect(r.realPct).toBeCloseTo(2.12, 1);
  });

  it('never reports a net above the gross, in either tax band', () => {
    // The whole approximation is only acceptable because its error has a
    // known sign. This is the assertion that keeps it having one.
    const readings = sovereignReadings(
      [
        print({ issueCode: 'FXD1/2022/005' }),
        print({ issueCode: 'FXD1/2022/020' }),
        print({ issueCode: 'IFB1/2022/006.5' }),
      ],
      CPI
    );
    expect(readings).toHaveLength(3);
    for (const r of readings) expect(r.netPct).toBeLessThanOrEqual(r.grossPct);
  });

  it('drops an undated print rather than guessing a year', () => {
    // 13 of the 390 archived rows have no auction date. Placing them anywhere
    // on a timeline would be invention.
    expect(sovereignReadings([print({ auctionDate: null })], CPI)).toEqual([]);
  });

  it('drops a print with no clearing rate', () => {
    expect(sovereignReadings([print({ weightedAverageRate: null })], CPI)).toEqual([]);
    expect(sovereignReadings([print({ weightedAverageRate: undefined })], CPI)).toEqual([]);
  });

  it('refuses a rate outside the plausible band', () => {
    // A shifted column reads a price as a rate. 98.317 is a real pricePer100
    // from the archive and would plot as a 98% clearing yield.
    expect(sovereignReadings([print({ weightedAverageRate: 98.317 })], CPI)).toEqual([]);
    expect(sovereignReadings([print({ weightedAverageRate: 0 })], CPI)).toEqual([]);
    expect(sovereignReadings([print({ weightedAverageRate: RATE_MAX + 0.01 })], CPI)).toEqual([]);
  });

  it('drops a reading it cannot honestly pair with a CPI print', () => {
    const far = sovereignReadings([print({ auctionDate: '2015-03-01' })], CPI);
    expect(far).toEqual([]);
  });

  it('never reaches forward to a print published after the auction', () => {
    const future = sovereignReadings(
      [print({ auctionDate: '2022-01-10' })],
      [{ date: '2026-07-01', value: 6.49 }]
    );
    expect(future).toEqual([]);
  });

  it('normalises the issue code so history joins the register', () => {
    const [r] = sovereignReadings([print({ issueCode: 'FXD1/2022/5' })], CPI);
    expect(r.issueCode).toBe('FXD1/2022/005');
  });
});

describe('the shipped archive', () => {
  /**
   * The panel renders nothing when there is no record. That is the right
   * behaviour and it is also silent — a refresh that dropped the clearing
   * rates, or a CPI file that lost its history, would make the whole card
   * vanish and no test would notice. This is the guard that would.
   */
  const readings = sovereignReadings(
    archive as unknown as SovereignPrint[],
    cpiHistory as unknown as CpiPoint[]
  );
  const rec = summariseSovereign(readings);

  it('produces a record the auctions page can actually show', () => {
    expect(rec).not.toBeNull();
    // 312 readings when written. Far below that means the pairing broke.
    expect(rec!.readings).toBeGreaterThan(250);
    expect(rec!.from! < '2012-01-01').toBe(true);
  });

  it('keeps every rendered figure inside the range it claims', () => {
    // The card prints worst, best and median. If the median ever sat outside
    // [worst, best] the arithmetic would be wrong in a way prose would hide.
    expect(rec!.medianRealPct).toBeGreaterThanOrEqual(rec!.worst!.realPct);
    expect(rec!.medianRealPct).toBeLessThanOrEqual(rec!.best!.realPct);
    expect(rec!.losingReadings).toBeLessThanOrEqual(rec!.readings);
  });

  it('exempts the infrastructure bonds in the real archive, not just fixtures', () => {
    const ifbs = readings.filter((r) => r.issueCode.startsWith('IFB'));
    expect(ifbs.length).toBeGreaterThan(10);
    for (const r of ifbs) {
      expect(r.whtRate).toBe(0);
      expect(r.netPct).toBe(r.grossPct);
    }
  });
});

describe('summariseSovereign', () => {
  /** A year of auctions: eleven that beat inflation, one from 2011 that did not. */
  const readings = sovereignReadings(
    [
      print({ auctionDate: '2011-09-20', weightedAverageRate: 12 }),
      ...Array.from({ length: 11 }, (_, i) =>
        print({ auctionDate: `2022-06-${String(10 + i).padStart(2, '0')}`, weightedAverageRate: 12 + i * 0.1 })
      ),
    ],
    CPI
  );

  it('says nothing rather than something thin below a year of auctions', () => {
    expect(readings.length).toBe(MIN_READINGS);
    expect(summariseSovereign(readings.slice(0, MIN_READINGS - 1))).toBeNull();
    expect(summariseSovereign([])).toBeNull();
    expect(summariseSovereign(readings)).not.toBeNull();
  });

  it('counts how often the saver actually lost to inflation', () => {
    const rec = summariseSovereign(readings)!;
    expect(rec.readings).toBe(12);
    expect(rec.losingReadings).toBe(1);
    expect(rec.losingShare).toBeCloseTo(1 / 12, 3);
  });

  it('names the worst and best readings, so the claim can be checked', () => {
    const rec = summariseSovereign(readings)!;
    expect(rec.worst?.date).toBe('2011-09-20');
    expect(rec.best?.realPct).toBeGreaterThan(0);
  });

  it('states the span it is describing', () => {
    const rec = summariseSovereign(readings)!;
    expect(rec.from).toBe('2011-09-20');
    expect(rec.to).toBe('2022-06-20');
  });

  it('names every year that held a loss, ascending and deduplicated', () => {
    // The surface says "all N of them fall in <years>". That sentence is a
    // factual claim about the data, and the first draft of it was written by
    // hand from the worst reading's year — it said "almost entirely in 2011"
    // when the shipped archive puts five in 2011, four in 2012 and two in
    // 2017. Derived, so it cannot drift.
    const rec = summariseSovereign(readings)!;
    expect(rec.losingYears).toEqual(['2011']);

    const twoYears = sovereignReadings(
      [
        print({ auctionDate: '2011-09-20', weightedAverageRate: 12 }),
        print({ auctionDate: '2011-09-25', weightedAverageRate: 12.5 }),
        ...Array.from({ length: 10 }, (_, i) =>
          print({ auctionDate: `2022-06-${String(10 + i).padStart(2, '0')}`, weightedAverageRate: 12 })
        ),
      ],
      [...CPI, { date: '2022-06-01', value: 99 }].slice(0, 3)
    );
    const rec2 = summariseSovereign(twoYears)!;
    expect(rec2.losingYears).toEqual(['2011']);
    expect(rec2.losingReadings).toBe(2);
  });

  it('reports the median, not the mean', () => {
    // 2011 is a genuine outlier — a real loss of about 12 points. An average
    // would drag the "typical" auction to a figure no saver experienced.
    //
    // The values are pinned rather than compared to each other. `median >
    // mean` looks like the stronger assertion and is the weaker one: swapping
    // the median for the mean makes it read `1.8 > 1.7999999999999998`, which
    // is true, and the mutation survives on a rounding artefact.
    const rec = summariseSovereign(readings)!;
    const mean = readings.reduce((a, r) => a + r.realPct, 0) / readings.length;
    expect(mean).toBeCloseTo(1.8, 2);
    expect(rec.medianRealPct).toBe(2.48);
  });
});
