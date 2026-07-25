import { describe, it, expect } from 'vitest';
import { LOG_LIMIT, dueFor, isDeadEndpoint, nextLog } from '../../src/lib/push-send';
import type { PublicRule } from '../../src/lib/push-rules';
import type { AlertEvent } from '../../src/lib/alerts';
import type { AuctionSchedule, TBill } from '../../src/types/bond';

const auction = (id: string, close: string): AuctionSchedule => ({
  id,
  issueCode: `FXD/${id}`,
  bondName: 'A bond',
  category: 'FXD',
  offerOpenDate: '2026-08-01',
  offerCloseDate: close,
  auctionDate: close,
  settlementDate: '2026-08-24',
  amountOfferedKES: 1,
  couponRate: null,
  tenorYears: 15,
  prospectusUrl: 'https://example.invalid/p.pdf',
  status: 'upcoming',
});

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

const world = { auctions: [auction('a1', '2026-08-19')], tbills: [tbill] };
const at = (d: string) => new Date(`${d}T04:00:00Z`);
const RULES: PublicRule[] = [{ kind: 'auction-window', leadDays: 5 }];

describe('dueFor', () => {
  it('produces the market event inside the window', () => {
    const due = dueFor(RULES, [], world, at('2026-08-16'));
    expect(due.map((e) => e.kind)).toEqual(['auction-window']);
  });

  it('sends nothing on the second morning — the cron runs daily, the news does not', () => {
    const first = dueFor(RULES, [], world, at('2026-08-16'));
    const second = dueFor(RULES, first.map((e) => e.id), world, at('2026-08-17'));
    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
  });

  it('caps a busy morning rather than firing a barrage', () => {
    const many = {
      auctions: Array.from({ length: 9 }, (_, i) => auction(`a${i}`, '2026-08-19')),
      tbills: [],
    };
    expect(dueFor(RULES, [], many, at('2026-08-16'))).toHaveLength(3);
  });

  it('lets the rest through on the following run, since the cap is not a drop', () => {
    const many = {
      auctions: Array.from({ length: 5 }, (_, i) => auction(`a${i}`, '2026-08-19')),
      tbills: [],
    };
    const day1 = dueFor(RULES, [], many, at('2026-08-16'));
    const day2 = dueFor(RULES, day1.map((e) => e.id), many, at('2026-08-17'));
    expect(day1).toHaveLength(3);
    expect(day2).toHaveLength(2);
    expect(new Set([...day1, ...day2].map((e) => e.id)).size).toBe(5);
  });

  it('survives a subscriber with no rules at all', () => {
    expect(dueFor([], [], world, at('2026-08-16'))).toEqual([]);
    // A record written before rules existed reads back as undefined, not [].
    expect(dueFor(undefined as unknown as PublicRule[], [], world, at('2026-08-16'))).toEqual([]);
  });

  it('never produces a personal event, because it is never given holdings', () => {
    const smuggled = [
      { kind: 'coupon-due', leadDays: 365 },
      { kind: 'maturity', leadDays: 365 },
    ] as unknown as PublicRule[];
    expect(dueFor(smuggled, [], world, at('2026-08-16'))).toEqual([]);
  });

  it('raises a T-Bill threshold event when the print clears the mark', () => {
    const rules: PublicRule[] = [
      { kind: 'tbill-threshold', leadDays: 0, tenorDays: 364, thresholdPct: 12 },
    ];
    const due = dueFor(rules, [], world, at('2026-07-17'));
    expect(due.map((e) => e.kind)).toEqual(['tbill-threshold']);
  });
});

describe('nextLog', () => {
  const ev = (id: string) => ({ id }) as AlertEvent;

  it('appends what was sent', () => {
    expect(nextLog(['a'], [ev('b')])).toEqual(['a', 'b']);
  });

  it('does not record an id twice', () => {
    expect(nextLog(['a'], [ev('a'), ev('b')])).toEqual(['a', 'b']);
  });

  it('keeps the newest entries when it overflows', () => {
    const old = Array.from({ length: LOG_LIMIT }, (_, i) => `old-${i}`);
    const out = nextLog(old, [ev('new')]);
    expect(out).toHaveLength(LOG_LIMIT);
    expect(out[out.length - 1]).toBe('new');
    expect(out).not.toContain('old-0');
  });

  it('cannot be made to forget a live event by repeating one id', () => {
    // Without de-duplication, resending the same id would consume a slot each
    // run and evict genuinely recent entries — which would then be re-sent.
    const old = Array.from({ length: LOG_LIMIT }, (_, i) => `old-${i}`);
    const out = nextLog(old, [ev('old-5'), ev('old-5'), ev('old-5')]);
    expect(out).toEqual(old);
  });
});

describe('isDeadEndpoint', () => {
  it('treats gone and not-found as dead', () => {
    expect(isDeadEndpoint(404)).toBe(true);
    expect(isDeadEndpoint(410)).toBe(true);
  });

  it('keeps the subscription through a transient failure', () => {
    // Deleting on a 429 or a 500 would silently unsubscribe people because a
    // push service had a bad afternoon.
    for (const s of [400, 401, 403, 429, 500, 502, 503, undefined]) {
      expect(isDeadEndpoint(s)).toBe(false);
    }
  });
});
