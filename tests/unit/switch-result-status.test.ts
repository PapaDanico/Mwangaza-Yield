import { describe, expect, it } from 'vitest';
import auctions from '../../public/data/auctions.json';
import results from '../../public/data/auction-results.json';

describe('the published FXD4/2019/010 switch result closes its schedule entry', () => {
  const schedule = auctions.find((a) => a.id === 'auc-2026-08-switch');
  const result = results.find((r) => r.id === 'res-fxd4-2019-010-2026-08-26-switch');

  it('has the supplied CBK outcome before marking the calendar entry settled', () => {
    expect(result).toMatchObject({
      issueCode: 'FXD4/2019/010',
      transactionType: 'switch',
      weightedAverageRate: 11.2391,
    });
  });

  it('does not show an open bid after CBK has published its result', () => {
    expect(schedule).toMatchObject({
      issueCode: 'FXD1/2012/015 + bills → FXD4/2019/010',
      status: 'settled',
    });
  });
});
