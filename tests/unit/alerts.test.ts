import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RULES,
  daysBetween,
  evaluateAlerts,
  undelivered,
  type AlertRule,
  type AlertWorld,
} from '../../src/lib/alerts';
import type { AuctionSchedule, Bond, Holding, TBill } from '../../src/types/bond';

const rule = (over: Partial<AlertRule> & Pick<AlertRule, 'kind'>): AlertRule => ({
  id: `r-${over.kind}`,
  enabled: true,
  leadDays: 7,
  createdAt: '2026-01-01',
  ...over,
});

// FXD1/2024/10: a Monday issue, ten years of 182-day periods, 10% WHT.
const bond: Bond = {
  isin: 'KE0000001',
  issueCode: 'FXD1/2024/10',
  name: 'Ten-Year Fixed Coupon',
  category: 'FXD',
  issueDate: '2024-01-01',
  maturityDate: '2033-12-12',
  tenorYears: 10,
  couponRate: 16,
  couponFrequencyPerYear: 2,
  ytmGross: 16,
  minInvestmentKES: 50_000,
  taxExempt: false,
};

const holding: Holding = {
  id: 'h1',
  isin: 'KE0000001',
  issueCode: 'FXD1/2024/10',
  faceValueKES: 1_000_000,
  purchaseDate: '2024-01-01',
  purchaseCleanPrice: 100,
};

const auction: AuctionSchedule = {
  id: 'auc-1',
  issueCode: 'FXD1/2026/15',
  bondName: 'Fifteen-Year Fixed Coupon',
  category: 'FXD',
  offerOpenDate: '2026-08-03',
  offerCloseDate: '2026-08-19',
  auctionDate: '2026-08-19',
  settlementDate: '2026-08-24',
  amountOfferedKES: 30_000_000_000,
  couponRate: null,
  tenorYears: 15,
  prospectusUrl: 'https://example.invalid/p.pdf',
  status: 'upcoming',
};

const tbill: TBill = {
  id: 'tb-364',
  tenorDays: 364,
  discountRate: 13.5,
  auctionDate: '2026-07-16',
  nextAuctionDate: '2026-07-30',
  amountOfferedKES: 1,
  amountAcceptedKES: 1,
  minInvestmentKES: 100_000,
  source: 'CBK',
};

const world = (over: Partial<AlertWorld> = {}): AlertWorld => ({
  auctions: [auction],
  bonds: [bond],
  holdings: [holding],
  tbills: [tbill],
  ...over,
});

const at = (d: string) => new Date(`${d}T09:00:00Z`);

describe('daysBetween counts calendar days, not elapsed hours', () => {
  it('is 1 across a midnight, whatever the times of day', () => {
    expect(daysBetween(new Date('2026-08-17T23:30:00Z'), new Date('2026-08-18T00:10:00Z'))).toBe(1);
  });
  it('is 0 within one day', () => {
    expect(daysBetween(new Date('2026-08-17T00:10:00Z'), new Date('2026-08-17T23:30:00Z'))).toBe(0);
  });
});

describe('auction-window', () => {
  const r = rule({ kind: 'auction-window', leadDays: 5 });

  it('stays quiet while the close is beyond the lead time', () => {
    expect(evaluateAlerts([r], world(), at('2026-08-01'))).toEqual([]);
  });

  it('fires inside the window, and says how far away', () => {
    const [e] = evaluateAlerts([r], world(), at('2026-08-16'));
    expect(e.kind).toBe('auction-window');
    expect(e.daysAway).toBe(3);
    expect(e.title).toContain('FXD1/2026/15');
    expect(e.date).toBe('2026-08-19');
  });

  it('fires on the closing day itself and calls it today', () => {
    const [e] = evaluateAlerts([r], world(), at('2026-08-19'));
    expect(e.daysAway).toBe(0);
    expect(e.title).toContain('today');
  });

  it('never fires after the window has shut', () => {
    expect(evaluateAlerts([r], world(), at('2026-08-20'))).toEqual([]);
  });

  it('ignores auctions already settled — the bid is long gone', () => {
    const settled = { ...auction, status: 'settled' as const };
    expect(evaluateAlerts([r], world({ auctions: [settled] }), at('2026-08-16'))).toEqual([]);
  });
});

