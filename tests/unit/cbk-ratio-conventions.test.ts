import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Two ratios, one name, different answers.
 *
 * Mwangaza computes cover as bids received / amount OFFERED. CBK prints a line
 * in every results release headed "Bid-to-Cover Ratio", and it is bids received
 * / amount ACCEPTED. We were calling ours bid-to-cover too, so a reader holding
 * the source PDF beside our page saw the same term attached to two numbers and
 * had no way to reconcile them.
 *
 * The figures below are transcribed from three CBK releases — the 03/08/2026
 * Treasury bill auction (issues 2693/091, 2667/182, 2622/364), the 27/07/2026
 * reopened bond auction (FXD1/2019/020 and FXD1/2022/025) and the 15/07/2026
 * switch auction (FXD1/2012/020). Seven printed ratios in total.
 *
 * They are literals from the documents, not derived here, because a fixture
 * computed by the convention it is meant to establish establishes nothing.
 */
const CBK_PRINTED = [
  // 03/08/2026 Treasury bills
  { label: '91-day bill', offered: 8_000.0, bids: 14_403.22, accepted: 14_330.17, printed: 1.01 },
  { label: '182-day bill', offered: 10_000.0, bids: 8_171.64, accepted: 8_171.64, printed: 1.0 },
  { label: '364-day bill', offered: 10_000.0, bids: 4_792.57, accepted: 4_784.06, printed: 1.0 },
  { label: 'bills, all tenors', offered: 28_000.0, bids: 27_367.43, accepted: 27_285.87, printed: 1.0 },
  // 27/07/2026 reopened bonds
  { label: 'FXD1/2019/020', offered: 40_000.0, bids: 23_968.43, accepted: 12_249.13, printed: 1.96 },
  { label: 'FXD1/2022/025', offered: 40_000.0, bids: 61_960.51, accepted: 51_034.12, printed: 1.21 },
  // 15/07/2026 switch
  { label: 'FXD1/2012/020 switch', offered: 10_000.0, bids: 8_159.65, accepted: 7_954.71, printed: 1.03 },
];

describe("CBK's bid-to-cover is bids over ACCEPTED, not over offered", () => {
  it('matches bids/accepted on every printed ratio', () => {
    for (const r of CBK_PRINTED) {
      expect(r.bids / r.accepted, `${r.label}: bids/accepted should reproduce CBK's line`).toBeCloseTo(
        r.printed,
        2
      );
    }
  });

  it('does not match bids/offered — the ratio we compute', () => {
    // Stated as its own assertion rather than left implied, because the two
    // coincide whenever CBK accepts roughly what it offered, and a single
    // agreeing example would otherwise look like confirmation.
    const disagreements = CBK_PRINTED.filter(
      (r) => Math.abs(r.bids / r.offered - r.printed) > 0.01
    );
    expect(
      disagreements.length,
      'bids/offered reproduces CBK’s bid-to-cover line, so the two conventions are the same after all'
    ).toBe(CBK_PRINTED.length);
  });

  it('shows why the distinction matters: an undersubscribed auction reads as 1.00', () => {
    /* The 182-day bill on 3 August is the clean case. It drew Ksh 8.17bn
     * against Ksh 10bn offered — it did not attract the money the Treasury
     * asked for — and CBK's bid-to-cover line reads 1.00, because everything
     * bid was accepted. Their ratio cannot fall below 1.0 while CBK takes all
     * bids, so it carries almost no information about demand. Ours does. */
    const short = CBK_PRINTED.find((r) => r.label === '182-day bill')!;
    expect(short.bids / short.offered).toBeLessThan(1);
    expect(short.printed).toBe(1.0);
  });
});

describe('the glossary does not lend CBK’s term to our ratio', () => {
  it('names the entry after the ratio it describes', () => {
    const src = readFileSync(new URL('../../src/lib/glossary.ts', import.meta.url), 'utf8');
    const entry = src.slice(src.indexOf("slug: 'bid-to-cover'"));
    const body = entry.slice(0, entry.indexOf('slug:', 10));
    // Comments stripped: the note explaining the collision necessarily uses
    // both terms, and scanning it would flag the very text that documents the
    // fix. Scan what ships, not what explains it.
    const shipped = body.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(shipped).toMatch(/term: 'Performance rate'/);
    expect(
      shipped,
      'the entry still presents our bids/offered ratio under CBK’s name for bids/accepted'
    ).not.toMatch(/term: 'Bid-to-cover'/);
    expect(shipped, 'the entry no longer explains what the ratio divides').toMatch(/amount offered/);
  });
});
