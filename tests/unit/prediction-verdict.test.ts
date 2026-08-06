import { describe, it, expect } from 'vitest';
import {
  wilsonInterval, independentEvents, wholeArchiveCount, scoringVerdict, tallyByEvent,
} from '../../src/lib/prediction-verdict';
import { summariseLedger, type Prediction } from '../../src/lib/predictions';

/**
 * These tests were written on 6 August 2026, with all five predictions still
 * unscored. Every outcome below is hypothetical by construction — which is the
 * only condition under which the copy for a 5/5 and the copy for a 0/5 can be
 * held to the same standard.
 */

const pred = (
  issueCode: string,
  auctionDate: string,
  opts: Partial<Prediction> = {}
): Prediction => ({
  issueCode,
  auctionDate,
  recordedOn: '2026-08-05',
  targetYears: 10,
  toleranceYears: 3,
  sampleSize: 12,
  low: 12, p25: 13, median: 14, p75: 15, high: 16,
  windowDays: null,
  ...opts,
} as Prediction);

/** The real shape: three IFBs on 12 Aug, two FXDs on 24 Aug. */
const five = (outcomes: boolean[]): Prediction[] => {
  const rows = [
    pred('IFB1/2019/016', '2026-08-12'),
    pred('IFB1/2021/018', '2026-08-12'),
    pred('IFB1/2021/021', '2026-08-12', { windowDays: undefined }),
    pred('FXD1/2012/015', '2026-08-24'),
    pred('FXD4/2019/010', '2026-08-24'),
  ];
  return rows.map((r, i) => ({
    ...r,
    scoredOn: '2026-08-25',
    actualRate: outcomes[i] ? 14 : 20,
    hitRange: outcomes[i],
    hitMiddleHalf: outcomes[i],
  }));
};

const verdictFor = (outcomes: boolean[]) => {
  const ledger = five(outcomes);
  return scoringVerdict(ledger, summariseLedger(ledger));
};

