import { describe, it, expect } from 'vitest';
import { outstanding } from '../../src/lib/outstanding';
import bonds from '../../public/data/bonds.json';

describe('outstanding', () => {
  it('drops a bond on and after its maturity date, keeps it before', () => {
    const b = [{ maturityDate: '2026-08-17' }];
    expect(outstanding(b, new Date('2026-08-16T12:00:00Z'))).toHaveLength(1);
    expect(outstanding(b, new Date('2026-08-17T12:00:00Z'))).toHaveLength(0);
  });
  it('hides FXD1/2016/010 (matured 17 Aug 2026) from readers', () => {
    const live = outstanding(bonds, new Date('2026-10-06T00:00:00Z')).map((x) => x.issueCode);
    expect(live).not.toContain('FXD1/2016/010');
    expect(bonds.map((x) => x.issueCode)).toContain('FXD1/2016/010'); // archive kept for backtests
  });
});
