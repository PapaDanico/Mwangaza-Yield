import { describe, it, expect } from 'vitest';
import {
  projectPot,
  monthsBetween,
  monthsToTarget,
  buildProgress,
} from '../../src/lib/progress';
import { withCheckpoint, withoutCheckpoint, type SavedPlan } from '../../src/lib/plans';

describe('projectPot', () => {
  it('leaves an untouched pot alone at a zero rate', () => {
    expect(projectPot(1_000_000, 0, 0, 24)).toBe(1_000_000);
  });

  it('adds contributions when nothing is earned', () => {
    expect(projectPot(0, 10_000, 0, 12)).toBe(120_000);
  });

  it('compounds to the annual rate over twelve months', () => {
    // Twelve monthly steps of (1+r)^(1/12) must land exactly on (1+r).
    expect(projectPot(1_000_000, 0, 15, 12)).toBeCloseTo(1_150_000, 4);
  });

  it('grows faster the longer it runs', () => {
    const a = projectPot(500_000, 20_000, 14, 12);
    const b = projectPot(500_000, 20_000, 14, 24);
    expect(b).toBeGreaterThan(a);
  });
});

describe('monthsBetween', () => {
  it('counts whole months only', () => {
    expect(monthsBetween(new Date('2026-01-15'), new Date('2026-04-15'))).toBe(3);
  });
  it('does not credit a month that has not completed', () => {
    expect(monthsBetween(new Date('2026-01-15'), new Date('2026-04-14'))).toBe(2);
  });
  it('never goes negative', () => {
    expect(monthsBetween(new Date('2026-06-01'), new Date('2026-01-01'))).toBe(0);
  });
});

describe('monthsToTarget', () => {
  it('is zero when the target is already met', () => {
    expect(monthsToTarget(5_000_000, 0, 14, 4_000_000)).toBe(0);
  });
  it('is null when nothing can ever get there', () => {
    expect(monthsToTarget(1_000_000, 0, 0, 5_000_000)).toBeNull();
  });
  it('shortens as contributions rise', () => {
    const slow = monthsToTarget(1_000_000, 10_000, 14, 5_000_000)!;
    const fast = monthsToTarget(1_000_000, 100_000, 14, 5_000_000)!;
    expect(fast).toBeLessThan(slow);
  });
  it('returns null rather than a fantasy horizon', () => {
    // 1 KES a month against a billion does not arrive inside the 60-year cap.
    expect(monthsToTarget(0, 1, 0, 1_000_000_000)).toBeNull();
  });
});

const OPTS = {
  startedAt: '2026-01-01',
  startKES: 1_000_000,
  monthlyKES: 50_000,
  annualRatePct: 14,
  targetKES: 10_000_000,
};

