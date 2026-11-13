import { describe, expect, it } from 'vitest';
import { buildICS } from '../../src/lib/ics';

const uids = (ics: string) => ics.split('\r\n').filter((line) => line.startsWith('UID:'));

describe('calendar event identity', () => {
  it('keeps distinct same-day payments separate even when their titles match', () => {
    const ics = buildICS([
      { date: '2027-03-15', title: 'Coupon payment', description: 'Holding A' },
      { date: '2027-03-15', title: 'Coupon payment', description: 'Holding B' },
    ]);
    expect(uids(ics)).toHaveLength(2);
    expect(new Set(uids(ics)).size).toBe(2);
  });

  it('assigns a stable UID when the same calendar is exported again', () => {
    const events = [{ date: '2027-03-15', title: 'Coupon payment', description: 'Holding A' }];
    expect(uids(buildICS(events))).toEqual(uids(buildICS(events)));
  });

  it('preserves distinct dates and escaped descriptions', () => {
    const ics = buildICS([
      { date: '2027-03-15', title: 'Coupon payment', description: 'IFB; holding A' },
      { date: '2027-03-16', title: 'Coupon payment', description: 'IFB; holding A' },
    ]);
    expect(new Set(uids(ics)).size).toBe(2);
    expect(ics).toContain('IFB\\; holding A');
  });
});
