import { describe, it, expect } from 'vitest';
import {
  DEVICE_ONLY,
  SERVER_DELIVERABLE,
  isServerDeliverable,
  publicRules,
  serverRules,
  validSubscription,
} from '../../src/lib/push-rules';
import { DEFAULT_RULES, evaluateAlerts, type AlertRule } from '../../src/lib/alerts';

const rule = (over: Partial<AlertRule> & Pick<AlertRule, 'kind'>): AlertRule => ({
  id: `r-${over.kind}`,
  enabled: true,
  leadDays: 5,
  createdAt: '2026-01-01',
  ...over,
});

describe('the public/private boundary', () => {
  it('accounts for every rule kind exactly once', () => {
    const all = [...SERVER_DELIVERABLE, ...DEVICE_ONLY].sort();
    const kinds = DEFAULT_RULES.map((d) => d.kind).sort();
    // If a new rule kind is added and not classified, this fails — which is the
    // point. An unclassified kind must not default to being transmittable.
    expect(all).toEqual(kinds);
  });

  it('keeps anything derived from holdings on the device', () => {
    expect(isServerDeliverable('coupon-due')).toBe(false);
    expect(isServerDeliverable('maturity')).toBe(false);
  });
});

describe('publicRules', () => {
  it('transmits nothing about coupons or maturities, even when enabled', () => {
    const out = publicRules([
      rule({ kind: 'coupon-due', leadDays: 7 }),
      rule({ kind: 'maturity', leadDays: 30 }),
    ]);
    expect(out).toEqual([]);
  });

  it('drops rules the reader switched off', () => {
    expect(publicRules([rule({ kind: 'auction-window', enabled: false })])).toEqual([]);
  });

  it('carries only the named fields — no id, no timestamps', () => {
    const [out] = publicRules([rule({ kind: 'auction-window', leadDays: 3 })]);
    expect(out).toEqual({ kind: 'auction-window', leadDays: 3 });
    expect(Object.keys(out).sort()).toEqual(['kind', 'leadDays']);
  });

  it('refuses a threshold rule that is missing its threshold', () => {
    expect(publicRules([rule({ kind: 'tbill-threshold', tenorDays: 364 })])).toEqual([]);
  });

  it('carries a complete threshold rule', () => {
    const [out] = publicRules([
      rule({ kind: 'tbill-threshold', tenorDays: 182, thresholdPct: 11.5 }),
    ]);
    expect(out).toEqual({ kind: 'tbill-threshold', leadDays: 0, tenorDays: 182, thresholdPct: 11.5 });
  });

  it('survives a round trip through the wire shape', () => {
    const device = [
      rule({ kind: 'auction-window', leadDays: 5 }),
      rule({ kind: 'coupon-due', leadDays: 7 }),
      rule({ kind: 'tbill-threshold', tenorDays: 364, thresholdPct: 12 }),
    ];
    const back = serverRules(publicRules(device));
    expect(back.map((r) => r.kind)).toEqual(['auction-window', 'tbill-threshold']);
    expect(back.every((r) => r.enabled)).toBe(true);
  });

  it('gives the server stable ids, so a second run the same day repeats nothing', () => {
    const a = serverRules(publicRules([rule({ kind: 'auction-window', leadDays: 5 })]));
    const b = serverRules(publicRules([rule({ kind: 'auction-window', leadDays: 5 })]));
    expect(a[0].id).toBe(b[0].id);
  });
});

describe('what the server can actually produce with no holdings', () => {
  const world = {
    auctions: [
      {
        id: 'auc-1',
        issueCode: 'FXD1/2026/15',
        bondName: 'Fifteen-Year',
        category: 'FXD' as const,
        offerOpenDate: '2026-08-03',
        offerCloseDate: '2026-08-19',
        auctionDate: '2026-08-19',
        settlementDate: '2026-08-24',
        amountOfferedKES: 1,
        couponRate: null,
        tenorYears: 15,
        prospectusUrl: 'https://example.invalid/p.pdf',
        status: 'upcoming' as const,
      },
    ],
    bonds: [],
    holdings: [],
    tbills: [],
  };

  it('raises the market events and nothing else', () => {
    const rules = serverRules(publicRules(DEFAULT_RULES.map((d) => rule({ ...d, enabled: true }))));
    const events = evaluateAlerts(rules, world, new Date('2026-08-16T09:00:00Z'));
    expect(events.map((e) => e.kind)).toEqual(['auction-window']);
  });

  it('cannot invent a coupon without holdings, even if a rule sneaks through', () => {
    const smuggled = [rule({ kind: 'coupon-due', leadDays: 365 })];
    expect(evaluateAlerts(smuggled, world, new Date('2026-08-16T09:00:00Z'))).toEqual([]);
  });
});

describe('validSubscription', () => {
  const good = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
    keys: { p256dh: 'BPk...', auth: 'xyz' },
    rules: [{ kind: 'auction-window', leadDays: 5 }],
  };

  it('accepts a well-formed subscription', () => {
    expect(validSubscription(good)).toBe(true);
  });

  it.each([
    ['no body', null],
    ['a string', 'hello'],
    ['a non-https endpoint', { ...good, endpoint: 'http://evil.invalid/x' }],
    ['a missing endpoint', { ...good, endpoint: undefined }],
    ['missing keys', { ...good, keys: undefined }],
    ['a half-present key pair', { ...good, keys: { p256dh: 'x' } }],
    ['rules that are not an array', { ...good, rules: 'all' }],
    ['a device-only rule kind', { ...good, rules: [{ kind: 'coupon-due', leadDays: 7 }] }],
    ['an unknown rule kind', { ...good, rules: [{ kind: 'everything', leadDays: 7 }] }],
    ['a negative lead time', { ...good, rules: [{ kind: 'auction-window', leadDays: -1 }] }],
    ['an absurd lead time', { ...good, rules: [{ kind: 'auction-window', leadDays: 4000 }] }],
    [
      'a threshold rule with an invalid tenor',
      { ...good, rules: [{ kind: 'tbill-threshold', leadDays: 0, tenorDays: 30, thresholdPct: 9 }] },
    ],
    [
      'a threshold rule with no threshold',
      { ...good, rules: [{ kind: 'tbill-threshold', leadDays: 0, tenorDays: 364 }] },
    ],
  ])('rejects %s', (_label, body) => {
    expect(validSubscription(body)).toBe(false);
  });

  it('rejects an endpoint long enough to be a storage attack', () => {
    expect(validSubscription({ ...good, endpoint: `https://x.invalid/${'a'.repeat(1100)}` })).toBe(
      false
    );
  });

  it('rejects an unreasonable number of rules', () => {
    const many = Array.from({ length: 9 }, () => ({ kind: 'auction-window', leadDays: 5 }));
    expect(validSubscription({ ...good, rules: many })).toBe(false);
  });
});