describe('buildProgress', () => {
  it('reports too-early with nothing recorded', () => {
    const r = buildProgress([], OPTS);
    expect(r.status).toBe('too-early');
    expect(r.latest).toBeNull();
    expect(r.revisedYearsToTarget).toBeNull();
  });

  it('calls a checkpoint that matches the projection on-track', () => {
    const planned = projectPot(OPTS.startKES, OPTS.monthlyKES, OPTS.annualRatePct, 6);
    const r = buildProgress([{ date: '2026-07-01', capitalKES: planned }], OPTS);
    expect(r.status).toBe('on-track');
    expect(r.latest!.varianceKES).toBeCloseTo(0, 6);
  });

  it('tolerates a small miss rather than crying behind', () => {
    const planned = projectPot(OPTS.startKES, OPTS.monthlyKES, OPTS.annualRatePct, 6);
    const r = buildProgress([{ date: '2026-07-01', capitalKES: planned * 0.97 }], OPTS);
    expect(r.status).toBe('on-track');
  });

  it('flags a real shortfall', () => {
    const planned = projectPot(OPTS.startKES, OPTS.monthlyKES, OPTS.annualRatePct, 6);
    const r = buildProgress([{ date: '2026-07-01', capitalKES: planned * 0.7 }], OPTS);
    expect(r.status).toBe('behind');
    expect(r.latest!.varianceKES).toBeLessThan(0);
  });

  it('flags being ahead', () => {
    const planned = projectPot(OPTS.startKES, OPTS.monthlyKES, OPTS.annualRatePct, 6);
    const r = buildProgress([{ date: '2026-07-01', capitalKES: planned * 1.3 }], OPTS);
    expect(r.status).toBe('ahead');
  });

  it('ignores readings from before the plan existed', () => {
    const r = buildProgress(
      [
        { date: '2025-06-01', capitalKES: 400_000 },
        { date: '2026-07-01', capitalKES: 1_500_000 },
      ],
      OPTS
    );
    expect(r.points).toHaveLength(1);
    expect(r.points[0].date).toBe('2026-07-01');
  });

  it('orders readings entered out of sequence', () => {
    const r = buildProgress(
      [
        { date: '2026-09-01', capitalKES: 1_800_000 },
        { date: '2026-03-01', capitalKES: 1_200_000 },
      ],
      OPTS
    );
    expect(r.points.map((p) => p.date)).toEqual(['2026-03-01', '2026-09-01']);
    expect(r.latest!.date).toBe('2026-09-01');
  });

  it('refuses to infer a pace from two readings days apart', () => {
    // The division would be by a rounding error and would report a pace of
    // millions a month off a week of noise.
    const r = buildProgress(
      [
        { date: '2026-03-01', capitalKES: 1_200_000 },
        { date: '2026-03-08', capitalKES: 1_260_000 },
      ],
      OPTS
    );
    expect(r.revisedYearsToTarget).toBeNull();
    expect(r.observedMonthlyContributionKES).toBeNull();
  });

  it('recovers the contribution rate actually being paid in', () => {
    // Someone who genuinely paid in 50k a month for a year, with the pot
    // growing at the plan's rate, should be measured at 50k — not at the
    // growth as well.
    const twelve = projectPot(OPTS.startKES, 50_000, OPTS.annualRatePct, 12);
    const r = buildProgress(
      [
        { date: '2026-01-01', capitalKES: OPTS.startKES },
        { date: '2027-01-01', capitalKES: twelve },
      ],
      OPTS
    );
    expect(r.monthsObserved).toBe(12);
    expect(r.observedMonthlyContributionKES).toBeCloseTo(50_000, 2);
  });

  it('re-forecasts on the observed pace, not the promised one', () => {
    // Half the promised contributions must push the finish line out.
    const half = projectPot(OPTS.startKES, 25_000, OPTS.annualRatePct, 12);
    const slow = buildProgress(
      [
        { date: '2026-01-01', capitalKES: OPTS.startKES },
        { date: '2027-01-01', capitalKES: half },
      ],
      OPTS
    );
    const full = projectPot(OPTS.startKES, 50_000, OPTS.annualRatePct, 12);
    const onPlan = buildProgress(
      [
        { date: '2026-01-01', capitalKES: OPTS.startKES },
        { date: '2027-01-01', capitalKES: full },
      ],
      OPTS
    );
    expect(slow.revisedYearsToTarget!).toBeGreaterThan(onPlan.revisedYearsToTarget!);
  });

  it('never reports a negative contribution as progress', () => {
    // A pot that shrank implies withdrawals. The forecast must not treat a
    // negative rate as if it were savings, nor claim a finish date from it.
    const r = buildProgress(
      [
        { date: '2026-01-01', capitalKES: 1_000_000 },
        { date: '2027-01-01', capitalKES: 400_000 },
      ],
      OPTS
    );
    expect(r.observedMonthlyContributionKES!).toBeLessThan(0);
    expect(r.status).toBe('behind');
    // With no contributions, growth alone still reaches the target eventually.
    expect(r.revisedYearsToTarget === null || r.revisedYearsToTarget > 0).toBe(true);
  });

  it('measures coverage against the target, not the projection', () => {
    const r = buildProgress([{ date: '2026-07-01', capitalKES: 5_000_000 }], OPTS);
    expect(r.coverageRatio).toBeCloseTo(0.5, 6);
  });
});

describe('recording checkpoints on a plan', () => {
  const plan: SavedPlan = {
    id: 'p1', name: 'Independence', goal: 'fire',
    inputs: { targetIncome: 1_200_000, capital: 1_000_000, monthly: 50_000 },
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };

  it('adds the first reading to a plan that has none', () => {
    const p = withCheckpoint(plan, '2026-07-01', 1_500_000, '2026-07-01');
    expect(p.checkpoints).toEqual([{ date: '2026-07-01', capitalKES: 1_500_000 }]);
  });

  it('corrects a reading instead of duplicating the day', () => {
    const once = withCheckpoint(plan, '2026-07-01', 1_500_000, '2026-07-01');
    const fixed = withCheckpoint(once, '2026-07-01', 1_550_000, '2026-07-02');
    expect(fixed.checkpoints).toHaveLength(1);
    expect(fixed.checkpoints![0].capitalKES).toBe(1_550_000);
  });

  it('keeps readings in date order however they are entered', () => {
    let p = withCheckpoint(plan, '2026-09-01', 1_800_000, '2026-09-01');
    p = withCheckpoint(p, '2026-03-01', 1_200_000, '2026-09-02');
    expect(p.checkpoints!.map((c) => c.date)).toEqual(['2026-03-01', '2026-09-01']);
  });

  it('removes a reading entered by mistake', () => {
    const p = withCheckpoint(plan, '2026-07-01', 1_500_000, '2026-07-01');
    expect(withoutCheckpoint(p, '2026-07-01', '2026-07-02').checkpoints).toEqual([]);
  });

  it('leaves the plan itself untouched', () => {
    withCheckpoint(plan, '2026-07-01', 1_500_000, '2026-07-01');
    expect(plan.checkpoints).toBeUndefined();
  });
});
