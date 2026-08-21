/**
 * The usage figures must not become a claim about people.
 *
 * The store behind them holds one counter per event per day and nothing else —
 * no identifier, no session. That is a deliberate privacy property, and its
 * cost is that these numbers cannot answer "how many readers". The failure
 * this file guards against is the easy one: a summary that reads like traffic
 * analytics, gets described as visitors, and quietly turns a privacy-preserving
 * counter into a headcount nobody measured.
 *
 * So the assertions below are mostly about what the module refuses to say.
 */
import { describe, it, expect } from 'vitest';
import {
  summarise,
  labelFor,
  kindOf,
  TRAFFIC_CAVEAT,
  type MetricsPayload,
} from '../../src/lib/metrics';

const payload = (days: Record<string, Record<string, number>>): MetricsPayload => ({
  ok: true,
  days,
});

describe('kindOf', () => {
  it('splits the whitelist by its two prefixes', () => {
    expect(kindOf('view:dashboard')).toBe('view');
    expect(kindOf('act:calculator-run')).toBe('act');
  });

  it('treats anything unrecognised as a view rather than an action', () => {
    // Actions are the flattering number. An unknown prefix must not inflate
    // it, so the conservative default is the cheap category.
    expect(kindOf('something-else')).toBe('view');
    expect(kindOf('')).toBe('view');
  });
});

describe('labelFor', () => {
  it('derives a readable label from the event name', () => {
    expect(labelFor('view:dashboard')).toBe('Dashboard');
    expect(labelFor('view:yield-curve')).toBe('Yield curve');
    expect(labelFor('act:calculator-run')).toBe('Calculator run');
  });

  it('degrades to something readable rather than blank for odd input', () => {
    // The whitelist lives in the Netlify function and is allowed to drift from
    // the app. A new event must render as SOMETHING, not as an empty cell.
    expect(labelFor('act:')).toBe('act:');
    expect(labelFor('newthing')).toBe('Newthing');
  });
});

describe('summarise', () => {
  it('returns an empty summary rather than throwing on nothing', () => {
    for (const input of [null, undefined, payload({})]) {
      const s = summarise(input);
      expect(s.totalEvents).toBe(0);
      expect(s.daily).toEqual([]);
      expect(s.firstDay).toBeNull();
      expect(s.actionsPerHundredViews).toBeNull();
    }
  });

  it('counts views and actions separately, because they mean different things', () => {
    const s = summarise(
      payload({
        '2026-08-01': { 'view:dashboard': 10, 'view:tbills': 5, 'act:calculator-run': 3 },
      })
    );
    expect(s.views).toBe(15);
    expect(s.actions).toBe(3);
    expect(s.totalEvents).toBe(18);
  });

  it('reports actions per hundred views, and never divides by zero', () => {
    const s = summarise(payload({ '2026-08-01': { 'view:dashboard': 200, 'act:bid-tested': 10 } }));
    expect(s.actionsPerHundredViews).toBeCloseTo(5, 10);

    // Actions with no views is possible if a beacon is lost. It must not
    // produce Infinity, which would render as a triumphant number.
    const noViews = summarise(payload({ '2026-08-01': { 'act:bid-tested': 4 } }));
    expect(noViews.actionsPerHundredViews).toBeNull();
  });

  it('draws a missing day as a gap, not as a measured zero', () => {
    // This is the 19 August case: collection stopped, and a series that filled
    // the hole with zero would show a confident flat line through an outage.
    const s = summarise(
      payload({
        '2026-08-01': { 'view:dashboard': 4 },
        '2026-08-04': { 'view:dashboard': 6 },
      })
    );
    expect(s.daily.map((d) => d.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
    ]);
    expect(s.daily.map((d) => d.noData)).toEqual([false, true, true, false]);
    expect(s.daysWithNoData).toBe(2);
    expect(s.daysCovered).toBe(4);
  });

  it('does not invent days outside the observed range', () => {
    const s = summarise(payload({ '2026-08-10': { 'view:dashboard': 1 } }));
    expect(s.firstDay).toBe('2026-08-10');
    expect(s.lastDay).toBe('2026-08-10');
    expect(s.daily).toHaveLength(1);
    expect(s.daysWithNoData).toBe(0);
  });

  it('ranks events and shares them against their own kind', () => {
    const s = summarise(
      payload({
        '2026-08-01': { 'view:dashboard': 75, 'view:tbills': 25, 'act:calculator-run': 8 },
      })
    );
    expect(s.byEvent[0].event).toBe('view:dashboard');
    expect(s.byEvent[0].sharePct).toBeCloseTo(75, 10);
    // The action's share is of actions, not of everything — otherwise a site
    // with many views would always report actions as a rounding error.
    expect(s.byEvent.find((e) => e.event === 'act:calculator-run')?.sharePct).toBeCloseTo(100, 10);
  });

  it('ignores malformed counts instead of propagating NaN', () => {
    const s = summarise(
      payload({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        '2026-08-01': { 'view:dashboard': 5, 'view:tbills': 'x' as any, 'act:bid-tested': -3 },
      })
    );
    expect(s.views).toBe(5);
    expect(s.actions).toBe(0);
    expect(Number.isFinite(s.totalEvents)).toBe(true);
  });

  it('ignores keys that are not dates', () => {
    const s = summarise(payload({ notadate: { 'view:dashboard': 9 } }));
    expect(s.totalEvents).toBe(0);
  });

  it('sums an event across days', () => {
    const s = summarise(
      payload({
        '2026-08-01': { 'view:dashboard': 2 },
        '2026-08-02': { 'view:dashboard': 3 },
      })
    );
    expect(s.byEvent.find((e) => e.event === 'view:dashboard')?.count).toBe(5);
  });
});

describe('the caveat that has to travel with the numbers', () => {
  it('says these are not people, in words a reader would understand', () => {
    // If this string is ever trimmed to something shorter and friendlier, the
    // figures start reading as visitor counts. The whole privacy argument for
    // the store's design rests on nobody making that leap.
    expect(TRAFFIC_CAVEAT.length).toBeGreaterThan(120);
    expect(TRAFFIC_CAVEAT.toLowerCase()).toContain('not people');
    expect(TRAFFIC_CAVEAT.toLowerCase()).toContain('floor');
  });
});
