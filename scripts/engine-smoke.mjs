/**
 * Prove the BUILT engine works from plain Node — the artifact a licensee would
 * receive, not the sources the app imports. Every expected figure is from the
 * real ABC Capital broker sheet of 20-Jul-2026 (see tests/unit/sell.test.ts),
 * so this doubles as the demo run for a licensing pitch.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const E = await import('../dist/engine/lib/engine.js');

const IFB = {
  isin: 'KE8000002322', issueCode: 'IFB1/2022/18', name: '18-Year Infrastructure Bond',
  category: 'IFB', issueDate: '2022-06-13', maturityDate: '2040-05-21', tenorYears: 18,
  couponRate: 13.742, couponFrequencyPerYear: 2, ytmGross: 13.742,
  minInvestmentKES: 50_000, taxExempt: true,
};

// 1. The sell evaluator reproduces the broker sheet through the built artifact.
const a = E.analyseSale(IFB, {
  faceValueKES: 400_000, settlementDate: '2026-07-20', dirtyPrice: 107.8145,
  quotedYTM: 12.5, commissionKES: 1_500, leviesKES: 47.44,
  amortisation: [{ date: '2031-06-02', fraction: 0.5 }],
});
assert.ok(Math.abs(a.accruedInterestKES - 6_342.46) < 0.01, `accrued ${a.accruedInterestKES}`);
assert.ok(Math.abs(a.netProceedsKES - 429_710.56) < 0.01, `net ${a.netProceedsKES}`);
assert.ok(Math.abs(a.ourDirtyAtQuotedYTM - 107.8145) < 0.01, `dirty ${a.ourDirtyAtQuotedYTM}`);

// 2. Bid guidance runs against the real shipped archive.
const prints = JSON.parse(readFileSync('public/data/auction-results.json', 'utf8'));
const bonds = JSON.parse(readFileSync('public/data/bonds.json', 'utf8'));
const g = E.bidGuidance(prints, bonds, 10, { taxExempt: false });
assert.ok(!g.thin && g.count >= 10, `guidance thin (${g.count})`);
assert.ok(g.median > 8 && g.median < 20, `median ${g.median}`);
assert.equal(E.readBid(g.median, g).verdict, 'competitive');

// 3. Demand is grouped, never per record.
const demand = E.demandByAuction(prints);
assert.ok(demand.length >= 10 && demand[0].coverRatio > 0, 'demand empty');

// 4. Core pricing.
const r = E.computeBondInvestment(IFB, 100_000, 100, new Date('2026-07-20'));
assert.ok(r.netYTM > 0, 'pricing failed');

console.log('engine smoke: PASSED');
console.log(`  sell: accrued ${a.accruedInterestKES.toFixed(2)}, net ${a.netProceedsKES.toFixed(2)}`);
console.log(`  bid (10y taxable): n=${g.count}, median ${g.median.toFixed(2)}%`);
console.log(`  demand: last cover ${demand[0].coverRatio.toFixed(2)}x over ${demand.length} auctions`);