describe('wilsonInterval', () => {
  it('does NOT collapse to zero width at a clean sweep', () => {
    // The normal approximation gives [100, 100] here. That false precision is
    // the entire reason this function exists.
    const ci = wilsonInterval(5, 5)!;
    expect(ci.high).toBe(100);
    expect(ci.low).toBeLessThan(70);
    expect(ci.low).toBeGreaterThan(40);
  });

  it('does not collapse at a clean miss either', () => {
    const ci = wilsonInterval(0, 5)!;
    expect(ci.low).toBe(0);
    expect(ci.high).toBeGreaterThan(30);
  });

  it('is wider for two observations than for five', () => {
    expect(wilsonInterval(2, 2)!.low).toBeLessThan(wilsonInterval(5, 5)!.low);
  });

  it('narrows as the sample grows', () => {
    const small = wilsonInterval(50, 100)!;
    const large = wilsonInterval(500, 1000)!;
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it('refuses impossible inputs rather than returning a number', () => {
    expect(wilsonInterval(6, 5)).toBeNull();
    expect(wilsonInterval(1, 0)).toBeNull();
    expect(wilsonInterval(-1, 5)).toBeNull();
    expect(wilsonInterval(Number.NaN, 5)).toBeNull();
  });
});

describe('independentEvents', () => {
  it('counts auction days, not bonds', () => {
    expect(independentEvents(five([true, true, true, true, true]))).toBe(2);
  });

  it('is the guard against inflating a 5 into five independent tries', () => {
    const claims = five([true, true, true, true, true]);
    expect(independentEvents(claims)).toBeLessThan(claims.length);
  });
});

describe('wholeArchiveCount', () => {
  it('counts both null (whole archive) and absent (unknowable)', () => {
    // Neither is "anchored to a recent pool", which is the question being asked.
    expect(wholeArchiveCount(five([true, true, true, true, true]))).toBe(5);
  });

  it('does not count a real recent window', () => {
    const claims = five([true, true, true, true, true]).map((p) => ({ ...p, windowDays: 365 }));
    expect(wholeArchiveCount(claims)).toBe(0);
  });
});

describe('scoringVerdict — the same standard for every outcome', () => {
  it('claims nothing before anything is scored', () => {
    const v = scoringVerdict([], summariseLedger([]));
    expect(v.tone).toBe('none');
    expect(v.headline).toMatch(/none is claimed/);
    expect(v.caveats).toEqual([]);
  });

  it('CAVEATS THE CLEAN SWEEP — the outcome most likely to be over-read', () => {
    const v = verdictFor([true, true, true, true, true]);
    expect(v.tone).toBe('encouraging');
    expect(v.headline).toMatch(/Every one of the 5/);
    // The failure this guards: a ledger that qualifies its misses and not its
    // hits is marketing with a table in it.
    expect(v.caveats.length).toBeGreaterThanOrEqual(3);
    expect(v.caveats.join(' ')).toMatch(/not evidence the method is calibrated/);
  });

  it('never prints a bare 100%', () => {
    const v = verdictFor([true, true, true, true, true]);
    expect(v.headline).not.toMatch(/100%/);
    expect(v.caveats.join(' ')).toMatch(/consistent with a true hit rate/);
  });

  it('states the honest denominator on a sweep', () => {
    const v = verdictFor([true, true, true, true, true]);
    expect(v.caveats.join(' ')).toMatch(/came from 2 auctions, not 5/);
  });

  it('reports a total miss plainly, without excuse-making', () => {
    const v = verdictFor([false, false, false, false, false]);
    expect(v.tone).toBe('poor');
    expect(v.headline).toMatch(/None of the 5/);
    expect(v.caveats.join(' ')).toMatch(/nothing here has been re-fitted/);
  });

  it('names the whole-archive pool on a miss — recorded before, not argued after', () => {
    const v = verdictFor([false, false, false, false, false]);
    expect(v.caveats.join(' ')).toMatch(/whole comparable archive back to 2022/);
    expect(v.caveats.join(' ')).toMatch(/recorded before the auctions, not argued afterwards/);
  });

  it('names that same pool on a SWEEP too, not only on a miss', () => {
    // If it only appeared on failure it would read as an alibi.
    const v = verdictFor([true, true, true, true, true]);
    expect(v.caveats.join(' ')).toMatch(/whole comparable archive back to 2022/);
  });

  it('reports a mixed result as mixed', () => {
    const v = verdictFor([true, true, true, false, false]);
    expect(v.tone).toBe('mixed');
    expect(v.headline).toMatch(/3 of 5/);
    expect(v.headline).toMatch(/2 did not/);
  });

  it('calls a minority hit rate poor, not mixed', () => {
    const v = verdictFor([true, false, false, false, false]);
    expect(v.tone).toBe('poor');
    expect(v.headline).toMatch(/1 of 5/);
  });

  it('quotes an interval whose lower bound is genuinely low on a sweep', () => {
    const v = verdictFor([true, true, true, true, true]);
    const m = v.caveats.join(' ').match(/from (\d+(?:\.\d+)?)% to/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeLessThan(70);
  });

  it('gets singular and plural right for one claim', () => {
    const one = [five([true])[0]];
    const v = scoringVerdict(one, summariseLedger(one));
    expect(v.caveats.join(' ')).not.toMatch(/from 1 auctions/);
  });
});

describe('tallyByEvent — a split auction is neither a hit nor a miss', () => {
  it('counts a unanimous auction as a hit', () => {
    const t = tallyByEvent(five([true, true, true, true, true]));
    expect(t).toEqual({ hit: 2, missed: 0, split: 0, total: 2 });
  });

  it('counts a unanimous failure as a miss', () => {
    const t = tallyByEvent(five([false, false, false, false, false]));
    expect(t).toEqual({ hit: 0, missed: 2, split: 0, total: 2 });
  });

  it('counts a disagreeing auction as SPLIT, not as a win', () => {
    // Two of the 12 August IFBs hit, one missed. The first version of this
    // collapsed to Math.min(events, hits) and reported "2 of 2 auctions hit" —
    // flattering by construction, and a statistic about nothing.
    const t = tallyByEvent(five([true, true, false, true, true]));
    expect(t.split).toBe(1);
    expect(t.hit).toBe(1);
    expect(t.hit + t.missed).toBeLessThan(t.total);
  });
});

describe('the per-auction rate is only quoted when it means something', () => {
  it('is suppressed, with a reason, when any auction is split', () => {
    const v = verdictFor([true, true, false, true, true]);
    const all = v.caveats.join(' ');
    expect(all).toMatch(/was split/);
    expect(all).toMatch(/no per-auction rate is quoted/);
    expect(all).not.toMatch(/Counted by auction rather than by bond/);
  });

  it('is quoted when every auction is unanimous', () => {
    const v = verdictFor([true, true, true, true, true]);
    expect(v.caveats.join(' ')).toMatch(/Counted by auction rather than by bond — 2 of 2/);
  });

  it('never claims a bound "falls" when it rises', () => {
    // The bug this replaces: for 3 of 5 the by-bond lower bound is 23.1% and
    // the by-auction figure was 34.2%, and the sentence said "falls to".
    for (const outcomes of [
      [true, true, true, false, false],
      [true, false, false, false, false],
      [true, true, false, true, true],
    ]) {
      expect(verdictFor(outcomes).caveats.join(' ')).not.toMatch(/falls to/);
    }
  });
});