describe('coupon-due', () => {
  const r = rule({ kind: 'coupon-due', leadDays: 7 });

  it('dates coupons on the 182-day grid and quotes the net amount', () => {
    // First coupon: 2024-01-01 + 182 days = 2024-07-01.
    const [e] = evaluateAlerts([r], world(), at('2024-06-28'));
    expect(e.date).toBe('2024-07-01');
    expect(e.daysAway).toBe(3);
    // KES 1m at 16% half-yearly = 80,000 gross. A ten-year bond is taxed at
    // 10%, so 72,000 lands. `determineWHTRate` returns 0.1 rather than 10 —
    // reading it as a percentage would deduct KES 80 instead of KES 8,000.
    expect(e.body).toContain('80,000');
    expect(e.body).toContain('72,000');
    expect(e.body).toContain('10%');
  });

  it('taxes a bond under ten years at 15%, not 10%', () => {
    const short: Bond = { ...bond, tenorYears: 5, maturityDate: '2028-12-25' };
    const [e] = evaluateAlerts([r], world({ bonds: [short] }), at('2024-06-28'));
    expect(e.body).toContain('68,000');
    expect(e.body).toContain('15%');
  });

  it('calls an IFB coupon tax-free rather than quoting a net figure', () => {
    const ifb: Bond = { ...bond, taxExempt: true, category: 'IFB' };
    const [e] = evaluateAlerts([r], world({ bonds: [ifb] }), at('2024-06-28'));
    expect(e.body).toContain('tax-free');
    expect(e.body).not.toContain('withholding');
  });

  it('labels the coupon that lands on maturity as the final one', () => {
    const [e] = evaluateAlerts([r], world(), at('2033-12-10'));
    expect(e.date).toBe('2033-12-12');
    expect(e.title).toContain('Final coupon');
  });

  it('says nothing when the bond behind a holding is not in the dataset', () => {
    expect(evaluateAlerts([r], world({ bonds: [] }), at('2024-06-28'))).toEqual([]);
  });

  it('matches a holding to its bond by issue code when the ISIN differs', () => {
    const byCode = { ...holding, isin: 'UNKNOWN' };
    const [e] = evaluateAlerts([r], world({ holdings: [byCode] }), at('2024-06-28'));
    expect(e.date).toBe('2024-07-01');
  });
});

describe('maturity', () => {
  const r = rule({ kind: 'maturity', leadDays: 30 });

  it('warns while there is still time to plan the reinvestment', () => {
    const [e] = evaluateAlerts([r], world(), at('2033-11-20'));
    expect(e.kind).toBe('maturity');
    expect(e.daysAway).toBe(22);
    expect(e.body).toContain('1,000,000');
  });

  it('is silent once the principal has already been paid', () => {
    expect(evaluateAlerts([r], world(), at('2033-12-13'))).toEqual([]);
  });
});

describe('tbill-threshold', () => {
  const r = rule({ kind: 'tbill-threshold', tenorDays: 364, thresholdPct: 12 });

  it('fires when the latest auction clears at or above the mark', () => {
    const [e] = evaluateAlerts([r], world(), at('2026-07-17'));
    expect(e.title).toContain('13.500%');
    expect(e.body).toContain('12%');
  });

  it('stays quiet below the mark', () => {
    const low = { ...tbill, discountRate: 9 };
    expect(evaluateAlerts([r], world({ tbills: [low] }), at('2026-07-17'))).toEqual([]);
  });

  it('goes quiet once the print is stale — the bill has been allotted', () => {
    expect(evaluateAlerts([r], world(), at('2026-08-05'))).toEqual([]);
  });

  it('reads the latest print for the tenor, not the first in the file', () => {
    const older = { ...tbill, id: 'old', discountRate: 18, auctionDate: '2026-07-09' };
    // The newer print is below the mark, so nothing fires — the stale 18%
    // must not be what a threshold is judged against.
    const newer = { ...tbill, discountRate: 9 };
    expect(evaluateAlerts([r], world({ tbills: [older, newer] }), at('2026-07-17'))).toEqual([]);
  });

  it('ignores other tenors entirely', () => {
    const short = { ...tbill, tenorDays: 91 as const };
    expect(evaluateAlerts([r], world({ tbills: [short] }), at('2026-07-17'))).toEqual([]);
  });
});

describe('the rule set as a whole', () => {
  it('runs no rule that is switched off', () => {
    const off = DEFAULT_RULES.map((d) => rule({ ...d, enabled: false }));
    expect(evaluateAlerts(off, world(), at('2026-08-16'))).toEqual([]);
  });

  it('orders by soonest first regardless of the order the rules are in', () => {
    const rules = [
      rule({ kind: 'coupon-due', leadDays: 400 }),
      rule({ kind: 'auction-window', leadDays: 400 }),
    ];
    const events = evaluateAlerts(rules, world(), at('2026-07-01'));
    const away = events.map((e) => e.daysAway);
    expect(away).toEqual([...away].sort((a, b) => a - b));
  });

  it('gives an event the same id every time, so it is delivered once', () => {
    const r = [rule({ kind: 'auction-window', leadDays: 5 })];
    const morning = evaluateAlerts(r, world(), at('2026-08-16'));
    const evening = evaluateAlerts(r, world(), new Date('2026-08-16T21:00:00Z'));
    expect(morning[0].id).toBe(evening[0].id);
    expect(undelivered(evening, new Set([morning[0].id]))).toEqual([]);
  });

  it('re-raises a threshold event when the reader moves the bar', () => {
    const before = evaluateAlerts(
      [rule({ kind: 'tbill-threshold', tenorDays: 364, thresholdPct: 12 })],
      world(),
      at('2026-07-17')
    );
    const after = evaluateAlerts(
      [rule({ kind: 'tbill-threshold', tenorDays: 364, thresholdPct: 13 })],
      world(),
      at('2026-07-17')
    );
    expect(after[0].id).not.toBe(before[0].id);
    expect(undelivered(after, new Set([before[0].id]))).toHaveLength(1);
  });

  it('ships defaults that cover every kind exactly once', () => {
    const kinds = DEFAULT_RULES.map((d) => d.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toHaveLength(4);
  });
});
