import { describe, expect, it } from 'vitest';
import printsData from '../../public/data/auction-results.json';
import bondsData from '../../public/data/bonds.json';
import predictionsData from '../../public/data/predictions.json';
import type { AuctionPrint, Bond } from '../../src/types/bond';
import { auctionKind, historyFor } from '../../src/lib/auction-history';
import { curveRows } from '../../src/lib/yield-curve';
import { demandByAuction, findComparables } from '../../src/lib/bid';
import { dispersionPoints } from '../../src/lib/bid-dispersion';
import { reinvestmentAvailability } from '../../src/lib/reinvestment';
import { yieldContext } from '../../src/lib/regime';
import { recentClearingByTerm } from '../../src/lib/market-pulse';
import { benchmarkQuote } from '../../src/lib/quote-benchmark';

const prints = printsData as unknown as AuctionPrint[];
const bonds = bondsData as unknown as Bond[];
const issuance = prints.filter((p) => auctionKind(p) === 'issuance');
const asOf = new Date('2026-08-26T12:00:00Z');

/**
 * The 26 August FXD4 switch has a valid accepted yield, but it is an exchange,
 * not a cash sale. It remains in the per-bond historical record with an
 * explicit switch label; every aggregate that describes market issuance must
 * be identical with or without it.
 */
describe('supplied FXD4 switch across analytical surfaces', () => {
  const switchPrint = prints.find((p) => p.id === 'res-fxd4-2019-010-2026-08-26-switch');

  it('keeps the switch as labelled historical evidence', () => {
    expect(switchPrint).toBeDefined();
    const history = historyFor(prints, 'FXD4/2019/010');
    /* Found by date, NOT taken as `.at(-1)`.
     *
     * FXD4/2019/010 was switched again on 9 September, so the August print is
     * no longer the newest and this assertion started failing on data that was
     * entirely correct. What it exists to prove is that a switch STAYS in the
     * per-bond record wearing its label — not that it is the last thing in it,
     * which is a fact about the calendar rather than about this behaviour. */
    expect(history.find((h) => h.date === '2026-08-26')).toMatchObject({
      date: '2026-08-26',
      rate: 11.2391,
      transactionType: 'switch',
    });
  });

  it('keeps the September switch as labelled historical evidence too', () => {
    /* The same bond, switched again — CBK results notice dated 9 September
     * 2026, supplied directly. A second switch on one bond is the case where
     * "exclude switches from issuance" has to keep working per record rather
     * than per bond. */
    const history = historyFor(prints, 'FXD4/2019/010');
    expect(history.find((h) => h.date === '2026-09-09')).toMatchObject({
      date: '2026-09-09',
      rate: 11.1398,
      transactionType: 'switch',
    });
    expect(prints.find((p) => p.id === 'res-fxd4-2019-010-2026-09-09-switch')).toBeDefined();
  });

  it('excludes the switch from cash-issuance demand, curve, peer, and trend calculations', () => {
    expect(curveRows(prints, bonds)).toEqual(curveRows(issuance, bonds));
    expect(demandByAuction(prints)).toEqual(demandByAuction(issuance));
    expect(dispersionPoints(prints)).toEqual(dispersionPoints(issuance));
    expect(reinvestmentAvailability(prints)).toEqual(reinvestmentAvailability(issuance));
    expect(recentClearingByTerm(prints, bonds, asOf)).toEqual(recentClearingByTerm(issuance, bonds, asOf));
    expect(yieldContext(prints, bonds, 3.23, '2026-08-26')).toEqual(
      yieldContext(issuance, bonds, 3.23, '2026-08-26')
    );
    expect(findComparables(prints, bonds, 3.23, 1.5, false)).toEqual(
      findComparables(issuance, bonds, 3.23, 1.5, false)
    );
    const bond = bonds.find((b) => b.issueCode === 'FXD4/2019/010')!;
    expect(benchmarkQuote(bond, 100, prints, bonds, asOf)).toEqual(
      benchmarkQuote(bond, 100, issuance, bonds, asOf)
    );
  });

  it('preserves the recorded forecast but marks it ineligible for a hit-rate claim', () => {
    const prediction = predictionsData.find(
      (p) => p.issueCode === 'FXD4/2019/010' && p.auctionDate === '2026-08-24'
    );
    expect(prediction).toMatchObject({
      excludedOn: '2026-08-24',
      exclusionReason: 'switch auction, not cash issuance',
    });
  });
});
