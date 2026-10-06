import { describe, it, expect } from 'vitest';
import ledger from '../../public/data/predictions.json';

/* The calibrated middle band (x1.75) once reached below the observed low —
 * SDB1/2011/030, recorded 6 Oct 2026, p25 13.10 under a low of 13.25. A
 * forecast whose "middle half" lies outside its own range is incoherent on
 * the page, so every ledger entry must read low <= p25 <= median <= p75 <= high. */
describe('every recorded forecast is ordered', () => {
  it.each(ledger.map((p) => [`${p.issueCode} ${p.auctionDate}`, p] as const))('%s', (_, p) => {
    expect(p.low).toBeLessThanOrEqual(p.p25);
    expect(p.p25).toBeLessThanOrEqual(p.median);
    expect(p.median).toBeLessThanOrEqual(p.p75);
    expect(p.p75).toBeLessThanOrEqual(p.high);
  });
});
